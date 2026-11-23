"""Desktop-only build checks. No TV, compiler or freezer is started by these tests."""

import base64
import hashlib
import importlib.util
import json
import subprocess
from pathlib import Path

import pytest

from aerotizen import desktop_payloads, home, home_control, root_package

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("desktop_builder", ROOT / "cli/tools/build_desktop_worker.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def test_a_failed_helper_build_does_not_publish_a_worker(tmp_path, monkeypatch):
    output = tmp_path / "binaries"
    output.mkdir()
    previous = output / "existing-worker"
    previous.write_bytes(b"previous build")
    calls = []

    def run(command, **_kwargs):
        calls.append(command)
        if Path(command[1]).name == "build_home_control.py":
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(builder.subprocess, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        builder.build(output, "test-dotnet")
    assert previous.read_bytes() == b"previous build"
    assert list(output.iterdir()) == [previous]
    assert not any("PyInstaller" in call for call in calls)


def test_missing_sdk_fails_before_freezing(tmp_path, monkeypatch):
    monkeypatch.setattr(builder.subprocess, "run", lambda *_args, **_kwargs: pytest.fail("Started a build"))
    with pytest.raises(ValueError, match=r"\.NET 6 SDK"):
        builder.build(tmp_path, None)


@pytest.mark.parametrize("damage", ["missing", "checksum"])
def test_payload_inventory_checks_home_payload_bytes(tmp_path, monkeypatch, damage):
    path = tmp_path / "query.json"
    if damage == "checksum":
        files = {
            name: {"base64": base64.b64encode(b"payload").decode(), "sha256": "0" * 64}
            for name in home.HELPER_FILES
        }
        path.write_text(json.dumps({"schema_version": 1, "files": files}))
    monkeypatch.setattr(home, "PAYLOAD_PATH", path)
    with pytest.raises(home.HomeError):
        desktop_payloads.inventory()


def test_inventory_checks_control_and_root_payloads(monkeypatch):
    monkeypatch.setattr(home, "load_helper", lambda: {"query.dll": b"query"})
    monkeypatch.setattr(home_control, "load_helper", lambda: {"control.dll": b"control"})
    monkeypatch.setattr(
        root_package, "runtime_files", lambda: ({"bridge.dll": b"bridge"}, b"manifest", b"icon")
    )
    result = desktop_payloads.inventory()
    assert result["home_control"]["control.dll"] == hashlib.sha256(b"control").hexdigest()
    assert result["root_runtime"]["bridge.dll"] == hashlib.sha256(b"bridge").hexdigest()
    assert result["root_metadata"]["manifest"] == hashlib.sha256(b"manifest").hexdigest()

    def corrupt():
        raise ValueError("Root runtime checksum differs")

    monkeypatch.setattr(root_package, "runtime_files", corrupt)
    with pytest.raises(ValueError, match="checksum differs"):
        desktop_payloads.inventory()
