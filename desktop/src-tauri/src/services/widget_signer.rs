//! The CLI's canonical W3C widget signature format, without a Python runtime.
use crate::models::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine};
use openssl::{
    hash::MessageDigest,
    pkcs12::Pkcs12,
    pkey::{Id, PKey, Private},
    provider::Provider,
    rsa::Padding,
    sign::Signer,
    x509::X509,
};
use sha2::{Digest, Sha512};
use std::{
    fs::File,
    io::{Read, Write},
    path::{Path, PathBuf},
    sync::OnceLock,
};
use zip::write::SimpleFileOptions;

const DSIG: &str = "http://www.w3.org/2000/09/xmldsig#";
const DSP: &str = "http://www.w3.org/2009/xmldsig-properties";
const AUTHOR_FILE: &str = "author-signature.xml";
const DISTRIBUTOR_FILE: &str = "signature1.xml";
const MAX_P12_BYTES: u64 = 1024 * 1024;
const MAX_PASSWORD_BYTES: u64 = 4096;
const MAX_SIGNATURE_BYTES: usize = 4 * 1024 * 1024;
const BUFFER_BYTES: usize = 64 * 1024;
const CERTIFICATE_LINE_CHARACTERS: usize = 76;

struct Credentials {
    key: PKey<Private>,
    chain: Vec<X509>,
}
struct Reference {
    name: String,
    digest: String,
}

fn failed() -> AppError {
    AppError::new("install_failed","Could not sign the app with this TV's saved certificates. Use its original signing profile.")
}
fn bytes(path: &Path, limit: u64) -> AppResult<Vec<u8>> {
    let file = File::open(path).map_err(|_| failed())?;
    let metadata = file.metadata().map_err(|_| failed())?;
    if !metadata.is_file() || metadata.len() > limit {
        return Err(failed());
    }
    let mut bytes = Vec::new();
    file.take(limit + 1)
        .read_to_end(&mut bytes)
        .map_err(|_| failed())?;
    if bytes.len() as u64 > limit {
        return Err(failed());
    }
    Ok(bytes)
}
fn legacy_provider() -> AppResult<()> {
    static PROVIDERS: OnceLock<Result<(Provider, Provider), ()>> = OnceLock::new();
    PROVIDERS
        .get_or_init(|| {
            Ok((
                Provider::load(None, "default").map_err(|_| ())?,
                Provider::load(None, "legacy").map_err(|_| ())?,
            ))
        })
        .as_ref()
        .map(|_| ())
        .map_err(|_| failed())
}
fn credentials(path: &Path, password: &str) -> AppResult<Credentials> {
    let archive = Pkcs12::from_der(&bytes(path, MAX_P12_BYTES)?).map_err(|_| failed())?;
    let decoded = match archive.parse2(password) {
        Ok(decoded) => decoded,
        Err(_) => {
            legacy_provider()?;
            archive.parse2(password).map_err(|_| failed())?
        }
    };
    let key = decoded.pkey.ok_or_else(failed)?;
    let certificate = decoded.cert.ok_or_else(failed)?;
    if key.id() != Id::RSA
        || !certificate
            .public_key()
            .map_err(|_| failed())?
            .public_eq(&key)
    {
        return Err(failed());
    }
    let mut chain = vec![certificate];
    if let Some(extra) = decoded.ca {
        for certificate in extra {
            if certificate.subject_name().to_der().map_err(|_| failed())?
                != certificate.issuer_name().to_der().map_err(|_| failed())?
            {
                chain.push(certificate);
            }
        }
    }
    Ok(Credentials { key, chain })
}
fn b64(bytes: &[u8]) -> String {
    STANDARD.encode(bytes)
}
fn digest(bytes: &[u8]) -> String {
    b64(&Sha512::digest(bytes))
}
fn uri(name: &str) -> String {
    let mut encoded = String::new();
    for byte in name.bytes() {
        if byte.is_ascii_alphanumeric() || b"/_.-~".contains(&byte) {
            encoded.push(byte as char);
        } else {
            use std::fmt::Write;
            write!(encoded, "%{byte:02X}").expect("writing a String");
        }
    }
    encoded
}
fn properties(id: &str, namespace: bool) -> String {
    let role = if id == "AuthorSignature" {
        "author"
    } else {
        "distributor"
    };
    let ns = if namespace {
        format!(" xmlns=\"{DSIG}\"")
    } else {
        String::new()
    };
    let property = |key: &str, name: &str, value: Option<String>| {
        let attribute = value
            .map(|value| format!(" URI=\"{value}\""))
            .unwrap_or_default();
        format!("<SignatureProperty Id=\"{key}\" Target=\"#{id}\"><dsp:{name}{attribute}></dsp:{name}></SignatureProperty>")
    };
    format!("<Object{ns} Id=\"prop\"><SignatureProperties xmlns:dsp=\"{DSP}\">{}{}{}</SignatureProperties></Object>",
        property("profile","Profile",Some("http://www.w3.org/ns/widgets-digsig#profile".into())),
        property("role","Role",Some(format!("http://www.w3.org/ns/widgets-digsig#role-{role}"))),property("identifier","Identifier",None))
}
fn signed_info(files: &[Reference], property_digest: &str, namespace: bool) -> String {
    let ns = if namespace {
        format!(" xmlns=\"{DSIG}\"")
    } else {
        String::new()
    };
    let references:String=files.iter().map(|file|format!("<Reference URI=\"{}\"><DigestMethod Algorithm=\"http://www.w3.org/2001/04/xmlenc#sha512\"></DigestMethod><DigestValue>{}</DigestValue></Reference>",uri(&file.name),file.digest)).collect();
    format!("<SignedInfo{ns}><CanonicalizationMethod Algorithm=\"http://www.w3.org/2001/10/xml-exc-c14n#\"></CanonicalizationMethod><SignatureMethod Algorithm=\"http://www.w3.org/2001/04/xmldsig-more#rsa-sha512\"></SignatureMethod>{references}<Reference URI=\"#prop\"><Transforms><Transform Algorithm=\"http://www.w3.org/2006/12/xml-c14n11\"></Transform></Transforms><DigestMethod Algorithm=\"http://www.w3.org/2001/04/xmlenc#sha512\"></DigestMethod><DigestValue>{property_digest}</DigestValue></Reference></SignedInfo>")
}
fn signature(id: &str, files: &[Reference], credentials: &Credentials) -> AppResult<Vec<u8>> {
    let property_digest = digest(properties(id, true).as_bytes());
    let info = signed_info(files, &property_digest, true);
    let mut signer =
        Signer::new(MessageDigest::sha512(), &credentials.key).map_err(|_| failed())?;
    signer
        .set_rsa_padding(Padding::PKCS1)
        .map_err(|_| failed())?;
    let signature = signer
        .sign_oneshot_to_vec(info.as_bytes())
        .map_err(|_| failed())?;
    let mut certificates = String::new();
    for certificate in &credentials.chain {
        let encoded = b64(&certificate.to_der().map_err(|_| failed())?);
        let wrapped = encoded
            .as_bytes()
            .chunks(CERTIFICATE_LINE_CHARACTERS)
            .map(|part| std::str::from_utf8(part).unwrap())
            .collect::<Vec<_>>()
            .join("\n");
        certificates.push_str(&format!("<X509Certificate>\n{wrapped}\n</X509Certificate>"));
    }
    let document=format!("<Signature xmlns=\"{DSIG}\" Id=\"{id}\">{}<SignatureValue>{}</SignatureValue><KeyInfo><X509Data>{certificates}</X509Data></KeyInfo>{}</Signature>",signed_info(files,&property_digest,false),b64(&signature),properties(id,false));
    if document.len() > MAX_SIGNATURE_BYTES {
        return Err(failed());
    }
    Ok(document.into_bytes())
}
fn is_signature(name: &str) -> bool {
    let lower = name.to_lowercase();
    lower.ends_with(AUTHOR_FILE) || lower.ends_with(DISTRIBUTOR_FILE)
}

pub(super) fn sign(source: &Path, destination: &Path, profile: &Path) -> AppResult<PathBuf> {
    // Metadata/archive validation must precede signing; no archive entry is extracted to disk.
    super::local_widget::validate(source)?;
    let password = String::from_utf8(bytes(&profile.join("password.txt"), MAX_PASSWORD_BYTES)?)
        .map_err(|_| failed())?;
    let password = password.trim_matches(super::text::python_whitespace);
    let author = credentials(&profile.join("author.p12"), password)?;
    let distributor = credentials(&profile.join("distributor.p12"), password)?;
    let mut archive =
        zip::ZipArchive::new(File::open(source).map_err(|_| failed())?).map_err(|_| failed())?;
    let mut references = Vec::new();
    let mut total = 0_u64;
    let mut buffer = vec![0; BUFFER_BYTES];
    for index in 0..archive.len() {
        let mut entry = archive.by_index(index).map_err(|_| failed())?;
        let name = entry.name().map_err(|_| failed())?.into_owned();
        if entry.is_dir() || is_signature(&name) {
            continue;
        }
        let mut hash = Sha512::new();
        loop {
            let count = entry.read(&mut buffer).map_err(|_| failed())?;
            if count == 0 {
                break;
            }
            total += count as u64;
            if total > super::local_widget::MAX_UNPACKED_BYTES {
                return Err(failed());
            }
            hash.update(&buffer[..count]);
        }
        references.push(Reference {
            name,
            digest: b64(&hash.finalize()),
        });
    }
    references.sort_by(|left, right| left.name.cmp(&right.name));
    let author_xml = signature("AuthorSignature", &references, &author)?;
    let mut distributor_references = vec![Reference {
        name: AUTHOR_FILE.into(),
        digest: digest(&author_xml),
    }];
    distributor_references.extend(references.iter().map(|file| Reference {
        name: file.name.clone(),
        digest: file.digest.clone(),
    }));
    let distributor_xml = signature(
        "DistributorSignature",
        &distributor_references,
        &distributor,
    )?;
    let mut output = zip::ZipWriter::new(File::create(destination).map_err(|_| failed())?);
    let options = SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated);
    for (name, bytes) in [
        (AUTHOR_FILE, author_xml),
        (DISTRIBUTOR_FILE, distributor_xml),
    ] {
        output.start_file(name, options).map_err(|_| failed())?;
        output.write_all(&bytes).map_err(|_| failed())?;
    }
    for file in references {
        let mut entry = archive.by_name(&file.name).map_err(|_| failed())?;
        output
            .start_file(file.name, options)
            .map_err(|_| failed())?;
        std::io::copy(&mut entry, &mut output).map_err(|_| failed())?;
    }
    output.finish().map_err(|_| failed())?;
    if std::fs::metadata(destination).map_err(|_| failed())?.len()
        > super::local_widget::MAX_WIDGET_BYTES
    {
        return Err(failed());
    }
    Ok(destination.into())
}

#[cfg(test)]
pub(crate) mod tests;
