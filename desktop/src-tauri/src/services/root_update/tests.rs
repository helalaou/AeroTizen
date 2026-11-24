use super::*;
use crate::services::root_install::Bootstrap;
const DUID: &str = "root-update-test";
const FIRST_BOOT: &str = "00000000-0000-4000-8000-000000000002";
const NEXT_BOOT: &str = "00000000-0000-4000-8000-000000000003";
fn identity() -> String {
    sha256_hex(DUID.as_bytes())
}
fn config() -> Value {
    json!({"files":{"bridge":"new"}})
}
fn target() -> String {
    sha256_hex(&root_package::config_bytes(&config()).unwrap())
}
struct Fake {
    record: Value,
    installed: String,
    boot: &'static str,
    version: Value,
    automatic: bool,
    scenario: &'static str,
    homes: usize,
    registries: usize,
    installs: usize,
    repairs: usize,
    packages: usize,
    certificates: usize,
    cleanup: usize,
    saves: usize,
}
impl Fake {
    fn new(scenario: &'static str) -> Self {
        let mut record = crate::services::root_pairing::tests::document();
        record["phase"] = json!("active");
        record["duid_sha256"] = json!(identity());
        record["device_identity_sha256"] = json!(identity());
        record["public_config"] = json!({"files":{"bridge":"old"}});
        let installed = sha256_hex(&root_package::config_bytes(&record["public_config"]).unwrap());
        Self {
            record,
            installed,
            boot: FIRST_BOOT,
            version: json!("3.0.9"),
            automatic: true,
            scenario,
            homes: 0,
            registries: 0,
            installs: 0,
            repairs: 0,
            packages: 0,
            certificates: 0,
            cleanup: 0,
            saves: 0,
        }
    }
    async fn run(&mut self, resume: bool, recovery: bool) -> AppResult<()> {
        update(
            self,
            self.record.clone(),
            config(),
            &identity(),
            resume,
            recovery,
        )
        .await
    }
    fn pending(&mut self) {
        self.record["upgrade"] = json!({"from_boot_id":FIRST_BOOT,"configuration_sha256":target(),"package_sha256":"d".repeat(64)});
    }
}
impl Operations for Fake {
    async fn archive_removed(&mut self) -> AppResult<()> {
        panic!("update archived original pairing")
    }
    async fn identity(&mut self) -> AppResult<String> {
        Ok(DUID.into())
    }
    async fn home(&mut self) -> AppResult<Value> {
        self.homes += 1;
        Ok(
            json!({"complete":true,"device":{"identity_sha256":identity()},"boot":{"id":if self.scenario=="boot-changed" && self.homes.is_multiple_of(2) {NEXT_BOOT} else {self.boot}},"home":{"mode":if self.scenario=="home-changed" && self.homes.is_multiple_of(2) {"changed"} else {"original"}}}),
        )
    }
    async fn preflight(&mut self) -> AppResult<Value> {
        if self.scenario == "preflight" {
            return Err(failed());
        }
        Ok(
            json!({"schema_version":1,"runtime":"6.0.0","database_uid":901,"database_gid":901,"boot_id":self.boot}),
        )
    }
    async fn registry(&mut self) -> AppResult<Value> {
        self.registries += 1;
        Ok(
            json!({"row":["helper","helper","dotnet","svcapp",if self.automatic {"true"} else {"false"},"false","helper"],"installation_id":self.record["installation_id"],"configuration_sha256":self.installed,"other_rows_sha256":if self.scenario=="registry-changed" && self.registries>1 {"b".repeat(64)} else {"a".repeat(64)}}),
        )
    }
    async fn certificates(&mut self, _: &str) -> AppResult<()> {
        self.certificates += 1;
        if self.scenario == "missing-certs" {
            return Err(AppError::new("certificates_required", "missing"));
        }
        Ok(())
    }
    async fn pairing(&mut self, _: &str) -> AppResult<Value> {
        panic!("update replaced pairing")
    }
    async fn persist(&mut self, receipt: &Value) -> AppResult<()> {
        assert!(crate::services::root_pairing::parse(receipt.clone(), &identity()).is_ok());
        self.record = receipt.clone();
        self.saves += 1;
        Ok(())
    }
    async fn package(&mut self, _: &Value) -> AppResult<(Value, String)> {
        self.packages += 1;
        Ok((config(), "d".repeat(64)))
    }
    async fn verified_package(&mut self, _: &str) -> AppResult<()> {
        if self.scenario == "corrupt-package" {
            Err(failed())
        } else {
            Ok(())
        }
    }
    async fn install(&mut self, _: &str) -> AppResult<String> {
        assert!(self.record.get("upgrade").is_some());
        assert!(self.saves > 0);
        self.installs += 1;
        self.installed = target();
        self.automatic = false;
        if self.scenario == "lost-install" {
            return Err(failed());
        }
        Ok("install completed".into())
    }
    async fn clean_upload(&mut self, _: &str, _: &str) -> AppResult<()> {
        self.cleanup += 1;
        Ok(())
    }
    async fn proof(&mut self, _: &Value) -> AppResult<Value> {
        Ok(
            json!({"boot_id":self.boot,"origin":if self.scenario=="not-boot" {"install"} else {"boot"},"automatic_startup_enabled":self.automatic,"bootstrap_completed":true,"helper_installed":true,"runtime_version":self.version,"configuration_sha256":self.installed}),
        )
    }
    async fn live(&mut self, _: &Value) -> bool {
        panic!("update discarded the boot proof")
    }
    async fn prepare_bootstrap(&mut self, receipt: &Value) -> AppResult<Bootstrap> {
        assert_eq!(receipt["public_config"], config());
        Ok(Bootstrap {
            nonce: "f".repeat(32),
            input: vec![],
            pfx: vec![],
            pin: String::new(),
        })
    }
    async fn bootstrap(&mut self, input: &Bootstrap) -> AppResult<Value> {
        assert_eq!(
            self.record["attempts"].as_array().unwrap().last().unwrap()["operation"],
            "upgrade"
        );
        assert_eq!(self.record["phase"], "active");
        self.repairs += 1;
        self.automatic = true;
        Ok(
            json!({"passed":true,"protected_proof_verified":true,"staging_cleaned":true,"system_files_unchanged":true,"same_boot":self.scenario!="bad-proof","startup_repaired":true,"nonce":input.nonce}),
        )
    }
}
#[tokio::test]
async fn update_saves_intent_preserves_pairing_repairs_startup_and_requires_a_new_automatic_boot() {
    let mut io = Fake::new("success");
    let original = io.record.clone();
    io.run(false, false).await.unwrap();
    assert_eq!((io.installs, io.repairs, io.packages), (1, 1, 1));
    assert!(io.record.get("upgrade").is_some());
    io.run(true, false).await.unwrap();
    io.version = json!(TARGET_RUNTIME_VERSION);
    io.run(true, false).await.unwrap();
    assert!(io.record.get("upgrade").is_some());
    io.boot = NEXT_BOOT;
    io.run(true, false).await.unwrap();
    assert!(io.record.get("upgrade").is_none());
    assert_eq!(io.record["verified_boot_id"], NEXT_BOOT);
    for key in [
        "token",
        "server_pfx",
        "certificate_sha256",
        "installation_id",
        "original_pc_host",
        "home_before",
    ] {
        assert_eq!(io.record[key], original[key], "{key}");
    }
    assert_eq!(
        (io.installs, io.repairs, io.packages, io.certificates),
        (1, 1, 1, 1)
    );
    let saves = io.saves;
    io.run(false, false).await.unwrap();
    assert_eq!(io.saves, saves);
}
#[tokio::test]
async fn lost_install_reply_recovers_without_reinstalling_or_replacing_signing_profiles() {
    let mut io = Fake::new("lost-install");
    assert!(io.run(false, false).await.is_err());
    assert_eq!(io.cleanup, 1);
    assert!(io.record.get("upgrade").is_some());
    io.scenario = "success";
    io.run(true, true).await.unwrap();
    assert_eq!(
        (io.installs, io.repairs, io.packages, io.certificates),
        (1, 1, 1, 1)
    );
    assert!(io.record.get("upgrade").is_some());
    io.boot = NEXT_BOOT;
    io.version = json!(TARGET_RUNTIME_VERSION);
    io.run(true, false).await.unwrap();
    assert!(io.record.get("upgrade").is_none());
}
#[tokio::test]
async fn incompatible_versions_preflight_certificates_or_registration_cannot_begin_an_update() {
    for scenario in [
        "preflight",
        "missing-certs",
        "not-boot",
        "same-version",
        "newer",
        "unknown",
        "null-version",
        "foreign",
    ] {
        let mut io = Fake::new(scenario);
        match scenario {
            "same-version" => io.version = json!(TARGET_RUNTIME_VERSION),
            "newer" => io.version = json!("999.0.0"),
            "unknown" => io.version = json!("unknown"),
            "null-version" => io.version = Value::Null,
            "foreign" => io.installed = "e".repeat(64),
            _ => {}
        }
        let original = io.record.clone();
        assert!(io.run(false, false).await.is_err(), "{scenario}");
        assert_eq!((io.installs, io.repairs, io.saves), (0, 0, 0));
        assert_eq!(io.record, original);
    }
}
#[tokio::test]
async fn resume_validates_build_and_archive_before_mutating_and_preservation_failures_keep_pending_recovery(
) {
    let mut io = Fake::new("success");
    assert!(io.run(true, false).await.is_err());
    assert!(io.run(false, true).await.is_err());
    io.pending();
    io.record["upgrade"]["configuration_sha256"] = json!("e".repeat(64));
    assert_eq!(
        io.run(true, false).await.unwrap_err().code,
        "root_update_requirements"
    );
    assert_eq!(io.installs, 0);
    io.pending();
    io.scenario = "corrupt-package";
    assert!(io.run(true, false).await.is_err());
    assert_eq!(io.installs, 0);
    for scenario in [
        "home-changed",
        "registry-changed",
        "bad-proof",
        "boot-changed",
    ] {
        let mut io = Fake::new(scenario);
        assert!(io.run(false, false).await.is_err(), "{scenario}");
        assert!(io.record.get("upgrade").is_some());
        assert_eq!(io.installs, 1);
    }
}
#[test]
fn older_versions_match_cli_integer_tuple_order_without_overflow() {
    assert!(older("0003.0000.9", "3.1.1"));
    assert!(older("0.1.0", "3.1.1"));
    for version in [
        "3.1.1",
        "3.1.2",
        "3.1",
        "invalid",
        "999999999999999999999999.0.0",
    ] {
        assert!(!older(version, "3.1.1"));
    }
}
