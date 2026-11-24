use crate::models::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::{collections::HashMap, sync::LazyLock};

const MAX_ACTIVITY_BYTES: usize = 128 * 1024;
const MAX_ACTIVITY_ENTRIES: usize = 250;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct Catalog {
    actions: HashMap<String, String>,
    outcomes: HashMap<String, String>,
    error_codes: Vec<String>,
}

static CATALOG: LazyLock<Catalog> = LazyLock::new(|| {
    serde_json::from_str(include_str!(
        "../../../../src/services/desktopLogCatalog.json"
    ))
    .expect("invalid desktop log catalog")
});

#[derive(Deserialize, Serialize)]
pub struct Event {
    id: u64,
    timestamp: String,
    action: String,
    outcome: String,
    #[serde(rename(deserialize = "durationMs"))]
    duration_ms: Option<u64>,
    code: Option<String>,
}

pub fn parse(contents: &str) -> AppResult<Vec<Event>> {
    let invalid = || {
        AppError::new(
            "invalid_log_export",
            "The desktop activity log is invalid or too large.",
        )
    };
    if contents.len() > MAX_ACTIVITY_BYTES {
        return Err(invalid());
    }
    let mut events: Vec<Event> = serde_json::from_str(contents).map_err(|_| invalid())?;
    if events.len() > MAX_ACTIVITY_ENTRIES {
        return Err(invalid());
    }
    events.retain_mut(|entry| {
        if !CATALOG.actions.contains_key(&entry.action)
            || !CATALOG.outcomes.contains_key(&entry.outcome)
            || entry.timestamp.len() > 40
        {
            return false;
        }
        let Ok(timestamp) = chrono::DateTime::parse_from_rfc3339(&entry.timestamp) else {
            return false;
        };
        entry.timestamp = timestamp.to_utc().to_rfc3339();
        if entry.outcome == "failed" {
            if entry
                .code
                .as_ref()
                .is_none_or(|code| !CATALOG.error_codes.contains(code))
            {
                entry.code = Some("request_failed".into());
            }
        } else {
            entry.code = None;
        }
        true
    });
    Ok(events)
}
