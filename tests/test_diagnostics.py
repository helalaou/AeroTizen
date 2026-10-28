import argparse
import json
import zipfile

import pytest

from aerotizen import build_info, cli, diagnostics
from aerotizen.sdb import CLSE, OKAY, WRTE, Sdb, SdbError

_read_metadata = diagnostics._metadata


@pytest.fixture(autouse=True)
def log_folder(monkeypatch, tmp_path):
    path = tmp_path / "logs"
    monkeypatch.setenv("AEROTIZEN_LOG_DIR", str(path))
    monkeypatch.setattr(diagnostics, "_metadata", lambda host: {"state": "unavailable", "model": None})
    return path


def test_logging_preserves_machine_output_and_redacts_fragmented_secrets(tmp_path, capsys, log_folder):
    def command(args):
        print('{"result": true}')
        print("token=", end="")
        print("SECRET-CREDENTIAL")
        diagnostics.event(
            "error", password="HIDDEN", message="http://tv/path?authKey=HIDDEN /Users/private-person/logs"
        )

    diagnostics.run_logged(argparse.Namespace(cmd="home"), command, tmp_path)
    assert capsys.readouterr().out == '{"result": true}\ntoken=SECRET-CREDENTIAL\n'
    text = next(log_folder.glob("*.log")).read_text()
    assert "SECRET-CREDENTIAL" not in text and "HIDDEN" not in text and "private-person" not in text
    assert "command.finish" in text


def test_logs_rotate_without_touching_backups_and_failures_keep_original_exit(
    tmp_path, capsys, log_folder, monkeypatch
):
    original = tmp_path / "backups" / "original-home.json"
    original.parent.mkdir()
    original.write_text("original")
    monkeypatch.setattr(diagnostics, "MAX_LOG_FILES", 2)
    for _ in range(3):
        diagnostics.run_logged(argparse.Namespace(cmd="home"), lambda args: None, tmp_path)
    assert len(list(log_folder.glob("*.log"))) == 2 and original.read_text() == "original"
    with pytest.raises(SystemExit, match="failure"):
        diagnostics.run_logged(
            argparse.Namespace(cmd="home"),
            lambda args: (_ for _ in ()).throw(SystemExit("failure")),
            tmp_path,
        )
    assert "Diagnostic log:" in capsys.readouterr().err


def test_unwritable_log_storage_never_blocks_a_command(tmp_path, monkeypatch):
    target = tmp_path / "not-a-directory"
    target.write_text("file")
    monkeypatch.setenv("AEROTIZEN_LOG_DIR", str(target))
    called = []
    diagnostics.run_logged(argparse.Namespace(cmd="status"), lambda args: called.append(True), tmp_path)
    assert called == [True]


def test_auth_console_is_not_captured(tmp_path, log_folder):
    diagnostics.run_logged(
        argparse.Namespace(cmd="certs"), lambda args: print("ONE-TIME-LOGIN-CODE"), tmp_path
    )
    assert "ONE-TIME-LOGIN-CODE" not in next(log_folder.glob("*.log")).read_text()


def test_export_is_offline_by_default_and_omits_recovery_credentials(tmp_path, monkeypatch, log_folder):
    from aerotizen import device

    monkeypatch.setattr(device, "DeviceSession", lambda *a, **kw: pytest.fail("No TV contact"))
    log_folder.mkdir()
    (log_folder / "cli-session.log").write_text("token=TOPSECRET\n" + "x" * 9000 + "\nlast-event\n")
    receipt = tmp_path / "backups" / "device" / "transactions" / "tx.json"
    receipt.parent.mkdir(parents=True)
    receipt.write_text(
        json.dumps(
            {
                "request": {"baseline_base64": "PRIVATE-BASELINE"},
                "state": "rolled_back",
                "native_result": {"Failure": {"Phase": "final", "Observed": {"Main": "Firmware.Home"}}},
            }
        )
    )
    (tmp_path / "certs").mkdir()
    (tmp_path / "certs" / "secret.p12").write_text("CERTIFICATE")
    target = tmp_path / "support.zip"
    diagnostics.export_logs(tmp_path, target)
    with zipfile.ZipFile(target) as archive:
        text = "".join(archive.read(name).decode() for name in archive.namelist())
        assert "TOPSECRET" not in text and "PRIVATE-BASELINE" not in text and "CERTIFICATE" not in text
        assert "Firmware.Home" in text and "last-event" in text
    with pytest.raises(FileExistsError):
        diagnostics.export_logs(tmp_path, target)


def test_unavailable_tv_still_exports_pc_diagnostics(tmp_path, monkeypatch):
    from aerotizen import device

    def unavailable(*args, **kwargs):
        raise SdbError("cannot reach 192.0.2.10")

    monkeypatch.setattr(device, "DeviceSession", unavailable)
    target, state = diagnostics.export_logs(tmp_path, tmp_path / "support.zip", "192.0.2.10")
    assert state == "unavailable"
    with zipfile.ZipFile(target) as archive:
        assert "192.0.2.10" not in archive.read("report.json").decode()


def test_fetch_tv_is_only_a_bounded_read_of_the_log_endpoint():
    class Session:
        def tcp_request(self, port, request, **limits):
            assert port == 47790 and b"GET /diagnostics/logs " in request
            assert b"X-AeroTizen-Diagnostics: 1" in request and limits["timeout"] == 5
            body = json.dumps(
                {"schema_version": 1, "records": [{"source": "ui", "event": "ui.start"}]}
            ).encode()
            return b"HTTP/1.0 200 OK\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body

    assert diagnostics.fetch_tv(Session())["records"][0]["source"] == "ui"


def test_sdb_tcp_request_closes_stream_without_a_second_connection():
    session = Sdb("unused")

    class Socket:
        def gettimeout(self):
            return 15

        def settimeout(self, value):
            pass

        def close(self):
            pass

    session.sock = Socket()
    packets = iter([(OKAY, 2, 1, b""), (WRTE, 2, 1, b"HTTP response"), (CLSE, 2, 1, b"")])
    sent = []
    session._recv = lambda *args: next(packets)
    session._send = lambda *args: sent.append(args)
    assert session.tcp_request(47790, b"GET request") == b"HTTP response"
    assert sent[0][3] == b"tcp:47790\0" and sent[1][0] == WRTE and session.sock is not None


def test_sdb_tcp_request_output_failure_discards_uncertain_connection():
    session = Sdb("unused")

    class Socket:
        def gettimeout(self):
            return 15

        def close(self):
            pass

    session.sock = Socket()
    packets = iter([(OKAY, 2, 1, b""), (WRTE, 2, 1, b"too large")])
    session._recv = lambda *args: next(packets)
    session._send = lambda *args: None
    with pytest.raises(SdbError, match="limit"):
        session.tcp_request(47790, b"GET", max_output=2)
    assert session.sock is None


def test_log_export_command_never_discovers_a_tv_without_explicit_target(tmp_path, monkeypatch, capsys):
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    monkeypatch.setattr(cli, "pick_tv", lambda args: pytest.fail("No discovery"))
    monkeypatch.setattr(
        "sys.argv", ["aerotizen", "logs", "export", "--output", str(tmp_path / "support.zip")]
    )
    cli.main()
    assert "not_requested" in capsys.readouterr().out


def test_fetch_retains_all_tv_records_and_ignores_unknown_top_level_fields():
    class Session:
        def tcp_request(self, *args, **kwargs):
            body = json.dumps(
                {
                    "schema_version": 1,
                    "private": "PRIVATE",
                    "records": [
                        {"source": "service", "event": f"event.{i}", "extra": "PRIVATE"} for i in range(200)
                    ],
                }
            ).encode()
            return b"HTTP/1.0 200 OK\r\n\r\n" + body

    data = diagnostics.fetch_tv(Session())
    assert len(data["records"]) == 200 and "PRIVATE" not in json.dumps(data)


@pytest.mark.parametrize("body", [b"not json", b"{}", b'{"schema_version":1,"records":[{}]}'])
def test_invalid_tv_responses_are_rejected(body):
    class Session:
        def tcp_request(self, *args, **kwargs):
            return b"HTTP/1.0 200 OK\r\n\r\n" + body

    with pytest.raises(ValueError):
        diagnostics.fetch_tv(Session())


def test_log_size_is_bounded_even_during_a_noisy_command(tmp_path, log_folder, monkeypatch):
    monkeypatch.setattr(diagnostics, "MAX_LOG_BYTES", 1500)

    def command(args):
        for _ in range(100):
            diagnostics.event("test", message="x" * 200)

    diagnostics.run_logged(argparse.Namespace(cmd="status"), command, tmp_path)
    path = next(log_folder.glob("*.log"))
    assert path.stat().st_size <= 1500
    assert json.loads(path.read_text().splitlines()[-1])["event"] == "command.finish"


def test_partial_export_skips_bad_receipts_and_symlinks(tmp_path, log_folder):
    receipts = tmp_path / "backups" / "device" / "transactions"
    receipts.mkdir(parents=True)
    (receipts / "bad.json").write_text("not json")
    (receipts / "list.json").write_text("[]")
    # Creating symlinks requires extra privileges on some Windows runners.
    if __import__("os").name != "nt":
        (receipts / "missing.json").symlink_to(tmp_path / "missing")
    target, _ = diagnostics.export_logs(tmp_path, tmp_path / "report.zip")
    with zipfile.ZipFile(target) as archive:
        assert archive.namelist() == ["report.json"]


def test_tcp_request_real_framing_preserves_owned_connection():
    import socket
    import threading

    from aerotizen.sdb import OPEN
    from conftest import _frame, _read_frame

    local, peer = socket.socketpair()
    local.settimeout(1)
    errors = []

    def server():
        try:
            command, client_id, _, payload = _read_frame(peer)
            assert command == OPEN and payload == b"tcp:47790\0"
            peer.sendall(_frame(OKAY, 23, client_id))
            command, _, remote_id, payload = _read_frame(peer)
            assert command == WRTE and remote_id == 23 and payload == b"GET"
            peer.sendall(_frame(OKAY, 23, client_id))
            peer.sendall(_frame(WRTE, 23, client_id, b"response"))
            assert _read_frame(peer)[0] == OKAY
            peer.sendall(_frame(CLSE, 23, client_id))
            assert _read_frame(peer)[0] == CLSE
        except BaseException as error:
            errors.append(error)

    worker = threading.Thread(target=server, daemon=True)
    worker.start()
    session = Sdb("unused")
    session.sock = local
    try:
        assert session.tcp_request(47790, b"GET", timeout=1) == b"response"
        assert session.sock is local and local.gettimeout() == 1
    finally:
        worker.join(timeout=2)
        session.close()
        peer.close()
    assert not errors and not worker.is_alive()


def test_tcp_request_deadline_closes_stalled_connection():
    import socket

    local, peer = socket.socketpair()
    session = Sdb("unused")
    session.sock = local
    try:
        with pytest.raises((OSError, SdbError)):
            session.tcp_request(47790, b"GET", timeout=0.02)
        assert session.sock is None
    finally:
        local.close()
        peer.close()


def test_export_keeps_large_structured_events_valid(tmp_path, log_folder):
    log_folder.mkdir()
    record = {"event": "home.native_result", "data": {f"field{i}": "x" * 500 for i in range(30)}}
    record["data"]["token"] = "PRIVATE"
    (log_folder / "cli-large.log").write_text(json.dumps(record))
    target, _ = diagnostics.export_logs(tmp_path, tmp_path / "report.zip")
    with zipfile.ZipFile(target) as archive:
        exported = json.loads(archive.read("cli/session-1.log"))
        assert len(exported["data"]) == 31 and exported["data"]["token"] == "[redacted]"


def test_rapid_commands_keep_the_current_log(tmp_path, monkeypatch):
    monkeypatch.setattr(diagnostics, "MAX_LOG_FILES", 2)
    for _ in range(15):
        session = diagnostics.LogSession(tmp_path, argparse.Namespace(cmd="status"))
        session.close()
        assert session.path.is_file()


def test_export_preserves_all_tv_events_and_public_environment(tmp_path, monkeypatch):
    from aerotizen import device

    class Session:
        def __init__(self, *args, **kwargs):
            pass

        def connect(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def tcp_request(self, *args, **kwargs):
            body = json.dumps(
                {
                    "schema_version": 1,
                    "records": [
                        {
                            "source": "ui",
                            "event": "ui.start",
                            "session": "s",
                            "sequence": i + 1,
                            "elapsed_ms": i,
                            "data": {"build_id": "a" * 64, "payload": "PRIVATE"},
                        }
                        for i in range(200)
                    ],
                    "environment": {
                        "tizen": "9.0.0",
                        "firmware": "test-firmware",
                        "arch": "arm",
                        "secret": "PRIVATE",
                    },
                    "build": {"version": "2.4.0", "build_id": "a" * 64},
                    "ui": {"build": {"version": "2.4.0", "build_id": "a" * 64}, "queued": 7},
                    "health": {"discarded": 5, "storage": "failed", "private": "PRIVATE"},
                }
            ).encode()
            return b"HTTP/1.0 200 OK\r\n\r\n" + body

    monkeypatch.setattr(device, "DeviceSession", Session)
    monkeypatch.setattr(diagnostics, "_metadata", lambda host: {"state": "collected", "model": "TEST-TV"})
    monkeypatch.setattr(diagnostics, "_native_snapshot", lambda session: pytest.fail("Snapshot is opt-in"))
    target, state = diagnostics.export_logs(tmp_path, tmp_path / "support.zip", "192.0.2.1")
    with zipfile.ZipFile(target) as archive:
        raw = archive.read("report.json").decode()
        report = json.loads(raw)
    assert state == "collected" and "PRIVATE" not in raw
    assert len(report["tv"]["logs"]["records"]) == 200
    assert report["tv"]["logs"]["records"][-1]["sequence"] == 200
    assert report["environment"]["launcher"]["build_id"] == "a" * 64
    assert report["environment"]["state"] == "collected"
    assert report["native_home"]["state"] == "not_requested"
    assert report["tv"]["logs"]["health"]["discarded"] == 5


def test_native_snapshot_uses_only_read_status_and_filters_identity(monkeypatch):
    from aerotizen import home

    def status(session, provider, info):
        assert session == "session" and provider is None
        return {
            "queried_at": "now",
            "complete": True,
            "home": {"mode": "native"},
            "device": {"identity_sha256": "PRIVATE", "firmware_build": "test", "os_version": "9"},
            "watcher": {"state": "native", "control": "PRIVATE"},
            "evidence": {
                "access": "sdk_uid_901",
                "uid": 901,
                "sdk_staging_cleaned": True,
                "query_staging_cleaned": True,
            },
        }

    monkeypatch.setattr(home, "read_status", status)
    result = diagnostics._native_snapshot("session")
    assert result["state"] == "collected" and "PRIVATE" not in json.dumps(result)


def test_include_home_requires_explicit_tv_without_discovery(tmp_path, monkeypatch):
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    monkeypatch.setattr(cli, "pick_tv", lambda args: pytest.fail("No discovery"))
    monkeypatch.setattr("sys.argv", ["aerotizen", "logs", "export", "--include-home"])
    with pytest.raises(SystemExit, match="--tv"):
        cli.main()


def test_cli_sequence_error_context_and_health_survive_clock_jumps(tmp_path, monkeypatch, log_folder):
    ticks = iter([10, 10, 10, 11, 12, 12])
    monkeypatch.setattr(diagnostics.time, "monotonic", lambda: next(ticks, 12))

    def command(args):
        diagnostics.event("step", build_id="a" * 64)
        raise ValueError("token=SECRET")

    with pytest.raises(ValueError):
        diagnostics.run_logged(argparse.Namespace(cmd="status"), command, tmp_path)
    records = [json.loads(line) for line in next(log_folder.glob("*.log")).read_text().splitlines()]
    assert [item["sequence"] for item in records] == [1, 2, 3]
    assert records[-1]["data"]["health"]["storage"] == "ready"
    assert records[-1]["data"]["stack"] and all("/" not in frame for frame in records[-1]["data"]["stack"])
    assert "SECRET" not in json.dumps(records)


def test_cli_content_identity_changes_with_source_and_reads_embedded_stamp(tmp_path, monkeypatch):
    source = tmp_path / "src/aerotizen"
    source.mkdir(parents=True)
    (source / "main.py").write_text("value=1")
    first = build_info.describe(tmp_path, "2.4.0")
    (source / "main.py").write_text("value=2")
    second = build_info.describe(tmp_path, "2.4.0")
    assert first["build_id"] != second["build_id"]
    (source / "_build.json").write_text(json.dumps(second))
    assert build_info.describe(tmp_path)["build_id"] == second["build_id"]
    monkeypatch.setattr(build_info, "__file__", str(source / "build_info.py"))
    build_info.current.cache_clear()
    try:
        assert build_info.current() == second
    finally:
        build_info.current.cache_clear()


def test_metadata_fetch_is_bounded_and_excludes_tv_identity(monkeypatch):
    # Use the original helper because the common fixture disables all network metadata.
    from unittest.mock import patch

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self, count):
            assert count == 65537
            return json.dumps(
                {
                    "device": {
                        "modelName": "TEST-TV",
                        "model": "platform",
                        "duid": "PRIVATE",
                        "name": "PRIVATE",
                    }
                }
            ).encode()

    def request(url, timeout):
        assert url == "http://192.0.2.1:8001/api/v2/" and timeout == 2
        return Response()

    with patch.object(diagnostics.urllib.request, "urlopen", request):
        result = _read_metadata("192.0.2.1")
    assert result["model"] == "TEST-TV" and "PRIVATE" not in json.dumps(result)


def test_redaction_removes_quoted_spaced_credentials_and_nonfinite_numbers():
    assert "PRIVATE" not in diagnostics.redact('authkey="PRIVATE FIRST SECOND"')
    assert "SECOND" not in diagnostics.redact('authkey="PRIVATE FIRST SECOND"')
    assert diagnostics.redact(float("nan")) is None


@pytest.mark.parametrize("fails", [False, True])
def test_optional_home_snapshot_never_prevents_partial_zip(tmp_path, monkeypatch, fails):
    from aerotizen import device

    class Session:
        def __init__(self, *args, **kwargs):
            pass

        def connect(self):
            return self

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

    monkeypatch.setattr(device, "DeviceSession", Session)
    monkeypatch.setattr(diagnostics, "fetch_tv", lambda session: {"records": []})

    def snapshot(session):
        if fails:
            raise SdbError("query unavailable")
        return {"state": "collected", "home": {"mode": "native"}}

    monkeypatch.setattr(diagnostics, "_native_snapshot", snapshot)
    target, _ = diagnostics.export_logs(tmp_path, tmp_path / "report.zip", "192.0.2.1", include_home=True)
    with zipfile.ZipFile(target) as archive:
        report = json.loads(archive.read("report.json"))
    assert report["native_home"]["state"] == ("unavailable" if fails else "collected")


def test_report_retains_safe_error_locations_and_known_home_operations():
    assert diagnostics.redact("Authorization: Bearer PRIVATE") == "Authorization=[redacted] [redacted]"
    assert diagnostics.redact("http://tizen.org/appcontrol/operation/main", "operation").endswith("/main")
    assert (
        diagnostics.redact("TypeError: payload PRIVATE\n at f (file:///opt/apps.js:12:4)", "stack")
        == "apps.js:12:4"
    )
    assert diagnostics.redact("apps.js:12:4", "stack") == "apps.js:12:4"
