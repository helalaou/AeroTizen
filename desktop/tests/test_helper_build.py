"""Build ordering checks use no SDK, freezer, TV or network."""

import importlib.util
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("desktop_builder", ROOT / "cli/tools/build_desktop_helpers.py")
builder = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(builder)


def test_failed_required_helper_stops_the_build_before_later_helpers(monkeypatch):
    calls = []

    def run(command, **_kwargs):
        calls.append(Path(command[1]).name)
        if calls[-1] == "build_home_control.py":
            raise subprocess.CalledProcessError(1, command)

    monkeypatch.setattr(builder.subprocess, "run", run)
    with pytest.raises(subprocess.CalledProcessError):
        builder.build("selected-dotnet")
    assert calls == ["build_home_query.py", "build_home_control.py"]


def test_missing_sdk_fails_before_starting_any_build(monkeypatch):
    monkeypatch.setattr(builder.subprocess, "run", lambda *_args, **_kwargs: pytest.fail("Started a build"))
    with pytest.raises(ValueError, match=r"\.NET 6 SDK"):
        builder.build(None)
