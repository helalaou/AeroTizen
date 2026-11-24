use super::*;
#[test]
fn recovery_receipt_chains_and_uninstalled_proofs_match_the_cli() {
    let fixture: Value = serde_json::from_str(include_str!(
        "../../../../../tests/fixtures/home-recovery.json"
    ))
    .unwrap();
    let raw = crate::services::sdb::tests::bytes(fixture["raw_hex"].as_str().unwrap());
    let digest = fixture["digest"].as_str().unwrap();
    for case in fixture["cases"].as_array().unwrap() {
        let directory = tempfile::tempdir().unwrap();
        for (token, receipt) in case["receipts"].as_object().unwrap() {
            std::fs::write(
                directory.path().join(format!("{token}.json")),
                serde_json::to_vec(receipt).unwrap(),
            )
            .unwrap();
        }
        assert_eq!(
            active(&case["status"], directory.path(), &raw, digest),
            case["active"].as_str().map(str::to_owned),
            "{}",
            case["name"]
        );
        assert_eq!(
            absent(directory.path(), &raw, digest).unwrap(),
            if case["absent"].is_null() {
                None
            } else {
                Some(case["absent"].clone())
            },
            "{}",
            case["name"]
        );
    }
}
#[test]
fn receipt_scans_and_chains_are_bounded_and_unsafe_tokens_never_open_paths() {
    let directory = tempfile::tempdir().unwrap();
    assert!(load(directory.path(), "../outside", b"original", "digest").is_none());
    for index in 0..=MAX_RECOVERY_RECEIPTS {
        std::fs::write(directory.path().join(format!("{index:032x}.json")), b"{}").unwrap();
    }
    assert!(absent(directory.path(), b"original", "digest").is_err());
}

#[test]
fn boot_recovery_chain_limit_does_not_accept_a_later_apply_beyond_the_bound() {
    let raw = b"original";
    let digest = crate::services::digest::sha256_hex(raw);
    for count in [MAX_RECOVERY_CHAIN, MAX_RECOVERY_CHAIN + 1] {
        let directory = tempfile::tempdir().unwrap();
        for index in 0..count {
            let token = format!("{index:032x}");
            let request = if index == count - 1 {
                json!({"schema_version":1,"action":"apply","transaction":token,"boot":true,"baseline_sha256":digest,"baseline_base64":STANDARD.encode(raw)})
            } else {
                json!({"schema_version":1,"action":"restore","transaction":token,"restore_boot_transaction":format!("{:032x}",index+1),"baseline_sha256":digest,"baseline_base64":STANDARD.encode(raw)})
            };
            std::fs::write(
                directory.path().join(format!("{token}.json")),
                serde_json::to_vec(&json!({"request":request})).unwrap(),
            )
            .unwrap();
        }
        let status = json!({"watcher":{"control":{"mode":"hold","transaction":"0".repeat(32),"baseline_sha256":digest}}});
        assert_eq!(
            active(&status, directory.path(), raw, &digest).is_some(),
            count == MAX_RECOVERY_CHAIN
        );
    }
}
