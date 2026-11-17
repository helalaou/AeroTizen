import hashlib
import json
import subprocess
import sys
import zipfile

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


def test_cancellable_app_list_exits_when_its_input_pipe_closes():
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
            process.stdin.write(json.dumps({**request("list_apps"), "cancellable": True}) + "\n")
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
        "discover",
        "connect",
        "list_apps",
        "remove_apps",
        "launcher_catalog",
        "install_launcher",
        "read_home_backup",
    ]


def test_launcher_catalog_does_not_open_a_tv_connection(monkeypatch):
    monkeypatch.setattr(worker, "DeviceSession", lambda _: pytest.fail("Unexpected TV connection"))
    entries = [{"version": "3.2.0", "sections": []}]
    monkeypatch.setattr(worker.releases, "launcher_catalog", lambda: entries)
    assert worker.handle(request("launcher_catalog"))["result"] == entries


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


def test_discovery_network_error_explains_permissions_without_exposing_raw_exception(monkeypatch):
    def denied():
        raise PermissionError(1, "private internal detail")

    monkeypatch.setattr(worker.discover, "discover", denied)
    reply = worker.handle(request("discover"))
    assert reply["error"]["code"] == "discovery_failed"
    assert "system settings" in reply["error"]["message"]
    assert reply["error"]["system_error"] == 1
    assert "private internal detail" not in json.dumps(reply)
