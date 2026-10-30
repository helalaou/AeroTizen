"""Version-pinned subprocess adapter for samsung-tv-root's archive route."""

import ipaddress
import json
import os
import signal
import subprocess
from pathlib import Path

from aerotizen.device import DeviceSessionError

SUPPORTED_VERSION = "0.0.12"


class RootError(DeviceSessionError):
    pass


def _run(arguments, timeout):
    options = {"start_new_session": True} if os.name != "nt" else {}
    process = subprocess.Popen(
        [str(arg) for arg in arguments], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, **options
    )
    try:
        stdout, stderr = process.communicate(timeout=timeout)
    except (subprocess.TimeoutExpired, KeyboardInterrupt):
        # Give upstream's finally blocks a chance to shut down the TV agent and
        # remove staging. Never leave a host child acquiring root in the background.
        try:
            if os.name == "nt":
                process.terminate()
            else:
                os.killpg(process.pid, signal.SIGINT)
            process.communicate(timeout=20)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            if os.name == "nt":
                process.kill()
            else:
                try:
                    os.killpg(process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
            process.communicate()
        raise
    return subprocess.CompletedProcess(arguments, process.returncode, stdout, stderr)


class SamsungTvRoot:
    """Use a separately supplied, verified upstream release and Samsung SDB.

    This adapter never downloads tools, changes root methods on failure, installs
    a boot service, or disables UEP. Acquiring root stages temporary TV files.
    """

    def __init__(self, executable, sdb, *, timeout=180):
        self.executable = Path(executable).expanduser().resolve()
        self.sdb = Path(sdb).expanduser().resolve()
        self.timeout = timeout

    def prepare(self):
        for path in (self.executable, self.sdb):
            if not path.is_file() or not os.access(path, os.X_OK):
                raise RootError(f"Executable not found or not runnable: {path}")
        try:
            result = _run([self.executable, "--version"], timeout=15)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RootError(f"Could not check samsung-tv-root version: {exc}") from exc
        if result.returncode != 0 or result.stdout.strip() != SUPPORTED_VERSION:
            raise RootError(f"Expected samsung-tv-root {SUPPORTED_VERSION}; install the pinned release.")

    def run(self, host, commands=()):
        ipaddress.IPv4Address(host)  # upstream accepts an IPv4 address, not a shell fragment
        operation = "root" if commands else "probe"
        arguments = [self.executable, "--sdb", self.sdb, "-o", "json", "archive-root", operation, host]
        for command in commands:
            arguments.extend(["--command", command])
        try:
            result = _run(arguments, timeout=self.timeout)
        except subprocess.TimeoutExpired as exc:
            raise RootError("samsung-tv-root timed out; cleanup could not be confirmed.") from exc
        except OSError as exc:
            raise RootError(f"Could not run samsung-tv-root: {exc}") from exc
        if result.returncode != 0:
            detail = (result.stderr or result.stdout).strip()[-2000:]
            if not result.stderr:
                try:
                    report = json.loads(result.stdout)
                    failed = [
                        item
                        for item in report.get("commands", [])
                        if item.get("exit_code") != 0 or item.get("timed_out")
                    ]
                    if failed:
                        detail = "; ".join(
                            f"command exit {item.get('exit_code')}: "
                            + (item.get("stderr") or item.get("stdout") or "no diagnostic")[-1500:]
                            for item in failed
                        )
                except (ValueError, TypeError, AttributeError):
                    pass
            raise RootError(f"samsung-tv-root failed ({result.returncode}): {detail}")
        try:
            evidence = json.loads(result.stdout)
        except (ValueError, TypeError) as exc:
            raise RootError("samsung-tv-root did not return valid JSON evidence.") from exc
        self._verify(evidence, host, commands)
        return evidence

    @staticmethod
    def _verify(evidence, host, commands):
        if not isinstance(evidence, dict) or evidence.get("host") != host:
            raise RootError("Root evidence does not match the requested TV.")
        for field in ("authenticated", "system_files_unchanged", "staging_cleaned"):
            if evidence.get(field) is not True:
                raise RootError(f"Root evidence did not confirm {field}.")
        for field in ("uid", "euid", "gid", "egid"):
            if type(evidence.get(field)) is not int or evidence[field] != 0:
                raise RootError(f"Root evidence did not confirm {field}=0.")
        results = evidence.get("commands", [])
        if not isinstance(results, list) or len(results) != len(commands):
            raise RootError("Root evidence is missing requested command results.")
        for command, result in zip(commands, results, strict=True):
            if (
                not isinstance(result, dict)
                or result.get("command") != command
                or type(result.get("exit_code")) is not int
                or result["exit_code"] != 0
                or result.get("timed_out") is not False
                or not isinstance(result.get("stdout"), str)
                or not isinstance(result.get("stderr"), str)
            ):
                raise RootError("A requested root command failed or returned invalid evidence.")

    def disconnect(self, host):
        try:
            result = _run([self.sdb, "disconnect", f"{host}:26101"], timeout=15)
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise RootError(f"Could not disconnect upstream SDB: {exc}") from exc
        if result.returncode != 0:
            raise RootError(f"SDB disconnect failed: {result.stderr.strip()[-1000:]}")
