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
    monkeypatch.setattr(DeviceSession, "tcp_request", lambda *_args, **_kwargs: b"")
    monkeypatch.setattr(
        worker,
        "DeviceSession",
        lambda host: DeviceSession(host, port=tv.port, direct=True, lock_dir=tmp_path / "locks"),
    )
    return tv


def test_certificate_setup_refuses_a_different_identity(connected_tv):
    reply = worker.handle(request("prepare_signing_profile", host="127.0.0.1", expected_identity="0" * 64))
    assert reply["error"]["code"] == "identity_mismatch"
    assert "result" not in reply


@pytest.mark.parametrize("host", [True, 123, None, "tv.local", "0.0.0.0", "255.255.255.255", "224.0.0.1"])
def test_invalid_hosts_fail_before_network_access(monkeypatch, host):
    monkeypatch.setattr(worker.remote, "info", lambda _: pytest.fail("Unexpected network access"))
    assert worker.handle(request("setup_root", host=host))["error"]["code"] == "invalid_address"


@pytest.mark.parametrize("payload", [None, [], {"protocol": 1}, request("shell", command="anything")])
def test_invalid_or_unknown_operations_are_refused(payload):
    assert worker.handle(payload)["error"]["code"] == "invalid_request"


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
        "prepare_signing_profile",
        "install_launcher",
        "setup_root",
        "upgrade_root",
    ]
    for retired in (
        "discover",
        "launcher_catalog",
        "read_home_backup",
        "samsung_sign_in",
        "root_status",
        "list_buttons",
        "change_button",
        "list_apps",
        "list_button_apps",
        "remove_apps",
        "inspect_local_app",
        "connect",
        "prepare_native_home",
        "install_local_app",
        "apply_native_home",
        "restore_home_backup",
    ):
        assert worker.handle(request(retired))["error"]["code"] == "invalid_request"


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
    assert worker.signing_profile("test-duid") == profile

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


def test_post_change_root_status_exposes_only_live_public_fields(root_reading):
    identity, _, _ = root_reading
    result = worker._root_status_after_change({"host": "192.0.2.20", "expected_identity": identity})
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
def test_post_change_root_status_never_uses_old_saved_progress_as_completion(root_reading, proof):
    identity, _, live = root_reading
    live[proof] = False
    result = worker._root_status_after_change({"host": "192.0.2.20", "expected_identity": identity})
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
    result = worker._root_status_after_change({"host": "192.0.2.20", "expected_identity": identity})
    assert result["phase"] == "not_configured"
    assert result["root_available"] is False
    assert result["setup_complete"] is False
    assert result["recovery_saved"] is False


@pytest.mark.parametrize(
    "version,available", [("0.2.0", True), ("99.0.0", False), (None, False), ("unknown", False)]
)
def test_root_update_offer_requires_a_known_older_live_version(root_reading, version, available):
    identity, saved, live = root_reading
    live["runtime_version"] = version
    params = {"host": "192.0.2.20", "expected_identity": identity}
    assert worker._root_status_after_change(params)["update_available"] is available
    live["root_available"] = False
    assert worker._root_status_after_change(params)["update_available"] is False
    saved["upgrade"] = {"private": "private-token"}
    result = worker._root_status_after_change(params)
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
