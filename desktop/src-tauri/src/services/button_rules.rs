use crate::models::{AppError, AppResult, ButtonMappings, ButtonMode, TvButtonMapping};
use crate::services::{
    json::truthy,
    text::{case_fold, display_text, python_whitespace},
};
use serde_json::Value;
use std::collections::BTreeMap;
use unicode_general_category::{get_general_category, GeneralCategory};

pub(super) const BUTTON_PROTOCOL_VERSION: u64 = 1;
const MAX_BUTTON_UTF16_UNITS: usize = 48;
const MAX_APP_ID_CHARACTERS: usize = 120;
const MAX_DETAIL_CHARACTERS: usize = 256;
const DISCOVERY_UPDATE_MESSAGE: &str =
    "Update the TV helper to discover app buttons automatically.";

fn invalid() -> AppError {
    AppError::new(
        "invalid_response",
        "The TV returned an unsupported response.",
    )
}

pub(super) fn valid_label(value: &str) -> bool {
    !value.is_empty()
        && value.trim_matches(python_whitespace) == value
        && value.encode_utf16().count() <= MAX_BUTTON_UTF16_UNITS
        && !value.chars().any(|character| {
            matches!(
                get_general_category(character),
                GeneralCategory::Control
                    | GeneralCategory::Surrogate
                    | GeneralCategory::LineSeparator
                    | GeneralCategory::ParagraphSeparator
            )
        })
}

pub(super) fn valid_app_id(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_APP_ID_CHARACTERS
        && value.as_bytes()[0].is_ascii_alphanumeric()
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_.-".contains(&byte))
}

pub(super) fn rows(status: &Value) -> AppResult<Vec<TvButtonMapping>> {
    if truthy(&status["error"]) {
        return Err(AppError::new(
            "button_rules_unreadable",
            "The saved button assignments could not be read.",
        ));
    }
    let mut rows = BTreeMap::new();
    for rule in status["rules"].as_array().ok_or_else(invalid)? {
        let label = rule["button"]
            .as_str()
            .filter(|value| valid_label(value))
            .ok_or_else(invalid)?;
        let mode: ButtonMode =
            serde_json::from_value(rule["mode"].clone()).map_err(|_| invalid())?;
        let active = rule["active"].as_bool().ok_or_else(invalid)?;
        let app_id = if matches!(mode, ButtonMode::App) {
            Some(
                rule["app_id"]
                    .as_str()
                    .filter(|value| valid_app_id(value))
                    .ok_or_else(invalid)?
                    .into(),
            )
        } else {
            None
        };
        let active = !matches!(mode, ButtonMode::Default) && active;
        rows.insert(
            case_fold(label),
            TvButtonMapping {
                button: label.into(),
                mode,
                app_id,
                app_name: None,
                active,
            },
        );
    }
    if truthy(&status["discovered"]) {
        for discovered in status["discovered"].as_array().ok_or_else(invalid)? {
            let label = discovered.get("button").ok_or_else(invalid)?;
            if let Some(label) = label.as_str().filter(|label| valid_label(label)) {
                rows.entry(case_fold(label))
                    .or_insert_with(|| TvButtonMapping {
                        button: label.into(),
                        mode: ButtonMode::Default,
                        app_id: None,
                        app_name: None,
                        active: false,
                    });
            }
        }
    }
    Ok(rows.into_values().collect())
}

pub(super) fn mappings(status: &Value, discovery: bool) -> AppResult<ButtonMappings> {
    Ok(ButtonMappings::Ready {
        buttons: rows(status)?,
        discovery_detail: if discovery {
            display_text(status.get("discovery_detail"), MAX_DETAIL_CHARACTERS)
        } else {
            Some(DISCOVERY_UPDATE_MESSAGE.into())
        },
    })
}

#[cfg(test)]
mod tests;
