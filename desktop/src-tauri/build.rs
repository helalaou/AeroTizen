fn main() {
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
