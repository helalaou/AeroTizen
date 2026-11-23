"""Freeze and smoke-test the desktop worker for the current host."""

import argparse
import json
import os
import platform
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

CLI_ROOT = Path(__file__).resolve().parents[1]
TARGETS = {
    ("Darwin", "arm64"): "aarch64-apple-darwin",
    ("Darwin", "x86_64"): "x86_64-apple-darwin",
    ("Windows", "AMD64"): "x86_64-pc-windows-msvc",
    ("Linux", "x86_64"): "x86_64-unknown-linux-gnu",
}
SMOKE_TIMEOUT_SECONDS = 60
PAYLOAD_BUILDERS = ("build_home_query.py", "build_home_control.py", "build_root_runtime.py")
PAYLOAD_CHECK_ARGUMENT = "--check-payloads"
WORKER_ENTRY = f"""import json
import sys
from aerotizen.desktop_payloads import inventory
from aerotizen.desktop_worker import main

if sys.argv[1:] == [{PAYLOAD_CHECK_ARGUMENT!r}]:
    print(json.dumps(inventory(), sort_keys=True))
else:
    main()
"""


def prepare_payloads(dotnet):
    if not dotnet:
        raise ValueError("Install the .NET 6 SDK or set AEROTIZEN_DOTNET to its dotnet executable.")
    for builder in PAYLOAD_BUILDERS:
        subprocess.run(
            [sys.executable, str(CLI_ROOT / "tools" / builder), "--dotnet", str(dotnet)],
            check=True,
        )


def check_payloads(command, *, cwd, env):
    result = subprocess.run(
        [*command, PAYLOAD_CHECK_ARGUMENT],
        text=True,
        capture_output=True,
        cwd=cwd,
        env=env,
        timeout=SMOKE_TIMEOUT_SECONDS,
        check=True,
    )
    return json.loads(result.stdout)


def build(output, dotnet):
    target = TARGETS.get((platform.system(), platform.machine()))
    if target is None:
        raise ValueError("Unsupported desktop worker build platform")
    prepare_payloads(dotnet)
    name = f"aerotizen-worker-{target}"
    with tempfile.TemporaryDirectory(prefix="aerotizen-worker-build-") as temporary:
        work = Path(temporary)
        entry = work / "desktop_entry.py"
        entry.write_text(WORKER_ENTRY, encoding="utf-8")
        source_env = {**os.environ, "PYTHONPATH": str(CLI_ROOT / "src")}
        expected_payloads = check_payloads([sys.executable, str(entry)], cwd=work, env=source_env)
        subprocess.run(
            [
                sys.executable,
                "-m",
                "PyInstaller",
                "--noconfirm",
                "--clean",
                "--onefile",
                "--console",
                "--noupx",
                "--log-level",
                "WARN",
                "--name",
                name,
                "--paths",
                str(CLI_ROOT / "src"),
                "--collect-data",
                "aerotizen",
                "--distpath",
                str(work / "dist"),
                "--workpath",
                str(work / "build"),
                "--specpath",
                str(work),
                str(entry),
            ],
            check=True,
            env={**os.environ, "PYINSTALLER_CONFIG_DIR": str(work / "cache")},
        )
        filename = name + (".exe" if os.name == "nt" else "")
        binary = work / "dist" / filename
        env = {key: value for key, value in os.environ.items() if not key.startswith("PYTHON")}
        env["PATH"] = ""
        frozen_payloads = check_payloads([str(binary)], cwd=work, env=env)
        if frozen_payloads != expected_payloads:
            raise ValueError("The frozen worker's helper payloads differ from this checkout.")
        result = subprocess.run(
            [str(binary)],
            input=json.dumps({"protocol": 1, "id": "build-smoke", "operation": "handshake"}) + "\n",
            text=True,
            capture_output=True,
            cwd=work,
            env=env,
            timeout=SMOKE_TIMEOUT_SECONDS,
            check=False,
        )
        if result.returncode:
            raise ValueError(f"The frozen desktop worker could not start: {result.stderr}")
        reply = json.loads(result.stdout)
        if (
            reply.get("id") != "build-smoke"
            or reply.get("result", {}).get("name") != "aerotizen-desktop-worker"
        ):
            raise ValueError("The frozen desktop worker failed its protocol check")
        output.mkdir(parents=True, exist_ok=True)
        shutil.copy2(binary, output / filename)
        print(f"Built and verified all helper payloads in {filename}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--dotnet", default=os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet"))
    args = parser.parse_args()
    build(args.output.resolve(), args.dotnet)


if __name__ == "__main__":
    main()
