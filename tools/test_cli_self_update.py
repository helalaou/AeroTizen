"""Exercise standalone updates with real frozen binaries in an isolated folder."""

import argparse
import dataclasses
import hashlib
import importlib.util
import json
import os
import platform
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from aerotizen import releases, self_update  # noqa: E402

DRIVER = """import dataclasses,json,sys
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from aerotizen import releases,self_update
plan=json.loads(Path(sys.argv[2]).read_text())
release=releases.CLIRelease(**plan['release'])
data=Path(plan['payload']).read_bytes()
checksum=Path(plan['checksum']).read_bytes()
mode=plan['mode']
def read(url,limit):
    if mode == 'network': raise releases.ReleaseError('Injected offline failure')
    if url == release.checksum_url: return checksum
    if url == release.download_url: return data + (b'corrupt' if mode == 'checksum' else b'')
    raise ValueError('Unexpected download URL')
releases._read_url=read
sys.frozen=mode != 'python'
sys._MEIPASS=''
if mode != 'python': sys.executable=plan['target']
if mode in ('bad-version','rollback'):
    release=dataclasses.replace(release,version='98.0.0')
if mode == 'rollback':
    original=self_update.verify_version
    calls=[]
    def verify(path,version):
        calls.append(path)
        if len(calls)>1: original(path,version)
    self_update.verify_version=verify
try:
    result=self_update.install(release)
    print(json.dumps({'backup':str(result.backup),'receipt':str(result.receipt) if result.receipt else None}))
except (OSError,ValueError) as error:
    print(str(error))
    sys.exit(1)
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--old-version", default="2.4.0")
    args = parser.parse_args()
    output = args.output.resolve()
    output.mkdir(parents=True, exist_ok=True)
    executable = "aerotizen.exe" if os.name == "nt" else "aerotizen"
    report = {
        "platform": platform.platform(),
        "scenarios": [],
        "sources": {
            str(path.relative_to(ROOT)): self_update.digest(path)
            for path in (
                ROOT / "src/aerotizen/self_update.py",
                ROOT / "src/aerotizen/helpers/cli-update.ps1",
                ROOT / "src/aerotizen/cli.py",
                ROOT / "src/aerotizen/releases.py",
            )
        },
    }

    def record(name, **details):
        report["scenarios"].append({"scenario": name, "passed": True, **details})
        (output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
        print("PASS", name, flush=True)

    def run(command, *, name, expected=0):
        result = subprocess.run(
            command, capture_output=True, text=True, timeout=180, env=self_update.child_environment()
        )
        (output / (name + ".log")).write_text(result.stdout + result.stderr, encoding="utf-8")
        if result.returncode != expected:
            raise AssertionError(
                f"{name}: exit {result.returncode}, expected {expected}: {result.stdout}{result.stderr}"
            )
        return result.stdout + result.stderr

    def receipt(target, expected):
        if os.name != "nt":
            return
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            paths = list(target.parent.glob(target.name + ".update-*.json"))
            if paths:
                value = json.loads(paths[0].read_text(encoding="utf-8-sig"))
                if value["state"] != expected:
                    raise AssertionError(value)
                return
            time.sleep(0.1)
        raise AssertionError("No Windows update completion receipt")

    latest = releases.resolve_cli()
    old = releases.resolve_cli(version=args.old_version)
    if not latest.download_url or not latest.checksum_url:
        raise AssertionError("No native latest archive/checksum")
    payload = releases._read_url(latest.download_url, self_update.MAX_ARCHIVE_BYTES)
    checksum = releases._read_url(latest.checksum_url, 4096)
    (output / "release-archive").write_bytes(payload)
    (output / "release-checksum").write_bytes(checksum)
    latest_bytes = self_update.download_binary(latest)
    old_bytes = self_update.download_binary(old)
    report.update(
        latest=latest.version, downloaded_old=old.version, archive_sha256=hashlib.sha256(payload).hexdigest()
    )
    driver = output / "driver.py"
    driver.write_text(DRIVER, encoding="utf-8")

    def sample(name, data):
        folder = output / name
        folder.mkdir()
        target = folder / executable
        target.write_bytes(data)
        target.chmod(0o755)
        (folder / "unrelated-settings.json").write_bytes(b"preserve")
        return target

    def drive(target, mode, expected=0):
        plan = target.parent / "fixture.json"
        plan.write_text(
            json.dumps(
                {
                    "release": dataclasses.asdict(latest),
                    "payload": str(output / "release-archive"),
                    "checksum": str(output / "release-checksum"),
                    "target": str(target),
                    "mode": mode,
                }
            ),
            encoding="utf-8",
        )
        return run([sys.executable, str(driver), str(ROOT / "src"), str(plan)], name=mode, expected=expected)

    target = sample("downloaded-old", old_bytes)
    self_update.verify_version(target, old.version)
    drive(target, "success")
    receipt(target, "complete")
    assert target.read_bytes() == latest_bytes
    backups = list(target.parent.glob("*.previous-*"))
    assert len(backups) == 1 and backups[0].read_bytes() == old_bytes
    self_update.verify_version(backups[0], old.version)
    record("downloaded-old-replacement-and-runnable-backup", old=old.version, new=latest.version)

    for mode in ("checksum", "network", "bad-version"):
        target = sample(mode + "-case", old_bytes)
        drive(target, mode, expected=1)
        assert target.read_bytes() == old_bytes
        assert not list(target.parent.glob(".aerotizen-update-*"))
        record(mode + "-failure-preserves-old")

    target = sample("rollback-case", old_bytes)
    drive(target, "rollback", expected=0 if os.name == "nt" else 1)
    receipt(target, "restored")
    assert target.read_bytes() == old_bytes
    self_update.verify_version(target, old.version)
    record("post-replacement-failure-restores-old")

    target = sample("python-case", old_bytes)
    interpreter_hash = self_update.digest(sys.executable)
    text = drive(target, "python", expected=1)
    assert "package installer" in text and "-m pip install --upgrade" in text
    assert self_update.digest(sys.executable) == interpreter_hash
    assert target.read_bytes() == old_bytes
    record("python-install-instructions-preserve-interpreter")

    spec = importlib.util.spec_from_file_location("release_builder", ROOT / "tools/build_release.py")
    builder = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(builder)
    clone = output / "build-source"
    (clone / "src").mkdir(parents=True)
    shutil.copytree(
        ROOT / "src/aerotizen", clone / "src/aerotizen", ignore=shutil.ignore_patterns("__pycache__")
    )
    shutil.copyfile(ROOT / "LICENSE", clone / "LICENSE")
    binaries = {}
    for label, version in (
        ("older-updater", "0.0.0"),
        ("current-updater", latest.version),
        ("newer-updater", "99.0.0"),
    ):
        (clone / "src/aerotizen/__init__.py").write_text(f'__version__ = "{version}"\n', encoding="utf-8")
        package = builder.build_cli(clone, output / "builds" / label)
        data = self_update.unpack_binary(package.read_bytes(), package.name, executable)
        binaries[label] = data

    target = sample("upgrade in space & apostrophe's folder", binaries["older-updater"])
    original_hash = self_update.digest(target)
    text = run([str(target), "update", "cli", "--check"], name="standalone-check")
    assert "A CLI update is available" in text and self_update.digest(target) == original_hash
    assert not list(target.parent.glob("*.previous-*"))
    record("standalone-check-is-read-only")
    run([str(target), "update", "cli"], name="standalone-upgrade")
    receipt(target, "complete")
    assert target.read_bytes() == latest_bytes
    self_update.verify_version(target, latest.version)
    backup = next(target.parent.glob("*.previous-*"))
    assert self_update.digest(backup) == original_hash
    self_update.verify_version(backup, "0.0.0")
    assert (target.parent / "unrelated-settings.json").read_bytes() == b"preserve"
    record("running-frozen-cli-upgrades-from-older-version", fixture_version="0.0.0", new=latest.version)

    for label in ("current-updater", "newer-updater"):
        target = sample(label, binaries[label])
        before = self_update.digest(target)
        text = run([str(target), "update", "cli"], name=label)
        assert "up to date" in text or "newer than the latest stable" in text
        assert self_update.digest(target) == before
        assert not list(target.parent.glob("*.previous-*"))
        record(label + "-is-a-no-op")

    target = sample("locked-installation", binaries["older-updater"])
    with self_update.update_lock(target):
        text = run([str(target), "update", "cli"], name="concurrent-update", expected=1)
    assert "Cannot lock" in text and target.read_bytes() == binaries["older-updater"]
    record("concurrent-update-refused")

    if os.name == "nt":
        target = sample("windows-open-file", binaries["older-updater"])
        with target.open("rb"):
            process = subprocess.Popen(
                [str(target), "update", "cli"],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                env=self_update.child_environment(),
                text=True,
            )
            deadline = time.monotonic() + 120
            while not list(target.parent.glob(".aerotizen-update-*/ready")):
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise AssertionError("Windows helper did not stage while the old file was open")
                time.sleep(0.1)
            time.sleep(2)
            assert not list(target.parent.glob(executable + ".update-*.json"))
            assert target.read_bytes() == binaries["older-updater"]
        stdout, stderr = process.communicate(timeout=90)
        (output / "windows-open-file.log").write_text(stdout + stderr, encoding="utf-8")
        assert process.returncode == 0
        receipt(target, "complete")
        assert target.read_bytes() == latest_bytes
        record("windows-helper-waits-for-open-file-to-close")

    if os.name != "nt":
        target = sample("read-only-installation", binaries["older-updater"])
        target.parent.chmod(0o555)
        try:
            text = run([str(target), "update", "cli"], name="read-only-folder", expected=1)
        finally:
            target.parent.chmod(0o755)
        assert target.read_bytes() == binaries["older-updater"] and "Cannot lock" in text
        record("read-only-folder-preserves-old")
    report["passed"] = True
    (output / "report.json").write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
