"""Exercise the actual Python paired SDB client against the native wire fixture."""

import hashlib
import json
from pathlib import Path
from types import SimpleNamespace

from aerotizen import root_bridge


def test_native_wire_matches_python_sdb_and_authenticated_relay(monkeypatch):
    directory = Path(__file__).parent / "fixtures"
    fixture = json.loads((directory / "sdb-read-wire.json").read_text())
    receipt = json.loads((directory / "root-receipt.json").read_text())
    certificate = b"synthetic-sdb-certificate"
    receipt["certificate_sha256"] = hashlib.sha256(certificate).hexdigest()
    proof = {
        "protocol": 1,
        "authenticated": True,
        "nonce": fixture["bridge_request"]["nonce"],
        "app_id": receipt["app_id"],
        "installation_id": receipt["installation_id"],
        "device_identity_sha256": receipt["device_identity_sha256"],
        "uid": 0,
        "euid": 0,
        "gid": 0,
        "boot_id": receipt["baseline_boot_id"],
    }
    incoming = bytearray((json.dumps(proof) + "\n").encode() + bytes.fromhex(fixture["incoming_hex"]))
    sent = []

    def recv(count):
        output = bytes(incoming[:count])
        del incoming[:count]
        return output

    secured = SimpleNamespace(
        getpeercert=lambda **_: certificate, sendall=sent.append, recv=recv, close=lambda: None
    )
    monkeypatch.setattr(root_bridge.socket, "create_connection", lambda *_a, **_k: None)
    monkeypatch.setattr(
        root_bridge.ssl, "SSLContext", lambda *_: SimpleNamespace(wrap_socket=lambda *_a, **_k: secured)
    )
    monkeypatch.setattr(root_bridge.secrets, "token_hex", lambda _: fixture["bridge_request"]["nonce"])
    with root_bridge.BridgeSdb("192.0.2.20", receipt).connect(attempts=1) as client:
        assert client.duid() == fixture["identity"].strip()
        assert client.applist() == fixture["inventory"]
        assert client.duid() == fixture["identity"].strip()
    assert json.loads(sent[0]) == fixture["bridge_request"]
    assert b"".join(sent[1:]).hex() == fixture["outgoing_hex"]
