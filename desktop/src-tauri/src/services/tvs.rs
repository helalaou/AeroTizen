use super::discovery;
use crate::{
    models::{AppError, AppResult, SavedTv, TvCandidate, VerifiedTv},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn list_tvs(state: &AppState) -> AppResult<Vec<SavedTv>> {
    state.profiles.list().await
}

pub async fn discover_tvs(state: &AppState) -> AppResult<Vec<TvCandidate>> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    discovery::discover().await
}

pub async fn connect_tv(
    state: &AppState,
    host: String,
    profile_id: Option<String>,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let expected = match profile_id {
        Some(id) => Some(state.profiles.get(&id).await?),
        None => None,
    };
    let expected_identity = expected.map(|profile| profile.tv.identity_sha256);
    let tv: VerifiedTv = worker::request(
        &state.worker_path,
        "connect",
        json!({ "host": host, "expected_identity": expected_identity.as_deref() }),
    )
    .await?;
    if tv.host != host
        || expected_identity
            .as_ref()
            .is_some_and(|identity| identity != &tv.identity_sha256)
    {
        return Err(AppError::new(
            "identity_mismatch",
            "The TV check returned a different address or identity.",
        ));
    }
    state.profiles.save(tv).await
}

pub async fn rename_tv(state: &AppState, id: String, name: String) -> AppResult<()> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    state.profiles.rename(&id, &name).await
}

pub async fn forget_tv(state: &AppState, id: String) -> AppResult<()> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    state.profiles.forget(&id).await
}

pub fn cancel_tv_read(state: &AppState, request_id: String) {
    state.cancelled_tv_read.send_replace(request_id);
}
