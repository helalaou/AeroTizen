import json
import subprocess
import sys

import pytest

from aerotizen import desktop_worker as worker


def request(operation, **params):
    return {"protocol": 1, "id": "test-request", "operation": operation, "params": params}


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
    import socket

    monkeypatch.setattr(socket, "socket", lambda *_a, **_k: pytest.fail("Unexpected TV connection"))
    reply = worker.handle(request("handshake"))
    assert reply["result"]["name"] == worker.WORKER_NAME
    assert reply["result"]["operations"] == [
        "handshake",
    ]
    for retired in (
        "upgrade_root",
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
