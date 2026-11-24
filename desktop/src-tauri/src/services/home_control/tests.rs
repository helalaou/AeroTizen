use super::*;
use crate::services::{digest::sha256_hex, home_backups::HomeBackups};
use std::{collections::VecDeque, path::PathBuf};
fn fixture() -> Value {
    serde_json::from_str(include_str!("../../../../tests/fixtures/home-control.json")).unwrap()
}
fn status() -> Value {
    fixture()["status"].clone()
}
fn writer() -> Vec<PayloadFile> {
    vec![PayloadFile {
        name: crate::services::helper_payloads::CONTROL_ENTRYPOINT.into(),
        bytes: b"synthetic writer".to_vec(),
    }]
}
fn final_status(
    action: Action,
    original: &Value,
    startup_restored: bool,
    installed: bool,
) -> Value {
    let mut status = status();
    let mut settings = original["home"]["settings"].clone();
    let main = if action == Action::Apply {
        json!(LAUNCHER_APP_ID)
    } else {
        original["home"]["default_app"].clone()
    };
    if action == Action::Apply {
        settings[HOME_KEY]["value"] = json!(LAUNCHER_APP_ID);
        if !startup_restored {
            for key in [STARTUP_KEY, STARTUP_BACKUP_KEY] {
                settings[key]["value"] = json!(LAUNCHER_APP_ID);
            }
            settings[AUTOSTART_KEY]["value"] = json!(1);
        }
    }
    for (_, setting) in settings.as_object_mut().unwrap() {
        setting["status"] = json!("ok");
    }
    status["home"]["settings"] = settings;
    status["home"]["main_operation"] = json!({"type":"string","status":"ok","value":main});
    status["watcher"]["reachable"] = json!(installed);
    status["launcher"]["installed"] = json!(installed);
    status["watcher"]["control"]["mode"] = json!(if action == Action::Apply {
        "native"
    } else {
        "watcher"
    });
    status
}
struct Fake {
    statuses: VecDeque<Value>,
    directory: PathBuf,
    original: PathBuf,
    action: Action,
    writes: usize,
    starts: usize,
    fail: bool,
    rollback: bool,
    startup_restored: bool,
    last_request: Option<Value>,
}
impl Fake {
    fn new(directory: PathBuf, action: Action, statuses: Vec<Value>) -> Self {
        Self {
            statuses: statuses.into(),
            original: directory.join("original-home.json"),
            directory,
            action,
            writes: 0,
            starts: 0,
            fail: false,
            rollback: false,
            startup_restored: false,
            last_request: None,
        }
    }
}
impl Device for Fake {
    async fn status(&mut self) -> AppResult<Value> {
        Ok(if self.statuses.len() > 1 {
            self.statuses.pop_front().unwrap()
        } else {
            self.statuses.front().unwrap().clone()
        })
    }
    async fn start_launcher(&mut self) -> AppResult<()> {
        self.starts += 1;
        Ok(())
    }
    async fn write(&mut self, files: Vec<PayloadFile>) -> AppResult<Completion> {
        self.writes += 1;
        let request: Value = serde_json::from_slice(
            &files
                .iter()
                .find(|file| file.name == "request.json")
                .unwrap()
                .bytes,
        )
        .unwrap();
        let receipt = durable_json::read(
            &self
                .directory
                .join("transactions")
                .join(format!("{}.json", request["transaction"].as_str().unwrap())),
            MAX_RECEIPT_BYTES,
        )
        .unwrap();
        assert_eq!(receipt["state"], "pending");
        assert_eq!(receipt["request"], request);
        assert_eq!(
            receipt["request"]["baseline_sha256"],
            sha256_hex(&std::fs::read(&self.original).unwrap())
        );
        self.last_request = Some(request.clone());
        if self.fail {
            return Err(error("simulated lost writer reply"));
        }
        for final_status in &mut self.statuses {
            final_status["watcher"]["control"]["transaction"] = request["transaction"].clone();
            final_status["watcher"]["control"]["baseline_sha256"] =
                request["baseline_sha256"].clone();
        }
        let result = json!({"schema_version":1,"uid":901,"action":self.action.name(),"result":{"Success":!self.rollback,"RolledBack":self.rollback,"StartupSettingsRestored":self.startup_restored,"Error":if self.rollback {json!("simulated rollback")} else {Value::Null}}});
        Ok(Completion {
            stdout: format!("{CONTROL_PREFIX}{result}\n"),
            exit_code: u32::from(self.rollback),
            staging_cleaned: true,
        })
    }
}
async fn original(directory: &std::path::Path) -> Original {
    let owner = HomeBackups::new(directory.into());
    let document = fixture()["original"].clone();
    let identity = document["device"]["identity_sha256"].as_str().unwrap();
    let prepared = owner
        .save_original(identity, document.clone())
        .await
        .unwrap();
    owner
        .original(identity, Some(&prepared.backup_sha256), None)
        .await
        .unwrap()
}
#[tokio::test]
async fn apply_and_receipt_bound_restore_journal_before_writing_and_preserve_exact_original_bytes()
{
    for startup_restored in [false, true] {
        let directory = tempfile::tempdir().unwrap();
        let original = original(directory.path()).await;
        let path = original.path.clone();
        let raw = original.raw.clone();
        let document = original.document.clone();
        let mut apply = Fake::new(
            path.parent().unwrap().into(),
            Action::Apply,
            vec![
                status(),
                final_status(Action::Apply, &document, startup_restored, true),
            ],
        );
        apply.startup_restored = startup_restored;
        let applied = change(&mut apply, original, Action::Apply, writer())
            .await
            .unwrap();
        assert_eq!(apply.writes, 1);
        assert_eq!(apply.starts, 0);
        assert_eq!(std::fs::read(&path).unwrap(), raw);
        let original = HomeBackups::new(directory.path().into())
            .original(
                document["device"]["identity_sha256"].as_str().unwrap(),
                None,
                None,
            )
            .await
            .unwrap();
        let mut restore = Fake::new(
            path.parent().unwrap().into(),
            Action::Restore,
            vec![
                applied,
                final_status(Action::Restore, &document, false, true),
            ],
        );
        change(&mut restore, original, Action::Restore, writer())
            .await
            .unwrap();
        assert_eq!(restore.writes, 1);
        assert_eq!(std::fs::read(&path).unwrap(), raw);
        if !startup_restored {
            assert_eq!(
                restore.last_request.as_ref().unwrap()["restore_boot_transaction"],
                apply.last_request.as_ref().unwrap()["transaction"]
            );
        }
        let states: Vec<_> = std::fs::read_dir(path.parent().unwrap().join("transactions"))
            .unwrap()
            .map(|entry| {
                durable_json::read(&entry.unwrap().path(), MAX_RECEIPT_BYTES).unwrap()["state"]
                    .as_str()
                    .unwrap()
                    .to_owned()
            })
            .collect();
        assert!(
            states.contains(&"applied_verified".into())
                && states.contains(&"restored_verified".into())
        );
    }
}
#[test]
fn preflight_rejects_mismatched_devices_untrusted_queries_incomplete_values_and_uncertain_installation(
) {
    let original = fixture()["original"].clone();
    assert!(preflight(&status(), &original).unwrap());
    for (pointer, value) in [
        ("/device/identity_sha256", json!("b".repeat(64))),
        ("/device/firmware_build", json!("different")),
        ("/device/cpu_arch", json!("x86_64")),
        ("/complete", json!(false)),
        ("/evidence/authenticated", json!(false)),
        ("/evidence/uid", json!(0)),
        ("/launcher/installed", Value::Null),
    ] {
        let mut status = status();
        *status.pointer_mut(pointer).unwrap() = value;
        assert!(preflight(&status, &original).is_err(), "{pointer}");
    }
    let mut unavailable = status();
    unavailable["home"]["settings"][HOME_KEY]["status"] = json!("unavailable");
    assert!(preflight(&unavailable, &original).is_err());
    let mut paired = original.clone();
    paired["evidence"]["access"] = json!("paired_helper");
    paired["device"].as_object_mut().unwrap().remove("cpu_arch");
    paired["device"]
        .as_object_mut()
        .unwrap()
        .remove("os_version");
    assert!(preflight(&status(), &paired).unwrap());
    paired["device"]["os_version"] = json!("wrong");
    assert!(preflight(&status(), &paired).is_err());
}
#[tokio::test]
async fn uncertain_writer_results_keep_recovery_receipts_and_never_retry_or_replace_the_original() {
    for scenario in ["transport", "rollback", "readback"] {
        let directory = tempfile::tempdir().unwrap();
        let original = original(directory.path()).await;
        let path = original.path.clone();
        let raw = original.raw.clone();
        let mut final_status = final_status(Action::Apply, &original.document, false, true);
        if scenario == "readback" {
            final_status["watcher"]["control"]["mode"] = json!("watcher");
        }
        let mut device = Fake::new(
            path.parent().unwrap().into(),
            Action::Apply,
            vec![status(), final_status],
        );
        device.fail = scenario == "transport";
        device.rollback = scenario == "rollback";
        assert!(change(&mut device, original, Action::Apply, writer())
            .await
            .is_err());
        assert_eq!(device.writes, 1);
        assert_eq!(std::fs::read(&path).unwrap(), raw);
        let receipt = durable_json::read(
            &std::fs::read_dir(path.parent().unwrap().join("transactions"))
                .unwrap()
                .next()
                .unwrap()
                .unwrap()
                .path(),
            MAX_RECEIPT_BYTES,
        )
        .unwrap();
        assert_eq!(
            receipt["state"],
            match scenario {
                "transport" => "pending",
                "rollback" => "rolled_back",
                _ => "applied",
            }
        );
        assert!(receipt["error"].is_string());
    }
}
#[tokio::test(start_paused = true)]
async fn apply_starts_the_launcher_once_and_waits_for_a_compatible_service_but_restore_never_starts_it(
) {
    for scenario in ["ready", "timeout", "restore", "incompatible"] {
        let directory = tempfile::tempdir().unwrap();
        let original = original(directory.path()).await;
        let path = original.path.clone();
        let mut unavailable = status();
        unavailable["watcher"]["reachable"] = json!(false);
        let action = if scenario == "restore" {
            Action::Restore
        } else {
            Action::Apply
        };
        let mut states = vec![unavailable];
        if scenario == "ready" {
            states.extend([
                status(),
                final_status(Action::Apply, &original.document, false, true),
            ]);
        }
        if scenario == "incompatible" {
            let mut incompatible = status();
            incompatible["watcher"]["control"]["persistent"] = json!(false);
            states.push(incompatible);
        }
        let mut device = Fake::new(path.parent().unwrap().into(), action, states);
        let result = change(&mut device, original, action, writer()).await;
        assert_eq!(result.is_ok(), scenario == "ready");
        assert_eq!(device.starts, usize::from(scenario != "restore"));
        assert_eq!(device.writes, usize::from(scenario == "ready"));
        if scenario != "ready" {
            assert!(!path.parent().unwrap().join("transactions").exists());
        }
    }
}
#[test]
fn malformed_duplicate_or_contradictory_native_results_cannot_claim_success() {
    for document in [
        json!({}),
        json!({"schema_version":1,"uid":0,"action":"apply","result":{"Success":true,"RolledBack":false}}),
        json!({"schema_version":1,"uid":901,"action":"apply","result":{"Success":true,"RolledBack":true}}),
    ] {
        let native = Completion {
            stdout: format!("{CONTROL_PREFIX}{document}\n"),
            exit_code: 0,
            staging_cleaned: true,
        };
        assert!(parse_result(&native, Action::Apply).is_err());
    }
}
#[test]
fn query_validation_matches_cli_and_rejects_wrong_uid_runtime_settings_and_cleanup() {
    let fixture = fixture();
    assert_eq!(
        crate::services::home_protocol::query(fixture["query_output"].as_str().unwrap()).unwrap(),
        fixture["query"]
    );
    for (pointer, value) in [
        ("/uid", json!(0)),
        ("/read_only", json!(false)),
        ("/architecture_bits", json!(64)),
        ("/os_release/ID", json!("linux")),
        ("/watcher/reachable", Value::Null),
    ] {
        let mut query = fixture["query"].clone();
        *query.pointer_mut(pointer).unwrap() = value;
        assert!(crate::services::home_protocol::query(&format!(
            "AEROTIZEN_HOME_QUERY={query}\n{}\n",
            crate::services::sdk::CLEANUP_MARKER
        ))
        .is_err());
    }
}

#[tokio::test]
async fn reviewed_digest_and_capture_time_are_rechecked_and_cancellation_keeps_a_pending_receipt() {
    let directory = tempfile::tempdir().unwrap();
    let original = original(directory.path()).await;
    let path = original.path.clone();
    let raw = original.raw.clone();
    let identity = original.document["device"]["identity_sha256"]
        .as_str()
        .unwrap()
        .to_owned();
    let owner = HomeBackups::new(directory.path().into());
    assert_eq!(
        owner
            .original(&identity, Some(&"b".repeat(64)), None)
            .await
            .err()
            .unwrap()
            .code,
        "backup_changed"
    );
    assert_eq!(
        owner
            .original(&identity, None, Some("changed"))
            .await
            .err()
            .unwrap()
            .code,
        "backup_changed"
    );
    struct Stalled {
        state: Value,
    }
    impl Device for Stalled {
        async fn status(&mut self) -> AppResult<Value> {
            Ok(self.state.clone())
        }
        async fn start_launcher(&mut self) -> AppResult<()> {
            panic!("must not start")
        }
        async fn write(&mut self, _: Vec<PayloadFile>) -> AppResult<Completion> {
            std::future::pending().await
        }
    }
    let mut device = Stalled { state: status() };
    assert!(tokio::time::timeout(
        Duration::from_millis(100),
        change(&mut device, original, Action::Apply, writer())
    )
    .await
    .is_err());
    let receipt = durable_json::read(
        &std::fs::read_dir(path.parent().unwrap().join("transactions"))
            .unwrap()
            .next()
            .unwrap()
            .unwrap()
            .path(),
        MAX_RECEIPT_BYTES,
    )
    .unwrap();
    assert_eq!(receipt["state"], "pending");
    assert_eq!(std::fs::read(path).unwrap(), raw);
}
