use super::*;
use flate2::read::GzDecoder;
use std::{io::Cursor, path::PathBuf, time::Duration};
pub(super) const DLL_SHA256: &str =
    "5f647158f4c4fd502f1481c2692a95663516e934d11a13b45d5cd821d85d9671";
pub(super) const HASHES: [(&str, &str); 3] = [
    ("SamsungTvArchiveRoot.dll", DLL_SHA256),
    (
        "SamsungTvArchiveRoot.runtimeconfig.json",
        "681a7f9dd3ecb637e2f1198c9cbd9d0e1b42994c211c64c8ffe2fba3f2c0442b",
    ),
    (
        "SamsungTvArchiveRoot.deps.json",
        "fc0e154d1a440bbbc23cf6997f85a3d780667f1b324f88d922cda1b2ab52557e",
    ),
];
const USER_AGENT: &str = concat!("aerotizen-desktop/", env!("CARGO_PKG_VERSION"));
const RELEASE_URL:&str="https://github.com/chris-ritsen/samsung-tv-root/releases/download/v0.0.12/samsung-tv-root-0.0.12-macos-arm64.tar.gz";
const RELEASE_SHA256: &str = "8ee4587462963f8ad0374f921e41050bd9198a7cb0b15899a5f35a7ad8f50f2c";
const CACHE_FILE: &str = "samsung-tv-root-0.0.12.tar.gz";
const MAX_RELEASE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_UNPACKED_BYTES: u64 = 512 * 1024 * 1024;
const MAX_ARCHIVE_ENTRIES: usize = 20_000;
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30);
const MAX_REDIRECTS: usize = 5;
pub(in crate::services) struct Upstream {
    pub(super) files: Vec<PayloadFile>,
}
fn cached(path: &Path) -> AppResult<Option<Vec<u8>>> {
    match std::fs::symlink_metadata(path) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Ok(metadata)
            if metadata.is_file()
                && !metadata.file_type().is_symlink()
                && metadata.len() <= MAX_RELEASE_BYTES => {}
        _ => return Err(failed()),
    }
    let mut data = Vec::new();
    File::open(path)
        .map_err(|_| failed())?
        .take(MAX_RELEASE_BYTES + 1)
        .read_to_end(&mut data)
        .map_err(|_| failed())?;
    if data.len() as u64 > MAX_RELEASE_BYTES || sha256_hex(&data) != RELEASE_SHA256 {
        return Err(failed());
    }
    Ok(Some(data))
}
fn extract(data: &[u8], archive_hash: &str, hashes: &[(&str, &str)]) -> AppResult<Upstream> {
    if data.len() as u64 > MAX_RELEASE_BYTES || sha256_hex(data) != archive_hash {
        return Err(failed());
    }
    let decoded = GzDecoder::new(Cursor::new(data)).take(MAX_UNPACKED_BYTES + 1);
    let mut archive = tar::Archive::new(decoded);
    let mut values = BTreeMap::new();
    for (index, entry) in archive.entries().map_err(|_| failed())?.enumerate() {
        if index >= MAX_ARCHIVE_ENTRIES {
            return Err(failed());
        }
        let mut entry = entry.map_err(|_| failed())?;
        let path = entry.path().map_err(|_| failed())?;
        let name = path.to_str().ok_or_else(failed)?;
        let Some((expected, hash)) = hashes.iter().find(|(expected, _)| {
            name.ends_with(&format!("/_internal/payloads/common/{expected}"))
        }) else {
            continue;
        };
        if values.contains_key(*expected)
            || !entry.header().entry_type().is_file()
            || entry.size() == 0
            || entry.size() > MAX_MEMBER_BYTES
        {
            return Err(failed());
        }
        let mut bytes = Vec::new();
        entry
            .by_ref()
            .take(MAX_MEMBER_BYTES + 1)
            .read_to_end(&mut bytes)
            .map_err(|_| failed())?;
        if bytes.len() as u64 > MAX_MEMBER_BYTES || sha256_hex(&bytes) != *hash {
            return Err(failed());
        }
        values.insert((*expected).to_owned(), bytes);
    }
    if values.len() != hashes.len() {
        return Err(failed());
    }
    Ok(Upstream {
        files: values
            .into_iter()
            .map(|(name, bytes)| PayloadFile { name, bytes })
            .collect(),
    })
}
pub(in crate::services) async fn load(directory: PathBuf) -> AppResult<Upstream> {
    let path = directory.join(CACHE_FILE);
    let read_path = path.clone();
    let existing = tokio::task::spawn_blocking(move || cached(&read_path))
        .await
        .map_err(|_| failed())??;
    let data = if let Some(bytes) = existing {
        bytes
    } else {
        let client = reqwest::Client::builder()
            .https_only(true)
            .user_agent(USER_AGENT)
            .redirect(reqwest::redirect::Policy::limited(MAX_REDIRECTS))
            .retry(reqwest::retry::never())
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|_| failed())?;
        let response = client.get(RELEASE_URL).send().await.map_err(|_| failed())?;
        if response.status() != reqwest::StatusCode::OK {
            return Err(failed());
        }
        let bytes = crate::services::http::bounded_body(response, MAX_RELEASE_BYTES as usize)
            .await
            .ok_or_else(failed)?;
        if sha256_hex(&bytes) != RELEASE_SHA256 {
            return Err(failed());
        }
        tokio::task::spawn_blocking(move || {
            let mut builder = std::fs::DirBuilder::new();
            builder.recursive(true);
            #[cfg(unix)]
            {
                use std::os::unix::fs::DirBuilderExt;
                builder.mode(0o700);
            }
            builder.create(&directory).map_err(|_| failed())?;
            let mut temporary =
                tempfile::NamedTempFile::new_in(&directory).map_err(|_| failed())?;
            temporary.write_all(&bytes).map_err(|_| failed())?;
            temporary.as_file().sync_all().map_err(|_| failed())?;
            match temporary.persist_noclobber(&path) {
                Ok(_) => {}
                Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
                Err(_) => return Err(failed()),
            }
            cached(&path)?.ok_or_else(failed)
        })
        .await
        .map_err(|_| failed())??
    };
    tokio::task::spawn_blocking(move || extract(&data, RELEASE_SHA256, &HASHES))
        .await
        .map_err(|_| failed())?
}
#[cfg(test)]
mod tests {
    use super::*;
    fn archive(duplicate: bool) -> Vec<u8> {
        let encoder = flate2::GzBuilder::new()
            .mtime(0)
            .write(Vec::new(), flate2::Compression::fast());
        let mut archive = tar::Builder::new(encoder);
        for _ in 0..if duplicate { 2 } else { 1 } {
            let data = b"managed assembly";
            let mut header = tar::Header::new_ustar();
            header.set_size(data.len() as u64);
            header.set_cksum();
            archive
                .append_data(
                    &mut header,
                    "release/_internal/payloads/common/Test.dll",
                    data.as_slice(),
                )
                .unwrap();
        }
        archive.into_inner().unwrap().finish().unwrap()
    }
    #[test]
    fn archive_and_member_pins_are_required_and_duplicate_targets_are_refused() {
        let data = archive(false);
        let sha = sha256_hex(&data);
        let target = sha256_hex(b"managed assembly");
        let values = extract(&data, &sha, &[("Test.dll", &target)]).unwrap();
        assert_eq!(values.files[0].bytes, b"managed assembly");
        assert!(extract(&data, &"a".repeat(64), &[("Test.dll", &target)]).is_err());
        assert!(extract(&data, &sha, &[("Test.dll", &"b".repeat(64))]).is_err());
        let duplicate = archive(true);
        assert!(extract(
            &duplicate,
            &sha256_hex(&duplicate),
            &[("Test.dll", &target)]
        )
        .is_err());
    }
    #[test]
    fn corrupt_cached_archives_are_preserved_and_never_replaced_silently() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join(CACHE_FILE);
        assert!(cached(&path).unwrap().is_none());
        std::fs::write(&path, b"corrupt cache").unwrap();
        assert!(cached(&path).is_err());
        assert_eq!(std::fs::read(path).unwrap(), b"corrupt cache");
    }
}
