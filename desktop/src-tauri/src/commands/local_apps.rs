use crate::{
    models::{AppError, AppResult, LocalAppInstallResult, LocalAppPackage},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn choose_local_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Option<LocalAppPackage>> {
    use tauri_plugin_dialog::DialogExt;
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
    state.profiles.get(&id)?;
    state.local_apps.clear().await;
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose a Tizen app")
        .add_filter("Tizen app", &["wgt"])
        .pick_file(move |file| {
            let _ = send.send(file);
        });
    let path = receive
        .await
        .map_err(|_| AppError::new("file_picker_failed", "Could not open the file picker."))?
        .map(|file| {
            file.into_path()
                .map_err(|_| AppError::new("invalid_package", "Choose a local .wgt app file."))
        })
        .transpose()?;
    services::local_apps::inspect_local_app(&state, id, path).await
}

#[tauri::command]
pub async fn install_local_app(
    state: tauri::State<'_, AppState>,
    id: String,
    selection_id: String,
    confirm_install: bool,
) -> AppResult<LocalAppInstallResult> {
    services::local_apps::install_local_app(&state, id, selection_id, confirm_install).await
}
