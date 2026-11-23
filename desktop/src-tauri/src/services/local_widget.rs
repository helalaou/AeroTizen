//! Private snapshots and bounded validation of a user-selected Tizen widget.
use super::{device_connection::projection::protected_package, text::display_text};
use crate::models::{AppError, AppResult, LocalPackageReview, LAUNCHER_APP_ID};
use roxmltree::{Document, ParsingOptions};
use sha2::{Digest, Sha256};
use std::{
    fs::File,
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
};

pub(super) const MAX_WIDGET_BYTES: u64 = 256 * 1024 * 1024;
pub(super) const MAX_UNPACKED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_WIDGET_ENTRIES: usize = 10_000;
const MAX_DIRECTORY_BYTES: u32 = 8 * 1024 * 1024;
const MAX_CONFIG_BYTES: u64 = 256 * 1024;
const MAX_LZMA_DICTIONARY_BYTES: u32 = 64 * 1024 * 1024;
const MAX_XML_NODES: u32 = 20_000;
const COPY_CHUNK_BYTES: usize = 1024 * 1024;
const MAX_IDENTIFIER_BYTES: usize = 256;
const MAX_VERSION_BYTES: usize = 64;
const EOCD_BYTES: usize = 22;
const MAX_COMMENT_BYTES: usize = u16::MAX as usize;
const WIDGET_NAMESPACE: &str = "http://www.w3.org/ns/widgets";
const TIZEN_NAMESPACE: &str = "http://tizen.org/ns/widgets";

pub(super) struct Widget {
    sha256: String,
    directory: tempfile::TempDir,
}
impl Widget {
    pub fn path(&self) -> PathBuf {
        self.directory.path().join("selected.wgt")
    }
    pub fn review(&self) -> AppResult<LocalPackageReview> {
        inspect_snapshot(&self.path(), self.sha256.clone())
    }
}

fn invalid() -> AppError {
    AppError::new(
        "invalid_package",
        "Choose a valid Tizen .wgt app file with a supported config.xml.",
    )
}
fn identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_IDENTIFIER_BYTES
        && value
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || b"_.-".contains(&b))
}
fn version(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= MAX_VERSION_BYTES
        && value.split('.').count() <= 4
        && value
            .split('.')
            .all(|part| !part.is_empty() && part.bytes().all(|b| b.is_ascii_digit()))
}

fn xml_text(bytes: &[u8]) -> AppResult<String> {
    if bytes.starts_with(&[0xff, 0xfe]) || bytes.starts_with(&[0xfe, 0xff]) {
        let little = bytes[0] == 0xff;
        let (pairs, remainder) = bytes[2..].as_chunks::<2>();
        if !remainder.is_empty() {
            return Err(invalid());
        }
        let units: Vec<_> = pairs
            .iter()
            .map(|pair| {
                if little {
                    u16::from_le_bytes(*pair)
                } else {
                    u16::from_be_bytes(*pair)
                }
            })
            .collect();
        String::from_utf16(&units).map_err(|_| invalid())
    } else {
        String::from_utf8(
            bytes
                .strip_prefix(&[0xef, 0xbb, 0xbf])
                .unwrap_or(bytes)
                .to_vec(),
        )
        .map_err(|_| invalid())
    }
}

fn metadata(bytes: &[u8], sha256: String) -> AppResult<LocalPackageReview> {
    let xml = xml_text(bytes)?;
    let document = Document::parse_with_options(
        &xml,
        ParsingOptions {
            nodes_limit: MAX_XML_NODES,
            ..Default::default()
        },
    )
    .map_err(|_| invalid())?;
    let root = document.root_element();
    let app = root
        .children()
        .find(|node| node.has_tag_name((TIZEN_NAMESPACE, "application")))
        .ok_or_else(invalid)?;
    let app_id = app.attribute("id").unwrap_or_default();
    let package_id = app.attribute("package").unwrap_or_default();
    let version_value = root.attribute("version").unwrap_or_default();
    if !identifier(app_id)
        || !identifier(package_id)
        || !app_id.starts_with(&format!("{package_id}."))
        || !version(version_value)
    {
        return Err(invalid());
    }
    let launcher_package = LAUNCHER_APP_ID.split('.').next().unwrap();
    if protected_package(package_id) && package_id != launcher_package {
        return Err(AppError::new(
            "protected_package",
            "This package belongs to a protected TV component.",
        ));
    }
    let name = root
        .children()
        .find(|node| node.has_tag_name((WIDGET_NAMESPACE, "name")))
        .and_then(|node| node.text())
        .unwrap_or(app_id);
    let name = display_text(Some(&serde_json::Value::String(name.into())), 256)
        .unwrap_or_else(|| app_id.into());
    Ok(LocalPackageReview {
        sha256,
        name,
        app_id: app_id.into(),
        package_id: package_id.into(),
        version: version_value.into(),
        current_revision: None,
        current_version: None,
    })
}

// Bound the central-directory count before the ZIP library allocates entry metadata.
// A widget below these file/count limits does not need a ZIP64 end record.
fn preflight(file: &mut File) -> AppResult<()> {
    let length = file.metadata().map_err(|_| invalid())?.len();
    let tail_bytes = length.min((EOCD_BYTES + MAX_COMMENT_BYTES) as u64) as usize;
    file.seek(SeekFrom::End(-(tail_bytes as i64)))
        .map_err(|_| invalid())?;
    let mut tail = vec![0; tail_bytes];
    file.read_exact(&mut tail).map_err(|_| invalid())?;
    if tail.len() < EOCD_BYTES {
        return Err(invalid());
    }
    let end = (0..=tail.len() - EOCD_BYTES)
        .rev()
        .find(|&offset| {
            tail.get(offset..offset + 4) == Some(b"PK\x05\x06")
                && offset
                    + EOCD_BYTES
                    + u16::from_le_bytes([tail[offset + 20], tail[offset + 21]]) as usize
                    == tail.len()
        })
        .ok_or_else(invalid)?;
    if end >= 20 && tail[end - 20..end - 16] == *b"PK\x06\x07" {
        return Err(invalid());
    }
    let count = u16::from_le_bytes([tail[end + 10], tail[end + 11]]) as usize;
    let size = u32::from_le_bytes(tail[end + 12..end + 16].try_into().unwrap());
    if count > MAX_WIDGET_ENTRIES || size > MAX_DIRECTORY_BYTES || tail[end + 4..end + 8] != [0; 4]
    {
        return Err(invalid());
    }
    file.rewind().map_err(|_| invalid())?;
    Ok(())
}

pub(super) fn validate(path: &Path) -> AppResult<()> {
    let metadata = std::fs::metadata(path).map_err(|_| invalid())?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_WIDGET_BYTES {
        return Err(invalid());
    }
    inspect_snapshot(path, String::new()).map(|_| ())
}

fn inspect_snapshot(path: &Path, sha256: String) -> AppResult<LocalPackageReview> {
    let mut file = File::open(path).map_err(|_| invalid())?;
    preflight(&mut file)?;
    let mut archive = zip::ZipArchive::new(file).map_err(|_| invalid())?;
    if archive.len() > MAX_WIDGET_ENTRIES || archive.has_duplicate_names() {
        return Err(invalid());
    }
    let mut total = 0_u64;
    for index in 0..archive.len() {
        let mut entry = archive.by_index_raw(index).map_err(|_| invalid())?;
        total = total.checked_add(entry.size()).ok_or_else(invalid)?;
        let name = entry.name().map_err(|_| invalid())?;
        if total > MAX_UNPACKED_BYTES
            || entry.encrypted()
            || name.contains(['\\', ':', '\0'])
            || name.starts_with('/')
            || name.split('/').any(|part| part == "..")
            || entry
                .unix_mode()
                .is_some_and(|mode| mode & 0o170000 == 0o120000)
        {
            return Err(invalid());
        }
        if entry.compression() == zip::CompressionMethod::Lzma {
            // Check the dictionary before the decoder can allocate from its header.
            let mut header = [0; 9];
            entry.read_exact(&mut header).map_err(|_| invalid())?;
            if u16::from_le_bytes([header[2], header[3]]) != 5
                || u32::from_le_bytes(header[5..9].try_into().unwrap()) > MAX_LZMA_DICTIONARY_BYTES
            {
                return Err(invalid());
            }
        }
    }
    let config = archive.by_name("config.xml").map_err(|_| invalid())?;
    if config.size() > MAX_CONFIG_BYTES {
        return Err(invalid());
    }
    let mut bytes = Vec::new();
    config
        .take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| invalid())?;
    if bytes.len() as u64 > MAX_CONFIG_BYTES {
        return Err(invalid());
    }
    metadata(&bytes, sha256)
}

pub(super) async fn inspect(path: PathBuf) -> AppResult<LocalPackageReview> {
    tokio::task::spawn_blocking(move || snapshot(&path, None)?.review())
        .await
        .map_err(|_| invalid())?
}

pub(super) fn snapshot(source: &Path, expected: Option<&str>) -> AppResult<Widget> {
    if !source
        .extension()
        .is_some_and(|s| s.eq_ignore_ascii_case("wgt"))
    {
        return Err(invalid());
    }
    let mut input = File::open(source).map_err(|_| invalid())?;
    let info = input.metadata().map_err(|_| invalid())?;
    if !info.is_file() || info.len() == 0 || info.len() > MAX_WIDGET_BYTES {
        return Err(invalid());
    }
    let directory = tempfile::tempdir().map_err(|_| invalid())?;
    let path = directory.path().join("selected.wgt");
    let mut output = File::create(&path).map_err(|_| invalid())?;
    let mut buffer = vec![0; COPY_CHUNK_BYTES];
    let mut size = 0_u64;
    let mut digest = Sha256::new();
    loop {
        let count = input.read(&mut buffer).map_err(|_| invalid())?;
        if count == 0 {
            break;
        }
        size += count as u64;
        if size > MAX_WIDGET_BYTES {
            return Err(invalid());
        }
        digest.update(&buffer[..count]);
        output.write_all(&buffer[..count]).map_err(|_| invalid())?;
    }
    drop(output);
    let sha256 = format!("{:x}", digest.finalize());
    if expected.is_some_and(|value| value != sha256) {
        return Err(AppError::new(
            "package_changed",
            "The app file changed. Choose it again and review the new version.",
        ));
    }
    Ok(Widget { sha256, directory })
}

#[cfg(test)]
pub(crate) mod tests;
