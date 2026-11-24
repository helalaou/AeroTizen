//! Verify restart proof and mark only the existing pairing active; never install a helper.
use super::{root_pairing, Route, Session, TvConnection};
use crate::{
    models::{AppError, AppResult, RootAccessStatus, RootPhase},
    services::{helper_payloads, root_bridge, root_status, sdk, tv_session},
};
use serde_json::{json, Value};
use std::time::Duration;
use tokio::time::timeout;
const VERIFY_TIMEOUT: Duration = Duration::from_secs(120);
const REGISTRY_PREFIX: &str = "AEROTIZEN_ROOT_REGISTRY=";
fn state_changed() -> AppError {
    AppError::new(
        "root_state_changed",
        "There is no root setup waiting for verification. Refresh Root access first.",
    )
}
fn failed() -> AppError {
    AppError::new("root_setup_failed","Root verification could not finish. Refresh Root access to check the saved progress before retrying.")
}
fn boot_ready(reply: &Value, receipt: &Value) -> bool {
    reply["origin"] == "boot"
        && reply["boot_id"] != receipt["baseline_boot_id"]
        && [
            "automatic_startup_enabled",
            "bootstrap_completed",
            "helper_installed",
        ]
        .iter()
        .all(|key| reply[key] == true)
}
pub(super) fn registry(completion: &sdk::Completion) -> AppResult<Value> {
    let records: Vec<_> = completion
        .stdout
        .lines()
        .filter_map(|line| line.strip_prefix(REGISTRY_PREFIX))
        .collect();
    if completion.exit_code != 0 || records.len() != 1 {
        return Err(failed());
    }
    let document: Value = serde_json::from_str(records[0]).map_err(|_| failed())?;
    if !document["row"].is_null() {
        let row = document["row"].as_array().ok_or_else(failed)?;
        if row.len() != 7 || !matches!(row[4].as_str(), Some("true" | "false")) {
            return Err(failed());
        }
        let expected = json!([
            root_bridge::HELPER_APP_ID,
            root_bridge::HELPER_APP_ID,
            "dotnet",
            "svcapp",
            row[4],
            "false",
            format!(
                "/opt/usr/apps/{}/bin/AeroTizenRootHelper.dll",
                root_bridge::HELPER_APP_ID
            )
        ]);
        if document["row"] != expected {
            return Err(failed());
        }
    }
    Ok(document)
}
struct Verification {
    receipt: root_pairing::Receipt,
    ownership: tv_session::TvSessionLock,
    live: Value,
    query: Vec<sdk::PayloadFile>,
    bridge: Vec<sdk::PayloadFile>,
}
impl TvConnection {
    pub(in crate::services) async fn verify_root_setup(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<RootAccessStatus> {
        root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected)
            .await?
            .ok_or_else(state_changed)?;
        if !matches!(before.phase, RootPhase::WaitingBoot | RootPhase::Active) {
            return Err(state_changed());
        }
        let baseline = before.document["baseline_boot_id"]
            .as_str()
            .ok_or_else(root_pairing::unavailable)?;
        if uuid::Uuid::parse_str(baseline)
            .map(|boot| boot.to_string() != baseline)
            .unwrap_or(true)
        {
            return Err(root_pairing::unavailable());
        }
        timeout(
            VERIFY_TIMEOUT,
            self.verify_root_inner(host, expected, before),
        )
        .await
        .map_err(|_| failed())?
    }
    async fn verify_root_inner(
        &self,
        host: &str,
        expected: &str,
        before: root_pairing::Receipt,
    ) -> AppResult<RootAccessStatus> {
        let address = root_pairing::address(host, expected)?;
        let ownership = tv_session::acquire(&self.directory, host).await?;
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(Some(&before), current.as_ref())?;
        let live = root_bridge::status(address, &before.pairing).await.ok();
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(Some(&before), current.as_ref())?;
        if live
            .as_ref()
            .is_none_or(|reply| !boot_ready(reply, &before.document))
        {
            return root_status::projection::public_status(
                Some(&before),
                live.as_ref(),
                root_status::TARGET_RUNTIME_VERSION,
            );
        }
        let live = live.unwrap();
        let query = helper_payloads::home_query()?;
        let bridge = helper_payloads::root_bridge()?;
        self.verify_root_session(
            host,
            expected,
            Verification {
                receipt: before,
                ownership,
                live,
                query,
                bridge,
            },
        )
        .await
    }
    async fn verify_root_session(
        &self,
        host: &str,
        expected: &str,
        context: Verification,
    ) -> AppResult<RootAccessStatus> {
        let Verification {
            receipt: before,
            ownership,
            live,
            query,
            bridge,
        } = context;
        let address = root_pairing::address(host, expected)?;
        let info = self.device_info(address).await?.ok_or_else(failed)?;
        let (connection, proof) = self
            .connect(address, Route::Paired(&before.pairing))
            .await?;
        let mut session = Session {
            owner: self,
            host,
            expected: Some(expected.into()),
            info: Some(info),
            bridge_proof: proof,
            receipt: Some(before),
            connection,
            _ownership: ownership,
        };
        if session
            .bridge_proof
            .as_ref()
            .is_none_or(|proof| proof["boot_id"] != live["boot_id"])
        {
            return Err(failed());
        }
        let status = session.query_home(&query, &Value::Null).await?;
        if status["complete"] != true
            || status["device"]["identity_sha256"]
                != session.receipt.as_ref().unwrap().document["device_identity_sha256"]
            || status["boot"]["id"] != live["boot_id"]
        {
            return Err(failed());
        }
        session.unchanged().await?;
        let completion = sdk::run(
            &mut session.connection,
            address,
            &bridge,
            helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
            &["--registry"],
        )
        .await?;
        let registry = registry(&completion)?;
        if registry["row"]
            .as_array()
            .is_none_or(|row| row[4] != "true")
        {
            return Err(failed());
        }
        session.identity().await?;
        session.unchanged().await?;
        let mut updated = session.receipt.as_ref().unwrap().document.clone();
        updated["phase"] = json!("active");
        updated["verified_boot_id"] = live["boot_id"].clone();
        let record = root_pairing::store::update(
            &self.directory,
            host,
            expected,
            session.receipt.as_ref().unwrap().document.clone(),
            updated,
        )
        .await?;
        root_status::projection::public_status(
            Some(&record),
            Some(&live),
            root_status::TARGET_RUNTIME_VERSION,
        )
    }
}
#[cfg(test)]
mod tests;
