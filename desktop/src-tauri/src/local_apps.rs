use crate::{
    models::{AppError, AppResult, VerifiedTv},
    worker, AppState,
};
use serde_json::{json, Value};
use std::path::PathBuf;
use tauri_plugin_dialog::DialogExt;
use tokio::sync::{oneshot, Mutex};

const LAUNCHER_APP_ID: &str = "DclHome001.Home";

#[derive(Clone)]
struct Selection {
    tv_id: String,
    path: PathBuf,
    review: Value,
}

impl Selection {
    fn public_review(&self) -> Value {
        json!({
            "selection_id": self.review["sha256"],
            "name": self.review["name"],
            "app_id": self.review["app_id"],
            "package_id": self.review["package_id"],
            "version": self.review["version"],
            "current_version": self.review["current_version"],
            "replacing": !self.review["current_revision"].is_null(),
        })
    }

    fn matches(&self, tv_id: &str, selection_id: &str) -> bool {
        self.tv_id == tv_id && self.review["sha256"].as_str() == Some(selection_id)
    }
}

#[derive(Default)]
pub struct LocalAppsState(Mutex<Option<Selection>>);

#[tauri::command]
pub async fn choose_local_app(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<Option<Value>> {
    let _guard = state.operation.try_lock().map_err(|_| crate::busy())?;
    let saved = state.profiles.get(&id)?;
    *state.local_apps.0.lock().await = None;
    let (send, receive) = oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose a Tizen app")
        .add_filter("Tizen app", &["wgt"])
        .pick_file(move |file| {
            let _ = send.send(file);
        });
    let Some(file) = receive
        .await
        .map_err(|_| AppError::new("file_picker_failed", "Could not open the file picker."))?
    else {
        return Ok(None);
    };
    let path = file
        .into_path()
        .map_err(|_| AppError::new("invalid_package", "Choose a local .wgt app file."))?;
    if path.to_str().is_none() {
        return Err(AppError::new(
            "invalid_package",
            "The file name is unsupported. Rename the file and try again.",
        ));
    }
    let review = worker::request(
        &state.worker_path,
        "inspect_local_app",
        json!({
            "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256, "path": path,
        }),
    )
    .await?;
    let selection = Selection {
        tv_id: id,
        path,
        review,
    };
    let public = selection.public_review();
    *state.local_apps.0.lock().await = Some(selection);
    Ok(Some(public))
}

#[tauri::command]
pub async fn install_local_app(
    state: tauri::State<'_, AppState>,
    id: String,
    selection_id: String,
    confirm_install: bool,
) -> AppResult<Value> {
    let _guard = state.operation.try_lock().map_err(|_| crate::busy())?;
    let selection = state
        .local_apps
        .0
        .lock()
        .await
        .as_ref()
        .filter(|selection| selection.matches(&id, &selection_id))
        .cloned()
        .ok_or_else(|| {
            AppError::new(
                "selection_changed",
                "Choose the app file again and review it.",
            )
        })?;
    let saved = state.profiles.get(&id)?;
    let installed = worker::request(&state.worker_path, "install_local_app", json!({
        "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256,
        "path": selection.path, "sha256": selection.review["sha256"],
        "current_revision": selection.review["current_revision"], "confirm_install": confirm_install,
    })).await?;
    if ["app_id", "package_id", "version"]
        .iter()
        .any(|key| installed[key] != selection.review[key])
    {
        return Err(AppError::new(
            "version_unverified",
            "Could not verify the installed app. Refresh Apps to check.",
        ));
    }
    let is_launcher = installed["app_id"].as_str() == Some(LAUNCHER_APP_ID);
    let profile = state.profiles.save(VerifiedTv {
        launcher_signing_ready: true,
        launcher_version: if is_launcher {
            installed["version"].as_str().map(String::from)
        } else {
            saved.tv.launcher_version
        },
        home_routing_mode: if is_launcher {
            None
        } else {
            saved.tv.home_routing_mode
        },
        native_home_settings: if is_launcher {
            None
        } else {
            saved.tv.native_home_settings
        },
        ..saved.tv
    })?;
    *state.local_apps.0.lock().await = None;
    Ok(
        json!({ "profile": profile, "app_id": installed["app_id"], "version": installed["version"] }),
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_is_bound_to_tv_and_reviewed_file() {
        let selection = Selection {
            tv_id: "tv-one".into(),
            path: "/private/app.wgt".into(),
            review: json!({"sha256": "checksum"}),
        };
        assert!(selection.matches("tv-one", "checksum"));
        assert!(!selection.matches("tv-two", "checksum"));
        assert!(!selection.matches("tv-one", "other-file"));
        assert!(!selection.public_review().to_string().contains("/private/"));
    }
}
