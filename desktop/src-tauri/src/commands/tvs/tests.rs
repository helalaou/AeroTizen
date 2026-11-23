use crate::{commands, models::VerifiedTv, services::profiles::Profiles, state::AppState};
use serde_json::{json, Value};
use tauri::test::{
    get_ipc_response, mock_builder, mock_context, noop_assets, MockRuntime, INVOKE_KEY,
};
use tauri::{
    ipc::{CallbackFn, InvokeBody},
    webview::InvokeRequest,
};

struct Fixture {
    window: tauri::WebviewWindow<MockRuntime>,
    _app: tauri::App<MockRuntime>,
    _directory: tempfile::TempDir,
}

impl Fixture {
    fn new() -> Self {
        let directory = tempfile::tempdir().unwrap();
        let profiles = Profiles::new(directory.path().join("profiles.sqlite3")).unwrap();
        let tv: VerifiedTv =
            serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap();
        tauri::async_runtime::block_on(profiles.save(tv)).unwrap();
        let app = commands::register(mock_builder())
            .manage(AppState {
                profiles,
                home_backups: crate::services::home_backups::HomeBackups::new(
                    directory.path().join("cli-state"),
                ),
                worker_path: directory.path().join("no-worker-in-unit-tests"),
                operation: Default::default(),
                cancelled_tv_read: tokio::sync::watch::Sender::new(String::new()),
                samsung: Default::default(),
                local_apps: Default::default(),
            })
            .build(mock_context(noop_assets()))
            .unwrap();
        let window = tauri::WebviewWindowBuilder::new(&app, "main", Default::default())
            .build()
            .unwrap();
        Self {
            window,
            _app: app,
            _directory: directory,
        }
    }

    fn invoke(&self, command: &str, arguments: Value) -> Result<Value, Value> {
        get_ipc_response(
            &self.window,
            InvokeRequest {
                cmd: command.into(),
                callback: CallbackFn(0),
                error: CallbackFn(1),
                url: if cfg!(windows) {
                    "http://tauri.localhost"
                } else {
                    "tauri://localhost"
                }
                .parse()
                .unwrap(),
                body: InvokeBody::Json(arguments),
                headers: Default::default(),
                invoke_key: INVOKE_KEY.into(),
            },
        )
        .map(|body| body.deserialize().unwrap())
    }
}

#[test]
fn registered_profile_commands_preserve_saved_tv_and_error_shapes() {
    let fixture = Fixture::new();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    assert_eq!(saved.as_array().unwrap().len(), 1);
    let id = saved[0]["id"].as_str().unwrap();
    assert_eq!(saved[0]["host"], "192.0.2.20");
    assert_eq!(saved[0]["identity_sha256"], id);
    assert_eq!(
        fixture.invoke("rename_tv", json!({"id": id, "name": "\n"})),
        Err(json!({
            "code": "invalid_name", "message": "Use a TV name with 1 to 80 characters."
        }))
    );
    assert_eq!(
        fixture
            .invoke("rename_tv", json!({"id": id, "name": "Lounge"}))
            .unwrap(),
        Value::Null
    );
    assert_eq!(
        fixture.invoke("list_tvs", json!({})).unwrap()[0]["name"],
        "Lounge"
    );
    assert_eq!(
        fixture.invoke("forget_tv", json!({"id": id})).unwrap(),
        Value::Null
    );
    assert_eq!(fixture.invoke("list_tvs", json!({})).unwrap(), json!([]));
}

#[test]
fn connect_uses_the_frontend_profile_id_argument_before_starting_a_worker() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture.invoke(
            "connect_tv",
            json!({
                "host": "192.0.2.20", "profileId": "missing-profile"
            })
        ),
        Err(json!({
            "code": "profile_missing", "message": "This saved TV is no longer available."
        }))
    );
}

#[test]
fn home_backup_review_reads_cli_state_without_a_worker() {
    let fixture = Fixture::new();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    let id = saved[0]["id"].as_str().unwrap();
    let path = fixture
        ._directory
        .path()
        .join("cli-state")
        .join("backups")
        .join(id)
        .join("original-home.json");
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(
        &path,
        include_str!("../../../../tests/fixtures/home-backup.json"),
    )
    .unwrap();
    let settings = fixture
        .invoke(
            "read_home_backup",
            json!({"id": id, "capturedAt": "2026-11-16T10:00:00.123456+00:00"}),
        )
        .unwrap();
    assert_eq!(
        settings,
        json!({
            "home_button_app": "com.samsung.tv.csfs",
            "home_app": "com.samsung.tv.csfs",
            "startup_app": "org.tizen.tv-viewer",
            "startup_backup_app": "org.tizen.tv-viewer",
            "first_screen": "com.samsung.tv.csfs",
            "smart_hub_autostart": false,
        })
    );
    assert_eq!(
        fixture.invoke("read_home_backup", json!({"id": id, "capturedAt": "stale"})),
        Err(json!({
            "code": "backup_changed", "message": "The backup changed. Refresh the TV connection to review it."
        }))
    );
    assert_eq!(
        fixture.invoke(
            "read_home_backup",
            json!({"id": "missing", "capturedAt": "stale"})
        ),
        Err(json!({
            "code": "profile_missing", "message": "This saved TV is no longer available."
        }))
    );
}

#[test]
fn registered_samsung_commands_keep_cancellation_and_account_shapes_without_a_worker() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .invoke("cancel_samsung_sign_in", json!({"requestId": "cancelled"}))
            .unwrap(),
        Value::Null
    );
    assert_eq!(
        fixture.invoke("samsung_sign_in", json!({"requestId": "cancelled"})),
        Err(json!({"code": "sign_in_cancelled", "message": "Samsung sign-in cancelled."}))
    );
    assert_eq!(
        fixture.invoke("samsung_account", json!({})).unwrap(),
        Value::Null
    );
    assert_eq!(
        fixture.invoke("samsung_sign_out", json!({})).unwrap(),
        Value::Null
    );
}
