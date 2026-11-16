import hashlib
import json
import subprocess
import sys
import zipfile

import pytest

from aerotizen import desktop_worker as worker
from aerotizen import signer
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
    assert result["technical_details"] == {
        "model_code": None,
        "tizen_version": "9.0.0",
        "architecture": "armv7",
        "platform": "24_PTM",
        "root_runtime_version": None,
    }
    assert "test-duid" not in json.dumps(reply)
    assert "/private/path" not in json.dumps(reply)


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


def test_different_saved_identity_is_refused(connected_tv):
    reply = worker.handle(request("connect", host="127.0.0.1", expected_identity="0" * 64))
    assert reply["error"]["code"] == "identity_mismatch"
    assert "result" not in reply


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


def test_handshake_does_not_open_a_connection(monkeypatch):
    monkeypatch.setattr(worker, "DeviceSession", lambda _: pytest.fail("Unexpected TV connection"))
    reply = worker.handle(request("handshake"))
    assert reply["result"]["name"] == worker.WORKER_NAME
    assert reply["result"]["operations"] == [
        "handshake",
        "discover",
        "connect",
        "launcher_catalog",
        "install_launcher",
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
