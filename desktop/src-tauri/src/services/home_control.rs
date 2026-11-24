//! Guarded Home writes with immutable originals and durable, receipt-bound recovery.
mod recovery;
use super::{
    durable_json,
    home_backups::Original,
    home_protocol::*,
    sdk::{Completion, PayloadFile},
};
use crate::models::{AppError, AppResult, LAUNCHER_APP_ID};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::time::{Duration, SystemTime};
use tokio::time::{sleep, Instant};
const MAX_RECEIPT_BYTES: u64 = 2 * 1024 * 1024;
const START_TIMEOUT: Duration = Duration::from_secs(15);
const POLL_INTERVAL: Duration = Duration::from_secs(1);
const TRANSACTION_BYTES: usize = 16;
const CONTROL_PREFIX: &str = "AEROTIZEN_HOME_CONTROL=";
#[derive(Clone, Copy, PartialEq)]
pub(super) enum Action {
    Apply,
    Restore,
}
impl Action {
    pub fn name(self) -> &'static str {
        match self {
            Self::Apply => "apply",
            Self::Restore => "restore",
        }
    }
}
pub(super) trait Device {
    async fn status(&mut self) -> AppResult<Value>;
    async fn start_launcher(&mut self) -> AppResult<()>;
    async fn write(&mut self, files: Vec<PayloadFile>) -> AppResult<Completion>;
}
pub(super) fn now() -> String {
    chrono::DateTime::<chrono::Utc>::from(SystemTime::now())
        .to_rfc3339_opts(chrono::SecondsFormat::Micros, false)
}
fn error(message: &str) -> AppError {
    failed(message)
}
fn preflight(status: &Value, original: &Value) -> AppResult<bool> {
    if status["complete"] != true {
        return Err(error("Incomplete Home settings. No write was attempted."));
    }
    for key in [
        "identity_sha256",
        "model",
        "firmware_build",
        "cpu_arch",
        "os_version",
    ] {
        // Getter-only paired baselines omit architecture/OS. Validate live runtime below;
        // compare every device field that this authenticated baseline actually records.
        if matches!(key, "cpu_arch" | "os_version")
            && original["evidence"]["access"] == "paired_helper"
            && original["device"].get(key).is_none()
        {
            continue;
        }
        if status["device"][key] != original["device"][key] {
            return Err(error(
                "The TV or firmware differs from the original backup. No write was attempted.",
            ));
        }
    }
    let evidence = &status["evidence"];
    if !matches!(
        status["device"]["cpu_arch"].as_str(),
        Some("arm" | "armv7" | "armv7l")
    ) || evidence["access"] != "sdk_uid_901"
        || evidence["uid"].as_u64() != Some(901)
        || [
            "authenticated",
            "sdk_staging_cleaned",
            "query_staging_cleaned",
        ]
        .iter()
        .any(|key| evidence[key] != true)
    {
        return Err(error(
            "A verified 32-bit SDK Home query is required. No write was attempted.",
        ));
    }
    if status["home"]["operation"] != MAIN_OPERATION
        || status["home"]["settings"]
            .as_object()
            .is_none_or(|settings| settings.len() != SETTING_COUNT)
    {
        return Err(error("Required Home settings are unavailable."));
    }
    let valid = |item: &Value, kind: &str| {
        item["type"] == kind
            && item["status"] == "ok"
            && if kind == "string" {
                item["value"]
                    .as_str()
                    .is_some_and(|value| !value.trim().is_empty())
            } else {
                matches!(item["value"].as_i64(), Some(0 | 1))
            }
    };
    if !valid(&status["home"]["main_operation"], "string")
        || SETTINGS
            .iter()
            .any(|(key, kind)| !valid(&status["home"]["settings"][key], kind))
    {
        return Err(error(
            "Required typed Home settings are unavailable or empty.",
        ));
    }
    status["launcher"]["installed"].as_bool().ok_or_else(|| {
        error("Could not confirm whether AeroTizen is installed. No write was attempted.")
    })
}
fn service(watcher: &Value) -> AppResult<()> {
    let control = &watcher["control"];
    if !watcher["error"].is_null()
        || !control.is_object()
        || control["protocol"].as_u64() != Some(1)
        || control["app_id"] != LAUNCHER_APP_ID
        || control["persistent"] != true
        || !matches!(
            control["mode"].as_str(),
            Some("watcher" | "native" | "hold")
        )
    {
        return Err(error("The Home control service is incompatible. Use a matching launcher and retry. No Home settings were changed."));
    }
    Ok(())
}
fn parse_result(native: &Completion, action: Action) -> AppResult<Value> {
    let records: Vec<_> = native
        .stdout
        .lines()
        .filter_map(|line| line.strip_prefix(CONTROL_PREFIX))
        .collect();
    let invalid =
        || error("Home control was not confirmed. Inspect the current settings before retrying.");
    if records.len() != 1 {
        return Err(invalid());
    }
    let document: Value = serde_json::from_str(records[0]).map_err(|_| invalid())?;
    let result = &document["result"];
    if document["schema_version"].as_u64() != Some(1)
        || document["uid"].as_u64() != Some(901)
        || document["action"] != action.name()
        || !result["Success"].is_boolean()
        || !result["RolledBack"].is_boolean()
        || result
            .get("StartupSettingsRestored")
            .is_some_and(|value| !value.is_boolean())
        || result["Success"] == true && result["RolledBack"] == true
        || !result["Error"].is_null() && !result["Error"].is_string()
        || result["Success"].as_bool() != Some(native.exit_code == 0)
    {
        return Err(invalid());
    }
    Ok(result.clone())
}
fn verify_final(
    final_status: &Value,
    original: &Value,
    action: Action,
    result: &Value,
    installed: bool,
) -> AppResult<()> {
    let expected = if action == Action::Apply {
        json!(LAUNCHER_APP_ID)
    } else {
        original["home"]["default_app"].clone()
    };
    let mut settings = original["home"]["settings"].clone();
    if action == Action::Apply {
        settings[HOME_KEY]["value"] = json!(LAUNCHER_APP_ID);
        if result["StartupSettingsRestored"] != true {
            for key in [STARTUP_KEY, STARTUP_BACKUP_KEY] {
                settings[key]["value"] = json!(LAUNCHER_APP_ID);
            }
            settings[AUTOSTART_KEY]["value"] = json!(1);
        }
    }
    let observed:serde_json::Map<_,_>=SETTINGS.iter().map(|(key,_)|((*key).into(),json!({"type":final_status["home"]["settings"][key]["type"],"value":final_status["home"]["settings"][key]["value"]}))).collect();
    let control = &final_status["watcher"]["control"];
    let watcher = if installed {
        control["mode"]
            == if action == Action::Apply {
                "native"
            } else {
                "watcher"
            }
            && control["protocol"].as_u64() == Some(1)
            && control["app_id"] == LAUNCHER_APP_ID
            && control["persistent"] == true
    } else {
        final_status["watcher"]["reachable"] == false
    };
    if final_status["complete"] != true
        || final_status["device"]["identity_sha256"] != original["device"]["identity_sha256"]
        || final_status["home"]["main_operation"]["value"] != expected
        || Value::Object(observed) != settings
        || final_status["launcher"]["installed"].as_bool() != Some(installed)
        || !watcher
    {
        return Err(error("The writer completed, but final Home and startup verification failed. Inspect the current settings before retrying."));
    }
    Ok(())
}
pub(super) async fn change(
    device: &mut impl Device,
    original: Original,
    action: Action,
    mut files: Vec<PayloadFile>,
) -> AppResult<Value> {
    let mut status = device.status().await?;
    let installed = preflight(&status, &original.document)?;
    if !installed && (action == Action::Apply || status["watcher"]["reachable"] == true) {
        return Err(error("Apply requires an installed launcher. An unexpected running service also blocks restore."));
    }
    original.unchanged().await?;
    if installed && status["watcher"]["reachable"] != true {
        if action != Action::Apply {
            return Err(error(
                "Open AeroTizen on the TV, then retry Restore. Its control service is unavailable.",
            ));
        }
        device.start_launcher().await?;
        let deadline = Instant::now() + START_TIMEOUT;
        loop {
            if Instant::now() >= deadline {
                return Err(error("AeroTizen's Home control service did not become ready. No Home settings were changed."));
            }
            status = device.status().await?;
            if !preflight(&status, &original.document)? {
                return Err(error(
                    "The launcher installation changed during startup. No write was attempted.",
                ));
            }
            if Instant::now() >= deadline {
                return Err(error("AeroTizen's Home control service did not become ready. No Home settings were changed."));
            }
            if status["watcher"]["reachable"] == true {
                service(&status["watcher"])?;
                break;
            }
            sleep(POLL_INTERVAL.min(deadline.saturating_duration_since(Instant::now()))).await;
        }
        original.unchanged().await?;
    }
    if installed && action == Action::Apply {
        service(&status["watcher"])?;
    }
    let mut token = [0; TRANSACTION_BYTES];
    getrandom::fill(&mut token).map_err(|_| error("Could not create a Home transaction."))?;
    let token: String = token.iter().map(|byte| format!("{byte:02x}")).collect();
    let mut request = json!({"schema_version":1,"action":action.name(),"transaction":token,"baseline_sha256":original.digest,"baseline_base64":STANDARD.encode(&original.raw)});
    if action == Action::Apply {
        request["boot"] = json!(true);
    } else {
        if !installed {
            request["launcher_absent"] = json!(true);
        }
        let recovery = recovery::request(&status, &original, installed).await?;
        if let Some((key, value)) = recovery {
            request[key] = value;
        }
    }
    let path = original
        .path
        .parent()
        .ok_or_else(|| error("The backup folder is unavailable."))?
        .join("transactions")
        .join(format!("{token}.json"));
    let helper = files
        .iter()
        .find(|file| file.name == super::helper_payloads::CONTROL_ENTRYPOINT)
        .ok_or_else(|| error("The Home writer payload is unavailable."))?;
    let mut receipt = json!({"schema_version":1,"created_at":now(),"backup_path":original.path.to_string_lossy(),"request":request,"state":"pending","helper_sha256":super::digest::sha256_hex(&helper.bytes)});
    original.unchanged().await?;
    durable_json::write(path.clone(), receipt.clone(), true, MAX_RECEIPT_BYTES).await?;
    let operation = async {
        files.push(PayloadFile {
            name: "request.json".into(),
            bytes: serde_json::to_vec(&request)
                .map_err(|_| error("Could not prepare the Home request."))?,
        });
        let native = device.write(files).await?;
        receipt["transport"] =
            serde_json::to_value(&native).map_err(|_| error("Could not save the Home result."))?;
        durable_json::write(path.clone(), receipt.clone(), false, MAX_RECEIPT_BYTES).await?;
        let result = parse_result(&native, action)?;
        receipt["native_result"] = result.clone();
        receipt["state"] = json!(if result["Success"] == true {
            if action == Action::Apply {
                "applied"
            } else {
                "restored"
            }
        } else if result["RolledBack"] == true {
            "rolled_back"
        } else {
            "failed"
        });
        durable_json::write(path.clone(), receipt.clone(), false, MAX_RECEIPT_BYTES).await?;
        if result["Success"] != true {
            return Err(error(result["Error"].as_str().unwrap_or(
                "Home control failed. Refresh the current settings before retrying.",
            )));
        }
        let final_status = device.status().await?;
        verify_final(
            &final_status,
            &original.document,
            action,
            &result,
            installed,
        )?;
        original.unchanged().await?;
        receipt["state"] = json!(if action == Action::Apply {
            "applied_verified"
        } else {
            "restored_verified"
        });
        durable_json::write(path.clone(), receipt.clone(), false, MAX_RECEIPT_BYTES).await?;
        Ok(final_status)
    }
    .await;
    if let Err(failure) = &operation {
        receipt["error"] = json!(failure.message);
        durable_json::write(path, receipt, false, MAX_RECEIPT_BYTES).await?;
    }
    operation
}
#[cfg(test)]
mod tests;
