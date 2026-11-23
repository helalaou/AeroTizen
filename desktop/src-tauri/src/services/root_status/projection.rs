use super::super::json::truthy;
use super::records::{Receipt, PAIRING_VERSION};
use crate::models::{AppError, AppResult, RootAccessStatus, RootPhase};
use serde_json::Value;

const MIN_VERSION_PARTS: usize = 2;
const MAX_VERSION_PARTS: usize = 4;
const MAX_VERSION_DIGITS: usize = 3;
const UPDATE_VERSION_PARTS: usize = 3;

fn runtime_version(value: &Value) -> Option<String> {
    let version = value.as_str()?;
    let parts = version.split('.').collect::<Vec<_>>();
    ((MIN_VERSION_PARTS..=MAX_VERSION_PARTS).contains(&parts.len())
        && parts.iter().all(|part| {
            !part.is_empty()
                && part.len() <= MAX_VERSION_DIGITS
                && part.bytes().all(|byte| byte.is_ascii_digit())
        }))
    .then(|| version.into())
}

fn older_version(version: &str, target: &str) -> bool {
    if version.split('.').count() != UPDATE_VERSION_PARTS {
        return false;
    }
    version
        .split('.')
        .zip(target.split('.'))
        .map(|(left, right)| {
            let left = left.trim_start_matches('0');
            let right = right.trim_start_matches('0');
            left.len().cmp(&right.len()).then_with(|| left.cmp(right))
        })
        .find(|ordering| !ordering.is_eq())
        .is_some_and(|ordering| ordering.is_lt())
}

pub(super) fn public_status(
    receipt: Option<&Receipt>,
    live: Option<&Value>,
    target: &str,
) -> AppResult<RootAccessStatus> {
    let phase = receipt
        .map(|receipt| receipt.phase.clone())
        .unwrap_or(RootPhase::NotConfigured);
    let present = live.is_some();
    let automatic_startup = live
        .map(|reply| {
            reply
                .get("automatic_startup_enabled")
                .map(|value| value == true)
                .ok_or_else(|| {
                    AppError::new(
                        "invalid_response",
                        "The TV returned an unsupported response.",
                    )
                })
        })
        .transpose()?;
    let automatic_boot_verified = if let (Some(receipt), Some(reply)) = (receipt, live) {
        if reply["origin"] == "boot" {
            let baseline = receipt.document.get("baseline_boot_id").ok_or_else(|| {
                AppError::new(
                    "invalid_response",
                    "The TV returned an unsupported response.",
                )
            })?;
            reply["boot_id"] != *baseline
        } else {
            false
        }
    } else {
        false
    };
    let bootstrap_completed = live.is_some_and(|reply| reply["bootstrap_completed"] == true);
    let installed = live.is_some_and(|reply| reply["helper_installed"] == true);
    let setup_complete = phase == RootPhase::Active
        && present
        && installed
        && automatic_startup == Some(true)
        && automatic_boot_verified
        && bootstrap_completed;
    let version = live.and_then(|reply| match reply.get("runtime_version") {
        Some(value) => runtime_version(value),
        None => Some(PAIRING_VERSION.into()),
    });
    let update_pending = receipt.is_some_and(|receipt| truthy(&receipt.document["upgrade"]));
    let update_available = setup_complete
        && !update_pending
        && version
            .as_deref()
            .is_some_and(|version| older_version(version, target));
    Ok(RootAccessStatus {
        phase,
        root_available: present,
        setup_complete,
        runtime_version: version,
        target_runtime_version: target.into(),
        update_available,
        update_pending,
        automatic_startup,
        automatic_boot_verified,
        bootstrap_completed,
        recovery_saved: receipt.is_some(),
        original_pc_host: receipt.map(|receipt| receipt.original_pc_host.clone()),
    })
}

#[cfg(test)]
mod tests;
