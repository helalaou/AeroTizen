use crate::{
    models::{AppError, AppResult, SavedTv, VerifiedTv},
    state::{busy, AppState},
};
const INSTALL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);

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
