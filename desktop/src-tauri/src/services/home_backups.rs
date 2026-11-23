use crate::models::{
    valid_identity, AppError, AppResult, HomeBackup, HomeBackupSettings, NativeHomeSettings,
    LAUNCHER_APP_ID,
};
use chrono::{DateTime, Datelike, NaiveDate, NaiveDateTime, Timelike};
use serde_json::Value;
use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

const MAX_BACKUP_BYTES: u64 = 128 * 1024;
const BACKUP_SCHEMA_VERSION: u64 = 1;
const BACKUP_KIND: &str = "aerotizen.home-baseline";
const MAIN_OPERATION: &str = "http://tizen.org/appcontrol/operation/main";
const HOME_KEY: &str = "db/appfw/home_appid";
const STARTUP_KEY: &str = "db/appfw/startup_appid";
const STARTUP_BACKUP_KEY: &str = "db/appfw/booting_appid_backup";
const FIRST_SCREEN_KEY: &str = "db/first_screen/type";
const AUTOSTART_KEY: &str = "db/menu/smart_hub/ontvsetting/auto_start";
const SETTING_COUNT: usize = 5;

/// Owns original Home backups. Existing originals are never replaced.
#[derive(Clone)]
pub struct HomeBackups {
    directory: PathBuf,
}

impl HomeBackups {
    pub fn new(cli_state_directory: PathBuf) -> Self {
        Self {
            directory: cli_state_directory.join("backups"),
        }
    }

    pub async fn read(&self, identity: &str, captured_at: &str) -> AppResult<HomeBackupSettings> {
        if !valid_identity(identity) {
            return Err(AppError::new(
                "invalid_request",
                "The saved TV identity is invalid.",
            ));
        }
        let path = self.directory.join(identity).join("original-home.json");
        let identity = identity.to_owned();
        let captured_at = captured_at.to_owned();
        tokio::task::spawn_blocking(move || {
            let bytes = read_bytes(&path)?;
            review(&bytes, &identity, &captured_at)
        })
        .await
        .map_err(|_| unreadable())?
    }

    pub async fn summary(&self, identity: &str) -> HomeBackup {
        if !valid_identity(identity) {
            return HomeBackup::Unreadable;
        }
        let path = self.directory.join(identity).join("original-home.json");
        let identity = identity.to_owned();
        tokio::task::spawn_blocking(move || {
            if std::fs::symlink_metadata(&path)
                .is_err_and(|error| error.kind() == std::io::ErrorKind::NotFound)
            {
                return HomeBackup::Missing;
            }
            let Some((document, captured_at)) = read_bytes(&path)
                .ok()
                .and_then(|bytes| serde_json::from_slice::<Value>(&bytes).ok())
                .and_then(|document| {
                    let captured_at = document["captured_at"]
                        .as_str()
                        .and_then(capture_timestamp)?;
                    Some((document, captured_at))
                })
            else {
                return HomeBackup::Unreadable;
            };
            if verified_settings(&document, &identity).is_none() {
                return HomeBackup::Unreadable;
            }
            HomeBackup::Saved { captured_at }
        })
        .await
        .unwrap_or(HomeBackup::Unreadable)
    }
}

fn read_bytes(path: &Path) -> AppResult<Vec<u8>> {
    let metadata = std::fs::metadata(path).map_err(|_| unreadable())?;
    if !metadata.is_file() || metadata.len() > MAX_BACKUP_BYTES {
        return Err(unreadable());
    }
    let mut file = File::open(path).map_err(|_| unreadable())?;
    let metadata = file.metadata().map_err(|_| unreadable())?;
    if !metadata.is_file() || metadata.len() > MAX_BACKUP_BYTES {
        return Err(unreadable());
    }
    let mut bytes = Vec::new();
    // Bound the actual read as well as metadata, in case the file grows.
    file.by_ref()
        .take(MAX_BACKUP_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unreadable())?;
    if bytes.len() as u64 > MAX_BACKUP_BYTES {
        return Err(unreadable());
    }
    Ok(bytes)
}

fn unreadable() -> AppError {
    AppError::new(
        "backup_unreadable",
        "The original Home backup could not be verified.",
    )
}

fn nonempty_string(value: &Value) -> Option<&str> {
    value.as_str().filter(|text| !text.is_empty())
}

fn string_setting<'a>(settings: &'a Value, key: &str) -> Option<&'a str> {
    let setting = &settings[key];
    (setting["type"] == "string")
        .then(|| setting["value"].as_str())
        .flatten()
}

fn verified_settings(document: &Value, identity: &str) -> Option<HomeBackupSettings> {
    let device = &document["device"];
    let home = &document["home"];
    let settings = &home["settings"];
    if document["schema_version"].as_u64()? != BACKUP_SCHEMA_VERSION
        || document["kind"] != BACKUP_KIND
        || device["identity_sha256"] != identity
        || nonempty_string(&device["model"]).is_none()
        || nonempty_string(&device["firmware_build"]).is_none()
        || home["operation"] != MAIN_OPERATION
        || settings.as_object()?.len() != SETTING_COUNT
    {
        return None;
    }
    let home_button_app = nonempty_string(&home["default_app"])?;
    let home_app = string_setting(settings, HOME_KEY).filter(|value| !value.is_empty())?;
    let startup_app = string_setting(settings, STARTUP_KEY)?;
    let startup_backup_app = string_setting(settings, STARTUP_BACKUP_KEY)?;
    let first_screen = string_setting(settings, FIRST_SCREEN_KEY)?;
    if [
        home_button_app,
        home_app,
        startup_app,
        startup_backup_app,
        first_screen,
    ]
    .contains(&LAUNCHER_APP_ID)
    {
        return None;
    }
    let autostart = &settings[AUTOSTART_KEY];
    if autostart["type"] != "int" || !(autostart["value"].is_i64() || autostart["value"].is_u64()) {
        return None;
    }
    let evidence = &document["evidence"];
    let (uid, required): (i64, &[&str]) = match evidence["access"].as_str()? {
        "paired_helper" => (0, &[]),
        "sdk_uid_901" => (901, &["query_staging_cleaned", "sdk_staging_cleaned"]),
        "temporary_root" => (
            0,
            &[
                "query_staging_cleaned",
                "upstream_staging_cleaned",
                "system_files_unchanged",
            ],
        ),
        _ => return None,
    };
    if evidence["uid"].as_i64()? != uid
        || evidence["authenticated"] != true
        || !required.iter().all(|key| evidence[key] == true)
        || !valid_identity(evidence["helper_sha256"].as_str()?)
    {
        return None;
    }
    Some(HomeBackupSettings {
        settings: NativeHomeSettings {
            home_button_app: Some(home_button_app.into()),
            home_app: Some(home_app.into()),
            startup_app: Some(startup_app.into()),
            startup_backup_app: Some(startup_backup_app.into()),
            smart_hub_autostart: match autostart["value"].as_i64() {
                Some(0) => Some(false),
                Some(1) => Some(true),
                _ => None,
            },
        },
        first_screen: first_screen.into(),
    })
}

/// Match the canonical timestamps returned by the CLI's datetime.isoformat().
fn capture_timestamp(value: &str) -> Option<String> {
    let (local, offset) = if let Ok(time) = DateTime::parse_from_rfc3339(value) {
        (time.naive_local(), Some(time.offset().to_string()))
    } else {
        let time = NaiveDateTime::parse_from_str(value, "%Y-%m-%dT%H:%M:%S%.f")
            .or_else(|_| NaiveDateTime::parse_from_str(value, "%Y-%m-%d %H:%M:%S%.f"))
            .or_else(|_| {
                NaiveDate::parse_from_str(value, "%Y-%m-%d")
                    .map(|date| date.and_hms_opt(0, 0, 0).unwrap())
            })
            .ok()?;
        (time, None)
    };
    if !(1..=9999).contains(&local.year()) || local.nanosecond() >= 1_000_000_000 {
        return None;
    }
    let mut formatted = local.format("%Y-%m-%dT%H:%M:%S").to_string();
    let microseconds = local.nanosecond() / 1_000;
    if microseconds != 0 {
        formatted.push_str(&format!(".{microseconds:06}"));
    }
    if let Some(offset) = offset {
        formatted.push_str(&offset);
    }
    Some(formatted)
}

fn review(bytes: &[u8], identity: &str, captured_at: &str) -> AppResult<HomeBackupSettings> {
    let document: Value = serde_json::from_slice(bytes).map_err(|_| unreadable())?;
    let settings = verified_settings(&document, identity).ok_or_else(unreadable)?;
    let current = document["captured_at"]
        .as_str()
        .and_then(capture_timestamp)
        .ok_or_else(unreadable)?;
    if current != captured_at {
        return Err(AppError::new(
            "backup_changed",
            "The backup changed. Refresh the TV connection to review it.",
        ));
    }
    Ok(settings)
}

mod capture;

#[cfg(test)]
mod tests;
