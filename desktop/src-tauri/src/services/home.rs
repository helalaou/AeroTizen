use crate::{
    models::{
        valid_identity, AppError, AppResult, HomeBackupSettings, PreparedHomeApply, SavedTv,
        VerifiedTv,
    },
    state::{busy, AppState},
    worker,
};
use serde_json::json;

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
    let prepared: PreparedHomeApply = worker::request(
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
    let tv: VerifiedTv = worker::request(
        &state.worker_path,
        "apply_native_home",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "backup_sha256": backup_sha256,
        }),
    )
    .await?;
    if tv.host != saved.tv.host || tv.identity_sha256 != saved.tv.identity_sha256 {
        return Err(AppError::new(
            "identity_mismatch",
            "The TV check returned a different address or identity.",
        ));
    }
    state.profiles.save(tv).await
}

pub async fn restore_home_backup(
    state: &AppState,
    id: String,
    captured_at: String,
) -> AppResult<SavedTv> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    let tv: VerifiedTv = worker::request(
        &state.worker_path,
        "restore_home_backup",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "captured_at": captured_at,
        }),
    )
    .await?;
    if tv.host != saved.tv.host || tv.identity_sha256 != saved.tv.identity_sha256 {
        return Err(AppError::new(
            "identity_mismatch",
            "The TV check returned a different address or identity.",
        ));
    }
    state.profiles.save(tv).await
}
