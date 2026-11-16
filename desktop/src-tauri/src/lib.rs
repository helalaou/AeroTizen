mod models;
mod profiles;
mod worker;

use models::{AppError, AppResult, SavedTv, VerifiedTv};
use profiles::Profiles;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;

struct AppState {
    profiles: Profiles,
    worker_path: PathBuf,
    operation: tokio::sync::Mutex<()>,
}

#[tauri::command]
async fn backend_status(state: tauri::State<'_, AppState>) -> AppResult<Value> {
    let result = worker::request(&state.worker_path, "handshake", json!({})).await?;
    if result.get("name").and_then(Value::as_str) != Some("aerotizen-desktop-worker") {
        return Err(AppError::new(
            "worker_incompatible",
            "The bundled TV backend is incompatible.",
        ));
    }
    Ok(result)
}

#[tauri::command]
fn list_tvs(state: tauri::State<'_, AppState>) -> AppResult<Vec<SavedTv>> {
    state.profiles.list()
}

#[tauri::command]
async fn launcher_catalog(state: tauri::State<'_, AppState>) -> AppResult<Value> {
    worker::request(&state.worker_path, "launcher_catalog", json!({})).await
}

#[tauri::command]
async fn install_launcher(
    state: tauri::State<'_, AppState>,
    id: String,
    version: String,
    current_version: Option<String>,
    confirm_replace: bool,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    if saved.tv.launcher_version != current_version {
        return Err(AppError::new(
            "launcher_changed",
            "The installed version changed. Refresh the TV and try again.",
        ));
    }
    let result = worker::request(
        &state.worker_path,
        "install_launcher",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "version": version,
            "current_version": current_version,
            "confirm_replace": confirm_replace,
        }),
    )
    .await?;
    if result.as_str() != Some(version.as_str()) {
        return Err(AppError::new(
            "version_unverified",
            "The TV did not report the requested version. Refresh the TV to check.",
        ));
    }
    state.profiles.save(VerifiedTv {
        launcher_version: Some(version),
        ..saved.tv
    })
}

#[tauri::command]
async fn discover_tvs(state: tauri::State<'_, AppState>) -> AppResult<Value> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    worker::request(&state.worker_path, "discover", json!({})).await
}

#[tauri::command]
async fn connect_tv(
    state: tauri::State<'_, AppState>,
    host: String,
    profile_id: Option<String>,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let expected = profile_id
        .as_deref()
        .map(|id| state.profiles.get(id))
        .transpose()?;
    let expected_identity = expected.map(|profile| profile.tv.identity_sha256);
    let result = worker::request(
        &state.worker_path,
        "connect",
        json!({ "host": host, "expected_identity": expected_identity.as_deref() }),
    )
    .await?;
    let tv: VerifiedTv = serde_json::from_value(result).map_err(|_| {
        AppError::new(
            "invalid_response",
            "The TV backend returned invalid connection details.",
        )
    })?;
    if tv.host != host
        || expected_identity
            .as_ref()
            .is_some_and(|identity| identity != &tv.identity_sha256)
    {
        return Err(AppError::new(
            "identity_mismatch",
            "The TV check returned a different address or identity.",
        ));
    }
    state.profiles.save(tv)
}

#[tauri::command]
fn rename_tv(state: tauri::State<'_, AppState>, id: String, name: String) -> AppResult<()> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    state.profiles.rename(&id, &name)
}

#[tauri::command]
fn forget_tv(state: tauri::State<'_, AppState>, id: String) -> AppResult<()> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    state.profiles.forget(&id)
}

fn busy() -> AppError {
    AppError::new(
        "operation_busy",
        "Wait for the current TV action to finish.",
    )
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _, _| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
        }))
        .plugin(
            tauri_plugin_opener::Builder::new()
                .open_js_links_on_click(false)
                .build(),
        )
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let profiles = Profiles::new(directory.join("profiles.sqlite3"))
                .map_err(|error| std::io::Error::other(error.message))?;
            let worker_path =
                worker::binary_path().map_err(|error| std::io::Error::other(error.message))?;
            app.manage(AppState {
                profiles,
                worker_path,
                operation: tokio::sync::Mutex::new(()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend_status,
            list_tvs,
            launcher_catalog,
            install_launcher,
            discover_tvs,
            connect_tv,
            rename_tv,
            forget_tv
        ])
        .run(tauri::generate_context!())
        .expect("could not run AeroTizen Desktop");
}
