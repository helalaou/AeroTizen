fn main() {
    let target = std::env::var("TARGET").expect("Cargo must provide a target");
    let suffix = if target.contains("windows") {
        ".exe"
    } else {
        ""
    };
    println!("cargo:rustc-env=WORKER_FILENAME=aerotizen-worker-{target}{suffix}");
    tauri_build::build();
}
