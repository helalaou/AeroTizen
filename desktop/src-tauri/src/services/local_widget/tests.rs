use super::*;
use serde_json::{json, Value};
use zip::write::SimpleFileOptions;

fn fixture() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/widget-metadata.json"
    ))
    .unwrap()
}
pub(crate) fn config() -> String {
    fixture()[0]["xml"].as_str().unwrap().into()
}
pub(crate) fn widget(path: &Path, config: &[u8], entry: Option<&str>) {
    let mut zip = zip::ZipWriter::new(File::create(path).unwrap());
    zip.start_file(
        "config.xml",
        SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
    )
    .unwrap();
    zip.write_all(config).unwrap();
    if let Some(name) = entry {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(b"content").unwrap();
    }
    zip.finish().unwrap();
}

#[test]
fn native_metadata_matches_the_cli_contract_for_namespaces_names_and_versions() {
    for case in fixture() {
        let result = metadata(case["xml"].as_str().unwrap().as_bytes(), "a".repeat(64));
        if let Some(error) = case["error"].as_str() {
            assert_eq!(result.unwrap_err().code, error, "{}", case["name"]);
        } else {
            let mut result = json!(result.unwrap());
            for field in ["sha256", "current_revision", "current_version"] {
                result.as_object_mut().unwrap().remove(field);
            }
            assert_eq!(result, case["metadata"], "{}", case["name"]);
        }
    }
}

#[test]
fn snapshot_hash_and_private_bytes_are_stable_when_the_selected_file_changes() {
    let directory = tempfile::tempdir().unwrap();
    let source = directory.path().join("App.WGT");
    widget(&source, config().as_bytes(), Some("index.html"));
    let original = std::fs::read(&source).unwrap();
    let snapshot = snapshot(&source, None).unwrap();
    let path = snapshot.path();
    assert_ne!(path, source);
    assert_eq!(
        snapshot.review().unwrap().sha256,
        super::super::digest::sha256_hex(&original)
    );
    std::fs::write(&source, b"replaced").unwrap();
    assert_eq!(std::fs::read(&path).unwrap(), original);
    assert!(super::snapshot(&source, Some(&snapshot.sha256)).is_err());
    drop(snapshot);
    assert!(!path.exists());
}

#[test]
fn traversal_duplicate_link_encrypted_and_oversized_archive_entries_are_refused() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("App.wgt");
    for name in ["../outside", "/absolute", "C:/drive", "folder\\escape"] {
        widget(&path, config().as_bytes(), Some(name));
        assert!(snapshot(&path, None).unwrap().review().is_err(), "{name}");
    }
    let duplicate: Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/widget-duplicate.json"
    ))
    .unwrap();
    let bytes = crate::services::sdb::tests::bytes(duplicate["zip_hex"].as_str().unwrap());
    std::fs::write(&path, bytes).unwrap();
    assert!(snapshot(&path, None).unwrap().review().is_err());
    widget(&path, config().as_bytes(), None);
    let mut data = std::fs::read(&path).unwrap();
    let central = data.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    data[central + 8] |= 1;
    std::fs::write(&path, &data).unwrap();
    assert!(snapshot(&path, None).unwrap().review().is_err());
    widget(&path, config().as_bytes(), None);
    let mut data = std::fs::read(&path).unwrap();
    let central = data.windows(4).position(|w| w == b"PK\x01\x02").unwrap();
    data[central + 5] = 3;
    data[central + 38..central + 42].copy_from_slice(&(0o120777_u32 << 16).to_le_bytes());
    std::fs::write(&path, &data).unwrap();
    assert!(snapshot(&path, None).unwrap().review().is_err());
    widget(&path, &vec![b'x'; MAX_CONFIG_BYTES as usize + 1], None);
    assert!(snapshot(&path, None).unwrap().review().is_err());
}

#[test]
fn malformed_xml_dtd_and_protected_packages_are_rejected_and_utf16_is_supported() {
    for xml in [
        "<widget>",
        "<!DOCTYPE widget [<!ENTITY x 'payload'>]><widget>&x;</widget>",
    ] {
        assert!(metadata(xml.as_bytes(), String::new()).is_err());
    }
    let protected = config()
        .replace("LocalApp01.Player", "org.tizen.browser.App")
        .replace("package=\"LocalApp01\"", "package=\"org.tizen.browser\"");
    assert_eq!(
        metadata(protected.as_bytes(), String::new())
            .unwrap_err()
            .code,
        "protected_package"
    );
    for little in [true, false] {
        let mut bytes = if little {
            vec![0xff, 0xfe]
        } else {
            vec![0xfe, 0xff]
        };
        for unit in config().encode_utf16() {
            bytes.extend(if little {
                unit.to_le_bytes()
            } else {
                unit.to_be_bytes()
            });
        }
        assert_eq!(
            metadata(&bytes, String::new()).unwrap().app_id,
            "LocalApp01.Player"
        );
    }
}

#[test]
fn archive_directory_counts_and_truncated_eocd_are_bounded_before_parsing() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("App.wgt");
    for data in [b"PK\x05\x06".to_vec(), b"bad zip".to_vec()] {
        std::fs::write(&path, data).unwrap();
        assert!(snapshot(&path, None).unwrap().review().is_err());
    }
    widget(&path, config().as_bytes(), None);
    let mut bytes = std::fs::read(&path).unwrap();
    let offset = bytes.len() - EOCD_BYTES;
    bytes[offset + 10..offset + 12]
        .copy_from_slice(&((MAX_WIDGET_ENTRIES + 1) as u16).to_le_bytes());
    std::fs::write(&path, &bytes).unwrap();
    assert!(snapshot(&path, None).unwrap().review().is_err());
}

#[test]
fn supported_zip_compression_matches_python_and_oversized_lzma_dictionaries_are_rejected() {
    let cases: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/widget-compression.json"
    ))
    .unwrap();
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("App.wgt");
    for case in cases {
        let mut bytes = crate::services::sdb::tests::bytes(case["zip_hex"].as_str().unwrap());
        std::fs::write(&path, &bytes).unwrap();
        assert_eq!(
            snapshot(&path, None).unwrap().review().unwrap().app_id,
            "LocalApp01.Player",
            "{}",
            case["name"]
        );
        if case["name"] == "lzma" {
            let name_bytes = u16::from_le_bytes([bytes[26], bytes[27]]) as usize;
            let extra_bytes = u16::from_le_bytes([bytes[28], bytes[29]]) as usize;
            let payload = 30 + name_bytes + extra_bytes;
            bytes[payload + 5..payload + 9].copy_from_slice(&u32::MAX.to_le_bytes());
            std::fs::write(&path, &bytes).unwrap();
            assert!(snapshot(&path, None).unwrap().review().is_err());
        }
    }
}
