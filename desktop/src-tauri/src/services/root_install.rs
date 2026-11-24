//! Resumable Root installation. Every TV mutation has durable local intent first.
use super::root_package;
use crate::models::{AppError, AppResult};
use serde_json::{json, Value};
pub(super) struct Parameters<'a> {
    pub host: &'a str,
    pub expected: &'a str,
    pub source: &'a str,
}
// Contains private bootstrap input; never Debug or Serialize this transport owner.
pub(super) struct Bootstrap {
    pub nonce: String,
    pub input: Vec<u8>,
    pub pfx: Vec<u8>,
    pub pin: String,
}
pub(super) trait Operations {
    async fn archive_removed(&mut self) -> AppResult<()>;
    async fn identity(&mut self) -> AppResult<String>;
    async fn home(&mut self) -> AppResult<Value>;
    async fn preflight(&mut self) -> AppResult<Value>;
    async fn registry(&mut self) -> AppResult<Value>;
    async fn certificates(&mut self, duid: &str) -> AppResult<()>;
    async fn pairing(&mut self, installation: &str) -> AppResult<Value>;
    async fn persist(&mut self, receipt: &Value) -> AppResult<()>;
    async fn package(&mut self, receipt: &Value) -> AppResult<(Value, String)>;
    async fn install(&mut self, installation: &str) -> AppResult<String>;
    async fn clean_upload(&mut self, installation: &str, checksum: &str) -> AppResult<()>;
    async fn proof(&mut self, receipt: &Value) -> AppResult<Value>;
    async fn verified_package(&mut self, checksum: &str) -> AppResult<()>;
    async fn live(&mut self, receipt: &Value) -> bool;
    async fn prepare_bootstrap(&mut self, receipt: &Value) -> AppResult<Bootstrap>;
    async fn bootstrap(&mut self, input: &Bootstrap) -> AppResult<Value>;
}
pub(super) fn failed() -> AppError {
    AppError::new("root_setup_failed","Root setup could not finish. Refresh Root access to check the saved progress before retrying.")
}
const MAX_CERTIFICATE_ID_BYTES: usize = 128;
pub(super) fn certificate_identity(duid: &str) -> bool {
    !duid.is_empty()
        && duid.len() <= MAX_CERTIFICATE_ID_BYTES
        && duid
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || b"_-".contains(&byte))
}
fn changed() -> AppError {
    AppError::new(
        "root_state_changed",
        "Root setup already exists. Refresh Root access to continue it.",
    )
}
pub(super) fn complete(status: &Value, expected: &str) -> AppResult<()> {
    if status["device"]["identity_sha256"] != expected {
        return Err(AppError::new(
            "identity_mismatch",
            "This address or recovery record belongs to a different TV. Root setup stopped.",
        ));
    }
    if status["complete"] != true {
        return Err(failed());
    }
    Ok(())
}
pub(super) fn checked_preflight(preflight: &Value, before: &Value) -> AppResult<()> {
    let boot = preflight["boot_id"].as_str().ok_or_else(failed)?;
    if preflight["schema_version"].as_u64() != Some(1)
        || !preflight["runtime"]
            .as_str()
            .is_some_and(|value| value.starts_with("6."))
        || ["database_uid", "database_gid"]
            .iter()
            .any(|key| preflight[key].as_u64().is_none_or(|id| id == 0))
        || uuid::Uuid::parse_str(boot)
            .map(|id| id.to_string() != boot)
            .unwrap_or(true)
        || preflight["boot_id"] != before["boot"]["id"]
    {
        return Err(failed());
    }
    Ok(())
}
fn same_registration(result: &Value) -> AppResult<()> {
    let row = result["row"].as_array().ok_or_else(failed)?;
    if row.len() != 7 || row[4] != "true" {
        return Err(failed());
    }
    Ok(())
}
pub(super) async fn setup(
    io: &mut impl Operations,
    parameters: Parameters<'_>,
    mut saved: Option<Value>,
) -> AppResult<()> {
    if let Some(receipt) = saved.as_ref() {
        if receipt["duid_sha256"] != parameters.expected {
            return Err(AppError::new(
                "identity_mismatch",
                "The saved recovery record belongs to a different TV.",
            ));
        }
        match receipt["phase"].as_str() {
            Some("waiting_boot" | "active") => return Err(changed()),
            Some("removing") => {
                return Err(AppError::new(
                    "root_recovery_required",
                    "Finish the existing root removal before starting setup.",
                ))
            }
            Some("removed") => {
                io.archive_removed().await?;
                saved = None;
            }
            Some("prepared" | "installed" | "root_requested") => {}
            _ => return Err(changed()),
        }
    }
    let duid = io.identity().await?;
    if super::digest::sha256_hex(duid.as_bytes()) != parameters.expected {
        return Err(AppError::new(
            "identity_mismatch",
            "This address belongs to a different TV. Root setup stopped.",
        ));
    }
    let before = io.home().await?;
    complete(&before, parameters.expected)?;
    let preflight = io.preflight().await?;
    checked_preflight(&preflight, &before)?;
    let registration = io.registry().await?;
    let mut receipt = if let Some(receipt) = saved {
        complete(
            &before,
            receipt["device_identity_sha256"]
                .as_str()
                .ok_or_else(failed)?,
        )?;
        receipt
    } else {
        if !registration["row"].is_null() {
            return Err(AppError::new("root_recovery_required","The TV already has a root access installation. Use the computer or recovery files from its original setup."));
        }
        if !certificate_identity(&duid) {
            return Err(failed());
        }
        io.certificates(&duid).await?;
        let installation = root_package::random_hex(16)?;
        let private = io.pairing(&installation).await?;
        let mut receipt = json!({"schema_version":1,"app_id":super::root_bridge::HELPER_APP_ID,"version":super::root_pairing::PAIRING_VERSION,"host":parameters.host,"installation_id":installation,"device_identity_sha256":before["device"]["identity_sha256"],"duid_sha256":parameters.expected,"baseline_boot_id":preflight["boot_id"],"original_pc_host":parameters.source,"bridge_port":root_package::BRIDGE_PORT,"phase":"prepared","original_registration":null,"home_before":before["home"],"database_uid":preflight["database_uid"],"database_gid":preflight["database_gid"]});
        for key in ["token", "certificate_sha256", "server_pfx"] {
            receipt[key] = private[key].clone();
        }
        io.persist(&receipt).await?;
        receipt
    };
    if registration["row"].is_null() {
        io.certificates(&duid).await?;
        let (config, checksum) = io.package(&receipt).await?;
        receipt["public_config"] = config;
        receipt["package_sha256"] = json!(checksum);
        io.persist(&receipt).await?;
        let installation = receipt["installation_id"].as_str().ok_or_else(failed)?;
        let installed = io.install(installation).await;
        // Match the CLI's finally cleanup, including an uncertain install result.
        io.clean_upload(installation, &checksum).await?;
        let reply = installed?;
        if !reply.contains("install completed") && !reply.contains("key[end] val[ok]") {
            return Err(failed());
        }
        receipt["phase"] = json!("installed");
        io.persist(&receipt).await?;
    }
    let registration = io.registry().await?;
    if registration["installation_id"] != receipt["installation_id"] {
        return Err(failed());
    }
    if !io.live(&receipt).await
        || registration["row"]
            .as_array()
            .is_none_or(|row| row.len() != 7 || row[4] != "true")
    {
        let other = registration["other_rows_sha256"]
            .as_str()
            .filter(|value| crate::models::valid_identity(value))
            .ok_or_else(failed)?;
        receipt["registration_others_before"] = json!(other);
        let prepared = io.prepare_bootstrap(&receipt).await?;
        let attempt = json!({"nonce":prepared.nonce,"operation":"install","requested_at":std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_err(|_|failed())?.as_secs_f64()});
        if receipt.get("attempts").is_none() {
            receipt["attempts"] = json!([]);
        }
        receipt["attempts"]
            .as_array_mut()
            .ok_or_else(failed)?
            .push(attempt);
        receipt["phase"] = json!("root_requested");
        io.persist(&receipt).await?;
        let result = io.bootstrap(&prepared).await?;
        if [
            "passed",
            "protected_proof_verified",
            "staging_cleaned",
            "system_files_unchanged",
            "same_boot",
            "bridge_ready",
        ]
        .iter()
        .any(|key| result[key] != true)
            || result["nonce"] != prepared.nonce
        {
            return Err(failed());
        }
        receipt["attempts"]
            .as_array_mut()
            .unwrap()
            .last_mut()
            .unwrap()["verified"] = json!(true);
        io.persist(&receipt).await?;
    }
    let after = io.home().await?;
    complete(&after, parameters.expected)?;
    let registry_after = io.registry().await?;
    same_registration(&registry_after)?;
    if registry_after["other_rows_sha256"] != registration["other_rows_sha256"]
        || before["home"] != after["home"]
    {
        return Err(failed());
    }
    receipt["phase"] = json!("waiting_boot");
    io.persist(&receipt).await
}
#[cfg(test)]
mod tests;
