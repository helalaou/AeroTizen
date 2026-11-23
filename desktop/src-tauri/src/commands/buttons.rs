use crate::{
    models::{AppResult, ButtonChange, ButtonChangeResult, ButtonMappings, ButtonTargetApp},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn list_tv_buttons(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<ButtonMappings> {
    services::buttons::list_tv_buttons(&state, id, request_id).await
}

#[tauri::command]
pub async fn list_tv_button_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<Vec<ButtonTargetApp>> {
    services::buttons::list_tv_button_apps(&state, id, request_id).await
}

#[tauri::command]
pub async fn change_tv_button(
    state: tauri::State<'_, AppState>,
    id: String,
    change: ButtonChange,
) -> AppResult<ButtonChangeResult> {
    services::buttons::change_tv_button(&state, id, change).await
}
