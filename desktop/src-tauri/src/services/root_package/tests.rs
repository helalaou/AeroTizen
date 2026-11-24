use super::*;
use crate::services::widget_signer::tests::profile;
use openssl::{hash::MessageDigest, pkcs12::Pkcs12, pkey::PKey, rsa::Padding, sign::Verifier};
fn runtime() -> RootRuntime {
    let mut files = Vec::new();
    for (prefix, name) in [
        ("bin/", "AeroTizenRootHelper"),
        ("bin/", "AeroTizenRootBridge"),
        ("res/runner/", "AeroTizenRootProbe"),
        ("res/setup/", "AeroTizenBootWriter"),
    ] {
        for suffix in [".dll", ".runtimeconfig.json", ".deps.json"] {
            files.push(PayloadFile {
                name: format!("{prefix}{name}{suffix}"),
                bytes: b"managed test data".to_vec(),
            });
        }
    }
    RootRuntime {
        files,
        manifest: include_str!("../../../../tests/fixtures/root-manifest.xml")
            .replace("ROOT_RUNTIME_VERSION", env!("ROOT_RUNTIME_VERSION"))
            .into_bytes(),
        icon: b"synthetic icon".to_vec(),
    }
}
fn upstream() -> Upstream {
    Upstream {
        files: upstream::HASHES
            .iter()
            .map(|(name, _)| PayloadFile {
                name: (*name).into(),
                bytes: b"synthetic verified upstream".to_vec(),
            })
            .collect(),
    }
}
#[test]
fn fixed_proof_and_service_scripts_match_the_cli_and_reject_untrusted_identifiers() {
    let fixture: Value =
        serde_json::from_str(include_str!("../../../../tests/fixtures/root-package.json")).unwrap();
    assert_eq!(
        proof_script(
            fixture["package"].as_str().unwrap(),
            fixture["nonce"].as_str().unwrap()
        )
        .unwrap(),
        fixture["proof_script"].as_str().unwrap().as_bytes()
    );
    for case in fixture["services"].as_array().unwrap() {
        assert_eq!(
            service_script(&case["descriptor"], fixture["nonce"].as_str().unwrap()).unwrap(),
            case["script"].as_str().unwrap().as_bytes()
        );
        let mut bad = case["descriptor"].clone();
        bad["setup_stage"] = json!("/tmp/x;reboot");
        assert!(service_script(&bad, fixture["nonce"].as_str().unwrap()).is_err());
    }
    let expected: BTreeMap<_, _> = upstream::HASHES.into_iter().collect();
    assert_eq!(json!(expected), fixture["upstream_hashes"]);
}
#[test]
fn fresh_pairing_has_a_matching_rsa_key_certificate_pin_and_private_unencrypted_pfx() {
    let first = pairing(&"1".repeat(32)).unwrap();
    let second = pairing(&"1".repeat(32)).unwrap();
    assert_ne!(first["token"], second["token"]);
    assert!(hex(first["token"].as_str().unwrap(), 64));
    let pfx = STANDARD
        .decode(first["server_pfx"].as_str().unwrap())
        .unwrap();
    let decoded = Pkcs12::from_der(&pfx).unwrap().parse2("").unwrap();
    let cert = decoded.cert.unwrap();
    let key = decoded.pkey.unwrap();
    assert!(cert.public_key().unwrap().public_eq(&key));
    assert_eq!(key.rsa().unwrap().size(), 256);
    assert_eq!(
        sha256_hex(&cert.to_der().unwrap()),
        first["certificate_sha256"]
    );
    assert!(cert.verify(&key).unwrap());
    assert!(crate::services::root_transfer::identity(
        &pfx,
        first["certificate_sha256"].as_str().unwrap()
    )
    .is_ok());
}
#[test]
fn helper_package_has_only_expected_signed_files_and_uses_the_original_profile() {
    let dir = tempfile::tempdir().unwrap();
    let certs = dir.path().join("certs");
    profile(&certs);
    let path = dir.path().join("helper.tpk");
    let mut receipt = crate::services::root_pairing::tests::document();
    receipt["installation_id"] = json!("1".repeat(32));
    let runtime = runtime();
    let upstream = upstream();
    let config = build(&path, &receipt, &runtime, &upstream, &certs).unwrap();
    check_package(&path, &config, &runtime, &upstream).unwrap();
    assert_eq!(config["app_id"], HELPER_APP_ID);
    assert!(config.get("token").is_none() && config.get("server_pfx").is_none());
    let mut archive = zip::ZipArchive::new(File::open(path).unwrap()).unwrap();
    assert_eq!(archive.len(), 20);
    assert!(archive.by_name("author-signature.xml").is_ok());
    assert!(archive.by_name("signature1.xml").is_ok());
}
#[test]
fn signed_bootstrap_archive_verifies_and_contains_only_the_fixed_launch_script() {
    let script = b"#!/bin/sh\nprintf 'synthetic'\n";
    let (archive, signature, public) = crypto::signed_archive(script).unwrap();
    let key = PKey::public_key_from_pem(&public).unwrap();
    let mut verifier = Verifier::new(MessageDigest::sha256(), &key).unwrap();
    verifier.set_rsa_padding(Padding::PKCS1).unwrap();
    assert!(verifier.verify_oneshot(&signature, &archive).unwrap());
    let decoded = flate2::read::GzDecoder::new(archive.as_slice());
    let mut tar = tar::Archive::new(decoded);
    let mut entries = tar.entries().unwrap();
    let mut entry = entries.next().unwrap().unwrap();
    assert_eq!(entry.path().unwrap(), Path::new("launch.sh"));
    assert_eq!(entry.header().mode().unwrap(), 0o600);
    let mut data = Vec::new();
    entry.read_to_end(&mut data).unwrap();
    assert_eq!(data, script);
    assert!(entries.next().is_none());
}

#[test]
fn bootstrap_manifest_round_trips_with_its_complete_file_inventory() {
    let receipt = crate::services::root_pairing::tests::document();
    let bundle = setup_bundle(
        &receipt,
        &runtime(),
        &upstream(),
        "/home/owner/share/tmp/sdk_tools/arsetup-aaaaaaaaaaaaaaaa",
        "upgrade",
    )
    .unwrap();
    let manifest_file = bundle
        .files
        .iter()
        .find(|file| file.name == "probe.json")
        .unwrap();
    let manifest: Value = serde_json::from_slice(&manifest_file.bytes).unwrap();
    assert_eq!(manifest, bundle.manifest);
    assert_eq!(manifest["service"]["operation"], "upgrade");
    assert_eq!(
        manifest["files"].as_object().unwrap().len(),
        bundle.files.len() - 1
    );
    for file in bundle.files.iter().filter(|file| file.name != "probe.json") {
        assert_eq!(
            manifest["files"][&file.name]["sha256"],
            sha256_hex(&file.bytes)
        );
        assert_eq!(manifest["files"][&file.name]["size"], file.bytes.len());
    }
}

#[test]
fn configuration_bytes_match_the_cli_digest_and_keep_the_same_order_in_private_receipts() {
    let fixture: Value =
        serde_json::from_str(include_str!("../../../../tests/fixtures/root-package.json")).unwrap();
    let receipt = crate::services::root_pairing::tests::document();
    let configuration = public_config(&receipt, &runtime());
    assert_eq!(configuration, fixture["configuration"]);
    assert_eq!(
        config_bytes(&configuration).unwrap(),
        fixture["configuration_json"].as_str().unwrap().as_bytes()
    );
}
