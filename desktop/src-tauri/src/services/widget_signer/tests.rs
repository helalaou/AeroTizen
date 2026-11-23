use super::*;
use openssl::{asn1::Asn1Time, nid::Nid, rsa::Rsa, sign::Verifier, x509::X509NameBuilder};
use serde_json::Value;

fn fixture() -> Value {
    serde_json::from_str(include_str!(
        "../../../../tests/fixtures/widget-signatures.json"
    ))
    .unwrap()
}
pub(crate) fn profile(path: &Path) -> X509 {
    std::fs::create_dir_all(path).unwrap();
    let key = PKey::from_rsa(Rsa::generate(2048).unwrap()).unwrap();
    let mut name = X509NameBuilder::new().unwrap();
    name.append_entry_by_nid(Nid::COMMONNAME, "Synthetic signing test")
        .unwrap();
    let name = name.build();
    let mut cert = X509::builder().unwrap();
    cert.set_version(2).unwrap();
    cert.set_subject_name(&name).unwrap();
    cert.set_issuer_name(&name).unwrap();
    cert.set_pubkey(&key).unwrap();
    cert.set_not_before(&Asn1Time::days_from_now(0).unwrap())
        .unwrap();
    cert.set_not_after(&Asn1Time::days_from_now(1).unwrap())
        .unwrap();
    cert.sign(&key, MessageDigest::sha256()).unwrap();
    let cert = cert.build();
    let mut builder = Pkcs12::builder();
    builder.pkey(&key).cert(&cert).name("synthetic");
    let p12 = builder.build2("test password").unwrap().to_der().unwrap();
    for name in ["author.p12", "distributor.p12"] {
        std::fs::write(path.join(name), &p12).unwrap();
    }
    std::fs::write(path.join("password.txt"), "test password\n").unwrap();
    std::fs::write(
        path.join("device-profile.xml"),
        "<profile>synthetic</profile>",
    )
    .unwrap();
    cert
}
#[test]
fn canonical_xml_matches_both_cli_roles_and_uri_escaping() {
    let fixture = fixture();
    let refs: Vec<_> = fixture["files"]
        .as_array()
        .unwrap()
        .iter()
        .map(|file| Reference {
            name: file["name"].as_str().unwrap().into(),
            digest: digest(&crate::services::sdb::tests::bytes(
                file["data_hex"].as_str().unwrap(),
            )),
        })
        .collect();
    for case in fixture["cases"].as_array().unwrap() {
        for namespace in [true, false] {
            let id = case["role"].as_str().unwrap();
            let key = namespace.to_string();
            assert_eq!(
                properties(id, namespace),
                case["properties"][&key].as_str().unwrap()
            );
            assert_eq!(
                digest(properties(id, true).as_bytes()),
                case["property_digest"].as_str().unwrap()
            );
            assert_eq!(
                signed_info(&refs, case["property_digest"].as_str().unwrap(), namespace),
                case["signed_info"][&key].as_str().unwrap()
            );
        }
    }
}
#[test]
fn signed_widget_preserves_files_replaces_signatures_and_verifies_against_cli_canonical_bytes() {
    let dir = tempfile::tempdir().unwrap();
    let cert = profile(&dir.path().join("certs"));
    let source = dir.path().join("source.wgt");
    let destination = dir.path().join("signed.wgt");
    let fixture = fixture();
    let mut zip = zip::ZipWriter::new(File::create(&source).unwrap());
    for file in fixture["files"].as_array().unwrap() {
        zip.start_file(file["name"].as_str().unwrap(), SimpleFileOptions::default())
            .unwrap();
        zip.write_all(&crate::services::sdb::tests::bytes(
            file["data_hex"].as_str().unwrap(),
        ))
        .unwrap();
    }
    for name in [AUTHOR_FILE, DISTRIBUTOR_FILE, "nested/old-signature1.xml"] {
        zip.start_file(name, SimpleFileOptions::default()).unwrap();
        zip.write_all(b"obsolete").unwrap();
    }
    zip.finish().unwrap();
    sign(&source, &destination, &dir.path().join("certs")).unwrap();
    let mut zip = zip::ZipArchive::new(File::open(&destination).unwrap()).unwrap();
    assert_eq!(zip.len(), 5);
    let mut xml = String::new();
    zip.by_name(AUTHOR_FILE)
        .unwrap()
        .read_to_string(&mut xml)
        .unwrap();
    let document = roxmltree::Document::parse(&xml).unwrap();
    let value = document
        .descendants()
        .find(|n| n.has_tag_name((DSIG, "SignatureValue")))
        .unwrap()
        .text()
        .unwrap();
    let public = cert.public_key().unwrap();
    let mut verifier = Verifier::new(MessageDigest::sha512(), &public).unwrap();
    verifier.set_rsa_padding(Padding::PKCS1).unwrap();
    assert!(verifier
        .verify_oneshot(
            &STANDARD.decode(value).unwrap(),
            fixture["cases"][0]["signed_info"]["true"]
                .as_str()
                .unwrap()
                .as_bytes()
        )
        .unwrap());
    for file in fixture["files"].as_array().unwrap() {
        let mut actual = Vec::new();
        zip.by_name(file["name"].as_str().unwrap())
            .unwrap()
            .read_to_end(&mut actual)
            .unwrap();
        assert_eq!(
            actual,
            crate::services::sdb::tests::bytes(file["data_hex"].as_str().unwrap())
        );
    }
    std::fs::write(dir.path().join("certs/password.txt"), "wrong").unwrap();
    assert_eq!(
        sign(&source, &destination, &dir.path().join("certs"))
            .unwrap_err()
            .code,
        "install_failed"
    );
}
#[test]
fn bundled_legacy_provider_reads_rc2_tizen_studio_profiles() {
    legacy_provider().unwrap();
    let dir = tempfile::tempdir().unwrap();
    let cert = profile(dir.path());
    let decoded = Pkcs12::from_der(&std::fs::read(dir.path().join("author.p12")).unwrap())
        .unwrap()
        .parse2("test password")
        .unwrap();
    let mut builder = Pkcs12::builder();
    builder
        .pkey(&decoded.pkey.unwrap())
        .cert(&cert)
        .cert_algorithm(Nid::PBE_WITHSHA1AND40BITRC2_CBC);
    let legacy = builder.build2("old password").unwrap().to_der().unwrap();
    std::fs::write(dir.path().join("legacy.p12"), legacy).unwrap();
    assert!(credentials(&dir.path().join("legacy.p12"), "old password").is_ok());
}
