use super::digest::sha256_hex;
use native_tls::Protocol;
use serde::Serialize;
use serde_json::{json, Value};
use std::{net::Ipv4Addr, time::Duration};
use subtle::ConstantTimeEq;
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpStream,
};

pub(super) const HELPER_APP_ID: &str = "org.aerotizen.roothelper";
const PROTOCOL_VERSION: u64 = 1;
const NONCE_BYTES: usize = 16;
const MAX_REPLY_BYTES: usize = 8192;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(8);
const LEARN_TIMEOUT: Duration = Duration::from_secs(25);

// Pairing material is never serialized or formatted into an error.
pub(super) struct Pairing {
    pub port: u16,
    pub installation_id: String,
    pub device_identity: String,
    pub certificate_sha256: String,
    pub token: String,
}

#[derive(Debug, PartialEq)]
pub(super) enum BridgeError {
    Connection,
    Certificate,
    Proof,
    Reply,
    Timeout,
}

fn nonce() -> Result<String, BridgeError> {
    let mut value = [0; NONCE_BYTES];
    getrandom::fill(&mut value).map_err(|_| BridgeError::Connection)?;
    Ok(value.iter().map(|byte| format!("{byte:02x}")).collect())
}

fn verified_reply(
    reply: Value,
    expected_nonce: &str,
    pairing: &Pairing,
) -> Result<Value, BridgeError> {
    let boot = reply["boot_id"].as_str().ok_or(BridgeError::Proof)?;
    let parsed = uuid::Uuid::parse_str(boot).map_err(|_| BridgeError::Proof)?;
    if reply["protocol"].as_u64() != Some(PROTOCOL_VERSION)
        || reply["authenticated"] != true
        || reply["nonce"] != expected_nonce
        || reply["app_id"] != HELPER_APP_ID
        || reply["installation_id"] != pairing.installation_id
        || reply["device_identity_sha256"] != pairing.device_identity
        || ["uid", "euid", "gid"]
            .iter()
            .any(|key| reply[key].as_i64() != Some(0))
        || parsed.hyphenated().to_string() != boot
    {
        return Err(BridgeError::Proof);
    }
    Ok(reply)
}

#[derive(Clone, Copy)]
pub(super) enum ReadRequest {
    Status,
    DiscoverButtons,
    SavedButtons,
}

impl ReadRequest {
    fn payload(self, pairing: &Pairing, nonce: &str) -> Value {
        let mut value = json!({"protocol": PROTOCOL_VERSION, "operation": "status", "token": pairing.token, "nonce": nonce});
        if let Self::DiscoverButtons | Self::SavedButtons = self {
            value["operation"] = json!("buttons");
            let action = if matches!(self, Self::DiscoverButtons) {
                "list"
            } else {
                "status"
            };
            value["buttons"] = json!({"action": action, "apply": false});
        }
        value
    }
}

#[derive(Serialize)]
#[cfg_attr(test, derive(serde::Deserialize))]
#[serde(tag = "action", rename_all = "snake_case")]
pub(super) enum ButtonEdit {
    Map { button: String, app_id: String },
    Disable { button: String },
    Unmap { button: String },
    Learn { button: String },
    Rename { button: String, new_name: String },
    Reset,
}

enum Request<'a> {
    Read(ReadRequest),
    ButtonEdit(&'a ButtonEdit),
}

impl Request<'_> {
    fn payload(self, pairing: &Pairing, nonce: &str) -> Value {
        match self {
            Self::Read(operation) => operation.payload(pairing, nonce),
            Self::ButtonEdit(edit) => {
                let mut value = ReadRequest::Status.payload(pairing, nonce);
                value["operation"] = json!("buttons");
                value["buttons"] = json!(edit);
                value["buttons"]["apply"] = json!(true);
                value
            }
        }
    }
}

async fn request(
    host: Ipv4Addr,
    pairing: &Pairing,
    operation: Request<'_>,
) -> Result<Value, BridgeError> {
    // The helper uses a self-signed certificate. Match the exact saved DER pin
    // before sending the token; ordinary CA/hostname verification cannot identify it.
    let connector = native_tls::TlsConnector::builder()
        .min_protocol_version(Some(Protocol::Tlsv12))
        .danger_accept_invalid_certs(true)
        .danger_accept_invalid_hostnames(true)
        .use_sni(false)
        .build()
        .map_err(|_| BridgeError::Connection)?;
    let tcp = TcpStream::connect((host, pairing.port))
        .await
        .map_err(|_| BridgeError::Connection)?;
    let mut secured = tokio_native_tls::TlsConnector::from(connector)
        .connect(&host.to_string(), tcp)
        .await
        .map_err(|_| BridgeError::Connection)?;
    let certificate = secured
        .get_ref()
        .peer_certificate()
        .map_err(|_| BridgeError::Certificate)?
        .ok_or(BridgeError::Certificate)?
        .to_der()
        .map_err(|_| BridgeError::Certificate)?;
    if !bool::from(
        sha256_hex(&certificate)
            .as_bytes()
            .ct_eq(pairing.certificate_sha256.as_bytes()),
    ) {
        return Err(BridgeError::Certificate);
    }
    let nonce = nonce()?;
    let request = operation.payload(pairing, &nonce);
    secured
        .write_all(format!("{request}\n").as_bytes())
        .await
        .map_err(|_| BridgeError::Connection)?;
    let mut reply = Vec::new();
    BufReader::new(secured)
        .take((MAX_REPLY_BYTES + 2) as u64)
        .read_until(b'\n', &mut reply)
        .await
        .map_err(|_| BridgeError::Connection)?;
    if reply.last() != Some(&b'\n') || reply.len() > MAX_REPLY_BYTES + 1 {
        return Err(BridgeError::Reply);
    }
    let reply = serde_json::from_slice(&reply).map_err(|_| BridgeError::Reply)?;
    verified_reply(reply, &nonce, pairing)
}

pub(super) async fn status(host: Ipv4Addr, pairing: &Pairing) -> Result<Value, BridgeError> {
    timed_status(host, pairing, REQUEST_TIMEOUT).await
}

pub(super) async fn read(
    host: Ipv4Addr,
    pairing: &Pairing,
    operation: ReadRequest,
) -> Result<Value, BridgeError> {
    tokio::time::timeout(
        REQUEST_TIMEOUT,
        request(host, pairing, Request::Read(operation)),
    )
    .await
    .map_err(|_| BridgeError::Timeout)?
}

pub(super) async fn edit_button(
    host: Ipv4Addr,
    pairing: &Pairing,
    edit: &ButtonEdit,
) -> Result<Value, BridgeError> {
    tokio::time::timeout(
        edit_timeout(edit),
        request(host, pairing, Request::ButtonEdit(edit)),
    )
    .await
    .map_err(|_| BridgeError::Timeout)?
}

fn edit_timeout(edit: &ButtonEdit) -> Duration {
    if matches!(edit, ButtonEdit::Learn { .. }) {
        LEARN_TIMEOUT
    } else {
        REQUEST_TIMEOUT
    }
}

async fn timed_status(
    host: Ipv4Addr,
    pairing: &Pairing,
    timeout: Duration,
) -> Result<Value, BridgeError> {
    tokio::time::timeout(
        timeout,
        request(host, pairing, Request::Read(ReadRequest::Status)),
    )
    .await
    .map_err(|_| BridgeError::Timeout)?
}

#[cfg(test)]
pub(super) mod tests;
