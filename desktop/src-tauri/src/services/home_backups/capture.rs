use super::*;
use crate::{models::PreparedHomeApply, services::digest::sha256_hex};
use serde_json::json;
use std::{io::Write, time::SystemTime};

fn unavailable() -> AppError {
    AppError::new(
        "backup_unavailable",
        "The original Home backup could not be verified. Keep any existing original backup.",
    )
}

fn prepared(path: &Path, identity: &str) -> AppResult<PreparedHomeApply> {
    let bytes = read_bytes(path).map_err(|_| unavailable())?;
    let document: Value = serde_json::from_slice(&bytes).map_err(|_| unavailable())?;
    verified_settings(&document, identity).ok_or_else(unavailable)?;
    let captured_at = document["captured_at"]
        .as_str()
        .and_then(capture_timestamp)
        .ok_or_else(unavailable)?;
    Ok(PreparedHomeApply {
        id: identity.into(),
        captured_at,
        backup_sha256: sha256_hex(&bytes),
    })
}

fn paired_document(identity: &str, info: &Value, reply: &Value) -> AppResult<Value> {
    let settings = reply
        .get("home_settings")
        .and_then(Value::as_object)
        .ok_or_else(unavailable)?;
    let get = |field| {
        settings
            .get(field)
            .and_then(Value::as_str)
            .filter(|value| {
                crate::services::sdb::valid_identifier(value) && *value != LAUNCHER_APP_ID
            })
            .ok_or_else(unavailable)
    };
    let main = get("home_button_app")?;
    let home = get("home_app")?;
    if main != home {
        return Err(unavailable());
    }
    let startup = get("startup_app")?;
    let startup_backup = get("startup_backup_app")?;
    let first_screen = get("first_screen")?;
    let autostart = settings
        .get("smart_hub_autostart")
        .and_then(Value::as_bool)
        .ok_or_else(unavailable)?;
    let model = info
        .get("modelName")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(unavailable)?;
    let firmware = settings
        .get("firmware_build")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(unavailable)?;
    let helper = settings
        .get("helper_sha256")
        .and_then(Value::as_str)
        .filter(|value| crate::models::valid_identity(value))
        .ok_or_else(unavailable)?;
    Ok(json!({
        "schema_version":1,"kind":BACKUP_KIND,
        "captured_at":chrono::DateTime::<chrono::Utc>::from(SystemTime::now()).to_rfc3339_opts(chrono::SecondsFormat::Micros,false),
        "device":{"identity_sha256":identity,"model":model,"platform":info.get("model"),"firmware_build":firmware},
        "home":{"operation":MAIN_OPERATION,"default_app":main,"settings":{
            (HOME_KEY):{"type":"string","value":home},
            (STARTUP_KEY):{"type":"string","value":startup},
            (STARTUP_BACKUP_KEY):{"type":"string","value":startup_backup},
            (FIRST_SCREEN_KEY):{"type":"string","value":first_screen},
            (AUTOSTART_KEY):{"type":"int","value":i32::from(autostart)},
        }},
        "evidence":{"access":"paired_helper","authenticated":true,"uid":0,"helper_sha256":helper}
    }))
}

impl HomeBackups {
    pub fn paired_document(identity: &str, info: &Value, reply: &Value) -> AppResult<Value> {
        paired_document(identity, info, reply)
    }
    pub async fn prepared(&self, identity: &str) -> AppResult<Option<PreparedHomeApply>> {
        if !valid_identity(identity) {
            return Err(unavailable());
        }
        let path = self.directory.join(identity).join("original-home.json");
        let identity = identity.to_owned();
        tokio::task::spawn_blocking(move || match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(unavailable()),
            Ok(_) => prepared(&path, &identity).map(Some),
        })
        .await
        .map_err(|_| unavailable())?
    }

    pub async fn save_original(
        &self,
        identity: &str,
        document: Value,
    ) -> AppResult<PreparedHomeApply> {
        if !valid_identity(identity) || verified_settings(&document, identity).is_none() {
            return Err(unavailable());
        }
        let path = self.directory.join(identity).join("original-home.json");
        let identity = identity.to_owned();
        tokio::task::spawn_blocking(move || {
            if std::fs::symlink_metadata(&path).is_ok() {
                return prepared(&path, &identity);
            }
            let mut bytes = serde_json::to_vec_pretty(&document).map_err(|_| unavailable())?;
            bytes.push(b'\n');
            if bytes.len() as u64 > MAX_BACKUP_BYTES {
                return Err(unavailable());
            }
            let parent = path.parent().ok_or_else(unavailable)?;
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(parent).map_err(|_| unavailable())?;
            let mut temporary =
                tempfile::NamedTempFile::new_in(parent).map_err(|_| unavailable())?;
            temporary.write_all(&bytes).map_err(|_| unavailable())?;
            temporary.as_file().sync_all().map_err(|_| unavailable())?;
            match temporary.persist_noclobber(&path) {
                Ok(_) => {}
                Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(unavailable()),
            }
            prepared(&path, &identity)
        })
        .await
        .map_err(|_| unavailable())?
    }
}

#[cfg(test)]
mod tests;
