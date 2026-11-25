mod activity;
mod privacy;
use self::{activity::Event, privacy::Privacy};
use crate::{
    models::{AppError, AppResult, SavedTv, VerifiedTv},
    services::home_protocol::{MAIN_OPERATION, SETTINGS},
    state::AppState,
};
pub use activity::parse as parse_activity;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{self, ErrorKind, Write},
    path::Path,
    time::SystemTime,
};
use zip::{write::SimpleFileOptions, CompressionMethod, ZipWriter};

const REPORT_SCHEMA_VERSION: u32 = 1;
const PRIVACY_POLICY_VERSION: u32 = 2;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportOptions {
    pub simulator: bool,
    tv_id: Option<String>,
    include_tv: bool,
    include_home: bool,
}

#[derive(Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportResult {
    pub saved: bool,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    unavailable: Vec<&'static str>,
}

pub struct Bundle {
    report: Value,
    receipts: Vec<Value>,
    result: ExportResult,
}

fn not_requested() -> Value {
    json!({"state": "not_requested"})
}

fn unavailable(reason: &str) -> Value {
    json!({"state": "unavailable", "reason": reason})
}

fn timestamp() -> String {
    chrono::DateTime::<chrono::Utc>::from(SystemTime::now()).to_rfc3339()
}

fn setting(privacy: &mut Privacy, kind: &str, value: &Value) -> Value {
    let value = if kind == "int" {
        value
            .as_bool()
            .map(|state| json!(i32::from(state)))
            .unwrap_or(Value::Null)
    } else {
        privacy.app(value)
    };
    json!({"type": kind, "status": if value.is_null() {"unavailable"} else {"ok"}, "value": value})
}

fn home_snapshot(privacy: &mut Privacy, reply: &Value) -> Value {
    let Some(settings) = reply["home_settings"].as_object() else {
        return unavailable("home_snapshot_unavailable");
    };
    let mut projected = json!({});
    for ((key, kind), field) in SETTINGS.into_iter().zip([
        "home_app",
        "startup_app",
        "startup_backup_app",
        "first_screen",
        "smart_hub_autostart",
    ]) {
        projected[key] = setting(privacy, kind, settings.get(field).unwrap_or(&Value::Null));
    }
    let main = setting(
        privacy,
        "string",
        &reply["home_settings"]["home_button_app"],
    );
    let count = SETTINGS
        .iter()
        .filter(|(key, _)| projected[key]["status"] == "ok")
        .count()
        + usize::from(main["status"] == "ok");
    if count == 0 {
        return unavailable("home_snapshot_unavailable");
    }
    let complete = count == SETTINGS.len() + 1;
    json!({
        "state": if complete {"collected"} else {"partial"},
        "queried_at": timestamp(),
        "complete": complete,
        "home": {"operation": MAIN_OPERATION, "main_operation": main, "settings": projected},
        "platform": {"firmware_build": privacy.value("firmware", &reply["home_settings"]["firmware_build"])},
        "evidence": {"access": "paired_helper", "authenticated": true},
    })
}

fn environment(
    privacy: &mut Privacy,
    profile: Option<&VerifiedTv>,
    logs: &Value,
    home: &Value,
) -> Value {
    let Some(profile) = profile else {
        return not_requested();
    };
    let details = &profile.technical_details;
    let device = &logs["environment"];
    let mut launcher = logs["ui"]["build"]
        .as_object()
        .filter(|build| !build.is_empty())
        .map_or_else(
            || logs["build"].clone(),
            |build| Value::Object(build.clone()),
        );
    if !launcher.is_object() {
        launcher = json!({});
    }
    if launcher["version"].is_null() {
        launcher["version"] = privacy.value("version", &json!(profile.launcher_version));
    }
    let tizen = if device["tizen"].is_null() {
        privacy.value("tizen", &json!(details.tizen_version))
    } else {
        device["tizen"].clone()
    };
    let arch = if device["arch"].is_null() {
        privacy.value("arch", &json!(details.architecture))
    } else {
        device["arch"].clone()
    };
    let firmware = if !device["firmware"].is_null() {
        device["firmware"].clone()
    } else if !home["platform"]["firmware_build"].is_null() {
        home["platform"]["firmware_build"].clone()
    } else {
        privacy.value("firmware", &json!(details.firmware_build))
    };
    let model = privacy.value(
        "model",
        &json!(details.model_code.as_deref().unwrap_or(&profile.model)),
    );
    let state = if model.is_null() || tizen.is_null() || firmware.is_null() {
        "partial"
    } else {
        "collected"
    };
    json!({
        "state": state, "model": model, "tizen": tizen, "firmware": firmware, "arch": arch,
        "saved_profile_checked_at": privacy.value("queried_at", &json!(profile.checked_at)),
        "platform": privacy.value("platform", &json!(details.platform)), "launcher": launcher,
        "root_version": privacy.value("version", &json!(details.root_runtime_version)),
    })
}

fn build_identity() -> Option<String> {
    let mut executable = File::open(std::env::current_exe().ok()?).ok()?;
    let mut digest = Sha256::new();
    io::copy(&mut executable, &mut digest).ok()?;
    Some(format!("{:x}", digest.finalize()))
}

async fn collect_tv(
    state: &AppState,
    options: &ExportOptions,
    privacy: &mut Privacy,
) -> (Option<SavedTv>, Value, Value) {
    let mut tv = not_requested();
    let mut home = not_requested();
    if options.simulator {
        return (None, tv, home);
    }
    let profile = match &options.tv_id {
        Some(id) => state.profiles.get(id).await.ok(),
        None => None,
    };
    if !(options.include_tv || options.include_home) {
        return (profile, tv, home);
    }
    let reason = match (&profile, state.operation.try_lock()) {
        (Some(profile), Ok(_guard)) => {
            let host = &profile.tv.host;
            let identity = &profile.tv.identity_sha256;
            if options.include_tv {
                tv = match state
                    .device_connection
                    .diagnostic_logs(host, identity)
                    .await
                {
                    Ok(raw) => match privacy.tv_logs(&raw) {
                        Some(logs) => json!({"state": "collected", "logs": logs}),
                        None => unavailable("unsupported_tv_diagnostics"),
                    },
                    Err(_) => unavailable("tv_diagnostics_unavailable"),
                };
            }
            if options.include_home {
                home = match state
                    .device_connection
                    .diagnostic_home(host, identity)
                    .await
                {
                    Ok(Some(raw)) => home_snapshot(privacy, &raw),
                    Ok(None) => unavailable("paired_home_reader_required"),
                    Err(_) => unavailable("home_snapshot_unavailable"),
                };
            }
            None
        }
        (None, _) => Some("tv_profile_unavailable"),
        _ => Some("tv_busy"),
    };
    if let Some(reason) = reason {
        if options.include_tv {
            tv = unavailable(reason);
        }
        if options.include_home {
            home = unavailable(reason);
        }
    }
    (profile, tv, home)
}

pub async fn collect(state: &AppState, options: ExportOptions) -> Bundle {
    let mut privacy = Privacy::default();
    let (receipts, build) = if options.simulator {
        (Vec::new(), None)
    } else {
        let (raw, build) = tokio::join!(
            state.home_backups.diagnostic_receipts(None),
            tokio::task::spawn_blocking(build_identity),
        );
        (
            raw.iter().map(|receipt| privacy.receipt(receipt)).collect(),
            build.ok().flatten(),
        )
    };
    let (profile, tv, native_home) = collect_tv(state, &options, &mut privacy).await;
    let environment = environment(
        &mut privacy,
        profile.as_ref().map(|saved| &saved.tv),
        &tv["logs"],
        &native_home,
    );
    let mut result = ExportResult {
        saved: true,
        ..Default::default()
    };
    if tv["state"] == "unavailable" {
        result.unavailable.push("TV logs");
    }
    if native_home["state"] == "unavailable" {
        result.unavailable.push("Home settings");
    }
    Bundle {
        report: json!({
            "schema_version": REPORT_SCHEMA_VERSION,
            "created_at": timestamp(),
            "simulator": options.simulator,
            "desktop_version": env!("CARGO_PKG_VERSION"),
            "desktop_build": {"version": env!("CARGO_PKG_VERSION"), "build_id": build},
            "system": {"os": std::env::consts::OS, "architecture": std::env::consts::ARCH},
            "privacy": {"policy_version": PRIVACY_POLICY_VERSION, "console_output": false,
                "error_messages": "codes_only", "third_party_app_ids": "temporary_aliases"},
            "tv": tv,
            "environment": environment,
            "native_home": native_home,
            "bundle_health": {"desktop_files": 1, "receipt_summaries": receipts.len()},
        }),
        receipts,
        result,
    }
}

pub async fn latest_home_attempt(state: &AppState, id: &str) -> AppResult<Option<Value>> {
    let saved = state.profiles.get(id).await?;
    let receipts = state
        .home_backups
        .diagnostic_receipts(Some(&saved.tv.identity_sha256))
        .await;
    let mut privacy = Privacy::default();
    Ok(receipts.iter().find_map(|receipt| {
        let summary = privacy.receipt(receipt);
        matches!(
            summary["command"]["action"].as_str(),
            Some("apply" | "restore")
        )
        .then_some(summary)
    }))
}

pub fn export_failed() -> AppError {
    AppError::new(
        "log_export_failed",
        "Could not save the diagnostic ZIP. Try another location.",
    )
}

pub fn save(path: &Path, activity: &[Event], bundle: Bundle) -> AppResult<ExportResult> {
    let folder = path.parent().ok_or_else(export_failed)?;
    let mut temporary = tempfile::NamedTempFile::new_in(folder).map_err(|_| export_failed())?;
    let files = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
    let mut archive = ZipWriter::new(temporary.as_file_mut());
    archive
        .start_file("desktop/activity.log", files)
        .map_err(|_| export_failed())?;
    for event in activity {
        serde_json::to_writer(&mut archive, event).map_err(|_| export_failed())?;
        archive.write_all(b"\n").map_err(|_| export_failed())?;
    }
    for (index, receipt) in bundle.receipts.iter().enumerate() {
        archive
            .start_file(format!("home/receipt-{}.json", index + 1), files)
            .map_err(|_| export_failed())?;
        serde_json::to_writer_pretty(&mut archive, receipt).map_err(|_| export_failed())?;
    }
    archive
        .start_file("report.json", files)
        .map_err(|_| export_failed())?;
    serde_json::to_writer_pretty(&mut archive, &bundle.report).map_err(|_| export_failed())?;
    archive.finish().map_err(|_| export_failed())?;
    temporary
        .as_file()
        .sync_all()
        .map_err(|_| export_failed())?;
    temporary.persist_noclobber(path).map_err(|error| {
        if error.error.kind() == ErrorKind::AlreadyExists {
            AppError::new(
                "log_file_exists",
                "A file already exists at that location. Choose a new filename.",
            )
        } else {
            export_failed()
        }
    })?;
    Ok(bundle.result)
}

#[cfg(test)]
mod tests;
