use super::*;
use std::sync::Arc;
use tokio::{net::TcpListener, sync::mpsc, task::JoinHandle};
use tokio_rustls::{rustls, TlsAcceptor};

const TEST_TIMEOUT: Duration = Duration::from_secs(3);

pub(crate) fn server_tls() -> (TlsAcceptor, String) {
    let rcgen::CertifiedKey { cert, key_pair } =
        rcgen::generate_simple_self_signed(vec!["localhost".into()]).unwrap();
    let pin = sha256_hex(cert.der());
    let key = rustls::pki_types::PrivatePkcs8KeyDer::from(key_pair.serialize_der());
    let config = rustls::ServerConfig::builder_with_provider(Arc::new(
        rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .unwrap()
    .with_no_client_auth()
    .with_single_cert(vec![cert.der().clone()], key.into())
    .unwrap();
    (TlsAcceptor::from(Arc::new(config)), pin)
}

#[test]
fn native_button_payloads_match_the_cli_wire_fixture_and_can_never_apply_changes() {
    let mut expected: Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/button-read-request.json"
    ))
    .unwrap();
    let pairing = Pairing {
        port: 26104,
        installation_id: "1".repeat(32),
        device_identity: "b".repeat(64),
        certificate_sha256: "d".repeat(64),
        token: "c".repeat(64),
    };
    for (operation, action) in [
        (ReadRequest::DiscoverButtons, "list"),
        (ReadRequest::SavedButtons, "status"),
    ] {
        expected["buttons"]["action"] = json!(action);
        assert_eq!(
            operation.payload(&pairing, "00000000000000000000000000000000"),
            expected
        );
    }
}

#[test]
fn button_edits_match_the_cli_wire_contract_and_use_the_learn_deadline_only_for_learning() {
    let expected: Value = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/button-read-request.json"
    ))
    .unwrap();
    let edits: Vec<Value> = serde_json::from_str(include_str!(
        "../../../../tests/fixtures/button-edit-requests.json"
    ))
    .unwrap();
    let pairing = Pairing {
        port: 26104,
        installation_id: "1".repeat(32),
        device_identity: "b".repeat(64),
        certificate_sha256: "d".repeat(64),
        token: "c".repeat(64),
    };
    for fixture in edits {
        let edit: ButtonEdit = serde_json::from_value(fixture["buttons"].clone()).unwrap();
        let mut wire = expected.clone();
        wire["buttons"] = fixture["buttons"].clone();
        assert_eq!(
            Request::ButtonEdit(&edit).payload(&pairing, expected["nonce"].as_str().unwrap()),
            wire
        );
        assert_eq!(
            edit_timeout(&edit),
            Duration::from_secs(if fixture["buttons"]["action"] == "learn" {
                25
            } else {
                8
            })
        );
    }
}

pub(crate) fn reply(request: &Value) -> Value {
    json!({
        "protocol": 1, "authenticated": true, "app_id": HELPER_APP_ID,
        "installation_id": "1".repeat(32), "device_identity_sha256": "b".repeat(64),
        "nonce": request["nonce"], "uid": 0, "euid": 0, "gid": 0,
        "boot_id": "00000000-0000-4000-8000-000000000002", "origin": "boot",
        "automatic_startup_enabled": true, "bootstrap_completed": true,
        "helper_installed": true, "runtime_version": "3.0.9",
    })
}

pub(crate) struct Server {
    pub port: u16,
    pub pin: String,
    pub received: mpsc::Receiver<Option<Value>>,
    task: Option<JoinHandle<()>>,
}

impl Drop for Server {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}

impl Server {
    pub async fn new(
        count: usize,
        mut response: impl FnMut(&Value) -> Vec<u8> + Send + 'static,
    ) -> Self {
        let (acceptor, pin) = server_tls();
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let (sender, received) = mpsc::channel(count.max(1));
        let task = tokio::spawn(async move {
            for _ in 0..count {
                let (tcp, _) = tokio::time::timeout(TEST_TIMEOUT, listener.accept())
                    .await
                    .unwrap()
                    .unwrap();
                let Ok(tls) = acceptor.accept(tcp).await else {
                    let _ = sender.send(None).await;
                    continue;
                };
                let mut tls = BufReader::new(tls);
                let mut request = Vec::new();
                match tls.read_until(b'\n', &mut request).await {
                    Ok(0) | Err(_) => {
                        let _ = sender.send(None).await;
                    }
                    Ok(_) => {
                        let request: Value = serde_json::from_slice(&request).unwrap();
                        let _ = sender.send(Some(request.clone())).await;
                        let bytes = response(&request);
                        let _ = tls.get_mut().write_all(&bytes).await;
                    }
                }
            }
        });
        Self {
            port,
            pin,
            received,
            task: Some(task),
        }
    }

    pub fn pairing(&self) -> Pairing {
        Pairing {
            port: self.port,
            installation_id: "1".repeat(32),
            device_identity: "b".repeat(64),
            certificate_sha256: self.pin.clone(),
            token: "c".repeat(64),
        }
    }

    pub async fn next(&mut self) -> Option<Value> {
        tokio::time::timeout(TEST_TIMEOUT, self.received.recv())
            .await
            .unwrap()
            .unwrap()
    }

    pub async fn finish(&mut self) {
        tokio::time::timeout(TEST_TIMEOUT, self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap();
    }
}

#[tokio::test]
async fn pinned_tls_sends_only_status_and_uses_a_fresh_nonce_for_each_request() {
    let mut server = Server::new(2, |request| format!("{}\n", reply(request)).into_bytes()).await;
    let pairing = server.pairing();
    let mut previous = String::new();
    for _ in 0..2 {
        let status = super::status(Ipv4Addr::LOCALHOST, &pairing).await.unwrap();
        assert_eq!(status["runtime_version"], "3.0.9");
        let request = server.next().await.unwrap();
        assert_eq!(request.as_object().unwrap().len(), 4);
        assert_eq!(request["operation"], "status");
        assert_eq!(request["protocol"], 1);
        assert_eq!(request["token"], "c".repeat(64));
        let nonce = request["nonce"].as_str().unwrap();
        assert_eq!(nonce.len(), NONCE_BYTES * 2);
        assert_ne!(nonce, previous);
        previous = nonce.into();
    }
    server.finish().await;
}

#[tokio::test]
async fn wrong_certificate_is_rejected_before_any_token_or_protocol_bytes_are_sent() {
    let mut server = Server::new(1, |_| panic!("request must not be sent")).await;
    let mut pairing = server.pairing();
    pairing.certificate_sha256 = "0".repeat(64);
    assert_eq!(
        super::status(Ipv4Addr::LOCALHOST, &pairing)
            .await
            .unwrap_err(),
        BridgeError::Certificate
    );
    assert!(server.next().await.is_none());
    server.finish().await;
}

#[test]
fn authenticated_reply_requires_exact_protocol_identity_nonce_root_ids_and_boot_uuid() {
    let pairing = Pairing {
        port: 26104,
        installation_id: "1".repeat(32),
        device_identity: "b".repeat(64),
        certificate_sha256: "d".repeat(64),
        token: "c".repeat(64),
    };
    let valid = reply(&json!({"nonce": "expected"}));
    assert!(verified_reply(valid.clone(), "expected", &pairing).is_ok());
    for (key, invalid) in [
        ("protocol", json!(true)),
        ("protocol", json!(1.0)),
        ("authenticated", json!(1)),
        ("nonce", json!("replay")),
        ("app_id", json!("another-app")),
        ("installation_id", json!("2".repeat(32))),
        ("device_identity_sha256", json!("e".repeat(64))),
        ("uid", json!(true)),
        ("euid", json!(901)),
        ("gid", json!(0.0)),
        ("boot_id", json!("invalid")),
        ("boot_id", json!("00000000000040008000000000000002")),
        ("boot_id", json!("00000000-0000-4000-ABCD-000000000002")),
    ] {
        let mut value = valid.clone();
        value[key] = invalid;
        assert_eq!(
            verified_reply(value, "expected", &pairing).unwrap_err(),
            BridgeError::Proof,
            "{key}"
        );
    }
}

#[tokio::test]
async fn replies_are_bounded_and_require_a_newline_and_valid_json() {
    for mode in ["limit", "oversized", "unterminated", "invalid"] {
        let mut server = Server::new(1, move |request| {
            let mut bytes = reply(request).to_string().into_bytes();
            match mode {
                "limit" => {
                    bytes.resize(MAX_REPLY_BYTES, b' ');
                    bytes.push(b'\n');
                }
                "oversized" => {
                    bytes.resize(MAX_REPLY_BYTES + 1, b' ');
                    bytes.push(b'\n');
                }
                "unterminated" => {}
                _ => bytes = b"private-invalid-json\n".to_vec(),
            }
            bytes
        })
        .await;
        let result = super::status(Ipv4Addr::LOCALHOST, &server.pairing()).await;
        assert_eq!(result.is_ok(), mode == "limit", "{mode}");
        server.finish().await;
    }
}

#[tokio::test]
async fn request_deadline_drops_a_stalled_tls_handshake() {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let pairing = Pairing {
        port: listener.local_addr().unwrap().port(),
        installation_id: "1".repeat(32),
        device_identity: "b".repeat(64),
        certificate_sha256: "d".repeat(64),
        token: "c".repeat(64),
    };
    let request = timed_status(Ipv4Addr::LOCALHOST, &pairing, Duration::from_millis(150));
    let server = async {
        let (mut tcp, _) = listener.accept().await.unwrap();
        let mut input = Vec::new();
        tcp.read_to_end(&mut input).await.unwrap();
        assert!(!input
            .windows(64)
            .any(|bytes| bytes == "c".repeat(64).as_bytes()));
    };
    let (result, _) = tokio::join!(request, server);
    assert_eq!(result.unwrap_err(), BridgeError::Timeout);
}
