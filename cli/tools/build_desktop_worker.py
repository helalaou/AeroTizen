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


def build(output):
    target = TARGETS.get((platform.system(), platform.machine()))
    if target is None:
        raise ValueError("Unsupported desktop worker build platform")
    name = f"aerotizen-worker-{target}"
    with tempfile.TemporaryDirectory(prefix="aerotizen-worker-build-") as temporary:
        work = Path(temporary)
        entry = work / "desktop_entry.py"
        entry.write_text("from aerotizen.desktop_worker import main\n\nmain()\n", encoding="utf-8")
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
        print(f"Built and smoke-tested {filename}")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    build(parser.parse_args().output.resolve())


if __name__ == "__main__":
    main()
