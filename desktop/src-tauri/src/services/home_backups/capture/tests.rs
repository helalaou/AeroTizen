use super::*;

const IDENTITY: &str = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
fn original() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/home-backup.json"
    ))
    .unwrap()
}
fn reply() -> Value {
    json!({"home_settings":{"home_button_app":"com.samsung.tv.csfs","home_app":"com.samsung.tv.csfs","startup_app":"org.tizen.tv-viewer","startup_backup_app":"org.tizen.tv-viewer","first_screen":"com.samsung.tv.csfs","smart_hub_autostart":false,"firmware_build":"TEST-1000.1","helper_sha256":"b".repeat(64)}})
}

#[tokio::test]
async fn first_capture_is_atomic_and_existing_original_is_reused_with_its_exact_digest() {
    let directory = tempfile::tempdir().unwrap();
    let owner = HomeBackups::new(directory.path().into());
    assert!(owner.prepared(IDENTITY).await.unwrap().is_none());
    let prepared = owner.save_original(IDENTITY, original()).await.unwrap();
    let path = directory
        .path()
        .join("backups")
        .join(IDENTITY)
        .join("original-home.json");
    let bytes = std::fs::read(&path).unwrap();
    assert_eq!(prepared.backup_sha256, sha256_hex(&bytes));
    let mut changed = original();
    changed["home"]["settings"][STARTUP_KEY]["value"] = json!("different.App");
    let second = owner.save_original(IDENTITY, changed).await.unwrap();
    assert_eq!(second.backup_sha256, prepared.backup_sha256);
    assert_eq!(std::fs::read(path).unwrap(), bytes);
    assert_eq!(
        std::fs::read_dir(directory.path().join("backups").join(IDENTITY))
            .unwrap()
            .count(),
        1
    );
}

#[tokio::test]
async fn concurrent_capture_can_publish_only_one_original_and_never_overwrites_bad_data() {
    let directory = tempfile::tempdir().unwrap();
    let owner = HomeBackups::new(directory.path().into());
    let a = original();
    let mut b = original();
    b["home"]["settings"][STARTUP_KEY]["value"] = json!("Other.App");
    let (a, b) = tokio::join!(
        owner.save_original(IDENTITY, a),
        owner.save_original(IDENTITY, b)
    );
    assert_eq!(a.unwrap().backup_sha256, b.unwrap().backup_sha256);
    let path = directory
        .path()
        .join("backups")
        .join(IDENTITY)
        .join("original-home.json");
    std::fs::write(&path, b"invalid original").unwrap();
    assert_eq!(
        owner.prepared(IDENTITY).await.unwrap_err().code,
        "backup_unavailable"
    );
    assert_eq!(
        owner
            .save_original(IDENTITY, original())
            .await
            .unwrap_err()
            .code,
        "backup_unavailable"
    );
    assert_eq!(std::fs::read(path).unwrap(), b"invalid original");
}

#[test]
fn paired_baseline_requires_complete_original_values_matching_assignments_and_provenance() {
    let info = json!({"modelName":"Frame","model":"24_PTM"});
    let expected = paired_document(IDENTITY, &info, &reply()).unwrap();
    assert!(verified_settings(&expected, IDENTITY).is_some());
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/home-paired-backup.json"
    ))
    .unwrap();
    let mut candidate = paired_document(
        fixture["identity"].as_str().unwrap(),
        &fixture["info"],
        &fixture["reply"],
    )
    .unwrap();
    candidate["captured_at"] = fixture["document"]["captured_at"].clone();
    assert_eq!(candidate, fixture["document"]);
    for (path, value) in [
        ("/home_settings/home_app", json!("Other.Home")),
        ("/home_settings/startup_app", json!("")),
        ("/home_settings/home_button_app", json!(LAUNCHER_APP_ID)),
        ("/home_settings/smart_hub_autostart", json!(0)),
        ("/home_settings/helper_sha256", json!("bad")),
        ("/home_settings/firmware_build", json!(null)),
    ] {
        let mut data = reply();
        *data.pointer_mut(path).unwrap() = value;
        assert!(paired_document(IDENTITY, &info, &data).is_err(), "{path}");
    }
    assert!(paired_document(IDENTITY, &json!({}), &reply()).is_err());
}
