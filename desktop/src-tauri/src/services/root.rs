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
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    let mut cancelled = state.cancelled_tv_read.subscribe();
    let cancellation = || AppError::new("tv_read_cancelled", "TV refresh cancelled.");
    if *cancelled.borrow() == request_id {
        return Err(cancellation());
    }
    tokio::select! {
        biased;
        _ = cancelled.wait_for(|request| *request == request_id) => Err(cancellation()),
        result = state.root_status.read(&saved.tv.host, &saved.tv.identity_sha256) => result,
    }
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

#[cfg(test)]
mod tests;
