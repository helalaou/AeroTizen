import hashlib
import json
import subprocess
import sys
import zipfile
from contextlib import nullcontext
from types import SimpleNamespace

import pytest

from aerotizen import desktop_worker as worker
from aerotizen import diagnostics, signer
from aerotizen.device import DeviceSession


def request(operation, **params):
    return {"protocol": 1, "id": "test-request", "operation": operation, "params": params}


@pytest.fixture
def connected_tv(monkeypatch, fake_tv, tmp_path):
    tv = fake_tv(
        {
            "0 getduid": "test-duid\n",
            "0 vd_applist": "app_id=DclHome001.Home app_version=3.0.0",
            "capability:": "platform_version: 9.0.0\ncpu_arch: armv7\nsdk_toolpath: /private/path\n",
        }
    )
    monkeypatch.setattr(
        worker.remote, "info", lambda _: {"name": "Living room", "modelName": "Frame", "model": "24_PTM"}
    )
    monkeypatch.setattr(worker.remote, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(DeviceSession, "tcp_request", lambda *_args, **_kwargs: b"")
    monkeypatch.setattr(
        worker,
        "DeviceSession",
        lambda host: DeviceSession(host, port=tv.port, direct=True, lock_dir=tmp_path / "locks"),
    )
    return tv


def test_connection_uses_real_sdb_and_returns_only_hashed_identity(connected_tv):
    reply = worker.handle(request("connect", host="127.0.0.1"))
    assert reply["id"] == "test-request"
    result = reply["result"]
    assert result["identity_sha256"] == hashlib.sha256(b"test-duid").hexdigest()
    assert result["name"] == "Living room"
    assert result["launcher_version"] == "3.0.0"
    assert result["launcher_signing_ready"] is False
    assert result["transport"] == "developer"
    assert result["home_backup"] == {"status": "missing"}
    assert result["home_routing_mode"] is None
    assert result["native_home_settings"] is None
    assert result["technical_details"] == {
        "model_code": None,
        "tizen_version": "9.0.0",
        "architecture": "armv7",
        "platform": "24_PTM",
        "root_runtime_version": None,
    }
    assert "test-duid" not in json.dumps(reply)
    assert "/private/path" not in json.dumps(reply)


@pytest.mark.parametrize(
    ("app_id", "mode", "expected"),
    [
        ("DclHome001.Home", "native", "native"),
        ("DclHome001.Home", "unknown", None),
        ("OtherApp.Home", "native", None),
    ],
)
def test_connect_reads_only_aerotizen_routing_mode(connected_tv, monkeypatch, app_id, mode, expected):
    body = json.dumps(
        {"homeControl": {"protocol": 1, "app_id": app_id, "mode": mode, "transaction": "private"}}
    )

    def watcher_request(_session, port, request, **_kwargs):
        assert port == diagnostics.HOME_WATCHER_PORT
        assert request.startswith(b"GET / HTTP/1.0\r\n")
        return b"HTTP/1.0 200 OK\r\nContent-Type: application/json\r\n\r\n" + body.encode()

    monkeypatch.setattr(DeviceSession, "tcp_request", watcher_request)
    result = worker.handle(request("connect", host="127.0.0.1"))["result"]
    assert result["home_routing_mode"] == expected
    assert "transaction" not in json.dumps(result)


def test_connect_returns_only_typed_home_settings_from_the_paired_helper(connected_tv, monkeypatch):
    monkeypatch.setattr(
        DeviceSession,
        "read_root_home_status",
        lambda _: {
            "home_button_app": "DclHome001.Home",
            "home_app": "com.samsung.tv.csfs",
            "startup_app": "",
            "startup_backup_app": "invalid app id",
            "smart_hub_autostart": False,
            "unknown": "private",
        },
    )
    result = worker.handle(request("connect", host="127.0.0.1"))["result"]["native_home_settings"]
    assert result == {
        "home_button_app": "DclHome001.Home",
        "home_app": "com.samsung.tv.csfs",
        "startup_app": "",
        "startup_backup_app": None,
        "smart_hub_autostart": False,
    }


@pytest.mark.parametrize("matches_tv", [True, False])
def test_connection_reports_only_original_backup_status_and_capture_time(connected_tv, tmp_path, matches_tv):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    backup = tmp_path / "backups" / identity / "original-home.json"
    backup.parent.mkdir(parents=True)
    captured_at = "2026-11-16T10:00:00+00:00"
    document = {
        "schema_version": 1,
        "kind": "aerotizen.home-baseline",
        "captured_at": captured_at,
        "device": {
            "identity_sha256": identity if matches_tv else "1" * 64,
            "model": "Frame",
            "firmware_build": "test",
        },
        "home": {
            "operation": worker.home.OPERATION,
            "default_app": "stock-home",
            "settings": {
                key: {"type": kind, "value": "stock-home" if kind == "string" else 0}
                for key, kind in worker.home.SETTINGS.items()
            },
        },
        "evidence": {
            "access": "sdk_uid_901",
            "uid": 901,
            "authenticated": True,
            "query_staging_cleaned": True,
            "sdk_staging_cleaned": True,
            "helper_sha256": "0" * 64,
        },
    }
    backup.write_text(json.dumps(document))
    reply = worker.handle(request("connect", host="127.0.0.1"))
    expected = {"status": "saved", "captured_at": captured_at} if matches_tv else {"status": "unreadable"}
    assert reply["result"]["home_backup"] == expected
    assert str(backup) not in json.dumps(reply)
    saved = worker.handle(request("read_home_backup", expected_identity=identity, captured_at=captured_at))
    if matches_tv:
        assert saved["result"] == {
            "home_button_app": "stock-home",
            "home_app": "stock-home",
            "startup_app": "stock-home",
            "startup_backup_app": "stock-home",
            "first_screen": "stock-home",
            "smart_hub_autostart": False,
        }
        changed = worker.handle(request("read_home_backup", expected_identity=identity, captured_at="stale"))
        assert changed["error"]["code"] == "backup_changed"
    else:
        assert saved["error"]["code"] == "backup_unreadable"


def _write_backup(tmp_path, identity, captured_at):
    backup = tmp_path / "backups" / identity / "original-home.json"
    backup.parent.mkdir(parents=True)
    backup.write_text(
        json.dumps(
            {
                "schema_version": 1,
                "kind": "aerotizen.home-baseline",
                "captured_at": captured_at,
                "device": {"identity_sha256": identity, "model": "Frame", "firmware_build": "test"},
                "home": {
                    "operation": worker.home.OPERATION,
                    "default_app": "stock-home",
                    "settings": {
                        key: {"type": kind, "value": "stock-home" if kind == "string" else 0}
                        for key, kind in worker.home.SETTINGS.items()
                    },
                },
                "evidence": {
                    "access": "sdk_uid_901",
                    "uid": 901,
                    "authenticated": True,
                    "query_staging_cleaned": True,
                    "sdk_staging_cleaned": True,
                    "helper_sha256": "0" * 64,
                },
            }
        )
    )
    return backup


@pytest.fixture
def paired_home_backup(monkeypatch, tmp_path):
    duid = "test-duid"
    identity = hashlib.sha256(duid.encode()).hexdigest()
    settings = {
        "home_button_app": "com.samsung.tv.csfs",
        "home_app": "com.samsung.tv.csfs",
        "startup_app": "org.tizen.tv-viewer",
        "startup_backup_app": "org.tizen.tv-viewer",
        "first_screen": "com.samsung.tv.csfs",
        "smart_hub_autostart": False,
        "firmware_build": "test-firmware",
        "helper_sha256": "a" * 64,
    }
    session = SimpleNamespace(duid=lambda: duid, managed_root=True, read_root_home_status=lambda: settings)
    monkeypatch.setattr(worker, "DeviceSession", lambda _host: nullcontext(session))
    monkeypatch.setattr(worker.remote, "info", lambda _host: {"modelName": "Frame"})
    monkeypatch.setattr(worker.remote, "CONFIG_DIR", tmp_path)
    return session, settings, identity


def test_prepare_native_home_saves_once_and_reuses_original(paired_home_backup, tmp_path):
    session, settings, identity = paired_home_backup
    prepare = request("prepare_native_home", host="127.0.0.1", expected_identity=identity)
    result = worker.handle(prepare)["result"]
    backup = tmp_path / "backups" / identity / "original-home.json"
    original = backup.read_bytes()
    document = json.loads(original)
    assert result == {
        "id": identity,
        "captured_at": document["captured_at"],
        "backup_sha256": hashlib.sha256(original).hexdigest(),
    }
    assert document["device"]["firmware_build"] == settings["firmware_build"]
    assert document["evidence"] == {
        "access": "paired_helper",
        "uid": 0,
        "authenticated": True,
        "helper_sha256": settings["helper_sha256"],
    }
    review = worker.handle(
        request("read_home_backup", expected_identity=identity, captured_at=result["captured_at"])
    )
    assert review["result"] == {
        field: value
        for field, value in settings.items()
        if field
        in (
            "home_button_app",
            "home_app",
            "startup_app",
            "startup_backup_app",
            "first_screen",
            "smart_hub_autostart",
        )
    }

    session.read_root_home_status = lambda: pytest.fail(
        "The existing backup must be reused without a settings read"
    )
    assert worker.handle(prepare)["result"] == result
    assert backup.read_bytes() == original


@pytest.mark.parametrize(
    ("field", "changed_value", "message"),
    [
        ("first_screen", None, "could not verify every original"),
        ("firmware_build", None, "Updating the paired TV helper is required"),
        ("startup_backup_app", "DclHome001.Home", "before opening AeroTizen"),
    ],
)
def test_prepare_native_home_rejects_unverified_settings(
    paired_home_backup, tmp_path, field, changed_value, message
):
    _, settings, identity = paired_home_backup
    settings[field] = changed_value
    reply = worker.handle(request("prepare_native_home", host="127.0.0.1", expected_identity=identity))
    assert reply["error"]["code"] == "backup_unavailable"
    assert message in reply["error"]["message"]
    assert not (tmp_path / "backups" / identity / "original-home.json").exists()


def test_prepare_native_home_does_not_replace_an_invalid_backup(paired_home_backup, tmp_path):
    session, _, identity = paired_home_backup
    backup = _write_backup(tmp_path, identity, "2026-11-16T10:00:00+00:00")
    backup.write_text("unreadable backup")
    session.read_root_home_status = lambda: pytest.fail("An invalid existing backup must not be recaptured")
    reply = worker.handle(request("prepare_native_home", host="127.0.0.1", expected_identity=identity))
    assert reply["error"]["code"] == "backup_unavailable"
    assert backup.read_text() == "unreadable backup"


def test_restore_home_backup_calls_change_and_returns_profile(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    captured_at = "2026-11-16T10:00:00+00:00"
    _write_backup(tmp_path, identity, captured_at)
    calls = []
    monkeypatch.setattr(
        worker.home_control,
        "change",
        lambda session, info, action, **kwargs: calls.append((action, kwargs)),
    )
    reply = worker.handle(
        request("restore_home_backup", host="127.0.0.1", expected_identity=identity, captured_at=captured_at)
    )
    assert calls == [("restore", {"state_dir": tmp_path})]
    assert reply["result"]["identity_sha256"] == identity

    stale = worker.handle(
        request("restore_home_backup", host="127.0.0.1", expected_identity=identity, captured_at="stale")
    )
    assert stale["error"]["code"] == "backup_changed"
    assert calls == [("restore", {"state_dir": tmp_path})]


def test_restore_home_backup_reports_the_native_home_error(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    captured_at = "2026-11-16T10:00:00+00:00"
    _write_backup(tmp_path, identity, captured_at)

    def fail(*_args, **_kwargs):
        raise worker.home.HomeError("Autostart changed and the matching boot receipt is unavailable.")

    monkeypatch.setattr(worker.home_control, "change", fail)
    reply = worker.handle(
        request("restore_home_backup", host="127.0.0.1", expected_identity=identity, captured_at=captured_at)
    )
    assert reply["error"] == {
        "code": "restore_failed",
        "message": "Autostart changed and the matching boot receipt is unavailable.",
    }


def test_apply_native_home_calls_change_and_returns_profile(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    backup = _write_backup(tmp_path, identity, "2026-11-16T10:00:00+00:00")
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()
    calls = []
    monkeypatch.setattr(
        worker.home_control,
        "change",
        lambda session, info, action, **kwargs: calls.append((action, kwargs)),
    )
    reply = worker.handle(
        request("apply_native_home", host="127.0.0.1", expected_identity=identity, backup_sha256=digest)
    )
    assert calls == [("apply", {"state_dir": tmp_path})]
    assert reply["result"]["identity_sha256"] == identity

    stale = worker.handle(
        request("apply_native_home", host="127.0.0.1", expected_identity=identity, backup_sha256="f" * 64)
    )
    assert stale["error"]["code"] == "backup_changed"
    assert calls == [("apply", {"state_dir": tmp_path})]


def test_apply_native_home_reports_the_native_home_error(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    backup = _write_backup(tmp_path, identity, "2026-11-16T10:00:00+00:00")
    digest = hashlib.sha256(backup.read_bytes()).hexdigest()

    def fail(*_args, **_kwargs):
        raise worker.home.HomeError("AeroTizen is installed but its control service is unavailable.")

    monkeypatch.setattr(worker.home_control, "change", fail)
    reply = worker.handle(
        request("apply_native_home", host="127.0.0.1", expected_identity=identity, backup_sha256=digest)
    )
    assert reply["error"] == {
        "code": "apply_failed",
        "message": "AeroTizen is installed but its control service is unavailable.",
    }


def test_different_saved_identity_is_refused(connected_tv):
    reply = worker.handle(request("connect", host="127.0.0.1", expected_identity="0" * 64))
    assert reply["error"]["code"] == "identity_mismatch"
    assert "result" not in reply


def test_list_apps_groups_packages_and_preserves_protection(connected_tv, monkeypatch):
    connected_tv.replies["0 vd_applist"] = (
        "app_id=Abcdefghij.Player app_title=Player\n"
        "app_id=Abcdefghij.Home app_title=Launcher Companion\n"
        "app_id=DclHome001.Home app_title=AeroTizen\n"
        "app_id=KLMNOPQRST.Media app_title=Video &amp; Music\n"
    )
    monkeypatch.setattr(DeviceSession, "uninstall", lambda *_: pytest.fail("Unexpected uninstall"))
    identity = hashlib.sha256(b"test-duid").hexdigest()
    reply = worker.handle(request("list_apps", host="127.0.0.1", expected_identity=identity))
    assert all(worker.IDENTITY_PATTERN.fullmatch(row["revision"]) for row in reply["result"])
    assert [{key: value for key, value in row.items() if key != "revision"} for row in reply["result"]] == [
        {
            "id": "DclHome001",
            "name": "AeroTizen",
            "apps": ["AeroTizen"],
            "protected": True,
        },
        {
            "id": "Abcdefghij",
            "name": "Player",
            "apps": ["Player", "Launcher Companion"],
            "protected": True,
        },
        {
            "id": "KLMNOPQRST",
            "name": "Video & Music",
            "apps": ["Video & Music"],
            "protected": False,
        },
    ]
    assert connected_tv.uploads == {}
    assert "test-duid" not in json.dumps(reply)


def test_list_apps_checks_identity_before_reading_packages(connected_tv, monkeypatch):
    monkeypatch.setattr(DeviceSession, "applist", lambda *_: pytest.fail("Unexpected inventory read"))
    reply = worker.handle(request("list_apps", host="127.0.0.1", expected_identity="0" * 64))
    assert reply["error"]["code"] == "identity_mismatch"


@pytest.fixture
def removal_request(connected_tv):
    raw = (
        "apps count: 3\n"
        "app_id=DclHome001.Home app_title=AeroTizen\n"
        "app_id=Abcdefghij.Player app_title=Player\n"
        "app_id=KLMNOPQRST.Media app_title=Media\n"
    )
    connected_tv.replies["0 vd_applist"] = raw
    entries = {row["id"]: row["revision"] for row in worker.app_rows(worker.packages(raw))}
    return request(
        "remove_apps",
        host="127.0.0.1",
        expected_identity=hashlib.sha256(b"test-duid").hexdigest(),
        packages=[{"id": key, "revision": entries[key]} for key in ("Abcdefghij", "KLMNOPQRST")],
    )


@pytest.mark.parametrize(
    ("kind", "code"),
    [("identity", "identity_mismatch"), ("stale", "apps_changed"), ("protected", "protected_package")],
)
def test_remove_apps_validates_all_packages_before_uninstall(
    connected_tv, removal_request, monkeypatch, kind, code
):
    monkeypatch.setattr(DeviceSession, "uninstall", lambda *_: pytest.fail("Unexpected uninstall"))
    params = removal_request["params"]
    if kind == "identity":
        params["expected_identity"] = "0" * 64
    elif kind == "stale":
        params["packages"][1]["revision"] = "0" * 64
    else:
        launcher = worker.packages(connected_tv.replies["0 vd_applist"])["DclHome001"]
        params["packages"][1] = {"id": "DclHome001", "revision": worker.package_revision(launcher)}
    assert worker.handle(removal_request)["error"]["code"] == code


@pytest.mark.parametrize(
    ("lost_inventory", "reply", "expected"),
    [
        (True, "", None),
        (False, "uninstall Media\nCan not uninstall app\x00\nuninstall completed\n", {"status": "refused"}),
        (False, "uninstall completed\n", {"status": "still_installed"}),
        (
            False,
            "Uninstall failed (1009)\n",
            {"status": "still_installed", "detail": "Uninstall failed (1009)"},
        ),
    ],
)
def test_remove_apps_verifies_results_and_stops_when_inventory_is_unavailable(
    connected_tv, removal_request, monkeypatch, lost_inventory, reply, expected
):
    calls = []
    standard_uninstall = DeviceSession.uninstall
    connected_tv.replies["0 vd_appuninstall Abcdefghij.Player"] = "Can not uninstall app\n"
    connected_tv.replies["0 vd_appuninstall KLMNOPQRST.Media"] = reply

    def uninstall(session, app_id):
        calls.append(app_id)
        reply = standard_uninstall(session, app_id)
        if app_id == "Abcdefghij.Player":
            connected_tv.replies["0 vd_applist"] = (
                "apps count: 2\n"
                "app_id=DclHome001.Home app_title=AeroTizen\n"
                + ("" if lost_inventory else "app_id=KLMNOPQRST.Media app_title=Media\n")
            )
        return reply

    monkeypatch.setattr(DeviceSession, "uninstall", uninstall)
    result = worker.handle(removal_request)["result"]
    if lost_inventory:
        assert calls == ["Abcdefghij.Player"]
        assert result == {
            "apps": None,
            "results": [
                {"id": "Abcdefghij", "status": "unverified"},
                {"id": "KLMNOPQRST", "status": "not_attempted"},
            ],
        }
    else:
        assert calls == ["Abcdefghij.Player", "KLMNOPQRST.Media"]
        assert [item["id"] for item in result["apps"]] == ["DclHome001", "KLMNOPQRST"]
        assert result["results"] == [
            {"id": "Abcdefghij", "status": "removed"},
            {"id": "KLMNOPQRST", **expected},
        ]


@pytest.mark.parametrize("host", [True, 123, None, "tv.local", "0.0.0.0", "255.255.255.255", "224.0.0.1"])
def test_invalid_hosts_fail_before_network_access(monkeypatch, host):
    monkeypatch.setattr(worker.remote, "info", lambda _: pytest.fail("Unexpected network access"))
    assert worker.handle(request("connect", host=host))["error"]["code"] == "invalid_address"


@pytest.mark.parametrize("payload", [None, [], {"protocol": 1}, request("shell", command="anything")])
def test_invalid_or_unknown_operations_are_refused(payload):
    assert worker.handle(payload)["error"]["code"] == "invalid_request"


def test_optional_http_metadata_does_not_prevent_identity_check(connected_tv, monkeypatch):
    def offline(_):
        raise SystemExit("HTTP unavailable")

    monkeypatch.setattr(worker.remote, "info", offline)
    result = worker.handle(request("connect", host="127.0.0.1"))["result"]
    assert result["model"] == "Samsung TV"
    assert result["identity_sha256"] == hashlib.sha256(b"test-duid").hexdigest()


def test_protocol_keeps_stdout_machine_readable_and_rejects_oversized_input():
    for payload in ("not json\n", "x" * (worker.MAX_REQUEST_BYTES + 1)):
        process = subprocess.run(
            [sys.executable, "-m", "aerotizen.desktop_worker"],
            input=payload,
            capture_output=True,
            text=True,
            check=True,
            timeout=10,
        )
        assert json.loads(process.stdout)["error"]["code"] == "invalid_request"
        assert process.stderr == ""


@pytest.mark.parametrize(
    "operation", ["list_apps", "list_buttons", "list_button_apps", "samsung_sign_in", "root_status"]
)
def test_cancellable_tv_read_exits_when_its_input_pipe_closes(operation):
    # Keep the read blocked after it starts, as it can be while the TV is slow to respond.
    script = """
from threading import Event
from aerotizen import desktop_worker

def blocked_read(request):
    print("reading", flush=True)
    Event().wait()

desktop_worker.handle = blocked_read
desktop_worker.main()
"""
    with subprocess.Popen(
        [sys.executable, "-c", script], stdin=subprocess.PIPE, stdout=subprocess.PIPE, text=True
    ) as process:
        try:
            process.stdin.write(json.dumps({**request(operation), "cancellable": True}) + "\n")
            process.stdin.flush()
            assert process.stdout.readline().strip() == "reading"
            process.stdin.close()
            assert process.wait(timeout=5) == 0
        finally:
            if process.poll() is None:
                process.kill()


def test_handshake_does_not_open_a_connection(monkeypatch):
    monkeypatch.setattr(worker, "DeviceSession", lambda _: pytest.fail("Unexpected TV connection"))
    reply = worker.handle(request("handshake"))
    assert reply["result"]["name"] == worker.WORKER_NAME
    assert reply["result"]["operations"] == [
        "handshake",
        "samsung_sign_in",
        "prepare_signing_profile",
        "discover",
        "connect",
        "list_apps",
        "list_buttons",
        "list_button_apps",
        "change_button",
        "remove_apps",
        "launcher_catalog",
        "install_launcher",
        "inspect_local_app",
        "install_local_app",
        "root_status",
        "setup_root",
        "upgrade_root",
        "read_home_backup",
        "prepare_native_home",
        "apply_native_home",
        "restore_home_backup",
    ]


@pytest.mark.parametrize(
    ("scenario", "outcome", "requests"),
    [
        ("supported", "ready", ["status", "list"]),
        ("saved_only", "ready", ["status", "status"]),
        ("unpaired", "pairing_required", []),
        ("old_helper", "helper_update_required", ["status"]),
        ("different_tv", "identity_mismatch", []),
    ],
)
def test_list_buttons_reads_only_the_selected_tv(monkeypatch, scenario, outcome, requests):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    receipt = (
        None
        if scenario == "unpaired"
        else {
            "phase": "active",
            "duid_sha256": "0" * 64 if scenario == "different_tv" else identity,
        }
    )
    monkeypatch.setattr(worker.buttons.root_state, "find", lambda *_: receipt)
    monkeypatch.setattr(
        worker.buttons, "DeviceSession", lambda *_, **_kwargs: SimpleNamespace(ownership=nullcontext)
    )
    connected = SimpleNamespace(duid=lambda: "test-duid", applist=lambda: "app_id=test.Stremio name=Stremio")
    monkeypatch.setattr(worker, "DeviceSession", lambda *_, **_kwargs: nullcontext(connected))
    calls = []

    def bridge_request(operation="status", *, button_request=None):
        if operation == "status":
            calls.append(operation)
            return (
                {}
                if scenario == "old_helper"
                else {
                    "buttons_protocol": worker.buttons.PROTOCOL,
                    "buttons_discovery": scenario != "saved_only",
                }
            )
        assert operation == "buttons"
        assert button_request["apply"] is False
        calls.append(button_request["action"])
        return {
            "buttons": {
                "rules": [{"button": "Netflix", "mode": "app", "app_id": "test.Stremio", "active": True}],
                "discovered": [{"button": "Netflix"}, {"button": "Disney+"}]
                if scenario == "supported"
                else None,
            }
        }

    monkeypatch.setattr(
        worker.buttons, "BridgeClient", lambda *_args, **_kwargs: SimpleNamespace(request=bridge_request)
    )
    reply = worker.handle(request("list_buttons", host="127.0.0.1", expected_identity=identity))
    assert calls == requests
    if outcome == "identity_mismatch":
        assert reply["error"]["code"] == outcome
    else:
        assert reply["result"]["status"] == outcome
    if outcome == "ready":
        result = reply["result"]
        assert result["buttons"][-1] == {
            "button": "Netflix",
            "mode": "app",
            "app_id": "test.Stremio",
            "app_name": "Stremio",
            "active": True,
        }
        if scenario == "supported":
            assert result["buttons"][0]["mode"] == "default"
            assert len(result["buttons"]) == 2
            assert result["discovery_detail"] is None
        else:
            assert len(result["buttons"]) == 1
            assert "Update" in result["discovery_detail"]


def test_launcher_catalog_does_not_open_a_tv_connection(monkeypatch):
    monkeypatch.setattr(worker, "DeviceSession", lambda _: pytest.fail("Unexpected TV connection"))
    entries = [{"version": "3.2.0", "sections": []}]
    monkeypatch.setattr(worker.releases, "launcher_catalog", lambda: entries)
    assert worker.handle(request("launcher_catalog"))["result"] == entries


def test_certificate_setup_is_atomic_and_reuses_the_original(connected_tv, tmp_path, monkeypatch):
    connected_tv.allow_reconnect = True
    identity = hashlib.sha256(b"test-duid").hexdigest()
    auth = {"access_token": "private-token", "userId": "private-user"}
    created = []

    def create_profile(duid, output, *, auth):
        created.append((duid, auth))
        output.mkdir()
        for filename in worker.CERTIFICATE_FILES:
            (output / filename).write_text("original " + filename)

    monkeypatch.setattr(worker.certs, "create_profile", create_profile)
    params = {"host": "127.0.0.1", "expected_identity": identity}
    reply = worker.handle(request("prepare_signing_profile", **params, auth=auth))
    assert reply["result"] == {"identity_sha256": identity, "launcher_signing_ready": True}
    path = tmp_path / "certs" / "test-duid"
    files = {name: (path / name).read_bytes() for name in worker.CERTIFICATE_FILES}
    assert created == [("test-duid", auth)]
    assert worker.handle(request("prepare_signing_profile", **params)) == reply
    assert len(created) == 1
    assert {name: (path / name).read_bytes() for name in files} == files
    assert "private-token" not in json.dumps(reply)
    assert "private-user" not in json.dumps(reply)


def test_failed_certificate_setup_leaves_no_partial_profile(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()

    def interrupted(_duid, output, *, auth):
        output.mkdir()
        (output / "author.p12").write_text("partial certificate")
        raise SystemExit("The server returned private account information")

    monkeypatch.setattr(worker.certs, "create_profile", interrupted)
    reply = worker.handle(
        request(
            "prepare_signing_profile",
            host="127.0.0.1",
            expected_identity=identity,
            auth={"access_token": "private-token", "userId": "private-user"},
        )
    )
    assert reply["error"]["code"] == "certificates_failed"
    assert list((tmp_path / "certs").iterdir()) == []
    assert "private account" not in json.dumps(reply)


def test_certificate_setup_preserves_an_incomplete_existing_profile(connected_tv, tmp_path, monkeypatch):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    path = tmp_path / "certs" / "test-duid"
    path.mkdir(parents=True)
    original = path / "author.p12"
    original.write_text("original author")
    monkeypatch.setattr(
        worker.certs, "create_profile", lambda *_args, **_kwargs: pytest.fail("Replaced an original")
    )
    reply = worker.handle(
        request(
            "prepare_signing_profile",
            host="127.0.0.1",
            expected_identity=identity,
            auth={"access_token": "token", "userId": "user"},
        )
    )
    assert reply["error"]["code"] == "signing_profile_incomplete"
    assert original.read_text() == "original author"


@pytest.fixture
def install_request(monkeypatch):
    def download(destination, *, version):
        widget = destination / "launcher.wgt"
        with zipfile.ZipFile(widget, "w") as archive:
            archive.writestr(
                "config.xml",
                f'<widget xmlns:tizen="http://tizen.org/ns/widgets" version="{version}">'
                '<tizen:application id="DclHome001.Home"/></widget>',
            )
        return worker.releases.DownloadedLauncher(path=widget, version=version)

    monkeypatch.setattr(worker.releases, "download_launcher", download)
    return request(
        "install_launcher",
        host="127.0.0.1",
        expected_identity=hashlib.sha256(b"test-duid").hexdigest(),
        current_version="3.0.0",
        version="3.2.0",
        confirm_replace=False,
    )


def test_install_checks_the_signed_package_version_over_sdb(fake_tv, install_request, tmp_path, monkeypatch):
    replies = {
        "0 getduid": "test-duid",
        "0 vd_applist": "app_id=DclHome001.Home app_version=3.0.0",
        "capability:": "sdk_toolpath: /private/path\n",
        "0 vd_appinstall DclHome001.Home /private/path/DclHome001.wgt": (
            "app_id[DclHome001.Home] install completed"
        ),
    }
    tv_connections = []

    def connect(host):
        tv = fake_tv(replies)
        tv_connections.append(tv)
        return DeviceSession(host, port=tv.port, direct=True, lock_dir=tmp_path / "locks")

    monkeypatch.setattr(worker, "DeviceSession", connect)
    monkeypatch.setattr(worker.remote, "info", lambda _: {})
    monkeypatch.setattr(worker.remote, "CONFIG_DIR", tmp_path)
    profile = tmp_path / "certs" / "test-duid"
    profile.mkdir(parents=True)
    for name in worker.CERTIFICATE_FILES:
        (profile / name).write_bytes(b"test-file")
    reply = worker.handle(request("connect", host="127.0.0.1"))
    assert reply["result"]["launcher_signing_ready"] is True

    def sign(_source, destination, certificates):
        assert certificates == profile
        destination.write_bytes(b"signed test package")

    monkeypatch.setattr(signer, "sign_wgt", sign)
    real_install = DeviceSession.install
    installed_calls = []

    def install(session, app_id, data, tool_path):
        assert data == b"signed test package"
        installed_calls.append((app_id, tool_path))
        output = real_install(session, app_id, data, tool_path)
        replies["0 vd_applist"] = f"app_id={app_id} app_version=3.2.0"
        return output

    monkeypatch.setattr(DeviceSession, "install", install)
    assert worker.handle(install_request)["result"] == "3.2.0"
    assert installed_calls == [("DclHome001.Home", "/private/path")]
    assert tv_connections[-1].uploads == {
        "/private/path/DclHome001.wgt": b"signed test package",
        "/private/path/device-profile.xml": b"test-file",
    }
    assert worker.handle(install_request)["error"]["code"] == "launcher_changed"
    assert len(installed_calls) == 1


@pytest.mark.parametrize(
    ("override", "code"),
    [
        ({"version": "2.7.0"}, "confirmation_required"),
        ({"version": "3.0.0"}, "already_installed"),
        ({"version": "../unpublished"}, "invalid_request"),
        ({"expected_identity": "0" * 64}, "identity_mismatch"),
        ({"current_version": None}, "launcher_changed"),
        ({}, "certificates_required"),
    ],
)
def test_install_stops_before_signing_or_upload(connected_tv, install_request, monkeypatch, override, code):
    monkeypatch.setattr(worker, "install_signed_package", lambda *_: pytest.fail("Unexpected install"))
    install_request["params"].update(override)
    assert worker.handle(install_request)["error"]["code"] == code


@pytest.fixture
def local_widget(tmp_path):
    path = tmp_path / "Player.wgt"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr(
            "config.xml",
            '<widget xmlns="http://www.w3.org/ns/widgets" '
            'xmlns:tizen="http://tizen.org/ns/widgets" version="1.2.0">'
            "<name>Local Player</name>"
            '<tizen:application id="LocalApp01.Player" package="LocalApp01"/></widget>',
        )
        archive.writestr("index.html", "<h1>Local Player</h1>")
    return path


def local_request(operation, path, **overrides):
    return request(
        operation,
        host="127.0.0.1",
        expected_identity=hashlib.sha256(b"test-duid").hexdigest(),
        path=str(path),
        **overrides,
    )


def test_local_widget_review_and_install_use_cli_signing_and_real_sdb(
    connected_tv, local_widget, monkeypatch, tmp_path
):
    connected_tv.allow_reconnect = True
    preview = worker.handle(local_request("inspect_local_app", local_widget))["result"]
    assert preview["name"] == "Local Player"
    assert preview["version"] == "1.2.0"
    assert preview["current_revision"] is None
    assert str(tmp_path) not in json.dumps(preview)
    profile = tmp_path / "certs" / "test-duid"
    profile.mkdir(parents=True)
    for filename in worker.CERTIFICATE_FILES:
        (profile / filename).write_bytes(b"test-certificate")
    original = local_widget.read_bytes()

    def sign(source, destination, certificates):
        assert certificates == profile
        assert source != local_widget
        assert source.read_bytes() == original
        # The installer continues with its private snapshot, not the mutable source.
        local_widget.write_bytes(b"changed after verification")
        destination.write_bytes(b"signed local widget")

    monkeypatch.setattr(signer, "sign_wgt", sign)
    connected_tv.replies["0 vd_appinstall LocalApp01.Player /private/path/LocalApp01.wgt"] = (
        "app_id[LocalApp01.Player] install completed"
    )
    real_install = DeviceSession.install

    def install(session, *args):
        output = real_install(session, *args)
        connected_tv.replies["0 vd_applist"] += (
            "\napp_id=LocalApp01.Player app_version=1.2.0 name=Local Player"
        )
        return output

    monkeypatch.setattr(DeviceSession, "install", install)
    result = worker.handle(
        local_request(
            "install_local_app",
            local_widget,
            sha256=preview["sha256"],
            current_revision=None,
            confirm_install=True,
        )
    )
    assert result["result"] == {
        "app_id": "LocalApp01.Player",
        "package_id": "LocalApp01",
        "name": "Local Player",
        "version": "1.2.0",
    }
    assert connected_tv.uploads["/private/path/LocalApp01.wgt"] == b"signed local widget"


@pytest.mark.parametrize(
    "scenario,code",
    [
        ("file", "package_changed"),
        ("inventory", "apps_changed"),
        ("confirmation", "confirmation_required"),
        ("certificates", "certificates_required"),
        ("identity", "identity_mismatch"),
    ],
)
def test_local_install_stops_before_signing_or_upload(
    connected_tv, local_widget, monkeypatch, scenario, code
):
    connected_tv.allow_reconnect = True
    preview = worker.handle(local_request("inspect_local_app", local_widget))["result"]
    params = {
        "sha256": preview["sha256"],
        "current_revision": None,
        "confirm_install": scenario != "confirmation",
    }
    if scenario == "file":
        local_widget.write_bytes(b"different file")
    elif scenario == "inventory":
        connected_tv.replies["0 vd_applist"] += "\napp_id=LocalApp01.Player app_version=1.0.0"
    elif scenario == "identity":
        connected_tv.replies["0 getduid"] = "other-tv"
    monkeypatch.setattr(
        worker, "install_signed_package", lambda *_: pytest.fail("Unexpected signing or install")
    )
    reply = worker.handle(local_request("install_local_app", local_widget, **params))
    assert reply["error"]["code"] == code
    assert not connected_tv.uploads


@pytest.mark.parametrize(
    "entry", ["../outside.txt", "/absolute.txt", "C:/drive.txt", "folder\\escape.txt", "config.xml"]
)
def test_local_widget_rejects_unsafe_or_duplicate_entries_before_connecting(local_widget, monkeypatch, entry):
    from aerotizen import local_package

    with zipfile.ZipFile(local_widget, "a") as archive:
        if entry == "config.xml":
            with pytest.warns(UserWarning, match="Duplicate name"):
                archive.writestr(entry, "duplicate")
        else:
            archive.writestr(entry, "unsupported")
    monkeypatch.setattr(worker, "DeviceSession", lambda *_: pytest.fail("Unexpected connection"))
    with pytest.raises(ValueError, match="unsupported or unsafe"):
        local_package.inspect(local_widget)
    assert (
        worker.handle(local_request("inspect_local_app", local_widget))["error"]["code"] == "invalid_package"
    )


def test_local_preview_marks_replacements_and_rejects_missing_inventory(connected_tv, local_widget):
    connected_tv.allow_reconnect = True
    connected_tv.replies["0 vd_applist"] += "\napp_id=LocalApp01.Player app_version=2.0.0"
    preview = worker.handle(local_request("inspect_local_app", local_widget))["result"]
    assert preview["current_version"] == "2.0.0"
    assert len(preview["current_revision"]) == 64
    connected_tv.replies["0 vd_applist"] = ""
    assert (
        worker.handle(local_request("inspect_local_app", local_widget))["error"]["code"]
        == "inventory_unavailable"
    )


def test_discovery_network_error_explains_permissions_without_exposing_raw_exception(monkeypatch):
    def denied():
        raise PermissionError(1, "private internal detail")

    monkeypatch.setattr(worker.discover, "discover", denied)
    reply = worker.handle(request("discover"))
    assert reply["error"]["code"] == "discovery_failed"
    assert "system settings" in reply["error"]["message"]
    assert reply["error"]["system_error"] == 1
    assert "private internal detail" not in json.dumps(reply)


@pytest.fixture
def root_reading(monkeypatch, tmp_path):
    identity = hashlib.sha256(b"test-duid").hexdigest()
    saved = {
        "phase": "active",
        "duid_sha256": identity,
        "original_pc_host": "192.0.2.10",
        "token": "private-token",
        "installation_id": "private-installation",
        "server_pfx": "private-key",
    }
    live = {
        "root_available": True,
        "runtime_version": worker.root_state.RUNTIME_VERSION,
        "installed": True,
        "automatic_startup_enabled": True,
        "automatic_boot_verified": True,
        "bootstrap_completed": True,
        "error": "/private/receipt-path",
    }
    monkeypatch.setattr(worker.remote, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(worker.root_state, "find", lambda *_: dict(saved) if saved else None)
    monkeypatch.setattr(worker.root_control, "status", lambda *_args, **_kwargs: dict(live))
    monkeypatch.setattr(
        worker, "DeviceSession", lambda *_args, **_kwargs: pytest.fail("Unexpected SDK access")
    )
    return identity, saved, live


def test_root_status_exposes_only_live_public_fields(root_reading):
    identity, _, _ = root_reading
    result = worker.handle(request("root_status", host="192.0.2.20", expected_identity=identity))["result"]
    assert result == {
        "phase": "active",
        "root_available": True,
        "setup_complete": True,
        "runtime_version": worker.root_state.RUNTIME_VERSION,
        "target_runtime_version": worker.root_state.RUNTIME_VERSION,
        "update_available": False,
        "update_pending": False,
        "automatic_startup": True,
        "automatic_boot_verified": True,
        "bootstrap_completed": True,
        "recovery_saved": True,
        "original_pc_host": "192.0.2.10",
    }
    for secret in ("private-token", "private-key", "private-installation", "receipt-path"):
        assert secret not in json.dumps(result)


@pytest.mark.parametrize(
    "proof",
    [
        "root_available",
        "installed",
        "automatic_startup_enabled",
        "automatic_boot_verified",
        "bootstrap_completed",
    ],
)
def test_root_status_never_uses_old_saved_progress_as_completion(root_reading, proof):
    identity, _, live = root_reading
    live[proof] = False
    result = worker.handle(request("root_status", host="192.0.2.20", expected_identity=identity))["result"]
    assert result["setup_complete"] is False
    if proof == "root_available":
        assert result["runtime_version"] is None
        assert result["automatic_startup"] is None


def test_root_without_a_local_record_cannot_claim_verified_access(root_reading, monkeypatch):
    identity, saved, _ = root_reading
    saved.clear()
    monkeypatch.setattr(
        worker.root_control, "status", lambda *_args, **_kwargs: pytest.fail("No pairing exists")
    )
    result = worker.handle(request("root_status", host="192.0.2.20", expected_identity=identity))["result"]
    assert result["phase"] == "not_configured"
    assert result["root_available"] is False
    assert result["setup_complete"] is False
    assert result["recovery_saved"] is False


def test_rename_requires_updated_helper_without_sending_a_write(monkeypatch, tmp_path):
    expected = "a" * 64
    monkeypatch.setattr(
        worker.buttons.root_state, "find", lambda *_: {"phase": "active", "duid_sha256": expected}
    )
    monkeypatch.setattr(
        worker.buttons, "DeviceSession", lambda *_a, **_k: SimpleNamespace(ownership=nullcontext)
    )
    calls = []

    def bridge_request(operation="status", **_kwargs):
        calls.append(operation)
        return {"buttons_protocol": worker.buttons.PROTOCOL, "buttons_friendly_names": True}

    monkeypatch.setattr(
        worker.buttons, "BridgeClient", lambda *_a, **_k: SimpleNamespace(request=bridge_request)
    )
    reply = worker.handle(
        request(
            "change_button",
            host="192.0.2.20",
            expected_identity=expected,
            change={"action": "rename", "button": "Netflix", "new_name": "Streaming"},
        )
    )
    assert reply["error"]["code"] == "helper_update_required"
    assert calls == ["status"]


@pytest.mark.parametrize("new_name", ["", " ", "a" * 49, "line\nbreak", "bad\ud800"])
def test_rename_rejects_invalid_names_before_contacting_tv(monkeypatch, new_name):
    monkeypatch.setattr(worker.buttons, "run", lambda *_a, **_k: pytest.fail("Invalid name reached TV"))
    reply = worker.handle(
        request(
            "change_button",
            host="192.0.2.20",
            expected_identity="a" * 64,
            change={"action": "rename", "button": "Netflix", "new_name": new_name},
        )
    )
    assert reply["error"]["code"] == "invalid_request"


@pytest.mark.parametrize(
    "version,available", [("0.2.0", True), ("99.0.0", False), (None, False), ("unknown", False)]
)
def test_root_update_offer_requires_a_known_older_live_version(root_reading, version, available):
    identity, saved, live = root_reading
    live["runtime_version"] = version
    params = {"host": "192.0.2.20", "expected_identity": identity}
    assert worker.read_root_status(params)["update_available"] is available
    live["root_available"] = False
    assert worker.read_root_status(params)["update_available"] is False
    saved["upgrade"] = {"private": "private-token"}
    result = worker.read_root_status(params)
    assert result["update_pending"] is True and result["update_available"] is False
    assert "private-token" not in json.dumps(result)


@pytest.mark.parametrize(
    "action,confirmed,phase,pending,code",
    [
        ("start", False, "active", False, "confirmation_required"),
        ("invalid", True, "active", False, "confirmation_required"),
        ("start", True, "waiting_boot", False, "root_state_changed"),
        ("start", True, "removing", True, "root_state_changed"),
        ("resume", True, "active", False, "root_state_changed"),
        ("start", True, "wrong_tv", False, "identity_mismatch"),
    ],
)
def test_root_update_requires_confirmation_and_matching_progress(
    root_reading, monkeypatch, action, confirmed, phase, pending, code
):
    identity, saved, _ = root_reading
    saved["phase"] = phase
    if phase == "wrong_tv":
        saved["duid_sha256"] = "0" * 64
    if pending:
        saved["upgrade"] = {"private": "private-token"}
    monkeypatch.setattr(worker.root_control, "upgrade", lambda *_a, **_k: pytest.fail("Unexpected upgrade"))
    reply = worker.handle(
        request(
            "upgrade_root", host="192.0.2.20", expected_identity=identity, action=action, confirmed=confirmed
        )
    )
    assert reply["error"]["code"] == code


def test_root_update_calls_real_cli_owner_and_retains_pending_until_verified(
    root_reading, monkeypatch, tmp_path
):
    identity, saved, live = root_reading
    live["runtime_version"] = "0.2.0"
    calls = []

    def upgrade(host, *, state_dir, expected_duid_sha256, resume_only):
        calls.append((host, state_dir, expected_duid_sha256, resume_only))
        if not resume_only:
            saved["upgrade"] = {"private": "private-token"}
        elif live["runtime_version"] == worker.root_state.RUNTIME_VERSION:
            del saved["upgrade"]

    monkeypatch.setattr(worker.root_control, "upgrade", upgrade)
    params = {"host": "192.0.2.20", "expected_identity": identity, "confirmed": True}
    assert worker.upgrade_root({**params, "action": "start"})["update_pending"] is True
    assert worker.upgrade_root({**params, "action": "resume"})["update_pending"] is True
    live["runtime_version"] = worker.root_state.RUNTIME_VERSION
    result = worker.upgrade_root({**params, "action": "resume"})
    assert result["update_pending"] is False and result["update_available"] is False
    assert calls == [("192.0.2.20", tmp_path, identity, resume) for resume in (False, True, True)]


@pytest.mark.parametrize(
    "reason",
    [
        "Restore the TV's original signing certificates before upgrading",
        "unexpected /private/secret token=private-token",
    ],
)
def test_root_update_errors_do_not_expose_private_files(root_reading, monkeypatch, reason):
    identity, _, _ = root_reading

    def fail(*_a, **_k):
        raise worker.root_control.DeviceSessionError(reason)

    monkeypatch.setattr(worker.root_control, "upgrade", fail)
    reply = worker.handle(
        request("upgrade_root", host="192.0.2.20", expected_identity=identity, action="start", confirmed=True)
    )
    assert reply["error"]["code"] in ("root_update_requirements", "root_update_failed")
    assert "/private/" not in json.dumps(reply) and "private-token" not in json.dumps(reply)


@pytest.mark.parametrize(
    "action,phase,confirmed,code",
    [
        ("start", "prepared", False, "confirmation_required"),
        ("verify", "not_configured", True, "root_state_changed"),
        ("verify", "installed", True, "root_state_changed"),
        ("start", "waiting_boot", True, "root_state_changed"),
        ("start", "removing", True, "root_recovery_required"),
        ("start", "wrong_tv", True, "identity_mismatch"),
    ],
)
def test_root_setup_requires_confirmed_matching_progress(
    root_reading, monkeypatch, action, phase, confirmed, code
):
    identity, saved, _ = root_reading
    saved["phase"] = phase
    if phase == "not_configured":
        saved.clear()
    if phase == "wrong_tv":
        saved["duid_sha256"] = "0" * 64
    monkeypatch.setattr(
        worker.root_control, "setup", lambda *_args, **_kwargs: pytest.fail("Unexpected root setup")
    )
    reply = worker.handle(
        request(
            "setup_root", host="192.0.2.20", expected_identity=identity, action=action, confirmed=confirmed
        )
    )
    assert reply["error"]["code"] == code


def test_desktop_root_setup_reuses_cli_and_waits_for_verification(root_reading, monkeypatch, tmp_path):
    identity, saved, _ = root_reading
    saved["phase"] = "prepared"
    calls = []

    def setup(host, *, state_dir, expected_duid_sha256, verify_only):
        calls.append((host, state_dir, expected_duid_sha256, verify_only))
        saved["phase"] = "active" if saved["phase"] == "waiting_boot" else "waiting_boot"

    monkeypatch.setattr(worker.root_control, "setup", setup)
    start = worker.handle(
        request("setup_root", host="192.0.2.20", expected_identity=identity, action="start", confirmed=True)
    )["result"]
    assert start["phase"] == "waiting_boot" and start["setup_complete"] is False
    verified = worker.handle(
        request("setup_root", host="192.0.2.20", expected_identity=identity, action="verify", confirmed=True)
    )["result"]
    assert verified["phase"] == "active" and verified["setup_complete"] is True
    assert calls == [("192.0.2.20", tmp_path, identity, False), ("192.0.2.20", tmp_path, identity, True)]


@pytest.mark.parametrize(
    "reason,code",
    [
        ("A helper already exists; use its original private root receipt", "root_recovery_required"),
        ("Normal SDB needs Developer Mode On", "root_requirements"),
        ("Create signing certificates first: aerotizen certs", "certificates_required"),
        ("unexpected failure at /private/secret with token=private-token", "root_setup_failed"),
    ],
)
def test_root_setup_errors_remain_actionable_without_private_details(root_reading, monkeypatch, reason, code):
    identity, saved, _ = root_reading
    saved["phase"] = "prepared"

    def fail(*_args, **_kwargs):
        raise worker.root_control.DeviceSessionError(reason)

    monkeypatch.setattr(worker.root_control, "setup", fail)
    reply = worker.handle(
        request("setup_root", host="192.0.2.20", expected_identity=identity, action="start", confirmed=True)
    )
    assert reply["error"]["code"] == code
    assert "/private/" not in json.dumps(reply)
    assert "private-token" not in json.dumps(reply)
