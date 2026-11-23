fn main() {
    // Match the CLI's root runtime version without requiring Python for Cargo tests.
    let metadata = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../cli/src/aerotizen/__init__.py");
    println!("cargo:rerun-if-changed={}", metadata.display());
    let source = std::fs::read_to_string(metadata).expect("could not read the CLI version");
    let version = source
        .lines()
        .find_map(|line| {
            line.strip_prefix("__version__ = ")
                .and_then(|value| value.strip_prefix('"'))
                .and_then(|value| value.strip_suffix('"'))
        })
        .expect("the CLI must declare its root runtime version");
    assert!(
        version.split('.').count() == 3
            && version
                .split('.')
                .all(|part| !part.is_empty() && part.bytes().all(|byte| byte.is_ascii_digit())),
        "invalid root runtime version"
    );
    println!("cargo:rustc-env=ROOT_RUNTIME_VERSION={version}");
    let target = std::env::var("TARGET").expect("Cargo must provide a target");
    let suffix = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    println!("cargo:rustc-env=WORKER_FILENAME=aerotizen-worker-{target}{suffix}");
    // Tauri enables bundled-worker for app builds; Cargo tests need no generated artifacts.
    let attributes =
        tauri_build::Attributes::new().config_path(if cfg!(feature = "bundled-worker") {
            "tauri.conf.json"
        } else {
            "tests/tauri.conf.json"
        });
    tauri_build::try_build(attributes).expect("could not prepare the desktop build");
}
