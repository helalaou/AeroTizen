use crate::{
    models::{AppResult, SavedTv, TvCandidate},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn list_tvs(state: tauri::State<'_, AppState>) -> AppResult<Vec<SavedTv>> {
    services::tvs::list_tvs(&state).await
}

#[tauri::command]
pub async fn discover_tvs(state: tauri::State<'_, AppState>) -> AppResult<Vec<TvCandidate>> {
    services::tvs::discover_tvs(&state).await
}

#[tauri::command]
pub async fn connect_tv(
    state: tauri::State<'_, AppState>,
    host: String,
    profile_id: Option<String>,
) -> AppResult<SavedTv> {
    services::tvs::connect_tv(&state, host, profile_id).await
}

#[tauri::command]
pub async fn rename_tv(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
) -> AppResult<()> {
    services::tvs::rename_tv(&state, id, name).await
}

#[tauri::command]
pub async fn check_tv_diagnostics(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<SavedTv> {
    services::tvs::check_tv_diagnostics(&state, id, request_id).await
}

#[tauri::command]
pub async fn forget_tv(state: tauri::State<'_, AppState>, id: String) -> AppResult<()> {
    services::tvs::forget_tv(&state, id).await
}

#[tauri::command]
pub fn cancel_tv_read(state: tauri::State<'_, AppState>, request_id: String) {
    services::tvs::cancel_tv_read(&state, request_id)
}

#[cfg(test)]
mod tests;
