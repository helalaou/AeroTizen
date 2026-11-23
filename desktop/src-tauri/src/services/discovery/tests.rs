use super::*;
use serde_json::json;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const TEST_SEARCH_WINDOW: Duration = Duration::from_millis(100);
const TEST_REQUEST_TIMEOUT: Duration = Duration::from_millis(100);
const TEST_DEADLINE: Duration = Duration::from_secs(2);
const MAX_REQUEST_HEADER_BYTES: usize = 8192;
type Requests = Arc<Mutex<Vec<Vec<u8>>>>;

fn compatibility() -> Value {
    // Captured from the CLI's MSEARCH and desktop_worker.text_value before migration.
    serde_json::from_str(include_str!("fixtures/cli-compatibility.json")).unwrap()
}

#[test]
fn network_errors_explain_permissions_without_exposing_system_details() {
    let error = discovery_error(std::io::Error::new(
        std::io::ErrorKind::PermissionDenied,
        "private interface detail",
    ));
    assert_eq!(error.code, "discovery_failed");
    assert!(error.message.contains("system settings"));
    assert!(!serde_json::to_string(&error)
        .unwrap()
        .contains("private interface detail"));
}

fn response(status: &str, body: &[u8], length: bool, headers: &str) -> Vec<u8> {
    let mut reply = format!("HTTP/1.1 {status}\r\nConnection: close\r\n{headers}").into_bytes();
    if length {
        reply.extend_from_slice(format!("Content-Length: {}\r\n", body.len()).as_bytes());
    }
    reply.extend_from_slice(b"\r\n");
    reply.extend_from_slice(body);
    reply
}

async fn http_server(servers: &mut JoinSet<()>, reply: Option<Vec<u8>>) -> (u16, Requests) {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let port = listener.local_addr().unwrap().port();
    let requests = Arc::new(Mutex::new(Vec::new()));
    let recorded = requests.clone();
    servers.spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut header = Vec::new();
            let mut buffer = [0; 1024];
            while header.len() < MAX_REQUEST_HEADER_BYTES
                && !header.windows(4).any(|part| part == b"\r\n\r\n")
            {
                let size = stream.read(&mut buffer).await.unwrap();
                if size == 0 {
                    break;
                }
                header.extend_from_slice(&buffer[..size]);
            }
            recorded.lock().unwrap().push(header);
            if let Some(reply) = &reply {
                let _ = stream.write_all(reply).await;
            } else {
                std::future::pending::<()>().await;
            }
        }
    });
    (port, requests)
}

#[test]
fn accepts_only_valid_samsung_responses_from_usable_ipv4_senders() {
    let sender: SocketAddr = "192.0.2.20:1900".parse().unwrap();
    let valid = b"HTTP/1.1 200 OK\r\nSERVER: sAmSuNg\r\n\r\n";
    assert_eq!(
        samsung_host(valid, sender),
        Some(Ipv4Addr::new(192, 0, 2, 20))
    );
    for invalid in [
        b"Samsung".as_slice(),
        b"NOTIFY * HTTP/1.1\r\nSamsung",
        b"HTTP/1.1 500 Samsung",
        b"HTTP/1.1 200 OK\r\nOther vendor",
    ] {
        assert_eq!(samsung_host(invalid, sender), None);
    }
    let mut oversized = valid.to_vec();
    oversized.resize(MAX_SSDP_RESPONSE_BYTES + 1, b' ');
    assert_eq!(samsung_host(&oversized, sender), None);
    for sender in [
        "0.0.0.0:1900",
        "239.255.255.250:1900",
        "255.255.255.255:1900",
        "[::1]:1900",
    ] {
        assert_eq!(samsung_host(valid, sender.parse().unwrap()), None);
    }
}

#[test]
fn tv_names_match_the_cli_contract() {
    for case in compatibility()["text"].as_array().unwrap() {
        assert_eq!(
            clean_text(case.get("input")),
            case["expected"].as_str().unwrap(),
            "{}",
            case["input"]
        );
    }
}

#[test]
fn device_info_returns_only_candidate_fields_and_tolerates_missing_labels() {
    let host = Ipv4Addr::new(192, 0, 2, 20);
    let body = serde_json::to_vec(&json!({"device": {"name": "Lounge", "modelName": "Frame", "duid": "private", "token": "secret"}})).unwrap();
    let tv = candidate_from_json(host, &body).unwrap();
    assert_eq!(
        serde_json::to_value(tv).unwrap(),
        json!({"host":"192.0.2.20", "name":"Lounge", "model":"Frame"})
    );
    let unknown = candidate_from_json(host, br#"{"device":{"name":null,"modelName":42}}"#).unwrap();
    assert_eq!(unknown.name, DEFAULT_TV_LABEL);
    assert_eq!(unknown.model, DEFAULT_TV_LABEL);
    for invalid in [b"invalid JSON".as_slice(), b"{}", br#"{"device":[]}"#] {
        assert!(candidate_from_json(host, invalid).is_none());
    }
}

#[tokio::test]
async fn native_discovery_uses_ssdp_and_the_fixed_api_once_per_host() {
    let mut servers = JoinSet::new();
    let body = br#"{"device":{"name":"65&quot; Frame &amp; Lounge","modelName":"QE65LS03DAUXXU"}}"#;
    let (port, requests) =
        http_server(&mut servers, Some(response("200 OK", body, true, ""))).await;
    let udp = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let SocketAddr::V4(target) = udp.local_addr().unwrap() else {
        unreachable!()
    };
    servers.spawn(async move {
        let mut request = [0; 1024];
        let (size, sender) = udp.recv_from(&mut request).await.unwrap();
        assert_eq!(&request[..size], compatibility()["m_search"].as_str().unwrap().as_bytes());
        let reply = format!("HTTP/1.1 200 OK\r\nSERVER: Samsung\r\nLOCATION: http://127.0.0.1:{port}/ignored\r\n\r\n");
        udp.send_to(b"HTTP/1.1 200 OK\r\nSERVER: Another vendor\r\n\r\n", sender).await.unwrap();
        let mut oversized = reply.as_bytes().to_vec();
        oversized.resize(MAX_SSDP_RESPONSE_BYTES + 1, b' ');
        udp.send_to(&oversized, sender).await.unwrap();
        udp.send_to(reply.as_bytes(), sender).await.unwrap();
        udp.send_to(reply.as_bytes(), sender).await.unwrap();
    });
    let options = DiscoveryOptions {
        target,
        search_window: TEST_SEARCH_WINDOW,
        device_info_port: port,
        ..DEFAULT_OPTIONS
    };
    let result = tokio::time::timeout(TEST_DEADLINE, discover_with_options(options))
        .await
        .unwrap()
        .unwrap();
    assert_eq!(result.len(), 1);
    assert_eq!(result[0].name, "65\" Frame & Lounge");
    assert_eq!(result[0].model, "QE65LS03DAUXXU");
    let captured = requests.lock().unwrap().clone();
    assert_eq!(captured.len(), 1);
    assert!(captured[0].starts_with(b"GET /api/v2/ HTTP/1.1\r\n"));
    servers.shutdown().await;
}

#[tokio::test]
async fn a_quiet_network_returns_an_empty_list() {
    let mut servers = JoinSet::new();
    let udp = UdpSocket::bind((Ipv4Addr::LOCALHOST, 0)).await.unwrap();
    let SocketAddr::V4(target) = udp.local_addr().unwrap() else {
        unreachable!()
    };
    servers.spawn(async move {
        let _ = udp.recv_from(&mut [0; 1024]).await.unwrap();
    });
    let options = DiscoveryOptions {
        target,
        search_window: TEST_SEARCH_WINDOW,
        ..DEFAULT_OPTIONS
    };
    assert!(
        tokio::time::timeout(TEST_DEADLINE, discover_with_options(options))
            .await
            .unwrap()
            .unwrap()
            .is_empty()
    );
    servers.shutdown().await;
}

#[tokio::test]
async fn metadata_rejects_redirects_errors_invalid_json_and_oversized_bodies() {
    let valid = br#"{"device":{"name":"TV","modelName":"Frame"}}"#;
    let oversized = [vec![b' '; MAX_DEVICE_INFO_BYTES], valid.to_vec()].concat();
    let replies = [
        response("302 Found", valid, true, "Location: /redirected\r\n"),
        response("500 Error", valid, true, ""),
        response("200 OK", b"invalid JSON", true, ""),
        response("200 OK", &oversized, true, ""),
        response("200 OK", &oversized, false, ""),
    ];
    let client = metadata_client(TEST_REQUEST_TIMEOUT).unwrap();
    for reply in replies {
        let mut servers = JoinSet::new();
        let (port, requests) = http_server(&mut servers, Some(reply)).await;
        assert!(read_candidate(&client, Ipv4Addr::LOCALHOST, port)
            .await
            .is_none());
        assert_eq!(requests.lock().unwrap().len(), 1);
        servers.shutdown().await;
    }
}

#[tokio::test]
async fn metadata_requests_time_out_without_retaining_the_connection() {
    let mut servers = JoinSet::new();
    let (port, requests) = http_server(&mut servers, None).await;
    let client = metadata_client(TEST_REQUEST_TIMEOUT).unwrap();
    let result = tokio::time::timeout(
        TEST_DEADLINE,
        read_candidate(&client, Ipv4Addr::LOCALHOST, port),
    )
    .await
    .unwrap();
    assert!(result.is_none());
    assert_eq!(requests.lock().unwrap().len(), 1);
    servers.shutdown().await;
}

struct ActiveProbe(Arc<AtomicUsize>);
impl Drop for ActiveProbe {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
}

fn candidate(host: Ipv4Addr) -> TvCandidate {
    TvCandidate {
        host: host.to_string(),
        name: "Test TV".into(),
        model: "Frame".into(),
    }
}

#[tokio::test(start_paused = true)]
async fn probe_deadline_keeps_completed_results_and_cleans_up_bounded_tasks() {
    let started = Instant::now();
    let active = Arc::new(AtomicUsize::new(0));
    let peak = Arc::new(AtomicUsize::new(0));
    let hosts = (1..=MAX_CONCURRENT_PROBES as u8 * 2)
        .map(|last| Ipv4Addr::new(192, 0, 2, last))
        .collect();
    let result = tokio::time::timeout(
        TEST_DEADLINE,
        probe_hosts(hosts, TEST_SEARCH_WINDOW, |host| {
            let active = active.clone();
            let peak = peak.clone();
            async move {
                let now = active.fetch_add(1, Ordering::SeqCst) + 1;
                peak.fetch_max(now, Ordering::SeqCst);
                let _guard = ActiveProbe(active);
                if host.octets()[3] == 1 {
                    return Some(candidate(host));
                }
                std::future::pending::<()>().await;
                None
            }
        }),
    )
    .await
    .unwrap()
    .unwrap();
    assert_eq!(result.len(), 1);
    assert!(peak.load(Ordering::SeqCst) > 0);
    assert!(peak.load(Ordering::SeqCst) <= MAX_CONCURRENT_PROBES);
    assert_eq!(active.load(Ordering::SeqCst), 0);
    assert_eq!(Instant::now() - started, TEST_SEARCH_WINDOW);
}

#[tokio::test(start_paused = true)]
async fn results_keep_the_cli_address_order_and_tv_limit() {
    let hosts: BTreeSet<_> = (1..=MAX_DISCOVERED_TVS as u8 * 2)
        .map(|last| Ipv4Addr::new(192, 0, 2, last))
        .collect();
    let mut expected: Vec<_> = hosts.iter().map(ToString::to_string).collect();
    expected.sort();
    expected.truncate(MAX_DISCOVERED_TVS);
    let result = probe_hosts(
        hosts,
        TEST_DEADLINE,
        |host| async move { Some(candidate(host)) },
    )
    .await
    .unwrap();
    assert_eq!(
        result.into_iter().map(|tv| tv.host).collect::<Vec<_>>(),
        expected
    );
}
