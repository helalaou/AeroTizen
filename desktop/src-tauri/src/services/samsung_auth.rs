use super::text::python_whitespace;
use crate::models::{AppError, AppResult};
use http_body_util::{BodyExt, Full, Limited};
use hyper::{
    body::Incoming, header, server::conn::http1, service::service_fn, Method, Request, Response,
    StatusCode,
};
use hyper_util::rt::TokioIo;
use reqwest::Url;
use serde_json::{Map, Value};
use std::{
    convert::Infallible,
    future::Future,
    net::{Ipv4Addr, SocketAddr},
    time::Duration,
};
use subtle::ConstantTimeEq;
use tokio::{net::TcpListener, sync::mpsc};

const SIGNIN_GATE: &str =
    "https://account.samsung.com/accounts/be1dce529476c1a6d407c4c7578c31bd/signInGate";
const CLIENT_ID: &str = "v285zxnl3h";
const CALLBACK_PORT: u16 = 4794;
const CALLBACK_PATH: &str = "/signin/callback";
const SIGN_IN_TIMEOUT: Duration = Duration::from_secs(300);
const CALLBACK_READ_TIMEOUT: Duration = Duration::from_secs(5);
const MAX_CALLBACK_BYTES: usize = 64 * 1024;
const MAX_HEADER_BYTES: usize = 16 * 1024;
const MAX_HEADERS: usize = 100;
const STATE_RANDOM_BYTES: usize = 32;
const AUTH_FIELDS: [&str; 4] = ["access_token", "userId", "inputEmailID", "expires_in"];
const REQUIRED_AUTH_FIELDS: [&str; 2] = ["access_token", "userId"];
const SUCCESS_HTML: &str =
    "<h2 style='font-family:sans-serif'>Signed in. You can close this tab.</h2>";
const FAILURE_HTML: &str = "Sign-in failed. Close this tab and try again.";

fn failed() -> AppError {
    AppError::new(
        "samsung_sign_in_failed",
        "Samsung sign-in did not complete. Close the browser tab and try again.",
    )
}

pub(super) fn valid_auth(auth: &Value) -> bool {
    REQUIRED_AUTH_FIELDS.iter().all(|key| {
        auth.get(key)
            .and_then(Value::as_str)
            .is_some_and(|value| !value.trim_matches(python_whitespace).is_empty())
    })
}

fn new_state() -> AppResult<String> {
    let mut bytes = [0; STATE_RANDOM_BYTES];
    getrandom::fill(&mut bytes).map_err(|_| failed())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn sign_in_url(port: u16, state: &str) -> AppResult<String> {
    let mut url = Url::parse(SIGNIN_GATE).map_err(|_| failed())?;
    url.query_pairs_mut()
        .append_pair("locale", "")
        .append_pair("clientId", CLIENT_ID)
        .append_pair(
            "redirect_uri",
            &format!("http://localhost:{port}{CALLBACK_PATH}"),
        )
        .append_pair("state", state)
        .append_pair("tokenType", "TOKEN");
    Ok(url.into())
}

fn callback_auth(body: &[u8], expected_state: &str) -> Option<Value> {
    std::str::from_utf8(body).ok()?;
    let mut state = None;
    let mut code = None;
    for (name, value) in form_urlencoded::parse(body) {
        let field = match name.as_ref() {
            "state" => &mut state,
            "code" => &mut code,
            _ => continue,
        };
        if field.replace(value).is_some() {
            return None;
        }
    }
    if !bool::from(state?.as_bytes().ct_eq(expected_state.as_bytes())) {
        return None;
    }
    let auth: Value = serde_json::from_str(&code?).ok()?;
    if !valid_auth(&auth) {
        return None;
    }
    let fields = auth
        .as_object()?
        .iter()
        .filter(|(key, _)| AUTH_FIELDS.contains(&key.as_str()))
        .map(|(key, value)| (key.clone(), value.clone()))
        .collect::<Map<_, _>>();
    Some(Value::Object(fields))
}

fn response(status: StatusCode) -> Response<Full<&'static [u8]>> {
    let body = if status == StatusCode::OK {
        SUCCESS_HTML
    } else {
        FAILURE_HTML
    };
    let mut response = Response::new(Full::new(body.as_bytes()));
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_TYPE,
        header::HeaderValue::from_static("text/html; charset=utf-8"),
    );
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        header::HeaderValue::from_static("no-store"),
    );
    response.headers_mut().insert(
        header::CONNECTION,
        header::HeaderValue::from_static("close"),
    );
    response
}

async fn callback(
    request: Request<Incoming>,
    state: &str,
    sender: &mpsc::Sender<Value>,
) -> Result<Response<Full<&'static [u8]>>, Infallible> {
    if request.uri().scheme().is_some()
        || request.uri().path_and_query().map(|value| value.as_str()) != Some(CALLBACK_PATH)
    {
        return Ok(response(StatusCode::NOT_FOUND));
    }
    if request.method() != Method::POST {
        return Ok(response(StatusCode::METHOD_NOT_ALLOWED));
    }
    let length = request
        .headers()
        .get(header::CONTENT_LENGTH)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.parse::<usize>().ok());
    if !length.is_some_and(|value| (1..=MAX_CALLBACK_BYTES).contains(&value))
        || request.headers().contains_key(header::TRANSFER_ENCODING)
        || request
            .headers()
            .get_all(header::CONTENT_LENGTH)
            .iter()
            .count()
            != 1
    {
        return Ok(response(StatusCode::BAD_REQUEST));
    }
    let Ok(body) = Limited::new(request.into_body(), MAX_CALLBACK_BYTES)
        .collect()
        .await
    else {
        return Ok(response(StatusCode::BAD_REQUEST));
    };
    let Some(auth) = callback_auth(&body.to_bytes(), state) else {
        return Ok(response(StatusCode::BAD_REQUEST));
    };
    let _ = sender.try_send(auth);
    Ok(response(StatusCode::OK))
}

async fn receive_auth(listener: TcpListener, state: String) -> AppResult<Value> {
    loop {
        let (stream, _) = listener.accept().await.map_err(|_| failed())?;
        let (sender, mut receiver) = mpsc::channel(1);
        let service = service_fn(|request| {
            let state = state.clone();
            let sender = sender.clone();
            async move { callback(request, &state, &sender).await }
        });
        let mut http = http1::Builder::new();
        http.keep_alive(false)
            .max_headers(MAX_HEADERS)
            .max_buf_size(MAX_HEADER_BYTES);
        // Drop stalled or malformed connections and keep waiting within the original deadline.
        let _ = tokio::time::timeout(
            CALLBACK_READ_TIMEOUT,
            http.serve_connection(TokioIo::new(stream), service),
        )
        .await;
        if let Ok(auth) = receiver.try_recv() {
            return Ok(auth);
        }
    }
}

async fn authenticate_at<Open, Opened>(
    address: SocketAddr,
    timeout: Duration,
    open_browser: Open,
) -> AppResult<Value>
where
    Open: FnOnce(String) -> Opened + Send,
    Opened: Future<Output = bool> + Send,
{
    let listener = TcpListener::bind(address).await.map_err(|_| failed())?;
    let state = new_state()?;
    let url = sign_in_url(listener.local_addr().map_err(|_| failed())?.port(), &state)?;
    tokio::time::timeout(timeout, async move {
        if !open_browser(url).await {
            return Err(failed());
        }
        receive_auth(listener, state).await
    })
    .await
    .map_err(|_| failed())?
}

pub(super) async fn authenticate<Open, Opened>(open_browser: Open) -> AppResult<Value>
where
    Open: FnOnce(String) -> Opened + Send,
    Opened: Future<Output = bool> + Send,
{
    authenticate_at(
        (Ipv4Addr::LOCALHOST, CALLBACK_PORT).into(),
        SIGN_IN_TIMEOUT,
        open_browser,
    )
    .await
}

#[cfg(test)]
mod tests;
