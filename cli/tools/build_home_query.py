"""Build the read-only TV query into a verified package-data payload."""

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
SOURCE = ROOT / "native/home-query"
OUTPUT = ROOT / "src/aerotizen/helpers/home-query.json"


def build(dotnet):
    environment = {
        **os.environ,
        "DOTNET_CLI_TELEMETRY_OPTOUT": "1",
        "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1",
        "DOTNET_NOLOGO": "1",
    }
    with TemporaryDirectory(prefix="aerotizen-home-build-") as temporary:
        output = Path(temporary)
        subprocess.run(
            [
                str(dotnet),
                "build",
                str(SOURCE / "HomeQuery.csproj"),
                "--configuration",
                "Release",
                "--output",
                str(output),
                "--nologo",
                "-p:UseSharedCompilation=false",
            ],
            env=environment,
            check=True,
        )
        files = {}
        for name in ("AeroTizenHomeQuery.dll", "AeroTizenHomeQuery.runtimeconfig.json"):
            data = (output / name).read_bytes()
            files[name] = {
                "base64": base64.b64encode(data).decode(),
                "sha256": hashlib.sha256(data).hexdigest(),
            }
        sources = b"\0".join(
            path.read_bytes()
            for path in (
                SOURCE / "HomeQuery.cs",
                SOURCE / "HomeQuery.csproj",
                SOURCE.parent / "home-common/Installation.cs",
            )
        )
        manifest = {
            "schema_version": 1,
            "target_framework": "netcoreapp3.1",
            "source_sha256": hashlib.sha256(sources).hexdigest(),
            "files": files,
        }
        OUTPUT.parent.mkdir(parents=True, exist_ok=True)
        OUTPUT.write_text(json.dumps(manifest, indent=2) + "\n")
    return OUTPUT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dotnet", type=Path, default=shutil.which("dotnet"))
    args = parser.parse_args()
    if args.dotnet is None:
        parser.error("Install the .NET 6 SDK or pass --dotnet PATH.")
    print(build(args.dotnet))


if __name__ == "__main__":
    main()
