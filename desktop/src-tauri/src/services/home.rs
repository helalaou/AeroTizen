use crate::{
    models::{
        valid_identity, AppError, AppResult, HomeBackupSettings, NativeHomeSettings,
        PreparedHomeApply, SavedTv, VerifiedTv,
    },
    state::{busy, AppState},
};

pub async fn read_home_backup(
    state: &AppState,
    id: String,
    captured_at: String,
) -> AppResult<HomeBackupSettings> {
    let saved = state.profiles.get(&id).await?;
    state
        .home_backups
        .read(&saved.tv.identity_sha256, &captured_at)
        .await
}

pub async fn prepare_native_home(state: &AppState, id: String) -> AppResult<PreparedHomeApply> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    let prepared = state
        .device_connection
        .prepare_home_backup(&saved.tv.host, &saved.tv.identity_sha256)
        .await?;
    let invalid_backup = || {
        AppError::new(
            "invalid_response",
            "The TV backend could not verify the original Home backup.",
        )
    };
    if prepared.id != id
        || !valid_identity(&prepared.backup_sha256)
        || prepared.captured_at.is_empty()
    {
        return Err(invalid_backup());
    }
    Ok(prepared)
}

pub async fn apply_native_home(
    state: &AppState,
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
    let saved = state.profiles.get(&id).await?;
    change_home(
        state,
        saved,
        super::home_control::Action::Apply,
        Some(&backup_sha256),
        None,
    )
    .await
}

pub async fn restore_home_backup(
    state: &AppState,
    id: String,
    captured_at: String,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    change_home(
        state,
        saved,
        super::home_control::Action::Restore,
        None,
        Some(&captured_at),
    )
    .await
}

async fn change_home(
    state: &AppState,
    saved: SavedTv,
    action: super::home_control::Action,
    digest: Option<&str>,
    captured_at: Option<&str>,
) -> AppResult<SavedTv> {
    let status = state
        .device_connection
        .change_home(
            &saved.tv.host,
            &saved.tv.identity_sha256,
            action,
            digest,
            captured_at,
        )
        .await
        .map_err(|error| {
            if matches!(
                error.code.as_str(),
                "backup_changed"
                    | "backup_unreadable"
                    | "identity_mismatch"
                    | "root_state_changed"
                    | "root_recovery_unavailable"
                    | "connection_timeout"
            ) {
                error
            } else {
                AppError::new(
                    if action == super::home_control::Action::Apply {
                        "apply_failed"
                    } else {
                        "restore_failed"
                    },
                    &error.message,
                )
            }
        })?;
    use super::home_protocol::{AUTOSTART_KEY, HOME_KEY, STARTUP_BACKUP_KEY, STARTUP_KEY};
    let settings = &status["home"]["settings"];
    let app = |key: &str| settings[key]["value"].as_str().map(str::to_owned);
    let native = NativeHomeSettings {
        home_button_app: status["home"]["main_operation"]["value"]
            .as_str()
            .map(str::to_owned),
        home_app: app(HOME_KEY),
        startup_app: app(STARTUP_KEY),
        startup_backup_app: app(STARTUP_BACKUP_KEY),
        smart_hub_autostart: settings[AUTOSTART_KEY]["value"]
            .as_i64()
            .map(|value| value != 0),
    };
    let routing = if status["launcher"]["installed"] == true {
        serde_json::from_value(status["watcher"]["control"]["mode"].clone()).ok()
    } else {
        None
    };
    let backup = state.home_backups.summary(&saved.tv.identity_sha256).await;
    state
        .profiles
        .save(VerifiedTv {
            home_routing_mode: routing,
            native_home_settings: Some(native),
            home_backup: Some(backup),
            checked_at: super::home_control::now(),
            ..saved.tv
        })
        .await
}
