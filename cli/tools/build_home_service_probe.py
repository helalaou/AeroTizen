"""Build the temporary read-only #188 helper into the launcher test package."""

import argparse
import hashlib
import json
import os
import shutil
import subprocess
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "cli/native/home-service-probe"
OUTPUT = ROOT / "launcher/native-home-probe"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dotnet", default=os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet"))
    args = parser.parse_args()
    if not args.dotnet:
        parser.error("Install the .NET 6 SDK or pass --dotnet PATH.")
    with TemporaryDirectory(prefix="aerotizen-service-home-") as temporary:
        subprocess.run(
            [
                args.dotnet,
                "build",
                str(SOURCE / "HomeServiceProbe.csproj"),
                "-c",
                "Release",
                "-o",
                temporary,
                "--nologo",
                "-p:UseSharedCompilation=false",
            ],
            env={**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_SKIP_FIRST_TIME_EXPERIENCE": "1"},
            check=True,
        )
        OUTPUT.mkdir(parents=True, exist_ok=True)
        hashes = {}
        for suffix in (".dll", ".runtimeconfig.json"):
            name = "AeroTizenServiceHomeProbe" + suffix
            data = (Path(temporary) / name).read_bytes()
            (OUTPUT / name).write_bytes(data)
            hashes[name] = hashlib.sha256(data).hexdigest()
        (OUTPUT / "manifest.json").write_text(
            json.dumps({"schema_version": 1, "files": hashes}, indent=2) + "\n"
        )
    print(OUTPUT)


if __name__ == "__main__":
    main()
