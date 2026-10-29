"""Prepare the offline TV-local root compatibility probe. No TV operations."""

import argparse
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from aerotizen.untethered_probe import prepare_bundle

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root-release", type=Path, required=True, help="extracted verified v0.0.12 release")
    parser.add_argument("--output", type=Path, required=True, help="new private bundle directory")
    parser.add_argument("--runtime", choices=("3.1", "6.0"), default="6.0", help="TV root payload runtime")
    parser.add_argument("--dotnet", type=Path, default=shutil.which("dotnet"))
    args = parser.parse_args()
    if args.dotnet is None:
        parser.error("Install .NET SDK 6 or pass --dotnet PATH")
    if args.output.exists() or args.output.is_symlink():
        parser.error("Output already exists; use a new bundle directory")
    environment = {**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1", "DOTNET_NOLOGO": "1"}
    with tempfile.TemporaryDirectory(prefix="aerotizen-root-probe-build-") as directory:
        subprocess.run(
            [
                str(args.dotnet),
                "build",
                str(ROOT / "native/untethered-probe/RootProbe.csproj"),
                "-c",
                "Release",
                "-o",
                directory,
                "--nologo",
                "-p:UseSharedCompilation=false",
            ],
            check=True,
            env=environment,
        )
        manifest = prepare_bundle(args.root_release, directory, args.output, runtime=args.runtime)
    print(f"Prepared {args.output} using unchanged samsung-tv-root {manifest['upstream_version']} payload")
    print("No TV connection, installation, Developer Mode, Home or boot changes were made.")


if __name__ == "__main__":
    main()
