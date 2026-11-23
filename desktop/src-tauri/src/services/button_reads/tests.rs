use super::*;
use crate::services::{
    root_bridge::tests::{reply, Server},
    root_pairing::tests::{document, save, IDENTITY},
};
use serde_json::json;

#[tokio::test]
async fn authenticated_button_reads_use_only_non_mutating_requests_and_preserve_recovery() {
    for discovery in [true, false] {
        let mut server = Server::new(2, move |request| {
            let mut value = reply(request);
            if request["operation"] == "status" {
                value["buttons_protocol"] = json!(BUTTON_PROTOCOL_VERSION);
                value["buttons_discovery"] = json!(discovery);
            } else {
                value["buttons"] =
                    json!({"rules":[{"button":"Netflix","mode":"disabled","active":true}]});
            }
            format!("{value}\n").into_bytes()
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let mut value = document();
        value["bridge_port"] = json!(server.port);
        value["certificate_sha256"] = json!(server.pin);
        let path = save(directory.path(), "127.0.0.1", &value);
        let before = std::fs::read(&path).unwrap();
        let result = ButtonReads::new(directory.path().into())
            .read("127.0.0.1", IDENTITY)
            .await
            .unwrap();
        let ButtonMappings::Ready {
            buttons,
            discovery_detail,
        } = result
        else {
            panic!("expected ready mappings")
        };
        assert_eq!(buttons.len(), 1);
        assert!(buttons[0].active);
        assert_eq!(discovery_detail.is_none(), discovery);
        assert_eq!(server.next().await.unwrap()["operation"], "status");
        let request = server.next().await.unwrap();
        assert_eq!(request["operation"], "buttons");
        assert_eq!(
            request["buttons"],
            json!({"action":if discovery {"list"} else {"status"},"apply":false})
        );
        assert_eq!(std::fs::read(path).unwrap(), before);
        server.finish().await;
    }
}

#[tokio::test]
async fn missing_or_inactive_pairing_never_contacts_the_tv_and_wrong_identity_is_rejected() {
    let directory = tempfile::tempdir().unwrap();
    let reader = ButtonReads::new(directory.path().into());
    assert!(matches!(
        reader.read("192.0.2.20", IDENTITY).await.unwrap(),
        ButtonMappings::PairingRequired
    ));
    let mut value = document();
    value["phase"] = json!("waiting_boot");
    save(directory.path(), "192.0.2.20", &value);
    assert!(matches!(
        reader.read("192.0.2.20", IDENTITY).await.unwrap(),
        ButtonMappings::PairingRequired
    ));
    assert_eq!(
        reader
            .read("192.0.2.20", &"e".repeat(64))
            .await
            .unwrap_err()
            .code,
        "identity_mismatch"
    );
}

#[tokio::test]
async fn an_old_helper_gets_no_button_request_and_failed_proof_cannot_return_mappings() {
    for valid_proof in [true, false] {
        let mut server = Server::new(1, move |request| {
            let mut value = reply(request);
            if !valid_proof {
                value["nonce"] = json!("replayed");
            }
            format!("{value}\n").into_bytes()
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let mut value = document();
        value["bridge_port"] = json!(server.port);
        value["certificate_sha256"] = json!(server.pin);
        save(directory.path(), "127.0.0.1", &value);
        let result = ButtonReads::new(directory.path().into())
            .read("127.0.0.1", IDENTITY)
            .await;
        if valid_proof {
            assert!(matches!(
                result.unwrap(),
                ButtonMappings::HelperUpdateRequired
            ));
        } else {
            assert_eq!(result.unwrap_err().code, "connection_failed");
        }
        server.finish().await;
    }
}

#[tokio::test]
async fn every_reply_is_authenticated_even_after_valid_capabilities() {
    let mut server = Server::new(2, |request| {
        let mut value = reply(request);
        value["buttons_protocol"] = json!(BUTTON_PROTOCOL_VERSION);
        if request["operation"] == "buttons" {
            value["nonce"] = json!("replayed");
            value["buttons"] = json!({"rules": []});
        }
        format!("{value}\n").into_bytes()
    })
    .await;
    let directory = tempfile::tempdir().unwrap();
    let mut value = document();
    value["bridge_port"] = json!(server.port);
    value["certificate_sha256"] = json!(server.pin);
    save(directory.path(), "127.0.0.1", &value);
    assert_eq!(
        ButtonReads::new(directory.path().into())
            .read("127.0.0.1", IDENTITY)
            .await
            .unwrap_err()
            .code,
        "connection_failed"
    );
    server.finish().await;
}

#[tokio::test]
async fn a_changed_pairing_cannot_return_a_stale_button_list() {
    let directory = tempfile::tempdir().unwrap();
    let target = directory.path().to_owned();
    let mut server = Server::new(2, move |request| {
        let mut value = reply(request);
        value["buttons_protocol"] = json!(BUTTON_PROTOCOL_VERSION);
        if request["operation"] == "buttons" {
            let path = target
                .join("root")
                .join(crate::services::digest::sha256_hex(b"127.0.0.1"))
                .join("receipt.json");
            let mut changed: serde_json::Value =
                serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();
            changed["phase"] = json!("removed");
            std::fs::write(path, changed.to_string()).unwrap();
            value["buttons"] = json!({"rules": []});
        }
        format!("{value}\n").into_bytes()
    })
    .await;
    let mut value = document();
    value["bridge_port"] = json!(server.port);
    value["certificate_sha256"] = json!(server.pin);
    save(directory.path(), "127.0.0.1", &value);
    assert_eq!(
        ButtonReads::new(directory.path().into())
            .read("127.0.0.1", IDENTITY)
            .await
            .unwrap_err()
            .code,
        "root_state_changed"
    );
    server.finish().await;
}
