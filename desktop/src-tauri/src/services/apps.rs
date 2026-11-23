use super::reads::read_tv;
use crate::{
    models::{AppPackageSelection, AppRemovalResult, AppResult, TvAppPackage},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn list_tv_apps(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<Vec<TvAppPackage>> {
    read_tv(state, "list_apps", id, request_id).await
}

pub async fn remove_tv_apps(
    state: &AppState,
    id: String,
    packages: Vec<AppPackageSelection>,
) -> AppResult<AppRemovalResult> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    worker::request(
        &state.worker_path,
        "remove_apps",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "packages": packages,
        }),
    )
    .await
}
