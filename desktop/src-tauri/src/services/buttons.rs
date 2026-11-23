use super::reads::read_tv;
use crate::{
    models::{
        AppError, AppResult, ButtonChange, ButtonChangeResult, ButtonMappings, ButtonTargetApp,
    },
    state::{busy, AppState},
    worker,
};
use serde_json::json;

pub async fn list_tv_buttons(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<ButtonMappings> {
    read_tv(state, "list_buttons", id, request_id).await
}

pub async fn list_tv_button_apps(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<Vec<ButtonTargetApp>> {
    read_tv(state, "list_button_apps", id, request_id).await
}

pub async fn change_tv_button(
    state: &AppState,
    id: String,
    change: ButtonChange,
) -> AppResult<ButtonChangeResult> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    let result = worker::request(
        &state.worker_path,
        "change_button",
        json!({
            "host": saved.tv.host,
            "expected_identity": saved.tv.identity_sha256,
            "change": change,
        }),
    )
    .await?;
    match (&change, &result) {
        (ButtonChange::Assignment(_), ButtonChangeResult::Mapping(_))
        | (ButtonChange::Inventory(_), ButtonChangeResult::Inventory(true)) => Ok(result),
        _ => Err(AppError::new(
            "invalid_response",
            "The TV backend did not verify the button change.",
        )),
    }
}
