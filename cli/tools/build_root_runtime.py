"""Build the portable managed root runtime. No keys, upstream payloads or TV files are packaged."""

import argparse
import base64
import hashlib
import json
import os
import shutil
import subprocess
import tempfile
from pathlib import Path

from build_release import cli_version

ROOT = Path(__file__).resolve().parents[1]
PROJECTS = {
    "AeroTizenRootHelper": ("native/root-helper/RootHelper.csproj", "bin"),
    "AeroTizenRootBridge": ("native/root-bridge/RootBridge.csproj", "bin"),
    "AeroTizenRootProbe": ("native/untethered-probe/RootProbe.csproj", "res/runner"),
    "AeroTizenBootWriter": ("native/boot-registration/BootWriter.csproj", "res/setup"),
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dotnet", default=shutil.which("dotnet"))
    parser.add_argument(
        "--framework", type=Path, help="optional local TV compile references; otherwise use pinned Tizen.NET"
    )
    parser.add_argument("--output", type=Path, default=ROOT / "src/aerotizen/helpers/root-runtime.json")
    args = parser.parse_args()
    if not args.dotnet:
        parser.error("Install .NET SDK 6 or pass --dotnet PATH")
    version = cli_version(ROOT)
    template = (ROOT / "native/root-helper/tizen-manifest.xml").read_text(encoding="utf-8")
    if "@CLI_VERSION@" not in template:
        raise ValueError("The root helper manifest must use @CLI_VERSION@")
    values = {}
    with tempfile.TemporaryDirectory(prefix="aerotizen-root-runtime-") as temporary:
        for name, (project, destination) in PROJECTS.items():
            output = Path(temporary) / name
            command = [
                args.dotnet,
                "build",
                str(ROOT / project),
                "-c",
                "Release",
                "-o",
                str(output),
                "--nologo",
                "-v:q",
                "-p:UseSharedCompilation=false",
                f"-p:Version={version}",
            ]
            if args.framework and name == "AeroTizenRootHelper":
                command.append("-p:TvFrameworkDir=" + str(args.framework.resolve()))
            subprocess.run(command, check=True, env={**os.environ, "DOTNET_CLI_TELEMETRY_OPTOUT": "1"})
            for suffix in (".dll", ".runtimeconfig.json", ".deps.json"):
                data = (output / (name + suffix)).read_bytes()
                values[destination + "/" + name + suffix] = {
                    "base64": base64.b64encode(data).decode(),
                    "sha256": hashlib.sha256(data).hexdigest(),
                }
    document = {
        "schema_version": 1,
        "version": "0.1.0",
        "files": values,
        "manifest": template.replace("@CLI_VERSION@", version),
        "icon": base64.b64encode((ROOT / "native/root-helper/icon.png").read_bytes()).decode(),
    }
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(document, separators=(",", ":")) + "\n")
    print("Built managed root runtime; no TV connection or root operation made.")


if __name__ == "__main__":
    main()
