//! Resolve and validate an unsigned launcher release before any TV upload.
use super::*;
use crate::{
    models::{LocalPackageReview, LAUNCHER_APP_ID, LAUNCHER_PACKAGE_ID},
    services::{digest::sha256_hex, local_widget},
};
use std::{fs::File, io::Read, path::PathBuf};
const MAX_PACKAGE_BYTES: usize = 64 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ENTRIES: usize = 4096;
const MAX_CONFIG_BYTES: u64 = 64 * 1024;
const DOWNLOAD_TIMEOUT: Duration = Duration::from_secs(120);
const MAX_REDIRECTS: usize = 5;

pub(in crate::services) struct Downloaded {
    _directory: tempfile::TempDir,
    pub path: PathBuf,
    pub review: LocalPackageReview,
}
fn failed() -> AppError {
    AppError::new("release_unavailable","Could not get a verified launcher package. Check your internet connection and desktop app version.")
}
fn manifest(document: &Value, version: &str) -> AppResult<String> {
    let checksum = document["sha256"].as_str().unwrap_or_default();
    let minimum = document["min_cli_version"].as_str().unwrap_or_default();
    if document["schema_version"].as_u64() != Some(1)
        || document["version"] != version
        || document["app_id"] != LAUNCHER_APP_ID
        || document["package_id"] != LAUNCHER_PACKAGE_ID
        || document["asset"] != format!("aerotizen-launcher-{version}.wgt")
        || checksum.len() != 64
        || !checksum
            .bytes()
            .all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
        || !stable_version(minimum)
        || compare_versions(env!("ROOT_RUNTIME_VERSION"), minimum) == Ordering::Less
    {
        return Err(failed());
    }
    Ok(checksum.into())
}
fn check_package(path: &std::path::Path, version: &str) -> AppResult<LocalPackageReview> {
    local_widget::validate(path).map_err(|_| failed())?;
    let mut archive =
        zip::ZipArchive::new(File::open(path).map_err(|_| failed())?).map_err(|_| failed())?;
    if archive.len() > MAX_ENTRIES {
        return Err(failed());
    }
    let mut names = std::collections::HashSet::new();
    let mut total = 0_u64;
    let mut watcher = Vec::new();
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| failed())?;
        let name = entry.name().map_err(|_| failed())?.into_owned();
        total = total.checked_add(entry.size()).ok_or_else(failed)?;
        if total > MAX_UNPACKED_BYTES
            || !matches!(
                entry.compression(),
                zip::CompressionMethod::Stored | zip::CompressionMethod::Deflated
            )
            || matches!(
                name.rsplit('/').next(),
                Some("author-signature.xml" | "signature1.xml")
            )
        {
            return Err(failed());
        }
        if name == "service/index.js" {
            entry.read_to_end(&mut watcher).map_err(|_| failed())?;
        } else {
            std::io::copy(&mut entry, &mut std::io::sink()).map_err(|_| failed())?;
        }
        names.insert(name);
    }
    let mut required = vec![
        "config.xml",
        "index.html",
        "service/index.js",
        "service/artmode.js",
    ];
    for (needle, file) in [
        (b"./home-mode".as_slice(), "service/home-mode.js"),
        (b"./home-store".as_slice(), "service/home-store.js"),
    ] {
        if watcher.windows(needle.len()).any(|part| part == needle) {
            required.push(file);
        }
    }
    if required.iter().any(|name| !names.contains(*name)) {
        return Err(failed());
    }
    let config = archive.by_name("config.xml").map_err(|_| failed())?;
    if config.size() > MAX_CONFIG_BYTES {
        return Err(failed());
    }
    let mut bytes = Vec::new();
    config
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failed())?;
    let xml = local_widget::xml_text(&bytes).map_err(|_| failed())?;
    let document = roxmltree::Document::parse(&xml).map_err(|_| failed())?;
    if !document
        .root_element()
        .has_tag_name(("http://www.w3.org/ns/widgets", "widget"))
    {
        return Err(failed());
    }
    let review = local_widget::review_file(path).map_err(|_| failed())?;
    if review.app_id != LAUNCHER_APP_ID
        || review.package_id != LAUNCHER_PACKAGE_ID
        || review.version != version
    {
        return Err(failed());
    }
    Ok(review)
}
async fn asset(client: &Client, url: &str, limit: usize) -> AppResult<Vec<u8>> {
    for attempt in 0..MAX_ATTEMPTS {
        let response = client
            .get(url)
            .header(ACCEPT, "application/octet-stream")
            .send()
            .await
            .map_err(|_| failed())?;
        if response.status() != StatusCode::OK {
            if let Some(delay) = retry_delay(response.status(), attempt, RETRY_BASE_DELAY) {
                drop(response);
                tokio::time::sleep(delay).await;
                continue;
            }
            return Err(failed());
        }
        return bounded_body(response, limit).await.ok_or_else(failed);
    }
    Err(failed())
}
fn asset_client() -> AppResult<Client> {
    Client::builder()
        .https_only(true)
        .redirect(Policy::limited(MAX_REDIRECTS))
        .retry(reqwest::retry::never())
        .timeout(REQUEST_TIMEOUT)
        .user_agent(USER_AGENT)
        .build()
        .map_err(|_| failed())
}
fn asset_url<'a>(release: &'a Value, tag: &str, name: &str) -> AppResult<&'a str> {
    if !valid_asset(release, tag, name) {
        return Err(failed());
    }
    release["assets"]
        .as_array()
        .unwrap()
        .iter()
        .find(|asset| asset["name"] == name)
        .and_then(|asset| asset["browser_download_url"].as_str())
        .ok_or_else(failed)
}
pub(in crate::services) async fn download(version: &str) -> AppResult<Downloaded> {
    if !stable_version(version) || version.len() > MAX_VERSION_CHARACTERS {
        return Err(failed());
    }
    let metadata = catalog_client()?;
    let assets = asset_client()?;
    let token = github_token();
    tokio::time::timeout(
        DOWNLOAD_TIMEOUT,
        download_with(
            &metadata,
            &assets,
            RELEASES_URL,
            token.as_deref(),
            version,
            |url| url.to_owned(),
        ),
    )
    .await
    .map_err(|_| failed())?
}
async fn download_with(
    metadata: &Client,
    assets: &Client,
    endpoint: &str,
    token: Option<&str>,
    version: &str,
    asset_endpoint: impl Fn(&str) -> String,
) -> AppResult<Downloaded> {
    let tag = format!("{RELEASE_TAG_PREFIX}{version}");
    let release = read_page(
        metadata,
        &format!("{endpoint}/tags/{tag}"),
        token,
        RETRY_BASE_DELAY,
    )
    .await
    .map_err(|_| failed())?;
    if release["draft"] != false || release["prerelease"] != false || release["tag_name"] != tag {
        return Err(failed());
    }
    let name = format!("aerotizen-launcher-{version}.wgt");
    let manifest_url = asset_url(&release, &tag, MANIFEST_ASSET)?;
    let widget_url = asset_url(&release, &tag, &name)?;
    let bytes = asset(assets, &asset_endpoint(manifest_url), MAX_PAGE_BYTES).await?;
    let document: Value = serde_json::from_slice(&bytes).map_err(|_| failed())?;
    let checksum = manifest(&document, version)?;
    let bytes = asset(assets, &asset_endpoint(widget_url), MAX_PACKAGE_BYTES).await?;
    if sha256_hex(&bytes) != checksum {
        return Err(failed());
    }
    let version = version.to_owned();
    tokio::task::spawn_blocking(move || {
        let directory = tempfile::tempdir().map_err(|_| failed())?;
        let path = directory.path().join("launcher.wgt");
        std::fs::write(&path, bytes).map_err(|_| failed())?;
        let mut review = check_package(&path, &version)?;
        review.sha256 = checksum;
        Ok(Downloaded {
            _directory: directory,
            path,
            review,
        })
    })
    .await
    .map_err(|_| failed())?
}
#[cfg(test)]
mod tests;
