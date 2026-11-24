"""Build the managed TV payloads embedded by the Rust desktop app. Uses only the standard library."""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path

TOOLS = Path(__file__).resolve().parent
DESKTOP = TOOLS.parents[1] / "desktop"
HOME_BUILDERS = ("build_home_query.py", "build_home_control.py")
ROOT_RUNTIME_OUTPUT = DESKTOP / "src-tauri/generated/root-runtime.json"


def build(dotnet):
    if not dotnet:
        raise ValueError("Install the .NET 6 SDK or set AEROTIZEN_DOTNET to its dotnet executable.")
    for builder in HOME_BUILDERS:
        subprocess.run([sys.executable, str(TOOLS / builder), "--dotnet", str(dotnet)], check=True)
    version = json.loads((DESKTOP / "package.json").read_text(encoding="utf-8"))["version"]
    subprocess.run(
        [
            sys.executable,
            str(TOOLS / "build_root_runtime.py"),
            "--dotnet",
            str(dotnet),
            "--runtime-version",
            version,
            "--output",
            str(ROOT_RUNTIME_OUTPUT),
        ],
        check=True,
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dotnet", default=os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet"))
    args = parser.parse_args()
    build(args.dotnet)
    print(
        "Built Home reader, Home writer and Root runtime for the native desktop app. No TV connection made."
    )


if __name__ == "__main__":
    main()
