use super::*;
use serde_json::json;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    sync::oneshot,
    task::JoinHandle,
};

const TEST_TIMEOUT: Duration = Duration::from_secs(3);

fn credentials() -> Value {
    json!({"access_token": "test-private-token", "userId": "test-private-user", "inputEmailID": "demo@example.com", "expires_in": "60"})
}

fn form(state: &str, auth: &Value) -> String {
    form_urlencoded::Serializer::new(String::new())
        .append_pair("state", state)
        .append_pair("code", &auth.to_string())
        .finish()
}

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .no_proxy()
        .timeout(TEST_TIMEOUT)
        .build()
        .unwrap()
}

struct Flow {
    callback: Url,
    state: String,
    task: Option<JoinHandle<AppResult<Value>>>,
}

impl Drop for Flow {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

impl Flow {
    async fn new(timeout: Duration) -> Self {
        let (sender, receiver) = oneshot::channel();
        let task = tokio::spawn(authenticate_at(
            (Ipv4Addr::LOCALHOST, 0).into(),
            timeout,
            move |url| async move { sender.send(url).is_ok() },
        ));
        let url = tokio::time::timeout(TEST_TIMEOUT, receiver)
            .await
            .unwrap()
            .unwrap();
        let url = Url::parse(&url).unwrap();
        let parameters = url
            .query_pairs()
            .collect::<std::collections::HashMap<_, _>>();
        Self {
            callback: Url::parse(&parameters["redirect_uri"]).unwrap(),
            state: parameters["state"].to_string(),
            task: Some(task),
        }
    }

    fn address(&self) -> SocketAddr {
        (Ipv4Addr::LOCALHOST, self.callback.port().unwrap()).into()
    }

    async fn result(&mut self) -> AppResult<Value> {
        tokio::time::timeout(TEST_TIMEOUT, self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
    }

    async fn raw(&self, request: &[u8]) -> Vec<u8> {
        tokio::time::timeout(TEST_TIMEOUT, async {
            let mut socket = TcpStream::connect(self.address()).await.unwrap();
            socket.write_all(request).await.unwrap();
            let mut output = Vec::new();
            match socket.read_to_end(&mut output).await {
                Ok(_) => {}
                Err(error) if error.kind() == std::io::ErrorKind::ConnectionReset => {}
                Err(error) => panic!("callback read failed: {error}"),
            }
            output
        })
        .await
        .unwrap()
    }
}

#[test]
fn browser_url_keeps_the_cli_contract_and_each_attempt_has_fresh_random_state() {
    let state = new_state().unwrap();
    assert_eq!(state.len(), STATE_RANDOM_BYTES * 2);
    assert!(state.bytes().all(|value| value.is_ascii_hexdigit()));
    assert_ne!(state, new_state().unwrap());
    let url = Url::parse(&sign_in_url(CALLBACK_PORT, &state).unwrap()).unwrap();
    assert_eq!(url.scheme(), "https");
    assert_eq!(url.host_str(), Some("account.samsung.com"));
    assert_eq!(
        url.path(),
        "/accounts/be1dce529476c1a6d407c4c7578c31bd/signInGate"
    );
    let parameters = url
        .query_pairs()
        .collect::<std::collections::HashMap<_, _>>();
    assert_eq!(parameters["clientId"], "v285zxnl3h");
    assert_eq!(
        parameters["redirect_uri"],
        "http://localhost:4794/signin/callback"
    );
    assert_eq!(parameters["state"], state);
    assert_eq!(parameters["tokenType"], "TOKEN");
    assert_eq!(parameters["locale"], "");
}

#[test]
fn callback_requires_one_matching_state_and_valid_auth_and_keeps_only_session_fields() {
    let mut auth = credentials();
    auth["extra_private_field"] = json!("must-not-be-forwarded");
    assert_eq!(
        callback_auth(form("expected", &auth).as_bytes(), "expected"),
        Some(credentials())
    );
    for invalid in [
        Value::Null,
        json!([]),
        json!({"access_token": "a"}),
        json!({"access_token": "", "userId": "u"}),
        json!({"access_token": "\u{001c}", "userId": "u"}),
        json!({"access_token": "a", "userId": 1}),
    ] {
        assert!(callback_auth(form("expected", &invalid).as_bytes(), "expected").is_none());
    }
    let valid = form("expected", &credentials());
    for invalid in [
        form("wrong-state", &credentials()),
        format!("{valid}&state=expected"),
        format!("{valid}&code=%7B%7D"),
        "state=expected&code=invalid-json".into(),
        "code=%7B%7D".into(),
    ] {
        assert!(callback_auth(invalid.as_bytes(), "expected").is_none());
    }
    assert!(callback_auth(&[0xff], "expected").is_none());
}

#[tokio::test]
async fn callback_rejects_unrelated_requests_and_then_completes_with_the_matching_form() {
    let mut flow = Flow::new(TEST_TIMEOUT).await;
    let client = client();
    assert_eq!(
        client
            .get(flow.callback.clone())
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
    let mut wrong_path = flow.callback.clone();
    wrong_path.set_path("/other");
    assert_eq!(
        client
            .post(wrong_path)
            .body(form(&flow.state, &credentials()))
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::NOT_FOUND
    );
    let rejected = client
        .post(flow.callback.clone())
        .body(form("old-attempt", &credentials()))
        .send()
        .await
        .unwrap();
    assert_eq!(rejected.status(), StatusCode::BAD_REQUEST);
    assert!(!rejected
        .text()
        .await
        .unwrap()
        .contains("test-private-token"));
    let accepted = client
        .post(flow.callback.clone())
        .body(form(&flow.state, &credentials()))
        .send()
        .await
        .unwrap();
    assert_eq!(accepted.status(), StatusCode::OK);
    assert_eq!(accepted.headers()[header::CACHE_CONTROL], "no-store");
    let page = accepted.text().await.unwrap();
    assert!(page.contains("Signed in"));
    assert!(!page.contains("test-private-token"));
    assert_eq!(flow.result().await.unwrap(), credentials());
    assert!(TcpStream::connect(flow.address()).await.is_err());
}

#[tokio::test]
async fn body_and_header_limits_refuse_bad_requests_without_consuming_the_sign_in() {
    let mut flow = Flow::new(TEST_TIMEOUT).await;
    for headers in [
        format!("Content-Length: {}\r\n", MAX_CALLBACK_BYTES + 1),
        "Content-Length: 0\r\n".into(),
        "Transfer-Encoding: chunked\r\n".into(),
        String::new(),
    ] {
        let reply = flow
            .raw(
                format!("POST {CALLBACK_PATH} HTTP/1.1\r\nHost: localhost\r\n{headers}\r\n")
                    .as_bytes(),
            )
            .await;
        assert!(String::from_utf8_lossy(&reply).starts_with("HTTP/1.1 400"));
    }
    let oversized_header = format!("POST {CALLBACK_PATH} HTTP/1.1\r\nHost: localhost\r\nX-Fill: {}\r\nContent-Length: 1\r\n\r\nx", "x".repeat(MAX_HEADER_BYTES));
    let reply = flow.raw(oversized_header.as_bytes()).await;
    assert!(!String::from_utf8_lossy(&reply).starts_with("HTTP/1.1 200"));
    let mut at_limit = form(&flow.state, &credentials());
    at_limit.push_str("&padding=");
    at_limit.extend(std::iter::repeat_n(
        'x',
        MAX_CALLBACK_BYTES - at_limit.len(),
    ));
    assert_eq!(at_limit.len(), MAX_CALLBACK_BYTES);
    assert_eq!(
        client()
            .post(flow.callback.clone())
            .body(at_limit)
            .send()
            .await
            .unwrap()
            .status(),
        StatusCode::OK
    );
    assert_eq!(flow.result().await.unwrap(), credentials());
}

#[tokio::test]
async fn a_stalled_callback_cannot_extend_the_overall_deadline() {
    let mut flow = Flow::new(Duration::from_millis(150)).await;
    let mut socket = TcpStream::connect(flow.address()).await.unwrap();
    socket
        .write_all(b"POST /signin/callback HTTP/1.1\r\nHost:")
        .await
        .unwrap();
    let error = flow.result().await.unwrap_err();
    assert_eq!(error.code, "samsung_sign_in_failed");
    assert!(!error.message.contains("localhost"));
    assert!(TcpStream::connect(flow.address()).await.is_err());
}

#[tokio::test]
async fn browser_or_bind_failure_does_not_leave_a_listener() {
    let (sender, receiver) = oneshot::channel();
    let result = authenticate_at(
        (Ipv4Addr::LOCALHOST, 0).into(),
        TEST_TIMEOUT,
        move |url| async move {
            sender.send(url).unwrap();
            false
        },
    )
    .await;
    assert_eq!(result.unwrap_err().code, "samsung_sign_in_failed");
    let url = Url::parse(&receiver.await.unwrap()).unwrap();
    let redirect = Url::parse(
        &url.query_pairs()
            .find(|(key, _)| key == "redirect_uri")
            .unwrap()
            .1,
    )
    .unwrap();
    assert!(
        TcpStream::connect((Ipv4Addr::LOCALHOST, redirect.port().unwrap()))
            .await
            .is_err()
    );
    let occupied = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let result = authenticate_at(occupied.local_addr().unwrap(), TEST_TIMEOUT, |_| async {
        panic!("must bind before opening a browser")
    })
    .await;
    assert_eq!(result.unwrap_err().code, "samsung_sign_in_failed");
}

#[tokio::test]
async fn cancellation_drops_both_the_listener_and_an_active_callback_socket() {
    let mut flow = Flow::new(TEST_TIMEOUT).await;
    let mut socket = TcpStream::connect(flow.address()).await.unwrap();
    socket
        .write_all(b"POST /signin/callback HTTP/1.1\r\nHost:")
        .await
        .unwrap();
    let task = flow.task.take().unwrap();
    task.abort();
    assert!(task.await.unwrap_err().is_cancelled());
    assert!(TcpStream::connect(flow.address()).await.is_err());
    let mut reply = Vec::new();
    let _ = tokio::time::timeout(TEST_TIMEOUT, socket.read_to_end(&mut reply))
        .await
        .unwrap();
}
