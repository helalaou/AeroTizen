"""Exercise the service setter policy without loading Tizen libraries."""

import os
import shutil
import subprocess
from pathlib import Path

import pytest


def test_same_value_setter_guards():
    dotnet = os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip("Install .NET 6 to run the service setter policy harness")
    project = Path(__file__).resolve().parent / "native-home-service/ServiceWriteTests.csproj"
    result = subprocess.run(
        [dotnet, "run", "--project", str(project), "-c", "Release", "-p:UseSharedCompilation=false"],
        capture_output=True,
        text=True,
        timeout=90,
        check=True,
        env={**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1"},
    )
    assert "8 same-value setter checks passed" in result.stdout
