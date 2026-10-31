"""Private bootstrap data crosses real Python/.NET pinned TLS, never shared SDB."""

import base64
import hashlib
import json
import subprocess

import pytest

from aerotizen import root_transfer
from test_root_bridge import native_root as native_fixture
from test_root_bridge import receipt_data

native_root = native_fixture


@pytest.mark.parametrize("wrong", [None, "pin", "token"])
def test_private_input_uses_native_pinned_tls_without_uploading_credentials(native_root, monkeypatch, wrong):
    receipt = receipt_data()
    secret = b"private setup data that must not enter an SDB upload"
    files = {"AeroTizenRootBridge.dll": b"public managed code"}

    class Session:
        host = "127.0.0.1"

        def push(self, *args):
            pytest.fail("private input was staged with SDB")

    def sdk_run(session, sent_files, entrypoint, args):
        assert sent_files == files
        assert secret not in b"".join(sent_files.values())
        assert receipt["token"] not in " ".join(args)
        assert args[0] == "--bootstrap-fetch"
        values = list(args[1:])
        if wrong == "pin":
            values[2] = "0" * 64
        elif wrong == "token":
            values[3] = "0" * 64
        result = subprocess.run(
            [*native_root, "--fetch", *values], capture_output=True, text=True, timeout=25
        )
        if result.returncode:
            raise RuntimeError("native setup fetch rejected the connection")
        return json.loads(result.stdout)

    monkeypatch.setattr(root_transfer.sdk, "run", sdk_run)

    def run():
        return root_transfer.run(
            Session(), files, secret, base64.b64decode(receipt["server_pfx"]), receipt["certificate_sha256"]
        )

    if wrong:
        with pytest.raises(RuntimeError, match="rejected"):
            run()
    else:
        assert run() == {"bytes": len(secret), "sha256": hashlib.sha256(secret).hexdigest()}


def test_private_setup_rejects_a_mismatched_saved_certificate():
    receipt = receipt_data()
    with pytest.raises(ValueError, match="saved pin"):
        root_transfer.server_context(base64.b64decode(receipt["server_pfx"]), "0" * 64)
