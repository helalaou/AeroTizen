use super::super::tests::{client, release, server, Reply};
use super::*;
use crate::services::sdb::tests::bytes;
use serde_json::json;
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/launcher-download.json"
    ))
    .unwrap()
}
fn package() -> Vec<u8> {
    bytes(fixture()["packages"][0]["zip_hex"].as_str().unwrap())
}
fn manifest_document() -> Value {
    json!({"schema_version":1,"version":"2.2.0","min_cli_version":"2.2.0","app_id":LAUNCHER_APP_ID,"package_id":"DclHome001","asset":"aerotizen-launcher-2.2.0.wgt","sha256":sha256_hex(&package())})
}
#[test]
fn unsigned_package_validation_matches_the_cli_contract_and_required_watcher_modules() {
    let fixture = fixture();
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("launcher.wgt");
    for case in fixture["packages"].as_array().unwrap() {
        std::fs::write(&path, bytes(case["zip_hex"].as_str().unwrap())).unwrap();
        assert_eq!(
            check_package(&path, "2.2.0").is_ok(),
            case["valid"].as_bool().unwrap(),
            "{}",
            case["name"]
        );
    }
}
#[test]
fn manifest_identity_checksum_format_schema_and_minimum_version_are_required() {
    assert!(manifest(&manifest_document(), "2.2.0").is_ok());
    for (field, value) in [
        ("schema_version", json!(1.0)),
        ("version", json!("2.1.0")),
        ("asset", json!("different.wgt")),
        ("app_id", json!("other.Home")),
        ("package_id", json!("other")),
        ("sha256", json!("A".repeat(64))),
        ("min_cli_version", json!("9999.0.0")),
        ("min_cli_version", json!("invalid")),
    ] {
        let mut document = manifest_document();
        document[field] = value;
        assert!(manifest(&document, "2.2.0").is_err(), "{field}");
    }
}
#[tokio::test]
async fn download_verifies_release_manifest_checksum_and_payload_and_never_sends_api_auth_to_assets(
) {
    for scenario in ["success", "checksum", "manifest", "duplicate", "draft"] {
        let mut item = release("2.2.0");
        let mut document = manifest_document();
        if scenario == "draft" {
            item["draft"] = json!(true);
        }
        if scenario == "duplicate" {
            let duplicate = item["assets"][0].clone();
            item["assets"].as_array_mut().unwrap().push(duplicate);
        }
        if scenario == "manifest" {
            document["schema_version"] = json!(2);
        }
        if scenario == "checksum" {
            document["sha256"] = json!("a".repeat(64));
        }
        let server = server(vec![
            Reply::json(item),
            Reply::json(document),
            Reply {
                status: 200,
                body: Some(package()),
                length: true,
                headers: String::new(),
            },
        ])
        .await;
        let client = client(Duration::from_secs(2));
        let result = download_with(
            &client,
            &client,
            &server.endpoint,
            Some("private-token"),
            "2.2.0",
            |url| format!("{}/{}", server.endpoint, url.rsplit('/').next().unwrap()),
        )
        .await;
        if scenario == "success" {
            let downloaded = result.unwrap();
            assert_eq!(downloaded.review.version, "2.2.0");
            assert_eq!(downloaded.review.sha256, sha256_hex(&package()));
            let path = downloaded.path.clone();
            assert_eq!(std::fs::read(&path).unwrap(), package());
            drop(downloaded);
            assert!(!path.exists());
        } else {
            assert_eq!(result.err().unwrap().code, "release_unavailable");
        }
        let requests = server.requests.lock().unwrap();
        let count = match scenario {
            "duplicate" | "draft" => 1,
            "manifest" => 2,
            _ => 3,
        };
        assert_eq!(requests.len(), count);
        assert!(requests[0].contains("Bearer private-token"));
        assert!(requests[0].starts_with("GET /releases/tags/launcher-v2.2.0 "));
        for request in &requests[1..] {
            assert!(!request.contains("private-token"));
            assert!(!request.to_ascii_lowercase().contains("authorization:"));
        }
    }
}
#[tokio::test]
async fn asset_limits_deadlines_and_https_rules_prevent_unbounded_or_insecure_downloads() {
    let production = asset_client().unwrap();
    let initial_server = server(vec![Reply::json(json!({}))]).await;
    assert!(
        asset(&production, &initial_server.endpoint, MAX_PACKAGE_BYTES)
            .await
            .is_err()
    );
    assert!(initial_server.requests.lock().unwrap().is_empty());
    for reply in [
        Reply {
            status: 200,
            body: Some(vec![0; 129]),
            length: true,
            headers: String::new(),
        },
        Reply {
            status: 200,
            body: Some(vec![0; 129]),
            length: false,
            headers: String::new(),
        },
        Reply::stalled(),
        Reply::status(403),
    ] {
        let server = server(vec![reply]).await;
        let client = client(Duration::from_millis(100));
        assert!(asset(&client, &server.endpoint, 128).await.is_err());
        assert_eq!(server.requests.lock().unwrap().len(), 1);
    }
}
#[test]
fn only_downgrades_and_unknown_installed_versions_require_replacement_confirmation() {
    for (target, current, confirmed, code) in [
        ("2.0.0", Some("3.0.0"), false, Some("confirmation_required")),
        (
            "2.0.0",
            Some("Unknown"),
            false,
            Some("confirmation_required"),
        ),
        ("2.0.0", Some("2.0.0"), true, Some("already_installed")),
        ("../bad", None, true, Some("invalid_request")),
        ("2.0.0", Some("3.0.0"), true, None),
        ("3.0.0", Some("2.0.0"), false, None),
        ("2.0.0", None, false, None),
    ] {
        let result = validate_install(target, current, confirmed);
        assert_eq!(
            result.err().map(|error| error.code),
            code.map(str::to_owned)
        );
    }
}
