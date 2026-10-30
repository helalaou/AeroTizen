"""SDK staging and schema checks use only local files and mocked transports."""

import base64
import json
import re
import shlex
import shutil
import subprocess
from pathlib import Path

import pytest

from aerotizen import home, sdk
from aerotizen.device import DeviceSessionError


def test_sdk_transport_claims_a_script_once_and_remaps_helper_arguments():
    files = {"Query.dll": b"dll", "Query.runtimeconfig.json": b"{}", "request.json": b"{}"}
    script, command, stage, paths = sdk.build_script(
        files, "Query.dll", ("request.json",), "192.0.2.1", 5678, "a" * 12
    )
    assert len(command.encode()) <= 400 and command.startswith("0 appinstall tpk ")
    encoded = re.search(r"\$\{IFS\}%s\$\{IFS\}(.+?)\|base64", command)[1]
    decoded = base64.b64decode(encoded).decode()
    assert decoded.startswith("/bin/mv ") and stage in decoded
    assert paths["request.json"] in script and 'test "$(id -u)" = 901' in script
    assert "sha256sum -c" in script and "archive-root" not in script


@pytest.mark.parametrize("exit_code", [0, 7, 127])
def test_sdk_script_cleans_payloads_even_when_helper_fails(tmp_path, exit_code):
    if not shutil.which("bash"):
        pytest.skip("Requires the TV's POSIX shell")
    files = {"Query.dll": b"dll", "Query.runtimeconfig.json": b"{}"}
    script, _, _, paths = sdk.build_script(files, "Query.dll", (), "127.0.0.1", 5678, "a" * 12)
    script = script.replace(sdk.DIRECTORY, str(tmp_path)).replace('test "$(id -u)" = 901', ":")
    capture = tmp_path / "output.txt"
    script = script.replace("exec 3<>/dev/tcp/127.0.0.1/5678", "exec 3>" + shlex.quote(str(capture)))
    executable = tmp_path / "dotnet"
    executable.write_text(f"#!/bin/sh\nprintf 'helper-ran\\n'\nexit {exit_code}\n")
    executable.chmod(0o700)
    script = script.replace("/usr/bin/dotnet", shlex.quote(str(executable)))
    if not shutil.which("sha256sum"):
        script = script.replace("sha256sum -c -", "shasum -a 256 -c -")
    for name, path in paths.items():
        (tmp_path / Path(path).name).write_bytes(files[name])
    subprocess.run([shutil.which("bash")], input=script, text=True, capture_output=True, timeout=5)
    output = capture.read_text()
    assert sdk.parse_output(output)["exit_code"] == exit_code
    assert not list(tmp_path.glob("ah-*"))


@pytest.mark.parametrize("runtime_state", ["missing", "not_executable"])
def test_sdk_script_rejects_unavailable_tv_runtime_and_cleans_staging(tmp_path, runtime_state):
    if not shutil.which("bash"):
        pytest.skip("Requires the TV's POSIX shell")
    files = {"Query.dll": b"dll", "Query.runtimeconfig.json": b"{}"}
    script, _, stage, paths = sdk.build_script(files, "Query.dll", (), "127.0.0.1", 5678, "a" * 12)
    script = script.replace(sdk.DIRECTORY, str(tmp_path)).replace('test "$(id -u)" = 901', ":")
    capture = tmp_path / "output.txt"
    script = script.replace("exec 3<>/dev/tcp/127.0.0.1/5678", "exec 3>" + shlex.quote(str(capture)))
    executable = tmp_path / "TV dotnet"
    if runtime_state == "not_executable":
        executable.write_text("#!/bin/sh\nprintf 'helper-ran\\n'\n")
        executable.chmod(0o600)
    script = script.replace("/usr/bin/dotnet", shlex.quote(str(executable)))
    for staged_path in (stage, stage[:-1] + "r", *paths.values()):
        (tmp_path / Path(staged_path).name).write_bytes(b"not a valid helper")
    # The runtime check must work before checksum tools or managed code can run.
    script = script.replace("sha256sum", "unexpected-checksum-command")
    result = subprocess.run([shutil.which("bash")], input=script, text=True, capture_output=True, timeout=5)
    output = capture.read_text()
    assert result.returncode == 127 and not result.stderr
    assert "helper-ran" not in output and "unexpected-checksum-command" not in output
    assert output.splitlines() == [
        sdk.DOTNET_UNAVAILABLE_MARKER,
        "",
        sdk.CLEANUP_MARKER,
        sdk.EXIT_PREFIX + "127",
    ]
    assert not list(tmp_path.glob("ah-*"))
    with pytest.raises(DeviceSessionError, match="/usr/bin/dotnet is missing or not executable on the TV"):
        sdk.parse_output(output)


@pytest.mark.parametrize("cleanup", ["", sdk.CLEANUP_MARKER + "\n" + sdk.CLEANUP_MARKER + "\n"])
def test_runtime_error_requires_confirmed_cleanup(cleanup):
    output = sdk.DOTNET_UNAVAILABLE_MARKER + "\n" + cleanup + sdk.EXIT_PREFIX + "127\n"
    with pytest.raises(DeviceSessionError, match="cleanup was not confirmed"):
        sdk.parse_output(output)


@pytest.mark.parametrize(
    "output",
    ["", sdk.CLEANUP_MARKER, sdk.CLEANUP_MARKER + "\n" + sdk.EXIT_PREFIX + "0\n" + sdk.EXIT_PREFIX + "0"],
)
def test_missing_or_duplicate_completion_markers_are_rejected(output):
    with pytest.raises(Exception, match="not confirmed"):
        sdk.parse_output(output)


def test_read_query_requires_the_selected_uid_and_confirms_sdk_cleanup():
    evidence = json.loads(
        (Path(__file__).resolve().parents[1] / "docs/home-sdk-read-only-tv-20261024.json").read_text()
    )
    query = evidence["query"]
    # Historical device evidence predates the installation-state query.
    query["launcher"] = {"installed": True, "error": None}
    stdout = home.QUERY_PREFIX + json.dumps(query) + "\n" + sdk.CLEANUP_MARKER
    assert home.parse_query(stdout, expected_uid=901, cleanup_marker=sdk.CLEANUP_MARKER)["uid"] == 901
    with pytest.raises(home.HomeError):
        home.parse_query(stdout, cleanup_marker=sdk.CLEANUP_MARKER)


@pytest.mark.parametrize("helper_exit", [0, 7])
def test_sdk_run_uses_only_a_local_fake_device_and_cleans_all_staging(tmp_path, helper_exit):
    if not shutil.which("bash"):
        pytest.skip("Requires the TV's POSIX shell")
    executable = tmp_path / "dotnet"
    executable.write_text(f"#!/bin/sh\nprintf 'fake-helper\\n'\nexit {helper_exit}\n")
    executable.chmod(0o700)

    class FakeSession:
        host = "127.0.0.1"

        def push(self, data, path):
            if path.endswith(".s"):
                data = data.decode().replace(sdk.DIRECTORY, str(tmp_path))
                data = data.replace('test "$(id -u)" = 901', ":")
                data = data.replace("/usr/bin/dotnet", shlex.quote(str(executable)))
                if not shutil.which("sha256sum"):
                    data = data.replace("sha256sum -c -", "shasum -a 256 -c -")
                data = data.encode()
            (tmp_path / Path(path).name).write_bytes(data)

        def shell_bounded(self, command, timeout, max_output):
            encoded = re.search(r"\$\{IFS\}%s\$\{IFS\}(.+?)\|base64", command)[1]
            launch = base64.b64decode(encoded).decode().replace(sdk.DIRECTORY, str(tmp_path))
            process = subprocess.run(
                [shutil.which("bash"), "-c", launch], capture_output=True, text=True, timeout=timeout
            )
            assert len(process.stdout.encode()) < max_output
            return process.stdout

    result = sdk.run(FakeSession(), {"Query.dll": b"dll", "Query.runtimeconfig.json": b"{}"}, "Query.dll")
    assert result["exit_code"] == helper_exit and result["staging_cleaned"]
    assert "fake-helper" in result["stdout"] and not list(tmp_path.glob("ah-*"))
