use crate::{commands, models::VerifiedTv, state::AppState};
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
        let state = AppState::for_test(directory.path());
        let tv: VerifiedTv =
            serde_json::from_str(include_str!("../../models/fixtures/verified-tv.json")).unwrap();
        tauri::async_runtime::block_on(state.profiles.save(tv)).unwrap();
        let app = commands::register(mock_builder())
            .manage(state)
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
fn connect_uses_the_frontend_profile_id_and_native_address_validation() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture
            .invoke("connect_tv", json!({"host":"tv.local","profileId":null}))
            .unwrap_err()["code"],
        "invalid_address"
    );
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

#[test]
fn root_status_and_cancellation_keep_the_registered_contract_without_a_worker() {
    let fixture = Fixture::new();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    let id = saved[0]["id"].as_str().unwrap();
    let result = fixture
        .invoke(
            "root_access_status",
            json!({"id": id, "requestId": "root-read"}),
        )
        .unwrap();
    assert_eq!(
        result,
        json!({
            "phase": "not_configured", "root_available": false, "setup_complete": false,
            "runtime_version": null, "target_runtime_version": env!("ROOT_RUNTIME_VERSION"),
            "update_available": false, "update_pending": false, "automatic_startup": null,
            "automatic_boot_verified": false, "bootstrap_completed": false,
            "recovery_saved": false, "original_pc_host": null,
        })
    );
    fixture
        .invoke("cancel_tv_read", json!({"requestId": "cancelled"}))
        .unwrap();
    assert_eq!(
        fixture.invoke(
            "root_access_status",
            json!({"id": id, "requestId": "cancelled"})
        ),
        Err(json!({"code": "tv_read_cancelled", "message": "TV refresh cancelled."}))
    );
}

#[test]
fn button_reads_preserve_the_registered_contract_without_a_worker() {
    let fixture = Fixture::new();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    let id = saved[0]["id"].as_str().unwrap();
    assert_eq!(
        fixture
            .invoke(
                "list_tv_buttons",
                json!({"id":id,"requestId":"buttons-read"})
            )
            .unwrap(),
        json!({"status":"pairing_required"})
    );
    fixture
        .invoke("cancel_tv_read", json!({"requestId":"cancelled-buttons"}))
        .unwrap();
    assert_eq!(
        fixture.invoke(
            "list_tv_buttons",
            json!({"id":id,"requestId":"cancelled-buttons"})
        ),
        Err(json!({"code":"tv_read_cancelled","message":"TV refresh cancelled."}))
    );
}

#[test]
fn button_edits_use_the_registered_native_command_without_a_worker_and_keep_busy_guard() {
    use tauri::Manager;
    let fixture = Fixture::new();
    let state = fixture._app.state::<AppState>();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    let args = json!({"id":saved[0]["id"],"change":{"button":"Netflix","mode":"disabled"}});
    let guard = tauri::async_runtime::block_on(state.operation.lock());
    assert_eq!(
        fixture
            .invoke("change_tv_button", args.clone())
            .unwrap_err()["code"],
        "operation_busy"
    );
    drop(guard);
    assert_eq!(
        fixture.invoke("change_tv_button", args).unwrap_err(),
        json!({"code":"pairing_required","message":"Complete root access setup and verify the connection before changing buttons."})
    );
}

#[test]
fn app_removal_uses_native_validation_without_a_worker_and_preserves_the_busy_guard() {
    use tauri::Manager;
    let fixture = Fixture::new();
    let state = fixture._app.state::<AppState>();
    let saved = fixture.invoke("list_tvs", json!({})).unwrap();
    let args = json!({"id":saved[0]["id"],"packages":[]});
    let guard = tauri::async_runtime::block_on(state.operation.lock());
    assert_eq!(
        fixture.invoke("remove_tv_apps", args.clone()).unwrap_err()["code"],
        "operation_busy"
    );
    drop(guard);
    assert_eq!(
        fixture.invoke("remove_tv_apps", args).unwrap_err()["code"],
        "invalid_request"
    );
}

#[test]
fn backend_version_is_available_through_registered_ipc_without_external_tools_or_a_tv() {
    let fixture = Fixture::new();
    assert_eq!(
        fixture.invoke("backend_status", json!({})).unwrap(),
        json!({"version":env!("ROOT_RUNTIME_VERSION")})
    );
}
