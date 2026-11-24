//! Published launcher versions and release notes, without a TV or Python worker.

use super::http::bounded_body;
use crate::models::{AppError, AppResult, LauncherRelease};
use reqwest::{header::ACCEPT, redirect::Policy, Client, StatusCode};
use serde_json::Value;
use std::cmp::Ordering;
use std::collections::BTreeMap;
use std::time::Duration;

pub(super) mod download;
mod notes;

const REPOSITORY: &str = "helalaou/AeroTizen";
const RELEASES_URL: &str = "https://api.github.com/repos/helalaou/AeroTizen/releases";
const RELEASE_TAG_PREFIX: &str = "launcher-v";
const VERSION_COMPONENTS: usize = 3;
const MAX_VERSION_CHARACTERS: usize = 256;
const MANIFEST_ASSET: &str = "launcher-release.json";
const GITHUB_ACCEPT: &str = "application/vnd.github+json";
const USER_AGENT: &str = concat!("aerotizen-desktop/", env!("CARGO_PKG_VERSION"));
const PAGE_SIZE: usize = 100;
const MAX_PAGES: usize = 100;
const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;
const MAX_CATALOG_BYTES: usize = 2 * 1024 * 1024;
const JSON_ARRAY_OVERHEAD_BYTES: usize = 2;
const MAX_ATTEMPTS: usize = 3;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const CATALOG_TIMEOUT: Duration = Duration::from_secs(120);
const RETRY_BASE_DELAY: Duration = Duration::from_millis(500);

#[derive(Clone, Copy)]
struct Limits {
    pages: usize,
    result_bytes: usize,
    timeout: Duration,
    retry_base_delay: Duration,
}

const DEFAULT_LIMITS: Limits = Limits {
    pages: MAX_PAGES,
    result_bytes: MAX_CATALOG_BYTES,
    timeout: CATALOG_TIMEOUT,
    retry_base_delay: RETRY_BASE_DELAY,
};

fn unavailable() -> AppError {
    AppError::new("release_unavailable", "Could not load launcher versions.")
}

pub async fn load() -> AppResult<Vec<LauncherRelease>> {
    let client = catalog_client()?;
    let token = github_token();
    load_with(&client, RELEASES_URL, token.as_deref(), DEFAULT_LIMITS).await
}

fn github_token() -> Option<String> {
    std::env::var("GH_TOKEN")
        .ok()
        .filter(|token| !token.is_empty())
        .or_else(|| {
            std::env::var("GITHUB_TOKEN")
                .ok()
                .filter(|token| !token.is_empty())
        })
}

fn catalog_client() -> AppResult<Client> {
    Client::builder()
        .https_only(true)
        // Only the fixed API endpoint receives an optional token. Never forward it on redirects.
        .redirect(Policy::none())
        .retry(reqwest::retry::never())
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| unavailable())
}

async fn load_with(
    client: &Client,
    endpoint: &str,
    token: Option<&str>,
    limits: Limits,
) -> AppResult<Vec<LauncherRelease>> {
    tokio::time::timeout(
        limits.timeout,
        collect_pages(client, endpoint, token, limits),
    )
    .await
    .map_err(|_| unavailable())?
}

async fn collect_pages(
    client: &Client,
    endpoint: &str,
    token: Option<&str>,
    limits: Limits,
) -> AppResult<Vec<LauncherRelease>> {
    let mut entries = BTreeMap::new();
    let mut result_bytes = JSON_ARRAY_OVERHEAD_BYTES;
    for page in 1..=limits.pages {
        let url = format!("{endpoint}?per_page={PAGE_SIZE}&page={page}");
        let document = read_page(client, &url, token, limits.retry_base_delay).await?;
        let releases = document.as_array().ok_or_else(unavailable)?;
        for release in releases {
            if !release.is_object() {
                return Err(unavailable());
            }
            let Some(entry) = catalog_entry(release) else {
                continue;
            };
            if entries.contains_key(&entry.version) {
                continue;
            }
            let entry_bytes = serde_json::to_vec(&entry).map_err(|_| unavailable())?.len();
            result_bytes += entry_bytes + usize::from(!entries.is_empty());
            if result_bytes > limits.result_bytes {
                return Err(unavailable());
            }
            entries.insert(entry.version.clone(), entry);
        }
        if releases.len() < PAGE_SIZE {
            let mut entries: Vec<_> = entries.into_values().collect();
            entries.sort_unstable_by(|left, right| compare_versions(&right.version, &left.version));
            return Ok(entries);
        }
    }
    // Do not return a partial catalogue when pagination or its overall deadline is exhausted.
    Err(unavailable())
}

async fn read_page(
    client: &Client,
    url: &str,
    token: Option<&str>,
    retry_base_delay: Duration,
) -> AppResult<Value> {
    for attempt in 0..MAX_ATTEMPTS {
        let mut request = client.get(url).header(ACCEPT, GITHUB_ACCEPT);
        if let Some(token) = token {
            request = request.bearer_auth(token);
        }
        let response = request.send().await.map_err(|_| unavailable())?;
        if response.status() != StatusCode::OK {
            if let Some(delay) = retry_delay(response.status(), attempt, retry_base_delay) {
                drop(response);
                tokio::time::sleep(delay).await;
                continue;
            }
            return Err(unavailable());
        }
        let body = bounded_body(response, MAX_PAGE_BYTES)
            .await
            .ok_or_else(unavailable)?;
        return serde_json::from_slice(&body).map_err(|_| unavailable());
    }
    Err(unavailable())
}

fn retry_delay(status: StatusCode, attempt: usize, base: Duration) -> Option<Duration> {
    (attempt + 1 < MAX_ATTEMPTS
        && matches!(
            status,
            StatusCode::INTERNAL_SERVER_ERROR
                | StatusCode::BAD_GATEWAY
                | StatusCode::SERVICE_UNAVAILABLE
                | StatusCode::GATEWAY_TIMEOUT
        ))
    .then(|| base * (attempt as u32 + 1))
}

fn stable_version(version: &str) -> bool {
    let mut parts = version.split('.');
    for _ in 0..VERSION_COMPONENTS {
        let Some(part) = parts.next() else {
            return false;
        };
        if part.is_empty()
            || !part.bytes().all(|byte| byte.is_ascii_digit())
            || (part.len() > 1 && part.starts_with('0'))
        {
            return false;
        }
    }
    parts.next().is_none()
}

pub(super) fn validate_install(
    version: &str,
    current: Option<&str>,
    confirmed: bool,
) -> AppResult<()> {
    if version.len() > MAX_VERSION_CHARACTERS
        || !stable_version(version)
        || current.is_some_and(|value| value.len() > MAX_VERSION_CHARACTERS)
    {
        return Err(AppError::new(
            "invalid_request",
            "Choose a published launcher version.",
        ));
    }
    if current == Some(version) {
        return Err(AppError::new(
            "already_installed",
            "This version is already installed.",
        ));
    }
    if current.is_some_and(|value| {
        !stable_version(value) || compare_versions(version, value) == Ordering::Less
    }) && !confirmed
    {
        return Err(AppError::new(
            "confirmation_required",
            "Confirm replacement of the current version first.",
        ));
    }
    Ok(())
}

fn compare_versions(left: &str, right: &str) -> Ordering {
    // Validated numeric segments have no leading zeroes. Compare without integer overflow.
    left.split('.')
        .zip(right.split('.'))
        .map(|(left, right)| left.len().cmp(&right.len()).then_with(|| left.cmp(right)))
        .find(|order| *order != Ordering::Equal)
        .unwrap_or(Ordering::Equal)
}

fn catalog_entry(release: &Value) -> Option<LauncherRelease> {
    if release.get("draft") != Some(&Value::Bool(false))
        || release.get("prerelease") != Some(&Value::Bool(false))
    {
        return None;
    }
    let tag = release.get("tag_name")?.as_str()?;
    let version = tag.strip_prefix(RELEASE_TAG_PREFIX)?;
    if !stable_version(version) {
        return None;
    }
    let package = format!("aerotizen-launcher-{version}.wgt");
    if !valid_asset(release, tag, MANIFEST_ASSET) || !valid_asset(release, tag, &package) {
        return None;
    }
    Some(LauncherRelease {
        version: version.into(),
        sections: notes::sections(release.get("body").and_then(Value::as_str)),
    })
}

fn valid_asset(release: &Value, tag: &str, name: &str) -> bool {
    let Some(assets) = release.get("assets").and_then(Value::as_array) else {
        return false;
    };
    let mut matching = assets
        .iter()
        .filter(|asset| asset.get("name").and_then(Value::as_str) == Some(name));
    let Some(asset) = matching.next() else {
        return false;
    };
    if matching.next().is_some() {
        return false;
    }
    let Some(url) = asset.get("browser_download_url").and_then(Value::as_str) else {
        return false;
    };
    let prefix = format!("https://github.com/{REPOSITORY}/releases/download/");
    url.as_bytes()
        .get(..prefix.len())
        .is_some_and(|actual| actual.eq_ignore_ascii_case(prefix.as_bytes()))
        && url.get(prefix.len()..) == Some(format!("{tag}/{name}").as_str())
}

#[cfg(test)]
mod tests;
