use crate::{
    models::{AppError, AppResult, BackendStatus, LauncherRelease, SavedTv, VerifiedTv},
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn backend_status(state: &AppState) -> AppResult<BackendStatus> {
    let result: BackendStatus = worker::request(&state.worker_path, "handshake", json!({})).await?;
    if result.name != "aerotizen-desktop-worker" {
        return Err(AppError::new(
            "worker_incompatible",
            "The bundled TV backend is incompatible.",
        ));
    }
    Ok(result)
}

pub async fn launcher_catalog(state: &AppState) -> AppResult<Vec<LauncherRelease>> {
    worker::request(&state.worker_path, "launcher_catalog", json!({})).await
}

pub async fn install_launcher(
    state: &AppState,
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
    let result: String = worker::request(
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
    if result != version {
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn bundled_worker_returns_the_native_backend_contract_without_a_tv() {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .unwrap();
        let status: BackendStatus = runtime
            .block_on(worker::request(
                &worker::binary_path().unwrap(),
                "handshake",
                json!({}),
            ))
            .unwrap();
        assert_eq!(status.name, "aerotizen-desktop-worker");
        assert!(!status.version.is_empty());
        assert!(status
            .operations
            .iter()
            .any(|name| name == "prepare_native_home"));
    }
}
