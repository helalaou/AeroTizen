//! Owned, cancellable app inventory reads over Developer Mode or the paired relay.
mod projection;

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

#[derive(Clone, Copy)]
struct Options {
    sdb_port: u16,
    info_port: u16,
}
const DEFAULT_OPTIONS: Options = Options {
    sdb_port: sdb::PORT,
    info_port: DEVICE_INFO_PORT,
};

pub struct AppReads {
    directory: PathBuf,
    options: Options,
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
        "Could not read the TV's apps. Check the TV connection, Developer Mode and Host PC IP, then refresh.",
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

impl AppReads {
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
        let address = root_pairing::address(host, expected)?;
        let before = root_pairing::load(&self.directory, host, expected).await?;
        let _ownership = tv_session::acquire(&self.directory, host).await?;
        let locked = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), locked.as_ref())?;
        let developer = if before.is_some() {
            self.developer_host(address).await?
        } else {
            None
        };
        let selected = route(before.as_ref(), developer.as_ref())?;
        let mut connection = self.connect(address, selected).await?;
        verify_identity(&mut connection, expected).await?;
        let raw = connection
            .read(ReadCommand::AppList)
            .await
            .map_err(|_| connection_failed())?;
        verify_identity(&mut connection, expected).await?;
        let after = root_pairing::load(&self.directory, host, expected).await?;
        root_pairing::unchanged(before.as_ref(), after.as_ref())?;
        Ok(raw)
    }

    async fn developer_host(&self, address: Ipv4Addr) -> AppResult<Option<Value>> {
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
        Ok(device.get("developerIP").cloned())
    }

    async fn connect(&self, address: Ipv4Addr, route: Route<'_>) -> AppResult<Sdb> {
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
    ) -> Result<Sdb, ConnectFailure> {
        let socket: sdb::Socket = match route {
            Route::Paired(pairing) => {
                Box::new(root_bridge::open_sdb(address, pairing).await.map_err(
                    |error| match error {
                        root_bridge::BridgeError::Connection
                        | root_bridge::BridgeError::Timeout => ConnectFailure::Retry,
                        _ => ConnectFailure::Refused,
                    },
                )?)
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
                Box::new(stream)
            }
        };
        Sdb::connect(socket).await.map_err(|error| {
            if error.kind() == io::ErrorKind::InvalidData {
                ConnectFailure::Refused
            } else {
                ConnectFailure::Retry
            }
        })
    }
}

async fn verify_identity(connection: &mut Sdb, expected: &str) -> AppResult<()> {
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
    if sha256_hex(duid.as_bytes()) != expected {
        return Err(AppError::new(
            "identity_mismatch",
            "This address belongs to a different TV. No changes were made.",
        ));
    }
    Ok(())
}

#[cfg(test)]
mod tests;
