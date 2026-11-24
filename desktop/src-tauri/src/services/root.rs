use crate::{
    models::{AppError, AppResult, RootAccessStatus, RootSetupAction, RootUpdateAction},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn root_access_status(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<RootAccessStatus> {
    super::reads::read_native_tv(state, id, request_id, |saved| async move {
        state
            .root_status
            .read(&saved.tv.host, &saved.tv.identity_sha256)
            .await
    })
    .await
}

pub async fn setup_root_access(
    state: &AppState,
    id: String,
    action: RootSetupAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    if !confirmed {
        return Err(AppError::new(
            "confirmation_required",
            "Review and confirm root setup first.",
        ));
    }
    if matches!(action, RootSetupAction::Verify) {
        return state
            .device_connection
            .verify_root_setup(&saved.tv.host, &saved.tv.identity_sha256)
            .await;
    }
    worker::request(
        &state.worker_path,
        "setup_root",
        json!({
            "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256,
            "action": action, "confirmed": confirmed,
        }),
    )
    .await
}

pub async fn upgrade_root_access(
    state: &AppState,
    id: String,
    action: RootUpdateAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    worker::request(
        &state.worker_path,
        "upgrade_root",
        json!({
            "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256,
            "action": action, "confirmed": confirmed,
        }),
    )
    .await
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn root_verification_is_native_and_keeps_confirmation_and_operation_guards() {
        let directory = tempfile::tempdir().unwrap();
        let state = AppState::for_test(directory.path());
        let tv: crate::models::VerifiedTv =
            serde_json::from_str(include_str!("../models/fixtures/verified-tv.json")).unwrap();
        let saved = state.profiles.save(tv).await.unwrap();
        assert_eq!(
            setup_root_access(&state, saved.id.clone(), RootSetupAction::Verify, false)
                .await
                .unwrap_err()
                .code,
            "confirmation_required"
        );
        assert_eq!(
            setup_root_access(&state, saved.id.clone(), RootSetupAction::Verify, true)
                .await
                .unwrap_err()
                .code,
            "root_state_changed"
        );
        let mut record = crate::services::root_pairing::tests::document();
        record["phase"] = json!("waiting_boot");
        record["duid_sha256"] = json!(saved.tv.identity_sha256);
        record["baseline_boot_id"] = json!("invalid");
        crate::services::root_pairing::tests::save(
            &directory.path().join("cli-state"),
            &saved.tv.host,
            &record,
        );
        assert_eq!(
            setup_root_access(&state, saved.id.clone(), RootSetupAction::Verify, true)
                .await
                .unwrap_err()
                .code,
            "root_recovery_unavailable"
        );
        let _guard = state.operation.lock().await;
        assert_eq!(
            setup_root_access(&state, saved.id, RootSetupAction::Verify, true)
                .await
                .unwrap_err()
                .code,
            "operation_busy"
        );
        assert!(!state.worker_path.exists());
    }
}
