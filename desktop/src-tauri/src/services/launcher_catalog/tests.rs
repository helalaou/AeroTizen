use super::*;
use serde_json::json;
use std::collections::VecDeque;
use std::sync::{Arc, Mutex};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

const TEST_TIMEOUT: Duration = Duration::from_secs(2);
const TEST_REQUEST_TIMEOUT: Duration = Duration::from_millis(50);
const MAX_REQUEST_HEADER_BYTES: usize = 8192;
const TEST_TOKEN: &str = "private-test-token";

fn compatibility() -> Value {
    // Captured from the Python catalogue and note parser before removing those desktop-only helpers.
    serde_json::from_str(include_str!("fixtures/cli-compatibility.json")).unwrap()
}

pub(super) fn release(version: &str) -> Value {
    let tag = format!("launcher-v{version}");
    let assets = [MANIFEST_ASSET.to_owned(),format!("aerotizen-launcher-{version}.wgt")].map(|name| json!({
        "browser_download_url":format!("https://github.com/{REPOSITORY}/releases/download/{tag}/{name}"),"name":name
    }));
    json!({"tag_name":tag,"draft":false,"prerelease":false,"assets":assets})
}

fn full_page() -> Value {
    json!(vec![release("1.0.0"); PAGE_SIZE])
}

fn limits() -> Limits {
    Limits {
        timeout: TEST_TIMEOUT,
        retry_base_delay: Duration::ZERO,
        ..DEFAULT_LIMITS
    }
}

pub(super) fn client(timeout: Duration) -> Client {
    Client::builder()
        .no_proxy()
        .redirect(Policy::none())
        .retry(reqwest::retry::never())
        .timeout(timeout)
        .user_agent(USER_AGENT)
        .build()
        .unwrap()
}

pub(super) struct Reply {
    pub(super) status: u16,
    pub(super) body: Option<Vec<u8>>,
    pub(super) length: bool,
    pub(super) headers: String,
}
impl Reply {
    pub(super) fn json(value: Value) -> Self {
        Self {
            status: 200,
            body: Some(serde_json::to_vec(&value).unwrap()),
            length: true,
            headers: String::new(),
        }
    }
    pub(super) fn status(status: u16) -> Self {
        Self {
            status,
            body: Some(b"private response detail".to_vec()),
            length: true,
            headers: "Location: http://127.0.0.1:9/secret\r\n".into(),
        }
    }
    pub(super) fn stalled() -> Self {
        Self {
            status: 200,
            body: None,
            length: false,
            headers: String::new(),
        }
    }
}

pub(super) struct Server {
    pub(super) endpoint: String,
    pub(super) requests: Arc<Mutex<Vec<String>>>,
    task: tokio::task::JoinHandle<()>,
}
impl Drop for Server {
    fn drop(&mut self) {
        self.task.abort();
    }
}

pub(super) async fn server(replies: Vec<Reply>) -> Server {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let endpoint = format!("http://{}/releases", listener.local_addr().unwrap());
    let requests = Arc::new(Mutex::new(Vec::new()));
    let captured = requests.clone();
    let mut replies: VecDeque<_> = replies.into();
    let task = tokio::spawn(async move {
        loop {
            let (mut stream, _) = listener.accept().await.unwrap();
            let mut request = Vec::new();
            let mut buffer = [0; 1024];
            while request.len() < MAX_REQUEST_HEADER_BYTES
                && !request.windows(4).any(|part| part == b"\r\n\r\n")
            {
                let size = stream.read(&mut buffer).await.unwrap();
                if size == 0 {
                    break;
                }
                request.extend_from_slice(&buffer[..size]);
            }
            captured
                .lock()
                .unwrap()
                .push(String::from_utf8(request).unwrap());
            let reply = replies.pop_front().expect("unexpected extra HTTP request");
            let Some(body) = reply.body else {
                std::future::pending::<()>().await;
                unreachable!()
            };
            let mut headers = format!(
                "HTTP/1.1 {} Test\r\nConnection: close\r\n{}",
                reply.status, reply.headers
            );
            if reply.length {
                headers.push_str(&format!("Content-Length: {}\r\n", body.len()));
            }
            headers.push_str("\r\n");
            let _ = stream.write_all(headers.as_bytes()).await;
            let _ = stream.write_all(&body).await;
        }
    });
    Server {
        endpoint,
        requests,
        task,
    }
}

fn assert_unavailable(error: AppError) {
    assert_eq!(
        serde_json::to_value(error).unwrap(),
        json!({
            "code":"release_unavailable", "message":"Could not load launcher versions."
        })
    );
}

#[tokio::test]
async fn catalogue_matches_cli_filtering_numeric_order_and_first_valid_duplicate() {
    for case in compatibility()["catalogues"].as_array().unwrap() {
        let server = server(vec![Reply::json(case["input"].clone())]).await;
        let actual = load_with(&client(TEST_TIMEOUT), &server.endpoint, None, limits())
            .await
            .unwrap();
        assert_eq!(
            serde_json::to_value(actual).unwrap(),
            case["expected"],
            "{}",
            case["name"]
        );
        assert_eq!(server.requests.lock().unwrap().len(), 1);
    }
}

#[test]
fn release_notes_match_cli_sections_and_text() {
    for case in compatibility()["notes"].as_array().unwrap() {
        assert_eq!(
            serde_json::to_value(notes::sections(case["input"].as_str())).unwrap(),
            case["expected"],
            "{}",
            case["input"]
        );
    }
    let body = format!("* {}suffix", "🦀".repeat(8_000));
    let sections = notes::sections(Some(&body));
    assert_eq!(sections[0].changes[0], "🦀".repeat(7_998));
}

#[tokio::test]
async fn pagination_and_refresh_use_fresh_metadata_and_expected_headers_only() {
    let server = server(vec![
        Reply::json(full_page()),
        Reply::json(json!([release("2.0.0")])),
        Reply::json(json!([release("3.0.0")])),
    ])
    .await;
    let client = client(TEST_TIMEOUT);
    let first = load_with(&client, &server.endpoint, Some(TEST_TOKEN), limits())
        .await
        .unwrap();
    assert_eq!(
        first
            .iter()
            .map(|entry| entry.version.as_str())
            .collect::<Vec<_>>(),
        ["2.0.0", "1.0.0"]
    );
    let refreshed = load_with(&client, &server.endpoint, Some(TEST_TOKEN), limits())
        .await
        .unwrap();
    assert_eq!(refreshed[0].version, "3.0.0");
    let requests = server.requests.lock().unwrap();
    assert_eq!(requests.len(), 3);
    for (request, page) in requests.iter().zip([1, 2, 1]) {
        assert!(request.starts_with(&format!(
            "GET /releases?per_page=100&page={page} HTTP/1.1\r\n"
        )));
        let header = request.to_ascii_lowercase();
        assert!(header.contains(&format!("accept: {GITHUB_ACCEPT}\r\n")));
        assert!(header.contains(&format!("user-agent: {USER_AGENT}\r\n")));
        assert!(header.contains(&format!("authorization: bearer {TEST_TOKEN}\r\n")));
    }
}

#[tokio::test]
async fn rate_limits_other_http_errors_and_redirects_fail_once_without_exposing_details() {
    for status in [400, 403, 404, 429, 501, 302] {
        let server = server(vec![Reply::status(status)]).await;
        assert_unavailable(
            load_with(
                &client(TEST_TIMEOUT),
                &server.endpoint,
                Some(TEST_TOKEN),
                limits(),
            )
            .await
            .unwrap_err(),
        );
        assert_eq!(server.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn transient_http_failures_retry_with_a_fixed_attempt_limit() {
    assert_eq!(
        retry_delay(StatusCode::BAD_GATEWAY, 0, RETRY_BASE_DELAY),
        Some(Duration::from_millis(500))
    );
    assert_eq!(
        retry_delay(StatusCode::BAD_GATEWAY, 1, RETRY_BASE_DELAY),
        Some(Duration::from_millis(1000))
    );
    assert_eq!(
        retry_delay(StatusCode::BAD_GATEWAY, 2, RETRY_BASE_DELAY),
        None
    );
    for (replies, success) in [
        (
            vec![
                Reply::status(500),
                Reply::status(502),
                Reply::json(json!([])),
            ],
            true,
        ),
        (
            vec![Reply::status(503), Reply::status(503), Reply::status(503)],
            false,
        ),
    ] {
        let server = server(replies).await;
        let result = load_with(&client(TEST_TIMEOUT), &server.endpoint, None, limits()).await;
        if success {
            assert!(result.unwrap().is_empty());
        } else {
            assert_unavailable(result.unwrap_err());
        }
        assert_eq!(server.requests.lock().unwrap().len(), MAX_ATTEMPTS);
    }
}

#[tokio::test]
async fn malformed_json_or_release_shapes_reject_the_whole_catalogue() {
    for body in [
        b"invalid JSON".to_vec(),
        b"{}".to_vec(),
        serde_json::to_vec(&json!([release("1.0.0"), null])).unwrap(),
    ] {
        let server = server(vec![Reply {
            body: Some(body),
            ..Reply::json(json!([]))
        }])
        .await;
        assert_unavailable(
            load_with(&client(TEST_TIMEOUT), &server.endpoint, None, limits())
                .await
                .unwrap_err(),
        );
        assert_eq!(server.requests.lock().unwrap().len(), 1);
    }
}

#[tokio::test]
async fn advertised_and_streamed_page_sizes_are_bounded_before_json_is_accepted() {
    let mut oversized = serde_json::to_vec(&json!([release("1.0.0")])).unwrap();
    oversized.extend(std::iter::repeat_n(b' ', MAX_PAGE_BYTES));
    for length in [true, false] {
        let server = server(vec![Reply {
            body: Some(oversized.clone()),
            length,
            ..Reply::json(json!([]))
        }])
        .await;
        assert_unavailable(
            load_with(&client(TEST_TIMEOUT), &server.endpoint, None, limits())
                .await
                .unwrap_err(),
        );
    }
}

#[tokio::test]
async fn page_limit_or_a_later_page_error_never_returns_partial_results() {
    for last in [
        Reply::json(full_page()),
        Reply::json(json!({"error":"private"})),
    ] {
        let server = server(vec![Reply::json(full_page()), last]).await;
        let limits = Limits {
            pages: 2,
            ..limits()
        };
        assert_unavailable(
            load_with(&client(TEST_TIMEOUT), &server.endpoint, None, limits)
                .await
                .unwrap_err(),
        );
        assert_eq!(server.requests.lock().unwrap().len(), 2);
    }
}

#[tokio::test]
async fn serialized_catalogue_size_is_bounded_including_array_overhead() {
    let first = catalog_entry(&release("1.0.0")).unwrap();
    let exact = serde_json::to_vec(&vec![first]).unwrap().len();
    for (input, success) in [
        (json!([release("1.0.0")]), true),
        (json!([release("1.0.0"), release("2.0.0")]), false),
    ] {
        let server = server(vec![Reply::json(input)]).await;
        let result = load_with(
            &client(TEST_TIMEOUT),
            &server.endpoint,
            None,
            Limits {
                result_bytes: exact,
                ..limits()
            },
        )
        .await;
        if success {
            assert_eq!(result.unwrap().len(), 1);
        } else {
            assert_unavailable(result.unwrap_err());
        }
    }
}

#[tokio::test]
async fn request_and_overall_deadlines_cancel_stalled_metadata_requests() {
    let stalled = server(vec![Reply::stalled()]).await;
    assert_unavailable(
        load_with(
            &client(TEST_REQUEST_TIMEOUT),
            &stalled.endpoint,
            None,
            limits(),
        )
        .await
        .unwrap_err(),
    );
    assert_eq!(stalled.requests.lock().unwrap().len(), 1);
    let stalled = server(vec![Reply::json(full_page()), Reply::stalled()]).await;
    assert_unavailable(
        load_with(
            &client(TEST_TIMEOUT),
            &stalled.endpoint,
            None,
            Limits {
                timeout: TEST_REQUEST_TIMEOUT,
                ..limits()
            },
        )
        .await
        .unwrap_err(),
    );
    assert_eq!(stalled.requests.lock().unwrap().len(), 2);
}

#[tokio::test]
async fn production_client_rejects_plain_http_before_sending_any_request() {
    let server = server(vec![Reply::json(json!([]))]).await;
    assert_unavailable(
        load_with(
            &catalog_client().unwrap(),
            &server.endpoint,
            Some(TEST_TOKEN),
            limits(),
        )
        .await
        .unwrap_err(),
    );
    assert!(server.requests.lock().unwrap().is_empty());
}
