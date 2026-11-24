use crate::{
    models::{AppResult, BackendStatus, LauncherRelease, SavedTv},
    services,
    state::AppState,
};

#[tauri::command]
pub fn backend_status() -> BackendStatus {
    services::backend::status()
}

#[tauri::command]
pub async fn launcher_catalog() -> AppResult<Vec<LauncherRelease>> {
    services::launcher_catalog::load().await
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
