use super::{
    button_rules::{self, BUTTON_PROTOCOL_VERSION},
    json::truthy,
    root_bridge::{self, ButtonEdit},
    root_pairing,
    text::{case_fold, display_text},
    tv_session,
};
use crate::models::{
    AppError, AppResult, ButtonAssignment, ButtonChange, ButtonChangeResult, ButtonInventoryChange,
    ButtonMode, RootPhase, TvButtonMapping, LAUNCHER_APP_ID,
};
use serde_json::Value;
use std::path::PathBuf;

const MAX_LEGACY_LABEL_BYTES: usize = 24;
const MAX_ERROR_CHARACTERS: usize = 256;
const UNVERIFIED_MESSAGE: &str =
    "The TV could not confirm the change. Refresh Button mapping to check the current assignment.";

fn unverified() -> AppError {
    AppError::new("button_change_unverified", UNVERIFIED_MESSAGE)
}

fn validate(change: &ButtonChange) -> AppResult<()> {
    let (label, replacement, app_id) = match change {
        ButtonChange::Assignment(ButtonAssignment::App { button, app_id }) => {
            (button, None, Some(app_id))
        }
        ButtonChange::Assignment(
            ButtonAssignment::Default { button } | ButtonAssignment::Disabled { button },
        )
        | ButtonChange::Inventory(ButtonInventoryChange::Learn { button }) => (button, None, None),
        ButtonChange::Inventory(ButtonInventoryChange::Rename { button, new_name }) => {
            (button, Some(new_name), None)
        }
        ButtonChange::Inventory(ButtonInventoryChange::Reset {}) => return Ok(()),
    };
    if !button_rules::valid_label(label)
        || replacement.is_some_and(|value| !button_rules::valid_label(value))
    {
        return Err(AppError::new(
            "invalid_request",
            "Use a single-line button name of up to 48 characters.",
        ));
    }
    if app_id.is_some_and(|value| !button_rules::valid_app_id(value)) {
        return Err(AppError::new("invalid_request", "Choose an installed app."));
    }
    Ok(())
}

fn prepare(change: &ButtonChange, capabilities: &Value) -> AppResult<ButtonEdit> {
    let update = |message| AppError::new("helper_update_required", message);
    if capabilities["buttons_protocol"].as_u64() != Some(BUTTON_PROTOCOL_VERSION) {
        return Err(update("Update root access to change app buttons."));
    }
    let label = |button: &str| -> AppResult<String> {
        if truthy(&capabilities["buttons_friendly_names"]) {
            return Ok(button.into());
        }
        let legacy = button.to_lowercase();
        if legacy.len() > MAX_LEGACY_LABEL_BYTES
            || legacy
                .as_bytes()
                .first()
                .is_none_or(|byte| !byte.is_ascii_lowercase())
            || !legacy
                .bytes()
                .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        {
            return Err(update("Update root access to use this button name."));
        }
        Ok(legacy)
    };
    Ok(match change {
        ButtonChange::Assignment(ButtonAssignment::App { button, app_id }) => ButtonEdit::Map {
            button: label(button)?,
            app_id: app_id.clone(),
        },
        ButtonChange::Assignment(ButtonAssignment::Disabled { button }) => ButtonEdit::Disable {
            button: label(button)?,
        },
        ButtonChange::Assignment(ButtonAssignment::Default { button }) => ButtonEdit::Unmap {
            button: label(button)?,
        },
        ButtonChange::Inventory(ButtonInventoryChange::Learn { button }) => ButtonEdit::Learn {
            button: label(button)?,
        },
        ButtonChange::Inventory(ButtonInventoryChange::Reset {}) => ButtonEdit::Reset,
        ButtonChange::Inventory(ButtonInventoryChange::Rename { button, new_name }) => {
            if capabilities["buttons_rename"] != true {
                return Err(update("Update root access to rename app buttons."));
            }
            ButtonEdit::Rename {
                button: label(button)?,
                new_name: new_name.clone(),
            }
        }
    })
}

fn verified_change(change: &ButtonChange, status: &Value) -> AppResult<ButtonChangeResult> {
    if truthy(&status["error"]) {
        return Err(AppError::new(
            "button_change_failed",
            &display_text(status.get("error"), MAX_ERROR_CHARACTERS)
                .unwrap_or_else(|| UNVERIFIED_MESSAGE.into()),
        ));
    }
    if truthy(&status["preview"]) {
        return Err(unverified());
    }
    if matches!(
        change,
        ButtonChange::Inventory(ButtonInventoryChange::Reset {})
    ) {
        return if status["rules"].as_array().is_some_and(Vec::is_empty) {
            Ok(ButtonChangeResult::Inventory(true))
        } else {
            Err(unverified())
        };
    }
    let buttons = button_rules::rows(status)?;
    let confirmed = match change {
        ButtonChange::Inventory(ButtonInventoryChange::Learn { button }) => {
            buttons.iter().any(|row| {
                case_fold(&row.button) == case_fold(button) && row.mode == ButtonMode::Default
            })
        }
        ButtonChange::Inventory(ButtonInventoryChange::Rename { button, new_name }) => {
            buttons.iter().any(|row| row.button == *new_name)
                && (case_fold(button) == case_fold(new_name)
                    || !buttons
                        .iter()
                        .any(|row| case_fold(&row.button) == case_fold(button)))
        }
        ButtonChange::Assignment(assignment) => {
            return verified_assignment(assignment, buttons).map(ButtonChangeResult::Mapping);
        }
        ButtonChange::Inventory(ButtonInventoryChange::Reset {}) => false,
    };
    if confirmed {
        Ok(ButtonChangeResult::Inventory(true))
    } else {
        Err(unverified())
    }
}

fn verified_assignment(
    assignment: &ButtonAssignment,
    mut buttons: Vec<TvButtonMapping>,
) -> AppResult<TvButtonMapping> {
    let (label, mode, app_id) = match assignment {
        ButtonAssignment::App { button, app_id } => (button, ButtonMode::App, Some(app_id.clone())),
        ButtonAssignment::Disabled { button } => (button, ButtonMode::Disabled, None),
        ButtonAssignment::Default { button } => (button, ButtonMode::Default, None),
    };
    let mut saved = if let Some(index) = buttons
        .iter()
        .position(|row| case_fold(&row.button) == case_fold(label))
    {
        buttons.swap_remove(index)
    } else if mode == ButtonMode::Default {
        TvButtonMapping {
            button: label.clone(),
            mode: ButtonMode::Default,
            app_id: None,
            app_name: None,
            active: false,
        }
    } else {
        return Err(unverified());
    };
    if saved.mode != mode || saved.app_id != app_id {
        return Err(unverified());
    }
    saved.button = label.clone();
    saved.app_name = saved
        .app_id
        .as_deref()
        .filter(|id| *id == LAUNCHER_APP_ID)
        .map(|_| "AeroTizen".into());
    Ok(saved)
}

pub struct ButtonEdits {
    directory: PathBuf,
}

impl ButtonEdits {
    pub fn new(directory: PathBuf) -> Self {
        Self { directory }
    }

    pub async fn change(
        &self,
        host: &str,
        expected: &str,
        change: &ButtonChange,
    ) -> AppResult<ButtonChangeResult> {
        validate(change)?;
        let address = root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected).await?;
        let receipt = before.as_ref().filter(|receipt| receipt.phase == RootPhase::Active).ok_or_else(|| AppError::new(
            "pairing_required", "Complete root access setup and verify the connection before changing buttons."))?;
        let _ownership = tv_session::acquire(&self.directory, host).await?;
        let locked = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), locked.as_ref())?;
        let capabilities = root_bridge::status(address, &receipt.pairing)
            .await
            .map_err(|_| unverified())?;
        let edit = prepare(change, &capabilities)?;
        // Recheck after capabilities, before the only request that can change the TV.
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), current.as_ref())?;
        let reply = root_bridge::edit_button(address, &receipt.pairing, &edit)
            .await
            .map_err(|_| unverified())?;
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), current.as_ref())?;
        if capabilities["boot_id"] != reply["boot_id"] {
            return Err(unverified());
        }
        verified_change(change, &reply["buttons"])
    }
}

#[cfg(test)]
mod tests;
