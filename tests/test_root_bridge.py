"""The actual native TLS bridge must authenticate before relaying SDB."""

import json
import os
import queue
import shutil
import subprocess
import threading
import time
import uuid
from pathlib import Path

import pytest

from aerotizen import root_package, root_state
from aerotizen.root_bridge import BridgeClient, BridgeError, BridgeSdb

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="session")
def native_root(tmp_path_factory):
    dotnet = os.environ.get("DOTNET_EXE") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip(".NET SDK 6 is required for native bridge integration checks")
    output = tmp_path_factory.mktemp("root-native")
    subprocess.run(
        [
            dotnet,
            "build",
            str(ROOT / "tests/native-root/RootTests.csproj"),
            "-c",
            "Release",
            "-o",
            str(output),
            "--nologo",
            "-v:q",
            "-p:UseSharedCompilation=false",
        ],
        check=True,
        capture_output=True,
        timeout=120,
    )
    return [dotnet, str(output / "RootTests.dll")]


def receipt_data():
    installation = uuid.uuid4().hex
    return {
        "schema_version": 1,
        "app_id": root_state.APP_ID,
        "version": root_state.VERSION,
        "host": "192.0.2.20",
        "original_pc_host": "192.0.2.10",
        "phase": "active",
        "installation_id": installation,
        "device_identity_sha256": "a" * 64,
        "duid_sha256": "b" * 64,
        "baseline_boot_id": str(uuid.uuid4()),
        "bridge_port": root_state.BRIDGE_PORT,
        **root_package.new_pairing(installation),
    }


@pytest.fixture
def bridge_server(native_root, tmp_path, fake_tv, request):
    receipt = receipt_data()
    managed = {name: ("fixture " + name).encode() for name in root_package.MANAGED}
    tv = fake_tv({"0 getduid": "paired-tv\n"})
    fixture = {
        **receipt,
        "public_config": root_package.public_config(receipt, managed),
        "boot_id": str(uuid.uuid4()),
        "removed_file": str(tmp_path / "removed"),
        "sdb_port": tv.port,
        "identity_fail_once": getattr(request, "param", False),
        "diagnostic_file": str(tmp_path / "diagnostic.json"),
    }
    path = tmp_path / "fixture.json"
    path.write_text(json.dumps(fixture))
    process = subprocess.Popen(
        [*native_root, "--serve", str(path)], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True
    )
    lines = queue.Queue()

    def read_lines():
        for line in process.stdout:
            lines.put(line)
        lines.put(None)

    reader = threading.Thread(target=read_lines, daemon=True)
    reader.start()
    try:
        deadline = time.monotonic() + 15
        port = None
        while time.monotonic() < deadline:
            line = lines.get(timeout=max(0.01, deadline - time.monotonic()))
            if line is None:
                raise AssertionError(process.stderr.read())
            if line.startswith("ROOT_TEST_SERVER_PORT="):
                port = int(line.split("=", 1)[1])
                break
        assert port, "native bridge did not start"
        receipt["bridge_port"] = port
        yield receipt, fixture, process
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)
        reader.join(timeout=5)
        process.stdout.close()
        process.stderr.close()


def test_native_per_boot_guard_reopens_only_for_new_kernel(native_root):
    result = subprocess.run(native_root, capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr
    assert "ROOT_GATE_CHECKS_PASSED=" in result.stdout


def test_actual_native_tls_status_and_sdb_relay(bridge_server):
    receipt, fixture, _ = bridge_server
    status = BridgeClient("127.0.0.1", receipt).request()
    assert status["boot_id"] == fixture["boot_id"] and status["uid"] == 0
    assert receipt["token"] not in json.dumps(status)
    with BridgeSdb("127.0.0.1", receipt) as session:
        assert session.duid() == "paired-tv"


@pytest.mark.parametrize("bridge_server", [True], indirect=True)
def test_native_os_error_is_recorded_without_stopping_the_bridge(bridge_server):
    receipt, fixture, _ = bridge_server
    with pytest.raises(BridgeError, match="before an authenticated reply"):
        BridgeClient("127.0.0.1", receipt).request()
    assert json.loads(Path(fixture["diagnostic_file"]).read_text()) == {
        "phase": "identity",
        "error_type": "Win32Exception",
    }
    assert BridgeClient("127.0.0.1", receipt).request()["authenticated"] is True


@pytest.mark.parametrize(
    "change", ["token", "certificate_sha256", "installation_id", "device_identity_sha256"]
)
def test_pairing_mismatch_never_grants_access(bridge_server, change):
    receipt, _, _ = bridge_server
    altered = dict(receipt)
    altered[change] = ("0" if receipt[change][0] != "0" else "1") + receipt[change][1:]
    with pytest.raises((BridgeError, OSError)):
        BridgeClient("127.0.0.1", altered, timeout=2).request()
    assert BridgeClient("127.0.0.1", receipt).request()["authenticated"] is True


def test_authenticated_removal_runs_once_and_closes_listener(bridge_server):
    receipt, fixture, process = bridge_server
    reply = BridgeClient("127.0.0.1", receipt).request("remove")
    assert reply["prepared_for_removal"] is True
    assert Path(fixture["removed_file"]).read_text() == "removed"
    process.wait(timeout=10)
    assert process.returncode == 0, process.stderr.read()


def test_replayed_or_non_root_status_is_rejected():
    receipt = receipt_data()
    client = BridgeClient("192.0.2.20", receipt)
    reply = {
        "app_id": root_state.APP_ID,
        "protocol": 1,
        "authenticated": True,
        "nonce": uuid.uuid4().hex,
        "installation_id": receipt["installation_id"],
        "device_identity_sha256": receipt["device_identity_sha256"],
        "uid": 0,
        "euid": 0,
        "gid": 0,
        "boot_id": str(uuid.uuid4()),
    }
    client.verify(reply, reply["nonce"])
    with pytest.raises(BridgeError):
        client.verify(reply, uuid.uuid4().hex)
    for change in ({"uid": True}, {"euid": 901}, {"protocol": True}, {"boot_id": "invalid"}):
        with pytest.raises(BridgeError):
            client.verify({**reply, **change}, reply["nonce"])


def test_root_receipt_private_and_status_does_not_expose_credentials(tmp_path):
    receipt = receipt_data()
    path = root_state.receipt_path(receipt["host"], tmp_path)
    root_state.save(path, receipt)
    assert root_state.load(path) == receipt
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600
        assert path.parent.stat().st_mode & 0o777 == 0o700
    public = json.dumps(root_state.public_status(receipt))
    assert receipt["token"] not in public and receipt["server_pfx"] not in public
