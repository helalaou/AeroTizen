use super::{connection_failed, invalid_response, projection, sdb::ReadCommand, TvConnection};
use crate::models::{
    AppResult, HomeRoutingMode, NativeHomeSettings, TechnicalDetails, VerifiedTv, LAUNCHER_APP_ID,
};
use regex::Regex;
use serde_json::Value;
use std::{
    collections::HashMap,
    path::Path,
    sync::OnceLock,
    time::{Duration, SystemTime},
};
use tokio::time::timeout;

const PROFILE_TIMEOUT: Duration = Duration::from_secs(120);
const CAPABILITY_TIMEOUT: Duration = Duration::from_secs(5);
const WATCHER_TIMEOUT: Duration = Duration::from_secs(2);
const ROUTING_PROTOCOL: u64 = 1;
const TEXT_CHARACTERS: usize = 256;
const ARCHITECTURES: [&str; 9] = [
    "arm", "armv7", "armv7l", "aarch64", "arm64", "x86", "x86_64", "x64", "ia32",
];
pub(super) const CERTIFICATE_FILES: [&str; 4] = [
    "author.p12",
    "distributor.p12",
    "password.txt",
    "device-profile.xml",
];

fn text(value: Option<&Value>, fallback: &str) -> String {
    super::super::text::display_text(value, TEXT_CHARACTERS).unwrap_or_else(|| fallback.into())
}
fn allow(
    value: Option<&Value>,
    pattern: &'static str,
    compiled: &'static OnceLock<Regex>,
) -> Option<String> {
    let value = value?.as_str()?;
    compiled
        .get_or_init(|| Regex::new(pattern).unwrap())
        .is_match(value)
        .then(|| value.into())
}
fn details(
    info: &Value,
    capabilities: &HashMap<String, Value>,
    proof: Option<&Value>,
) -> TechnicalDetails {
    static MODEL: OnceLock<Regex> = OnceLock::new();
    static VERSION: OnceLock<Regex> = OnceLock::new();
    static PLATFORM: OnceLock<Regex> = OnceLock::new();
    const VERSION_PATTERN: &str = r"^[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}$";
    TechnicalDetails {
        model_code: allow(
            info.get("modelName"),
            r"^[A-Z]{2,6}[0-9][A-Z0-9_-]{2,80}$",
            &MODEL,
        ),
        tizen_version: allow(
            capabilities.get("platform_version"),
            VERSION_PATTERN,
            &VERSION,
        ),
        architecture: capabilities
            .get("cpu_arch")
            .and_then(Value::as_str)
            .filter(|value| ARCHITECTURES.contains(value))
            .map(str::to_owned),
        platform: allow(
            info.get("model"),
            r"^[A-Z0-9][A-Z0-9_.-]{1,127}$",
            &PLATFORM,
        )
        .filter(|value| value.bytes().any(|b| b.is_ascii_digit())),
        root_runtime_version: allow(
            proof.and_then(|proof| proof.get("runtime_version")),
            VERSION_PATTERN,
            &VERSION,
        ),
    }
}

fn native_settings(reply: &Value) -> Option<NativeHomeSettings> {
    let value = reply.get("home_settings")?.as_object()?;
    let app = |field| {
        value
            .get(field)
            .and_then(Value::as_str)
            .filter(|value| value.is_empty() || super::sdb::valid_identifier(value))
            .map(str::to_owned)
    };
    Some(NativeHomeSettings {
        home_button_app: app("home_button_app"),
        home_app: app("home_app"),
        startup_app: app("startup_app"),
        startup_backup_app: app("startup_backup_app"),
        smart_hub_autostart: value.get("smart_hub_autostart").and_then(Value::as_bool),
    })
}

fn routing(raw: &str) -> Option<HomeRoutingMode> {
    let (header, body) = raw.split_once("\r\n\r\n")?;
    if !header.starts_with("HTTP/1.0 ") && !header.starts_with("HTTP/1.1 ") {
        return None;
    }
    let status = header.lines().next()?.split_whitespace().nth(1)?;
    if status != "200" {
        return None;
    }
    let mut length = None;
    let mut chunked = false;
    for line in header.lines().skip(1) {
        let (name, value) = line.split_once(':')?;
        if name.eq_ignore_ascii_case("transfer-encoding") {
            if chunked || !value.trim().eq_ignore_ascii_case("chunked") {
                return None;
            }
            chunked = true;
        }
        if name.eq_ignore_ascii_case("content-length") {
            if length.is_some() {
                return None;
            }
            length = Some(value.trim().parse::<usize>().ok()?);
        }
    }
    if chunked && length.is_some() {
        return None;
    }
    let decoded;
    let body = if chunked {
        decoded = chunks(body.as_bytes())?;
        std::str::from_utf8(&decoded).ok()?
    } else {
        match length {
            Some(length) => body.get(..length)?,
            None => body,
        }
    };
    let value: Value = serde_json::from_str(body).ok()?;
    let control = value.get("homeControl")?;
    if control["app_id"] != LAUNCHER_APP_ID
        || control["protocol"].as_u64() != Some(ROUTING_PROTOCOL)
    {
        return None;
    }
    serde_json::from_value(control["mode"].clone()).ok()
}

fn chunks(mut input: &[u8]) -> Option<Vec<u8>> {
    let mut output = Vec::new();
    loop {
        let line_end = input.windows(2).position(|w| w == b"\r\n")?;
        let length = std::str::from_utf8(&input[..line_end])
            .ok()?
            .split(';')
            .next()?;
        if length.is_empty() || length.len() > 8 || !length.bytes().all(|b| b.is_ascii_hexdigit()) {
            return None;
        }
        let length = usize::from_str_radix(length, 16).ok()?;
        input = &input[line_end + 2..];
        if length == 0 {
            return Some(output);
        }
        let chunk = input.get(..length)?;
        if input.get(length..length.checked_add(2)?)? != b"\r\n" {
            return None;
        }
        output.extend_from_slice(chunk);
        input = &input[length + 2..];
    }
}

pub(super) fn supported_duid(duid: &str) -> bool {
    !duid.is_empty()
        && !duid.starts_with('.')
        && !duid.ends_with('.')
        && duid
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_#.-".contains(&b))
}

pub(super) fn signing_ready(directory: &Path, duid: &str) -> bool {
    supported_duid(duid)
        && CERTIFICATE_FILES
            .iter()
            .all(|file| directory.join("certs").join(duid).join(file).is_file())
}

impl TvConnection {
    pub async fn profile(&self, host: &str, expected: Option<&str>) -> AppResult<VerifiedTv> {
        timeout(PROFILE_TIMEOUT, self.profile_inner(host, expected))
            .await
            .map_err(|_| connection_failed())?
    }
    async fn profile_inner(&self, host: &str, expected: Option<&str>) -> AppResult<VerifiedTv> {
        let mut session = self.open(host, expected, true).await?;
        let duid = session.identity().await?;
        let identity = super::sha256_hex(duid.as_bytes());
        let raw = session.inventory().await?;
        let launcher_version = tokio::task::spawn_blocking(move || projection::launcher(&raw))
            .await
            .map_err(|_| invalid_response())??;
        let capabilities = timeout(
            CAPABILITY_TIMEOUT,
            session.connection.read(ReadCommand::Capabilities),
        )
        .await
        .ok()
        .and_then(Result::ok)
        .unwrap_or_default();
        let capabilities: HashMap<_, _> = capabilities
            .lines()
            .filter_map(|line| line.split_once(':'))
            .map(|(key, value)| {
                (
                    key.trim_matches([' ', '\0', '�']).to_owned(),
                    Value::String(value.trim().into()),
                )
            })
            .collect();
        session.identity().await?;
        let native_home_settings = session
            .home_status()
            .await
            .ok()
            .flatten()
            .as_ref()
            .and_then(native_settings);
        session.unchanged().await?;
        let home_routing_mode = if launcher_version.is_some() {
            timeout(WATCHER_TIMEOUT, session.connection.watcher_status())
                .await
                .ok()
                .and_then(Result::ok)
                .and_then(|raw| routing(&raw))
        } else {
            None
        };
        session.unchanged().await?;
        let directory = self.directory.clone();
        let launcher_signing_ready =
            tokio::task::spawn_blocking(move || signing_ready(&directory, &duid))
                .await
                .map_err(|_| invalid_response())?;
        let info = session.info.as_ref().cloned().unwrap_or(Value::Null);
        let technical_details = details(&info, &capabilities, session.bridge_proof.as_ref());
        Ok(VerifiedTv {
            identity_sha256: identity.clone(),
            host: host.into(),
            name: text(info.get("name"), "Samsung TV"),
            model: text(info.get("modelName"), "Samsung TV"),
            launcher_version,
            launcher_signing_ready,
            transport: if session.bridge_proof.is_some() {
                "paired_root"
            } else {
                "developer"
            }
            .into(),
            developer_mode: text(info.get("developerMode"), "Unknown"),
            developer_host: text(info.get("developerIP"), "Unknown"),
            checked_at: chrono::DateTime::<chrono::Utc>::from(SystemTime::now())
                .to_rfc3339_opts(chrono::SecondsFormat::Micros, false),
            technical_details,
            home_backup: Some(
                super::super::home_backups::HomeBackups::new(self.directory.clone())
                    .summary(&identity)
                    .await,
            ),
            home_routing_mode,
            native_home_settings,
        })
    }
}

#[cfg(test)]
mod tests;
