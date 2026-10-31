"""Run the inventory against a local filesystem and a fake TV transport only."""

import base64
import json
import re
import shlex
import shutil
import subprocess
import uuid
from contextlib import contextmanager
from pathlib import Path

import pytest

from aerotizen import cli, home, home_probe, sdk
from aerotizen.device import DeviceSessionError


def local_script(script, root):
    script = script.replace('test "$(id -u)" = 901', ":")
    script = script.replace('emit uid "$(id -u)"', "emit uid 901")
    return re.sub(
        r"(?<![\w.])/(?:usr/(?:bin|share|lib)|lib|etc)(?:/[A-Za-z0-9._/-]+)",
        lambda match: shlex.quote(str(root) + match[0]),
        script,
    )


@pytest.fixture
def tv_files(tmp_path):
    root = tmp_path / "TV files"
    (root / "etc").mkdir(parents=True)
    (root / "etc/os-release").write_text('ID=tizen\nVERSION_ID="5.5.0"\nBUILD_ID="T-TEST-1234.5"\n')
    return root


@pytest.fixture
def shell_result(tv_files):
    if not shutil.which("bash"):
        pytest.skip("Requires the TV's shell")
    result = subprocess.run(
        [shutil.which("bash"), "-eu"],
        input=local_script(home_probe.build_script(), tv_files),
        text=True,
        capture_output=True,
        check=True,
        timeout=5,
    )
    return {"exit_code": 0, "stdout": result.stdout, "staging_cleaned": True}


def test_probe_reports_missing_files_without_running_a_runtime(shell_result):
    report = home_probe.parse_output(shell_result, {"platform_version": "5.5", "cpu_arch": "armv7"})
    assert report["device"] == {
        "platform_version": "5.5",
        "cpu_arch": "armv7",
        "os_release": {"id": "tizen", "version": "5.5.0", "firmware_build": "T-TEST-1234.5"},
    }
    assert report["execution"]["uid"] == 901
    assert report["read_only"] and report["native_home_supported"] is None
    assert all(not any(flags.values()) for flags in report["commands"].values())
    assert all(not any(flags.values()) for flags in report["libraries"].values())
    assert all(
        not value["present"] and not value["versions"] for value in report["runtime_directories"].values()
    )


def test_inventory_does_not_execute_discovered_commands_or_open_libraries(tv_files):
    marker = tv_files / "must-not-exist"
    for index, path in enumerate((*home_probe.COMMANDS, *home_probe.LIBRARIES)):
        target = tv_files / path.lstrip("/")
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(f"#!/bin/sh\ntouch {shlex.quote(str(marker))}\nexit 99\n")
        target.chmod(0o700 if index % 2 else 0o600)
    result = subprocess.run(
        [shutil.which("bash"), "-eu"],
        input=local_script(home_probe.build_script(), tv_files),
        text=True,
        capture_output=True,
        check=True,
        timeout=5,
    )
    report = home_probe.parse_output({"exit_code": 0, "stdout": result.stdout, "staging_cleaned": True}, {})
    assert all(flags["regular_file"] and flags["readable"] for flags in report["commands"].values())
    assert report["commands"][home_probe.COMMANDS[0]]["executable"] is False
    assert report["commands"][home_probe.COMMANDS[1]]["executable"] is True
    assert not marker.exists()


def test_report_filters_private_values_and_limits_runtime_entries(tv_files):
    private = uuid.uuid4().hex
    directory = tv_files / home_probe.RUNTIME_DIRECTORIES[0].lstrip("/")
    directory.mkdir(parents=True)
    for version in ("3.0.0", "3.1.3", private, *(f"6.0.{i}" for i in range(40))):
        (directory / version).mkdir()
    (tv_files / "etc/os-release").write_text(
        f'ID=tizen\nVERSION_ID="5.5.0"\nBUILD_ID="/private/{private}"\nDEVICE_ID={private}\n'
    )
    result = subprocess.run(
        [shutil.which("bash"), "-eu"],
        input=local_script(home_probe.build_script(), tv_files),
        text=True,
        capture_output=True,
        check=True,
        timeout=5,
    )
    report = home_probe.parse_output(
        {"exit_code": 0, "stdout": result.stdout + private, "staging_cleaned": True},
        {"duid": private, "developerIP": "192.0.2.1", "platform_version": private, "cpu_arch": private},
    )
    encoded = json.dumps(report)
    assert private not in encoded and "192.0.2.1" not in encoded and str(tv_files) not in encoded
    assert report["device"]["os_release"]["firmware_build"] is None
    assert report["device"]["platform_version"] is None and report["device"]["cpu_arch"] is None
    runtime = report["runtime_directories"][home_probe.RUNTIME_DIRECTORIES[0]]
    assert runtime["present"] and runtime["truncated"] and len(runtime["versions"]) <= home_probe.MAX_VERSIONS


def test_missing_optional_metadata_is_unknown(tv_files):
    (tv_files / "etc/os-release").unlink()
    script = local_script(home_probe.build_script(), tv_files).replace("uname -m", "missing-uname-tool -m")
    result = subprocess.run(
        [shutil.which("bash"), "-eu"], input=script, text=True, capture_output=True, check=True, timeout=5
    )
    report = home_probe.parse_output({"exit_code": 0, "stdout": result.stdout, "staging_cleaned": True}, {})
    assert all(value is None for value in report["device"]["os_release"].values())
    assert report["execution"]["architecture"] is None


@pytest.mark.parametrize(
    "alteration", ["incomplete", "duplicate", "wrong_uid", "unknown", "flags", "exit", "cleanup"]
)
def test_invalid_or_unconfirmed_reports_are_rejected(shell_result, alteration):
    if alteration == "incomplete":
        shell_result["stdout"] = shell_result["stdout"].replace(home_probe.PREFIX + "complete\t1\n", "")
    elif alteration == "duplicate":
        shell_result["stdout"] += home_probe.PREFIX + "uid\t901\n"
    elif alteration == "wrong_uid":
        shell_result["stdout"] = shell_result["stdout"].replace("uid\t901", "uid\t0")
    elif alteration == "unknown":
        shell_result["stdout"] += home_probe.PREFIX + "device_id\tprivate\n"
    elif alteration == "flags":
        shell_result["stdout"] = shell_result["stdout"].replace("0,0,0", "unknown", 1)
    elif alteration == "exit":
        shell_result["exit_code"] = 7
    else:
        shell_result["staging_cleaned"] = False
    with pytest.raises(DeviceSessionError, match="Read-only Home probe"):
        home_probe.parse_output(shell_result, {})


def test_collect_redacts_transport_failures(monkeypatch):
    private = uuid.uuid4().hex

    class Session:
        def capability(self):
            return {"duid": private}

    def fail(*args):
        raise TimeoutError(private)

    monkeypatch.setattr(sdk, "run_shell", fail)
    with pytest.raises(DeviceSessionError, match="cleanup is unconfirmed") as raised:
        home_probe.collect(Session())
    assert private not in str(raised.value)


def test_shell_only_transport_uses_one_script_and_confirms_cleanup(tmp_path, tv_files):
    if not shutil.which("bash"):
        pytest.skip("Requires the TV's shell")
    uploads = []

    class Session:
        host = "127.0.0.1"

        def capability(self):
            return {"platform_version": "5.5", "cpu_arch": "armv7"}

        def push(self, data, path):
            uploads.append(path)
            assert path.endswith(".s")  # No DLL, package, request or runtime is sent.
            script = data.decode().replace(sdk.DIRECTORY, shlex.quote(str(tmp_path)))
            script = local_script(script, tv_files)
            (tmp_path / Path(path).name).write_text(script)

        def shell_bounded(self, command, timeout, max_output):
            encoded = re.search(r"\$\{IFS\}%s\$\{IFS\}(.+?)\|base64", command)[1]
            launch = base64.b64decode(encoded).decode().replace(sdk.DIRECTORY, shlex.quote(str(tmp_path)))
            result = subprocess.run(
                [shutil.which("bash"), "-c", launch], text=True, capture_output=True, timeout=timeout
            )
            assert result.returncode == 0 and len(result.stdout) < max_output
            return result.stdout

    report = home_probe.collect(Session())
    assert len(uploads) == 1 and report["transport"]["staging_cleaned"]
    assert not list(tmp_path.glob("ah-*"))


@pytest.mark.parametrize("json_output", [False, True])
def test_cli_runs_without_managed_helpers_or_identity_queries(
    monkeypatch, tmp_path, shell_result, json_output, capsys
):
    events = []

    class Session:
        def capability(self):
            return {"platform_version": "5.5"}

    @contextmanager
    def connect(host):
        assert host == "192.0.2.10"
        events.append("connect")
        try:
            yield Session()
        finally:
            events.append("close")

    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(home, "load_helper", lambda: pytest.fail("No managed payload is needed"))
    monkeypatch.setattr(cli.remote, "info", lambda *args: pytest.fail("No HTTP identity query is needed"))
    monkeypatch.setattr(sdk, "run_shell", lambda *args: shell_result)
    output = tmp_path / "report.json"
    argv = ["aerotizen", "--tv", "192.0.2.10", "home", "probe", "--output", str(output)]
    if json_output:
        argv.append("--json")
    monkeypatch.setattr("sys.argv", argv)
    cli.main()
    report = json.loads(output.read_text())
    assert report["read_only"] and report["transport"]["staging_cleaned"]
    assert events == ["connect", "close"]
    if json_output:
        assert json.loads(capsys.readouterr().out) == report


def test_failed_cli_probe_leaves_no_report(monkeypatch, tmp_path):
    @contextmanager
    def connect(host):
        yield object()

    def fail(session):
        raise DeviceSessionError("temporary-file cleanup is unconfirmed")

    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(home_probe, "collect", fail)
    destination = tmp_path / "report.json"
    monkeypatch.setattr(
        "sys.argv", ["aerotizen", "--tv", "192.0.2.10", "home", "probe", "--output", str(destination)]
    )
    with pytest.raises(SystemExit, match="cleanup is unconfirmed"):
        cli.main()
    assert not destination.exists()


@pytest.mark.parametrize("kind", ["file", "symlink"])
def test_existing_output_is_refused_before_tv_contact(monkeypatch, tmp_path, kind):
    destination = tmp_path / "report.json"
    if kind == "file":
        destination.write_text("original")
    else:
        destination.symlink_to(tmp_path / "missing")
    monkeypatch.setattr(cli, "pick_tv", lambda *args: pytest.fail("No TV contact allowed"))
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", "probe", "--output", str(destination)])
    with pytest.raises(SystemExit, match="Report already exists"):
        cli.main()
    if kind == "file":
        assert destination.read_text() == "original"


def test_report_publication_never_replaces_a_concurrent_file(monkeypatch, tmp_path):
    destination = tmp_path / "report.json"

    def existing(*args):
        destination.write_text("concurrent report")
        raise FileExistsError

    monkeypatch.setattr(home_probe.os, "link", existing)
    with pytest.raises(FileExistsError):
        home_probe.save_report({"read_only": True}, destination)
    assert destination.read_text() == "concurrent report"
    assert list(tmp_path.iterdir()) == [destination]
