use super::samsung_auth;
use crate::{
    models::{AppError, AppResult, SigningProfile},
    state::AppState,
};
use serde::Serialize;
use serde_json::Value;
use std::future::Future;
use std::time::{Duration, Instant};
use tokio::sync::{watch, Mutex};

const DEFAULT_SESSION_SECONDS: u64 = 3600;
const MAX_SESSION_SECONDS: u64 = 86400;
const MAX_ACCOUNT_EMAIL_CHARACTERS: usize = 256;

#[derive(Clone, Serialize)]
pub struct Account {
    email: Option<String>,
}

struct Session {
    request_id: String,
    auth: Value,
    account: Account,
    expires: Instant,
}

pub struct SamsungState {
    session: Mutex<Option<Session>>,
    operation: Mutex<()>,
    cancelled: watch::Sender<String>,
}

impl Default for SamsungState {
    fn default() -> Self {
        Self {
            session: Mutex::new(None),
            operation: Mutex::new(()),
            cancelled: watch::Sender::new(String::new()),
        }
    }
}

fn session(auth: Value) -> AppResult<Session> {
    if !samsung_auth::valid_auth(&auth) {
        return Err(AppError::new(
            "invalid_response",
            "Samsung did not return a valid sign-in.",
        ));
    }
    let seconds = auth
        .get("expires_in")
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str().and_then(|value| value.parse::<u64>().ok()))
        })
        .unwrap_or(DEFAULT_SESSION_SECONDS)
        .min(MAX_SESSION_SECONDS);
    let email = auth
        .get("inputEmailID")
        .and_then(Value::as_str)
        .map(|email| {
            email
                .chars()
                .filter(|character| !character.is_control())
                .take(MAX_ACCOUNT_EMAIL_CHARACTERS)
                .collect()
        });
    Ok(Session {
        request_id: String::new(),
        auth,
        account: Account { email },
        expires: Instant::now() + Duration::from_secs(seconds),
    })
}

pub async fn samsung_account(state: &AppState) -> AppResult<Option<Account>> {
    let mut saved = state.samsung.session.lock().await;
    if saved
        .as_ref()
        .is_some_and(|session| session.expires <= Instant::now())
    {
        *saved = None;
    }
    Ok(saved.as_ref().map(|session| session.account.clone()))
}

pub async fn samsung_sign_in<Open, Opened>(
    state: &AppState,
    request_id: String,
    open_browser: Open,
) -> AppResult<Account>
where
    Open: FnOnce(String) -> Opened + Send,
    Opened: Future<Output = bool> + Send,
{
    sign_in(state, request_id, samsung_auth::authenticate(open_browser)).await
}

async fn sign_in(
    state: &AppState,
    request_id: String,
    authentication: impl Future<Output = AppResult<Value>> + Send,
) -> AppResult<Account> {
    let _guard = state
        .samsung
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    let mut cancelled = state.samsung.cancelled.subscribe();
    if *cancelled.borrow() == request_id {
        return Err(AppError::new(
            "sign_in_cancelled",
            "Samsung sign-in cancelled.",
        ));
    }
    let auth = tokio::select! {
        biased;
        _ = cancelled.wait_for(|id| *id == request_id) => {
            return Err(AppError::new("sign_in_cancelled", "Samsung sign-in cancelled."));
        }
        result = authentication => result?,
    };
    let mut current = state.samsung.session.lock().await;
    if *state.samsung.cancelled.borrow() == request_id {
        return Err(AppError::new(
            "sign_in_cancelled",
            "Samsung sign-in cancelled.",
        ));
    }
    let mut saved = session(auth)?;
    saved.request_id = request_id;
    let account = saved.account.clone();
    *current = Some(saved);
    Ok(account)
}

pub async fn cancel_samsung_sign_in(state: &AppState, request_id: String) -> AppResult<()> {
    state.samsung.cancelled.send_replace(request_id.clone());
    let mut current = state.samsung.session.lock().await;
    if current
        .as_ref()
        .is_some_and(|session| session.request_id == request_id)
    {
        *current = None;
    }
    Ok(())
}

pub async fn samsung_sign_out(state: &AppState) -> AppResult<()> {
    let _guard = state
        .samsung
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    *state.samsung.session.lock().await = None;
    Ok(())
}

pub async fn prepare_signing_profile(state: &AppState, id: String) -> AppResult<SigningProfile> {
    let _tv_guard = state
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    let _account_guard = state
        .samsung
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    let saved = state.profiles.get(&id).await?;
    let auth = state
        .samsung
        .session
        .lock()
        .await
        .as_ref()
        .filter(|session| session.expires > Instant::now())
        .map(|session| session.auth.clone());
    let result = state
        .device_connection
        .prepare_certificates(&saved.tv.host, &saved.tv.identity_sha256, auth)
        .await?;
    if result.identity_sha256 != id || !result.launcher_signing_ready {
        return Err(AppError::new(
            "invalid_response",
            "The TV's signing certificates could not be verified.",
        ));
    }
    Ok(result)
}

#[cfg(test)]
mod tests;
