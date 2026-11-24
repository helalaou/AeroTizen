use super::*;
use serde_json::json;

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

#[tokio::test]
async fn certificate_setup_reuses_an_original_profile_natively_and_preserves_both_busy_guards() {
    use crate::{
        models::VerifiedTv,
        services::{
            device_connection::tests::Peer, device_connection::TvConnection, digest::sha256_hex,
            sdb::tests::serve_script,
        },
    };
    let directory = tempfile::tempdir().unwrap();
    let mut state = AppState::for_test(directory.path());
    let profile = directory.path().join("cli-state/certs/test-duid");
    std::fs::create_dir_all(&profile).unwrap();
    for filename in [
        "author.p12",
        "distributor.p12",
        "password.txt",
        "device-profile.xml",
    ] {
        std::fs::write(profile.join(filename), b"original").unwrap();
    }
    let mut tv = Peer::start(1, |mut io, _| async move {
        serve_script(
            &mut io,
            vec![("shell:0 getduid".into(), "test-duid".into())],
        )
        .await
    })
    .await;
    state.device_connection =
        TvConnection::with_ports(directory.path().join("cli-state"), tv.port, 1);
    let mut saved: VerifiedTv =
        serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap();
    saved.host = "127.0.0.1".into();
    saved.identity_sha256 = sha256_hex(b"test-duid");
    let saved = state.profiles.save(saved).await.unwrap();
    let guard = state.operation.lock().await;
    assert_eq!(
        prepare_signing_profile(&state, saved.id.clone())
            .await
            .unwrap_err()
            .code,
        "operation_busy"
    );
    drop(guard);
    let guard = state.samsung.operation.lock().await;
    assert_eq!(
        prepare_signing_profile(&state, saved.id.clone())
            .await
            .unwrap_err()
            .code,
        "operation_busy"
    );
    drop(guard);
    let result = prepare_signing_profile(&state, saved.id.clone())
        .await
        .unwrap();
    assert_eq!(result.identity_sha256, saved.id);
    assert!(result.launcher_signing_ready);
    assert_eq!(
        std::fs::read(profile.join("author.p12")).unwrap(),
        b"original"
    );
    tv.finish().await;
}
