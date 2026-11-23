use super::*;
use serde_json::json;

pub(crate) const IDENTITY: &str =
    "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
pub(crate) const HOST: &str = "192.0.2.20";
const FIXTURE: &str = include_str!("../../../../tests/fixtures/root-receipt.json");

pub(crate) fn document() -> Value {
    serde_json::from_str(FIXTURE).unwrap()
}

pub(crate) fn save(directory: &Path, host: &str, value: &Value) -> PathBuf {
    let path = directory
        .join("root")
        .join(sha256_hex(host.as_bytes()))
        .join("receipt.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, serde_json::to_vec(value).unwrap()).unwrap();
    path
}

#[test]
fn receipt_validation_preserves_cli_identity_types_phases_and_ports() {
    assert!(parse(document(), IDENTITY).is_ok());
    let cases = [
        ("schema_version", json!(true)),
        ("schema_version", json!(1.0)),
        ("schema_version", json!(2)),
        ("app_id", json!("another-helper")),
        ("phase", json!("not_configured")),
        ("phase", json!("unknown")),
        ("installation_id", json!("a".repeat(31))),
        ("installation_id", json!("A".repeat(32))),
        ("device_identity_sha256", json!("missing")),
        ("duid_sha256", json!(null)),
        ("certificate_sha256", json!("A".repeat(64))),
        ("token", json!("private-invalid-token")),
        ("bridge_port", json!(true)),
        ("bridge_port", json!(26104.0)),
        ("bridge_port", json!(1023)),
        ("bridge_port", json!(65536)),
        ("bridge_port", json!(26101)),
        ("bridge_port", json!(26102)),
        ("host", json!("127.0.0.1")),
        ("host", json!("224.0.0.1")),
        ("original_pc_host", json!("0.0.0.0")),
        ("original_pc_host", json!("255.255.255.255")),
        ("original_pc_host", json!(123)),
    ];
    for (key, invalid) in cases {
        let mut value = document();
        value[key] = invalid;
        assert_eq!(
            parse(value, IDENTITY).err().unwrap().code,
            "root_recovery_unavailable",
            "{key}"
        );
    }
    for phase in [
        "prepared",
        "installed",
        "root_requested",
        "waiting_boot",
        "active",
        "removing",
        "removed",
    ] {
        let mut value = document();
        value["phase"] = json!(phase);
        assert!(parse(value, IDENTITY).is_ok(), "{phase}");
    }
    assert_eq!(
        parse(document(), &"e".repeat(64)).err().unwrap().code,
        "identity_mismatch"
    );
}

#[tokio::test]
async fn default_and_selected_records_are_read_without_modifying_them() {
    let directory = tempfile::tempdir().unwrap();
    assert!(load(directory.path(), HOST, IDENTITY)
        .await
        .unwrap()
        .is_none());
    let value = document();
    let path = save(directory.path(), HOST, &value);
    let before = std::fs::read(&path).unwrap();
    assert_eq!(
        load(directory.path(), HOST, IDENTITY)
            .await
            .unwrap()
            .unwrap()
            .document,
        value
    );
    assert_eq!(std::fs::read(&path).unwrap(), before);
    let copy = directory.path().join("copied-original.json");
    let mut copied = value.clone();
    copied["phase"] = json!("waiting_boot");
    std::fs::write(&copy, serde_json::to_vec(&copied).unwrap()).unwrap();
    std::fs::write(
        path.with_file_name("selected.json"),
        json!({"path": copy}).to_string(),
    )
    .unwrap();
    assert_eq!(
        load(directory.path(), HOST, IDENTITY)
            .await
            .unwrap()
            .unwrap()
            .document,
        copied
    );
}

#[tokio::test]
async fn invalid_selected_locations_and_bounded_files_never_fall_back_to_another_pairing() {
    let directory = tempfile::tempdir().unwrap();
    let path = save(directory.path(), HOST, &document());
    let pointer = path.with_file_name("selected.json");
    for value in [
        json!({"path": "relative.json"}),
        json!({"path": directory.path().join("absent")}),
        json!({"path": path, "extra": true}),
        json!([]),
    ] {
        std::fs::write(&pointer, value.to_string()).unwrap();
        assert_eq!(
            load(directory.path(), HOST, IDENTITY)
                .await
                .err()
                .unwrap()
                .code,
            "root_recovery_unavailable"
        );
    }
    std::fs::write(&pointer, vec![b' '; MAX_POINTER_BYTES as usize + 1]).unwrap();
    assert!(load(directory.path(), HOST, IDENTITY).await.is_err());
    std::fs::remove_file(&pointer).unwrap();
    for bytes in [
        vec![b' '; MAX_RECEIPT_BYTES as usize + 1],
        vec![0xff],
        b"private-invalid-json".to_vec(),
    ] {
        std::fs::write(&path, bytes).unwrap();
        let error = load(directory.path(), HOST, IDENTITY).await.err().unwrap();
        assert_eq!(
            serde_json::to_value(error).unwrap(),
            json!({"code": "root_recovery_unavailable", "message": "The saved root recovery files could not be read on this computer."})
        );
    }
}

#[cfg(unix)]
#[tokio::test]
async fn linked_records_and_pointers_are_rejected_including_dangling_links() {
    let directory = tempfile::tempdir().unwrap();
    let path = save(directory.path(), HOST, &document());
    let actual = directory.path().join("actual.json");
    std::fs::rename(&path, &actual).unwrap();
    std::os::unix::fs::symlink(&actual, &path).unwrap();
    assert!(load(directory.path(), HOST, IDENTITY).await.is_err());
    std::fs::remove_file(&path).unwrap();
    std::fs::rename(&actual, &path).unwrap();
    let pointer = path.with_file_name("selected.json");
    std::os::unix::fs::symlink(directory.path().join("missing-pointer"), &pointer).unwrap();
    assert!(load(directory.path(), HOST, IDENTITY).await.is_err());
}
