use crate::{
    models::{AppResult, RootAccessStatus, RootSetupAction, RootUpdateAction},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn root_access_status(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<RootAccessStatus> {
    services::root::root_access_status(&state, id, request_id).await
}

#[tauri::command]
pub async fn setup_root_access(
    state: tauri::State<'_, AppState>,
    id: String,
    action: RootSetupAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    services::root::setup_root_access(&state, id, action, confirmed).await
}

#[tauri::command]
pub async fn upgrade_root_access(
    state: tauri::State<'_, AppState>,
    id: String,
    action: RootUpdateAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    services::root::upgrade_root_access(&state, id, action, confirmed).await
}
