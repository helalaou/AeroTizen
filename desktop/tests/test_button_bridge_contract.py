"""Keep native requests compatible with the CLI's actual bridge serialization."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

import pytest

from aerotizen import root_bridge

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.mark.parametrize(
    "buttons",
    [{"action": action, "apply": False} for action in ("list", "status")]
    + [case["buttons"] for case in json.loads((FIXTURES / "button-edit-requests.json").read_text())],
)
def test_button_request_matches_the_cli_wire_format(monkeypatch, buttons):
    expected = json.loads((FIXTURES / "button-read-request.json").read_text())
    expected["buttons"] = buttons
    receipt = json.loads((FIXTURES / "root-receipt.json").read_text())
    certificate = b"synthetic-test-certificate"
    receipt["certificate_sha256"] = hashlib.sha256(certificate).hexdigest()
    response = {
        "protocol": 1,
        "authenticated": True,
        "nonce": expected["nonce"],
        "app_id": receipt["app_id"],
        "installation_id": receipt["installation_id"],
        "device_identity_sha256": receipt["device_identity_sha256"],
        "uid": 0,
        "euid": 0,
        "gid": 0,
        "boot_id": receipt["baseline_boot_id"],
    }
    response_bytes = iter((json.dumps(response) + "\n").encode())
    captured = []
    secured = SimpleNamespace(
        getpeercert=lambda **_: certificate,
        sendall=lambda data: captured.append(json.loads(data)),
        recv=lambda _: bytes([next(response_bytes)]),
        close=lambda: None,
    )
    monkeypatch.setattr(root_bridge.socket, "create_connection", lambda *_a, **_k: None)
    monkeypatch.setattr(
        root_bridge.ssl, "SSLContext", lambda *_: SimpleNamespace(wrap_socket=lambda *_a, **_k: secured)
    )
    monkeypatch.setattr(root_bridge.secrets, "token_hex", lambda _: expected["nonce"])
    root_bridge.BridgeClient("192.0.2.20", receipt).request("buttons", button_request=expected["buttons"])
    assert captured == [expected]
