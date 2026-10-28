"""Pinned root-tool protocol, evidence checks, and subprocess interruption."""

import json
import os
import subprocess
import sys

import pytest

from aerotizen import root
from aerotizen.root import RootError, SamsungTvRoot


def evidence():
    return {
        "host": "192.0.2.10",
        "authenticated": True,
        "uid": 0,
        "euid": 0,
        "gid": 0,
        "egid": 0,
        "staging_cleaned": True,
        "system_files_unchanged": True,
        "commands": [
            {"command": "id", "exit_code": 0, "timed_out": False, "stdout": "uid=0(root)", "stderr": ""}
        ],
    }


@pytest.fixture
def provider(tmp_path, monkeypatch):
    calls = []
    replies = []
    paths = [tmp_path / "root tool", tmp_path / "sdb"]
    for path in paths:
        path.write_text("test tool")
        path.chmod(0o700)

    def run(arguments, timeout):
        calls.append([str(arg) for arg in arguments])
        if replies:
            return replies.pop(0)
        return subprocess.CompletedProcess(arguments, 0, "0.0.12\n", "")

    monkeypatch.setattr(root, "_run", run)
    return SamsungTvRoot(*paths), calls, replies


def test_version_pin_and_json_commands_use_argument_lists(provider):
    adapter, calls, replies = provider
    adapter.prepare()
    replies.append(subprocess.CompletedProcess([], 0, json.dumps(evidence()), ""))
    assert adapter.run("192.0.2.10", ("id",))["uid"] == 0
    adapter.disconnect("192.0.2.10")
    assert calls[1] == [
        str(adapter.executable),
        "--sdb",
        str(adapter.sdb),
        "-o",
        "json",
        "archive-root",
        "root",
        "192.0.2.10",
        "--command",
        "id",
    ]
    assert calls[-1] == [str(adapter.sdb), "disconnect", "192.0.2.10:26101"]


def test_wrong_version_is_rejected_before_root(provider):
    adapter, _, replies = provider
    replies.append(subprocess.CompletedProcess([], 0, "0.0.11\n", ""))
    with pytest.raises(RootError, match="pinned release"):
        adapter.prepare()


def test_empty_command_list_uses_upstreams_probe(provider):
    adapter, calls, replies = provider
    result = evidence()
    del result["commands"]
    replies.append(subprocess.CompletedProcess([], 0, json.dumps(result), ""))
    assert adapter.run("192.0.2.10")["uid"] == 0
    assert calls[-1][-2:] == ["probe", "192.0.2.10"]


@pytest.mark.parametrize(
    "field,value",
    [
        ("host", "192.0.2.99"),
        ("authenticated", False),
        ("uid", 901),
        ("uid", False),
        ("euid", 901),
        ("staging_cleaned", False),
        ("system_files_unchanged", False),
        ("commands", []),
    ],
)
def test_incomplete_or_unsafe_evidence_is_rejected(field, value):
    result = evidence()
    result[field] = value
    with pytest.raises(RootError):
        SamsungTvRoot._verify(result, "192.0.2.10", ("id",))


@pytest.mark.parametrize(
    "field,value",
    [
        ("command", "another command"),
        ("timed_out", True),
        ("exit_code", 1),
        ("exit_code", False),
        ("stdout", None),
    ],
)
def test_failed_or_mismatched_commands_are_rejected(field, value):
    result = evidence()
    result["commands"][0][field] = value
    with pytest.raises(RootError, match="command"):
        SamsungTvRoot._verify(result, "192.0.2.10", ("id",))


def test_malformed_json_and_process_failure_are_rejected(provider):
    adapter, _, replies = provider
    replies.extend(
        [
            subprocess.CompletedProcess([], 0, "not JSON", ""),
            subprocess.CompletedProcess([], 1, "", "upstream failure"),
        ]
    )
    with pytest.raises(RootError, match="JSON"):
        adapter.run("192.0.2.10", ("id",))
    with pytest.raises(RootError, match="upstream failure"):
        adapter.run("192.0.2.10", ("id",))


def test_failed_command_diagnostic_does_not_echo_the_encoded_payload(provider):
    adapter, _, replies = provider
    report = {
        "commands": [
            {
                "command": "large encoded payload",
                "exit_code": 1,
                "timed_out": False,
                "stderr": "native getter failed",
                "stdout": "",
            }
        ]
    }
    replies.append(subprocess.CompletedProcess([], 1, json.dumps(report), ""))
    with pytest.raises(RootError, match="native getter failed") as error:
        adapter.run("192.0.2.10", ("large encoded payload",))
    assert "large encoded payload" not in str(error.value)


@pytest.mark.skipif(os.name == "nt", reason="POSIX SIGINT permits child finally blocks to run")
def test_timed_out_child_gets_time_to_clean_up(tmp_path):
    marker = tmp_path / "cleaned"
    program = (
        "import time\nfrom pathlib import Path\n"
        "try:\n time.sleep(60)\n"
        f"finally:\n Path({str(marker)!r}).write_text('cleaned')\n"
    )
    with pytest.raises(subprocess.TimeoutExpired):
        root._run([sys.executable, "-c", program], timeout=1)
    assert marker.read_text() == "cleaned"
