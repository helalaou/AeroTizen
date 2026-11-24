use crate::{
    models::{
        AppError, AppResult, RootAccessStatus, RootRemoveAction, RootSetupAction, RootUpdateAction,
    },
    services,
    state::AppState,
};
use tauri_plugin_opener::OpenerExt;

#[tauri::command]
pub async fn remove_root_access(
    state: tauri::State<'_, AppState>,
    id: String,
    action: RootRemoveAction,
    confirmed: bool,
) -> AppResult<RootAccessStatus> {
    services::root::remove_root_access(&state, id, action, confirmed).await
}

#[tauri::command]
pub async fn reveal_root_recovery<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<()> {
    let saved = state.profiles.get(&id).await?;
    let path = state
        .root_status
        .recovery_record_path(&saved.tv.host, &saved.tv.identity_sha256)
        .await?;
    let revealed = tokio::task::spawn_blocking(move || app.opener().reveal_item_in_dir(path))
        .await
        .is_ok_and(|result| result.is_ok());
    if revealed {
        Ok(())
    } else {
        Err(AppError::new(
            "recovery_record_open_failed",
            "Could not show the recovery record in your file manager.",
        ))
    }
}

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
