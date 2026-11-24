use super::*;
use crate::services::{
    device_connection::tests::{metadata_document, Peer},
    root_bridge::tests::{reply, server_tls, Server},
    root_pairing::tests::{document, save, IDENTITY},
    sdb::sync::tests::{handshake, read_reply},
    sdk::tests::{serve_helper, serve_helper_with_args},
};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
fn helpers(name: &str, dependencies: bool) -> Vec<sdk::PayloadFile> {
    let mut files = vec![
        sdk::PayloadFile {
            name: format!("{name}.dll"),
            bytes: b"synthetic".to_vec(),
        },
        sdk::PayloadFile {
            name: format!("{name}.runtimeconfig.json"),
            bytes: b"{}".to_vec(),
        },
    ];
    if dependencies {
        files.push(sdk::PayloadFile {
            name: format!("{name}.deps.json"),
            bytes: b"{}".to_vec(),
        });
    }
    files
}
#[tokio::test]
async fn unconfirmed_boot_proof_never_runs_sdk_helpers_or_changes_the_receipt() {
    for field in [
        "origin",
        "boot_id",
        "automatic_startup_enabled",
        "bootstrap_completed",
        "helper_installed",
    ] {
        let original = document();
        let baseline = original["baseline_boot_id"].clone();
        let mut server = Server::new(1, move |request| {
            let mut value = reply(request);
            value[field] = if field == "origin" {
                json!("setup")
            } else if field == "boot_id" {
                baseline.clone()
            } else {
                json!(false)
            };
            format!("{value}\n").into_bytes()
        })
        .await;
        let directory = tempfile::tempdir().unwrap();
        let mut value = document();
        value["phase"] = json!("waiting_boot");
        value["bridge_port"] = json!(server.port);
        value["certificate_sha256"] = json!(server.pin);
        let path = save(directory.path(), "127.0.0.1", &value);
        let bytes = std::fs::read(&path).unwrap();
        let result = TvConnection::new(directory.path().into())
            .verify_root_setup("127.0.0.1", IDENTITY)
            .await
            .unwrap();
        assert!(!result.setup_complete);
        assert_eq!(result.phase, RootPhase::WaitingBoot);
        assert_eq!(std::fs::read(path).unwrap(), bytes);
        assert_eq!(server.next().await.unwrap()["operation"], "status");
        server.finish().await;
    }
}
#[tokio::test]
async fn verified_boot_home_query_and_registry_mark_only_the_existing_pairing_active() {
    for scenario in ["success", "boot-changed", "registration", "record-changed"] {
        let directory = tempfile::tempdir().unwrap();
        let target = directory.path().to_owned();
        let expected = crate::services::digest::sha256_hex(b"root-test-duid");
        let wire_identity = expected.clone();
        let (acceptor, pin) = server_tls();
        let fixture: Value = serde_json::from_str(include_str!(
            "../../../../../tests/fixtures/home-control.json"
        ))
        .unwrap();
        let mut query = fixture["query"].clone();
        query["boot"] = json!({"id":"00000000-0000-4000-8000-000000000002","uptime_seconds":300});
        if scenario == "boot-changed" {
            query["boot"]["id"] = json!("00000000-0000-4000-8000-000000000003");
        }
        let mut server=Peer::start(1,move |socket,_| {let acceptor=acceptor.clone();let query=query.clone();let target=target.clone();let wire_identity=wire_identity.clone();async move {
            let mut io=BufReader::new(acceptor.accept(socket).await.unwrap());let mut line=String::new();io.read_line(&mut line).await.unwrap();let request:Value=serde_json::from_str(&line).unwrap();assert_eq!(request["operation"],"sdb");let mut proof=reply(&request);proof["device_identity_sha256"]=json!(wire_identity);io.write_all(format!("{proof}\n").as_bytes()).await.unwrap();handshake(&mut io).await;
            read_reply(&mut io,"shell:0 getduid","root-test-duid").await;read_reply(&mut io,"capability:","cpu_arch:armv7\n").await;
            serve_helper(&mut io,helper_payloads::QUERY_ENTRYPOINT,&[helper_payloads::QUERY_ENTRYPOINT,"AeroTizenHomeQuery.runtimeconfig.json"],&format!("AEROTIZEN_HOME_QUERY={query}")).await;read_reply(&mut io,"shell:0 getduid","root-test-duid").await;
            if scenario=="boot-changed" {return vec![];}
            let registry=json!({"row":[root_bridge::HELPER_APP_ID,root_bridge::HELPER_APP_ID,"dotnet","svcapp",if scenario=="registration" {"false"} else {"true"},"false",format!("/opt/usr/apps/{}/bin/AeroTizenRootHelper.dll",root_bridge::HELPER_APP_ID)]});
            serve_helper_with_args(&mut io,helper_payloads::ROOT_BRIDGE_ENTRYPOINT,&[helper_payloads::ROOT_BRIDGE_ENTRYPOINT,"AeroTizenRootBridge.runtimeconfig.json","AeroTizenRootBridge.deps.json"],&format!("AEROTIZEN_ROOT_REGISTRY={registry}"),&["--registry"]).await;
            if scenario=="registration" {return vec![];}
            if scenario=="record-changed" {let path=target.join("root").join(crate::services::digest::sha256_hex(b"127.0.0.1")).join("receipt.json");let mut value:Value=serde_json::from_slice(&std::fs::read(&path).unwrap()).unwrap();value["phase"]=json!("removing");std::fs::write(path,serde_json::to_vec(&value).unwrap()).unwrap();}
            read_reply(&mut io,"shell:0 getduid","root-test-duid").await;vec![]
        }}).await;
        let expected = crate::services::digest::sha256_hex(b"root-test-duid");
        let mut original = document();
        original["phase"] = json!("waiting_boot");
        original["duid_sha256"] = json!(expected);
        original["device_identity_sha256"] = json!(expected);
        original["bridge_port"] = json!(server.port);
        original["certificate_sha256"] = json!(pin);
        let path = save(directory.path(), "127.0.0.1", &original);
        let before = root_pairing::parse(original.clone(), &expected).unwrap();
        let mut info =
            metadata_document(json!({"modelName":"Frame","developerIP":"127.0.0.1"})).await;
        let owner = TvConnection::with_ports(directory.path().into(), 1, info.port);
        let ownership = tv_session::acquire(directory.path(), "127.0.0.1")
            .await
            .unwrap();
        let mut live = reply(&json!({"nonce":"unused"}));
        live["device_identity_sha256"] = json!(expected);
        let context = Verification {
            receipt: before,
            ownership,
            live,
            query: helpers("AeroTizenHomeQuery", false),
            bridge: helpers("AeroTizenRootBridge", true),
        };
        let result = owner
            .verify_root_session("127.0.0.1", &expected, context)
            .await;
        let current: Value = serde_json::from_slice(&std::fs::read(path).unwrap()).unwrap();
        if scenario == "success" {
            let result = result.unwrap();
            assert!(result.setup_complete);
            assert_eq!(current["phase"], "active");
            assert_eq!(current["token"], original["token"]);
            assert_eq!(
                current["certificate_sha256"],
                original["certificate_sha256"]
            );
            assert_eq!(
                current["verified_boot_id"],
                "00000000-0000-4000-8000-000000000002"
            );
        } else {
            assert!(result.is_err(), "{scenario}");
            assert_eq!(
                current["phase"],
                if scenario == "record-changed" {
                    "removing"
                } else {
                    "waiting_boot"
                }
            );
        }
        server.finish().await;
        info.finish().await;
    }
}
#[test]
fn unexpected_or_duplicate_registration_results_cannot_confirm_a_different_service() {
    for row in [
        json!(null),
        json!(["other"]),
        json!([
            root_bridge::HELPER_APP_ID,
            root_bridge::HELPER_APP_ID,
            "dotnet",
            "svcapp",
            "true",
            "true",
            format!(
                "/opt/usr/apps/{}/bin/AeroTizenRootHelper.dll",
                root_bridge::HELPER_APP_ID
            )
        ]),
    ] {
        let native = sdk::Completion {
            stdout: format!("{REGISTRY_PREFIX}{}\n", json!({"row":row})),
            exit_code: 0,
            staging_cleaned: true,
        };
        if row.is_null() {
            assert!(registry(&native).unwrap()["row"].is_null());
        } else {
            assert!(registry(&native).is_err());
        }
    }
    let document = json!({"row":null});
    let native = sdk::Completion {
        stdout: format!("{REGISTRY_PREFIX}{document}\n{REGISTRY_PREFIX}{document}\n"),
        exit_code: 0,
        staging_cleaned: true,
    };
    assert!(registry(&native).is_err());
}
