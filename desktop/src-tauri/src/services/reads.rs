use crate::{
    models::{AppError, AppResult, SavedTv},
    state::{busy, AppState},
    worker,
};
use serde_json::json;
use std::future::Future;

#[cfg(test)]
mod tests;

pub async fn read_native_tv<Result, Query, Pending>(
    state: &AppState,
    id: String,
    request_id: String,
    query: Query,
) -> AppResult<Result>
where
    Query: FnOnce(SavedTv) -> Pending,
    Pending: Future<Output = AppResult<Result>>,
{
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
        result = query(saved) => result,
    }
}

pub async fn read_tv<Result: serde::de::DeserializeOwned>(
    state: &AppState,
    operation: &str,
    id: String,
    request_id: String,
) -> AppResult<Result> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
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
