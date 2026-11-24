use super::*;
const DUID: &str = "root-test-duid";
const BOOT: &str = "00000000-0000-4000-8000-000000000001";
struct Fake {
    scenario: &'static str,
    record: Option<Value>,
    events: Vec<String>,
    saved: Vec<Value>,
    registries: usize,
    homes: usize,
    installs: usize,
    bootstraps: usize,
    pairings: usize,
    certificates: usize,
    cleanup: usize,
}
fn identity() -> String {
    crate::services::digest::sha256_hex(DUID.as_bytes())
}
fn home() -> Value {
    json!({"complete":true,"device":{"identity_sha256":identity()},"boot":{"id":BOOT},"home":{"mode":"stock","settings":{"home":"original"}}})
}
impl Fake {
    fn new(scenario: &'static str, record: Option<Value>) -> Self {
        Self {
            scenario,
            record,
            events: vec![],
            saved: vec![],
            registries: 0,
            homes: 0,
            installs: 0,
            bootstraps: 0,
            pairings: 0,
            certificates: 0,
            cleanup: 0,
        }
    }
}
impl Operations for Fake {
    async fn archive_removed(&mut self) -> AppResult<()> {
        self.events.push("archive".into());
        Ok(())
    }
    async fn identity(&mut self) -> AppResult<String> {
        Ok(DUID.into())
    }
    async fn home(&mut self) -> AppResult<Value> {
        self.homes += 1;
        let mut value = home();
        if self.scenario == "preservation" && self.homes > 1 {
            value["home"]["settings"]["home"] = json!("changed");
        }
        if self.scenario == "incomplete" {
            value["complete"] = json!(false);
        }
        Ok(value)
    }
    async fn preflight(&mut self) -> AppResult<Value> {
        let mut value = json!({"schema_version":1,"runtime":"6.0.0","database_uid":901,"database_gid":901,"boot_id":BOOT});
        match self.scenario {
            "runtime" => value["runtime"] = json!("3.1.0"),
            "owner" => value["database_uid"] = json!(0),
            "boot" => value["boot_id"] = json!("different"),
            _ => {}
        }
        Ok(value)
    }
    async fn registry(&mut self) -> AppResult<Value> {
        self.registries += 1;
        let present = self.registries > 1 || self.record.is_some() || self.scenario == "foreign";
        let installation = self
            .record
            .as_ref()
            .map(|record| record["installation_id"].clone())
            .unwrap_or(json!("2".repeat(32)));
        let onboot = self.registries > 2 || self.scenario == "recover-live";
        Ok(
            json!({"row":if present {json!([crate::services::root_bridge::HELPER_APP_ID,crate::services::root_bridge::HELPER_APP_ID,"dotnet","svcapp",if onboot {"true"} else {"false"},"false","dedicated helper"])} else {Value::Null},"installation_id":installation,"other_rows_sha256":"a".repeat(64)}),
        )
    }
    async fn certificates(&mut self, _: &str) -> AppResult<()> {
        self.certificates += 1;
        if matches!(self.scenario, "missing-certs" | "recover-live") {
            return Err(AppError::new("certificates_required", "missing"));
        }
        Ok(())
    }
    async fn pairing(&mut self, _: &str) -> AppResult<Value> {
        self.pairings += 1;
        Ok(json!({"token":"c".repeat(64),"certificate_sha256":"d".repeat(64),"server_pfx":"cGZ4"}))
    }
    async fn persist(&mut self, receipt: &Value) -> AppResult<()> {
        assert!(crate::services::root_pairing::parse(receipt.clone(), &identity()).is_ok());
        self.record = Some(receipt.clone());
        self.saved.push(receipt.clone());
        self.events
            .push(format!("save:{}", receipt["phase"].as_str().unwrap()));
        Ok(())
    }
    async fn package(&mut self, _: &Value) -> AppResult<(Value, String)> {
        self.events.push("package".into());
        Ok((json!({"files":{}}), "a".repeat(64)))
    }
    async fn install(&mut self, _: &str) -> AppResult<String> {
        self.installs += 1;
        let record = self.record.as_ref().unwrap();
        assert_eq!(record["package_sha256"], "a".repeat(64));
        self.events.push("install".into());
        if self.scenario == "install-lost" {
            return Err(failed());
        }
        Ok("install completed".into())
    }
    async fn clean_upload(&mut self, _: &str, _: &str) -> AppResult<()> {
        self.cleanup += 1;
        self.events.push("cleanup".into());
        Ok(())
    }
    async fn live(&mut self, _: &Value) -> bool {
        self.scenario == "recover-live"
    }
    async fn prepare_bootstrap(&mut self, _: &Value) -> AppResult<Bootstrap> {
        Ok(Bootstrap {
            nonce: "f".repeat(32),
            input: b"private".to_vec(),
            pfx: vec![],
            pin: "d".repeat(64),
        })
    }
    async fn bootstrap(&mut self, input: &Bootstrap) -> AppResult<Value> {
        self.bootstraps += 1;
        let record = self.record.as_ref().unwrap();
        assert_eq!(record["phase"], "root_requested");
        assert_eq!(
            record["attempts"].as_array().unwrap().last().unwrap()["nonce"],
            input.nonce
        );
        self.events.push("bootstrap".into());
        if self.scenario == "bootstrap-lost" {
            return Err(failed());
        }
        let mut value = json!({"passed":true,"protected_proof_verified":true,"staging_cleaned":true,"system_files_unchanged":true,"same_boot":true,"bridge_ready":true,"nonce":input.nonce});
        if self.scenario == "bad-proof" {
            value["same_boot"] = json!(false);
        }
        Ok(value)
    }
}
async fn run(fake: &mut Fake, record: Option<Value>) -> AppResult<()> {
    setup(
        fake,
        Parameters {
            host: "192.0.2.20",
            expected: &identity(),
            source: "192.0.2.10",
        },
        record,
    )
    .await
}
#[tokio::test]
async fn fresh_install_saves_pairing_and_intent_before_each_tv_write_and_waits_for_restart() {
    let mut fake = Fake::new("success", None);
    run(&mut fake, None).await.unwrap();
    assert_eq!(fake.installs, 1);
    assert_eq!(fake.bootstraps, 1);
    assert_eq!(fake.cleanup, 1);
    assert_eq!(fake.pairings, 1);
    let record = fake.record.as_ref().unwrap();
    assert_eq!(record["phase"], "waiting_boot");
    assert_eq!(record["home_before"], home()["home"]);
    assert_eq!(record["original_pc_host"], "192.0.2.10");
    assert_eq!(record["attempts"][0]["verified"], true);
    assert_eq!(
        &fake.events[..4],
        ["save:prepared", "package", "save:prepared", "install"]
    );
}
#[tokio::test]
async fn failed_or_unconfirmed_mutations_preserve_recovery_and_never_retry_automatically() {
    for scenario in [
        "install-lost",
        "bootstrap-lost",
        "bad-proof",
        "preservation",
    ] {
        let mut fake = Fake::new(scenario, None);
        assert!(run(&mut fake, None).await.is_err());
        assert_eq!(fake.installs, 1);
        assert_eq!(fake.cleanup, 1);
        assert_eq!(fake.pairings, 1);
        assert_eq!(fake.bootstraps, usize::from(scenario != "install-lost"));
        assert_eq!(
            fake.record.as_ref().unwrap()["phase"],
            if scenario == "install-lost" {
                "prepared"
            } else {
                "root_requested"
            }
        );
        assert_eq!(fake.record.as_ref().unwrap()["home_before"], home()["home"]);
    }
}
#[tokio::test]
async fn a_live_matching_install_recovers_lost_completion_without_signing_installing_or_bootstrapping_again(
) {
    let mut first = Fake::new("bootstrap-lost", None);
    assert!(run(&mut first, None).await.is_err());
    let record = first.record.clone().unwrap();
    let token = record["token"].clone();
    let mut resumed = Fake::new("recover-live", Some(record.clone()));
    run(&mut resumed, Some(record)).await.unwrap();
    assert_eq!(resumed.installs, 0);
    assert_eq!(resumed.bootstraps, 0);
    assert_eq!(resumed.pairings, 0);
    assert_eq!(resumed.certificates, 0);
    assert_eq!(resumed.record.as_ref().unwrap()["phase"], "waiting_boot");
    assert_eq!(resumed.record.as_ref().unwrap()["token"], token);
}
#[tokio::test]
async fn incomplete_preflight_missing_certificates_or_unowned_helpers_cannot_start_mutations_or_create_pairing(
) {
    for scenario in [
        "incomplete",
        "runtime",
        "owner",
        "boot",
        "foreign",
        "missing-certs",
    ] {
        let mut fake = Fake::new(scenario, None);
        assert!(run(&mut fake, None).await.is_err(), "{scenario}");
        assert_eq!(fake.installs, 0);
        assert_eq!(fake.bootstraps, 0);
        assert_eq!(fake.pairings, 0);
        assert!(fake.saved.is_empty());
    }
}
