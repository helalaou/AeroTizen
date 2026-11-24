use super::{root_bridge, root_pairing, tv_session, Route, Session, TvConnection};
use crate::{
    models::{AppError, AppResult, RootAccessStatus, RootPhase, RootRemoveAction},
    services::{helper_payloads, json::truthy, root_pairing::store::Store, root_status, sdk},
};
use serde_json::{json, Value};
use std::{net::Ipv4Addr, time::Duration};
use tokio::time::timeout;

const REMOVAL_TIMEOUT: Duration = Duration::from_secs(300);
const UNINSTALL_TIMEOUT: Duration = Duration::from_secs(120);

fn failed(message: &str) -> AppError {
    AppError::new("root_removal_failed", message)
}

fn removal_status(receipt: &root_pairing::Receipt) -> AppResult<RootAccessStatus> {
    root_status::projection::public_status(Some(receipt), None, root_status::TARGET_RUNTIME_VERSION)
}

async fn prepare(
    address: Ipv4Addr,
    mut receipt: root_pairing::Receipt,
    store: &mut Store,
) -> AppResult<RootAccessStatus> {
    if receipt.removal_prepared() {
        return removal_status(&receipt);
    }
    if receipt.phase != RootPhase::Removing {
        receipt.document["phase"] = json!("removing");
        receipt = store.save(receipt.document).await?;
    }
    root_bridge::prepare_removal(address, &receipt.pairing)
        .await
        .map_err(|_| {
            failed("The TV did not confirm that root access was ready to remove. Refresh Root access and check the TV before retrying.")
        })?;
    receipt.document["private_state_removed"] = json!(true);
    let saved = store.save(receipt.document).await?;
    removal_status(&saved)
}

impl Session<'_> {
    async fn root_removal_registry(&mut self, bridge: &[sdk::PayloadFile]) -> AppResult<Value> {
        self.identity().await?;
        self.unchanged().await?;
        let result = sdk::run(
            &mut self.connection,
            root_pairing::host_address(self.host)?,
            bridge,
            helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
            &["--registry"],
        )
        .await?;
        super::root_verification::registry(&result)
    }

    async fn uninstall_prepared_helper(&mut self, bridge: &[sdk::PayloadFile]) -> AppResult<()> {
        let registry = self.root_removal_registry(bridge).await?;
        let row = registry
            .get("row")
            .ok_or_else(|| failed("The TV did not confirm the root access installation."))?;
        if row.is_null() {
            return Ok(());
        }
        let receipt = self
            .receipt
            .as_ref()
            .ok_or_else(|| failed("The prepared removal record is unavailable."))?;
        if registry["installation_id"] != receipt.pairing.installation_id {
            return Err(failed(
                "The root access installation does not match the saved removal record.",
            ));
        }
        self.identity().await?;
        self.unchanged().await?;
        let _ = timeout(
            UNINSTALL_TIMEOUT,
            self.connection.uninstall(root_bridge::HELPER_APP_ID),
        )
        .await;
        let after = self.root_removal_registry(bridge).await?;
        if !after.get("row").is_some_and(Value::is_null) {
            return Err(failed("The TV still reports that root access is installed."));
        }
        Ok(())
    }
}

impl TvConnection {
    pub(in crate::services) async fn remove_root_helper(
        &self,
        host: &str,
        expected: &str,
        action: RootRemoveAction,
    ) -> AppResult<RootAccessStatus> {
        timeout(
            REMOVAL_TIMEOUT,
            self.remove_root_inner(host, expected, action),
        )
        .await
        .map_err(|_| failed("Removal timed out. Refresh Root access to check saved progress."))?
    }

    async fn remove_root_inner(
        &self,
        host: &str,
        expected: &str,
        action: RootRemoveAction,
    ) -> AppResult<RootAccessStatus> {
        let address = root_pairing::address(host, expected)?;
        let ownership = tv_session::acquire(&self.directory, host).await?;
        let mut store = Store::open(&self.directory, host, expected).await?;
        let document = store.document.clone().ok_or_else(|| {
            failed("Use the computer where the TV’s root recovery record is saved.")
        })?;
        let receipt = root_pairing::parse(document, expected)?;
        if receipt.phase == RootPhase::Removed {
            return removal_status(&receipt);
        }
        if truthy(&receipt.document["upgrade"]) {
            return Err(failed(
                "Finish the update before removing root access.",
            ));
        }
        match action {
            RootRemoveAction::Start
                if matches!(receipt.phase, RootPhase::Active | RootPhase::Removing) =>
            {
                prepare(address, receipt, &mut store).await
            }
            RootRemoveAction::Finish if receipt.removal_prepared() => {
                let connection_required =
                    || failed("Reconnect the TV in Developer Mode before finishing removal.");
                let info = self
                    .device_info(address)
                    .await?
                    .ok_or_else(connection_required)?;
                let source =
                    super::root_install::source(&info).map_err(|_| connection_required())?;
                let (connection, _) = self
                    .connect(address, Route::DeveloperRequired(source))
                    .await?;
                let mut session = Session {
                    owner: self,
                    host,
                    expected: Some(expected.into()),
                    info: Some(info),
                    bridge_proof: None,
                    receipt: Some(receipt),
                    connection,
                    _ownership: ownership,
                };
                session
                    .uninstall_prepared_helper(&helper_payloads::root_bridge()?)
                    .await?;
                session.identity().await?;
                session.unchanged().await?;
                let mut document = store.document.clone().ok_or_else(connection_required)?;
                document["phase"] = json!("removed");
                let saved = store.save(document).await?;
                removal_status(&saved)
            }
            _ => Err(failed(
                "Refresh Root access to check the saved removal progress.",
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::services::{
        device_connection::tests::Peer,
        digest::sha256_hex,
        root_bridge::tests::{reply, Server},
        sdb::sync::tests::{handshake, read_reply},
        sdk::tests::serve_helper_with_args,
    };

    const DUID: &str = "removal-test-tv";
    const BRIDGE_FILES: [&str; 3] = [
        helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
        "AeroTizenRootBridge.runtimeconfig.json",
        "AeroTizenRootBridge.deps.json",
    ];

    #[tokio::test]
    async fn removal_requires_paired_preparation_before_uninstall_and_persists_it_once() {
        let directory = tempfile::tempdir().unwrap();
        let mut server = Server::new(1, |request| {
            let mut response = reply(request);
            response["prepared_for_removal"] = json!(true);
            format!("{response}\n").into_bytes()
        })
        .await;
        let host = "127.0.0.1";
        let identity = root_pairing::tests::IDENTITY;
        let mut document = root_pairing::tests::document();
        document["phase"] = json!("active");
        document["bridge_port"] = json!(server.port);
        document["certificate_sha256"] = json!(server.pin);
        root_pairing::tests::save(directory.path(), host, &document);
        let connection = TvConnection::new(directory.path().into());

        assert!(connection
            .remove_root_helper(host, identity, RootRemoveAction::Finish)
            .await
            .is_err());
        let status = connection
            .remove_root_helper(host, identity, RootRemoveAction::Start)
            .await
            .unwrap();
        assert_eq!(status.phase, RootPhase::Removing);
        assert_eq!(status.removal_prepared, Some(true));
        assert_eq!(server.next().await.unwrap()["operation"], "remove");
        server.finish().await;
        let resumed = connection
            .remove_root_helper(host, identity, RootRemoveAction::Start)
            .await
            .unwrap();
        assert_eq!(resumed.removal_prepared, Some(true));
    }

    #[tokio::test]
    async fn uninstall_requires_matching_installation_and_confirms_registration_is_gone() {
        for matches in [false, true] {
            let directory = tempfile::tempdir().unwrap();
            let host = "127.0.0.1";
            let expected = sha256_hex(DUID.as_bytes());
            let mut document = root_pairing::tests::document();
            document["phase"] = json!("removing");
            document["private_state_removed"] = json!(true);
            document["duid_sha256"] = json!(expected);
            root_pairing::tests::save(directory.path(), host, &document);
            let installation = if matches {
                document["installation_id"].clone()
            } else {
                json!("f".repeat(32))
            };
            let mut server = Peer::start(1, move |mut socket, _| {
                let installation = installation.clone();
                async move {
                    handshake(&mut socket).await;
                    read_reply(&mut socket, "shell:0 getduid", DUID).await;
                    let app = root_bridge::HELPER_APP_ID;
                    let registry = json!({
                        "installation_id": installation,
                        "row": [app, app, "dotnet", "svcapp", "true", "false",
                            format!("/opt/usr/apps/{app}/bin/AeroTizenRootHelper.dll")],
                    });
                    serve_helper_with_args(
                        &mut socket,
                        helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
                        &BRIDGE_FILES,
                        &format!("AEROTIZEN_ROOT_REGISTRY={registry}"),
                        &["--registry"],
                    )
                    .await;
                    if matches {
                        read_reply(&mut socket, "shell:0 getduid", DUID).await;
                        read_reply(&mut socket, &format!("shell:0 vd_appuninstall {app}"), "OK")
                            .await;
                        read_reply(&mut socket, "shell:0 getduid", DUID).await;
                        serve_helper_with_args(
                            &mut socket,
                            helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
                            &BRIDGE_FILES,
                            "AEROTIZEN_ROOT_REGISTRY={\"row\":null}",
                            &["--registry"],
                        )
                        .await;
                    }
                    vec![]
                }
            })
            .await;
            let owner = TvConnection::with_ports(directory.path().into(), server.port, 1);
            let ownership = tv_session::acquire(directory.path(), host).await.unwrap();
            let (connection, _) = owner
                .connect(Ipv4Addr::LOCALHOST, Route::Developer(None))
                .await
                .unwrap();
            let mut session = Session {
                owner: &owner,
                host,
                expected: Some(expected.clone()),
                info: None,
                receipt: Some(root_pairing::parse(document, &expected).unwrap()),
                bridge_proof: None,
                connection,
                _ownership: ownership,
            };
            let bridge = BRIDGE_FILES.map(|name| sdk::PayloadFile {
                name: name.into(),
                bytes: b"fixture".to_vec(),
            });
            let result = session.uninstall_prepared_helper(&bridge).await;
            if matches {
                result.unwrap();
            } else {
                assert_eq!(
                    result.unwrap_err().message,
                    "The root access installation does not match the saved removal record."
                );
            }
            server.finish().await;
        }
    }
}
