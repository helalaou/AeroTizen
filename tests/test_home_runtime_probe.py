"""Local diagnostic payload, redaction, CLI and fake-TV execution checks."""

import base64
import hashlib
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path

import pytest

from aerotizen import cli, home_probe, sdk
from aerotizen import home_runtime_probe as probe
from aerotizen.device import DeviceSessionError

ROOT = Path(__file__).resolve().parents[1]


def managed_output(**changes):
    fields = {
        "started": "1",
        "runtime": ".NET Core 3.0.0",
        "bits": "32",
        "tizen": "1",
        "uid": "901",
        "gid": "901",
        "CapEff": "0000000000000000",
        "NoNewPrivs": "0",
        "security_label": "System",
        **dict.fromkeys(probe.CHECKS, "ok,0"),
        "complete": "1",
        **changes,
    }
    return "AEROTIZEN_RUNTIME_LAUNCHER=available\n" + "".join(
        probe.PREFIX + key + "\t" + value + "\n" for key, value in fields.items()
    )


def result(stdout=None, exit_code=0, staging_cleaned=True):
    return {
        "stdout": managed_output() if stdout is None else stdout,
        "exit_code": exit_code,
        "staging_cleaned": staging_cleaned,
    }


def parse(value):
    return probe.parse_output(value, {"platform_version": "5.5", "cpu_arch": "armv7"}, sdk.PROBE_LAUNCHERS[0])


def test_diagnostic_separates_startup_getter_access_and_home_support():
    report = parse(result(managed_output(**{"getter.main_operation": "unavailable,-13"})))
    assert report["execution"]["state"] == "completed"
    assert report["execution"]["runtime"] == ".NET Core 3.0.0"
    assert report["execution"]["capabilities"]["CapEff"] == "0000000000000000"
    assert report["getters"]["main_operation"] == {"status": "unavailable", "code": -13}
    assert report["native_home_supported"] is None
    assert "value" not in json.dumps(report)


@pytest.mark.parametrize(
    "stdout,exit_code,state",
    [
        ("AEROTIZEN_RUNTIME_LAUNCHER=missing\n", 127, "missing_launcher"),
        ("AEROTIZEN_RUNTIME_LAUNCHER=available\n/private/secret/runtime error\n", 1, "failed"),
        ("AEROTIZEN_RUNTIME_LAUNCHER=available\n", 0, "failed"),
        ("AEROTIZEN_RUNTIME_LAUNCHER=available\nAEROTIZEN_RUNTIME_TIMEOUT=1\n", 137, "timed_out"),
    ],
)
def test_startup_failure_produces_useful_sanitized_report(stdout, exit_code, state):
    report = parse(result(stdout, exit_code))
    assert report["execution"]["state"] == state
    assert report["execution"]["runtime"] is None
    assert all(value is None for value in report["getters"].values())
    assert "secret" not in json.dumps(report)


def test_runtime_and_identity_output_cannot_export_private_data():
    private = "private-user-192.0.2.10"
    report = probe.parse_output(
        result(
            managed_output(runtime=private, uid=private, gid=private, security_label=private, CapEff=private)
            + f"Could not load file or assembly {private}\n"
            + f"{sdk.RUNTIME_ERROR_PREFIX}{private}\n"
        ),
        {"duid": private, "cpu_arch": private, "platform_version": private},
        sdk.PROBE_LAUNCHERS[0],
    )
    assert private not in json.dumps(report)
    assert report["execution"]["uid"] is None
    assert report["launcher"]["errors"] == ["assembly_load_failed"]


@pytest.mark.parametrize("alteration", ["cleanup", "duplicate", "unknown", "incomplete", "status", "exit"])
def test_invalid_reports_are_refused(alteration):
    value = result()
    if alteration == "cleanup":
        value["staging_cleaned"] = False
    elif alteration == "duplicate":
        value["stdout"] += probe.PREFIX + "started\t1\n"
    elif alteration == "unknown":
        value["stdout"] += probe.PREFIX + "device_id\tsecret\n"
    elif alteration == "incomplete":
        value["stdout"] = value["stdout"].replace(probe.PREFIX + "getter.main_operation\tok,0\n", "")
    elif alteration == "status":
        value["stdout"] = value["stdout"].replace("ok,0", "unknown,0")
    else:
        value["exit_code"] = True
    with pytest.raises(DeviceSessionError):
        parse(value)


def test_shipped_payload_is_net30_and_matches_getter_only_source():
    manifest = json.loads(probe.PAYLOAD_PATH.read_text())
    sources = b"\0".join(
        (ROOT / "native/home-runtime-probe" / name).read_bytes()
        for name in ("RuntimeProbe.cs", "RuntimeProbe.csproj", "global.json")
    )
    assert manifest["source_sha256"] == hashlib.sha256(sources).hexdigest()
    files = probe.load_helper()
    assert files[probe.FILES[0]].startswith(b"MZ")
    runtime = json.loads(files[probe.FILES[1]])["runtimeOptions"]
    assert runtime["tfm"] == "netcoreapp3.0" and runtime["framework"]["version"] == "3.0.0"
    source = (ROOT / "native/home-runtime-probe/RuntimeProbe.cs").read_text()
    imports = set(re.findall(r"extern\s+\w+\s+(\w+)\(", source))
    assert imports == {
        "getuid",
        "getgid",
        "free",
        "vconf_get_str",
        "vconf_get_int",
        "app_operation_get_current_app",
        "app_manager_get_app_info",
        "app_info_destroy",
    }


@pytest.mark.parametrize(
    "mode", ["success", "marker_only", "failure", "missing", "timeout", "ignore_term", "tamper"]
)
def test_fake_tv_execution_checks_payload_bounds_runtime_and_cleans_staging(tmp_path, mode):
    executable = tmp_path / "launcher"
    log_prefix = str(tmp_path / "dotnet_error.")
    marker_only = (
        'printf 1 > "$2.started"\n'
        "printf '%s\\n' 'Failed to initialize CoreCLR /private/user' "
        f"'AEROTIZEN_RUNTIME_STARTUP_MARKER=unexpected' > {shlex.quote(log_prefix)}$$.probe.log\n"
        f"printf '%s\\n' 'Permission denied' > {shlex.quote(log_prefix)}$PPID.other.log\n"
    )
    body = {
        "ignore_term": "trap '' TERM\nwhile :; do :; done\n",
        "timeout": "while :; do :; done\n",
        "marker_only": marker_only,
        "failure": "exit 9\n",
    }.get(mode, "printf '%s\\n' " + shlex.quote(managed_output().split("\n", 1)[1]))
    executable.write_text("#!/bin/bash\n" + body)
    executable.chmod(0o600 if mode == "missing" else 0o700)
    uploads = []

    class Session:
        host = "127.0.0.1"

        def capability(self):
            return {"platform_version": "5.5"}

        def push(self, data, path):
            uploads.append(path)
            if path.endswith(".s"):
                data = data.decode().replace(sdk.DIRECTORY, str(tmp_path))
                data = data.replace('test "$(id -u)" = 901', ":")
                data = data.replace(sdk.PROBE_LAUNCHERS[0], shlex.quote(str(executable)))
                data = data.replace("/tmp/dotnet_error.", shlex.quote(log_prefix))
                if mode in ("timeout", "ignore_term"):
                    data = data.replace("sleep 12", "sleep 1").replace("sleep 2", "sleep 0.1")
                if not shutil.which("sha256sum"):
                    data = data.replace("sha256sum -c -", "shasum -a 256 -c -")
                data = data.encode()
            elif mode == "tamper" and path.endswith(".dll"):
                data = b"tampered"
            (tmp_path / Path(path).name).write_bytes(data)

        def shell_bounded(self, command, timeout, max_output):
            encoded = re.search(r"\$\{IFS\}%s\$\{IFS\}(.+?)\|base64", command)[1]
            launch = base64.b64decode(encoded).decode().replace(sdk.DIRECTORY, str(tmp_path))
            process = subprocess.run(
                [shutil.which("bash"), "-c", launch], capture_output=True, text=True, timeout=5
            )
            return process.stdout

    report = probe.collect(Session())
    assert len(uploads) == 3 and not list(tmp_path.glob("ah-*"))
    assert (
        report["execution"]["state"]
        == {
            "success": "completed",
            "marker_only": "failed",
            "failure": "failed",
            "missing": "missing_launcher",
            "timeout": "timed_out",
            "ignore_term": "timed_out",
            "tamper": "failed",
        }[mode]
    )
    assert report["transport"]["staging_cleaned"]
    if mode == "marker_only":
        assert report["execution"]["managed_started"] is True
        assert report["execution"]["managed_completed"] is False
        assert report["execution"]["startup_marker"] == "written"
        assert report["launcher"]["errors"] == ["runtime_load_failed"]
        assert "/private/user" not in json.dumps(report)
    elif mode == "failure":
        assert report["execution"]["managed_started"] is False
        assert report["execution"]["startup_marker"] == "not_observed"
    if mode == "ignore_term":
        assert report["execution"]["exit_code"] == 137


@pytest.mark.parametrize("json_output", [False, True])
def test_cli_uses_selected_launcher_and_saves_new_report(monkeypatch, tmp_path, capsys, json_output):
    calls = []

    @contextmanager
    def connect(host):
        calls.append(host)
        yield object()

    def collect(session, launcher):
        calls.append(launcher)
        return parse(result())

    monkeypatch.setattr(cli, "require_sdb", connect)
    monkeypatch.setattr(probe, "collect", collect)
    destination = tmp_path / "diagnostic.json"
    argv = [
        "aerotizen",
        "--tv",
        "192.0.2.10",
        "home",
        "diagnose-runtime",
        "--launcher",
        "dotnet-launcher-inhouse",
        "--output",
        str(destination),
    ]
    if json_output:
        argv.append("--json")
    monkeypatch.setattr("sys.argv", argv)
    cli.main()
    assert calls == ["192.0.2.10", "dotnet-launcher-inhouse"]
    report = json.loads(destination.read_text())
    assert report["native_home_supported"] is None
    if json_output:
        assert json.loads(capsys.readouterr().out) == report


@pytest.mark.parametrize("blocked", ["existing", "symlink", "missing_parent", "bad_payload"])
def test_cli_refuses_bad_output_or_payload_before_tv_contact(monkeypatch, tmp_path, blocked):
    destination = tmp_path / "diagnostic.json"
    if blocked == "existing":
        destination.write_text("keep")
    elif blocked == "symlink":
        destination.symlink_to(tmp_path / "absent")
    elif blocked == "missing_parent":
        destination = tmp_path / "absent" / "report.json"
    else:
        monkeypatch.setattr(probe, "PAYLOAD_PATH", tmp_path / "absent")
    monkeypatch.setattr(cli, "require_sdb", lambda *args: pytest.fail("No TV connection expected"))
    monkeypatch.setattr(
        "sys.argv",
        ["aerotizen", "--tv", "192.0.2.10", "home", "diagnose-runtime", "--output", str(destination)],
    )
    with pytest.raises(SystemExit):
        cli.main()
    if blocked == "existing":
        assert destination.read_text() == "keep"


def test_transport_failure_is_redacted_and_leaves_no_report(monkeypatch, tmp_path):
    class Session:
        def capability(self):
            return {}

    def fail(*args):
        raise DeviceSessionError("secret TV IP and staging path")

    monkeypatch.setattr(sdk, "run_standalone_probe", fail)
    with pytest.raises(DeviceSessionError, match="cleanup is unconfirmed") as error:
        probe.collect(Session())
    assert "secret" not in str(error.value)
    assert not list(tmp_path.iterdir())


def test_output_publication_still_refuses_races(tmp_path):
    destination = tmp_path / "report.json"
    destination.write_text("keep")
    with pytest.raises(FileExistsError):
        home_probe.save_report(parse(result()), destination)
    assert destination.read_text() == "keep"


def test_compiled_probe_runs_on_host_and_skips_native_checks(tmp_path):
    dotnet = os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip("Install .NET 6 to run the compiled diagnostic outside Tizen")
    for name, data in probe.load_helper().items():
        (tmp_path / name).write_bytes(data)
    marker = tmp_path / (probe.FILES[0] + ".started")
    marker.write_bytes(b"0\n")
    process = subprocess.run(
        [dotnet, str(tmp_path / probe.FILES[0])], capture_output=True, text=True, timeout=15
    )
    assert process.returncode == 0, process.stderr
    assert marker.read_bytes() == b"1\n"
    report = parse(result("AEROTIZEN_RUNTIME_LAUNCHER=available\n" + process.stdout))
    assert report["execution"]["state"] == "completed"
    assert report["execution"]["runtime"] is not None
    assert all(check["status"] == "skipped" for check in report["getters"].values())


def test_committed_diagnostic_rebuilds_with_pinned_sdk():
    dotnet = os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip("Install .NET SDK 6.0.428 to verify the diagnostic rebuild")
    sdks = subprocess.run([dotnet, "--list-sdks"], capture_output=True, text=True, check=True, timeout=15)
    if not any(line.startswith("6.0.428 [") for line in sdks.stdout.splitlines()):
        pytest.skip("The reproducible diagnostic build requires .NET SDK 6.0.428")
    process = subprocess.run(
        [sys.executable, str(ROOT / "tools/build_home_runtime_probe.py"), "--dotnet", dotnet, "--check"],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert process.returncode == 0, process.stdout + process.stderr
