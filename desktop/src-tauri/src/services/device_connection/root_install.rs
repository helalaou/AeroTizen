//! Root installation's owned direct SDB session, private receipts and checked payloads.
use super::{root_pairing, Session, TvConnection};
use crate::{
    models::{AppError, AppResult, RootPhase},
    services::{
        digest::sha256_hex,
        helper_payloads::{self, RootRuntime},
        root_bridge,
        root_install::{self, Bootstrap, Operations, Parameters},
        root_package::{self, Upstream},
        root_transfer, sdb,
        sdk::{self, PayloadFile},
        tv_session,
    },
};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    net::{Ipv4Addr, SocketAddrV4},
    path::PathBuf,
    sync::Arc,
    time::Duration,
};
use tokio::{net::TcpSocket, time::timeout};
const SETUP_TIMEOUT: Duration = Duration::from_secs(600);
const PROOF_TIMEOUT: Duration = Duration::from_secs(3);
const RPC_PREFLIGHT: &str = "AEROTIZEN_ROOT_PREFLIGHT=";
const RPC_UPLOAD: &str = "AEROTIZEN_ROOT_UPLOAD=";
const RPC_BOOTSTRAP: &str = "AEROTIZEN_ROOT_BOOTSTRAP=";
const MAX_INPUT_BYTES: usize = 2 * 1024 * 1024;
fn requirements() -> AppError {
    AppError::new(
        "root_requirements",
        "Turn on Developer Mode and set Host PC IP to this computer's address, then retry.",
    )
}
pub(super) fn source(info: &Value) -> AppResult<Ipv4Addr> {
    let address = info["developerIP"]
        .as_str()
        .and_then(|value| value.parse::<Ipv4Addr>().ok())
        .ok_or_else(requirements)?;
    if info["developerMode"] != "1"
        || address.is_loopback()
        || address.is_unspecified()
        || address.is_multicast()
        || address == Ipv4Addr::BROADCAST
    {
        return Err(requirements());
    }
    Ok(address)
}
fn parse(completion: sdk::Completion, prefix: &str) -> AppResult<Value> {
    let records: Vec<_> = completion
        .stdout
        .lines()
        .filter_map(|line| line.strip_prefix(prefix))
        .collect();
    if completion.exit_code != 0 || records.len() != 1 {
        return Err(root_install::failed());
    }
    serde_json::from_str(records[0]).map_err(|_| root_install::failed())
}
#[derive(Clone, Copy)]
pub(super) enum Purpose {
    Install,
    Update,
}
pub(super) struct Native<'a> {
    session: Session<'a>,
    store: root_pairing::store::Store,
    runtime: Arc<RootRuntime>,
    upstream: Option<Arc<Upstream>>,
    purpose: Purpose,
    query: Vec<PayloadFile>,
    bridge: Vec<PayloadFile>,
    certificates: Option<PathBuf>,
}
impl Native<'_> {
    pub(super) fn new(
        session: Session<'_>,
        store: root_pairing::store::Store,
        runtime: Arc<RootRuntime>,
        query: Vec<PayloadFile>,
        upstream: Option<Arc<Upstream>>,
        purpose: Purpose,
    ) -> Native<'_> {
        let bridge = runtime.flat_group("bin/AeroTizenRootBridge");
        Native {
            session,
            store,
            runtime,
            upstream,
            query,
            bridge,
            certificates: None,
            purpose,
        }
    }
    fn package_path(&self) -> PathBuf {
        self.store.path.with_file_name(match self.purpose {
            Purpose::Install => "helper.tpk",
            Purpose::Update => "upgrade.tpk",
        })
    }
    async fn upstream(&mut self) -> AppResult<Arc<Upstream>> {
        if let Some(upstream) = &self.upstream {
            return Ok(upstream.clone());
        }
        let upstream = Arc::new(
            root_package::upstream_files(self.session.owner.directory.join("root-cache")).await?,
        );
        self.upstream = Some(upstream.clone());
        Ok(upstream)
    }

    async fn rpc(&mut self, args: &[&str], prefix: &str) -> AppResult<Value> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        let address = root_pairing::host_address(self.session.host)?;
        let result = sdk::run(
            &mut self.session.connection,
            address,
            &self.bridge,
            helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
            args,
        )
        .await?;
        parse(result, prefix)
    }
}
impl Operations for Native<'_> {
    async fn archive_removed(&mut self) -> AppResult<()> {
        self.store.archive_removed().await
    }
    async fn identity(&mut self) -> AppResult<String> {
        self.session.identity().await
    }
    async fn home(&mut self) -> AppResult<Value> {
        self.session.query_home(&self.query, &Value::Null).await
    }
    async fn preflight(&mut self) -> AppResult<Value> {
        self.rpc(&["--preflight"], RPC_PREFLIGHT).await
    }
    async fn registry(&mut self) -> AppResult<Value> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        let address = root_pairing::host_address(self.session.host)?;
        let result = sdk::run(
            &mut self.session.connection,
            address,
            &self.bridge,
            helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
            &["--registry"],
        )
        .await?;
        super::root_verification::registry(&result)
    }
    async fn certificates(&mut self, duid: &str) -> AppResult<()> {
        if !root_install::certificate_identity(duid) {
            return Err(root_install::failed());
        }
        let path = self.session.owner.directory.join("certs").join(duid);
        let check = path.clone();
        let ready = tokio::task::spawn_blocking(move || {
            ["author.p12", "distributor.p12", "password.txt"]
                .iter()
                .all(|file| check.join(file).is_file())
        })
        .await
        .map_err(|_| root_install::failed())?;
        if !ready {
            return Err(AppError::new(
                "certificates_required",
                "Set up this TV's Samsung signing certificates before starting Root setup.",
            ));
        }
        self.certificates = Some(path);
        Ok(())
    }
    async fn pairing(&mut self, installation: &str) -> AppResult<Value> {
        let installation = installation.to_owned();
        tokio::task::spawn_blocking(move || root_package::pairing(&installation))
            .await
            .map_err(|_| root_install::failed())?
    }
    async fn persist(&mut self, receipt: &Value) -> AppResult<()> {
        let parsed = self.store.save(receipt.clone()).await?;
        self.session.receipt = Some(parsed);
        Ok(())
    }
    async fn package(&mut self, receipt: &Value) -> AppResult<(Value, String)> {
        let runtime = self.runtime.clone();
        let upstream = self.upstream().await?;
        let receipt = receipt.clone();
        let certificates = self.certificates.clone().ok_or_else(root_install::failed)?;
        let path = self.package_path();
        tokio::task::spawn_blocking(move || {
            let config = root_package::build(&path, &receipt, &runtime, &upstream, &certificates)?;
            let bytes = std::fs::read(&path).map_err(|_| root_install::failed())?;
            Ok((config, sha256_hex(&bytes)))
        })
        .await
        .map_err(|_| root_install::failed())?
    }
    async fn install(&mut self, installation: &str) -> AppResult<String> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        self.session
            .connection
            .install_root_package(installation, &self.package_path())
            .await
            .map_err(|_| root_install::failed())
    }
    async fn clean_upload(&mut self, installation: &str, checksum: &str) -> AppResult<()> {
        let name = sdb::sync::root_upload_name(installation).map_err(|_| root_install::failed())?;
        self.rpc(&["--clean-upload", &name, checksum], RPC_UPLOAD)
            .await
            .map(|_| ())
    }
    async fn verified_package(&mut self, checksum: &str) -> AppResult<()> {
        let path = self.package_path();
        let checksum = checksum.to_owned();
        tokio::task::spawn_blocking(move || {
            use std::io::Read;
            const MAX_ROOT_PACKAGE_BYTES: u64 = 32 * 1024 * 1024;
            let mut bytes = Vec::new();
            let file = std::fs::File::open(&path).map_err(|_| root_install::failed())?;
            if path.is_symlink()
                || !file
                    .metadata()
                    .map_err(|_| root_install::failed())?
                    .is_file()
            {
                return Err(root_install::failed());
            }
            file.take(MAX_ROOT_PACKAGE_BYTES + 1)
                .read_to_end(&mut bytes)
                .map_err(|_| root_install::failed())?;
            if bytes.len() as u64 > MAX_ROOT_PACKAGE_BYTES || sha256_hex(&bytes) != checksum {
                return Err(root_install::failed());
            }
            Ok(())
        })
        .await
        .map_err(|_| root_install::failed())?
    }
    async fn proof(&mut self, receipt: &Value) -> AppResult<Value> {
        let receipt = root_pairing::parse(
            receipt.clone(),
            self.session
                .expected
                .as_deref()
                .ok_or_else(root_install::failed)?,
        )?;
        root_bridge::status(
            root_pairing::host_address(self.session.host)?,
            &receipt.pairing,
        )
        .await
        .map_err(|_| root_install::failed())
    }
    async fn live(&mut self, receipt: &Value) -> bool {
        let Some(expected) = self.session.expected.as_deref() else {
            return false;
        };
        let Ok(receipt) = root_pairing::parse(receipt.clone(), expected) else {
            return false;
        };
        let Ok(address) = root_pairing::host_address(self.session.host) else {
            return false;
        };
        timeout(
            PROOF_TIMEOUT,
            root_bridge::status(address, &receipt.pairing),
        )
        .await
        .is_ok_and(|result| result.is_ok())
    }
    async fn prepare_bootstrap(&mut self, receipt: &Value) -> AppResult<Bootstrap> {
        let runtime = self.runtime.clone();
        let upstream = self.upstream().await?;
        let receipt = receipt.clone();
        let operation = match self.purpose {
            Purpose::Install => "install",
            Purpose::Update => "upgrade",
        };
        tokio::task::spawn_blocking(move || {
            let stage = format!("{}/arsetup-{}", root_package::STAGING_DIRECTORY, root_package::random_hex(8)?);
            let bundle = root_package::setup_bundle(&receipt, &runtime, &upstream, &stage, operation)?;
            let bridge: std::collections::BTreeMap<_,_> = runtime.flat_group("bin/AeroTizenRootBridge").into_iter()
                .map(|file|(file.name,STANDARD.encode(file.bytes))).collect();
            let files: std::collections::BTreeMap<_,_> = bundle.files.into_iter()
                .map(|file|(file.name,STANDARD.encode(file.bytes))).collect();
            let pairing = json!({"schema_version":1,"installation_id":receipt["installation_id"],"token":receipt["token"],"database_uid":receipt["database_uid"],"database_gid":receipt["database_gid"]});
            let request = json!({
                "package":bundle.manifest["package"], "setup_stage":stage,
                "pairing_json":serde_json::to_string(&pairing).map_err(|_|root_install::failed())?,
                "server_pfx":receipt["server_pfx"],
                "root_json":String::from_utf8(root_package::config_bytes(&receipt["public_config"])?).map_err(|_|root_install::failed())?,
                "bridge_files":bridge, "files":files,
            });
            let input = serde_json::to_vec(&request).map_err(|_|root_install::failed())?;
            if input.is_empty() || input.len()>MAX_INPUT_BYTES { return Err(root_install::failed()); }
            let pfx = STANDARD.decode(receipt["server_pfx"].as_str().ok_or_else(root_install::failed)?)
                .map_err(|_|root_install::failed())?;
            Ok(Bootstrap {
                nonce:bundle.manifest["nonce"].as_str().ok_or_else(root_install::failed)?.into(), input, pfx,
                pin:receipt["certificate_sha256"].as_str().ok_or_else(root_install::failed)?.into(),
            })
        }).await.map_err(|_|root_install::failed())?
    }
    async fn bootstrap(&mut self, input: &Bootstrap) -> AppResult<Value> {
        self.session.identity().await?;
        self.session.unchanged().await?;
        let address = root_pairing::host_address(self.session.host)?;
        let result = root_transfer::run(
            &mut self.session.connection,
            address,
            &self.bridge,
            &input.input,
            &input.pfx,
            &input.pin,
        )
        .await?;
        parse(result, RPC_BOOTSTRAP)
    }
}
impl TvConnection {
    pub(in crate::services) async fn install_root_setup(
        &self,
        host: &str,
        expected: &str,
    ) -> AppResult<()> {
        root_pairing::address(host, expected)?;
        timeout(SETUP_TIMEOUT,self.install_root_inner(host,expected)).await.map_err(|_|AppError::new("connection_timeout","Root setup timed out. Refresh Root access to check saved progress before retrying."))?
    }
    async fn install_root_inner(&self, host: &str, expected: &str) -> AppResult<()> {
        let address = root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected).await?;
        if before.as_ref().is_some_and(|receipt| {
            matches!(receipt.phase, RootPhase::WaitingBoot | RootPhase::Active)
        }) {
            return Err(AppError::new(
                "root_state_changed",
                "Root setup already exists. Refresh Root access to continue it.",
            ));
        }
        if before
            .as_ref()
            .is_some_and(|receipt| receipt.phase == RootPhase::Removing)
        {
            return Err(AppError::new(
                "root_recovery_required",
                "Finish the existing root removal before starting setup.",
            ));
        }
        let runtime = Arc::new(helper_payloads::root_runtime()?);
        let query = helper_payloads::home_query()?;
        let ownership = tv_session::acquire(&self.directory, host).await?;
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), current.as_ref())?;
        let info = self
            .device_info(address)
            .await?
            .ok_or_else(root_install::failed)?;
        let source = source(&info)?;
        let check = TcpSocket::new_v4().map_err(|_| requirements())?;
        check
            .bind(SocketAddrV4::new(source, 0).into())
            .map_err(|_| requirements())?;
        drop(check);
        let upstream =
            Arc::new(root_package::upstream_files(self.directory.join("root-cache")).await?);
        let (connection, _) = self
            .connect(address, super::Route::DeveloperRequired(source))
            .await?;
        let store = root_pairing::store::Store::open(&self.directory, host, expected).await?;
        let session = Session {
            owner: self,
            host,
            expected: Some(expected.into()),
            info: Some(info),
            bridge_proof: None,
            receipt: before,
            connection,
            _ownership: ownership,
        };
        let saved = store.document.clone();
        let mut io = Native::new(
            session,
            store,
            runtime,
            query,
            Some(upstream),
            Purpose::Install,
        );
        let source = source.to_string();
        root_install::setup(
            &mut io,
            Parameters {
                host,
                expected,
                source: &source,
            },
            saved,
        )
        .await
    }
}
#[cfg(test)]
mod tests;
