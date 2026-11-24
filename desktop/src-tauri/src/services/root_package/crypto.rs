use super::*;
use flate2::{Compression, GzBuilder};
use openssl::{
    asn1::Asn1Time,
    bn::{BigNum, MsbOption},
    hash::MessageDigest,
    nid::Nid,
    pkcs12::Pkcs12,
    pkey::PKey,
    rsa::{Padding, Rsa},
    sign::{Signer, Verifier},
    x509::{extension::BasicConstraints, X509NameBuilder, X509},
};
use std::{
    io::Cursor,
    time::{SystemTime, UNIX_EPOCH},
};
const RSA_BITS: u32 = 2048;
const DAY_SECONDS: u64 = 24 * 60 * 60;
const CERTIFICATE_DAYS: u64 = 3650;
const SERIAL_BITS: i32 = 159;
fn certificate(installation: &str) -> AppResult<(PKey<openssl::pkey::Private>, X509)> {
    if !hex(installation, 32) {
        return Err(failed());
    }
    let key =
        PKey::from_rsa(Rsa::generate(RSA_BITS).map_err(|_| failed())?).map_err(|_| failed())?;
    let mut name = X509NameBuilder::new().map_err(|_| failed())?;
    name.append_entry_by_nid(Nid::COMMONNAME, &format!("AeroTizen {installation}"))
        .map_err(|_| failed())?;
    let name = name.build();
    let mut serial = BigNum::new().map_err(|_| failed())?;
    serial
        .rand(SERIAL_BITS, MsbOption::MAYBE_ZERO, false)
        .map_err(|_| failed())?;
    let serial = serial.to_asn1_integer().map_err(|_| failed())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|_| failed())?
        .as_secs();
    let before =
        Asn1Time::from_unix(now.saturating_sub(DAY_SECONDS) as i64).map_err(|_| failed())?;
    let after =
        Asn1Time::from_unix((now + CERTIFICATE_DAYS * DAY_SECONDS) as i64).map_err(|_| failed())?;
    let mut cert = X509::builder().map_err(|_| failed())?;
    cert.set_version(2).map_err(|_| failed())?;
    cert.set_serial_number(&serial).map_err(|_| failed())?;
    cert.set_subject_name(&name).map_err(|_| failed())?;
    cert.set_issuer_name(&name).map_err(|_| failed())?;
    cert.set_pubkey(&key).map_err(|_| failed())?;
    cert.set_not_before(&before).map_err(|_| failed())?;
    cert.set_not_after(&after).map_err(|_| failed())?;
    cert.append_extension(
        BasicConstraints::new()
            .critical()
            .build()
            .map_err(|_| failed())?,
    )
    .map_err(|_| failed())?;
    cert.sign(&key, MessageDigest::sha256())
        .map_err(|_| failed())?;
    Ok((key, cert.build()))
}
pub(super) fn pairing(installation: &str) -> AppResult<Value> {
    let (key, certificate) = certificate(installation)?;
    let mut builder = Pkcs12::builder();
    builder.name("AeroTizen").pkey(&key).cert(&certificate);
    // Root pairing files use an unencrypted PFX, as in the existing TV/CLI format.
    builder
        .key_algorithm(Nid::from_raw(-1))
        .cert_algorithm(Nid::from_raw(-1));
    let pfx = builder
        .build2("")
        .map_err(|_| failed())?
        .to_der()
        .map_err(|_| failed())?;
    Ok(
        json!({"token":random_hex(32)?,"certificate_sha256":sha256_hex(&certificate.to_der().map_err(|_|failed())?),"server_pfx":STANDARD.encode(pfx)}),
    )
}
pub(super) fn signed_archive(script: &[u8]) -> AppResult<(Vec<u8>, Vec<u8>, Vec<u8>)> {
    let encoder = GzBuilder::new()
        .mtime(0)
        .write(Vec::new(), Compression::best());
    let mut archive = tar::Builder::new(encoder);
    let mut header = tar::Header::new_ustar();
    header.set_mode(0o600);
    header.set_uid(0);
    header.set_gid(0);
    header.set_mtime(0);
    header.set_size(script.len() as u64);
    header.set_path("launch.sh").map_err(|_| failed())?;
    header.set_cksum();
    archive
        .append(&header, Cursor::new(script))
        .map_err(|_| failed())?;
    let data = archive
        .into_inner()
        .map_err(|_| failed())?
        .finish()
        .map_err(|_| failed())?;
    let key =
        PKey::from_rsa(Rsa::generate(RSA_BITS).map_err(|_| failed())?).map_err(|_| failed())?;
    let mut signer = Signer::new(MessageDigest::sha256(), &key).map_err(|_| failed())?;
    signer
        .set_rsa_padding(Padding::PKCS1)
        .map_err(|_| failed())?;
    let signature = signer.sign_oneshot_to_vec(&data).map_err(|_| failed())?;
    let mut verifier = Verifier::new(MessageDigest::sha256(), &key).map_err(|_| failed())?;
    verifier
        .set_rsa_padding(Padding::PKCS1)
        .map_err(|_| failed())?;
    if !verifier
        .verify_oneshot(&signature, &data)
        .map_err(|_| failed())?
    {
        return Err(failed());
    }
    Ok((
        data,
        signature,
        key.public_key_to_pem().map_err(|_| failed())?,
    ))
}
