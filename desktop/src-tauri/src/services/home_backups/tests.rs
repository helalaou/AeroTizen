use super::*;
use serde_json::json;

const FIXTURE: &str = include_str!("../../../../tests/fixtures/home-backup.json");
const IDENTITY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CAPTURED_AT: &str = "2026-11-16T10:00:00.123456+00:00";

fn document() -> Value {
    serde_json::from_str(FIXTURE).unwrap()
}

fn read_document(document: &Value) -> AppResult<HomeBackupSettings> {
    review(
        &serde_json::to_vec(document).unwrap(),
        IDENTITY,
        CAPTURED_AT,
    )
}

fn expected_settings() -> Value {
    json!({
        "home_button_app": "com.samsung.tv.csfs",
        "home_app": "com.samsung.tv.csfs",
        "startup_app": "org.tizen.tv-viewer",
        "startup_backup_app": "org.tizen.tv-viewer",
        "first_screen": "com.samsung.tv.csfs",
        "smart_hub_autostart": false,
    })
}

fn evidence(access: &str) -> Value {
    json!({
        "access": access,
        "uid": if access == "sdk_uid_901" { 901 } else { 0 },
        "authenticated": true,
        "query_staging_cleaned": true,
        "sdk_staging_cleaned": true,
        "upstream_staging_cleaned": true,
        "system_files_unchanged": true,
        "helper_sha256": "b".repeat(64),
    })
}

#[test]
fn original_backups_from_each_cli_access_method_expose_only_review_settings() {
    for access in ["paired_helper", "sdk_uid_901", "temporary_root"] {
        let mut value = document();
        value["evidence"] = evidence(access);
        value["private_extra"] = json!({"token": "must-not-be-returned"});
        let public = serde_json::to_value(read_document(&value).unwrap()).unwrap();
        assert_eq!(public, expected_settings(), "{access}");
    }
}

#[test]
fn invalid_metadata_device_binding_and_typed_settings_are_refused() {
    let cases = [
        ("/schema_version", json!(true)),
        ("/schema_version", json!(1.0)),
        ("/schema_version", json!(2)),
        ("/kind", json!("another-document")),
        ("/device/identity_sha256", json!("b".repeat(64))),
        ("/device/model", json!("")),
        ("/device/firmware_build", json!(null)),
        ("/home/operation", json!("another-operation")),
        ("/home/default_app", json!("")),
        ("/home/settings/db~1appfw~1home_appid/value", json!("")),
        (
            "/home/settings/db~1appfw~1startup_appid/value",
            json!(false),
        ),
        ("/home/settings/db~1appfw~1startup_appid/type", json!("int")),
        (
            "/home/settings/db~1menu~1smart_hub~1ontvsetting~1auto_start/type",
            json!("string"),
        ),
        (
            "/home/settings/db~1menu~1smart_hub~1ontvsetting~1auto_start/value",
            json!(true),
        ),
        (
            "/home/settings/db~1menu~1smart_hub~1ontvsetting~1auto_start/value",
            json!(1.0),
        ),
        ("/captured_at", json!("invalid-date")),
        ("/captured_at", json!("0000-01-01T00:00:00Z")),
        ("/captured_at", json!("2026-11-16T10:00:60Z")),
    ];
    for (path, invalid) in cases {
        let mut value = document();
        *value.pointer_mut(path).unwrap() = invalid;
        assert_eq!(
            read_document(&value).unwrap_err().code,
            "backup_unreadable",
            "{path}"
        );
    }
    for key in [
        HOME_KEY,
        STARTUP_KEY,
        STARTUP_BACKUP_KEY,
        FIRST_SCREEN_KEY,
        AUTOSTART_KEY,
    ] {
        let mut value = document();
        value["home"]["settings"]
            .as_object_mut()
            .unwrap()
            .remove(key);
        assert_eq!(
            read_document(&value).unwrap_err().code,
            "backup_unreadable",
            "{key}"
        );
    }
    let mut extra_setting = document();
    extra_setting["home"]["settings"]["unexpected"] = json!({"type": "string", "value": "private"});
    assert_eq!(
        read_document(&extra_setting).unwrap_err().code,
        "backup_unreadable"
    );
}

#[test]
fn a_baseline_captured_after_aerotizen_was_applied_is_refused() {
    let mut value = document();
    value["home"]["default_app"] = json!(LAUNCHER_APP_ID);
    assert_eq!(read_document(&value).unwrap_err().code, "backup_unreadable");
    for key in [HOME_KEY, STARTUP_KEY, STARTUP_BACKUP_KEY, FIRST_SCREEN_KEY] {
        let mut value = document();
        value["home"]["settings"][key]["value"] = json!(LAUNCHER_APP_ID);
        assert_eq!(
            read_document(&value).unwrap_err().code,
            "backup_unreadable",
            "{key}"
        );
    }
}

#[test]
fn access_requires_authenticated_identity_uid_and_its_own_cleanup_evidence() {
    for access in ["paired_helper", "sdk_uid_901", "temporary_root"] {
        let mut valid = document();
        valid["evidence"] = evidence(access);
        let mut required = vec!["authenticated", "uid", "helper_sha256", "access"];
        match access {
            "sdk_uid_901" => required.extend(["query_staging_cleaned", "sdk_staging_cleaned"]),
            "temporary_root" => required.extend([
                "query_staging_cleaned",
                "upstream_staging_cleaned",
                "system_files_unchanged",
            ]),
            _ => {}
        }
        for field in required {
            let mut value = valid.clone();
            value["evidence"][field] = Value::Null;
            assert_eq!(
                read_document(&value).unwrap_err().code,
                "backup_unreadable",
                "{access}: {field}"
            );
        }
    }
    for (field, invalid) in [
        ("authenticated", json!(1)),
        ("authenticated", json!(false)),
        ("uid", json!(0)),
        ("uid", json!(901.0)),
        ("helper_sha256", json!("B".repeat(64))),
        ("helper_sha256", json!("../not-a-digest")),
        ("access", json!("unknown")),
    ] {
        let mut value = document();
        value["evidence"][field] = invalid;
        assert_eq!(
            read_document(&value).unwrap_err().code,
            "backup_unreadable",
            "{field}"
        );
    }
}

#[test]
fn empty_startup_values_and_unknown_autostart_are_preserved() {
    for (number, expected) in [
        (0, json!(false)),
        (1, json!(true)),
        (2, Value::Null),
        (-1, Value::Null),
    ] {
        let mut value = document();
        value["home"]["settings"][STARTUP_KEY]["value"] = json!("");
        value["home"]["settings"][STARTUP_BACKUP_KEY]["value"] = json!("");
        value["home"]["settings"][AUTOSTART_KEY]["value"] = json!(number);
        let public = serde_json::to_value(read_document(&value).unwrap()).unwrap();
        assert_eq!(public["startup_app"], "");
        assert_eq!(public["startup_backup_app"], "");
        assert_eq!(public["smart_hub_autostart"], expected);
    }
}

#[test]
fn capture_time_is_normalized_like_cli_output_and_stale_reviews_are_refused() {
    for (stored, canonical) in [
        (CAPTURED_AT, CAPTURED_AT),
        ("2026-11-16T10:00:00Z", "2026-11-16T10:00:00+00:00"),
        (
            "2026-11-16T10:00:00.12+01:30",
            "2026-11-16T10:00:00.120000+01:30",
        ),
        (
            "2026-11-16T10:00:00.123456789Z",
            "2026-11-16T10:00:00.123456+00:00",
        ),
        ("2026-11-16 10:00:00.000000", "2026-11-16T10:00:00"),
        ("2026-11-16", "2026-11-16T00:00:00"),
    ] {
        let mut value = document();
        value["captured_at"] = json!(stored);
        let bytes = serde_json::to_vec(&value).unwrap();
        assert!(review(&bytes, IDENTITY, canonical).is_ok(), "{stored}");
        assert_eq!(
            review(&bytes, IDENTITY, "stale").unwrap_err().code,
            "backup_changed"
        );
    }
}

#[tokio::test]
async fn file_reads_are_bounded_readonly_and_do_not_disclose_paths_or_private_data() {
    let directory = tempfile::tempdir().unwrap();
    let store = HomeBackups::new(directory.path().into());
    let path = store.directory.join(IDENTITY).join("original-home.json");
    assert_eq!(
        store.read(IDENTITY, CAPTURED_AT).await.unwrap_err().code,
        "backup_unreadable"
    );
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, FIXTURE).unwrap();
    assert_eq!(
        serde_json::to_value(store.read(IDENTITY, CAPTURED_AT).await.unwrap()).unwrap(),
        expected_settings()
    );
    assert_eq!(std::fs::read(&path).unwrap(), FIXTURE.as_bytes());
    let mut at_limit = FIXTURE.as_bytes().to_vec();
    at_limit.resize(MAX_BACKUP_BYTES as usize, b' ');
    std::fs::write(&path, at_limit).unwrap();
    assert!(store.read(IDENTITY, CAPTURED_AT).await.is_ok());
    for bytes in [
        vec![b' '; MAX_BACKUP_BYTES as usize + 1],
        b"private-invalid-backup".to_vec(),
        vec![0xff],
    ] {
        std::fs::write(&path, bytes).unwrap();
        let error =
            serde_json::to_value(store.read(IDENTITY, CAPTURED_AT).await.unwrap_err()).unwrap();
        assert_eq!(
            error,
            json!({"code": "backup_unreadable", "message": "The original Home backup could not be verified."})
        );
    }
    std::fs::remove_file(&path).unwrap();
    std::fs::create_dir(&path).unwrap();
    assert_eq!(
        store.read(IDENTITY, CAPTURED_AT).await.unwrap_err().code,
        "backup_unreadable"
    );
    for identity in ["../outside", "", &"A".repeat(64)] {
        assert_eq!(
            store.read(identity, CAPTURED_AT).await.unwrap_err().code,
            "invalid_request"
        );
    }
}

#[tokio::test]
async fn connection_summary_distinguishes_missing_verified_and_unreadable_backups() {
    let directory = tempfile::tempdir().unwrap();
    let store = HomeBackups::new(directory.path().into());
    assert!(matches!(store.summary(IDENTITY).await, HomeBackup::Missing));
    let path = directory
        .path()
        .join("backups")
        .join(IDENTITY)
        .join("original-home.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(&path, FIXTURE).unwrap();
    assert_eq!(
        serde_json::to_value(store.summary(IDENTITY).await).unwrap(),
        json!({"status":"saved","captured_at":CAPTURED_AT})
    );
    let mut value = document();
    value["device"]["identity_sha256"] = json!("b".repeat(64));
    std::fs::write(&path, value.to_string()).unwrap();
    assert!(matches!(
        store.summary(IDENTITY).await,
        HomeBackup::Unreadable
    ));
    std::fs::write(&path, b"bad json").unwrap();
    assert!(matches!(
        store.summary(IDENTITY).await,
        HomeBackup::Unreadable
    ));
    assert!(matches!(
        store.summary("../outside").await,
        HomeBackup::Unreadable
    ));
}
