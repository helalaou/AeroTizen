use crate::{
    models::{
        AppError, AppResult, InstalledLocalApp, LocalAppInstallResult, LocalAppPackage,
        LocalPackageReview, VerifiedTv, LAUNCHER_APP_ID,
    },
    state::AppState,
};
use std::path::PathBuf;
use tokio::sync::Mutex;

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
    let mut review = super::local_widget::inspect(path.clone()).await?;
    (review.current_revision, review.current_version) = state
        .device_connection
        .installed(
            &saved.tv.host,
            &saved.tv.identity_sha256,
            review.package_id.clone(),
            review.app_id.clone(),
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
    let installed: InstalledLocalApp = state
        .device_connection
        .install_local(
            &saved.tv.host,
            &saved.tv.identity_sha256,
            selection.path,
            selection.review.clone(),
            confirm_install,
        )
        .await?;
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

    #[tokio::test]
    async fn native_review_reads_installed_version_without_worker_and_rejects_incomplete_inventory()
    {
        use crate::{
            models::VerifiedTv,
            services::{
                device_connection::TvConnection,
                digest::sha256_hex,
                local_widget::tests::{config, widget},
                sdb::tests::serve,
            },
        };
        use tokio::{
            net::TcpListener,
            time::{timeout, Duration},
        };
        for raw in [
            "apps count: 1\napp_id=LocalApp01.Player app_title=Player app_version=0.9.0\n",
            "apps count: 2\n",
        ] {
            let directory = tempfile::tempdir().unwrap();
            let mut state = AppState::for_test(directory.path());
            let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
            state.device_connection = TvConnection::with_ports(
                directory.path().join("cli-state"),
                listener.local_addr().unwrap().port(),
                1,
            );
            let mut tv: VerifiedTv =
                serde_json::from_str(include_str!("../models/fixtures/verified-tv.json")).unwrap();
            tv.host = "127.0.0.1".into();
            tv.identity_sha256 = sha256_hex(b"test-duid");
            let saved = state.profiles.save(tv).await.unwrap();
            let path = directory.path().join("Player.wgt");
            widget(&path, config().as_bytes(), None);
            let server = async {
                let (mut io, _) = listener.accept().await.unwrap();
                serve(&mut io, ["test-duid", "test-duid"], raw).await
            };
            let (result, _) = timeout(Duration::from_secs(3), async {
                tokio::join!(
                    inspect_local_app(&state, saved.id.clone(), Some(path)),
                    server
                )
            })
            .await
            .unwrap();
            if raw.contains("app_id") {
                let review = result.unwrap().unwrap();
                assert_eq!(review.current_version.as_deref(), Some("0.9.0"));
                assert!(review.replacing);
                let selected = state.local_apps.0.lock().await;
                assert!(selected
                    .as_ref()
                    .unwrap()
                    .matches(&saved.id, &review.selection_id));
                assert!(!serde_json::to_string(&review)
                    .unwrap()
                    .contains(directory.path().to_str().unwrap()));
            } else {
                assert_eq!(result.unwrap_err().code, "inventory_unavailable");
                assert!(state.local_apps.0.lock().await.is_none());
            }
            assert!(!state.worker_path.exists());
        }
    }
}
