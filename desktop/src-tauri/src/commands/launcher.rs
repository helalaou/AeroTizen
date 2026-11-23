use crate::{
    models::{AppResult, BackendStatus, LauncherRelease, SavedTv},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn backend_status(state: tauri::State<'_, AppState>) -> AppResult<BackendStatus> {
    services::launcher::backend_status(&state).await
}

#[tauri::command]
pub async fn launcher_catalog(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<LauncherRelease>> {
    services::launcher::launcher_catalog(&state).await
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
