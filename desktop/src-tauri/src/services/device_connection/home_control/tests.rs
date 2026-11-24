use super::*;
use crate::services::{
    device_connection::tests::{metadata_document, Peer},
    sdb::sync::tests::{handshake, read_reply},
    sdk::tests::serve_helper,
};
fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/home-control.json"
    ))
    .unwrap()
}
fn files(entrypoint: &str) -> Vec<PayloadFile> {
    vec![
        PayloadFile {
            name: entrypoint.into(),
            bytes: b"synthetic helper".to_vec(),
        },
        PayloadFile {
            name: entrypoint.replace(".dll", ".runtimeconfig.json"),
            bytes: b"{}".to_vec(),
        },
    ]
}
#[tokio::test]
async fn live_adapter_runs_query_writer_and_readback_on_one_owned_sdb_session_without_a_worker() {
    const DUID: &str = "test-duid";
    let directory = tempfile::tempdir().unwrap();
    let identity = sha256_hex(DUID.as_bytes());
    let fixture = fixture();
    let mut document = fixture["original"].clone();
    document["device"]["identity_sha256"] = json!(identity);
    let owner = HomeBackups::new(directory.path().into());
    let prepared = owner
        .save_original(&identity, document.clone())
        .await
        .unwrap();
    let original = owner
        .original(&identity, Some(&prepared.backup_sha256), None)
        .await
        .unwrap();
    let raw = original.raw.clone();
    let original_path = original.path.clone();
    let info =
        json!({"modelName":document["device"]["model"],"model":document["device"]["platform"]});
    let mut metadata = metadata_document(info).await;
    let query = fixture["query"].clone();
    let cpu = document["device"]["cpu_arch"].as_str().unwrap().to_owned();
    let mut peer=Peer::start(1,move |mut io,_| {let query=query.clone();let cpu=cpu.clone();async move {
        handshake(&mut io).await;
        read_reply(&mut io,"shell:0 getduid",DUID).await;read_reply(&mut io,"capability:",&format!("cpu_arch:{cpu}\n")).await;
        serve_helper(&mut io,helper_payloads::QUERY_ENTRYPOINT,&[helper_payloads::QUERY_ENTRYPOINT,"AeroTizenHomeQuery.runtimeconfig.json"],&format!("AEROTIZEN_HOME_QUERY={query}")).await;read_reply(&mut io,"shell:0 getduid",DUID).await;
        read_reply(&mut io,"shell:0 getduid",DUID).await;
        let result=json!({"schema_version":1,"uid":901,"action":"apply","result":{"Success":true,"RolledBack":false,"StartupSettingsRestored":false,"Error":null}});
        let uploaded=serve_helper(&mut io,helper_payloads::CONTROL_ENTRYPOINT,&[helper_payloads::CONTROL_ENTRYPOINT,"AeroTizenHomeControl.runtimeconfig.json","request.json"],&format!("AEROTIZEN_HOME_CONTROL={result}")).await;
        let request:Value=serde_json::from_slice(&uploaded[2].bytes).unwrap();assert_eq!(request["action"],"apply");assert_eq!(request["boot"],true);
        let mut final_query=query.clone();for key in [home_protocol::HOME_KEY,home_protocol::STARTUP_KEY,home_protocol::STARTUP_BACKUP_KEY] {final_query["settings"][key]["value"]=json!(crate::models::LAUNCHER_APP_ID);}
        final_query["settings"][home_protocol::AUTOSTART_KEY]["value"]=json!(1);final_query["main_operation"]["value"]=json!(crate::models::LAUNCHER_APP_ID);final_query["watcher"]["control"]["mode"]=json!("native");
        read_reply(&mut io,"shell:0 getduid",DUID).await;read_reply(&mut io,"capability:",&format!("cpu_arch:{cpu}\n")).await;
        serve_helper(&mut io,helper_payloads::QUERY_ENTRYPOINT,&[helper_payloads::QUERY_ENTRYPOINT,"AeroTizenHomeQuery.runtimeconfig.json"],&format!("AEROTIZEN_HOME_QUERY={final_query}")).await;read_reply(&mut io,"shell:0 getduid",DUID).await;
        Vec::new()
    }}).await;
    let connection = TvConnection::with_ports(directory.path().into(), peer.port, metadata.port);
    let result = connection
        .change_home_with(
            "127.0.0.1",
            &identity,
            Action::Apply,
            original,
            files(helper_payloads::QUERY_ENTRYPOINT),
            files(helper_payloads::CONTROL_ENTRYPOINT),
        )
        .await
        .unwrap();
    assert_eq!(result["home"]["mode"], "native");
    assert_eq!(std::fs::read(original_path).unwrap(), raw);
    peer.finish().await;
    metadata.finish().await;
}
