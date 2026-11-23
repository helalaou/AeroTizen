use crate::{
    models::{AppError, AppResult, SigningProfile},
    state::AppState,
    worker,
};
use serde::Serialize;
use serde_json::{json, Value};
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
    if ["access_token", "userId"].iter().any(|key| {
        auth.get(key)
            .and_then(Value::as_str)
            .is_none_or(|value| value.trim().is_empty())
    }) {
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

pub async fn samsung_sign_in(state: &AppState, request_id: String) -> AppResult<Account> {
    let _guard = state
        .samsung
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    let cancelled = state.samsung.cancelled.subscribe();
    if *cancelled.borrow() == request_id {
        return Err(AppError::new(
            "sign_in_cancelled",
            "Samsung sign-in cancelled.",
        ));
    }
    let auth: Value = worker::request_with_cancellation(
        &state.worker_path,
        "samsung_sign_in",
        json!({}),
        Some((cancelled, request_id.clone())),
    )
    .await?;
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
    let result: SigningProfile = worker::request(
        &state.worker_path,
        "prepare_signing_profile",
        json!({
            "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256, "auth": auth,
        }),
    )
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
mod tests {
    use super::*;

    #[test]
    fn account_serialization_excludes_authentication_secrets() {
        let saved = session(json!({
            "access_token": "private-token", "userId": "private-user",
            "inputEmailID": "demo@example.com", "expires_in": "60",
        }))
        .unwrap();
        assert_eq!(
            serde_json::to_value(saved.account).unwrap(),
            json!({"email": "demo@example.com"})
        );
        assert!(saved.expires > Instant::now());
    }

    #[test]
    fn malformed_sign_in_is_rejected() {
        assert!(session(json!({"access_token": "", "userId": "user"})).is_err());
        assert!(session(json!({"access_token": "token"})).is_err());
    }

    #[test]
    fn expired_sign_in_is_unavailable_for_certificate_setup() {
        let saved =
            session(json!({"access_token": "token", "userId": "user", "expires_in": 0})).unwrap();
        assert!(saved.expires <= Instant::now());
    }
}
