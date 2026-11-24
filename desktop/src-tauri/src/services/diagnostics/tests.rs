use super::*;
use std::io::Read;

fn options() -> ExportOptions {
    ExportOptions {
        simulator: false,
        tv_id: None,
        include_tv: false,
        include_home: false,
    }
}

#[tokio::test]
async fn saves_a_pc_only_zip_with_filtered_recent_receipts_and_does_not_overwrite() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::for_test(root.path());
    let transactions = root
        .path()
        .join("cli-state/backups/private-identity/transactions");
    std::fs::create_dir_all(&transactions).unwrap();
    let receipt = json!({
        "state":"applied_verified","backup_path":"/secret/home.json","transport":{"stdout":"PRIVATE_CONSOLE"},
        "request":{"action":"apply","baseline_sha256":"PRIVATE_HASH","firmware":"T-FW1"},
        "native_result":{"Success":false,"RolledBack":true,"Error":"Final Home readback failed: PRIVATE_REASON",
            "Failure":{"Phase":"final","Differences":{"db/appfw/home_appid":{
                "Expected":"DclHome001.Home","Observed":"Private.ThirdParty"
            },"unknown":{"Expected":"secret"}}}}
    });
    std::fs::write(
        transactions.join("private-receipt-name.json"),
        receipt.to_string(),
    )
    .unwrap();
    let path = root.path().join("diagnostics.zip");
    let bundle = collect(&state, options()).await;
    let events = parse_activity(
        r#"[
        {"id":2,"timestamp":"2026-11-24T20:00:00Z","action":"connect","outcome":"failed",
         "durationMs":100,"code":"PRIVATE_ERROR","message":"PRIVATE_MESSAGE"},
        {"id":1,"timestamp":"2026-11-24T20:00:00Z","action":"PRIVATE_ACTION","outcome":"started"}
    ]"#,
    )
    .unwrap();
    let result = save(&path, &events, bundle).unwrap();
    assert!(result.saved);
    assert!(result.unavailable.is_empty());

    let mut zip = zip::ZipArchive::new(File::open(&path).unwrap()).unwrap();
    let names: Vec<_> = zip.file_names().map(Result::unwrap).collect();
    assert_eq!(names.len(), 3);
    assert!(names.iter().any(|name| name == "desktop/activity.log"));
    assert!(names.iter().any(|name| name == "home/receipt-1.json"));
    let report: Value = serde_json::from_reader(zip.by_name("report.json").unwrap()).unwrap();
    assert_eq!(report["tv"]["state"], "not_requested");
    assert_eq!(report["native_home"]["state"], "not_requested");
    assert_eq!(report["bundle_health"]["receipt_summaries"], 1);
    assert_eq!(
        report["desktop_build"]["build_id"].as_str().unwrap().len(),
        64
    );
    let mut activity = String::new();
    zip.by_name("desktop/activity.log")
        .unwrap()
        .read_to_string(&mut activity)
        .unwrap();
    assert!(!activity.contains("PRIVATE_"));
    assert_eq!(activity.lines().count(), 1);
    let activity: Value = serde_json::from_str(&activity).unwrap();
    assert_eq!(activity["action"], "connect");
    assert_eq!(activity["code"], "request_failed");
    assert_eq!(activity["duration_ms"], 100);
    let mut receipt = String::new();
    zip.by_name("home/receipt-1.json")
        .unwrap()
        .read_to_string(&mut receipt)
        .unwrap();
    for private in [
        "PRIVATE_",
        "Private.ThirdParty",
        "/secret/",
        "baseline_sha256",
        "unknown",
    ] {
        assert!(!receipt.contains(private), "{private}");
    }
    let receipt: Value = serde_json::from_str(&receipt).unwrap();
    assert_eq!(receipt["state"], "applied_verified");
    assert_eq!(
        receipt["native_result"]["Error"],
        "final_home_readback_failed"
    );
    assert_eq!(receipt["native_result"]["RolledBack"], true);
    assert_eq!(
        save(&path, &[], collect(&state, options()).await)
            .unwrap_err()
            .code,
        "log_file_exists"
    );
}

#[test]
fn filters_tv_events_and_preserves_correlation_build_and_health() {
    let raw = json!({
        "schema_version":1,
        "records":[
            {"event":"ui.error","source":"ui","id":"private-id","session":"private-session",
                "at":12345,"sequence":1,"elapsed_ms":10,"data":{
                    "operation_id":"private-op","app_id":"private-app","error":"TypeError",
                    "message":"Cannot read private-token","unknown":"unknown-private",
                    "stack":"at privateFunction (/Users/private-name/apps.js:42:2)\n/secret.js:1",
                    "file":"file:///private/path/apps.js?private-query#private-fragment"}},
            {"event":"app.launch_result","source":"service","session":"private-session",
                "data":{"operation_id":"private-op","app_id":"private-app","status":"accepted"}},
            {"event":"private-event","source":"ui","data":{"status":"accepted","token":"private-token"}}
        ],
        "health":{"session":"private-session","storage":"ready","buffered":3,"unknown":"secret"},
        "environment":{"tizen":"9.0","firmware":"T-PTMDDEUC-0090","arch":"armv7l","private":"secret"},
        "context":{"mode":"watcher","native_settings":{"private":"secret"},"watcher_heartbeats":22},
        "ui":{"build":{"version":"3.4.0","commit":"a".repeat(40)},"delivery":{"state":"acknowledged","retries":2}}
    });
    let clean = Privacy::default().tv_logs(&raw).unwrap();
    assert!(!clean.to_string().contains("private"));
    let first = &clean["records"][0];
    let second = &clean["records"][1];
    assert_eq!(first["session"], second["session"]);
    assert_eq!(first["session"], clean["health"]["session"]);
    assert_eq!(
        first["data"]["operation_id"],
        second["data"]["operation_id"]
    );
    assert_eq!(first["data"]["app_id"], second["data"]["app_id"]);
    assert_eq!(first["data"]["message"], "property_access_failed");
    assert_eq!(first["data"]["stack"], "apps.js:42:2");
    assert_eq!(clean["ui"]["build"]["version"], "3.4.0");
    assert_eq!(clean["ui"]["delivery"]["retries"], 2);
    assert_eq!(clean["environment"]["firmware"], "T-PTMDDEUC-0090");
    assert_eq!(clean["context"]["native_settings"], "not_queried");
    assert_eq!(clean["records"][2]["event"], "diagnostic.unknown");
    assert_eq!(clean["records"][2]["data"], json!({}));
    assert!(Privacy::default()
        .tv_logs(&json!({"schema_version": 2, "records": []}))
        .is_none());
    assert!(Privacy::default()
        .tv_logs(&json!({"schema_version": 1, "records": [{"source":"invalid"}]}))
        .is_none());
}

#[test]
fn home_snapshot_aliases_assignments_and_keeps_partial_settings() {
    let raw = json!({"boot_id":"private-id","home_settings":{
        "home_button_app":"private-app","home_app":"private-app",
        "startup_app":"DclHome001.Home","smart_hub_autostart":false,
        "helper_sha256":"private-hash","firmware_build":"T-FW1"
    }});
    let snapshot = home_snapshot(&mut Privacy::default(), &raw);
    assert!(!snapshot.to_string().contains("private"));
    assert_eq!(snapshot["state"], "partial");
    assert_eq!(
        snapshot["home"]["settings"]["db/appfw/home_appid"]["value"],
        snapshot["home"]["main_operation"]["value"]
    );
    assert_eq!(
        snapshot["home"]["settings"]["db/appfw/startup_appid"]["value"],
        "DclHome001.Home"
    );
    assert_eq!(
        snapshot["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"],
        0
    );
    assert_eq!(
        snapshot["home"]["settings"]["db/appfw/booting_appid_backup"]["status"],
        "unavailable"
    );
}

#[tokio::test]
async fn requested_but_missing_tv_does_not_block_zip_and_simulator_ignores_it() {
    let root = tempfile::tempdir().unwrap();
    let state = AppState::for_test(root.path());
    let selected = ExportOptions {
        tv_id: Some("unknown".into()),
        include_tv: true,
        include_home: true,
        ..options()
    };
    let bundle = collect(&state, selected).await;
    assert_eq!(bundle.report["tv"]["reason"], "tv_profile_unavailable");
    assert_eq!(
        bundle.report["native_home"]["reason"],
        "tv_profile_unavailable"
    );
    assert_eq!(bundle.result.unavailable, ["TV logs", "Home settings"]);
    let simulator = ExportOptions {
        simulator: true,
        include_tv: true,
        include_home: true,
        ..options()
    };
    let bundle = collect(&state, simulator).await;
    assert_eq!(bundle.report["tv"]["state"], "not_requested");
    assert_eq!(bundle.report["native_home"]["state"], "not_requested");
    assert!(bundle.receipts.is_empty());
}

#[tokio::test]
async fn collects_tv_logs_over_the_existing_developer_connection() {
    use crate::services::{
        device_connection::{tests::Peer, TvConnection},
        digest::sha256_hex,
        sdb::tests::serve_script_with_request,
    };

    let body = json!({
        "schema_version": 1,
        "records": [{"source":"service","event":"service.ready","session":"private-session"}],
        "environment": {"tizen":"9.0","firmware":"T-PLATFORM-9000","arch":"armv7l"},
    })
    .to_string();
    let mut peer = Peer::start(1, move |mut socket, _| {
        let response = format!("HTTP/1.1 200 OK\r\nContent-Length: {}\r\n\r\n{body}", body.len());
        async move {
            serve_script_with_request(
                &mut socket,
                vec![
                    ("shell:0 getduid".into(), "diagnostics-tv".into()),
                    ("tcp:47790".into(), response),
                ],
                b"GET /diagnostics/logs HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\nX-AeroTizen-Diagnostics: 1\r\n\r\n",
            ).await
        }
    }).await;
    let root = tempfile::tempdir().unwrap();
    let mut state = AppState::for_test(root.path());
    state.device_connection = TvConnection::with_ports(root.path().join("cli-state"), peer.port, 1);
    let mut tv: VerifiedTv =
        serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap();
    tv.host = "127.0.0.1".into();
    tv.identity_sha256 = sha256_hex(b"diagnostics-tv");
    tv.name = "Private TV name".into();
    tv.model = "QE65LS03DAUXXU".into();
    let saved = state.profiles.save(tv).await.unwrap();
    let selected = ExportOptions {
        tv_id: Some(saved.id),
        include_tv: true,
        ..options()
    };
    let bundle = collect(&state, selected).await;

    assert_eq!(bundle.report["tv"]["state"], "collected");
    assert_eq!(
        bundle.report["tv"]["logs"]["records"][0]["event"],
        "service.ready"
    );
    assert_eq!(bundle.report["environment"]["firmware"], "T-PLATFORM-9000");
    assert_eq!(bundle.report["environment"]["model"], "QE65LS03DAUXXU");
    let report = bundle.report.to_string();
    assert!(
        !report.contains("127.0.0.1")
            && !report.contains("Private TV name")
            && !report.contains("private-session")
    );
    assert_eq!(peer.finish().await, [vec!["shell:0 getduid", "tcp:47790"]]);
}
