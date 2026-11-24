use super::{failed, CreatedProfile};
use crate::models::AppResult;
use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use openssl::{
    asn1::Asn1Type,
    hash::MessageDigest,
    nid::Nid,
    pkcs12::Pkcs12,
    pkey::{PKey, Private},
    rsa::Rsa,
    stack::Stack,
    x509::{extension::SubjectAlternativeName, X509NameBuilder, X509Req, X509},
};

const RSA_BITS: u32 = 2048;
const PASSWORD_BYTES: usize = 18;
const PKCS12_ITERATIONS: u32 = 20_000;
const MAX_EMAIL_BYTES: usize = 256;

// No Debug/Serialize: this owner contains the private signing key and password.
pub(super) struct Material {
    key: PKey<Private>,
    password: String,
    pub author_csr: Vec<u8>,
    pub distributor_csr: Vec<u8>,
}

fn csr(
    key: &PKey<Private>,
    common_name: &str,
    email: Option<&str>,
    duid: Option<&str>,
) -> Result<Vec<u8>, openssl::error::ErrorStack> {
    let mut name = X509NameBuilder::new()?;
    name.append_entry_by_nid(Nid::COMMONNAME, common_name)?;
    if let Some(email) = email {
        // The existing CLI allows an empty optional email; MBSTRING validation does not.
        name.append_entry_by_nid_with_type(Nid::PKCS9_EMAILADDRESS, email, Asn1Type::IA5STRING)?;
    }
    let mut request = X509Req::builder()?;
    request.set_version(0)?;
    request.set_subject_name(&name.build())?;
    request.set_pubkey(key)?;
    if let Some(duid) = duid {
        let san = SubjectAlternativeName::new()
            .uri("URN:tizen:packageid=")
            .uri(&format!("URN:tizen:deviceid={duid}"))
            .build(&request.x509v3_context(None))?;
        let mut extensions = Stack::new()?;
        extensions.push(san)?;
        request.add_extensions(&extensions)?;
    }
    request.sign(key, MessageDigest::sha256())?;
    request.build().to_pem()
}

pub(super) fn material(duid: &str, email: &str) -> AppResult<Material> {
    if !email.is_ascii() || email.len() > MAX_EMAIL_BYTES {
        return Err(failed());
    }
    let create = || -> Result<Material, openssl::error::ErrorStack> {
        let key = PKey::from_rsa(Rsa::generate(RSA_BITS)?)?;
        let mut password = [0; PASSWORD_BYTES];
        getrandom::fill(&mut password).map_err(|_| openssl::error::ErrorStack::get())?;
        let author_csr = csr(&key, "aerotizen", None, None)?;
        let distributor_csr = csr(&key, "TizenSDK", Some(email), Some(duid))?;
        Ok(Material {
            key,
            password: URL_SAFE_NO_PAD.encode(password),
            author_csr,
            distributor_csr,
        })
    };
    create().map_err(|_| failed())
}

pub(super) fn certificate(bytes: &[u8]) -> Result<X509, openssl::error::ErrorStack> {
    X509::from_pem(bytes).or_else(|_| X509::from_der(bytes))
}

fn archive(material: &Material, role: &str, leaf: &[u8], ca: &[u8]) -> AppResult<Vec<u8>> {
    let build = || -> Result<Vec<u8>, openssl::error::ErrorStack> {
        let cert = certificate(leaf)?;
        let ca = certificate(ca)?;
        let issuer_key = ca.public_key()?;
        if !cert.public_key()?.public_eq(&material.key) || !cert.verify(&issuer_key)? {
            return Err(openssl::error::ErrorStack::get());
        }
        let mut chain = Stack::new()?;
        chain.push(ca)?;
        let mut builder = Pkcs12::builder();
        builder
            .name(role)
            .pkey(&material.key)
            .cert(&cert)
            .ca(chain)
            .key_algorithm(Nid::AES_256_CBC)
            .cert_algorithm(Nid::AES_256_CBC)
            .key_iter(PKCS12_ITERATIONS)
            .mac_md(MessageDigest::sha256());
        builder.build2(&material.password)?.to_der()
    };
    build().map_err(|_| failed())
}

pub(super) fn package(
    material: Material,
    author: Vec<u8>,
    distributor: Vec<u8>,
    profile_xml: Vec<u8>,
    author_ca: Vec<u8>,
    distributor_ca: Vec<u8>,
) -> AppResult<CreatedProfile> {
    let author = archive(&material, "author", &author, &author_ca)?;
    let distributor = archive(&material, "distributor", &distributor, &distributor_ca)?;
    Ok(CreatedProfile {
        author,
        distributor,
        password: material.password,
        profile_xml,
    })
}
