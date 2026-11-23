use super::*;
use crate::worker::decode_result;
use serde_json::json;

#[test]
fn home_reply_keeps_unavailable_unset_and_disabled_distinct() {
    let reply = json!({
        "home_button_app": null, "home_app": "", "startup_app": "stock.home",
        "startup_backup_app": null, "smart_hub_autostart": false, "first_screen": "stock.home",
    });
    let settings: HomeBackupSettings = decode_result(reply.clone()).unwrap();
    assert_eq!(serde_json::to_value(settings).unwrap(), reply);
}

#[test]
fn invalid_backend_shapes_fail_before_reaching_the_frontend() {
    let malformed = json!({
        "phase": "active", "root_available": "false", "setup_complete": false,
        "runtime_version": null, "target_runtime_version": "1.0.0",
        "update_available": false, "update_pending": false, "automatic_startup": null,
        "automatic_boot_verified": false, "bootstrap_completed": false,
        "recovery_saved": false, "original_pc_host": null,
    });
    assert_eq!(
        decode_result::<RootAccessStatus>(malformed)
            .unwrap_err()
            .code,
        "invalid_response"
    );
    assert!(
        decode_result::<Vec<TvAppPackage>>(json!([{"id":"test", "protected": false}])).is_err()
    );
    assert!(decode_result::<ButtonMappings>(json!({"status":"unknown"})).is_err());
}

#[test]
fn removal_reply_keeps_refusals_and_an_unavailable_inventory() {
    let reply = json!({ "apps": null, "results": [
        {"id": "test", "status": "refused"},
        {"id": "other", "status": "unverified", "detail": "Refresh Apps to check."},
    ]});
    let removal: AppRemovalResult = decode_result(reply.clone()).unwrap();
    assert_eq!(serde_json::to_value(removal).unwrap(), reply);
}

#[test]
fn button_requests_reject_mixed_actions_and_keep_wire_names() {
    for request in [
        json!({"button": "Streaming", "mode": "app", "app_id": "test.app"}),
        json!({"action": "rename", "button": "Netflix", "new_name": "Streaming"}),
        json!({"action": "reset"}),
    ] {
        let change: ButtonChange = serde_json::from_value(request.clone()).unwrap();
        assert_eq!(serde_json::to_value(change).unwrap(), request);
    }
    for request in [
        json!({"action": "reset", "button": "Netflix"}),
        json!({"mode": "disabled", "button": "Netflix", "action": "reset"}),
        json!({"mode": "app", "button": "Netflix"}),
    ] {
        assert!(serde_json::from_value::<ButtonChange>(request).is_err());
    }
    assert!(serde_json::from_value::<RootSetupAction>(json!("resume")).is_err());
    assert!(serde_json::from_value::<RootUpdateAction>(json!("verify")).is_err());
}
