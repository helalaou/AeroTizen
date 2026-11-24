//! Send private Root setup input over pinned TLS, never in shared SDK uploads.
use super::{
    digest::sha256_hex,
    helper_payloads,
    sdb::Sdb,
    sdk::{self, Completion, PayloadFile},
};
use crate::models::{AppError, AppResult};
use openssl::pkcs12::Pkcs12;
use std::{
    net::{IpAddr, Ipv4Addr},
    sync::Arc,
    time::Duration,
};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, UdpSocket},
    time::timeout,
};
use tokio_rustls::{
    rustls::{
        self,
        pki_types::{CertificateDer, PrivatePkcs8KeyDer},
    },
    TlsAcceptor,
};
const MAX_INPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_PFX_BYTES: usize = 32 * 1024;
const AUTH_BYTES: usize = 64;
const ROUTE_PORT: u16 = 9;
const ACCEPT_TIMEOUT: Duration = Duration::from_secs(25);
const CONNECTION_TIMEOUT: Duration = Duration::from_secs(15);
const TRANSFER_TIMEOUT: Duration = Duration::from_secs(75);
fn failed() -> AppError {
    AppError::new("root_setup_failed","The private Root setup transfer was not confirmed. Keep the recovery files and refresh Root access before retrying.")
}
pub(super) fn identity(pfx: &[u8], pin: &str) -> AppResult<TlsAcceptor> {
    if pfx.is_empty() || pfx.len() > MAX_PFX_BYTES {
        return Err(failed());
    }
    let decoded = Pkcs12::from_der(pfx)
        .and_then(|archive| archive.parse2(""))
        .map_err(|_| failed())?;
    let key = decoded.pkey.ok_or_else(failed)?;
    let certificate = decoded.cert.ok_or_else(failed)?;
    let certificate = certificate.to_der().map_err(|_| failed())?;
    if !bool::from(sha256_hex(&certificate).as_bytes().ct_eq(pin.as_bytes())) {
        return Err(failed());
    }
    let key = key.private_key_to_pkcs8().map_err(|_| failed())?;
    let config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(|_| failed())?
    .with_no_client_auth()
    .with_single_cert(
        vec![CertificateDer::from(certificate)],
        PrivatePkcs8KeyDer::from(key).into(),
    )
    .map_err(|_| failed())?;
    Ok(TlsAcceptor::from(Arc::new(config)))
}
async fn send(
    listener: TcpListener,
    acceptor: TlsAcceptor,
    host: Ipv4Addr,
    token: &str,
    payload: &[u8],
) -> AppResult<()> {
    let (socket, peer) = timeout(ACCEPT_TIMEOUT, listener.accept())
        .await
        .map_err(|_| failed())?
        .map_err(|_| failed())?;
    if peer.ip() != IpAddr::V4(host) {
        return Err(failed());
    }
    timeout(CONNECTION_TIMEOUT, async {
        let mut socket = acceptor.accept(socket).await.map_err(|_| failed())?;
        let mut auth = Vec::new();
        loop {
            let byte = socket.read_u8().await.map_err(|_| failed())?;
            if byte == b'\n' {
                break;
            }
            auth.push(byte);
            if auth.len() > AUTH_BYTES {
                return Err(failed());
            }
        }
        if !bool::from(auth.as_slice().ct_eq(token.as_bytes())) {
            return Err(failed());
        }
        socket
            .write_u32(payload.len() as u32)
            .await
            .map_err(|_| failed())?;
        socket.write_all(payload).await.map_err(|_| failed())?;
        socket.shutdown().await.map_err(|_| failed())?;
        Ok(())
    })
    .await
    .map_err(|_| failed())?
}
pub(super) async fn run(
    connection: &mut Sdb,
    host: Ipv4Addr,
    files: &[PayloadFile],
    payload: &[u8],
    pfx: &[u8],
    pin: &str,
) -> AppResult<Completion> {
    if payload.is_empty() || payload.len() > MAX_INPUT_BYTES {
        return Err(failed());
    }
    let acceptor = identity(pfx, pin)?;
    timeout(TRANSFER_TIMEOUT, async {
        let route = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0))
            .await
            .map_err(|_| failed())?;
        route
            .connect((host, ROUTE_PORT))
            .await
            .map_err(|_| failed())?;
        let IpAddr::V4(callback) = route.local_addr().map_err(|_| failed())?.ip() else {
            return Err(failed());
        };
        drop(route);
        let listener = TcpListener::bind((callback, 0))
            .await
            .map_err(|_| failed())?;
        let port = listener
            .local_addr()
            .map_err(|_| failed())?
            .port()
            .to_string();
        let callback = callback.to_string();
        let token = super::root_package::random_hex(AUTH_BYTES / 2)?;
        let args = [
            "--bootstrap-fetch",
            callback.as_str(),
            port.as_str(),
            pin,
            token.as_str(),
        ];
        let (result, ()) = tokio::try_join!(
            sdk::run(
                connection,
                host,
                files,
                helper_payloads::ROOT_BRIDGE_ENTRYPOINT,
                &args
            ),
            send(listener, acceptor, host, &token, payload)
        )?;
        Ok(result)
    })
    .await
    .map_err(|_| failed())?
}
#[cfg(test)]
mod tests;
