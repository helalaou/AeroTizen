"""Read-only native queries and immutable backup failure boundaries."""

import copy
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
from contextlib import contextmanager
from pathlib import Path

import pytest

from aerotizen import cli, home, home_control, root, sdk

ROOT = Path(__file__).resolve().parents[1]


def query():
    return {
        "schema_version": 1,
        "read_only": True,
        "uid": 0,
        "architecture_bits": 32,
        "os_release": {"ID": "tizen", "VERSION_ID": "9.0.0", "BUILD_ID": "T-TEST-001"},
        "main_operation": {"type": "string", "status": "ok", "value": "com.samsung.tv.csfs"},
        "settings": {
            key: {"type": kind, "status": "ok", "value": 1 if kind == "int" else "com.samsung.tv.csfs"}
            for key, kind in home.SETTINGS.items()
        },
        "watcher": {"state": "active", "reachable": True},
        "launcher": {"installed": True, "error": None},
    }


def output(document):
    return home.QUERY_PREFIX + json.dumps(document) + "\n" + home.CLEANUP_MARKER + "\n"


def test_boot_evidence_accepts_uuid_and_uptime():
    value = query()
    value["boot"] = {"id": "00000000-0000-4000-8000-000000000001", "uptime_seconds": 40.5}
    assert home.parse_query(output(value))["boot"] == value["boot"]


@pytest.mark.parametrize(
    "boot",
    [
        [],
        {"id": "bad", "uptime_seconds": 3},
        {"id": 3},
        {"id": "00000000-0000-4000-8000-000000000001", "uptime_seconds": -1},
        {"id": "00000000-0000-4000-8000-000000000001", "uptime_seconds": float("nan")},
    ],
)
def test_malformed_boot_evidence_is_refused(boot):
    value = query()
    value["boot"] = boot
    with pytest.raises(home.HomeError):
        home.parse_query(output(value))


@pytest.fixture
def status():
    q = query()
    return {
        "schema_version": 1,
        "queried_at": "2026-10-24T18:00:00+00:00",
        "complete": True,
        "device": {
            "identity_sha256": "a" * 64,
            "model": "TEST-FRAME",
            "platform": "TEST",
            "firmware_build": "T-TEST-001",
            "os_version": "9.0.0",
            "cpu_arch": "armv7",
        },
        "home": {
            "operation": home.OPERATION,
            "main_operation": q["main_operation"],
            "settings": q["settings"],
            "mode": "stock",
        },
        "watcher": q["watcher"],
        "launcher": q["launcher"],
        "evidence": {
            "authenticated": True,
            "upstream_staging_cleaned": True,
            "query_staging_cleaned": True,
            "system_files_unchanged": True,
            "uid": 0,
            "access": "temporary_root",
            "helper_sha256": "b" * 64,
            "root_tool_version": "0.0.12",
        },
    }


def test_native_helper_imports_only_getters_and_memory_functions():
    source = (ROOT / "native/home-query/HomeQuery.cs").read_text()
    imports = set(re.findall(r"extern\s+(?:uint|void|IntPtr|int)\s+(\w+)\(", source))
    assert imports == {"getuid", "free", "vconf_get_str", "vconf_get_int", "app_operation_get_current_app"}


def test_packaged_helper_matches_current_source_and_loads():
    manifest = json.loads(home.PAYLOAD_PATH.read_text())
    sources = (
        (ROOT / "native/home-query/HomeQuery.cs").read_bytes()
        + b"\0"
        + (ROOT / "native/home-query/HomeQuery.csproj").read_bytes()
        + b"\0"
        + (ROOT / "native/home-common/Installation.cs").read_bytes()
    )
    assert manifest["source_sha256"] == hashlib.sha256(sources).hexdigest()
    files = home.load_helper()
    assert files[home.HELPER_FILES[0]].startswith(b"MZ")
    runtime = json.loads(files[home.HELPER_FILES[1]])["runtimeOptions"]
    assert runtime["rollForward"] == "Major"


@pytest.mark.parametrize("installed", [True, False, None])
def test_installation_evidence_distinguishes_absent_from_unknown(installed):
    value = query()
    value["launcher"] = {"installed": installed, "error": "query denied" if installed is None else None}
    assert home.parse_query(output(value))["launcher"]["installed"] is installed


@pytest.mark.parametrize("launcher", [{}, {"installed": 0}, {"installed": "false"}, None])
def test_malformed_installation_evidence_is_refused(launcher):
    value = query()
    value["launcher"] = launcher
    with pytest.raises(home.HomeError):
        home.parse_query(output(value))


@pytest.mark.parametrize("manifest", [[], {}, {"schema_version": True, "files": {}}])
def test_bad_payload_is_rejected_before_root(tmp_path, monkeypatch, manifest):
    path = tmp_path / "payload.json"
    path.write_text(json.dumps(manifest))
    monkeypatch.setattr(home, "PAYLOAD_PATH", path)
    with pytest.raises(home.HomeError, match="helper is missing or invalid"):
        home.load_helper()


def test_query_requires_typed_values_and_explicit_cleanup():
    assert home.parse_query(output(query()))["settings"][home.HOME_KEY]["value"] == "com.samsung.tv.csfs"
    with pytest.raises(home.HomeError, match="cleanup"):
        home.parse_query(home.QUERY_PREFIX + json.dumps(query()))
    q = query()
    q["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = True
    with pytest.raises(home.HomeError, match="typed"):
        home.parse_query(output(q))


def test_unavailable_native_value_is_not_replaced_by_a_default():
    q = query()
    q["main_operation"] = {"type": "string", "status": "unavailable", "value": None, "error": "denied"}
    result = home.parse_query(output(q))
    assert result["main_operation"]["value"] is None
    assert home._mode(result["main_operation"], result["settings"]) == "unknown"


def test_read_status_checks_identity_after_reconnection(monkeypatch):
    class Session:
        identities = iter(["tv-one", "tv-two"])

        def duid(self):
            return next(self.identities)

        def capability(self):
            return {"cpu_arch": "armv7"}

        def root(self, provider, commands):
            return {
                "commands": [{"stdout": output(query())}],
                "authenticated": True,
                "staging_cleaned": True,
                "system_files_unchanged": True,
            }

    with pytest.raises(home.HomeError, match="identity changed"):
        home.read_status(Session(), object(), {})


def test_backup_is_device_bound_private_and_idempotent(tmp_path, status):
    first = home.save_backup(status, state_dir=tmp_path)
    path = Path(first["path"])
    original, modified = path.read_bytes(), path.stat().st_mtime_ns
    status["queried_at"] = "2026-10-25T18:00:00+00:00"
    second = home.save_backup(status, state_dir=tmp_path)
    assert first["created"] and not second["created"]
    assert second["matches_current"] and second["sha256"] == first["sha256"]
    assert path.read_bytes() == original and path.stat().st_mtime_ns == modified
    assert path.parent.name == "a" * 64
    if os.name != "nt":
        assert path.stat().st_mode & 0o777 == 0o600


def test_backup_preserves_original_when_values_or_firmware_change(tmp_path, status):
    first = home.save_backup(status, state_dir=tmp_path)
    path = Path(first["path"])
    original = path.read_bytes()
    status["home"]["settings"]["db/appfw/startup_appid"]["value"] = "org.tizen.tv-viewer"
    status["device"]["firmware_build"] = "T-TEST-002"
    second = home.save_backup(status, state_dir=tmp_path)
    assert not second["created"] and not second["matches_current"] and not second["firmware_matches"]
    assert path.read_bytes() == original


@pytest.mark.parametrize("custom_output", [False, True])
@pytest.mark.parametrize("profile", ["New User", "Bénédicte 名"])
def test_backup_creates_missing_parent_directories(tmp_path, status, custom_output, profile):
    state_dir = tmp_path / profile / ".config" / "aerotizen"
    output = tmp_path / profile / "chosen" / "tv" / "original-home.json" if custom_output else None
    expected = output or state_dir / "backups" / status["device"]["identity_sha256"] / "original-home.json"
    assert not expected.parent.exists()
    result = home.save_backup(status, output=output, state_dir=state_dir)
    assert result["created"] and Path(result["path"]) == expected
    assert result["matches_current"] and result["firmware_matches"]
    assert json.loads(expected.read_bytes()) == home.baseline_from_status(status)


def test_launcher_boot_backup_drift_keeps_the_existing_original(tmp_path, status):
    saved = home.save_backup(status, state_dir=tmp_path)
    path = Path(saved["path"])
    raw = path.read_bytes()
    status["home"]["settings"]["db/appfw/booting_appid_backup"]["value"] = home.releases.APP_ID
    result = home.save_backup(status, state_dir=tmp_path)
    assert not result["created"] and not result["matches_current"]
    assert result["sha256"] == saved["sha256"] and path.read_bytes() == raw


def test_launcher_boot_backup_drift_cannot_be_saved_as_an_original(tmp_path, status):
    status["home"]["settings"]["db/appfw/booting_appid_backup"]["value"] = home.releases.APP_ID
    with pytest.raises(home.HomeError, match="before opening"):
        home.save_backup(status, state_dir=tmp_path)
    assert not list(tmp_path.rglob("original-home.json"))
    assert not (tmp_path / "backups").exists()


@pytest.mark.parametrize("complete", [True, False])
def test_existing_original_is_preserved_after_native_apply(tmp_path, status, complete):
    saved = home.save_backup(status, state_dir=tmp_path)
    path = Path(saved["path"])
    raw, modified = path.read_bytes(), path.stat().st_mtime_ns
    status["home"]["main_operation"]["value"] = home.releases.APP_ID
    for item in status["home"]["settings"].values():
        item["value"] = 1 if item["type"] == "int" else home.releases.APP_ID
    status["complete"] = complete
    result = home.save_backup(status, state_dir=tmp_path)
    assert not result["created"] and not result["matches_current"]
    assert result["sha256"] == saved["sha256"]
    assert path.read_bytes() == raw and path.stat().st_mtime_ns == modified


def test_existing_backup_for_another_device_is_never_replaced(tmp_path, status):
    path = tmp_path / "original.json"
    home.save_backup(status, output=path)
    original = path.read_bytes()
    other = copy.deepcopy(status)
    other["device"]["identity_sha256"] = "c" * 64
    with pytest.raises(home.HomeError, match="device binding"):
        home.save_backup(other, output=path)
    assert path.read_bytes() == original


@pytest.mark.parametrize("contents", ["not json", "{}", "[]"])
def test_existing_invalid_backup_is_never_replaced(tmp_path, status, contents):
    path = tmp_path / "original.json"
    path.write_text(contents)
    with pytest.raises(home.HomeError):
        home.save_backup(status, output=path)
    assert path.read_text() == contents


def test_incomplete_or_already_overridden_state_cannot_become_original(tmp_path, status):
    status["complete"] = False
    with pytest.raises(home.HomeError, match="incomplete"):
        home.save_backup(status, state_dir=tmp_path)
    status["complete"] = True
    status["home"]["main_operation"]["value"] = home.releases.APP_ID
    with pytest.raises(home.HomeError, match="already present"):
        home.save_backup(status, state_dir=tmp_path)
    assert not list(tmp_path.rglob("original-home.json"))


def test_backup_creation_failure_leaves_no_partial_original(tmp_path, status, monkeypatch):
    def failed_link(*args):
        raise OSError("filesystem failed")

    monkeypatch.setattr(home.os, "link", failed_link)
    with pytest.raises(home.HomeError, match=r"atomic hard link failed.*filesystem failed"):
        home.save_backup(status, output=tmp_path / "original.json")
    assert list(tmp_path.iterdir()) == []


@pytest.mark.parametrize(
    ("stage", "message"),
    [
        ("directory", "Cannot create Home backup directory"),
        ("temporary", "Cannot create temporary Home backup"),
        ("link", "Cannot publish original Home backup"),
    ],
)
def test_backup_path_failure_identifies_the_operation(tmp_path, status, monkeypatch, stage, message):
    path = tmp_path / "new" / "tv" / "original-home.json"
    error = FileNotFoundError(2, "The system cannot find the path specified", str(path))
    error.winerror = 3

    def fail(*args, **kwargs):
        raise error

    if stage == "directory":
        monkeypatch.setattr(Path, "mkdir", fail)
    elif stage == "temporary":
        monkeypatch.setattr(home.tempfile, "mkstemp", fail)
    else:
        monkeypatch.setattr(home.os, "link", fail)
    with pytest.raises(home.HomeError, match=message) as raised:
        home.save_backup(status, output=path)
    assert raised.value.__cause__ is error
    assert str(error) in str(raised.value)
    assert not path.exists() and not list(tmp_path.rglob(".home-backup-*"))
    assert path.parent.exists() is (stage != "directory")
    if stage == "link":
        assert "Parent directory creation completed" in str(raised.value)
        assert f"path length {len(str(path))}" in str(raised.value)


def test_concurrent_original_wins_without_replacement(tmp_path, status, monkeypatch):
    path = tmp_path / "original.json"
    original = home.baseline_from_status(status)
    original["captured_at"] = "earlier"
    raw = json.dumps(original).encode()

    def winner(*args):
        path.write_bytes(raw)
        raise FileExistsError()

    monkeypatch.setattr(home.os, "link", winner)
    result = home.save_backup(status, output=path)
    assert not result["created"] and path.read_bytes() == raw


@pytest.mark.parametrize("action", ["status", "backup"])
def test_root_mode_requires_tools_before_discovery(monkeypatch, action):
    monkeypatch.setattr(cli, "pick_tv", lambda *args: pytest.fail("must not contact a TV"))
    monkeypatch.setattr(cli.shutil, "which", lambda *args: None)
    monkeypatch.delenv("SDB", raising=False)
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", action, "--root"])
    with pytest.raises(SystemExit, match="Pass --root-tool"):
        cli.main()


@pytest.mark.parametrize("action", ["status", "backup"])
def test_cli_routes_read_only_home_commands_and_closes_session(monkeypatch, tmp_path, status, action, capsys):
    events = []
    session, provider = object(), object()

    @contextmanager
    def connect(host):
        assert host == "192.0.2.10"
        events.append("connect")
        try:
            yield session
        finally:
            events.append("close")

    def read(actual_session, actual_provider, info):
        assert actual_session is session and actual_provider is provider
        events.append("query")
        return copy.deepcopy(status)

    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(cli.remote, "info", lambda host: {"modelName": "TEST-FRAME"})
    monkeypatch.setattr(root, "SamsungTvRoot", lambda *args: provider)
    monkeypatch.setattr(home, "read_status", read)
    monkeypatch.setattr(
        "sys.argv",
        [
            "aerotizen",
            "--tv",
            "192.0.2.10",
            "home",
            action,
            "--root",
            "--root-tool",
            "/root-tool",
            "--sdb",
            "/sdb",
            "--json",
        ],
    )
    cli.main()
    result = json.loads(capsys.readouterr().out)
    assert result["home"]["mode"] == "stock" and events == ["connect", "query", "close"]
    assert ("backup" in result) == (action == "backup")
    assert len(list(tmp_path.rglob("original-home.json"))) == (1 if action == "backup" else 0)


@pytest.mark.parametrize("action", ["status", "backup", "apply", "restore"])
@pytest.mark.parametrize("json_output", [False, True])
def test_cli_reports_missing_tv_runtime_without_backup_or_writer(
    monkeypatch, tmp_path, action, json_output, capsys
):
    events = []

    class Session:
        def duid(self):
            return "test-device"

        def capability(self):
            return {"cpu_arch": "arm", "platform_version": "5.5"}

    @contextmanager
    def connect(host):
        assert host == "192.0.2.10"
        events.append("connect")
        try:
            yield Session()
        finally:
            events.append("close")

    def run(session, files, entrypoint, args=()):
        assert entrypoint == home.HELPER_FILES[0] and not args
        events.append("runtime_check")
        return sdk.parse_output(
            sdk.DOTNET_UNAVAILABLE_MARKER + "\n" + sdk.CLEANUP_MARKER + "\n" + sdk.EXIT_PREFIX + "127\n"
        )

    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(home, "device_info", lambda *args, **kwargs: {})
    monkeypatch.setattr(home, "load_helper", lambda: {name: b"dll" for name in home.HELPER_FILES})
    monkeypatch.setattr(home_control, "load_helper", lambda: {})
    monkeypatch.setattr(sdk, "run", run)
    argv = ["aerotizen", "--tv", "192.0.2.10", "home", action]
    if action in ("apply", "restore"):
        argv.append("--yes")
    if json_output:
        argv.append("--json")
    monkeypatch.setattr("sys.argv", argv)

    with pytest.raises(SystemExit, match=f"Home {action} failed: Native Home is unavailable") as raised:
        cli.main()

    message = str(raised.value)
    assert "/usr/bin/dotnet is missing or not executable on the TV" in message
    assert "Installing .NET on your computer will not fix this" in message
    assert "Use the default watcher setup instead" in message
    assert sdk.DOTNET_UNAVAILABLE_MARKER not in message
    assert events == ["connect", "runtime_check", "close"]
    assert not list(tmp_path.iterdir()) and not capsys.readouterr().out


def test_zero_autostart_is_preserved_as_an_integer(tmp_path, status):
    status["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 0
    saved = home.save_backup(status, state_dir=tmp_path)
    value = json.loads(Path(saved["path"]).read_text())["home"]["settings"][
        "db/menu/smart_hub/ontvsetting/auto_start"
    ]["value"]
    assert type(value) is int and value == 0


def test_native_mode_requires_both_home_assignments():
    q = query()
    q["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    assert home._mode(q["main_operation"], q["settings"]) == "inconsistent"
    q["main_operation"]["value"] = home.releases.APP_ID
    assert home._mode(q["main_operation"], q["settings"]) == "native"


@pytest.mark.skipif(os.name == "nt", reason="The TV staging script uses POSIX shell")
@pytest.mark.parametrize("exit_code", [0, 7])
def test_staging_script_checksums_runs_and_cleans_up(tmp_path, exit_code, monkeypatch):
    executable = tmp_path / "dotnet"
    executable.write_text(
        "#!/bin/sh\n"
        + (
            "printf '%s\\n' " + shlex.quote(home.QUERY_PREFIX + json.dumps(query())) + "\n"
            if exit_code == 0
            else ""
        )
        + f"exit {exit_code}\n"
    )
    executable.chmod(0o700)
    files = {name: b"sample assembly" for name in home.HELPER_FILES}
    script = home.query_script(files)
    directory = Path(re.search(r"^work=(.+)$", script, re.M)[1])
    script = script.replace("/usr/bin/dotnet", shlex.quote(str(executable)))
    if not shutil.which("sha256sum"):
        script = script.replace("sha256sum -c -", "shasum -a 256 -c -")
    monkeypatch.setattr(home, "query_script", lambda files: script)
    command = home.query_command(files)
    assert "\\" not in command  # upstream's argument escaping cannot alter the script
    result = subprocess.run(["/bin/sh", "-c", command], capture_output=True, text=True, timeout=10)
    assert result.returncode == exit_code, result.stderr
    assert not directory.exists()
    assert home.CLEANUP_MARKER in result.stdout.splitlines()
    if exit_code == 0:
        assert home.parse_query(result.stdout)["read_only"]


def test_offline_metadata_uses_only_identity_bound_original(monkeypatch, tmp_path, status):
    class Session:
        def duid(self):
            return "same-tv"

    def offline(host):
        raise SystemExit("offline") from OSError("connection refused")

    status["device"]["identity_sha256"] = hashlib.sha256(b"same-tv").hexdigest()
    home.save_backup(status, state_dir=tmp_path)
    monkeypatch.setattr(cli.remote, "info", offline)
    value = home.device_info(Session(), "192.0.2.10", state_dir=tmp_path)
    assert value["modelName"] == "TEST-FRAME"
    assert "backup" in value["_aerotizen_metadata_source"]

    class Other:
        def duid(self):
            return "another-tv"

    with pytest.raises(home.HomeError, match="no valid backup"):
        home.device_info(Other(), "192.0.2.10", state_dir=tmp_path)


def test_metadata_fallback_does_not_swallow_other_exit_reasons(monkeypatch):
    def failed(host):
        raise SystemExit("configuration error")

    monkeypatch.setattr(cli.remote, "info", failed)
    with pytest.raises(SystemExit, match="configuration error"):
        home.device_info(object(), "192.0.2.10")


@pytest.mark.parametrize(
    "diagnostic",
    [
        {"code": "timeout", "message": "Service query timed out."},
        {"code": "connection_error", "message": "Connection failed.", "socket_error": "ConnectionRefused"},
        {"code": "http_error", "message": "Service returned an HTTP error.", "http_status": 503},
        {"code": "invalid_response", "message": "Invalid service response."},
    ],
)
@pytest.mark.parametrize("json_output", [False, True])
def test_service_diagnostic_survives_query_and_is_visible_in_cli(
    monkeypatch, status, capsys, diagnostic, json_output
):
    from contextlib import nullcontext

    value = query()
    value["watcher"] = {"state": "unknown", "reachable": False, "error": diagnostic}
    assert home.parse_query(output(value))["watcher"]["error"] == diagnostic
    status["watcher"] = value["watcher"]
    monkeypatch.setattr(cli, "require_sdb", lambda host: nullcontext(object()))
    monkeypatch.setattr(home, "device_info", lambda *args, **kwargs: {})
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    argv = ["aerotizen", "--tv", "192.0.2.10", "home", "status"]
    if json_output:
        argv.append("--json")
    monkeypatch.setattr("sys.argv", argv)
    cli.main()
    text = capsys.readouterr().out
    if json_output:
        assert json.loads(text)["watcher"]["error"] == diagnostic
    else:
        assert "watcher: unknown" in text
        assert "service query: " + diagnostic["code"] in text
        assert diagnostic["message"] in text
        for key in ("socket_error", "http_status"):
            if key in diagnostic:
                assert str(diagnostic[key]) in text


@pytest.mark.parametrize(
    "diagnostic",
    [
        "timeout",
        {},
        {"code": "timeout", "message": 3},
        {"code": "timeout", "message": ""},
        {"code": "http_error", "message": "bad", "http_status": True},
        {"code": "http_error", "message": "bad", "http_status": 999},
        {"code": "connection_error", "message": "bad", "socket_error": 3},
    ],
)
def test_malformed_service_diagnostic_is_refused(diagnostic):
    value = query()
    value["watcher"]["error"] = diagnostic
    with pytest.raises(home.HomeError):
        home.parse_query(output(value))
