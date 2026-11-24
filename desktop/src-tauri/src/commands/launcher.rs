use crate::{
    models::{AppResult, DesktopStatus, LauncherRelease, LauncherRemovalReview, SavedTv},
    services,
    state::AppState,
};

#[tauri::command]
pub fn desktop_status() -> DesktopStatus {
    services::backend::status()
}

#[tauri::command]
pub async fn launcher_catalog() -> AppResult<Vec<LauncherRelease>> {
    services::launcher_catalog::load().await
}

#[tauri::command]
pub async fn review_launcher_removal(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<LauncherRemovalReview> {
    services::launcher::review_launcher_removal(&state, id, request_id).await
}

#[tauri::command]
pub async fn remove_launcher(
    state: tauri::State<'_, AppState>,
    id: String,
    revision: String,
    confirmed: bool,
) -> AppResult<SavedTv> {
    services::launcher::remove_launcher(&state, id, revision, confirmed).await
}

#[tauri::command]
pub async fn install_launcher(
    state: tauri::State<'_, AppState>,
    id: String,
    version: String,
    current_version: Option<String>,
    confirm_replace: bool,
) -> AppResult<SavedTv> {
    services::launcher::install_launcher(&state, id, version, current_version, confirm_replace)
        .await
}
