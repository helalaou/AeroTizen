use super::*;
use crate::services::{
    root_bridge::tests::{reply, Server},
    root_pairing::tests::{document, save, IDENTITY},
};
use serde_json::json;

fn fixtures() -> Vec<Value> {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/button-edit-requests.json"
    ))
    .unwrap()
}

fn capabilities() -> Value {
    json!({"buttons_protocol":1,"buttons_friendly_names":true,"buttons_rename":true})
}

fn disabled() -> ButtonChange {
    serde_json::from_value(json!({"button":"Netflix","mode":"disabled"})).unwrap()
}

fn response(action: &str) -> Value {
    let rule = match action {
        "map" => json!({"button":"Streaming","mode":"app","app_id":"test.Player","active":false}),
        "disable" => json!({"button":"Streaming","mode":"disabled","active":false}),
        "learn" => json!({"button":"Streaming","mode":"default","active":false}),
        "rename" => json!({"button":"My remote","mode":"app","app_id":"test.Player","active":true}),
        "unmap" | "reset" => return json!({"rules":[]}),
        _ => panic!("unexpected test action"),
    };
    json!({"rules":[rule]})
}

#[test]
fn edits_preserve_the_cli_payloads_and_verify_the_saved_action_without_claiming_activation() {
    for fixture in fixtures() {
        let change: ButtonChange = serde_json::from_value(fixture["change"].clone()).unwrap();
        validate(&change).unwrap();
        let mut actual = json!(prepare(&change, &capabilities()).unwrap());
        actual["apply"] = json!(true);
        assert_eq!(actual, fixture["buttons"]);
        let status = response(fixture["buttons"]["action"].as_str().unwrap());
        let saved = serde_json::to_value(verified_change(&change, &status).unwrap()).unwrap();
        if fixture["change"].get("mode").is_some() {
            assert_eq!(saved["mode"], fixture["change"]["mode"]);
            assert_eq!(saved["button"], "Streaming");
            assert_eq!(saved["active"], false);
        } else {
            assert_eq!(saved, true);
        }
    }
}

#[test]
fn helper_compatibility_gates_features_and_accepts_case_insensitive_names() {
    let change = disabled();
    for protocol in [Value::Null, json!(true), json!(2)] {
        let mut caps = capabilities();
        caps["buttons_protocol"] = protocol;
        assert_eq!(
            prepare(&change, &caps).err().unwrap().code,
            "helper_update_required"
        );
    }
    let legacy = json!({"buttons_protocol":1});
    assert_eq!(
        json!(prepare(&change, &legacy).unwrap())["button"],
        "netflix"
    );
    let friendly: ButtonChange =
        serde_json::from_value(json!({"button":"My remote","mode":"disabled"})).unwrap();
    assert_eq!(
        prepare(&friendly, &legacy).err().unwrap().code,
        "helper_update_required"
    );
    let rename: ButtonChange = serde_json::from_value(fixtures()[4]["change"].clone()).unwrap();
    assert_eq!(
        prepare(
            &rename,
            &json!({"buttons_protocol":1,"buttons_friendly_names":true})
        )
        .err()
        .unwrap()
        .code,
        "helper_update_required"
    );
    for label in ["Netflix", "netflix"] {
        let change: ButtonChange =
            serde_json::from_value(json!({"button":label,"mode":"default"})).unwrap();
        assert_eq!(
            json!(verified_change(&change, &json!({"rules":[]})).unwrap())["button"],
            label
        );
    }
    let learned: ButtonChange =
        serde_json::from_value(json!({"action":"learn","button":"streaming"})).unwrap();
    assert!(matches!(
        verified_change(
            &learned,
            &json!({"rules":[{"button":"Streaming","mode":"default","active":false}]})
        ),
        Ok(ButtonChangeResult::Inventory(true))
    ));
}

#[tokio::test]
async fn invalid_edits_and_missing_or_wrong_pairing_cannot_contact_the_tv() {
    let directory = tempfile::tempdir().unwrap();
    let writer = ButtonEdits::new(directory.path().into());
    for label in [
        "",
        " ",
        "line\nbreak",
        "line\u{2028}break",
        &"a".repeat(49),
        &"😀".repeat(25),
    ] {
        let change: ButtonChange =
            serde_json::from_value(json!({"action":"rename","button":"Netflix","new_name":label}))
                .unwrap();
        assert_eq!(
            writer
                .change("127.0.0.1", IDENTITY, &change)
                .await
                .unwrap_err()
                .code,
            "invalid_request"
        );
    }
    for app in ["", ".bad", "bad/id", &"a".repeat(121)] {
        let change: ButtonChange =
            serde_json::from_value(json!({"button":"Netflix","mode":"app","app_id":app})).unwrap();
        assert_eq!(
            writer
                .change("127.0.0.1", IDENTITY, &change)
                .await
                .unwrap_err()
                .code,
            "invalid_request"
        );
    }
    assert_eq!(
        writer
            .change("127.0.0.1", IDENTITY, &disabled())
            .await
            .unwrap_err()
            .code,
        "pairing_required"
    );
    let mut receipt = document();
    receipt["phase"] = json!("waiting_boot");
    save(directory.path(), "127.0.0.1", &receipt);
    assert_eq!(
        writer
            .change("127.0.0.1", IDENTITY, &disabled())
            .await
            .unwrap_err()
            .code,
        "pairing_required"
    );
    assert_eq!(
        writer
            .change("127.0.0.1", &"e".repeat(64), &disabled())
            .await
            .unwrap_err()
            .code,
        "identity_mismatch"
    );
}

#[test]
fn failures_stale_actions_and_partial_inventory_replies_do_not_report_success() {
    assert_eq!(
        verified_change(
            &disabled(),
            &json!({"error":"Target app is not installed.","rules":[]})
        )
        .unwrap_err()
        .code,
        "button_change_failed"
    );
    for status in [
        json!({"rules":[]}),
        json!({"rules":[{"button":"Netflix","mode":"default","active":false}]}),
        json!({"rules":[{"button":"Netflix","mode":"disabled","active":false}],"preview":"Preview only"}),
    ] {
        assert_eq!(
            verified_change(&disabled(), &status).unwrap_err().code,
            "button_change_unverified"
        );
    }
    let map: ButtonChange = serde_json::from_value(fixtures()[0]["change"].clone()).unwrap();
    assert_eq!(verified_change(&map,&json!({"rules":[{"button":"Streaming","mode":"app","app_id":"other.App","active":true}]})).unwrap_err().code,"button_change_unverified");
    for (change, status) in [
        (
            json!({"action":"reset"}),
            json!({"rules":[{"button":"Netflix","mode":"disabled","active":true}]}),
        ),
        (json!({"action":"reset"}), json!({})),
        (
            json!({"action":"learn","button":"Netflix"}),
            json!({"rules":[{"button":"Netflix","mode":"disabled","active":true}]}),
        ),
        (
            json!({"action":"rename","button":"Netflix","new_name":"New"}),
            json!({"rules":[{"button":"New","mode":"default","active":false},{"button":"Netflix","mode":"default","active":false}]}),
        ),
    ] {
        assert_eq!(
            verified_change(&serde_json::from_value(change).unwrap(), &status)
                .unwrap_err()
                .code,
            "button_change_unverified"
        );
    }
}

#[tokio::test]
async fn every_action_uses_pinned_authenticated_tls_once_and_keeps_recovery_unchanged() {
    for fixture in fixtures() {
        let action = fixture["buttons"]["action"].as_str().unwrap().to_owned();
        let mut server = Server::new(2, move |request| {
            let mut value = reply(request);
            if request["operation"] == "status" {
                value
                    .as_object_mut()
                    .unwrap()
                    .extend(capabilities().as_object().unwrap().clone());
            } else {
                value["buttons"] = response(&action);
            }
            format!("{value}\n").into_bytes()
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let mut receipt = document();
        receipt["bridge_port"] = json!(server.port);
        receipt["certificate_sha256"] = json!(server.pin);
        let path = save(directory.path(), "127.0.0.1", &receipt);
        let original = std::fs::read(&path).unwrap();
        let change = serde_json::from_value(fixture["change"].clone()).unwrap();
        ButtonEdits::new(directory.path().into())
            .change("127.0.0.1", IDENTITY, &change)
            .await
            .unwrap();
        let status_request = server.next().await.unwrap();
        assert_eq!(status_request["operation"], "status");
        let edit = server.next().await.unwrap();
        assert_eq!(edit["buttons"], fixture["buttons"]);
        assert_ne!(edit["nonce"], status_request["nonce"]);
        assert_eq!(std::fs::read(path).unwrap(), original);
        server.finish().await;
    }
}

#[tokio::test]
async fn unsupported_helpers_and_invalid_capability_proof_send_no_write() {
    for scenario in ["old", "rename", "proof", "certificate"] {
        let mut server = Server::new(1, move |request| {
            let mut value = reply(request);
            if scenario == "rename" {
                value["buttons_protocol"] = json!(1);
            }
            if scenario == "proof" {
                value["nonce"] = json!("replayed");
            }
            format!("{value}\n").into_bytes()
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let mut receipt = document();
        receipt["bridge_port"] = json!(server.port);
        receipt["certificate_sha256"] = json!(if scenario == "certificate" {
            "0".repeat(64)
        } else {
            server.pin.clone()
        });
        save(directory.path(), "127.0.0.1", &receipt);
        let change = serde_json::from_value(fixtures()[4]["change"].clone()).unwrap();
        let error = ButtonEdits::new(directory.path().into())
            .change("127.0.0.1", IDENTITY, &change)
            .await
            .unwrap_err();
        assert_eq!(
            error.code,
            if ["old", "rename"].contains(&scenario) {
                "helper_update_required"
            } else {
                "button_change_unverified"
            }
        );
        assert_eq!(server.next().await.is_none(), scenario == "certificate");
        server.finish().await;
    }
}

#[tokio::test]
async fn changed_recovery_blocks_a_write_and_replayed_or_rebooted_replies_are_unverified() {
    for scenario in [
        "receipt_before",
        "receipt_after",
        "proof",
        "boot",
        "refused",
    ] {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().to_owned();
        let mut server = Server::new(
            if scenario == "receipt_before" { 1 } else { 2 },
            move |request| {
                let mut value = reply(request);
                value
                    .as_object_mut()
                    .unwrap()
                    .extend(capabilities().as_object().unwrap().clone());
                let editing = request["operation"] == "buttons";
                if (scenario == "receipt_before" && !editing)
                    || (scenario == "receipt_after" && editing)
                {
                    let path = target
                        .join("root")
                        .join(crate::services::digest::sha256_hex(b"127.0.0.1"))
                        .join("receipt.json");
                    let mut receipt: Value =
                        serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
                    receipt["phase"] = json!("removed");
                    std::fs::write(path, receipt.to_string()).unwrap();
                }
                if editing {
                    value["buttons"] =
                        json!({"rules":[{"button":"Netflix","mode":"disabled","active":false}]});
                    if scenario == "proof" {
                        value["nonce"] = json!("replayed");
                    }
                    if scenario == "boot" {
                        value["boot_id"] = json!("00000000-0000-4000-8000-000000000003");
                    }
                    if scenario == "refused" {
                        value["buttons"]["error"] = json!("Target app is not installed.");
                    }
                }
                format!("{value}\n").into_bytes()
            },
        )
        .await;
        let mut receipt = document();
        receipt["bridge_port"] = json!(server.port);
        receipt["certificate_sha256"] = json!(server.pin);
        save(directory.path(), "127.0.0.1", &receipt);
        let error = ButtonEdits::new(directory.path().into())
            .change("127.0.0.1", IDENTITY, &disabled())
            .await
            .unwrap_err();
        assert_eq!(
            error.code,
            match scenario {
                "receipt_before" | "receipt_after" => "root_state_changed",
                "refused" => "button_change_failed",
                _ => "button_change_unverified",
            }
        );
        server.finish().await;
    }
}
