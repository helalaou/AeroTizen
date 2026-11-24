//! Owned native TV connections through Developer Mode or the paired relay.
mod home_backup;
mod home_control;
mod installation;
mod profile;
pub(super) mod projection;
mod removal;

use super::{
    digest::sha256_hex,
    http::bounded_body,
    root_bridge, root_pairing,
    sdb::{self, ReadCommand, Sdb},
    text::python_whitespace,
    tv_session,
};
use crate::models::{AppError, AppResult, ButtonTargetApp, RootPhase, TvAppPackage};
use reqwest::{redirect::Policy, Client};
use serde_json::Value;
use std::{
    io,
    net::{Ipv4Addr, SocketAddrV4},
    path::PathBuf,
    time::Duration,
};
use tokio::{
    net::{TcpSocket, TcpStream},
    time::{sleep, timeout},
};

const DEVICE_INFO_PORT: u16 = 8001;
const DEVICE_INFO_PATH: &str = "/api/v2/";
const MAX_DEVICE_INFO_BYTES: usize = 64 * 1024;
const DEVICE_INFO_TIMEOUT: Duration = Duration::from_secs(5);
const INVENTORY_TIMEOUT: Duration = Duration::from_secs(30);
const APP_NAMES_TIMEOUT: Duration = Duration::from_secs(15);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(8);
const CONNECT_ATTEMPTS: usize = 3;
const CONNECT_RETRY_DELAY: Duration = Duration::from_secs(2);
const MAX_IDENTITY_CHARACTERS: usize = 256;
const IDENTITY_TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone, Copy)]
struct Options {
    sdb_port: u16,
    info_port: u16,
}
const DEFAULT_OPTIONS: Options = Options {
    sdb_port: sdb::PORT,
    info_port: DEVICE_INFO_PORT,
};

pub struct TvConnection {
    directory: PathBuf,
    options: Options,
}

struct Session<'a> {
    owner: &'a TvConnection,
    host: &'a str,
    expected: Option<String>,
    info: Option<Value>,
    bridge_proof: Option<Value>,
    receipt: Option<root_pairing::Receipt>,
    connection: Sdb,
    _ownership: tv_session::TvSessionLock,
}

impl Session<'_> {
    async fn unchanged(&mut self) -> AppResult<()> {
        let current =
            root_pairing::lookup(&self.owner.directory, self.host, self.expected.as_deref())
                .await?;
        root_pairing::unchanged(self.receipt.as_ref(), current.as_ref())
    }

    async fn identity(&mut self) -> AppResult<String> {
        let duid = timeout(
            IDENTITY_TIMEOUT,
            read_identity(&mut self.connection, self.expected.as_deref()),
        )
        .await
        .map_err(|_| connection_failed())??;
        if self.expected.is_none() {
            self.expected = Some(sha256_hex(duid.as_bytes()));
        }
        Ok(duid)
    }

    async fn home_status(&mut self) -> AppResult<Option<Value>> {
        self.unchanged().await?;
        let (Some(receipt), Some(proof)) = (self.receipt.as_ref(), self.bridge_proof.as_ref())
        else {
            return Ok(None);
        };
        const HOME_STATUS_PROTOCOL: u64 = 1;
        if proof["home_status_protocol"].as_u64() != Some(HOME_STATUS_PROTOCOL) {
            return Ok(None);
        }
        let reply = root_bridge::read(
            root_pairing::host_address(self.host)?,
            &receipt.pairing,
            root_bridge::ReadRequest::HomeStatus,
        )
        .await
        .map_err(|_| connection_failed())?;
        if reply["boot_id"] != proof["boot_id"] {
            return Err(connection_failed());
        }
        self.unchanged().await?;
        Ok(Some(reply))
    }

    async fn inventory(&mut self) -> AppResult<String> {
        timeout(INVENTORY_TIMEOUT, async {
            self.unchanged().await?;
            self.identity().await?;
            let raw = self
                .connection
                .read(ReadCommand::AppList)
                .await
                .map_err(|_| connection_failed())?;
            self.identity().await?;
            self.unchanged().await?;
            Ok(raw)
        })
        .await
        .map_err(|_| connection_failed())?
    }
}

#[derive(Clone, Copy)]
enum Route<'a> {
    Paired(&'a root_bridge::Pairing),
    Developer(Option<Ipv4Addr>),
}
enum ConnectFailure {
    Retry,
    Refused,
}

fn connection_failed() -> AppError {
    AppError::new(
        "connection_failed",
        "Could not connect. Check the TV address, Developer Mode and Host PC IP. Also allow AeroTizen Desktop to access the local network in system settings.",
    )
}

fn invalid_response() -> AppError {
    AppError::new(
        "invalid_response",
        "The TV returned an unsupported response.",
    )
}

fn route<'a>(
    receipt: Option<&'a root_pairing::Receipt>,
    developer: Option<&Value>,
) -> AppResult<Route<'a>> {
    let Some(receipt) = receipt else {
        return Ok(Route::Developer(None));
    };
    let loopback = developer.is_some_and(|value| value == "127.0.0.1");
    if receipt.phase != RootPhase::Removed && (developer.is_none_or(Value::is_null) || loopback) {
        return Ok(Route::Paired(&receipt.pairing));
    }
    if loopback {
        return Err(connection_failed());
    }
    Ok(Route::Developer(
        developer
            .and_then(Value::as_str)
            .and_then(|value| value.parse().ok()),
    ))
}

impl TvConnection {
    pub fn new(directory: PathBuf) -> Self {
        Self {
            directory,
            options: DEFAULT_OPTIONS,
        }
    }

    #[cfg(test)]
    pub(super) fn with_ports(directory: PathBuf, sdb_port: u16, info_port: u16) -> Self {
        Self {
            directory,
            options: Options {
                sdb_port,
                info_port,
            },
        }
    }

    pub async fn packages(&self, host: &str, expected: &str) -> AppResult<Vec<TvAppPackage>> {
        let raw = self.read_bounded(host, expected, INVENTORY_TIMEOUT).await?;
        tokio::task::spawn_blocking(move || projection::packages(&raw))
            .await
            .map_err(|_| invalid_response())?
    }

    pub async fn targets(&self, host: &str, expected: &str) -> AppResult<Vec<ButtonTargetApp>> {
        let raw = self.read_bounded(host, expected, APP_NAMES_TIMEOUT).await?;
        tokio::task::spawn_blocking(move || projection::targets(&raw))
            .await
            .map_err(|_| invalid_response())?
    }

    pub(super) async fn installed(
        &self,
        host: &str,
        expected: &str,
        package_id: String,
        app_id: String,
    ) -> AppResult<(Option<String>, Option<String>)> {
        let raw = self.read_bounded(host, expected, INVENTORY_TIMEOUT).await?;
        tokio::task::spawn_blocking(move || projection::installed(&raw, &package_id, &app_id))
            .await
            .map_err(|_| invalid_response())?
    }

    async fn read_bounded(
        &self,
        host: &str,
        expected: &str,
        deadline: Duration,
    ) -> AppResult<String> {
        timeout(deadline, self.read(host, expected))
            .await
            .map_err(|_| connection_failed())?
    }

    async fn read(&self, host: &str, expected: &str) -> AppResult<String> {
        self.session(host, expected).await?.inventory().await
    }

    async fn session<'a>(&'a self, host: &'a str, expected: &'a str) -> AppResult<Session<'a>> {
        self.open(host, Some(expected), false).await
    }

    async fn open<'a>(
        &'a self,
        host: &'a str,
        expected: Option<&str>,
        include_info: bool,
    ) -> AppResult<Session<'a>> {
        let address = root_pairing::host_address(host)?;
        if expected.is_some_and(|value| !crate::models::valid_identity(value)) {
            return Err(AppError::new(
                "invalid_request",
                "The saved TV identity is invalid.",
            ));
        }
        let before = root_pairing::lookup(&self.directory, host, expected).await?;
        let ownership = tv_session::acquire(&self.directory, host).await?;
        let locked = root_pairing::lookup(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), locked.as_ref())?;
        let info = if before.is_some() || include_info {
            self.device_info(address).await?
        } else {
            None
        };
        let selected = route(
            before.as_ref(),
            info.as_ref().and_then(|info| info.get("developerIP")),
        )?;
        let (connection, bridge_proof) = self.connect(address, selected).await?;
        let expected = expected.map(str::to_owned).or_else(|| {
            before
                .as_ref()
                .and_then(|r| r.document["duid_sha256"].as_str().map(str::to_owned))
        });
        Ok(Session {
            owner: self,
            host,
            expected,
            info,
            bridge_proof,
            receipt: before,
            connection,
            _ownership: ownership,
        })
    }

    async fn device_info(&self, address: Ipv4Addr) -> AppResult<Option<Value>> {
        let client = Client::builder()
            .no_proxy()
            .redirect(Policy::none())
            .http1_only()
            .timeout(DEVICE_INFO_TIMEOUT)
            .build()
            .map_err(|_| connection_failed())?;
        let Ok(response) = client
            .get(format!(
                "http://{address}:{}{DEVICE_INFO_PATH}",
                self.options.info_port
            ))
            .send()
            .await
        else {
            return Ok(None);
        };
        if !response.status().is_success() {
            return Ok(None);
        }
        let Some(body) = bounded_body(response, MAX_DEVICE_INFO_BYTES).await else {
            return Ok(None);
        };
        let value: Value = serde_json::from_slice(&body).map_err(|_| invalid_response())?;
        let device = value
            .get("device")
            .and_then(Value::as_object)
            .ok_or_else(invalid_response)?;
        Ok(Some(Value::Object(device.clone())))
    }

    async fn connect(
        &self,
        address: Ipv4Addr,
        route: Route<'_>,
    ) -> AppResult<(Sdb, Option<Value>)> {
        for attempt in 0..CONNECT_ATTEMPTS {
            let outcome = timeout(CONNECT_TIMEOUT, self.connect_once(address, route)).await;
            match outcome {
                Ok(Ok(connection)) => return Ok(connection),
                Ok(Err(ConnectFailure::Refused)) => break,
                _ if attempt + 1 < CONNECT_ATTEMPTS => sleep(CONNECT_RETRY_DELAY).await,
                _ => break,
            }
        }
        Err(connection_failed())
    }

    async fn connect_once(
        &self,
        address: Ipv4Addr,
        route: Route<'_>,
    ) -> Result<(Sdb, Option<Value>), ConnectFailure> {
        let (socket, proof): (sdb::Socket, Option<Value>) = match route {
            Route::Paired(pairing) => {
                let (stream, proof) =
                    root_bridge::open_sdb(address, pairing)
                        .await
                        .map_err(|error| match error {
                            root_bridge::BridgeError::Connection
                            | root_bridge::BridgeError::Timeout => ConnectFailure::Retry,
                            _ => ConnectFailure::Refused,
                        })?;
                (Box::new(stream), Some(proof))
            }
            Route::Developer(source) => {
                let bound = source.and_then(|source| {
                    let socket = TcpSocket::new_v4().ok()?;
                    socket.bind(SocketAddrV4::new(source, 0).into()).ok()?;
                    Some(socket)
                });
                let target = SocketAddrV4::new(address, self.options.sdb_port);
                let stream = if let Some(socket) = bound {
                    socket.connect(target.into()).await
                } else {
                    TcpStream::connect(target).await
                }
                .map_err(|_| ConnectFailure::Retry)?;
                (Box::new(stream), None)
            }
        };
        Sdb::connect(socket)
            .await
            .map(|connection| (connection, proof))
            .map_err(|error| {
                if error.kind() == io::ErrorKind::InvalidData {
                    ConnectFailure::Refused
                } else {
                    ConnectFailure::Retry
                }
            })
    }
}

async fn read_identity(connection: &mut Sdb, expected: Option<&str>) -> AppResult<String> {
    let raw = connection
        .read(ReadCommand::Identity)
        .await
        .map_err(|_| connection_failed())?;
    let duid = raw.trim_matches(python_whitespace);
    if duid.is_empty()
        || duid.chars().count() > MAX_IDENTITY_CHARACTERS
        || duid.to_lowercase().contains("fail")
    {
        return Err(AppError::new(
            "identity_unavailable",
            "The TV did not return its device identity.",
        ));
    }
    if expected.is_some_and(|expected| sha256_hex(duid.as_bytes()) != expected) {
        return Err(AppError::new(
            "identity_mismatch",
            "This address belongs to a different TV. No changes were made.",
        ));
    }
    Ok(duid.into())
}

#[cfg(test)]
pub(crate) mod tests;
