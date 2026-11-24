use super::*;
use crate::{
    models::VerifiedTv,
    services::{device_connection::tests::Peer, digest::sha256_hex, sdb::tests::serve_script},
    state::AppState,
};

#[tokio::test]
async fn existing_original_is_verified_natively_without_worker_or_home_status_requirement() {
    let directory = tempfile::tempdir().unwrap();
    let mut state = AppState::for_test(directory.path());
    let expected = sha256_hex(b"test-duid");
    let mut document: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/home-backup.json"
    ))
    .unwrap();
    document["device"]["identity_sha256"] = serde_json::json!(expected);
    let backup = state
        .home_backups
        .save_original(&expected, document)
        .await
        .unwrap();
    let mut peer = Peer::start(1, |mut io, _| async move {
        serve_script(
            &mut io,
            vec![("shell:0 getduid".into(), "test-duid".into())],
        )
        .await
    })
    .await;
    state.device_connection =
        TvConnection::with_ports(directory.path().join("cli-state"), peer.port, 1);
    let mut tv: VerifiedTv =
        serde_json::from_str(include_str!("../../../models/fixtures/verified-tv.json")).unwrap();
    tv.host = "127.0.0.1".into();
    tv.identity_sha256 = expected;
    let saved = state.profiles.save(tv).await.unwrap();
    let result = crate::services::home::prepare_native_home(&state, saved.id)
        .await
        .unwrap();
    assert_eq!(result.backup_sha256, backup.backup_sha256);
    assert!(!state.worker_path.exists());
    assert_eq!(peer.finish().await[0].len(), 1);
}

#[tokio::test]
async fn missing_backup_without_a_paired_helper_is_unavailable_and_writes_no_backup() {
    let directory = tempfile::tempdir().unwrap();
    let expected = sha256_hex(b"test-duid");
    let mut peer = Peer::start(1, |mut io, _| async move {
        serve_script(
            &mut io,
            vec![("shell:0 getduid".into(), "test-duid".into())],
        )
        .await
    })
    .await;
    let connection = TvConnection::with_ports(directory.path().into(), peer.port, 1);
    assert_eq!(
        connection
            .prepare_home_backup("127.0.0.1", &expected)
            .await
            .unwrap_err()
            .code,
        "backup_unavailable"
    );
    assert!(!directory.path().join("backups").exists());
    peer.finish().await;
}

#[tokio::test]
async fn first_apply_captures_only_authenticated_complete_originals_before_any_launcher_action() {
    use crate::services::{
        device_connection::tests::metadata_document,
        root_bridge::tests::{reply, server_tls},
        root_pairing::tests::{document, save},
    };
    use serde_json::{json, Value};
    use tokio::{
        io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
        net::TcpListener,
    };
    for scenario in ["ok", "incomplete", "identity"] {
        let directory = tempfile::tempdir().unwrap();
        let expected = sha256_hex(b"test-duid");
        let (acceptor, pin) = server_tls();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let mut receipt = document();
        receipt["duid_sha256"] = json!(expected);
        receipt["bridge_port"] = json!(listener.local_addr().unwrap().port());
        receipt["certificate_sha256"] = json!(pin);
        let receipt_path = save(directory.path(), "127.0.0.1", &receipt);
        let original_receipt = std::fs::read(&receipt_path).unwrap();
        let mut metadata = metadata_document(
            json!({"developerIP":"127.0.0.1","modelName":"Frame","model":"24_PTM"}),
        )
        .await;
        let connection = TvConnection::with_ports(directory.path().into(), 1, metadata.port);
        let server = async {
            let (socket, _) = listener.accept().await.unwrap();
            let mut relay = BufReader::new(acceptor.accept(socket).await.unwrap());
            let mut line = String::new();
            relay.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["operation"], "sdb");
            let mut proof = reply(&request);
            proof["home_status_protocol"] = json!(1);
            relay
                .write_all(format!("{proof}\n").as_bytes())
                .await
                .unwrap();
            let scripts = vec![
                ("shell:0 getduid".into(), "test-duid".into()),
                (
                    "shell:0 getduid".into(),
                    if scenario == "identity" {
                        "other-tv"
                    } else {
                        "test-duid"
                    }
                    .into(),
                ),
            ];
            let sdb = serve_script(&mut relay, scripts);
            let home = async {
                let (socket, _) = listener.accept().await.unwrap();
                let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
                let mut line = String::new();
                socket.read_line(&mut line).await.unwrap();
                let request: Value = serde_json::from_str(&line).unwrap();
                assert_eq!(request["operation"], "home_status");
                assert!(request.get("apply").is_none());
                let mut result = reply(&request);
                result["home_settings"] = json!({"home_button_app":"com.samsung.tv.csfs","home_app":"com.samsung.tv.csfs","startup_app":"org.tizen.tv-viewer","startup_backup_app":"org.tizen.tv-viewer","first_screen":"com.samsung.tv.csfs","smart_hub_autostart":false,"firmware_build":"TEST-1000.1","helper_sha256":"b".repeat(64)});
                if scenario == "incomplete" {
                    result["home_settings"]["smart_hub_autostart"] = Value::Null;
                }
                socket
                    .write_all(format!("{result}\n").as_bytes())
                    .await
                    .unwrap();
            };
            tokio::join!(sdb, home)
        };
        let (result, (commands, ())) = tokio::time::timeout(Duration::from_secs(3), async {
            tokio::join!(
                connection.prepare_home_backup("127.0.0.1", &expected),
                server
            )
        })
        .await
        .unwrap();
        assert!(commands.iter().all(|s| s == "shell:0 getduid"));
        let path = directory
            .path()
            .join("backups")
            .join(&expected)
            .join("original-home.json");
        if scenario == "ok" {
            let prepared = result.unwrap();
            assert!(path.is_file());
            assert_eq!(
                prepared.backup_sha256,
                sha256_hex(&std::fs::read(path).unwrap())
            );
        } else {
            assert!(result.is_err());
            assert!(!path.exists());
        }
        assert_eq!(std::fs::read(receipt_path).unwrap(), original_receipt);
        metadata.finish().await;
    }
}
