//! Root update transport reuses the fixed signed helper and private bootstrap owner.
use super::{
    root_install::{source, Native, Purpose},
    root_pairing, Route, Session, TvConnection,
};
use crate::{
    models::{AppError, AppResult, RootPhase},
    services::{helper_payloads, root_package, root_update, tv_session},
};
use std::{net::SocketAddrV4, sync::Arc, time::Duration};
use tokio::{net::TcpSocket, time::timeout};
const UPDATE_TIMEOUT: Duration = Duration::from_secs(600);
impl TvConnection {
    pub(in crate::services) async fn update_root_helper(
        &self,
        host: &str,
        expected: &str,
        resume: bool,
    ) -> AppResult<()> {
        root_pairing::address(host, expected)?;
        timeout(UPDATE_TIMEOUT,self.update_root_inner(host,expected,resume)).await
            .map_err(|_|AppError::new("connection_timeout","Root update timed out. Refresh Root access to check saved progress before retrying."))?
            .map_err(|error| if error.code=="root_setup_failed" {root_update::failed()} else {error})
    }
    async fn update_root_inner(&self, host: &str, expected: &str, resume: bool) -> AppResult<()> {
        let address = root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected)
            .await?
            .filter(|receipt| receipt.phase == RootPhase::Active)
            .ok_or_else(|| {
                AppError::new(
                    "root_state_changed",
                    "Complete Root setup before updating the helper.",
                )
            })?;
        root_update::review(&before.document, resume)?;
        let runtime = Arc::new(helper_payloads::root_runtime()?);
        let config = root_package::public_config(&before.document, &runtime);
        root_update::check(&before.document, &config, resume)?;
        let query = helper_payloads::home_query()?;
        let ownership = tv_session::acquire(&self.directory, host).await?;
        let current = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(Some(&before), current.as_ref())?;
        let info = self
            .device_info(address)
            .await?
            .ok_or_else(root_update::failed)?;
        let recovery = info["developerIP"] != "127.0.0.1";
        if recovery
            && before
                .document
                .get("upgrade")
                .is_none_or(serde_json::Value::is_null)
        {
            return Err(root_update::requirements("Keep Developer Mode on and Host PC IP set to 127.0.0.1 before starting the update."));
        }
        let route = if recovery {
            let source = source(&info)?;
            let socket = TcpSocket::new_v4().map_err(|_| root_update::failed())?;
            socket
                .bind(SocketAddrV4::new(source, 0).into())
                .map_err(|_| {
                    root_update::requirements(
                        "Set Host PC IP to this computer's address to recover the pending update.",
                    )
                })?;
            Route::DeveloperRequired(source)
        } else {
            Route::Paired(&before.pairing)
        };
        let (connection, proof) = self.connect(address, route).await?;
        let store = root_pairing::store::Store::open(&self.directory, host, expected).await?;
        let document = before.document.clone();
        let session = Session {
            owner: self,
            host,
            expected: Some(expected.into()),
            info: Some(info),
            bridge_proof: proof,
            receipt: Some(before),
            connection,
            _ownership: ownership,
        };
        let mut io = Native::new(session, store, runtime, query, None, Purpose::Update);
        root_update::update(&mut io, document, config, expected, resume, recovery).await
    }
}
