use super::reads::read_tv;
use crate::{
    models::{AppResult, RootAccessStatus, RootSetupAction, RootUpdateAction},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn root_access_status(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<RootAccessStatus> {
    read_tv(state, "root_status", id, request_id).await
}

pub async fn setup_root_access(
    state: &AppState,
    id: String,
    action: RootSetupAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
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
