use crate::models::{AppError, AppResult};
use serde::{de::DeserializeOwned, Deserialize};
use serde_json::{json, Value};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

const PROTOCOL_VERSION: u32 = 1;
const WORKER_TIMEOUT_SECONDS: u64 = 120;
const ROOT_WRITE_TIMEOUT_SECONDS: u64 = 600;
const MAX_RESPONSE_BYTES: usize = 64 * 1024;
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x08000000;

#[derive(Deserialize)]
struct Reply {
    protocol: u32,
    id: String,
    result: Option<Value>,
    error: Option<AppError>,
}

pub fn binary_path() -> AppResult<PathBuf> {
    if cfg!(debug_assertions) {
        return Ok(PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("binaries")
            .join(env!("WORKER_FILENAME")));
    }
    let executable = std::env::current_exe().map_err(|_| unavailable())?;
    let parent = executable.parent().ok_or_else(unavailable)?;
    Ok(parent.join(if cfg!(windows) {
        "aerotizen-worker.exe"
    } else {
        "aerotizen-worker"
    }))
}

fn unavailable() -> AppError {
    AppError::new(
        "worker_unavailable",
        "The TV backend could not start. Reinstall this desktop app and retry.",
    )
}

#[cfg(target_os = "macos")]
fn request_local_network_access(operation: &str, params: &Value) {
    use std::net::{Ipv4Addr, UdpSocket};

    const DISCARD_SERVICE_PORT: u16 = 9;
    let address = match operation {
        "setup_root" | "upgrade_root" => params
            .get("host")
            .and_then(Value::as_str)
            .and_then(|host| host.parse::<Ipv4Addr>().ok()),
        _ => None,
    };
    if let Some(address) = address.filter(|address| !address.is_loopback()) {
        // A UDP connect sends no traffic. Keeping the responsible app alive lets macOS
        // present consent even if the short-lived worker's first request is denied.
        // https://developer.apple.com/documentation/technotes/tn3179-understanding-local-network-privacy
        if let Ok(socket) = UdpSocket::bind((Ipv4Addr::UNSPECIFIED, 0)) {
            let _ = socket.connect((address, DISCARD_SERVICE_PORT));
        }
    }
}

pub async fn request<Result: DeserializeOwned>(
    path: &Path,
    operation: &str,
    params: Value,
) -> AppResult<Result> {
    #[cfg(target_os = "macos")]
    request_local_network_access(operation, &params);
    let request_id = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| unavailable())?
        .as_nanos()
        .to_string();
    let payload = json!({
        "protocol": PROTOCOL_VERSION, "id": request_id, "operation": operation, "params": params,
    });
    let mut command = Command::new(path);
    command
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .kill_on_drop(true);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    let mut child = command.spawn().map_err(|_| unavailable())?;
    let mut input = child.stdin.take().ok_or_else(unavailable)?;
    input
        .write_all(format!("{payload}\n").as_bytes())
        .await
        .map_err(|_| unavailable())?;
    drop(input);
    let timeout_seconds = match operation {
        "setup_root" | "upgrade_root" => ROOT_WRITE_TIMEOUT_SECONDS,
        _ => WORKER_TIMEOUT_SECONDS,
    };
    let output = tokio::time::timeout(
        Duration::from_secs(timeout_seconds),
        child.wait_with_output(),
    )
    .await;
    let output = output
        .map_err(|_| {
            AppError::new(
            "connection_timeout",
            match operation {
                "setup_root" => "Root setup timed out. Refresh Root access to check the saved progress before retrying.",
                "upgrade_root" => "Root update timed out. Refresh Root access to check the saved progress before retrying.",
                _ => "The request timed out. Check the network and retry.",
            },
        )
        })?
        .map_err(|_| unavailable())?;
    if !output.status.success() || output.stdout.len() > MAX_RESPONSE_BYTES {
        return Err(unavailable());
    }
    let reply: Reply = serde_json::from_slice(&output.stdout).map_err(|_| unavailable())?;
    if reply.protocol != PROTOCOL_VERSION || reply.id != request_id {
        return Err(AppError::new(
            "worker_incompatible",
            "The TV backend version does not match this app.",
        ));
    }
    match (reply.result, reply.error) {
        (Some(value), None) => decode_result(value),
        (None, Some(error)) => Err(error),
        _ => Err(unavailable()),
    }
}

pub fn decode_result<Result: DeserializeOwned>(value: Value) -> AppResult<Result> {
    serde_json::from_value(value).map_err(|_| {
        AppError::new(
            "invalid_response",
            "The TV backend returned an invalid response.",
        )
    })
}
