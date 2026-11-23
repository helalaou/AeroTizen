use super::super::records;
use super::*;
use serde_json::json;

fn live() -> Value {
    json!({"origin": "boot", "boot_id": "00000000-0000-4000-8000-000000000002", "automatic_startup_enabled": true, "bootstrap_completed": true, "helper_installed": true, "runtime_version": "3.0.9", "private_extra": "must-not-be-returned"})
}

#[test]
fn projection_exposes_only_the_existing_public_contract_and_requires_live_proof() {
    let receipt = records::parse(records::tests::document(), records::tests::IDENTITY).unwrap();
    let reply = live();
    let result = public_status(Some(&receipt), Some(&reply), "3.1.1").unwrap();
    assert_eq!(
        serde_json::to_value(result).unwrap(),
        json!({
            "phase": "active", "root_available": true, "setup_complete": true, "runtime_version": "3.0.9",
            "target_runtime_version": "3.1.1", "update_available": true, "update_pending": false,
            "automatic_startup": true, "automatic_boot_verified": true, "bootstrap_completed": true,
            "recovery_saved": true, "original_pc_host": "192.0.2.10",
        })
    );
    for key in [
        "helper_installed",
        "automatic_startup_enabled",
        "bootstrap_completed",
    ] {
        let mut reply = live();
        reply[key] = json!(false);
        let result = public_status(Some(&receipt), Some(&reply), "3.1.1").unwrap();
        assert!(!result.setup_complete && !result.update_available, "{key}");
    }
    for (key, value) in [
        ("origin", json!("manual")),
        ("boot_id", receipt.document["baseline_boot_id"].clone()),
    ] {
        let mut reply = live();
        reply[key] = value;
        assert!(
            !public_status(Some(&receipt), Some(&reply), "3.1.1")
                .unwrap()
                .setup_complete
        );
    }
    let unavailable = public_status(Some(&receipt), None, "3.1.1").unwrap();
    assert!(
        !unavailable.root_available
            && !unavailable.setup_complete
            && unavailable.runtime_version.is_none()
            && unavailable.automatic_startup.is_none()
    );
    let absent = public_status(None, None, "3.1.1").unwrap();
    assert_eq!(absent.phase, RootPhase::NotConfigured);
    assert!(!absent.recovery_saved && absent.original_pc_host.is_none());
}

#[test]
fn update_offers_match_the_cli_version_allowlist_pending_state_and_phase() {
    for (version, sanitized, update) in [
        (json!("0.2.0"), Some("0.2.0"), true),
        (json!("99.0.0"), Some("99.0.0"), false),
        (json!("003.000.009"), Some("003.000.009"), true),
        (json!("3.1.1"), Some("3.1.1"), false),
        (json!("3.0"), Some("3.0"), false),
        (json!("3.0.9.1"), Some("3.0.9.1"), false),
        (json!("unknown"), None, false),
        (json!("3.0.9-extra"), None, false),
        (json!("1000.0.0"), None, false),
        (json!(null), None, false),
        (json!(true), None, false),
        (json!("3.0.9\n"), None, false),
    ] {
        let receipt = records::parse(records::tests::document(), records::tests::IDENTITY).unwrap();
        let mut reply = live();
        reply["runtime_version"] = version;
        let result = public_status(Some(&receipt), Some(&reply), "3.1.1").unwrap();
        assert_eq!(result.runtime_version.as_deref(), sanitized);
        assert_eq!(result.update_available, update);
    }
    for upgrade in [
        json!({"private": "must-not-be-returned"}),
        json!(true),
        json!("pending"),
        json!([1]),
    ] {
        let mut document = records::tests::document();
        document["upgrade"] = upgrade;
        let receipt = records::parse(document, records::tests::IDENTITY).unwrap();
        let result = public_status(Some(&receipt), Some(&live()), "3.1.1").unwrap();
        assert!(result.update_pending && !result.update_available);
    }
    for phase in [
        "prepared",
        "installed",
        "root_requested",
        "waiting_boot",
        "removing",
        "removed",
    ] {
        let mut document = records::tests::document();
        document["phase"] = json!(phase);
        let receipt = records::parse(document, records::tests::IDENTITY).unwrap();
        assert!(
            !public_status(Some(&receipt), Some(&live()), "3.1.1")
                .unwrap()
                .setup_complete
        );
    }
}

#[test]
fn missing_status_fields_cannot_create_boot_or_startup_proof() {
    let mut document = records::tests::document();
    document.as_object_mut().unwrap().remove("baseline_boot_id");
    let receipt = records::parse(document, records::tests::IDENTITY).unwrap();
    assert_eq!(
        public_status(Some(&receipt), Some(&live()), "3.1.1")
            .unwrap_err()
            .code,
        "invalid_response"
    );
    let receipt = records::parse(records::tests::document(), records::tests::IDENTITY).unwrap();
    let mut reply = live();
    reply
        .as_object_mut()
        .unwrap()
        .remove("automatic_startup_enabled");
    assert!(public_status(Some(&receipt), Some(&reply), "3.1.1").is_err());
    reply = live();
    reply.as_object_mut().unwrap().remove("runtime_version");
    assert_eq!(
        public_status(Some(&receipt), Some(&reply), "3.1.1")
            .unwrap()
            .runtime_version
            .as_deref(),
        Some("0.1.0")
    );
}
