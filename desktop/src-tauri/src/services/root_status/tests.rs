use super::super::root_bridge::tests::{reply, Server};
use super::*;
use serde_json::{json, Value};

fn fixture(directory: &std::path::Path, server: &Server) -> PathBuf {
    let mut document = records::tests::document();
    document["bridge_port"] = json!(server.port);
    document["certificate_sha256"] = json!(server.pin);
    records::tests::save(directory, "127.0.0.1", &document)
}

#[tokio::test]
async fn recovery_path_requires_a_record_for_the_selected_tv() {
    let directory = tempfile::tempdir().unwrap();
    let store = RootStatus::new(directory.path().into());
    let host = records::tests::HOST;
    let identity = records::tests::IDENTITY;
    let missing = store
        .recovery_record_path(host, identity)
        .await
        .unwrap_err();
    assert_eq!(missing.code, "recovery_record_missing");
    let path = records::tests::save(directory.path(), host, &records::tests::document());
    assert_eq!(
        store.recovery_record_path(host, identity).await.unwrap(),
        path
    );
    let mismatch = store
        .recovery_record_path(host, &"e".repeat(64))
        .await
        .unwrap_err();
    assert_eq!(mismatch.code, "identity_mismatch");
}

#[tokio::test]
async fn native_status_reads_live_proof_with_no_worker_and_keeps_receipts_unchanged() {
    let mut server = Server::new(1, |request| format!("{}\n", reply(request)).into_bytes()).await;
    let directory = tempfile::tempdir().unwrap();
    let path = fixture(directory.path(), &server);
    let before = std::fs::read(&path).unwrap();
    let result = RootStatus::new(directory.path().into())
        .read("127.0.0.1", records::tests::IDENTITY)
        .await
        .unwrap();
    assert!(result.root_available && result.setup_complete && result.automatic_boot_verified);
    assert_eq!(result.runtime_version.as_deref(), Some("3.0.9"));
    assert_eq!(result.target_runtime_version, TARGET_RUNTIME_VERSION);
    assert_eq!(std::fs::read(path).unwrap(), before);
    assert_eq!(server.next().await.unwrap()["operation"], "status");
    server.finish().await;
}

#[tokio::test]
async fn missing_removed_or_invalid_records_do_not_contact_the_helper() {
    let directory = tempfile::tempdir().unwrap();
    let store = RootStatus::new(directory.path().into());
    let absent = store
        .read("192.0.2.20", records::tests::IDENTITY)
        .await
        .unwrap();
    assert!(!absent.root_available && !absent.recovery_saved);
    let mut document = records::tests::document();
    document["phase"] = json!("removed");
    records::tests::save(directory.path(), "192.0.2.20", &document);
    let removed = store
        .read("192.0.2.20", records::tests::IDENTITY)
        .await
        .unwrap();
    assert!(removed.recovery_saved && !removed.root_available && !removed.setup_complete);
    assert_eq!(
        store
            .read("192.0.2.20", &"e".repeat(64))
            .await
            .unwrap_err()
            .code,
        "identity_mismatch"
    );
    for host in ["invalid", "224.0.0.1", "0.0.0.0", "255.255.255.255"] {
        assert_eq!(
            store
                .read(host, records::tests::IDENTITY)
                .await
                .unwrap_err()
                .code,
            "invalid_address"
        );
    }
    assert_eq!(
        store
            .read("192.0.2.20", "../invalid")
            .await
            .unwrap_err()
            .code,
        "invalid_request"
    );
}

#[tokio::test]
async fn failed_bridge_proof_is_unverified_and_never_uses_saved_completion_as_live_status() {
    let mut server = Server::new(1, |request| {
        let mut value = reply(request);
        value["nonce"] = json!("replayed");
        format!("{value}\n").into_bytes()
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    fixture(directory.path(), &server);
    let result = RootStatus::new(directory.path().into())
        .read("127.0.0.1", records::tests::IDENTITY)
        .await
        .unwrap();
    assert_eq!(result.phase, RootPhase::Active);
    assert!(
        !result.root_available
            && !result.setup_complete
            && result.runtime_version.is_none()
            && result.automatic_startup.is_none()
    );
    server.finish().await;
}

#[tokio::test]
async fn a_record_changed_during_the_query_is_not_reported_as_verified() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().to_owned();
    let mut server = Server::new(1, move |request| {
        let path = target
            .join("root")
            .join(super::super::digest::sha256_hex(b"127.0.0.1"))
            .join("receipt.json");
        let mut value: Value = serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
        value["phase"] = json!("removing");
        std::fs::write(path, serde_json::to_vec(&value).unwrap()).unwrap();
        format!("{}\n", reply(request)).into_bytes()
    })
    .await;
    fixture(directory.path(), &server);
    let error = RootStatus::new(directory.path().into())
        .read("127.0.0.1", records::tests::IDENTITY)
        .await
        .unwrap_err();
    assert_eq!(error.code, "root_state_changed");
    server.finish().await;
}
