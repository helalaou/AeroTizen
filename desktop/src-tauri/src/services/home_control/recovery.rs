//! Bind boot restoration to the exact original bytes and a bounded durable receipt chain.
use super::*;
use std::{collections::HashSet, path::Path};
const MAX_RECOVERY_CHAIN: usize = 128;
const MAX_RECOVERY_RECEIPTS: usize = 1024;
fn token(value: &str) -> bool {
    value.len() == TRANSACTION_BYTES * 2
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
fn load(directory: &Path, transaction: &str, raw: &[u8], digest: &str) -> Option<Value> {
    if !token(transaction) {
        return None;
    }
    let receipt = durable_json::read(
        &directory.join(format!("{transaction}.json")),
        MAX_RECEIPT_BYTES,
    )
    .ok()?;
    let request = &receipt["request"];
    if request["schema_version"].as_u64() != Some(1)
        || request["transaction"] != transaction
        || request["baseline_sha256"] != digest
        || STANDARD
            .decode(request["baseline_base64"].as_str()?)
            .ok()?
            .as_slice()
            != raw
        || request["action"] == "apply"
            && receipt["native_result"]["Success"] == true
            && receipt["native_result"]["StartupSettingsRestored"] == true
    {
        return None;
    }
    Some(request.clone())
}
fn active(status: &Value, directory: &Path, raw: &[u8], digest: &str) -> Option<String> {
    let control = &status["watcher"]["control"];
    if !matches!(control["mode"].as_str(), Some("native" | "hold"))
        || control["baseline_sha256"] != digest
    {
        return None;
    }
    let active = control["transaction"].as_str()?;
    let mut current = active.to_owned();
    let mut seen = HashSet::new();
    for _ in 0..MAX_RECOVERY_CHAIN {
        if !seen.insert(current.clone()) {
            return None;
        }
        let request = load(directory, &current, raw, digest)?;
        if request["action"] == "apply" {
            return (request["boot"] == true).then(|| active.to_owned());
        }
        if request["action"] != "restore"
            || control["mode"] != "hold"
            || request.get("boot").is_some_and(|value| value != false)
            || request
                .get("art_return")
                .is_some_and(|value| value != false)
        {
            return None;
        }
        current = request["restore_boot_transaction"].as_str()?.to_owned();
    }
    None
}
fn absent(directory: &Path, raw: &[u8], digest: &str) -> AppResult<Option<Value>> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(error("Could not read Home recovery receipts.")),
    };
    let mut paths = Vec::new();
    for entry in entries {
        let path = entry
            .map_err(|_| error("Could not read Home recovery receipts."))?
            .path();
        if path
            .extension()
            .is_some_and(|extension| extension == "json")
        {
            paths.push(path);
            if paths.len() > MAX_RECOVERY_RECEIPTS {
                return Err(error(
                    "Too many Home recovery receipts. Preserve the folder before retrying.",
                ));
            }
        }
    }
    paths.sort();
    for path in paths {
        let Some(transaction) = path.file_stem().and_then(|name| name.to_str()) else {
            continue;
        };
        let Some(request) = load(directory, transaction, raw, digest) else {
            continue;
        };
        if request["action"] == "apply"
            && request["boot"] == true
            && request.get("art_return").is_none_or(Value::is_boolean)
            && request.get("restore_boot_transaction").is_none()
        {
            return Ok(Some(
                [
                    "schema_version",
                    "action",
                    "transaction",
                    "boot",
                    "baseline_sha256",
                    "baseline_base64",
                ]
                .into_iter()
                .map(|key| (key.into(), request[key].clone()))
                .collect::<serde_json::Map<_, _>>()
                .into(),
            ));
        }
    }
    Ok(None)
}
pub(super) async fn request(
    status: &Value,
    original: &Original,
    installed: bool,
) -> AppResult<Option<(&'static str, Value)>> {
    let directory = original
        .path
        .parent()
        .ok_or_else(|| error("The original backup folder is unavailable."))?
        .join("transactions");
    let status = status.clone();
    let raw = original.raw.clone();
    let digest = original.digest.clone();
    let settings_changed = status["home"]["settings"][AUTOSTART_KEY]["value"]
        != original.document["home"]["settings"][AUTOSTART_KEY]["value"];
    tokio::task::spawn_blocking(move || {
        if installed {if let Some(transaction)=active(&status,&directory,&raw,&digest) {return Ok(Some(("restore_boot_transaction",json!(transaction))));}}
        if settings_changed {
            if !installed {if let Some(proof)=absent(&directory,&raw,&digest)? {return Ok(Some(("recovery_apply",proof)));}}
            return Err(error("Autostart changed and its matching boot receipt is unavailable. No write was attempted."));
        }
        Ok(None)
    }).await.map_err(|_|error("Could not check Home recovery receipts."))?
}

#[cfg(test)]
mod tests;
