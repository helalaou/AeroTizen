mod models;
mod profiles;
mod worker;

use models::{
    valid_identity, AppError, AppPackageSelection, AppResult, PreparedHomeApply, SavedTv,
    VerifiedTv,
};
use profiles::Profiles;
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri::Manager;
use tokio::sync::watch;

struct AppState {
    profiles: Profiles,
    worker_path: PathBuf,
    operation: tokio::sync::Mutex<()>,
    cancelled_tv_read: watch::Sender<String>,
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

async fn read_tv(
    state: &AppState,
    operation: &str,
    id: String,
    request_id: String,
) -> AppResult<Value> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    let cancelled = state.cancelled_tv_read.subscribe();
    if *cancelled.borrow() == request_id {
        return Err(AppError::new("tv_read_cancelled", "TV refresh cancelled."));
    }
    worker::request_with_cancellation(
        &state.worker_path,
        operation,
        json!({ "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256 }),
        Some((cancelled, request_id)),
    )
    .await
}

#[tauri::command]
async fn list_tv_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<Value> {
    read_tv(&state, "list_apps", id, request_id).await
}

#[tauri::command]
async fn list_tv_buttons(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<Value> {
    read_tv(&state, "list_buttons", id, request_id).await
}

#[tauri::command]
async fn list_tv_button_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    request_id: String,
) -> AppResult<Value> {
    read_tv(&state, "list_button_apps", id, request_id).await
}

#[tauri::command]
async fn change_tv_button(
    state: tauri::State<'_, AppState>,
    id: String,
    change: Value,
) -> AppResult<Value> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    worker::request(
        &state.worker_path,
        "change_button",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "change": change,
        }),
    )
    .await
}

#[tauri::command]
fn cancel_tv_read(state: tauri::State<'_, AppState>, request_id: String) {
    state.cancelled_tv_read.send_replace(request_id);
}

#[tauri::command]
async fn remove_tv_apps(
    state: tauri::State<'_, AppState>,
    id: String,
    packages: Vec<AppPackageSelection>,
) -> AppResult<Value> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    worker::request(
        &state.worker_path,
        "remove_apps",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "packages": packages,
        }),
    )
    .await
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
        home_routing_mode: None,
        native_home_settings: None,
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
async fn read_home_backup(
    state: tauri::State<'_, AppState>,
    id: String,
    captured_at: String,
) -> AppResult<Value> {
    let saved = state.profiles.get(&id)?;
    worker::request(
        &state.worker_path,
        "read_home_backup",
        json!({ "expected_identity": saved.tv.identity_sha256, "captured_at": captured_at }),
    )
    .await
}

#[tauri::command]
async fn prepare_native_home(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<PreparedHomeApply> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    let result = worker::request(
        &state.worker_path,
        "prepare_native_home",
        json!({ "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256 }),
    )
    .await?;
    let invalid_backup = || {
        AppError::new(
            "invalid_response",
            "The TV backend could not verify the original Home backup.",
        )
    };
    let prepared: PreparedHomeApply =
        serde_json::from_value(result).map_err(|_| invalid_backup())?;
    if prepared.id != id
        || !valid_identity(&prepared.backup_sha256)
        || prepared.captured_at.is_empty()
    {
        return Err(invalid_backup());
    }
    Ok(prepared)
}

#[tauri::command]
async fn apply_native_home(
    state: tauri::State<'_, AppState>,
    id: String,
    backup_sha256: String,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    if !valid_identity(&backup_sha256) {
        return Err(AppError::new(
            "invalid_response",
            "The Home backup verification is invalid.",
        ));
    }
    let saved = state.profiles.get(&id)?;
    let result = worker::request(
        &state.worker_path,
        "apply_native_home",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "backup_sha256": backup_sha256,
        }),
    )
    .await?;
    let tv: VerifiedTv = serde_json::from_value(result).map_err(|_| {
        AppError::new(
            "invalid_response",
            "The TV backend returned invalid connection details.",
        )
    })?;
    if tv.host != saved.tv.host || tv.identity_sha256 != saved.tv.identity_sha256 {
        return Err(AppError::new(
            "identity_mismatch",
            "The TV check returned a different address or identity.",
        ));
    }
    state.profiles.save(tv)
}

#[tauri::command]
async fn restore_home_backup(
    state: tauri::State<'_, AppState>,
    id: String,
    captured_at: String,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id)?;
    let result = worker::request(
        &state.worker_path,
        "restore_home_backup",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "captured_at": captured_at,
        }),
    )
    .await?;
    let tv: VerifiedTv = serde_json::from_value(result).map_err(|_| {
        AppError::new(
            "invalid_response",
            "The TV backend returned invalid connection details.",
        )
    })?;
    if tv.host != saved.tv.host || tv.identity_sha256 != saved.tv.identity_sha256 {
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
                cancelled_tv_read: watch::Sender::new(String::new()),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            backend_status,
            list_tvs,
            list_tv_apps,
            list_tv_buttons,
            list_tv_button_apps,
            change_tv_button,
            cancel_tv_read,
            remove_tv_apps,
            launcher_catalog,
            install_launcher,
            discover_tvs,
            connect_tv,
            read_home_backup,
            prepare_native_home,
            apply_native_home,
            restore_home_backup,
            rename_tv,
            forget_tv
        ])
        .run(tauri::generate_context!())
        .expect("could not run AeroTizen Desktop");
}
