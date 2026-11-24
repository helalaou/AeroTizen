// Enable bundled legacy PKCS#12 ciphers for imported Tizen Studio profiles.
use openssl_src as _;
use std::{fs, path::Path};

fn main() {
    let crate_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    let metadata = crate_dir.join("../package.json");
    println!("cargo:rerun-if-changed={}", metadata.display());
    let package: serde_json::Value =
        serde_json::from_slice(&fs::read(metadata).expect("could not read desktop package.json"))
            .expect("invalid desktop package.json");
    let version = env!("CARGO_PKG_VERSION");
    assert_eq!(
        package["version"].as_str(),
        Some(version),
        "desktop package.json and Cargo.toml versions must match"
    );
    assert!(
        version.split('.').count() == 3
            && version
                .split('.')
                .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())),
        "invalid root runtime version"
    );
    println!("cargo:rustc-env=ROOT_RUNTIME_VERSION={version}");
    let out =
        std::path::PathBuf::from(std::env::var_os("OUT_DIR").expect("Cargo must provide OUT_DIR"));
    let shared_helpers = crate_dir.join("../../cli/src/aerotizen/helpers");
    for source in [
        shared_helpers.join("home-query.json"),
        shared_helpers.join("home-control.json"),
        crate_dir.join("generated/root-runtime.json"),
    ] {
        println!("cargo:rerun-if-changed={}", source.display());
        let target = out.join(source.file_name().unwrap());
        if cfg!(feature = "desktop-app") {
            fs::copy(&source, target)
                .expect("build the desktop helper payloads before compiling the app");
        } else {
            fs::write(target, b"{}").expect("could not prepare test payload metadata");
        }
    }
    // App builds embed managed device payloads; bare unit tests use no generated files.
    let attributes = tauri_build::Attributes::new().config_path(if cfg!(feature = "desktop-app") {
        "tauri.conf.json"
    } else {
        "tests/tauri.conf.json"
    });
    tauri_build::try_build(attributes).expect("could not prepare the desktop build");
}
