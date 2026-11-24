use crate::{
    models::AppResult,
    services::diagnostics::{self, export_failed, ExportOptions, ExportResult},
    state::AppState,
};
use std::time::SystemTime;
use tauri_plugin_dialog::DialogExt;

#[tauri::command]
pub async fn save_desktop_logs<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    contents: String,
    options: ExportOptions,
) -> AppResult<ExportResult> {
    let activity = diagnostics::parse_activity(&contents)?;
    let date = chrono::DateTime::<chrono::Utc>::from(SystemTime::now());
    let (send, receive) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Export logs")
        .set_file_name(format!(
            "aerotizen-diagnostics-{}.zip",
            date.format("%Y-%m-%d_%H-%M-%S")
        ))
        .add_filter("Diagnostic ZIP", &["zip"])
        .save_file(move |file| {
            let _ = send.send(file);
        });
    let Some(file) = receive.await.map_err(|_| export_failed())? else {
        return Ok(ExportResult::default());
    };
    let path = file.into_path().map_err(|_| export_failed())?;
    let bundle = diagnostics::collect(&state, options).await;
    tokio::task::spawn_blocking(move || diagnostics::save(&path, &activity, bundle))
        .await
        .map_err(|_| export_failed())?
}
