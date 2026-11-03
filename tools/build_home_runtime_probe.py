"""Rebuild the small .NET 3.0 diagnostic shipped for source-only reporter installs."""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "native/home-runtime-probe"
OUTPUT = ROOT / "src/aerotizen/helpers/home-runtime-probe.json"


def build(dotnet):
    with TemporaryDirectory(prefix="aerotizen-runtime-build-") as temporary:
        subprocess.run(
            [
                str(dotnet),
                "build",
                str(SOURCE / "RuntimeProbe.csproj"),
                "-c",
                "Release",
                "-o",
                temporary,
                "--nologo",
                "-p:UseSharedCompilation=false",
            ],
            env={**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_NOLOGO": "1"},
            cwd=SOURCE,
            check=True,
        )
        files = {}
        for name in ("AeroTizenRuntimeProbe.dll", "AeroTizenRuntimeProbe.runtimeconfig.json"):
            data = (Path(temporary) / name).read_bytes()
            files[name] = {
                "base64": base64.b64encode(data).decode(),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        sources = b"\0".join(
            (SOURCE / name).read_bytes() for name in ("RuntimeProbe.cs", "RuntimeProbe.csproj", "global.json")
        )
        return (
            json.dumps(
                {
                    "schema_version": 1,
                    "target_framework": "netcoreapp3.0",
                    "source_sha256": hashlib.sha256(sources).hexdigest(),
                    "files": files,
                },
                indent=2,
            )
            + "\n"
        )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dotnet", type=Path, default=shutil.which("dotnet"))
    parser.add_argument(
        "--check", action="store_true", help="verify the committed payload with .NET SDK 6.0.428"
    )
    args = parser.parse_args()
    if args.dotnet is None:
        parser.error("Install .NET SDK 6.0.428 or pass --dotnet PATH.")
    data = build(args.dotnet)
    if args.check:
        if OUTPUT.read_text() != data:
            parser.error("Diagnostic payload differs; rebuild with .NET SDK 6.0.428.")
    else:
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(data)
    print(OUTPUT)


if __name__ == "__main__":
    main()
