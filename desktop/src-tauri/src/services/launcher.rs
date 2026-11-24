use crate::{
    models::{valid_identity, AppError, AppResult, LauncherRemovalReview, SavedTv, VerifiedTv},
    state::{busy, AppState},
};
const INSTALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

pub async fn review_launcher_removal(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<LauncherRemovalReview> {
    super::reads::read_native_tv(state, id, request_id, |saved| async move {
        state
            .device_connection
            .review_launcher_removal(&saved.tv.host, &saved.tv.identity_sha256)
            .await
    })
    .await
}

pub async fn remove_launcher(
    state: &AppState,
    id: String,
    revision: String,
    confirmed: bool,
) -> AppResult<SavedTv> {
    if !confirmed || !valid_identity(&revision) {
        return Err(AppError::new(
            "confirmation_required",
            "Check Home and startup and confirm removal first.",
        ));
    }
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    state
        .device_connection
        .remove_launcher(&saved.tv.host, &saved.tv.identity_sha256, &revision)
        .await?;
    state
        .profiles
        .save(VerifiedTv {
            launcher_version: None,
            home_routing_mode: None,
            native_home_settings: None,
            ..saved.tv
        })
        .await
}

pub async fn install_launcher(
    state: &AppState,
    id: String,
    version: String,
    current_version: Option<String>,
    confirm_replace: bool,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    if saved.tv.launcher_version != current_version {
        return Err(AppError::new(
            "launcher_changed",
            "The installed version changed. Refresh the TV and try again.",
        ));
    }
    super::launcher_catalog::validate_install(
        &version,
        current_version.as_deref(),
        confirm_replace,
    )?;
    tokio::time::timeout(INSTALL_TIMEOUT, async {
        let downloaded = super::launcher_catalog::download::download(&version).await?;
        state
            .device_connection
            .install_published_launcher(
                &saved.tv.host,
                &saved.tv.identity_sha256,
                downloaded.path.clone(),
                downloaded.review.clone(),
                current_version.as_deref(),
            )
            .await?;
        Ok::<_, AppError>(())
    })
    .await
    .map_err(|_| {
        AppError::new(
            "connection_timeout",
            "Installation timed out. Refresh the TV to check its version before retrying.",
        )
    })??;
    state
        .profiles
        .save(VerifiedTv {
            launcher_version: Some(version),
            home_routing_mode: None,
            native_home_settings: None,
            ..saved.tv
        })
        .await
}
