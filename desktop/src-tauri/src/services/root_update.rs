//! Resumable signed Root updates. Preserve pairing and require a new automatic boot.
use super::{
    digest::sha256_hex,
    root_install::{self, Operations},
    root_package,
    root_status::TARGET_RUNTIME_VERSION,
};
use crate::models::{AppError, AppResult};
use serde_json::{json, Value};

pub(super) fn failed() -> AppError {
    AppError::new("root_update_failed", "The Root helper update could not finish. Refresh Root access to check saved progress before retrying.")
}
pub(super) fn requirements(message: &str) -> AppError {
    AppError::new("root_update_requirements", message)
}
fn changed() -> AppError {
    AppError::new(
        "root_state_changed",
        "Complete Root setup before updating the helper. Refresh Root access first.",
    )
}
fn canonical_boot(value: &Value) -> bool {
    value
        .as_str()
        .is_some_and(|value| uuid::Uuid::parse_str(value).is_ok_and(|id| id.to_string() == value))
}
pub(super) fn review(receipt: &Value, resume: bool) -> AppResult<()> {
    if receipt["phase"] != "active" {
        return Err(changed());
    }
    if resume && receipt.get("upgrade").is_none_or(Value::is_null) {
        return Err(AppError::new(
            "root_state_changed",
            "There is no pending update. Refresh Root access first.",
        ));
    }
    Ok(())
}
pub(super) fn check(receipt: &Value, config: &Value, resume: bool) -> AppResult<()> {
    review(receipt, resume)?;
    let pending = receipt.get("upgrade").filter(|value| !value.is_null());
    if let Some(pending) = pending {
        if !canonical_boot(&pending["from_boot_id"])
            || ["configuration_sha256", "package_sha256"]
                .iter()
                .any(|key| {
                    pending[key]
                        .as_str()
                        .is_none_or(|value| !crate::models::valid_identity(value))
                })
        {
            return Err(failed());
        }
        if pending["configuration_sha256"] != sha256_hex(&root_package::config_bytes(config)?) {
            return Err(requirements(
                "Resume this update with the same desktop or CLI build that started it.",
            ));
        }
    }
    Ok(())
}
fn boot_ready(live: &Value, boot: &Value) -> bool {
    live["boot_id"] == *boot
        && live["origin"] == "boot"
        && [
            "automatic_startup_enabled",
            "bootstrap_completed",
            "helper_installed",
        ]
        .iter()
        .all(|key| live[key] == true)
}
fn older(version: &str, target: &str) -> bool {
    let version: Vec<_> = version.split('.').collect();
    let target: Vec<_> = target.split('.').collect();
    if version.len() != 3
        || target.len() != 3
        || version
            .iter()
            .any(|value| value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()))
    {
        return false;
    }
    version
        .iter()
        .zip(target)
        .map(|(left, right)| {
            let left = left.trim_start_matches('0');
            let right = right.trim_start_matches('0');
            left.len().cmp(&right.len()).then_with(|| left.cmp(right))
        })
        .find(|order| !order.is_eq())
        .is_some_and(|order| order.is_lt())
}
fn registration(registry: &Value, receipt: &Value, configuration: &str) -> AppResult<()> {
    if registry["row"].as_array().is_none_or(|row| row.len() != 7)
        || registry["other_rows_sha256"]
            .as_str()
            .is_none_or(|value| !crate::models::valid_identity(value))
        || registry["installation_id"] != receipt["installation_id"]
        || registry["configuration_sha256"] != configuration
    {
        return Err(failed());
    }
    Ok(())
}
pub(super) async fn update(
    io: &mut impl Operations,
    mut receipt: Value,
    config: Value,
    expected: &str,
    resume: bool,
    recovery: bool,
) -> AppResult<()> {
    check(&receipt, &config, resume)?;
    if recovery && receipt.get("upgrade").is_none_or(Value::is_null) {
        return Err(requirements(
            "Keep Developer Mode on and Host PC IP set to 127.0.0.1 before starting the update.",
        ));
    }
    let duid = io.identity().await?;
    if sha256_hex(duid.as_bytes()) != expected {
        return Err(AppError::new(
            "identity_mismatch",
            "The recovery record belongs to a different TV.",
        ));
    }
    let live = if recovery {
        Value::Null
    } else {
        io.proof(&receipt).await?
    };
    let before = io.home().await?;
    let device_identity = receipt["device_identity_sha256"]
        .as_str()
        .ok_or_else(failed)?
        .to_owned();
    root_install::complete(&before, &device_identity)?;
    let boot = before["boot"]["id"].clone();
    root_install::checked_preflight(&io.preflight().await?, &before)?;
    let registry = io.registry().await?;
    let original = sha256_hex(&root_package::config_bytes(&receipt["public_config"])?);
    let target = sha256_hex(&root_package::config_bytes(&config)?);
    let installed = registry["configuration_sha256"]
        .as_str()
        .ok_or_else(failed)?
        .to_owned();
    if installed != original && installed != target {
        return Err(failed());
    }
    registration(&registry, &receipt, &installed)?;
    if receipt.get("upgrade").is_none_or(Value::is_null) {
        if !boot_ready(&live, &boot) {
            return Err(requirements("Restart the TV with Developer Mode on and Host PC IP set to 127.0.0.1, then refresh Root access."));
        }
        let version=match live.get("runtime_version") {
            None=>super::root_pairing::PAIRING_VERSION,
            Some(Value::String(version))=>version,
            _=>return Err(requirements("This helper version cannot be updated by this app. Install a newer desktop release.")),
        };
        if version == TARGET_RUNTIME_VERSION {
            if installed != target || live["configuration_sha256"] != target {
                return Err(requirements("The helper differs from this build. Install a newer desktop release to update it."));
            }
            return Ok(());
        }
        if !older(version, TARGET_RUNTIME_VERSION) {
            return Err(requirements("This helper version cannot be updated by this app. Install a newer desktop release."));
        }
        io.certificates(&duid).await.map_err(|error| if error.code == "certificates_required" {requirements("Restore this TV's original signing certificates on this computer before updating. Do not create replacement certificates.")} else {error})?;
        let (packaged, checksum) = io.package(&receipt).await?;
        if packaged != config {
            return Err(failed());
        }
        receipt["upgrade"] =
            json!({"from_boot_id":boot,"configuration_sha256":target,"package_sha256":checksum});
        io.persist(&receipt).await?;
    }
    let checksum = receipt["upgrade"]["package_sha256"]
        .as_str()
        .ok_or_else(failed)?
        .to_owned();
    let installation = receipt["installation_id"]
        .as_str()
        .ok_or_else(failed)?
        .to_owned();
    if installed != target {
        io.verified_package(&checksum).await?;
        let result = io.install(&installation).await;
        io.clean_upload(&installation, &checksum).await?;
        result?;
    } else {
        // A previous install may have committed before its reply was lost.
        io.clean_upload(&installation, &checksum).await?;
    }
    let mut current = io.registry().await?;
    registration(&current, &receipt, &target)?;
    if current["row"][4] != "true" {
        let mut input_receipt = receipt.clone();
        input_receipt["public_config"] = config.clone();
        let prepared = io.prepare_bootstrap(&input_receipt).await?;
        if receipt.get("attempts").is_none() {
            receipt["attempts"] = json!([]);
        }
        receipt["attempts"].as_array_mut().ok_or_else(failed)?.push(json!({"nonce":prepared.nonce,"operation":"upgrade","requested_at":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|failed())?.as_secs_f64()}));
        io.persist(&receipt).await?;
        let proof = io.bootstrap(&prepared).await?;
        if [
            "passed",
            "protected_proof_verified",
            "staging_cleaned",
            "system_files_unchanged",
            "same_boot",
            "startup_repaired",
        ]
        .iter()
        .any(|key| proof[key] != true)
            || proof["nonce"] != prepared.nonce
        {
            return Err(failed());
        }
        receipt["attempts"]
            .as_array_mut()
            .unwrap()
            .last_mut()
            .unwrap()["verified"] = json!(true);
        io.persist(&receipt).await?;
        current = io.registry().await?;
    }
    let after = io.home().await?;
    root_install::complete(&after, &device_identity)?;
    registration(&current, &receipt, &target)?;
    if current["row"][4] != "true"
        || current["other_rows_sha256"] != registry["other_rows_sha256"]
        || before["home"] != after["home"]
        || after["boot"]["id"] != boot
    {
        return Err(failed());
    }
    if boot != receipt["upgrade"]["from_boot_id"]
        && boot_ready(&live, &boot)
        && live["runtime_version"] == TARGET_RUNTIME_VERSION
        && live["configuration_sha256"] == target
    {
        receipt["public_config"] = config;
        receipt["package_sha256"] = json!(checksum);
        receipt["verified_boot_id"] = boot;
        receipt.as_object_mut().unwrap().remove("upgrade");
        io.persist(&receipt).await?;
    }
    Ok(())
}
#[cfg(test)]
mod tests;
