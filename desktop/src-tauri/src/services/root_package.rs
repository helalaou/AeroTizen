//! Build the existing dedicated Root helper and its fixed, signed bootstrap data.
mod crypto;
mod upstream;
use super::{
    digest::sha256_hex, helper_payloads::RootRuntime, root_bridge::HELPER_APP_ID,
    root_pairing::PAIRING_VERSION, sdk::PayloadFile,
};
use crate::models::{AppError, AppResult};
use base64::{engine::general_purpose::STANDARD, Engine};
use serde_json::{json, Value};
use std::{
    collections::BTreeMap,
    fs::File,
    io::{Read, Write},
    path::Path,
};
pub(super) use upstream::{load as upstream_files, Upstream};
use zip::write::SimpleFileOptions;
const MAX_PACKAGE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_MEMBER_BYTES: u64 = 1024 * 1024;
pub(super) const BRIDGE_PORT: u16 = 26104;
pub(super) const STAGING_DIRECTORY: &str = "/home/owner/share/tmp/sdk_tools";
fn failed() -> AppError {
    AppError::new("root_setup_failed","Could not prepare verified Root helper files. Check the desktop app version and original signing certificates.")
}
pub(super) fn random_hex(length: usize) -> AppResult<String> {
    let mut bytes = vec![0; length];
    getrandom::fill(&mut bytes).map_err(|_| failed())?;
    Ok(bytes.iter().map(|byte| format!("{byte:02x}")).collect())
}
fn hex(value: &str, length: usize) -> bool {
    value.len() == length
        && value
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte))
}
pub(super) fn pairing(installation: &str) -> AppResult<Value> {
    crypto::pairing(installation)
}
pub(super) fn public_config(receipt: &Value, runtime: &RootRuntime) -> Value {
    let files: BTreeMap<_, _> = runtime
        .files
        .iter()
        .map(|file| (file.name.clone(), sha256_hex(&file.bytes)))
        .collect();
    json!({"schema_version":1,"app_id":HELPER_APP_ID,"version":PAIRING_VERSION,"installation_id":receipt["installation_id"],"device_identity_sha256":receipt["device_identity_sha256"],"duid_sha256":receipt["duid_sha256"],"baseline_boot_id":receipt["baseline_boot_id"],"bridge_port":receipt["bridge_port"],"certificate_sha256":receipt["certificate_sha256"],"files":files})
}
// This field order is part of the TV's configuration digest and the CLI recovery format.
const CONFIGURATION_FIELDS: [&str; 10] = [
    "schema_version",
    "app_id",
    "version",
    "installation_id",
    "device_identity_sha256",
    "duid_sha256",
    "baseline_boot_id",
    "bridge_port",
    "certificate_sha256",
    "files",
];
pub(super) struct Configuration<'a>(pub &'a Value);
impl serde::Serialize for Configuration<'_> {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        use serde::ser::{Error, SerializeMap};
        let document = self
            .0
            .as_object()
            .ok_or_else(|| S::Error::custom("invalid Root configuration"))?;
        if document
            .keys()
            .any(|key| !CONFIGURATION_FIELDS.contains(&key.as_str()))
        {
            return Err(S::Error::custom("unsupported Root configuration"));
        }
        let mut result = serializer.serialize_map(Some(document.len()))?;
        for key in CONFIGURATION_FIELDS {
            if let Some(value) = document.get(key) {
                result.serialize_entry(key, value)?;
            }
        }
        result.end()
    }
}
pub(super) fn config_bytes(config: &Value) -> AppResult<Vec<u8>> {
    let mut bytes = serde_json::to_vec_pretty(&Configuration(config)).map_err(|_| failed())?;
    bytes.push(b'\n');
    Ok(bytes)
}
pub(super) fn build(
    output: &Path,
    receipt: &Value,
    runtime: &RootRuntime,
    upstream: &Upstream,
    certificates: &Path,
) -> AppResult<Value> {
    let config = public_config(receipt, runtime);
    let directory =
        tempfile::tempdir_in(output.parent().ok_or_else(failed)?).map_err(|_| failed())?;
    let unsigned = directory.path().join("helper.zip");
    let signed = directory.path().join("helper.tpk");
    let mut files: BTreeMap<String, Vec<u8>> = runtime
        .files
        .iter()
        .map(|file| (file.name.clone(), file.bytes.clone()))
        .collect();
    for file in &upstream.files {
        files.insert(format!("res/payload/{}", file.name), file.bytes.clone());
    }
    files.insert("tizen-manifest.xml".into(), runtime.manifest.clone());
    files.insert("shared/res/root-helper.png".into(), runtime.icon.clone());
    files.insert("bin/root.json".into(), config_bytes(&config)?);
    let mut archive = zip::ZipWriter::new(File::create(&unsigned).map_err(|_| failed())?);
    for (name, bytes) in files {
        if bytes.len() as u64 > MAX_MEMBER_BYTES {
            return Err(failed());
        }
        archive
            .start_file(
                name,
                SimpleFileOptions::default().compression_method(zip::CompressionMethod::Deflated),
            )
            .map_err(|_| failed())?;
        archive.write_all(&bytes).map_err(|_| failed())?;
    }
    archive.finish().map_err(|_| failed())?;
    super::widget_signer::sign_archive(&unsigned, &signed, certificates)?;
    check_package(&signed, &config, runtime, upstream)?;
    std::fs::rename(&signed, output).map_err(|_| failed())?;
    Ok(config)
}
fn check_package(
    path: &Path,
    config: &Value,
    runtime: &RootRuntime,
    upstream: &Upstream,
) -> AppResult<()> {
    if std::fs::metadata(path).map_err(|_| failed())?.len() > MAX_PACKAGE_BYTES {
        return Err(failed());
    }
    let mut archive =
        zip::ZipArchive::new(File::open(path).map_err(|_| failed())?).map_err(|_| failed())?;
    let expected = runtime.files.len() + upstream.files.len() + 5;
    if archive.len() != expected || archive.has_duplicate_names() {
        return Err(failed());
    }
    let mut expected_files: BTreeMap<String, Vec<u8>> = runtime
        .files
        .iter()
        .map(|file| (file.name.clone(), file.bytes.clone()))
        .collect();
    for file in &upstream.files {
        expected_files.insert(format!("res/payload/{}", file.name), file.bytes.clone());
    }
    expected_files.insert("tizen-manifest.xml".into(), runtime.manifest.clone());
    expected_files.insert("shared/res/root-helper.png".into(), runtime.icon.clone());
    expected_files.insert("bin/root.json".into(), config_bytes(config)?);
    for name in ["author-signature.xml", "signature1.xml"] {
        let mut entry = archive.by_name(name).map_err(|_| failed())?;
        if entry.size() == 0 || entry.size() > MAX_MEMBER_BYTES {
            return Err(failed());
        }
        std::io::copy(&mut entry, &mut std::io::sink()).map_err(|_| failed())?;
    }
    for (name, expected) in expected_files {
        let entry = archive.by_name(&name).map_err(|_| failed())?;
        if entry.size() > MAX_MEMBER_BYTES {
            return Err(failed());
        }
        let mut actual = Vec::new();
        entry
            .take(MAX_MEMBER_BYTES + 1)
            .read_to_end(&mut actual)
            .map_err(|_| failed())?;
        if actual != expected {
            return Err(failed());
        }
    }
    Ok(())
}
pub(super) struct Bundle {
    pub files: Vec<PayloadFile>,
    pub manifest: Value,
}
pub(super) fn setup_bundle(
    receipt: &Value,
    runtime: &RootRuntime,
    upstream: &Upstream,
    stage: &str,
    operation: &str,
) -> AppResult<Bundle> {
    let package = format!("archive-root-{}", random_hex(8)?);
    let nonce = random_hex(16)?;
    let bridge: BTreeMap<_, _> = runtime
        .flat_group("bin/AeroTizenRootBridge")
        .iter()
        .map(|file| (file.name.clone(), sha256_hex(&file.bytes)))
        .collect();
    let descriptor = json!({"operation":operation,"installation_id":receipt["installation_id"],"setup_stage":stage,"files":bridge});
    let mut script = proof_script(&package, &nonce)?;
    script.extend(service_script(&descriptor, &nonce)?);
    let (archive, signature, public) = crypto::signed_archive(&script)?;
    let mut files = upstream.files.clone();
    files.extend(runtime.flat_group("res/runner/"));
    files.extend([
        PayloadFile {
            name: "passwd".into(),
            bytes: b"owner:x:0:0:owner:/home/owner:/bin/sh\n".to_vec(),
        },
        PayloadFile {
            name: "public.pem".into(),
            bytes: public,
        },
        PayloadFile {
            name: format!("{package}.tar.gz"),
            bytes: archive,
        },
        PayloadFile {
            name: format!("{package}.tar.gz.signature"),
            bytes: signature,
        },
    ]);
    let hashes: BTreeMap<_, _> = files
        .iter()
        .map(|file| {
            (
                file.name.clone(),
                json!({"sha256":sha256_hex(&file.bytes),"size":file.bytes.len()}),
            )
        })
        .collect();
    let manifest = json!({"schema_version":1,"upstream_version":"0.0.12","runtime":"6.0","package":package,"nonce":nonce,"service":descriptor,"files":hashes});
    let mut manifest_bytes = serde_json::to_vec_pretty(&manifest).map_err(|_| failed())?;
    manifest_bytes.push(b'\n');
    files.push(PayloadFile {
        name: "probe.json".into(),
        bytes: manifest_bytes,
    });
    Ok(Bundle { files, manifest })
}
fn proof_script(package: &str, nonce: &str) -> AppResult<Vec<u8>> {
    if !package
        .strip_prefix("archive-root-")
        .is_some_and(|value| hex(value, 16))
        || !hex(nonce, 32)
    {
        return Err(failed());
    }
    let hash = upstream::DLL_SHA256;
    Ok(format!(r#"#!/bin/sh
set -eu
umask 077
test "$(id -u)" = 0
test "$(id -ru)" = 0
test "$(id -g)" = 0
boot=$(cat /proc/sys/kernel/random/boot_id)
case "$boot" in *[!a-f0-9-]*|'') exit 80;; esac
proofdir={STAGING_DIRECTORY}/aerotizen-probe-proof-{nonce}
test ! -e "$proofdir"
test ! -L "$proofdir"
mkdir -m 755 "$proofdir"
chsmack -a _ "$proofdir"
cd "$proofdir"
proof=proof.json
test ! -e "$proof.new"
test ! -L "$proof.new"
set -C
printf '{{"schema_version":1,"uid":0,"euid":0,"gid":0,"boot_id":"%s","nonce":"{nonce}","payload_sha256":"{hash}"}}\n' "$boot" > "$proof.new"
set +C
chmod 444 "$proof.new"
chsmack -a _ "$proof.new"
mv -f "$proof.new" "$proof"
"#).into_bytes())
}
fn service_script(descriptor: &Value, nonce: &str) -> AppResult<Vec<u8>> {
    let installation = descriptor["installation_id"].as_str().ok_or_else(failed)?;
    let operation = descriptor["operation"].as_str().ok_or_else(failed)?;
    let stage = descriptor["setup_stage"].as_str().ok_or_else(failed)?;
    if descriptor.as_object().is_none_or(|value| value.len() != 4)
        || !hex(installation, 32)
        || !hex(nonce, 32)
        || !stage
            .strip_prefix(&format!("{STAGING_DIRECTORY}/arsetup-"))
            .is_some_and(|value| hex(value, 16))
        || !matches!(operation, "install" | "upgrade")
        || descriptor["files"]
            .as_object()
            .is_none_or(|files| files.len() != 3)
    {
        return Err(failed());
    }
    let mut script = String::new();
    for name in [
        "AeroTizenRootBridge.dll",
        "AeroTizenRootBridge.runtimeconfig.json",
        "AeroTizenRootBridge.deps.json",
    ] {
        let hash = descriptor["files"][name]
            .as_str()
            .filter(|value| hex(value, 64))
            .ok_or_else(failed)?;
        let path = format!("/opt/usr/apps/{HELPER_APP_ID}/bin/{name}");
        script.push_str(&format!("test ! -L '{path}'\nprintf '%s  %s\\n' '{hash}' '{path}' | sha256sum -c - >/dev/null\n"));
    }
    script.push_str(&format!("exec /usr/bin/dotnet '/opt/usr/apps/{HELPER_APP_ID}/bin/AeroTizenRootBridge.dll' {} '{stage}' '{installation}' '{nonce}'\n",if operation=="install" {"--install"} else {"--repair-startup"}));
    Ok(script.into_bytes())
}
#[cfg(test)]
mod tests;
