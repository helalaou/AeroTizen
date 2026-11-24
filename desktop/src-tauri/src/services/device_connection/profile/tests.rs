use super::*;
use crate::{
    models::HomeBackup,
    services::{
        device_connection::tests::{metadata_document, Peer},
        digest::sha256_hex,
        sdb::tests::serve_script,
    },
    state::AppState,
};
use serde_json::json;

const DUID: &str = "test-duid";
fn steps(final_identity: &str, watcher: bool) -> Vec<(String, String)> {
    let mut steps = vec![
        ("shell:0 getduid".into(), DUID.into()),
        ("shell:0 getduid".into(), DUID.into()),
        (
            "shell:0 vd_applist".into(),
            "app_id=DclHome001.Home app_version=3.0.0".into(),
        ),
        ("shell:0 getduid".into(), DUID.into()),
        (
            "capability:".into(),
            "platform_version: 9.0.0\ncpu_arch: armv7\nsdk_toolpath: /private/path\n".into(),
        ),
        ("shell:0 getduid".into(), final_identity.into()),
    ];
    if watcher {
        let body = json!({"homeControl":{"app_id":LAUNCHER_APP_ID,"protocol":1,"mode":"watcher"}})
            .to_string();
        steps.push((
            "tcp:47790".into(),
            format!(
                "HTTP/1.0 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            ),
        ));
    }
    steps
}

#[tokio::test]
async fn first_native_connection_keeps_the_public_profile_without_a_worker_or_private_fields() {
    let mut metadata=metadata_document(json!({"name":"Lounge &amp; Room","modelName":"QE65LS03DAUXXU","model":"24_PTM","developerMode":"1","developerIP":"192.0.2.1"})).await;
    let mut tv = Peer::start(1, |mut socket, _| async move {
        serve_script(&mut socket, steps(DUID, true)).await
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let mut state = AppState::for_test(directory.path());
    state.device_connection =
        TvConnection::with_ports(directory.path().join("cli-state"), tv.port, metadata.port);
    let saved = crate::services::tvs::connect_tv(&state, "127.0.0.1".into(), None)
        .await
        .unwrap();
    assert_eq!(saved.tv.identity_sha256, sha256_hex(DUID.as_bytes()));
    assert_eq!(saved.tv.name, "Lounge & Room");
    assert_eq!(saved.tv.launcher_version.as_deref(), Some("3.0.0"));
    assert_eq!(saved.tv.transport, "developer");
    assert_eq!(
        saved.tv.technical_details.tizen_version.as_deref(),
        Some("9.0.0")
    );
    assert_eq!(
        saved.tv.technical_details.architecture.as_deref(),
        Some("armv7")
    );
    assert!(matches!(
        saved.tv.home_routing_mode,
        Some(HomeRoutingMode::Watcher)
    ));
    assert!(saved.tv.native_home_settings.is_none());
    assert!(matches!(saved.tv.home_backup, Some(HomeBackup::Missing)));
    let public = serde_json::to_string(&saved).unwrap();
    assert!(!public.contains(DUID));
    assert!(!public.contains("/private/path"));
    assert_eq!(state.profiles.list().await.unwrap().len(), 1);
    assert_eq!(tv.finish().await[0].len(), 7);
    metadata.finish().await;
}

#[tokio::test]
async fn changed_identity_never_saves_a_profile() {
    let mut metadata = metadata_document(json!({})).await;
    let mut tv = Peer::start(1, |mut socket, _| async move {
        serve_script(&mut socket, steps("other-tv", false)).await
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let mut state = AppState::for_test(directory.path());
    state.device_connection =
        TvConnection::with_ports(directory.path().join("cli-state"), tv.port, metadata.port);
    assert_eq!(
        crate::services::tvs::connect_tv(&state, "127.0.0.1".into(), None)
            .await
            .unwrap_err()
            .code,
        "identity_mismatch"
    );
    assert!(state.profiles.list().await.unwrap().is_empty());
    tv.finish().await;
    metadata.finish().await;
}

#[test]
fn watcher_status_requires_the_known_app_protocol_and_valid_http_body() {
    for mode in ["watcher", "native", "hold", "blocked"] {
        let body =
            json!({"homeControl":{"app_id":LAUNCHER_APP_ID,"protocol":1,"mode":mode}}).to_string();
        let raw = format!(
            "HTTP/1.0 200 OK\r\nContent-Length: {}\r\n\r\n{body}",
            body.len()
        );
        assert_eq!(
            serde_json::to_value(routing(&raw).unwrap()).unwrap(),
            json!(mode)
        );
        let raw = format!(
            "HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n{:x}\r\n{body}\r\n0\r\n\r\n",
            body.len()
        );
        assert!(routing(&raw).is_some());
    }
    for value in [
        json!({"app_id":"Other.App","protocol":1,"mode":"native"}),
        json!({"app_id":LAUNCHER_APP_ID,"protocol":true,"mode":"native"}),
        json!({"app_id":LAUNCHER_APP_ID,"protocol":1,"mode":"unknown"}),
    ] {
        assert!(routing(&format!(
            "HTTP/1.0 200 OK\r\n\r\n{}",
            json!({"homeControl":value})
        ))
        .is_none());
    }
    for raw in [
        "HTTP/1.0 403 No\r\n\r\n{}",
        "HTTP/1.0 200 OK\r\nContent-Length: 100\r\n\r\n{}",
        "HTTP/1.0 200 OK\r\nTransfer-Encoding: chunked\r\n\r\nffffffff\r\n",
        "invalid",
    ] {
        assert!(routing(raw).is_none());
    }
}

#[test]
fn home_settings_and_technical_fields_exclude_untrusted_values() {
    let settings=native_settings(&json!({"home_settings":{"home_button_app":"com.samsung.tv.csfs","home_app":"bad; command","startup_app":"","startup_backup_app":true,"smart_hub_autostart":1}})).unwrap();
    assert_eq!(
        settings.home_button_app.as_deref(),
        Some("com.samsung.tv.csfs")
    );
    assert!(settings.home_app.is_none());
    assert_eq!(settings.startup_app.as_deref(), Some(""));
    assert!(settings.smart_hub_autostart.is_none());
    let details = details(
        &json!({"modelName":"private user value","model":"not-a-platform"}),
        &HashMap::from([
            ("platform_version".into(), json!("private")),
            ("cpu_arch".into(), json!("unknown")),
        ]),
        Some(&json!({"runtime_version":"file://private"})),
    );
    assert!(
        details.model_code.is_none()
            && details.platform.is_none()
            && details.tizen_version.is_none()
            && details.architecture.is_none()
            && details.root_runtime_version.is_none()
    );
}

#[tokio::test]
async fn paired_profiles_use_authenticated_home_settings_from_the_same_boot_and_keep_recovery() {
    use crate::services::{
        root_bridge::tests::{reply, server_tls},
        root_pairing::tests::{document, save},
    };
    use tokio::{
        io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
        net::TcpListener,
    };
    for (protocol, changed_boot) in [(None, false), (Some(1), false), (Some(1), true)] {
        let (acceptor, pin) = server_tls();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let directory = tempfile::tempdir().unwrap();
        let mut record = document();
        record["certificate_sha256"] = json!(pin);
        record["bridge_port"] = json!(port);
        record["duid_sha256"] = json!(sha256_hex(DUID.as_bytes()));
        let path = save(directory.path(), "127.0.0.1", &record);
        let before = std::fs::read(&path).unwrap();
        let mut metadata =
            metadata_document(json!({"developerIP":"127.0.0.1","modelName":"QE65LS03DAUXXU"}))
                .await;
        let reader = TvConnection::with_ports(directory.path().into(), 1, metadata.port);
        let server = async {
            let (socket, _) = listener.accept().await.unwrap();
            let mut relay = BufReader::new(acceptor.accept(socket).await.unwrap());
            let mut line = String::new();
            relay.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["operation"], "sdb");
            let mut proof = reply(&request);
            if let Some(protocol) = protocol {
                proof["home_status_protocol"] = json!(protocol);
            }
            relay
                .write_all(format!("{proof}\n").as_bytes())
                .await
                .unwrap();
            let read_sdb = serve_script(&mut relay, steps(DUID, true));
            let read_home = async {
                if protocol != Some(1) {
                    return;
                }
                let (socket, _) = listener.accept().await.unwrap();
                let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
                let mut line = String::new();
                socket.read_line(&mut line).await.unwrap();
                let request: Value = serde_json::from_str(&line).unwrap();
                assert_eq!(request["operation"], "home_status");
                assert!(request.get("buttons").is_none());
                let mut result = reply(&request);
                result["home_settings"] = json!({"home_button_app":"DclHome001.Home","home_app":"DclHome001.Home","startup_app":"org.tizen.tv-viewer","startup_backup_app":"","smart_hub_autostart":true});
                if changed_boot {
                    result["boot_id"] = json!("00000000-0000-4000-8000-000000000099");
                }
                socket
                    .write_all(format!("{result}\n").as_bytes())
                    .await
                    .unwrap();
            };
            tokio::join!(read_sdb, read_home);
        };
        let (result, ()) = tokio::time::timeout(Duration::from_secs(3), async {
            tokio::join!(reader.profile("127.0.0.1", None), server)
        })
        .await
        .unwrap();
        let result = result.unwrap();
        assert_eq!(result.transport, "paired_root");
        assert_eq!(
            result.technical_details.root_runtime_version.as_deref(),
            Some("3.0.9")
        );
        if protocol == Some(1) && !changed_boot {
            assert_eq!(
                result
                    .native_home_settings
                    .unwrap()
                    .home_button_app
                    .as_deref(),
                Some(LAUNCHER_APP_ID)
            );
        } else {
            assert!(result.native_home_settings.is_none());
        }
        assert_eq!(std::fs::read(path).unwrap(), before);
        metadata.finish().await;
    }
}

#[tokio::test]
async fn offline_public_metadata_keeps_the_verified_profile_and_signing_readiness() {
    let mut tv = Peer::start(1, |mut socket, _| async move {
        serve_script(&mut socket, steps(DUID, true)).await
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let certificates = directory.path().join("certs").join(DUID);
    std::fs::create_dir_all(&certificates).unwrap();
    for filename in CERTIFICATE_FILES {
        std::fs::write(certificates.join(filename), b"synthetic profile").unwrap();
    }
    let reader = TvConnection::with_ports(directory.path().into(), tv.port, 1);
    let result = reader
        .profile("127.0.0.1", Some(&sha256_hex(DUID.as_bytes())))
        .await
        .unwrap();
    assert_eq!(result.name, "Samsung TV");
    assert_eq!(result.model, "Samsung TV");
    assert!(result.launcher_signing_ready);
    tv.finish().await;
    assert!(!signing_ready(directory.path(), "../outside"));
    assert!(!signing_ready(directory.path(), "bad/duid"));
}
