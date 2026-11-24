use super::*;
use crate::services::{
    root_bridge::tests::{reply, server_tls},
    root_pairing::tests::{document, save},
    sdb::tests as wire,
};
use serde_json::json;
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc,
};
use tokio::{
    io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
    task::JoinHandle,
};

const DUID: &str = "test-duid";
const TEST_TIMEOUT: Duration = Duration::from_secs(4);

pub(crate) struct Peer {
    pub(crate) port: u16,
    accepted: Arc<AtomicUsize>,
    task: Option<JoinHandle<Vec<Vec<String>>>>,
}
impl Drop for Peer {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}
impl Peer {
    pub(crate) async fn start<F, Pending>(count: usize, mut handler: F) -> Self
    where
        F: FnMut(TcpStream, usize) -> Pending + Send + 'static,
        Pending: std::future::Future<Output = Vec<String>> + Send,
    {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let accepted = Arc::new(AtomicUsize::new(0));
        let counter = accepted.clone();
        let task = tokio::spawn(async move {
            let mut results = Vec::new();
            for index in 0..count {
                let (socket, _) = timeout(TEST_TIMEOUT, listener.accept())
                    .await
                    .unwrap()
                    .unwrap();
                counter.fetch_add(1, Ordering::SeqCst);
                results.push(handler(socket, index).await);
            }
            results
        });
        Self {
            port,
            accepted,
            task: Some(task),
        }
    }
    pub(crate) async fn finish(&mut self) -> Vec<Vec<String>> {
        timeout(TEST_TIMEOUT, self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
    }
}

async fn metadata(developer: Value) -> Peer {
    metadata_document(json!({"developerIP":developer})).await
}

pub(crate) async fn metadata_document(info: Value) -> Peer {
    Peer::start(1, move |mut socket, _| {
        let body = json!({"device": info}).to_string();
        async move {
            let mut request = [0; 4096];
            let count = socket.read(&mut request).await.unwrap();
            assert!(String::from_utf8_lossy(&request[..count])
                .starts_with("GET /api/v2/ HTTP/1.1"));
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            );
            socket.write_all(response.as_bytes()).await.unwrap();
            Vec::new()
        }
    })
    .await
}

fn inventory() -> Value {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/app-inventory.json"
    ))
    .unwrap();
    fixture["cases"][0].clone()
}

#[tokio::test]
async fn developer_inventory_uses_one_read_only_session_and_returns_the_cli_projection() {
    let case = inventory();
    let raw = case["raw"].as_str().unwrap().to_owned();
    let mut server = Peer::start(1, move |mut socket, _| {
        let raw = raw.clone();
        async move { wire::serve(&mut socket, [DUID, DUID], &raw).await }
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let reader = TvConnection::with_ports(directory.path().into(), server.port, 1);
    let result = reader
        .packages("127.0.0.1", &sha256_hex(DUID.as_bytes()))
        .await
        .unwrap();
    assert_eq!(json!(result), case["packages"]);
    assert_eq!(
        server.finish().await,
        vec![vec![
            "shell:0 getduid",
            "shell:0 vd_applist",
            "shell:0 getduid"
        ]]
    );
}

#[tokio::test]
async fn identity_checks_precede_inventory_and_refuse_a_changed_tv_afterwards() {
    for changed_after in [false, true] {
        let mut server = Peer::start(1, move |mut socket, _| async move {
            let identities = if changed_after {
                [DUID, "other-tv"]
            } else {
                ["other-tv", DUID]
            };
            wire::serve(&mut socket, identities, "ExampleApp.App\tMedia\n").await
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let reader = TvConnection::with_ports(directory.path().into(), server.port, 1);
        assert_eq!(
            reader
                .packages("127.0.0.1", &sha256_hex(DUID.as_bytes()))
                .await
                .unwrap_err()
                .code,
            "identity_mismatch"
        );
        let requests = server.finish().await;
        assert_eq!(requests[0].len(), if changed_after { 3 } else { 1 });
    }
}

#[test]
fn routing_matches_cli_pairing_and_live_developer_host_rules() {
    let expected = sha256_hex(DUID.as_bytes());
    let mut value = document();
    value["duid_sha256"] = json!(expected);
    let active = root_pairing::parse(value.clone(), &expected).unwrap();
    assert!(matches!(route(None, None).unwrap(), Route::Developer(None)));
    for developer in [None, Some(Value::Null), Some(json!("127.0.0.1"))] {
        assert!(matches!(
            route(Some(&active), developer.as_ref()).unwrap(),
            Route::Paired(_)
        ));
    }
    for developer in [json!("192.0.2.10"), json!("invalid"), json!(false)] {
        assert!(matches!(
            route(Some(&active), Some(&developer)).unwrap(),
            Route::Developer(_)
        ));
    }
    value["phase"] = json!("removed");
    let removed = root_pairing::parse(value, &expected).unwrap();
    assert!(route(Some(&removed), Some(&json!("127.0.0.1"))).is_err());
    assert!(matches!(
        route(Some(&removed), None).unwrap(),
        Route::Developer(None)
    ));
}

#[tokio::test]
async fn paired_app_names_keep_buffered_sdb_bytes_after_the_authenticated_reply_and_preserve_receipts(
) {
    let (acceptor, pin) = server_tls();
    let wire_fixture = wire::fixture();
    let fixture_copy = wire_fixture.clone();
    let mut bridge = Peer::start(1, move |socket, _| {
        let acceptor = acceptor.clone();
        let fixture = fixture_copy.clone();
        async move {
            let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
            let mut line = String::new();
            socket.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            let mut expected = fixture["bridge_request"].clone();
            expected["nonce"] = request["nonce"].clone();
            assert_eq!(request, expected);
            let mut response = format!("{}\n", reply(&request)).into_bytes();
            response.extend(wire::bytes(fixture["incoming_hex"].as_str().unwrap()));
            socket.write_all(&response).await.unwrap();
            let mut outgoing = Vec::new();
            let _ = socket.read_to_end(&mut outgoing).await;
            assert_eq!(
                outgoing,
                wire::bytes(fixture["outgoing_hex"].as_str().unwrap())
            );
            vec!["sdb".into()]
        }
    })
    .await;
    let mut info = metadata(json!("127.0.0.1")).await;
    let directory = tempfile::tempdir().unwrap();
    let expected = sha256_hex(DUID.as_bytes());
    let mut value = document();
    value["duid_sha256"] = json!(expected);
    value["bridge_port"] = json!(bridge.port);
    value["certificate_sha256"] = json!(pin);
    let path = save(directory.path(), "127.0.0.1", &value);
    let before = std::fs::read(&path).unwrap();
    let reader = TvConnection::with_ports(directory.path().into(), 1, info.port);
    assert_eq!(
        json!(reader.targets("127.0.0.1", &expected).await.unwrap()),
        json!([{ "id":"Abcdefghij.App","name":"Media 😀" }])
    );
    assert_eq!(bridge.finish().await[0], vec!["sdb"]);
    info.finish().await;
    assert_eq!(std::fs::read(path).unwrap(), before);
}

#[tokio::test]
async fn bad_pairing_proof_or_certificate_never_sends_sdb_or_falls_back_to_developer_mode() {
    for certificate in [false, true] {
        let (acceptor, pin) = server_tls();
        let mut bridge = Peer::start(1, move |socket, _| {
            let acceptor = acceptor.clone();
            async move {
                let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
                let mut line = String::new();
                let _ = socket.read_line(&mut line).await;
                if !line.is_empty() {
                    let request: Value = serde_json::from_str(&line).unwrap();
                    let mut value = reply(&request);
                    value["nonce"] = json!("replayed");
                    socket
                        .write_all(format!("{value}\n").as_bytes())
                        .await
                        .unwrap();
                    let mut bytes = Vec::new();
                    let _ = socket.read_to_end(&mut bytes).await;
                    assert!(bytes.is_empty());
                }
                vec![line]
            }
        })
        .await;
        let mut direct = Peer::start(1, |_, _| async {
            panic!("must not downgrade to direct SDB")
        })
        .await;
        let mut info = metadata(json!("127.0.0.1")).await;
        let directory = tempfile::tempdir().unwrap();
        let expected = sha256_hex(DUID.as_bytes());
        let mut value = document();
        value["duid_sha256"] = json!(expected);
        value["bridge_port"] = json!(bridge.port);
        value["certificate_sha256"] = json!(if certificate { "0".repeat(64) } else { pin });
        save(directory.path(), "127.0.0.1", &value);
        let reader = TvConnection::with_ports(directory.path().into(), direct.port, info.port);
        assert_eq!(
            reader
                .targets("127.0.0.1", &expected)
                .await
                .unwrap_err()
                .code,
            "connection_failed"
        );
        assert_eq!(direct.accepted.load(Ordering::SeqCst), 0);
        assert_eq!(bridge.finish().await[0][0].is_empty(), certificate);
        info.finish().await;
        direct.task.take().unwrap().abort();
    }
}

#[tokio::test]
async fn a_changed_recovery_record_cannot_return_inventory_from_a_previous_pairing() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().to_owned();
    let (acceptor, pin) = server_tls();
    let expected = sha256_hex(DUID.as_bytes());
    let expected_copy = expected.clone();
    let mut bridge = Peer::start(1, move |socket, _| {
        let acceptor = acceptor.clone();
        let target = target.clone();
        let expected = expected_copy.clone();
        async move {
            let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
            let mut line = String::new();
            socket.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            socket
                .write_all(format!("{}\n", reply(&request)).as_bytes())
                .await
                .unwrap();
            let mut changed = document();
            changed["duid_sha256"] = json!(expected);
            changed["phase"] = json!("removed");
            save(&target, "127.0.0.1", &changed);
            wire::serve(&mut socket, [DUID, DUID], "ExampleApp.App\tMedia\n").await
        }
    })
    .await;
    let mut info = metadata(json!("127.0.0.1")).await;
    let mut value = document();
    value["duid_sha256"] = json!(expected);
    value["bridge_port"] = json!(bridge.port);
    value["certificate_sha256"] = json!(pin);
    save(directory.path(), "127.0.0.1", &value);
    let reader = TvConnection::with_ports(directory.path().into(), 1, info.port);
    assert_eq!(
        reader
            .packages("127.0.0.1", &expected)
            .await
            .unwrap_err()
            .code,
        "root_state_changed"
    );
    bridge.finish().await;
    info.finish().await;
}

#[tokio::test]
async fn connection_reset_retries_handshake_but_never_repeats_inventory_commands() {
    let mut server = Peer::start(2, |mut socket, index| async move {
        if index == 0 {
            let mut input = [0; 24];
            socket.read_exact(&mut input).await.unwrap();
            Vec::new()
        } else {
            wire::serve(&mut socket, [DUID, DUID], "ExampleApp.App\tMedia\n").await
        }
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let reader = TvConnection::with_ports(directory.path().into(), server.port, 1);
    reader
        .packages("127.0.0.1", &sha256_hex(DUID.as_bytes()))
        .await
        .unwrap();
    let requests = server.finish().await;
    assert!(requests[0].is_empty());
    assert_eq!(requests[1].len(), 3);
}

#[tokio::test]
async fn the_read_deadline_closes_a_stalled_handshake_and_releases_tv_ownership() {
    let mut server = Peer::start(1, |mut socket, _| async move {
        let mut bytes = Vec::new();
        socket.read_to_end(&mut bytes).await.unwrap();
        assert!(!bytes.is_empty());
        Vec::new()
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let reader = TvConnection::with_ports(directory.path().into(), server.port, 1);
    let error = reader
        .read_bounded(
            "127.0.0.1",
            &sha256_hex(DUID.as_bytes()),
            Duration::from_millis(100),
        )
        .await
        .unwrap_err();
    assert_eq!(error.code, "connection_failed");
    server.finish().await;
    assert!(tv_session::acquire(directory.path(), "127.0.0.1")
        .await
        .is_ok());
}

#[tokio::test]
async fn required_developer_address_cannot_fall_back_to_another_interface() {
    let directory = tempfile::tempdir().unwrap();
    let owner = TvConnection::new(directory.path().to_owned());
    let result = owner
        .connect_once(
            Ipv4Addr::LOCALHOST,
            Route::DeveloperRequired(Ipv4Addr::new(192, 0, 2, 254)),
        )
        .await;
    assert!(matches!(result, Err(ConnectFailure::Refused)));
}
