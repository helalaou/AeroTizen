use crate::{
    models::{AppPackageSelection, AppRemovalResult, AppResult, TvAppPackage},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn list_tv_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<Vec<TvAppPackage>> {
    services::apps::list_tv_apps(&state, id, request_id).await
}

#[tauri::command]
pub async fn remove_tv_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    packages: Vec<AppPackageSelection>,
) -> AppResult<AppRemovalResult> {
    services::apps::remove_tv_apps(&state, id, packages).await
}
