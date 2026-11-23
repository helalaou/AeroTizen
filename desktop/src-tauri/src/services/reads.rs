use crate::{
    models::{AppError, AppResult},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn read_tv<Result: serde::de::DeserializeOwned>(
    state: &AppState,
    operation: &str,
    id: String,
    request_id: String,
) -> AppResult<Result> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    let cancelled = state.cancelled_tv_read.subscribe();
    if *cancelled.borrow() == request_id {
        return Err(AppError::new("tv_read_cancelled", "TV refresh cancelled."));
    }
    worker::request_with_cancellation(
        &state.worker_path,
        operation,
        json!({ "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256 }),
        Some((cancelled, request_id)),
    )
    .await
}
