"""Bounded local diagnostics. Recovery receipts are deliberately outside log retention."""

import contextvars
import hashlib
import http.client
import io
import json
import os
import platform
import subprocess
import sys
import time
import traceback
import urllib.error
import urllib.request
import uuid
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import __version__, build_info
from aerotizen import diagnostic_privacy as privacy

MAX_LOG_BYTES = 256 * 1024
MAX_LOG_FILES = 10
MAX_HOME_RECEIPTS = 20
MAX_HOME_RECEIPT_BYTES = 2 * 1024 * 1024
MAX_TV_BYTES = 256 * 1024
HOME_WATCHER_PORT = 47790
WATCHER_STATUS_TIMEOUT_SECONDS = 2
MAX_WATCHER_STATUS_BYTES = 128 * 1024
_CURRENT = contextvars.ContextVar("aerotizen_diagnostics", default=None)


def _native_summary(result, policy=None):
    return (policy or privacy.Policy()).native(result)


def _log_line(line, policy):
    record = _log_record(line, policy)
    return json.dumps(record, ensure_ascii=True) if record else None


def _log_record(line, policy):
    try:
        return policy.cli_record(json.loads(line))
    except (ValueError, RecursionError, TypeError):
        return None


def log_directory(state_dir):
    return Path(os.environ.get("AEROTIZEN_LOG_DIR", Path(state_dir) / "logs")).expanduser()


def event(name, **fields):
    session = _CURRENT.get()
    if session:
        session.record(name, fields)


class LogSession:
    def __init__(self, state_dir, args):
        self.path, self.stream, self.bytes, self.full = None, None, 0, False
        self.policy = privacy.Policy()
        self.run_id = uuid.uuid4().hex
        self.sequence, self.started = 0, time.monotonic()
        self.discarded, self.write_errors = 0, 0
        try:
            directory = log_directory(state_dir)
            directory.mkdir(parents=True, exist_ok=True, mode=0o700)
            path = directory / f"cli-{datetime.now(timezone.utc):%Y%m%dT%H%M%S%f}-{self.run_id[:12]}.log"
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            self.stream = os.fdopen(fd, "w", encoding="utf-8")
            self.path = path
            files = sorted(p for p in directory.glob("cli-*.log") if p.is_file() and not p.is_symlink())
            for old in files[:-MAX_LOG_FILES]:
                try:
                    old.unlink()
                except OSError:
                    pass
        except (OSError, ValueError):
            pass  # Diagnostic storage must never change command or recovery behaviour.
        self.record(
            "command.start",
            {
                "command": args.cmd,
                "action": getattr(args, "home_command", getattr(args, "logs_command", None)),
                "cli_version": __version__,
                "build": build_info.current(),
                "boot": getattr(args, "boot", False),
            },
        )

    def record(self, name, fields):
        if not self.stream or self.write_errors or (self.full and name != "command.finish"):
            self.discarded += 1
            return
        try:
            self.sequence += 1
            record = {
                "sequence": self.sequence,
                "elapsed_ms": round((time.monotonic() - self.started) * 1000),
                "at": datetime.now(timezone.utc).isoformat(),
                "session": self.run_id,
                "event": name,
                "data": fields,
            }
            record = self.policy.cli_record(record)
            if record is None:
                self.discarded += 1
                return
            record["session"] = self.run_id  # Fresh random command ID, never derived from a device/user.
            raw = json.dumps(record, ensure_ascii=True) + "\n"
            size = len(raw.encode())
            # Leave room for the final error and exit result after noisy output.
            reserve = min(2048, MAX_LOG_BYTES // 4) if name != "command.finish" else 0
            if self.bytes + size > MAX_LOG_BYTES - reserve:
                self.full = True
                self.discarded += 1
                return
            self.stream.write(raw)
            self.stream.flush()
            self.bytes += size
        except Exception:
            self.write_errors += 1

    def health(self):
        return {
            "storage": "failed" if self.write_errors else "ready" if self.stream else "unavailable",
            "discarded": self.discarded,
            "write_failures": self.write_errors,
            "size_limit_reached": self.full,
        }

    def close(self):
        if self.stream:
            try:
                self.stream.close()
            except OSError:
                pass


def run_logged(args, callback, state_dir):
    session = LogSession(state_dir, args)
    token = _CURRENT.set(session)
    original_err = sys.stderr
    started = time.monotonic()
    failure = None
    try:
        callback(args)
    except BaseException as error:
        failure = error
        raise
    finally:
        code = failure.code if isinstance(failure, SystemExit) else (1 if failure else 0)
        failed = code not in (None, 0)
        session.record(
            "command.finish",
            {
                "failed": failed,
                "duration_ms": round((time.monotonic() - started) * 1000),
                "error": str(failure)[:512] if failed else None,
                "error_type": type(failure).__name__ if failed else None,
                "stack": [
                    f"{Path(frame.filename).name}:{frame.lineno}:{frame.name}"
                    for frame in traceback.extract_tb(failure.__traceback__)[-8:]
                ]
                if failed
                else [],
                "health": session.health(),
            },
        )
        _CURRENT.reset(token)
        session.close()
        if failed and session.path:
            try:
                print(f"Diagnostic log: {session.path}", file=original_err)
                if args.cmd == "home":
                    print(
                        "For a GitHub report, run 'aerotizen logs export' and attach the ZIP.",
                        file=original_err,
                    )
            except OSError:
                pass


class _SocketBody:
    def __init__(self, raw):
        self.raw = raw

    def makefile(self, *args, **kwargs):
        return io.BytesIO(self.raw)


def fetch_watcher_status(session):
    raw = session.tcp_request(
        HOME_WATCHER_PORT,
        b"GET / HTTP/1.0\r\nHost: localhost\r\nConnection: close\r\n\r\n",
        timeout=WATCHER_STATUS_TIMEOUT_SECONDS,
        max_output=MAX_WATCHER_STATUS_BYTES,
    )
    with http.client.HTTPResponse(_SocketBody(raw)) as response:
        response.begin()
        if response.status != http.client.OK:
            raise ValueError(f"Home watcher HTTP {response.status}")
        return json.load(response)


def fetch_tv(session, *, policy=None):
    policy = policy or privacy.Policy()
    raw = session.tcp_request(
        HOME_WATCHER_PORT,
        b"GET /diagnostics/logs HTTP/1.0\r\nHost: localhost\r\n"
        b"Connection: close\r\nX-AeroTizen-Diagnostics: 1\r\n\r\n",
        timeout=5,
        max_output=MAX_TV_BYTES + 8192,
    )
    response = http.client.HTTPResponse(_SocketBody(raw))
    try:
        response.begin()
        if response.status != 200:
            raise ValueError(f"TV diagnostics HTTP {response.status}")
        body = response.read(MAX_TV_BYTES + 1)
        if len(body) > MAX_TV_BYTES:
            raise ValueError("TV diagnostics response exceeds its size limit")
        data = json.loads(body)
        if (
            not isinstance(data, dict)
            or type(data.get("schema_version")) is not int
            or data["schema_version"] != 1
        ):
            raise ValueError("TV diagnostics protocol is unavailable; install the matching launcher")
        records = data.get("records")
        if not isinstance(records, list) or len(records) > 400:
            raise ValueError("Invalid TV diagnostics records")
        for record in records:
            if not isinstance(record, dict) or record.get("source") not in ("ui", "service"):
                raise ValueError("Invalid TV diagnostic record")
        safe = []
        for record in records:
            name = record.get("event")
            name = name if isinstance(name, str) and name in privacy.EVENTS else "diagnostic.unknown"
            entry = {
                "event": name,
                "source": record["source"],
                **policy.fields(record, ("id", "at", "session", "sequence", "elapsed_ms")),
            }
            entry["data"] = (
                policy.fields(record.get("data"), _EVENT_FIELDS) if name != "diagnostic.unknown" else {}
            )
            safe.append(entry)
        result = {"schema_version": 1, "records": safe}
        for key in ("build", "health", "environment", "context", "ui"):
            if isinstance(data.get(key), dict):
                result[key] = _public_section(data[key], key, policy)
        return result
    finally:
        response.close()


def open_logs(state_dir):
    directory = log_directory(state_dir)
    directory.mkdir(parents=True, exist_ok=True)
    print(directory)
    if sys.platform == "win32":
        os.startfile(directory)
    else:
        subprocess.Popen(
            ["open" if sys.platform == "darwin" else "xdg-open", str(directory)],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )


# Public report fields are explicit, including fields from older/unknown services.
_EVENT_FIELDS = set(
    [
        "action",
        "mode",
        "operation",
        "app_id",
        "error",
        "reason",
        "status",
        "phase",
        "line",
        "component",
        "version",
        "hidden",
        "operation_id",
        "message",
        "file",
        "column",
        "stack",
        "code",
        "build_id",
        "commit",
        "dirty",
    ]
)
_SECTION_KEYS = {
    "build": {"version", "build_id", "commit", "dirty"},
    "health": {
        "session",
        "buffered",
        "discarded",
        "invalid",
        "pending_errors",
        "storage",
        "unsaved",
        "saving",
        "writes",
        "write_failures",
        "read_failures",
        "clock",
    },
    "environment": {"state", "tizen", "firmware", "arch", "reason"},
    "context": {
        "mode",
        "persistent",
        "protocol",
        "watcher_heartbeats",
        "watcher_launch_calls",
        "native_settings",
    },
    "ui": {"health", "build", "version", "queued", "reported_at", "delivery"},
    "delivery": {"state", "retries", "last_status"},
}


def _public_section(value, section, policy):
    result = {}
    for key in _SECTION_KEYS[section]:
        item = value.get(key)
        if key in ("build", "health", "delivery") and isinstance(item, dict):
            result[key] = _public_section(item, key, policy)
        elif item is None or type(item) in (str, bool, int, float):
            result[key] = "not_queried" if key == "native_settings" else policy.value(item, key)
    return result


def _metadata(host):
    try:
        with urllib.request.urlopen(f"http://{host}:8001/api/v2/", timeout=2) as response:
            raw = response.read(65537)
        if len(raw) > 65536:
            raise ValueError("Metadata size limit")
        device = json.loads(raw)["device"]
        if not isinstance(device, dict):
            raise ValueError("Invalid metadata")
        policy = privacy.Policy()
        return {
            "state": "collected",
            "model": policy.value(device.get("modelName"), "model"),
            "platform": policy.value(device.get("model"), "platform"),
        }
    except (OSError, ValueError, KeyError, TypeError, RecursionError, http.client.HTTPException) as error:
        return {
            "state": "unavailable",
            "model": None,
            "platform": None,
            "reason": privacy.error_type(type(error).__name__),
        }


def _native_snapshot(session, *, policy=None):
    from aerotizen import home

    policy = policy or privacy.Policy()
    status = home.read_status(session, None, {})

    def setting(item, integer=False):
        item = item if isinstance(item, dict) else {}
        error = privacy.home_getter_error(item["error"]) if item.get("error") else {}
        return {
            "status": policy.value(item.get("status"), "status"),
            "type": "int" if integer else "string",
            "value": privacy.number(item.get("value")) if integer else policy.app(item.get("value")),
            "error": error.get("code"),
            **({"native_code": error["native_code"]} if "native_code" in error else {}),
        }

    current = status["home"]
    watcher = status["watcher"]
    diagnostic = watcher.get("error")
    return {
        "state": "collected" if status["complete"] else "partial",
        "queried_at": policy.value(status["queried_at"], "queried_at"),
        "complete": policy.value(status["complete"], "complete"),
        "home": {
            "operation": policy.value(current.get("operation"), "operation"),
            "mode": policy.value(current.get("mode"), "mode"),
            "main_operation": setting(current.get("main_operation")),
            "settings": {
                key: setting((current.get("settings") or {}).get(key), key == privacy.HOME_KEYS[-1])
                for key in privacy.HOME_KEYS
            },
        },
        "platform": {
            key: policy.value(status["device"].get(key), "arch" if key == "cpu_arch" else key)
            for key in ("model", "firmware_build", "os_version", "cpu_arch")
        },
        "watcher": {
            **policy.fields(watcher, ("state", "reachable")),
            "error": {
                "code": diagnostic.get("code")
                if diagnostic.get("code")
                in {"timeout", "connection_error", "http_error", "invalid_response", "query_error"}
                else "query_error",
                "http_status": privacy.number(diagnostic.get("http_status")),
            }
            if isinstance(diagnostic, dict)
            else None,
        },
        "evidence": policy.fields(
            status["evidence"], ("access", "uid", "sdk_staging_cleaned", "query_staging_cleaned")
        ),
    }


def _receipt_summaries(state_dir, policy, *, identity=None):
    backups = Path(state_dir) / "backups"
    if backups.is_symlink():
        return
    devices = backups.glob("*") if identity is None else (backups / identity,)
    receipts = []
    for device in devices:
        directory = device / "transactions"
        if device.is_symlink() or directory.is_symlink():
            continue
        for path in directory.glob("*.json"):
            try:
                if not path.is_symlink() and path.is_file():
                    info = path.stat()
                    if info.st_size <= MAX_HOME_RECEIPT_BYTES:
                        receipts.append((info.st_mtime, path))
            except OSError:
                continue
    for _, path in sorted(receipts, reverse=True)[:MAX_HOME_RECEIPTS]:
        try:
            with path.open("rb") as source:
                data = source.read(MAX_HOME_RECEIPT_BYTES + 1)
            if len(data) > MAX_HOME_RECEIPT_BYTES:
                continue
            receipt = json.loads(data)
            if not isinstance(receipt, dict):
                continue
        except (OSError, ValueError, RecursionError):
            continue
        state = receipt.get("state")
        stage = receipt.get("host_failure_stage")
        summary = {
            "created_at": policy.value(receipt.get("created_at"), "created_at"),
            "state": state
            if state in ("applied_verified", "restored_verified")
            else policy.value(state, "state"),
            "command": policy.fields(receipt.get("request"), ("action", "boot", "firmware")),
            "native_result": _native_summary(receipt.get("native_result"), policy),
        }
        if stage in privacy.HOME_HOST_FAILURE_STAGES:
            summary["host_failure_stage"] = stage
        if isinstance(receipt.get("error"), str):
            summary["error_code"] = privacy.error_code(receipt["error"])
        yield summary


def _recent_home_error(state_dir, policy):
    logs = sorted(p for p in log_directory(state_dir).glob("cli-*.log") if p.is_file() and not p.is_symlink())
    for path in reversed(logs[-MAX_LOG_FILES:]):
        try:
            with path.open("rb") as source:
                lines = source.read(MAX_LOG_BYTES).decode(errors="replace").splitlines()
        except OSError:
            continue
        records = [record for line in lines if (record := _log_record(line, policy))]
        if not records or records[0]["event"] != "command.start" or records[-1]["event"] != "command.finish":
            continue
        start, finish = records[0]["data"], records[-1]["data"]
        if (
            start.get("command") != "home"
            or start.get("action") not in ("status", "backup", "apply", "restore", "probe")
            or not finish.get("failed")
        ):
            continue
        readback = next((r["data"] for r in reversed(records) if r["event"] == "home.readback"), {})
        return {
            "at": records[-1]["at"],
            "action": start.get("action"),
            "error_code": finish.get("error"),
            "unavailable_settings": readback.get("unavailable_settings", {}),
        }
    return None


def _check_home_tv(state_dir, host, policy):
    from aerotizen import home, home_status
    from aerotizen.device import DeviceSession
    from aerotizen.sdb import SdbError

    result = {"state": "unavailable"}
    identity = None
    try:
        with DeviceSession(host, timeout=3).connect() as session:
            duid = session.duid().strip()
            if not duid or "fail" in duid.lower():
                return {"state": "identity_unavailable"}, None
            identity = hashlib.sha256(duid.encode()).hexdigest()
            paired = session.managed_root
            result = {
                "state": "connected",
                "connection": "paired_helper" if paired else "developer",
                "model": policy.value(home._model_metadata({}, session.banner)[0], "model"),
                "backup": "missing",
            }
            backup = home.default_backup_path(identity, state_dir=state_dir)
            if backup.is_symlink():
                result["backup"] = "unreadable"
            elif backup.exists():
                try:
                    home.load_backup(backup, identity)
                    result["backup"] = "saved"
                except (OSError, ValueError, SdbError):
                    result["backup"] = "unreadable"
            try:
                capabilities = session.capability()
                result["tizen"] = policy.value(capabilities.get("platform_version"), "tizen")
                result["arch"] = policy.value(capabilities.get("cpu_arch"), "arch")
            except (OSError, SdbError):
                pass
            settings = home_status.read_native_settings(session) if paired else None
            if settings is None:
                result["home_settings"] = {"state": "unavailable" if paired else "paired_helper_required"}
            else:
                unavailable = [key for key, value in settings.items() if value is None]
                result["home_settings"] = {
                    "state": "partial" if unavailable else "collected",
                    "unavailable_fields": unavailable,
                }
            result["routing_mode"] = home_status.read_routing_mode(session)
            try:
                eligibility = home.read_launcher_eligibility(session)
            except (OSError, SdbError):
                result["launcher_eligibility"] = {"state": "unavailable"}
            else:
                if session.duid().strip() != duid:
                    return {"state": "identity_unavailable"}, None
                result["launcher_eligibility"] = eligibility
    except (OSError, SdbError, ValueError) as error:
        result["error_type"] = privacy.error_type(type(error).__name__)
    return result, identity


def home_diagnostic_report(state_dir, host=None):
    policy = privacy.Policy()
    tv, identity = _check_home_tv(state_dir, host, policy) if host else ({"state": "not_requested"}, None)
    latest = None
    if identity or not host:
        latest = next(
            (
                item
                for item in _receipt_summaries(state_dir, policy, identity=identity)
                if item["command"].get("action") in ("apply", "restore")
            ),
            None,
        )
    return {
        "schema_version": 1,
        "tv": tv,
        "attempt_scope": "selected_tv" if host else "this_computer",
        "latest_saved_attempt": latest,
        "latest_home_error_on_computer": _recent_home_error(state_dir, policy),
    }


def export_logs(state_dir, output, host=None, *, include_home=False):
    """Export allowlisted diagnostics, never certificates, tokens or recovery requests."""
    from aerotizen.device import DeviceSession
    from aerotizen.sdb import SdbError

    policy = privacy.Policy()
    report = {
        "schema_version": 1,
        "privacy": {
            "policy_version": 2,
            "console_output": False,
            "error_messages": "codes_only",
            "third_party_app_ids": "temporary_aliases",
            "legacy_console_records": "omitted",
        },
        "cli_version": __version__,
        "cli_build": policy.build(build_info.current()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "system": {
            "os": platform.system() if platform.system() in {"Windows", "Linux", "Darwin"} else "unknown",
            "python": platform.python_version(),
            "architecture": policy.value(platform.machine(), "arch"),
        },
        "tv": {"state": "not_requested"},
        "environment": {
            "state": "not_requested",
            "model": None,
            "firmware": None,
            "tizen": None,
            "arch": None,
            "launcher": {"version": None, "build_id": None, "commit": None},
        },
        "native_home": {
            "state": "not_requested",
            "reason": "Use --include-home for a read-only SDK snapshot",
        },
        "bundle_health": {
            "cli_files": 0,
            "receipt_summaries": 0,
            "skipped_files": 0,
            "omitted_legacy_records": 0,
            "active_command_log": "export_may_precede_command_finish",
        },
    }
    if host:
        report["environment"].update(_metadata(host))
        try:
            with DeviceSession(host, timeout=3).connect() as session:
                try:
                    logs = fetch_tv(session, policy=policy)
                    report["tv"] = {"state": "collected", "logs": logs}
                    report["environment"].update(
                        {key: logs.get("environment", {}).get(key) for key in ("firmware", "tizen", "arch")}
                    )
                    report["environment"]["state"] = (
                        "collected"
                        if report["environment"].get("model")
                        and report["environment"].get("tizen")
                        and report["environment"].get("firmware")
                        else "partial"
                    )
                    ui = logs.get("ui") or {}
                    launcher = ui.get("build") or logs.get("build", {})
                    report["environment"]["launcher"] = {
                        **launcher,
                        "version": launcher.get("version") or ui.get("version"),
                    }
                except (OSError, SdbError, ValueError, RecursionError, http.client.HTTPException) as error:
                    report["tv"] = {
                        "state": "unavailable",
                        "error_type": privacy.error_type(type(error).__name__),
                        "reason": "tv_diagnostics_unavailable",
                    }
                if include_home:
                    try:
                        report["native_home"] = _native_snapshot(session, policy=policy)
                        environment = report["environment"]
                        native_platform = report["native_home"].get("platform", {})
                        for key, native_key in (
                            ("model", "model"),
                            ("firmware", "firmware_build"),
                            ("tizen", "os_version"),
                            ("arch", "cpu_arch"),
                        ):
                            if not environment.get(key):
                                environment[key] = native_platform.get(native_key)
                        if any(environment.get(key) for key in ("model", "firmware", "tizen", "arch")):
                            environment.pop("reason", None)
                            environment["state"] = (
                                "collected"
                                if all(environment.get(key) for key in ("model", "firmware", "tizen"))
                                else "partial"
                            )
                    except (OSError, SdbError, ValueError, KeyError) as error:
                        report["native_home"] = {
                            "state": "unavailable",
                            "reason": privacy.error_code(str(error)),
                            "error_type": privacy.error_type(type(error).__name__),
                        }
        except (OSError, SdbError, ValueError, RecursionError, http.client.HTTPException) as error:
            report["tv"] = {
                "state": "unavailable",
                "error_type": privacy.error_type(type(error).__name__),
                "reason": "tv_diagnostics_unavailable",
            }
            if include_home:
                report["native_home"] = {"state": "unavailable", "reason": "Developer connection unavailable"}
    output = Path(output).expanduser()
    # Exclusive creation also prevents an export from overwriting recovery data.
    fd = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(fd, "w+b") as stream, zipfile.ZipFile(stream, "w", zipfile.ZIP_DEFLATED) as archive:
            files = sorted(
                p for p in log_directory(state_dir).glob("cli-*.log") if p.is_file() and not p.is_symlink()
            )
            for index, path in enumerate(files[-MAX_LOG_FILES:]):
                try:
                    with path.open("rb") as source:
                        text = source.read(MAX_LOG_BYTES).decode(errors="replace")
                except OSError:
                    report["bundle_health"]["skipped_files"] += 1
                    continue
                report["bundle_health"]["cli_files"] += 1
                lines = []
                for line in text.splitlines():
                    clean = _log_line(line, policy)
                    if clean is None:
                        report["bundle_health"]["omitted_legacy_records"] += 1
                    else:
                        lines.append(clean)
                archive.writestr(f"cli/session-{index + 1}.log", "\n".join(lines))
            for index, summary in enumerate(_receipt_summaries(state_dir, policy), 1):
                archive.writestr(f"home/receipt-{index}.json", json.dumps(summary, indent=2))
                report["bundle_health"]["receipt_summaries"] += 1
            archive.writestr("report.json", json.dumps(report, indent=2))
    except BaseException:
        output.unlink(missing_ok=True)
        raise
    return output, report["tv"]["state"]
