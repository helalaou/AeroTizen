"""Replace only the running standalone CLI; never replace a Python interpreter."""

import hashlib
import io
import json
import os
import re
import secrets
import shlex
import shutil
import signal
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.parse
import zipfile
import zlib
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from aerotizen import releases

MAX_ARCHIVE_BYTES = 128 * 1024 * 1024
MAX_BINARY_BYTES = 256 * 1024 * 1024


class UpdateError(ValueError):
    pass


@dataclass(frozen=True)
class UpdateResult:
    backup: Path
    receipt: Path | None = None


def digest(path):
    with Path(path).open("rb") as source:
        result = hashlib.sha256()
        for block in iter(lambda: source.read(1024 * 1024), b""):
            result.update(block)
    return result.hexdigest()


@contextmanager
def update_lock(target):
    """Keep the lock inode so simultaneous updates cannot acquire different files."""
    handle = None
    try:
        handle = target.with_name("." + target.name + ".update.lock").open("a+b")
        if os.name == "nt":
            import msvcrt

            handle.seek(0, os.SEEK_END)
            if not handle.tell():
                handle.write(b"\0")
                handle.flush()
            handle.seek(0)
            msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
        else:
            import fcntl

            fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError as exc:
        if handle is not None:
            handle.close()
        raise UpdateError(
            "Cannot lock the CLI installation. Check folder permissions or another update."
        ) from exc
    try:
        yield
    finally:
        handle.close()


def child_environment():
    environment = {key: value for key, value in os.environ.items() if not key.startswith("PYTHON")}
    # Independent onefile processes must not reuse their parent's unpacked files.
    environment["PYINSTALLER_RESET_ENVIRONMENT"] = "1"
    if sys.platform.startswith("linux"):
        original = environment.pop("LD_LIBRARY_PATH_ORIG", None)
        if original is None:
            environment.pop("LD_LIBRARY_PATH", None)
        else:
            environment["LD_LIBRARY_PATH"] = original
    return environment


@contextmanager
def external_loader():
    if os.name != "nt" or not getattr(sys, "frozen", False):
        yield
        return
    import ctypes

    ctypes.windll.kernel32.SetDllDirectoryW(None)
    try:
        yield
    finally:
        ctypes.windll.kernel32.SetDllDirectoryW(sys._MEIPASS)


def verify_version(binary, version):
    options = {"start_new_session": True} if os.name != "nt" else {}
    with external_loader():
        process = subprocess.Popen(
            [str(binary), "--version"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            env=child_environment(),
            **options,
        )
    try:
        stdout, _stderr = process.communicate(timeout=45)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        if os.name == "nt":
            taskkill = Path(os.environ.get("SYSTEMROOT", r"C:\Windows")) / "System32/taskkill.exe"
            with external_loader():
                subprocess.run(
                    [str(taskkill), "/PID", str(process.pid), "/T", "/F"], capture_output=True, timeout=10
                )
        else:
            os.killpg(process.pid, signal.SIGKILL)
        process.communicate()
        raise UpdateError("The downloaded CLI did not complete its version check.") from None
    if process.returncode or stdout.decode(errors="replace").strip() != f"aerotizen {version}":
        raise UpdateError("The downloaded CLI did not report the expected version.")


def unpack_binary(data, name, executable):
    """Read a bounded two-file release archive without extracting paths or links."""
    files = {}

    def add(path, size, regular, read):
        if path not in (executable, "LICENSE") or path in files or not regular:
            raise UpdateError("The CLI archive contains unexpected files, duplicate paths or links.")
        if size < 1 or size > MAX_BINARY_BYTES or sum(map(len, files.values())) + size > MAX_BINARY_BYTES:
            raise UpdateError("The unpacked CLI archive exceeds the allowed size.")
        value = read(size + 1)
        if len(value) != size:
            raise UpdateError("The CLI archive contains incomplete files.")
        files[path] = value

    try:
        if name.endswith(".zip"):
            with zipfile.ZipFile(io.BytesIO(data)) as archive:
                if len(archive.infolist()) != 2:
                    raise UpdateError("The CLI archive must contain the executable and LICENSE.")
                for item in archive.infolist():
                    regular = (
                        not item.is_dir()
                        and stat.S_IFMT(item.external_attr >> 16) in (0, stat.S_IFREG)
                        and not item.flag_bits & 1
                    )
                    with archive.open(item) as source:
                        add(item.orig_filename, item.file_size, regular, source.read)
        elif name.endswith(".tar.gz"):
            with tarfile.open(fileobj=io.BytesIO(data), mode="r|gz") as archive:
                for item in archive:
                    if not item.isfile():
                        raise UpdateError("The CLI archive contains a link or non-file entry.")
                    with archive.extractfile(item) as source:
                        add(item.name, item.size, True, source.read)
        else:
            raise UpdateError("Unsupported CLI archive format.")
    except (OSError, EOFError, tarfile.TarError, zipfile.BadZipFile, RuntimeError, zlib.error) as exc:
        raise UpdateError("The CLI release is not a valid archive.") from exc
    if set(files) != {executable, "LICENSE"}:
        raise UpdateError("The CLI archive must contain the executable and LICENSE.")
    return files[executable]


def download_binary(release):
    if not release.download_url or not release.checksum_url:
        raise UpdateError(
            "This release has no matching CLI archive and checksum. See: " + release.release_url
        )
    name = urllib.parse.urlsplit(release.download_url).path.rsplit("/", 1)[-1]
    try:
        checksum = releases._read_url(release.checksum_url, 4096).decode("ascii", errors="strict").strip()
    except UnicodeError as exc:
        raise UpdateError("The CLI checksum file is not valid ASCII.") from exc
    match = re.fullmatch(r"([a-fA-F0-9]{64})[ \t]+\*?" + re.escape(name), checksum)
    if not match:
        raise UpdateError("The CLI checksum file does not name the selected archive.")
    data = releases._read_url(release.download_url, MAX_ARCHIVE_BYTES)
    if hashlib.sha256(data).hexdigest() != match[1].lower():
        raise UpdateError("CLI checksum mismatch. The installed executable was not changed.")
    executable = "aerotizen.exe" if os.name == "nt" else "aerotizen"
    return unpack_binary(data, name, executable)


def _windows_handoff(target, stage, backup, old_hash, new_hash, version, receipt):
    powershell = (
        Path(os.environ.get("SYSTEMROOT", r"C:\Windows")) / "System32/WindowsPowerShell/v1.0/powershell.exe"
    )
    script = stage / "apply.ps1"
    shutil.copyfile(Path(__file__).with_name("helpers") / "cli-update.ps1", script)
    plan = stage / "plan.json"
    plan.write_text(
        json.dumps(
            {
                "target": str(target),
                "candidate": str(stage / "aerotizen.exe"),
                "backup": str(backup),
                "old_hash": old_hash,
                "new_hash": new_hash,
                "version": version,
                "parent": os.getpid(),
                "lock": str(target.with_name("." + target.name + ".update.lock")),
                "receipt": str(receipt),
            }
        ),
        encoding="utf-8",
    )
    with external_loader():
        worker = subprocess.Popen(
            [
                str(powershell),
                "-NoProfile",
                "-NonInteractive",
                "-ExecutionPolicy",
                "Bypass",
                "-File",
                str(script),
                str(plan),
            ],
            env=child_environment(),
        )
    try:
        deadline = time.monotonic() + 30
        while not (stage / "ready").exists():
            if worker.poll() is not None or time.monotonic() >= deadline:
                raise UpdateError("The Windows update helper did not start; the executable was not changed.")
            time.sleep(0.1)
    except BaseException:
        if worker.poll() is None:
            worker.kill()
        worker.wait(timeout=10)
        raise


def install(release, *, repository=releases.DEFAULT_REPOSITORY):
    if not getattr(sys, "frozen", False):
        command = [
            sys.executable,
            "-m",
            "pip",
            "install",
            "--upgrade",
            f"git+https://github.com/{repository}@cli-v{release.version}",
        ]
        instruction = subprocess.list2cmdline(command) if os.name == "nt" else shlex.join(command)
        raise UpdateError("This CLI is installed through Python. Use its package installer:\n" + instruction)
    target = Path(sys.executable).resolve(strict=True)
    mode = target.stat().st_mode
    if not stat.S_ISREG(mode) or mode & (stat.S_ISUID | stat.S_ISGID):
        raise UpdateError("The CLI is not a regular, non-privileged executable.")
    with update_lock(target):
        old_hash = digest(target)
        stage = Path(tempfile.mkdtemp(prefix=".aerotizen-update-", dir=target.parent))
        handed_off = False
        token = secrets.token_hex(6)
        backup_name = (
            target.stem + ".previous-" + token + target.suffix
            if os.name == "nt"
            else target.name + ".previous-" + token
        )
        backup = target.with_name(backup_name)
        receipt = target.with_name(target.name + ".update-" + token + ".json")
        try:
            candidate = stage / ("aerotizen.exe" if os.name == "nt" else "aerotizen")
            with candidate.open("xb") as destination:
                destination.write(download_binary(release))
                destination.flush()
                os.fsync(destination.fileno())
            candidate.chmod(stat.S_IMODE(mode))
            new_hash = digest(candidate)
            verify_version(candidate, release.version)
            if digest(target) != old_hash:
                raise UpdateError("The installed CLI changed during this update; replacement stopped.")
            if os.name == "nt":
                _windows_handoff(target, stage, backup, old_hash, new_hash, release.version, receipt)
                handed_off = True
                return UpdateResult(backup, receipt)
            with target.open("rb") as source, backup.open("xb") as destination:
                shutil.copyfileobj(source, destination)
                destination.flush()
                os.fsync(destination.fileno())
            backup.chmod(stat.S_IMODE(mode))
            if digest(backup) != old_hash:
                raise UpdateError("The previous CLI backup could not be verified.")
            os.replace(candidate, target)
            try:
                if digest(target) != new_hash:
                    raise UpdateError("The replacement CLI checksum changed.")
                verify_version(target, release.version)
            except BaseException:
                try:
                    os.replace(backup, target)
                except OSError as exc:
                    raise UpdateError(
                        f"CLI verification failed and restore failed. Recover from {backup}."
                    ) from exc
                raise
            return UpdateResult(backup)
        finally:
            if not handed_off:
                shutil.rmtree(stage)
