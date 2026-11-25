//! Native Home query schema and setting identifiers shared with backup/control owners.
use crate::models::{
    AppError, AppResult, BootEligibility, HomeEligibilityEvidence, LAUNCHER_APP_ID,
};
use serde_json::{json, Value};
pub(super) const MAIN_OPERATION: &str = "http://tizen.org/appcontrol/operation/main";
pub(super) const HOME_KEY: &str = "db/appfw/home_appid";
pub(super) const STARTUP_KEY: &str = "db/appfw/startup_appid";
pub(super) const STARTUP_BACKUP_KEY: &str = "db/appfw/booting_appid_backup";
pub(super) const FIRST_SCREEN_KEY: &str = "db/first_screen/type";
pub(super) const AUTOSTART_KEY: &str = "db/menu/smart_hub/ontvsetting/auto_start";
pub(super) const SETTING_COUNT: usize = 5;
pub(super) const SETTINGS: [(&str, &str); SETTING_COUNT] = [
    (HOME_KEY, "string"),
    (STARTUP_KEY, "string"),
    (STARTUP_BACKUP_KEY, "string"),
    (FIRST_SCREEN_KEY, "string"),
    (AUTOSTART_KEY, "int"),
];
const QUERY_PREFIX: &str = "AEROTIZEN_HOME_QUERY=";
const ELIGIBILITY_PREFIX: &str = "AEROTIZEN_HOME_ELIGIBILITY=";
pub(super) const ELIGIBILITY_ARGUMENT: &str = "--eligibility";
pub(super) fn failed(message: &str) -> AppError {
    AppError::new("home_unavailable", message)
}

pub(super) fn compatibility_error_code(message: &str) -> Option<&'static str> {
    for (prefix, code) in [
        (
            "Installed AeroTizen is not eligible for native Home.",
            "home_eligibility_rejected",
        ),
        (
            "Native Home compatibility check failed: required library is unavailable:",
            "home_library_unavailable",
        ),
        (
            "Native Home compatibility check failed: required function is unavailable:",
            "home_entrypoint_unavailable",
        ),
    ] {
        if message.starts_with(prefix) || message == code {
            return Some(code);
        }
    }
    None
}

fn invalid() -> AppError {
    AppError::new(
        "home_query_invalid",
        "The TV returned invalid Home settings. Check its current settings before retrying.",
    )
}
fn nonempty(value: &Value) -> bool {
    value.as_str().is_some_and(|value| !value.is_empty())
}
fn typed(value: &Value, kind: &str) -> bool {
    value["type"] == kind
        && match value["status"].as_str() {
            Some("ok") => {
                if kind == "string" {
                    value["value"].is_string()
                } else {
                    value["value"].is_i64() || value["value"].is_u64()
                }
            }
            Some("unavailable") => value["value"].is_null() && value["error"].is_string(),
            _ => false,
        }
}
fn document(output: &str, prefix: &str) -> AppResult<Value> {
    let records: Vec<_> = output
        .lines()
        .filter_map(|line| line.strip_prefix(prefix))
        .collect();
    if records.len() != 1
        || output
            .lines()
            .filter(|line| *line == super::sdk::CLEANUP_MARKER)
            .count()
            != 1
    {
        return Err(invalid());
    }
    let document: Value = serde_json::from_str(records[0]).map_err(|_| invalid())?;
    if document["schema_version"].as_u64() != Some(1)
        || document["read_only"] != true
        || document["uid"].as_u64() != Some(901)
    {
        return Err(invalid());
    }
    Ok(document)
}

pub(super) fn launcher_eligibility(output: &str) -> AppResult<HomeEligibilityEvidence> {
    let document = document(output, ELIGIBILITY_PREFIX)?;
    let fields = &document["eligibility"];
    if fields.get("launcher_registered").is_none() || fields.get("boot_check_value").is_none() {
        return Err(invalid());
    }
    let evidence: HomeEligibilityEvidence =
        serde_json::from_value(fields.clone()).map_err(|_| invalid())?;
    if (evidence.boot_check == BootEligibility::NotRun) == evidence.package_directory_visible
        || (evidence.boot_check == BootEligibility::Returned) != evidence.boot_check_value.is_some()
    {
        return Err(invalid());
    }
    Ok(evidence)
}

pub(super) fn query(output: &str) -> AppResult<Value> {
    let document = document(output, QUERY_PREFIX)?;
    if document["architecture_bits"].as_u64() != Some(32)
        || document["os_release"]["ID"] != "tizen"
        || !nonempty(&document["os_release"]["BUILD_ID"])
        || !nonempty(&document["os_release"]["VERSION_ID"])
        || document["settings"]
            .as_object()
            .is_none_or(|settings| settings.len() != SETTING_COUNT)
        || !typed(&document["main_operation"], "string")
        || SETTINGS
            .iter()
            .any(|(key, kind)| !typed(&document["settings"][key], kind))
        || !matches!(
            document["watcher"]["state"].as_str(),
            Some("active" | "paused" | "unknown" | "native" | "handoff" | "blocked")
        )
        || !document["watcher"]["reachable"].is_boolean()
    {
        return Err(invalid());
    }
    let launcher = &document["launcher"];
    if !launcher.is_object()
        || (!launcher["installed"].is_boolean()
            && !(launcher["installed"].is_null() && launcher["error"].is_string()))
    {
        return Err(invalid());
    }
    let diagnostic = &document["watcher"]["error"];
    if !diagnostic.is_null()
        && (!diagnostic.is_object()
            || !matches!(
                diagnostic["code"].as_str(),
                Some(
                    "timeout"
                        | "connection_error"
                        | "http_error"
                        | "invalid_response"
                        | "query_error"
                )
            )
            || !nonempty(&diagnostic["message"])
            || diagnostic.get("http_status").is_some_and(|value| {
                value
                    .as_u64()
                    .is_none_or(|status| !(100..=599).contains(&status))
            })
            || diagnostic
                .get("socket_error")
                .is_some_and(|value| !value.is_string()))
    {
        return Err(invalid());
    }
    if let Some(boot) = document.get("boot").filter(|value| !value.is_null()) {
        let id = boot["id"].as_str().ok_or_else(invalid)?;
        if uuid::Uuid::parse_str(id)
            .map(|uuid| uuid.to_string() != id)
            .unwrap_or(true)
            || boot["uptime_seconds"]
                .as_f64()
                .is_none_or(|number| !number.is_finite() || number < 0.0)
        {
            return Err(invalid());
        }
    }
    Ok(document)
}
pub(super) fn status(
    query: Value,
    identity: &str,
    info: &Value,
    cpu: Option<&str>,
    helper: &str,
) -> Value {
    let main = &query["main_operation"];
    let settings = &query["settings"];
    let assigned = &settings[HOME_KEY];
    let mode = if main["status"] != "ok" || assigned["status"] != "ok" {
        "unknown"
    } else if main["value"] != assigned["value"] {
        "inconsistent"
    } else if assigned["value"] == LAUNCHER_APP_ID {
        "native"
    } else if assigned["value"] == "com.samsung.tv.csfs" {
        "stock"
    } else {
        "custom"
    };
    let complete = main["status"] == "ok"
        && SETTINGS
            .iter()
            .all(|(key, _)| settings[key]["status"] == "ok");
    json!({"schema_version":1,"complete":complete,"queried_at":super::home_control::now(),
        "device":{"identity_sha256":identity,"model":info["modelName"],"platform":info["model"],"cpu_arch":cpu,"os_version":query["os_release"]["VERSION_ID"],"firmware_build":query["os_release"]["BUILD_ID"]},
        "home":{"operation":MAIN_OPERATION,"main_operation":main,"settings":settings,"mode":mode},"watcher":query["watcher"],"launcher":query["launcher"],"boot":query.get("boot"),
        "evidence":{"access":"sdk_uid_901","uid":901,"authenticated":true,"sdk_staging_cleaned":true,"query_staging_cleaned":true,"helper_sha256":helper}})
}
