use super::digest::sha256_hex;
use super::root_bridge::{Pairing, HELPER_APP_ID};
use crate::models::{valid_identity, AppError, AppResult, RootPhase};
use serde_json::Value;
use std::{
    fs::File,
    io::Read,
    net::Ipv4Addr,
    path::{Path, PathBuf},
};

pub(super) const PAIRING_VERSION: &str = "0.1.0";
const SCHEMA_VERSION: u64 = 1;
const MAX_RECEIPT_BYTES: u64 = 256 * 1024;
const MAX_POINTER_BYTES: u64 = 4096;
const INSTALLATION_ID_CHARACTERS: usize = 32;
const MIN_BRIDGE_PORT: u64 = 1024;
const RESERVED_BRIDGE_PORTS: [u64; 2] = [26101, 26102];

// No Debug or Serialize: recovery documents contain the private pairing and key material.
pub(super) struct Receipt {
    pub document: Value,
    pub phase: RootPhase,
    pub pairing: Pairing,
    pub original_pc_host: String,
}

pub(super) fn address(host: &str, expected: &str) -> AppResult<Ipv4Addr> {
    let address = host_address(host)?;
    if !valid_identity(expected) {
        return Err(AppError::new(
            "invalid_request",
            "The saved TV identity is invalid.",
        ));
    }
    Ok(address)
}

pub(super) fn host_address(host: &str) -> AppResult<Ipv4Addr> {
    let invalid = || AppError::new("invalid_address", "Enter a valid TV IPv4 address.");
    let address: Ipv4Addr = host.parse().map_err(|_| invalid())?;
    if address.is_unspecified() || address.is_multicast() || address == Ipv4Addr::BROADCAST {
        return Err(invalid());
    }
    Ok(address)
}

pub(super) fn unchanged(before: Option<&Receipt>, after: Option<&Receipt>) -> AppResult<()> {
    if before.map(|receipt| &receipt.document) != after.map(|receipt| &receipt.document) {
        return Err(AppError::new(
            "root_state_changed",
            "Root setup changed. Refresh Root access to check its current status.",
        ));
    }
    Ok(())
}

pub(super) fn unavailable() -> AppError {
    AppError::new(
        "root_recovery_unavailable",
        "The saved root recovery files could not be read on this computer.",
    )
}

fn read_document(path: &Path, max_bytes: u64) -> AppResult<Value> {
    let metadata = std::fs::symlink_metadata(path).map_err(|_| unavailable())?;
    if !metadata.is_file() || metadata.file_type().is_symlink() || metadata.len() > max_bytes {
        return Err(unavailable());
    }
    let file = File::open(path).map_err(|_| unavailable())?;
    if !file.metadata().map_err(|_| unavailable())?.is_file() {
        return Err(unavailable());
    }
    let mut bytes = Vec::new();
    file.take(max_bytes + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| unavailable())?;
    if bytes.len() as u64 > max_bytes {
        return Err(unavailable());
    }
    serde_json::from_slice(&bytes).map_err(|_| unavailable())
}

fn original_address(value: &Value) -> Option<String> {
    let text = value.as_str()?;
    let address: Ipv4Addr = text.parse().ok()?;
    (!address.is_loopback() && !address.is_unspecified() && !address.is_multicast())
        .then(|| text.into())
}

pub(super) fn parse(document: Value, expected: &str) -> AppResult<Receipt> {
    let invalid = || unavailable();
    if document["schema_version"].as_u64() != Some(SCHEMA_VERSION)
        || document["app_id"] != HELPER_APP_ID
    {
        return Err(invalid());
    }
    let phase: RootPhase =
        serde_json::from_value(document["phase"].clone()).map_err(|_| invalid())?;
    if phase == RootPhase::NotConfigured {
        return Err(invalid());
    }
    let installation_id = document["installation_id"].as_str().ok_or_else(invalid)?;
    if installation_id.len() != INSTALLATION_ID_CHARACTERS
        || !installation_id
            .bytes()
            .all(|byte| byte.is_ascii_hexdigit() && !byte.is_ascii_uppercase())
    {
        return Err(invalid());
    }
    for key in [
        "device_identity_sha256",
        "duid_sha256",
        "certificate_sha256",
        "token",
    ] {
        if !document[key].as_str().is_some_and(valid_identity) {
            return Err(invalid());
        }
    }
    let port = document["bridge_port"]
        .as_u64()
        .filter(|port| {
            (MIN_BRIDGE_PORT..=u16::MAX as u64).contains(port)
                && !RESERVED_BRIDGE_PORTS.contains(port)
        })
        .ok_or_else(invalid)? as u16;
    original_address(&document["host"]).ok_or_else(invalid)?;
    let original_pc_host = original_address(&document["original_pc_host"]).ok_or_else(invalid)?;
    if document["original_pc_host"] == "255.255.255.255" {
        return Err(invalid());
    }
    if document["duid_sha256"] != expected {
        return Err(AppError::new(
            "identity_mismatch",
            "The saved root recovery record belongs to a different TV.",
        ));
    }
    Ok(Receipt {
        phase,
        pairing: Pairing {
            port,
            installation_id: installation_id.into(),
            device_identity: document["device_identity_sha256"].as_str().unwrap().into(),
            certificate_sha256: document["certificate_sha256"].as_str().unwrap().into(),
            token: document["token"].as_str().unwrap().into(),
        },
        original_pc_host,
        document,
    })
}

fn selected_path(directory: &Path, host: &str) -> AppResult<PathBuf> {
    let default = directory
        .join("root")
        .join(sha256_hex(host.as_bytes()))
        .join("receipt.json");
    let pointer = default.with_file_name("selected.json");
    match std::fs::symlink_metadata(&pointer) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(default),
        Err(_) => return Err(unavailable()),
        Ok(_) => {}
    }
    let pointer = read_document(&pointer, MAX_POINTER_BYTES)?;
    if pointer.as_object().is_none_or(|fields| fields.len() != 1) {
        return Err(unavailable());
    }
    let path = PathBuf::from(pointer["path"].as_str().ok_or_else(unavailable)?);
    if !path.is_absolute() || !path.exists() || path.is_symlink() {
        return Err(unavailable());
    }
    Ok(path)
}

pub(super) async fn load(
    directory: &Path,
    host: &str,
    expected: &str,
) -> AppResult<Option<Receipt>> {
    lookup(directory, host, Some(expected)).await
}

pub(super) async fn lookup(
    directory: &Path,
    host: &str,
    expected: Option<&str>,
) -> AppResult<Option<Receipt>> {
    let directory = directory.to_owned();
    let host = host.to_owned();
    let expected = expected.map(str::to_owned);
    tokio::task::spawn_blocking(move || {
        let path = selected_path(&directory, &host)?;
        match std::fs::symlink_metadata(&path) {
            Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(_) => Err(unavailable()),
            Ok(_) => {
                let document = read_document(&path, MAX_RECEIPT_BYTES)?;
                let identity = expected
                    .or_else(|| document["duid_sha256"].as_str().map(str::to_owned))
                    .ok_or_else(unavailable)?;
                parse(document, &identity).map(Some)
            }
        }
    })
    .await
    .map_err(|_| unavailable())?
}

#[cfg(test)]
pub(crate) mod tests;
