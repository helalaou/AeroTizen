//! Opt-in integration check for the frozen worker's public JSON protocol.

use serde_json::{json, Value};
use std::path::Path;
use std::process::Stdio;
use std::time::Duration;
use tokio::io::AsyncWriteExt;
use tokio::process::Command;

const SMOKE_TIMEOUT: Duration = Duration::from_secs(60);
const PROTOCOL_VERSION: u32 = 1;
const REQUEST_ID: &str = "rust-worker-smoke";

#[tokio::test]
async fn bundled_worker_returns_the_native_backend_contract_without_a_tv() {
    let path = Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("binaries")
        .join(env!("WORKER_FILENAME"));
    let output = tokio::time::timeout(SMOKE_TIMEOUT, async {
        let mut child = Command::new(path)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .expect("build the bundled worker before running this integration check");
        let request =
            json!({"protocol": PROTOCOL_VERSION, "id": REQUEST_ID, "operation": "handshake"});
        child
            .stdin
            .take()
            .unwrap()
            .write_all(format!("{request}\n").as_bytes())
            .await
            .unwrap();
        child.wait_with_output().await.unwrap()
    })
    .await
    .expect("worker handshake timed out");
    assert!(output.status.success(), "worker handshake failed");
    let reply: Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(reply["protocol"], PROTOCOL_VERSION);
    assert_eq!(reply["id"], REQUEST_ID);
    assert!(reply.get("error").is_none());
    let status = &reply["result"];
    assert_eq!(status["name"], "aerotizen-desktop-worker");
    assert!(!status["version"].as_str().unwrap().is_empty());
    let operations = status["operations"].as_array().unwrap();
    for active in [
        "prepare_signing_profile",
        "install_launcher",
        "setup_root",
        "upgrade_root",
    ] {
        assert!(operations.iter().any(|name| name == active));
    }
    for retired in [
        "discover",
        "launcher_catalog",
        "read_home_backup",
        "samsung_sign_in",
        "root_status",
        "list_buttons",
        "change_button",
        "list_apps",
        "list_button_apps",
        "remove_apps",
        "inspect_local_app",
        "install_local_app",
        "apply_native_home",
        "restore_home_backup",
        "connect",
        "prepare_native_home",
    ] {
        assert!(!operations.iter().any(|name| name == retired));
    }
}
