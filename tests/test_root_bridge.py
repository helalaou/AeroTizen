"""The actual native TLS bridge must authenticate before relaying SDB."""

import hashlib
import json
import os
import queue
import shutil
import socket
import ssl
import struct
import subprocess
import threading
import time
import uuid
from pathlib import Path

import pytest

from aerotizen import cli, desktop_worker, root_package, root_state
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
            f"-p:Version={root_state.RUNTIME_VERSION}",
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
    tv = fake_tv(
        {"0 getduid": "paired-tv\n", "0 vd_applist": "test.app\tTest App\ntest.app\tExample.tv\n"},
        allow_reconnect=True,
    )
    fixture = {
        **receipt,
        "public_config": root_package.public_config(receipt, managed),
        "boot_id": str(uuid.uuid4()),
        "removed_file": str(tmp_path / "removed"),
        "sdb_port": tv.port,
        "identity_fail_once": getattr(request, "param", {}).get("identity_fail_once", False),
        "diagnostic_file": str(tmp_path / "diagnostic.json"),
    }
    if getattr(request, "param", {}).get("pause_remove"):
        fixture["remove_started_file"] = str(tmp_path / "remove-started")
        fixture["remove_release_file"] = str(tmp_path / "remove-release")
    if "home_settings" in getattr(request, "param", {}):
        fixture["home_settings"] = request.param["home_settings"]
    if getattr(request, "param", {}).get("buttons"):
        buttons_file = tmp_path / "buttons.json"
        fixture["buttons_file"] = str(buttons_file)
        for field in ("learned_code", "key_layout", "key_codes", "input_devices"):
            if field in request.param:
                fixture[field] = request.param[field]
        if initial := request.param.get("initial_buttons"):
            buttons_file.write_text(json.dumps(initial))
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


def test_native_button_filter_preserves_other_keys_and_launches_once(native_root):
    result = subprocess.run([*native_root, "--buttons-filter"], capture_output=True, text=True, timeout=15)
    assert result.returncode == 0, result.stderr


@pytest.mark.parametrize(
    "bridge_server",
    [
        {
            "buttons": True,
            "input_devices": {"exit_code": 0, "output": "Smart Control\t/dev/input/event23\x00\r\n"},
        }
    ],
    indirect=True,
)
def test_cli_reads_compositor_input_devices(bridge_server, tmp_path, monkeypatch, capsys):
    receipt, fixture, _ = bridge_server
    receipt_path = tmp_path / "receipt.json"
    root_state.save(receipt_path, receipt)
    monkeypatch.setattr(cli, "STATE_DIR", str(tmp_path))
    command = ["aerotizen", "--tv", "127.0.0.1", "buttons", "input-devices", "--receipt", str(receipt_path)]
    monkeypatch.setattr("sys.argv", [*command, "--json"])
    cli.main()
    assert json.loads(capsys.readouterr().out) == {
        "input_devices": "Smart Control\t/dev/input/event23",
        "truncated": False,
        "exit_code": 0,
        "error": None,
    }
    monkeypatch.setattr("sys.argv", command)
    cli.main()
    assert capsys.readouterr().out == "Smart Control\t/dev/input/event23\n"
    assert not Path(fixture["buttons_file"]).exists()


@pytest.mark.parametrize(
    "bridge_server",
    [{"buttons": True, "input_devices": {"exit_code": 1, "output": "é" * 6000 + "\n/dev/input/event23"}}],
    indirect=True,
)
def test_compositor_report_fits_bridge_reply_and_keeps_diagnostic_tail(bridge_server):
    receipt, _, _ = bridge_server
    client = BridgeClient("127.0.0.1", receipt)
    report = client.request("buttons", button_request={"action": "input-devices"})["buttons"]
    assert report["truncated"] is True
    assert report["input_devices"].endswith("\n/dev/input/event23")
    assert report["error"] == "The TV compositor query failed (exit 1)."


@pytest.mark.parametrize("bridge_server", [{"buttons": True}], indirect=True)
def test_cli_button_rules_preview_apply_and_restore(bridge_server, tmp_path, monkeypatch, capsys):
    receipt, fixture, _ = bridge_server
    monkeypatch.setattr(cli, "STATE_DIR", str(tmp_path))
    receipt_path = tmp_path / "receipt.json"
    root_state.save(receipt_path, receipt)

    def command(*args):
        monkeypatch.setattr(
            "sys.argv",
            ["aerotizen", "--tv", "127.0.0.1", "buttons", *args, "--receipt", str(receipt_path), "--json"],
        )
        cli.main()
        return json.loads(capsys.readouterr().out)

    stored = Path(fixture["buttons_file"])
    assert command("key-names", "226", "221", "767")["key_names"] == [
        {"code": 226, "names": ["XF86Netflix", "XF86Media"], "truncated": False},
        {"code": 221, "names": ["XF86Amazon"], "truncated": False},
        {"code": 767, "names": [], "truncated": False},
    ]
    assert not stored.exists()
    listing = command("list")
    assert listing["discovered"] == [
        {"button": "disney-plus", "code": 242},
        {"button": "netflix", "code": 240},
        {"button": "prime-video", "code": 241},
    ]
    assert listing["rules"] == []
    assert command("map", "prime-video", "--app", "test.app")["preview"] == "Map prime-video to test.app."
    assert command("map", "prime-video", "--app", "example.tv")["preview"] == "Map prime-video to test.app."
    assert not stored.exists()
    assert command("disable", "disney-plus", "--yes")["rules"][0]["mode"] == "disabled"
    assert command("map", "prime-video", "--app", "test.app", "--yes")["rules"][1]["app_id"] == "test.app"
    assert [rule["Code"] for rule in json.loads(stored.read_text())] == [242, 241]
    assert command("list")["discovered"] == [{"button": "netflix", "code": 240}]
    assert command("reset", "--yes")["rules"] == []
    assert command("learn", "Amazon Prime")["preview"] == "Learn the Amazon Prime button."
    assert json.loads(stored.read_text()) == []

    learned = command("learn", "  Amazon Prime  ", "--yes")["rules"][0]
    assert learned["button"] == "Amazon Prime" and learned["mode"] == "default"
    assert command("map", "amazon prime", "--app", "Test App")["rules"][0]["mode"] == "default"
    assert command("map", "Amazon Prime", "--app", "test.app", "--yes")["rules"][0]["app_id"] == "test.app"
    before_rename = json.loads(stored.read_text())[0]
    renamed = command("rename", "Amazon Prime", "--name", "My streaming button", "--yes")["rules"][0]
    assert renamed["button"] == "My streaming button" and renamed["app_id"] == "test.app"
    assert json.loads(stored.read_text())[0] == {**before_rename, "Button": "My streaming button"}
    command("rename", "My streaming button", "--name", "Amazon Prime", "--yes")
    assert command("disable", "AMAZON PRIME", "--yes")["rules"][0]["mode"] == "disabled"
    deadline = time.monotonic() + 2
    while not command("status")["rules"][0]["active"] and time.monotonic() < deadline:
        time.sleep(0.01)
    assert command("status")["rules"][0]["active"]
    saved = command("unmap", "amazon prime", "--yes")["rules"]
    assert len(saved) == 1 and saved[0]["button"] == "Amazon Prime" and saved[0]["mode"] == "default"
    assert command("reset", "--yes")["rules"] == []
    assert json.loads(stored.read_text()) == []


@pytest.mark.parametrize("bridge_server", [{"buttons": True}], indirect=True)
def test_desktop_worker_lists_button_apps_without_changing_rules(bridge_server, tmp_path, monkeypatch):
    receipt, fixture, _ = bridge_server
    host = "127.0.0.1"
    identity = hashlib.sha256(b"paired-tv").hexdigest()
    root_state.save(root_state.receipt_path(host, tmp_path), {**receipt, "duid_sha256": identity})
    monkeypatch.setattr(desktop_worker.remote, "CONFIG_DIR", tmp_path)
    monkeypatch.setattr(desktop_worker.remote, "info", lambda _: {"developerIP": host})
    result = desktop_worker.handle(
        {
            "protocol": 1,
            "id": "desktop-button-apps",
            "operation": "list_button_apps",
            "params": {"host": host, "expected_identity": identity},
        }
    )
    assert result["result"] == [{"id": "test.app", "name": "Example.tv"}]
    assert not Path(fixture["buttons_file"]).exists()


@pytest.mark.parametrize("bridge_server", [{"buttons": True}], indirect=True)
def test_button_rule_mutations_require_pairing_and_installed_app(bridge_server):
    receipt, fixture, _ = bridge_server
    request = {"action": "learn", "button": "netflix", "apply": True}
    with pytest.raises(BridgeError, match="before an authenticated reply"):
        BridgeClient("127.0.0.1", {**receipt, "token": "0" * 64}).request("buttons", button_request=request)
    assert not Path(fixture["buttons_file"]).exists()
    client = BridgeClient("127.0.0.1", receipt)
    client.request("buttons", button_request=request)
    response = client.request(
        "buttons", button_request={**request, "action": "map", "app_id": "missing.app"}
    )["buttons"]
    assert response["error"] == "Target app is not installed."
    assert response["rules"][0]["mode"] == "default"


@pytest.mark.parametrize(
    "bridge_server", [{"buttons": True, "learned_code": code} for code in (158, 226)], indirect=True
)
def test_learn_reports_reserved_key_without_saving_it(bridge_server):
    receipt, fixture, _ = bridge_server
    request = {"action": "learn", "button": "netflix", "apply": True}
    response = BridgeClient("127.0.0.1", receipt).request("buttons", button_request=request)["buttons"]
    code = fixture["learned_code"]
    assert response["error"] == (
        f"Key code {code} (scan code 0x0000002A) is reserved. Press a dedicated app button."
    )
    assert response["rules"] == []
    assert not Path(fixture["buttons_file"]).exists()


@pytest.mark.parametrize(
    "bridge_server",
    [
        {
            "buttons": True,
            "key_layout": "XF86Netflix 226\nXF86Amazon 221\nXF86DisneyPlus 626\n",
            "key_codes": [221, 226, 626, 627],
            "initial_buttons": [
                {
                    "Button": "samsung-tv-plus",
                    "Device": "a" * 64,
                    "Code": 627,
                    "Scan": None,
                    "Mode": "default",
                }
            ],
        }
    ],
    indirect=True,
)
def test_named_frame_app_buttons_accept_requested_rules(bridge_server):
    receipt, _, _ = bridge_server
    client = BridgeClient("127.0.0.1", receipt)
    listing = client.request("buttons", button_request={"action": "list"})["buttons"]
    assert listing["discovered"] == [
        {"button": "disney-plus", "code": 626},
        {"button": "netflix", "code": 226},
        {"button": "prime-video", "code": 221},
    ]
    actions = [{"action": "map", "button": "netflix", "app_id": "test.app"}] + [
        {"action": "disable", "button": name} for name in ("disney-plus", "prime-video", "samsung-tv-plus")
    ]
    for action in actions:
        reply = client.request("buttons", button_request={**action, "apply": True})["buttons"]
        assert reply["error"] is None
    deadline = time.monotonic() + 2
    while True:
        rules = client.request("buttons", button_request={"action": "status"})["buttons"]["rules"]
        assert {rule["button"]: rule["mode"] for rule in rules} == {
            "netflix": "app",
            "disney-plus": "disabled",
            "prime-video": "disabled",
            "samsung-tv-plus": "disabled",
        }
        if all(rule["active"] for rule in rules):
            break
        assert time.monotonic() < deadline
        time.sleep(0.01)


@pytest.mark.parametrize(
    "bridge_server",
    [
        {
            "buttons": True,
            "initial_buttons": [
                {"Button": "netflix", "Device": "a" * 64, "Code": 240, "Scan": 42, "Mode": "disabled"}
            ],
        }
    ],
    indirect=True,
)
def test_saved_button_rule_activates_when_helper_starts(bridge_server):
    receipt, _, _ = bridge_server
    client = BridgeClient("127.0.0.1", receipt)
    deadline = time.monotonic() + 2
    while True:
        rule = client.request("buttons", button_request={"action": "status"})["buttons"]["rules"][0]
        assert rule["mode"] == "disabled"
        if rule["active"]:
            break
        assert time.monotonic() < deadline
        time.sleep(0.01)
    assert client.request("remove")["prepared_for_removal"] is True


def test_actual_native_tls_status_and_sdb_relay(bridge_server):
    receipt, fixture, _ = bridge_server
    status = BridgeClient("127.0.0.1", receipt).request()
    assert status["boot_id"] == fixture["boot_id"] and status["uid"] == 0
    assert status["runtime_version"] == root_state.RUNTIME_VERSION
    assert receipt["token"] not in json.dumps(status)
    with BridgeSdb("127.0.0.1", receipt) as session:
        assert session.duid() == "paired-tv"
        assert session.read_home_status() is None


@pytest.mark.parametrize(
    "bridge_server",
    [
        {
            "home_settings": {
                "home_button_app": "DclHome001.Home",
                "startup_app": None,
                "smart_hub_autostart": False,
            }
        }
    ],
    indirect=True,
)
def test_native_home_status_uses_authenticated_pairing(bridge_server):
    receipt, fixture, _ = bridge_server
    host = "127.0.0.1"
    status = BridgeClient(host, receipt).request()
    assert status["home_status_protocol"] == 1
    assert "home_settings" not in status
    with BridgeSdb(host, receipt) as session:
        assert session.read_home_status() == fixture["home_settings"]

    altered = {**receipt, "token": ("0" if receipt["token"][0] != "0" else "1") + receipt["token"][1:]}
    with pytest.raises(BridgeError):
        BridgeClient(host, altered, timeout=2).request("home_status")


@pytest.mark.parametrize("bridge_server", [{"identity_fail_once": True}], indirect=True)
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


@pytest.mark.parametrize("bridge_server", [{"pause_remove": True}], indirect=True)
def test_removal_stops_bridge_when_client_disconnects_before_reply(bridge_server):
    receipt, fixture, process = bridge_server
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    context.check_hostname = False
    context.verify_mode = ssl.CERT_NONE
    with (
        socket.create_connection(("127.0.0.1", receipt["bridge_port"]), timeout=5) as raw,
        context.wrap_socket(raw, server_hostname=None) as peer,
    ):
        peer.sendall(
            json.dumps(
                {"protocol": 1, "operation": "remove", "token": receipt["token"], "nonce": uuid.uuid4().hex}
            ).encode()
            + b"\n"
        )
        deadline = time.monotonic() + 5
        while not Path(fixture["remove_started_file"]).exists():
            assert process.poll() is None and time.monotonic() < deadline, "removal did not start"
            time.sleep(0.01)
        peer.setsockopt(
            socket.SOL_SOCKET, socket.SO_LINGER, struct.pack("hh" if os.name == "nt" else "ii", 1, 0)
        )
    Path(fixture["remove_release_file"]).write_text("continue")
    process.wait(timeout=5)
    assert Path(fixture["removed_file"]).read_text() == "removed"
    assert process.returncode == 0, process.stderr.read()
    with pytest.raises(OSError):
        socket.create_connection(("127.0.0.1", receipt["bridge_port"]), timeout=1)


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


@pytest.mark.parametrize("bridge_server", [{"buttons": True}], indirect=True)
def test_button_rename_preserves_physical_key_and_action_through_cli(
    bridge_server, tmp_path, monkeypatch, capsys
):
    receipt, fixture, _ = bridge_server
    path = root_state.receipt_path("127.0.0.1", tmp_path)
    root_state.save(path, receipt)
    monkeypatch.setattr(cli, "STATE_DIR", str(tmp_path))

    def command(*args):
        monkeypatch.setattr(
            "sys.argv", ["aerotizen", "--tv", "127.0.0.1", "buttons", *args, "--receipt", str(path), "--json"]
        )
        cli.main()
        return json.loads(capsys.readouterr().out)

    command("map", "netflix", "--app", "test.app", "--yes")
    stored = Path(fixture["buttons_file"])
    before = json.loads(stored.read_text())
    assert command("rename", "netflix", "--name", "Streaming")["preview"]
    assert json.loads(stored.read_text()) == before
    client = BridgeClient("127.0.0.1", receipt)
    duplicate = client.request(
        "buttons",
        button_request={
            "action": "rename",
            "button": "netflix",
            "new_name": "prime-video",
            "apply": True,
        },
    )["buttons"]
    assert duplicate["error"] == "A button already has this name."
    assert json.loads(stored.read_text()) == before
    missing = client.request(
        "buttons",
        button_request={
            "action": "rename",
            "button": "missing",
            "new_name": "Streaming",
            "apply": True,
        },
    )["buttons"]
    assert missing["error"] and json.loads(stored.read_text()) == before
    command("rename", "netflix", "--name", "Streaming", "--yes")
    assert json.loads(stored.read_text()) == [{**before[0], "Button": "Streaming"}]
    listing = command("list")
    assert listing["rules"][0]["button"] == "Streaming"
    assert not any(row["button"] == "netflix" for row in listing["discovered"])


@pytest.mark.parametrize("bridge_server", [{"buttons": True}], indirect=True)
def test_renaming_discovered_default_button_saves_one_original_action(bridge_server):
    receipt, fixture, _ = bridge_server
    client = BridgeClient("127.0.0.1", receipt)
    reply = client.request(
        "buttons",
        button_request={
            "action": "rename",
            "button": "netflix",
            "new_name": "Streaming",
            "apply": True,
        },
    )["buttons"]
    assert reply["rules"] == [
        {"button": "Streaming", "mode": "default", "app_id": None, "active": False, "detail": None}
    ]
    assert len(json.loads(Path(fixture["buttons_file"]).read_text())) == 1
    listing = client.request("buttons", button_request={"action": "list"})["buttons"]
    assert all(row["button"] != "netflix" for row in listing["discovered"])
