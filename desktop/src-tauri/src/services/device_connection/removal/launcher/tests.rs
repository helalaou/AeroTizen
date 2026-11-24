use super::*;
use crate::services::{
    device_connection::tests::metadata_document,
    digest::sha256_hex,
    root_bridge::tests::{reply, server_tls},
    root_pairing::tests::{document, save},
    sdb::tests::serve_script,
};
use serde_json::json;
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::TcpListener,
};

const DUID: &str = "test-duid";
const BEFORE: &str =
    "apps count: 2\napp_id=DclHome001.Home app_version=3.4.0\napp_id=OtherApps1.Media\n";
const AFTER: &str = "apps count: 1\napp_id=OtherApps1.Media\n";

fn clear_home() -> Value {
    json!({"home_settings":{
        "home_button_app":"com.samsung.tv.csfs",
        "home_app":"com.samsung.tv.csfs",
        "startup_app":"",
        "startup_backup_app":"org.tizen.tv-viewer",
        "first_screen":"com.samsung.tv.csfs",
        "smart_hub_autostart":false
    }})
}

#[test]
fn requires_all_cli_home_settings_and_blocks_every_assignment_to_the_launcher_package() {
    assert!(verify_home_clear(&clear_home()).is_ok());
    for field in HOME_ASSIGNMENTS {
        let mut reply = clear_home();
        reply["home_settings"][field] = json!("DclHome001.Watcher");
        assert_eq!(
            verify_home_clear(&reply).unwrap_err().code,
            "launcher_home_assigned"
        );
        reply["home_settings"][field] = Value::Null;
        assert_eq!(
            verify_home_clear(&reply).unwrap_err().code,
            "launcher_home_unverified"
        );
    }
    let mut reply = clear_home();
    reply["home_settings"]["smart_hub_autostart"] = Value::Null;
    assert_eq!(
        verify_home_clear(&reply).unwrap_err().code,
        "launcher_home_unverified"
    );
}

fn inventory(raw: &str) -> Vec<(String, String)> {
    vec![
        ("shell:0 getduid".into(), DUID.into()),
        ("shell:0 vd_applist".into(), raw.into()),
        ("shell:0 getduid".into(), DUID.into()),
    ]
}

async fn simulate(
    home: Value,
    revision: Option<&str>,
    after: Option<&str>,
) -> (AppResult<Option<LauncherRemovalReview>>, Vec<String>) {
    let directory = tempfile::tempdir().unwrap();
    let expected = sha256_hex(DUID.as_bytes());
    let (acceptor, pin) = server_tls();
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let mut receipt = document();
    receipt["duid_sha256"] = json!(expected);
    receipt["bridge_port"] = json!(listener.local_addr().unwrap().port());
    receipt["certificate_sha256"] = json!(pin);
    save(directory.path(), "127.0.0.1", &receipt);
    let mut metadata = metadata_document(json!({"developerIP":"127.0.0.1"})).await;
    let connection = TvConnection::with_ports(directory.path().into(), 1, metadata.port);
    let mut steps = inventory(BEFORE);
    if let Some(after) = after {
        steps.push((
            "shell:0 vd_appuninstall DclHome001.Home".into(),
            "uninstall completed".into(),
        ));
        steps.extend(inventory(after));
    }
    let server = async {
        let (socket, _) = listener.accept().await.unwrap();
        let mut relay = BufReader::new(acceptor.accept(socket).await.unwrap());
        let mut line = String::new();
        relay.read_line(&mut line).await.unwrap();
        let request: Value = serde_json::from_str(&line).unwrap();
        assert_eq!(request["operation"], "sdb");
        let mut proof = reply(&request);
        proof["home_status_protocol"] = json!(1);
        relay
            .write_all(format!("{proof}\n").as_bytes())
            .await
            .unwrap();
        let home_reply = async {
            let (socket, _) = listener.accept().await.unwrap();
            let mut socket = BufReader::new(acceptor.accept(socket).await.unwrap());
            let mut line = String::new();
            socket.read_line(&mut line).await.unwrap();
            let request: Value = serde_json::from_str(&line).unwrap();
            assert_eq!(request["operation"], "home_status");
            let mut result = reply(&request);
            result["home_settings"] = home["home_settings"].clone();
            socket
                .write_all(format!("{result}\n").as_bytes())
                .await
                .unwrap();
        };
        let (commands, ()) = tokio::join!(serve_script(&mut relay, steps), home_reply);
        commands
    };
    let client = async {
        match revision {
            Some(revision) => connection
                .remove_launcher("127.0.0.1", &expected, revision)
                .await
                .map(|()| None),
            None => connection
                .review_launcher_removal("127.0.0.1", &expected)
                .await
                .map(Some),
        }
    };
    let result = timeout(Duration::from_secs(4), async {
        tokio::join!(client, server)
    })
    .await
    .unwrap();
    metadata.finish().await;
    result
}

#[tokio::test]
async fn rechecks_home_after_review_and_requires_verified_removal_from_the_inventory() {
    let (review, commands) = simulate(clear_home(), None, None).await;
    let review = review.unwrap().unwrap();
    assert_eq!(review.version, "3.4.0");
    assert_eq!(commands.len(), 3);

    let mut changed = clear_home();
    changed["home_settings"]["startup_backup_app"] = json!("DclHome001.Home");
    let (blocked, commands) = simulate(changed, Some(&review.revision), None).await;
    assert_eq!(blocked.unwrap_err().code, "launcher_home_assigned");
    assert_eq!(commands.len(), 3);

    for after in [AFTER, BEFORE, "apps count: 2\n"] {
        let (result, commands) = simulate(clear_home(), Some(&review.revision), Some(after)).await;
        match after {
            AFTER => assert!(result.is_ok()),
            BEFORE => assert_eq!(result.unwrap_err().code, "launcher_still_installed"),
            _ => assert_eq!(result.unwrap_err().code, "launcher_removal_unverified"),
        }
        assert_eq!(
            commands
                .iter()
                .filter(|command| command.contains("vd_appuninstall"))
                .count(),
            1
        );
    }
}
