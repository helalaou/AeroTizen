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

fn state(directory: &std::path::Path) -> AppState {
    AppState::for_test(directory)
}

fn auth() -> Value {
    json!({"access_token": "private-token", "userId": "private-user", "inputEmailID": "demo@example.com", "expires_in": 60})
}

#[tokio::test]
async fn sign_in_account_lookup_and_sign_out_need_no_worker() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let account = sign_in(&state, "current".into(), std::future::ready(Ok(auth())))
        .await
        .unwrap();
    assert_eq!(
        serde_json::to_value(account).unwrap(),
        json!({"email": "demo@example.com"})
    );
    assert_eq!(
        serde_json::to_value(samsung_account(&state).await.unwrap()).unwrap(),
        json!({"email": "demo@example.com"})
    );
    samsung_sign_out(&state).await.unwrap();
    assert!(samsung_account(&state).await.unwrap().is_none());
}

#[tokio::test]
async fn pre_cancelled_sign_in_never_starts_a_listener_browser_or_worker() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    cancel_samsung_sign_in(&state, "cancelled".into())
        .await
        .unwrap();
    let error = samsung_sign_in(&state, "cancelled".into(), |_| async {
        panic!("browser must not open")
    })
    .await
    .err()
    .unwrap();
    assert_eq!(error.code, "sign_in_cancelled");
    assert!(samsung_account(&state).await.unwrap().is_none());
}

#[tokio::test]
async fn cancellation_interrupts_an_active_authentication_without_saving_a_session() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let request = sign_in(&state, "active".into(), std::future::pending());
    tokio::pin!(request);
    tokio::select! {
        biased;
        _ = &mut request => panic!("authentication must still be pending"),
        _ = tokio::task::yield_now() => {},
    }
    cancel_samsung_sign_in(&state, "active".into())
        .await
        .unwrap();
    assert_eq!(request.await.err().unwrap().code, "sign_in_cancelled");
    assert!(samsung_account(&state).await.unwrap().is_none());
}

#[tokio::test]
async fn only_the_matching_request_can_cancel_a_pending_or_completed_sign_in() {
    let directory = tempfile::tempdir().unwrap();
    let state = state(directory.path());
    let (sender, receiver) = tokio::sync::oneshot::channel();
    let request = sign_in(&state, "active".into(), async {
        Ok(receiver.await.unwrap())
    });
    tokio::pin!(request);
    tokio::select! {
        biased;
        _ = &mut request => panic!("authentication must still be pending"),
        _ = tokio::task::yield_now() => {},
    }
    cancel_samsung_sign_in(&state, "other".into())
        .await
        .unwrap();
    sender.send(auth()).unwrap();
    assert!(request.await.is_ok());
    cancel_samsung_sign_in(&state, "other".into())
        .await
        .unwrap();
    assert!(samsung_account(&state).await.unwrap().is_some());
    cancel_samsung_sign_in(&state, "active".into())
        .await
        .unwrap();
    assert!(samsung_account(&state).await.unwrap().is_none());
}
