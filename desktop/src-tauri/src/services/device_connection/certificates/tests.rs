use super::*;
use crate::services::{
    device_connection::tests::Peer, digest::sha256_hex, sdb::tests::serve_script,
};
use http_body_util::{BodyExt, Full};
use hyper::{body::Bytes, server::conn::http1, service::service_fn, Response};
use hyper_util::rt::TokioIo;
use openssl::{
    asn1::{Asn1Integer, Asn1Time},
    bn::BigNum,
    hash::MessageDigest,
    nid::Nid,
    pkcs12::Pkcs12,
    pkey::{PKey, Private},
    rsa::Rsa,
    x509::{X509NameBuilder, X509Req, X509},
};
use serde_json::json;
use std::{convert::Infallible, sync::Arc};
use tokio::{net::TcpListener, task::JoinHandle};

const DUID: &str = "test-duid";
const TEST_TIMEOUT: Duration = Duration::from_secs(5);
fn auth() -> Value {
    json!({"access_token":"private-token","userId":"private-user","inputEmailID":"test@example.com"})
}
struct Authority {
    key: PKey<Private>,
    cert: X509,
}
fn authority() -> Authority {
    let key = PKey::from_rsa(Rsa::generate(2048).unwrap()).unwrap();
    let mut name = X509NameBuilder::new().unwrap();
    name.append_entry_by_nid(Nid::COMMONNAME, "Synthetic test CA")
        .unwrap();
    let name = name.build();
    let mut cert = X509::builder().unwrap();
    cert.set_version(2).unwrap();
    cert.set_subject_name(&name).unwrap();
    cert.set_issuer_name(&name).unwrap();
    cert.set_pubkey(&key).unwrap();
    let serial = Asn1Integer::from_bn(&BigNum::from_u32(1).unwrap()).unwrap();
    cert.set_serial_number(&serial).unwrap();
    cert.set_not_before(&Asn1Time::days_from_now(0).unwrap())
        .unwrap();
    cert.set_not_after(&Asn1Time::days_from_now(1).unwrap())
        .unwrap();
    cert.sign(&key, MessageDigest::sha256()).unwrap();
    Authority {
        key,
        cert: cert.build(),
    }
}
fn issue(authority: &Authority, request: &X509Req) -> Vec<u8> {
    let key = request.public_key().unwrap();
    assert!(request.verify(&key).unwrap());
    assert_eq!(key.rsa().unwrap().size() * 8, 2048);
    let mut cert = X509::builder().unwrap();
    cert.set_version(2).unwrap();
    cert.set_subject_name(request.subject_name()).unwrap();
    cert.set_issuer_name(authority.cert.subject_name()).unwrap();
    cert.set_pubkey(&key).unwrap();
    cert.set_serial_number(&Asn1Integer::from_bn(&BigNum::from_u32(2).unwrap()).unwrap())
        .unwrap();
    cert.set_not_before(&Asn1Time::days_from_now(0).unwrap())
        .unwrap();
    cert.set_not_after(&Asn1Time::days_from_now(1).unwrap())
        .unwrap();
    cert.sign(&authority.key, MessageDigest::sha256()).unwrap();
    cert.build().to_pem().unwrap()
}
struct Server {
    base: String,
    ca: Vec<u8>,
    task: Option<JoinHandle<Vec<String>>>,
}
impl Drop for Server {
    fn drop(&mut self) {
        if let Some(task) = &self.task {
            task.abort();
        }
    }
}
impl Server {
    async fn start(fail_at: Option<usize>) -> Self {
        let ca = Arc::new(authority());
        let ca_bytes = ca.cert.to_pem().unwrap();
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let base = format!("http://{}", listener.local_addr().unwrap());
        let task = tokio::spawn(async move {
            let mut paths = Vec::new();
            for index in 0..3 {
                let (socket, _) = timeout(TEST_TIMEOUT, listener.accept())
                    .await
                    .unwrap()
                    .unwrap();
                let ca = ca.clone();
                let path = Arc::new(std::sync::Mutex::new(String::new()));
                let captured = path.clone();
                let service = service_fn(move |request: hyper::Request<hyper::body::Incoming>| {
                    let ca = ca.clone();
                    let path = path.clone();
                    async move {
                        *path.lock().unwrap() = request.uri().path().into();
                        let headers = request.headers().clone();
                        let body = request.into_body().collect().await.unwrap().to_bytes();
                        let body = std::str::from_utf8(&body).unwrap();
                        assert!(headers["content-type"]
                            .to_str()
                            .unwrap()
                            .starts_with("multipart/form-data; boundary="));
                        for value in [
                            "name=\"access_token\"",
                            "private-token",
                            "name=\"user_id\"",
                            "private-user",
                            "name=\"platform\"",
                            "VD",
                        ] {
                            assert!(body.contains(value));
                        }
                        if index > 0 {
                            for value in
                                ["privilege_level", "public", "developer_type", "Individual"]
                            {
                                assert!(body.contains(value));
                            }
                        }
                        let start = body.find("-----BEGIN CERTIFICATE REQUEST-----").unwrap();
                        let end = body[start..]
                            .find("-----END CERTIFICATE REQUEST-----")
                            .unwrap()
                            + start
                            + "-----END CERTIFICATE REQUEST-----".len();
                        let csr = X509Req::from_pem(&body.as_bytes()[start..end]).unwrap();
                        let common = csr
                            .subject_name()
                            .entries_by_nid(Nid::COMMONNAME)
                            .next()
                            .unwrap()
                            .data()
                            .to_string()
                            .unwrap();
                        assert_eq!(common, if index == 0 { "aerotizen" } else { "TizenSDK" });
                        if index > 0 {
                            let text = String::from_utf8(csr.to_text().unwrap()).unwrap();
                            assert!(text.contains("URN:tizen:packageid="));
                            assert!(text.contains("URN:tizen:deviceid=test-duid"));
                        }
                        let reply = if index == 1 {
                            b"<device-profile>synthetic</device-profile>".to_vec()
                        } else {
                            issue(&ca, &csr)
                        };
                        let status = if fail_at == Some(index) { 403 } else { 200 };
                        Ok::<_, Infallible>(
                            Response::builder()
                                .status(status)
                                .header("connection", "close")
                                .body(Full::new(Bytes::from(reply)))
                                .unwrap(),
                        )
                    }
                });
                http1::Builder::new()
                    .serve_connection(TokioIo::new(socket), service)
                    .await
                    .unwrap();
                paths.push(captured.lock().unwrap().clone());
                if fail_at == Some(index) {
                    break;
                }
            }
            paths
        });
        Self {
            base,
            ca: ca_bytes,
            task: Some(task),
        }
    }
    fn issuer(&self) -> Issuer {
        Issuer {
            client: Client::builder()
                .redirect(Policy::none())
                .retry(reqwest::retry::never())
                .timeout(TEST_TIMEOUT)
                .build()
                .unwrap(),
            endpoints: [
                format!("{}/apis/v3/authors", self.base),
                format!("{}/apis/v1/distributors", self.base),
                format!("{}/apis/v3/distributors", self.base),
            ],
            author_ca: self.ca.clone(),
            distributor_ca: self.ca.clone(),
        }
    }
    async fn finish(&mut self) -> Vec<String> {
        timeout(TEST_TIMEOUT, self.task.take().unwrap())
            .await
            .unwrap()
            .unwrap()
    }
}

#[tokio::test]
async fn issuance_matches_samsung_csrs_and_forms_and_publishes_cli_compatible_encrypted_profiles() {
    let directory = tempfile::tempdir().unwrap();
    let mut server = Server::start(None).await;
    let issuer = server.issuer();
    let mut tv = Peer::start(1, |mut io, _| async move {
        serve_script(
            &mut io,
            vec![
                ("shell:0 getduid".into(), DUID.into()),
                ("shell:0 getduid".into(), DUID.into()),
            ],
        )
        .await
    })
    .await;
    let connection = TvConnection::with_ports(directory.path().into(), tv.port, 1);
    let expected = sha256_hex(DUID.as_bytes());
    let result = connection
        .prepare_certificates_with("127.0.0.1", &expected, Some(auth()), |duid, auth| {
            issuer.issue(duid, auth)
        })
        .await
        .unwrap();
    assert!(result.launcher_signing_ready);
    assert_eq!(result.identity_sha256, expected);
    let path = directory.path().join("certs").join(DUID);
    let password = std::fs::read_to_string(path.join("password.txt")).unwrap();
    assert_eq!(password.len(), 24);
    let mut keys = Vec::new();
    for filename in ["author.p12", "distributor.p12"] {
        let bytes = std::fs::read(path.join(filename)).unwrap();
        let archive = Pkcs12::from_der(&bytes).unwrap();
        assert!(archive.parse2("wrong password").is_err());
        let profile = archive.parse2(&password).unwrap();
        let key = profile.pkey.unwrap();
        let cert = profile.cert.unwrap();
        assert!(cert.public_key().unwrap().public_eq(&key));
        assert_eq!(profile.ca.unwrap().len(), 1);
        keys.push(key.public_key_to_der().unwrap());
    }
    assert_eq!(keys[0], keys[1]);
    assert_eq!(
        std::fs::read_dir(directory.path().join("certs"))
            .unwrap()
            .count(),
        1
    );
    assert_eq!(
        server.finish().await,
        vec![
            "/apis/v3/authors",
            "/apis/v1/distributors",
            "/apis/v3/distributors"
        ]
    );
    assert_eq!(tv.finish().await[0].len(), 2);
}

#[tokio::test]
async fn ready_profiles_are_reused_without_sign_in_and_incomplete_originals_are_preserved() {
    for ready in [true, false] {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("certs").join(DUID);
        std::fs::create_dir_all(&path).unwrap();
        for filename in if ready {
            CERTIFICATE_FILES.to_vec()
        } else {
            vec!["author.p12"]
        } {
            std::fs::write(path.join(filename), b"original profile").unwrap();
        }
        let mut tv = Peer::start(1, |mut io, _| async move {
            serve_script(&mut io, vec![("shell:0 getduid".into(), DUID.into())]).await
        })
        .await;
        let connection = TvConnection::with_ports(directory.path().into(), tv.port, 1);
        let result = connection
            .prepare_certificates_with(
                "127.0.0.1",
                &sha256_hex(DUID.as_bytes()),
                None,
                |_, _| async { panic!("must not issue replacement certificates") },
            )
            .await;
        if ready {
            assert!(result.unwrap().launcher_signing_ready);
        } else {
            assert_eq!(result.unwrap_err().code, "signing_profile_incomplete");
        }
        assert_eq!(
            std::fs::read(path.join("author.p12")).unwrap(),
            b"original profile"
        );
        tv.finish().await;
    }
}

#[tokio::test]
async fn failed_issuance_or_changed_tv_never_leaves_a_partial_profile_or_replays_requests() {
    for failure in ["server", "identity"] {
        let directory = tempfile::tempdir().unwrap();
        let mut server = Server::start(if failure == "server" { Some(1) } else { None }).await;
        let issuer = server.issuer();
        let identity = failure == "identity";
        let mut tv = Peer::start(1, move |mut io, _| async move {
            serve_script(
                &mut io,
                vec![
                    ("shell:0 getduid".into(), DUID.into()),
                    (
                        "shell:0 getduid".into(),
                        if identity { "other-tv" } else { DUID }.into(),
                    ),
                ],
            )
            .await
        })
        .await;
        let connection = TvConnection::with_ports(directory.path().into(), tv.port, 1);
        let result = connection
            .prepare_certificates_with(
                "127.0.0.1",
                &sha256_hex(DUID.as_bytes()),
                Some(auth()),
                |duid, auth| issuer.issue(duid, auth),
            )
            .await;
        let error = result.unwrap_err();
        assert_eq!(
            error.code,
            if identity {
                "identity_mismatch"
            } else {
                "certificates_failed"
            }
        );
        assert!(!error.message.contains("private-token"));
        assert!(!directory.path().join("certs").exists());
        assert_eq!(server.finish().await.len(), if identity { 3 } else { 2 });
        tv.finish().await;
    }
}

#[tokio::test]
async fn absent_sign_in_and_unsupported_device_ids_cannot_start_issuance() {
    for duid in [DUID, "../outside"] {
        let directory = tempfile::tempdir().unwrap();
        let mut tv = Peer::start(1, move |mut io, _| async move {
            serve_script(&mut io, vec![("shell:0 getduid".into(), duid.into())]).await
        })
        .await;
        let connection = TvConnection::with_ports(directory.path().into(), tv.port, 1);
        let error = connection
            .prepare_certificates_with(
                "127.0.0.1",
                &sha256_hex(duid.as_bytes()),
                None,
                |_, _| async { panic!("issuance must not start") },
            )
            .await
            .unwrap_err();
        assert_eq!(
            error.code,
            if duid == DUID {
                "samsung_sign_in_required"
            } else {
                "identity_unavailable"
            }
        );
        assert!(!directory.path().join("certs").exists());
        tv.finish().await;
    }
}

#[test]
fn wrong_issued_keys_or_signatures_cannot_form_a_signing_profile() {
    let original = crypto::material(DUID, "test@example.com").unwrap();
    let other = crypto::material(DUID, "test@example.com").unwrap();
    let ca = authority();
    let request = X509Req::from_pem(&other.author_csr).unwrap();
    let cert = issue(&ca, &request);
    let ca_bytes = ca.cert.to_pem().unwrap();
    assert!(crypto::package(
        original,
        cert.clone(),
        cert,
        b"xml".to_vec(),
        ca_bytes.clone(),
        ca_bytes
    )
    .is_err());
    let material = crypto::material(DUID, "test@example.com").unwrap();
    let request = X509Req::from_pem(&material.author_csr).unwrap();
    let cert = issue(&ca, &request);
    let wrong_ca = authority().cert.to_pem().unwrap();
    assert!(crypto::package(
        material,
        cert.clone(),
        cert,
        b"xml".to_vec(),
        wrong_ca.clone(),
        wrong_ca
    )
    .is_err());
}

#[tokio::test]
async fn certificate_http_refuses_redirects_oversized_replies_and_stalls_without_exposing_auth() {
    use tokio::io::{AsyncReadExt, AsyncWriteExt};
    for scenario in ["redirect", "oversized", "stall"] {
        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let other = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let redirect = format!("http://{}/untrusted", other.local_addr().unwrap());
        let address = listener.local_addr().unwrap();
        let issuer = Issuer {
            client: Client::builder()
                .retry(reqwest::retry::never())
                .redirect(Policy::none())
                .timeout(Duration::from_millis(100))
                .build()
                .unwrap(),
            endpoints: std::array::from_fn(|_| format!("http://{address}/author")),
            author_ca: Vec::new(),
            distributor_ca: Vec::new(),
        };
        let server = async {
            let (mut socket, _) = listener.accept().await.unwrap();
            let mut received = Vec::new();
            let mut chunk = [0; 4096];
            loop {
                let count = socket.read(&mut chunk).await.unwrap();
                assert!(count > 0);
                received.extend_from_slice(&chunk[..count]);
                if let Some(end) = received.windows(4).position(|part| part == b"\r\n\r\n") {
                    let header = String::from_utf8_lossy(&received[..end]);
                    let length = header
                        .lines()
                        .find_map(|line| {
                            line.split_once(':')
                                .filter(|(key, _)| key.eq_ignore_ascii_case("content-length"))
                                .map(|(_, value)| value.trim().parse::<usize>().unwrap())
                        })
                        .unwrap();
                    if received.len() >= end + 4 + length {
                        break;
                    }
                }
                assert!(received.len() < 16 * 1024);
            }
            if scenario == "redirect" {
                socket.write_all(format!("HTTP/1.1 307 Temporary Redirect\r\nLocation: {redirect}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n").as_bytes()).await.unwrap();
            }
            if scenario == "oversized" {
                socket
                    .write_all(
                        format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
                            MAX_RESPONSE_BYTES + 1
                        )
                        .as_bytes(),
                    )
                    .await
                    .unwrap();
            }
            let mut remaining = Vec::new();
            let _ = timeout(Duration::from_secs(1), socket.read_to_end(&mut remaining))
                .await
                .unwrap();
        };
        let authentication = auth();
        let (result, ()) = timeout(TEST_TIMEOUT, async {
            tokio::join!(
                issuer.post(
                    CertificateRequest::Author,
                    &authentication,
                    b"synthetic csr".to_vec()
                ),
                server
            )
        })
        .await
        .unwrap();
        let error = result.unwrap_err();
        assert_eq!(error.code, "certificates_failed");
        assert!(!error.message.contains("private-token"));
        assert!(timeout(Duration::from_millis(20), other.accept())
            .await
            .is_err());
        assert!(timeout(Duration::from_millis(20), listener.accept())
            .await
            .is_err());
    }
}

#[tokio::test]
async fn production_issuance_never_sends_credentials_over_plain_http() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut issuer = Issuer::production().unwrap();
    issuer.endpoints[0] = format!("http://{}/author", listener.local_addr().unwrap());
    assert_eq!(
        issuer
            .post(CertificateRequest::Author, &auth(), b"csr".to_vec())
            .await
            .unwrap_err()
            .code,
        "certificates_failed"
    );
    assert!(timeout(Duration::from_millis(20), listener.accept())
        .await
        .is_err());
}

#[test]
fn distributor_csr_preserves_an_optional_empty_account_email() {
    let material = crypto::material(DUID, "").unwrap();
    let request = X509Req::from_pem(&material.distributor_csr).unwrap();
    let email = request
        .subject_name()
        .entries_by_nid(Nid::PKCS9_EMAILADDRESS)
        .next()
        .unwrap();
    assert!(email.data().as_slice().is_empty());
}
