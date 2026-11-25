use crate::{
    models::{AppResult, HomeBackupSettings, PreparedHomeApply, SavedTv},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn read_home_backup(
    state: tauri::State<'_, AppState>,
    id: String,
    captured_at: String,
) -> AppResult<HomeBackupSettings> {
    services::home::read_home_backup(&state, id, captured_at).await
}

#[tauri::command]
pub async fn read_home_diagnostics(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Option<serde_json::Value>> {
    services::diagnostics::latest_home_attempt(&state, &id).await
}

#[tauri::command]
pub async fn prepare_native_home(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<PreparedHomeApply> {
    services::home::prepare_native_home(&state, id).await
}

#[tauri::command]
pub async fn apply_native_home(
    state: tauri::State<'_, AppState>,
    id: String,
    backup_sha256: String,
) -> AppResult<SavedTv> {
    services::home::apply_native_home(&state, id, backup_sha256).await
}

#[tauri::command]
pub async fn restore_home_backup(
    state: tauri::State<'_, AppState>,
    id: String,
    captured_at: String,
) -> AppResult<SavedTv> {
    services::home::restore_home_backup(&state, id, captured_at).await
}
