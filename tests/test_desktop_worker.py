import hashlib
import json
import subprocess
import sys

import pytest

from aerotizen import desktop_worker as worker


def request(operation, **params):
    return {"protocol": 1, "id": "test-request", "operation": operation, "params": params}


@pytest.mark.parametrize("host", [True, 123, None, "tv.local", "0.0.0.0", "255.255.255.255", "224.0.0.1"])
def test_invalid_hosts_fail_before_network_access(monkeypatch, host):
    monkeypatch.setattr(worker.remote, "info", lambda _: pytest.fail("Unexpected network access"))
    assert worker.handle(request("upgrade_root", host=host))["error"]["code"] == "invalid_address"


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
    monkeypatch.setattr(
        worker.root_control, "status", lambda *_args, **_kwargs: pytest.fail("Unexpected TV connection")
    )
    reply = worker.handle(request("handshake"))
    assert reply["result"]["name"] == worker.WORKER_NAME
    assert reply["result"]["operations"] == [
        "handshake",
        "upgrade_root",
    ]
    for retired in (
        "setup_root",
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
        "prepare_signing_profile",
        "install_local_app",
        "install_launcher",
        "apply_native_home",
        "restore_home_backup",
    ):
        assert worker.handle(request(retired))["error"]["code"] == "invalid_request"


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
