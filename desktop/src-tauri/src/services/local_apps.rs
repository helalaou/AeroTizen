use crate::{
    models::{
        AppError, AppResult, InstalledLocalApp, LocalAppInstallResult, LocalAppPackage,
        LocalPackageReview, VerifiedTv,
    },
    state::AppState,
    worker,
};
use serde_json::json;
use std::path::PathBuf;
use tokio::sync::Mutex;

const LAUNCHER_APP_ID: &str = "DclHome001.Home";

#[derive(Clone)]
struct Selection {
    tv_id: String,
    path: PathBuf,
    review: LocalPackageReview,
}

impl Selection {
    fn public_review(&self) -> LocalAppPackage {
        LocalAppPackage {
            selection_id: self.review.sha256.clone(),
            name: self.review.name.clone(),
            app_id: self.review.app_id.clone(),
            package_id: self.review.package_id.clone(),
            version: self.review.version.clone(),
            current_version: self.review.current_version.clone(),
            replacing: self.review.current_revision.is_some(),
        }
    }

    fn matches(&self, tv_id: &str, selection_id: &str) -> bool {
        self.tv_id == tv_id && self.review.sha256 == selection_id
    }
}

#[derive(Default)]
pub struct LocalAppsState(Mutex<Option<Selection>>);

impl LocalAppsState {
    pub async fn clear(&self) {
        *self.0.lock().await = None;
    }
}

pub async fn inspect_local_app(
    state: &AppState,
    id: String,
    path: Option<PathBuf>,
) -> AppResult<Option<LocalAppPackage>> {
    let saved = state.profiles.get(&id).await?;
    let Some(path) = path else {
        return Ok(None);
    };
    if path.to_str().is_none() {
        return Err(AppError::new(
            "invalid_package",
            "The file name is unsupported. Rename the file and try again.",
        ));
    }
    let review: LocalPackageReview = worker::request(
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

pub async fn install_local_app(
    state: &AppState,
    id: String,
    selection_id: String,
    confirm_install: bool,
) -> AppResult<LocalAppInstallResult> {
    let _guard = state
        .operation
        .try_lock()
        .map_err(|_| crate::state::busy())?;
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
    let saved = state.profiles.get(&id).await?;
    let installed: InstalledLocalApp = worker::request(&state.worker_path, "install_local_app", json!({
        "host": saved.tv.host, "expected_identity": saved.tv.identity_sha256,
        "path": selection.path, "sha256": selection.review.sha256,
        "current_revision": selection.review.current_revision, "confirm_install": confirm_install,
    })).await?;
    if installed.app_id != selection.review.app_id
        || installed.package_id != selection.review.package_id
        || installed.version != selection.review.version
    {
        return Err(AppError::new(
            "version_unverified",
            "Could not verify the installed app. Refresh Apps to check.",
        ));
    }
    let is_launcher = installed.app_id == LAUNCHER_APP_ID;
    let profile = state
        .profiles
        .save(VerifiedTv {
            launcher_signing_ready: true,
            launcher_version: if is_launcher {
                Some(installed.version.clone())
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
        })
        .await?;
    *state.local_apps.0.lock().await = None;
    Ok(LocalAppInstallResult {
        profile,
        app_id: installed.app_id,
        version: installed.version,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn selection_is_bound_to_tv_and_reviewed_file() {
        let selection = Selection {
            tv_id: "tv-one".into(),
            path: "/private/app.wgt".into(),
            review: LocalPackageReview {
                sha256: "checksum".into(),
                name: "Test".into(),
                app_id: "test.app".into(),
                package_id: "test".into(),
                version: "1.0.0".into(),
                current_revision: None,
                current_version: None,
            },
        };
        assert!(selection.matches("tv-one", "checksum"));
        assert!(!selection.matches("tv-two", "checksum"));
        assert!(!selection.matches("tv-one", "other-file"));
        assert!(!serde_json::to_string(&selection.public_review())
            .unwrap()
            .contains("/private/"));
    }
}
