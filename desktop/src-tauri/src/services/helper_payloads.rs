//! Checked, compiled-in TV helper data. Cargo unit tests need no generated payloads.
use super::{digest::sha256_hex, sdk::PayloadFile};
use crate::models::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::Value;
const MAX_FILE_BYTES: usize = 1024 * 1024;
const QUERY: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/home-query.json"));
const CONTROL: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/home-control.json"));
pub(super) const QUERY_ENTRYPOINT: &str = "AeroTizenHomeQuery.dll";
pub(super) const CONTROL_ENTRYPOINT: &str = "AeroTizenHomeControl.dll";
fn unavailable() -> AppError {
    AppError::new(
        "helper_unavailable",
        "The TV helper is missing or invalid. Reinstall the desktop app before retrying.",
    )
}
fn load(bytes: &[u8], names: &[&str]) -> AppResult<Vec<PayloadFile>> {
    let document: Value = serde_json::from_slice(bytes).map_err(|_| unavailable())?;
    let files = document["files"].as_object().ok_or_else(unavailable)?;
    if document["schema_version"].as_u64() != Some(1) || files.len() != names.len() {
        return Err(unavailable());
    }
    names
        .iter()
        .map(|name| {
            let entry = files.get(*name).ok_or_else(unavailable)?;
            let encoded = entry["base64"]
                .as_str()
                .filter(|value| value.len() <= MAX_FILE_BYTES.div_ceil(3) * 4)
                .ok_or_else(unavailable)?;
            let bytes = STANDARD.decode(encoded).map_err(|_| unavailable())?;
            if bytes.is_empty()
                || bytes.len() > MAX_FILE_BYTES
                || entry["sha256"] != sha256_hex(&bytes)
            {
                return Err(unavailable());
            }
            Ok(PayloadFile {
                name: (*name).into(),
                bytes,
            })
        })
        .collect()
}
pub(super) fn home_query() -> AppResult<Vec<PayloadFile>> {
    load(
        QUERY,
        &[QUERY_ENTRYPOINT, "AeroTizenHomeQuery.runtimeconfig.json"],
    )
}
pub(super) fn home_control() -> AppResult<Vec<PayloadFile>> {
    load(
        CONTROL,
        &[
            CONTROL_ENTRYPOINT,
            "AeroTizenHomeControl.runtimeconfig.json",
        ],
    )
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn invalid_schema_file_sets_empty_data_or_changed_checksums_cannot_execute() {
        let entry = serde_json::json!({"base64":STANDARD.encode(b"synthetic"),"sha256":sha256_hex(b"synthetic")});
        let original = serde_json::json!({"schema_version":1,"files":{"test.dll":entry}});
        assert_eq!(
            load(&serde_json::to_vec(&original).unwrap(), &["test.dll"]).unwrap()[0].bytes,
            b"synthetic"
        );
        for (pointer, value) in [
            ("/schema_version", serde_json::json!(2)),
            ("/files/test.dll/base64", serde_json::json!("")),
            ("/files/test.dll/sha256", serde_json::json!("a".repeat(64))),
        ] {
            let mut document = original.clone();
            *document.pointer_mut(pointer).unwrap() = value;
            assert!(load(&serde_json::to_vec(&document).unwrap(), &["test.dll"]).is_err());
        }
        assert!(load(&serde_json::to_vec(&original).unwrap(), &["wrong.dll"]).is_err());
    }

    #[cfg(feature = "bundled-worker")]
    #[test]
    fn compiled_app_embeds_complete_checked_home_helpers() {
        for files in [home_query().unwrap(), home_control().unwrap()] {
            assert!(files[0].bytes.starts_with(b"MZ"));
            let config: Value = serde_json::from_slice(&files[1].bytes).unwrap();
            assert!(config["runtimeOptions"].is_object());
        }
    }
}
