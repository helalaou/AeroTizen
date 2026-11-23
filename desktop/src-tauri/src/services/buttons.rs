use super::reads::read_tv;
use crate::{
    models::{
        AppResult, ButtonChange, ButtonChangeResult, ButtonMappings, ButtonTargetApp,
        LAUNCHER_APP_ID,
    },
    state::{busy, AppState},
};

pub async fn list_tv_buttons(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<ButtonMappings> {
    let mappings =
        super::reads::read_native_tv(state, id.clone(), request_id.clone(), |saved| async move {
            state
                .button_reads
                .read(&saved.tv.host, &saved.tv.identity_sha256)
                .await
        })
        .await?;
    // Release native ownership before the existing SDK lookup takes the same TV lock.
    // Its cancellation waits for the frozen worker to stop before another page can read.
    with_app_names(mappings, || {
        read_tv(state, "list_button_apps", id, request_id)
    })
    .await
}

async fn with_app_names<Query, Pending>(
    mut mappings: ButtonMappings,
    query: Query,
) -> AppResult<ButtonMappings>
where
    Query: FnOnce() -> Pending,
    Pending: std::future::Future<Output = AppResult<Vec<ButtonTargetApp>>>,
{
    if let ButtonMappings::Ready { buttons, .. } = &mut mappings {
        let needs_names = buttons.iter().any(|button| {
            button
                .app_id
                .as_ref()
                .is_some_and(|id| id != LAUNCHER_APP_ID)
        });
        let names = if needs_names {
            match query().await {
                Ok(names) => names,
                Err(error) if error.code == "connection_failed" => Vec::new(),
                Err(error) => return Err(error),
            }
        } else {
            Vec::new()
        };
        for button in buttons {
            button.app_name = button.app_id.as_ref().and_then(|id| {
                names
                    .iter()
                    .find(|app| &app.id == id)
                    .map(|app| app.name.clone())
                    .or_else(|| (id == LAUNCHER_APP_ID).then(|| "AeroTizen".into()))
            });
        }
    }
    Ok(mappings)
}

pub async fn list_tv_button_apps(
    state: &AppState,
    id: String,
    request_id: String,
) -> AppResult<Vec<ButtonTargetApp>> {
    read_tv(state, "list_button_apps", id, request_id).await
}

#[cfg(test)]
mod tests;

pub async fn change_tv_button(
    state: &AppState,
    id: String,
    change: ButtonChange,
) -> AppResult<ButtonChangeResult> {
    let _guard = state.operation.try_lock().map_err(|_| busy())?;
    let saved = state.profiles.get(&id).await?;
    state
        .button_edits
        .change(&saved.tv.host, &saved.tv.identity_sha256, &change)
        .await
}
