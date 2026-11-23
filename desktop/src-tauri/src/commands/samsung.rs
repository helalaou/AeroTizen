use crate::services::samsung::Account;
use crate::{
    models::{AppResult, SigningProfile},
    services,
    state::AppState,
};

#[tauri::command]
pub async fn samsung_account(state: tauri::State<'_, AppState>) -> AppResult<Option<Account>> {
    services::samsung::samsung_account(&state).await
}

#[tauri::command]
pub async fn samsung_sign_in<R: tauri::Runtime>(
    app: tauri::AppHandle<R>,
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> AppResult<Account> {
    use tauri_plugin_opener::OpenerExt;
    services::samsung::samsung_sign_in(&state, request_id, move |url| async move {
        tokio::task::spawn_blocking(move || app.opener().open_url(url, None::<&str>))
            .await
            .is_ok_and(|result| result.is_ok())
    })
    .await
}

#[tauri::command]
pub async fn cancel_samsung_sign_in(
    state: tauri::State<'_, AppState>,
    request_id: String,
) -> AppResult<()> {
    services::samsung::cancel_samsung_sign_in(&state, request_id).await
}

#[tauri::command]
pub async fn samsung_sign_out(state: tauri::State<'_, AppState>) -> AppResult<()> {
    services::samsung::samsung_sign_out(&state).await
}

#[tauri::command]
pub async fn prepare_signing_profile(
    state: tauri::State<'_, AppState>,
    id: String,
) -> AppResult<SigningProfile> {
    services::samsung::prepare_signing_profile(&state, id).await
}
