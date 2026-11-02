"""Allowlisted support data. Free text, user identifiers and payloads never enter reports."""

import math
import re

APP_IDS = {"DclHome001.Home", "com.samsung.tv.csfs", "org.tizen.tv-viewer", "org.tizen.hbbtv"}
HOME_KEYS = (
    "db/appfw/home_appid",
    "db/appfw/startup_appid",
    "db/appfw/booting_appid_backup",
    "db/first_screen/type",
    "db/menu/smart_hub/ontvsetting/auto_start",
)
EVENTS = set(
    [
        "command.start",
        "command.finish",
        "device.operation",
        "home.prepared",
        "home.native_result",
        "app.launch_requested",
        "app.launch_result",
        "app.visibility",
        "ui.start",
        "ui.loaded",
        "ui.visibility",
        "ui.appcontrol",
        "ui.error",
        "ui.rejection",
        "app.launch_accepted",
        "app.launch_failed",
        "app.launch_unavailable",
        "handoff.request",
        "handoff.accepted",
        "handoff.failed",
        "handoff.visibility_unconfirmed",
        "service.start",
        "service.exit",
        "service.mode",
        "service.request",
        "service.unavailable",
        "service.launch_requested",
        "watcher.blocked",
        "watcher.cancelled",
        "watcher.art-status",
        "watcher.launch",
        "watcher.checking",
        "watcher.unseen",
        "watcher.unwatched",
        "watcher.capability",
        "diagnostic.unknown",
    ]
)
ERRORS = set(
    [
        "Error",
        "TypeError",
        "ReferenceError",
        "SyntaxError",
        "RangeError",
        "URIError",
        "EvalError",
        "NetworkError",
        "SecurityError",
        "NotFoundError",
        "InvalidValuesError",
        "NotSupportedError",
        "UnknownError",
        "IOError",
        "TimeoutError",
        "Denied",
        "RequestFailed",
        "LaunchError",
        "HandoffError",
        "ScriptError",
        "UnhandledRejection",
        "OSError",
        "FileNotFoundError",
        "PermissionError",
        "ConnectionError",
        "ConnectionRefusedError",
        "TimeoutError",
        "SdbError",
        "DeviceSessionError",
        "HomeError",
        "ValueError",
        "KeyError",
        "TypeError",
        "SystemExit",
        "RuntimeError",
        "RecursionError",
        "HTTPException",
        "URLError",
        "HTTPError",
    ]
)
ENUMS = {
    "action": set(
        [
            "apply",
            "restore",
            "status",
            "backup",
            "open",
            "export",
            "home",
            "leave",
            "watch",
            "samsung_home",
            "live_tv",
            "/home",
            "/leave",
            "/watch",
            "/apps",
            "/startup",
        ]
    ),
    "command": set(
        [
            "discover",
            "status",
            "apps",
            "debloat",
            "certs",
            "install",
            "update",
            "uninstall",
            "key",
            "launch",
            "inspect",
            "home",
            "logs",
        ]
    ),
    "method": set(
        [
            "capability",
            "duid",
            "applist",
            "shell",
            "shell_bounded",
            "push",
            "pull",
            "install",
            "uninstall",
            "launch",
            "debug_launch",
            "tcp_request",
            "forward",
        ]
    ),
    "mode": set(["watcher", "native", "hold", "blocked", "stock", "unknown"]),
    "status": set(["ok", "unavailable", "accepted", "failed", "confirmed", "unconfirmed"]),
    "phase": set(("home_operation", "autostart", "final", "boot", *HOME_KEYS)),
    "component": {"launcher", "service"},
    "state": set(
        [
            "not_requested",
            "unavailable",
            "collected",
            "partial",
            "loading",
            "applied",
            "restored",
            "rolled_back",
            "failed",
            "pending",
            "completed",
            "active",
            "paused",
            "blocked",
            "native",
            "hold",
            "watcher",
            "stock",
            "unknown",
            "acknowledged",
            "rejected",
            "idle",
        ]
    ),
    "storage": set(["unavailable", "loading", "ready", "saving", "failed"]),
    "clock": {"monotonic", "wall_fallback"},
    "arch": set(["arm", "armv7", "armv7l", "aarch64", "arm64", "x86", "x86_64", "x64", "ia32"]),
    "access": {"sdk_uid_901", "temporary_root"},
}
REASONS = set(
    [
        "Native Home or handoff mode",
        "TV capability unknown",
        "TV power state unavailable or not on",
        "launcher visible or status unavailable",
        "watched app visible or status unavailable",
        "app inventory unavailable",
        "guard deadline",
        "final Art check blocked",
        "covered without an app",
        "another app is active",
        "Home routing mode changed",
        "app launch requested",
        "app inventory changed",
        "Samsung Home escape",
        "launcher returned",
        "service exit",
        "HomeWatcher unavailable",
        "HomeWatcher request failed",
        "launch denied",
        "launch failed",
        "AppControl failed",
        "AppControl is unavailable",
        "TV tuner selection is unavailable",
        "boot (TV type unknown)",
        "os_release_unavailable",
        "os_release_fields_missing",
    ]
)
REASONS.update({"on", "off", "unknown", "frame", "non-frame", "boot", "home_pressed_in_app"})
NUMBERS = set(
    [
        "line",
        "column",
        "code",
        "protocol",
        "buffered",
        "discarded",
        "invalid",
        "pending_errors",
        "writes",
        "write_failures",
        "read_failures",
        "queued",
        "retries",
        "last_status",
        "reported_at",
        "watcher_heartbeats",
        "watcher_launch_calls",
        "duration_ms",
        "sequence",
        "elapsed_ms",
        "at",
        "uid",
        "cli_files",
        "receipt_summaries",
        "skipped_files",
        "omitted_legacy_records",
    ]
)
BOOLS = set(
    [
        "hidden",
        "dirty",
        "persistent",
        "unsaved",
        "saving",
        "accepted",
        "failed",
        "boot",
        "size_limit_reached",
        "complete",
        "reachable",
        "sdk_staging_cleaned",
        "query_staging_cleaned",
        "Success",
        "RolledBack",
    ]
)


def number(value):
    return value if type(value) in (int, float) and math.isfinite(value) and 0 <= value <= 10**16 else None


def error_code(value):
    text = value[:1024] if isinstance(value, str) else ""
    for needle, code in (
        ("Final Home readback failed", "final_home_readback_failed"),
        ("Home operation readback failed", "home_operation_readback_failed"),
        ("Setting readback failed", "setting_readback_failed"),
        ("Autostart readback failed", "autostart_readback_failed"),
        ("Native boot readback failed", "native_boot_readback_failed"),
        ("rollback incomplete", "rollback_incomplete"),
        ("Cannot read", "property_access_failed"),
        ("is not defined", "reference_unavailable"),
        ("Unexpected token", "invalid_syntax"),
        ("launch denied", "launch_denied"),
        ("launch failed", "launch_failed"),
    ):
        if text == code or needle.lower() in text.lower():
            return code
    return "detail_omitted"


def error_type(value):
    return value if isinstance(value, str) and value in ERRORS else "Error"


def source_file(value):
    if not isinstance(value, str):
        return "[unknown source]"
    name = re.split(r"[/\\]", value.split("?")[0].split("#")[0])[-1]
    return name if name in SOURCE_FILES else "[unknown source]"


def stack(value):
    lines = value if isinstance(value, list) else str(value).splitlines() if isinstance(value, str) else []
    result = []
    for line in lines[:32]:
        match = re.search(r"(?:^|[/\\])([a-zA-Z0-9_-]+\.(?:js|html|py)):(\d+)(?::(\d+))?", str(line)[:1024])
        if match and match[1] in SOURCE_FILES:
            result.append(":".join(item for item in match.groups() if item)[:128])
    return "\n".join(result[:8])


class Policy:
    def __init__(self):
        self.aliases = {}

    def alias(self, value, kind="ref"):
        if not isinstance(value, str) or len(value) > 256:
            return None
        # Existing app aliases can cross the UI/service boundary without revealing the ID.
        if kind == "app" and re.fullmatch(r"app-[0-9]+", value):
            return value
        key = (kind, value)
        if key not in self.aliases:
            self.aliases[key] = f"{kind}-{len(self.aliases) + 1}"
        return self.aliases[key]

    def app(self, value):
        if value is None:
            return None
        return value if isinstance(value, str) and value in APP_IDS else self.alias(value, "app")

    def value(self, value, key):
        if value is None:
            return None
        if key in BOOLS:
            return value if type(value) is bool else None
        if key in NUMBERS:
            return number(value)
        if key in ENUMS:
            return value if isinstance(value, str) and value in ENUMS[key] else None
        if key in ("error", "error_type"):
            return error_type(value)
        if key == "message":
            return error_code(value)
        if key == "reason":
            if isinstance(value, str) and value in REASONS:
                return value
            if isinstance(value, str) and re.fullmatch(r"(?:fresh )?Art status: (on|off|unknown)", value):
                return value
            if isinstance(value, str) and re.fullmatch(r"HomeWatcher HTTP [1-5][0-9]{2}", value):
                return value
            if isinstance(value, str) and value.startswith("home pressed in "):
                return "home_pressed_in_app"
            return error_code(value)
        if key == "app_id":
            return self.app(value)
        if key in ("session", "id", "operation_id"):
            return self.alias(value)
        if key == "operation":
            return (
                value
                if isinstance(value, str)
                and re.fullmatch(r"http://tizen.org/appcontrol/operation/(main|default|view|service)", value)
                else None
            )
        if key == "file":
            return source_file(value)
        if key == "stack":
            return stack(value)
        if key in ("version", "cli_version", "python", "tizen", "os_version"):
            return (
                value
                if isinstance(value, str) and re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,3}){1,3}", value)
                else None
            )
        if key in ("build_id", "commit"):
            return value if isinstance(value, str) and re.fullmatch(r"[a-f0-9]{40,64}", value) else None
        if key in ("firmware", "firmware_build", "platform"):
            return (
                value
                if isinstance(value, str)
                and re.fullmatch(r"[A-Z0-9][A-Z0-9_.-]{1,127}", value)
                and any(c.isdigit() for c in value)
                else None
            )
        if key == "model":
            return (
                value
                if isinstance(value, str) and re.fullmatch(r"[A-Z]{2,6}[0-9][A-Z0-9_-]{2,80}", value)
                else None
            )
        if key in ("created_at", "queried_at", "at_text"):
            return (
                value
                if isinstance(value, str)
                and re.fullmatch(r"[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9:.]+(?:Z|[+-][0-9:]+)", value)
                else None
            )
        return None

    def fields(self, data, keys):
        if not isinstance(data, dict):
            return {}
        return {key: self.value(data[key], key) for key in keys if key in data}

    def build(self, data):
        return self.fields(data, ("version", "build_id", "commit", "dirty"))

    def snapshot(self, data):
        if not isinstance(data, dict):
            return None
        strings = data.get("Strings") if isinstance(data.get("Strings"), dict) else {}
        return {
            "Main": self.app(data.get("Main")),
            "Strings": {key: self.app(strings.get(key)) for key in HOME_KEYS if key != HOME_KEYS[-1]},
            "AutoStart": number(data.get("AutoStart")),
        }

    def native(self, data):
        if not isinstance(data, dict):
            return None
        result = self.fields(data, ("Success", "RolledBack"))
        if "Error" in data:
            result["Error"] = error_code(data["Error"]) if data["Error"] else None
        if "After" in data:
            result["After"] = self.snapshot(data["After"])
        if isinstance(data.get("Watcher"), dict):
            watcher = data["Watcher"]
            result["Watcher"] = {
                "Mode": self.value(watcher.get("Mode"), "mode"),
                "Protocol": number(watcher.get("Protocol")),
                "Persistent": self.value(watcher.get("Persistent"), "persistent"),
            }
        failure = data.get("Failure")
        if isinstance(failure, dict):
            differences = failure.get("Differences") if isinstance(failure.get("Differences"), dict) else {}
            result["Failure"] = {
                "Phase": self.value(failure.get("Phase"), "phase"),
                "Expected": self.snapshot(failure.get("Expected")),
                "Observed": self.snapshot(failure.get("Observed")),
                "Differences": {},
            }
            for key in ("operation/main", *HOME_KEYS):
                diff = differences.get(key)
                if isinstance(diff, dict):
                    clean = number if key == HOME_KEYS[-1] else self.app
                    result["Failure"]["Differences"][key] = {
                        name: clean(diff.get(name)) for name in ("Expected", "Observed")
                    }
        return result

    def cli_record(self, record):
        if not isinstance(record, dict) or record.get("event") not in EVENTS:
            return None
        name = record["event"]
        data = record.get("data") if isinstance(record.get("data"), dict) else {}
        result = {"event": name, **self.fields(record, ("session", "sequence", "elapsed_ms"))}
        result["at"] = self.value(record.get("at"), "at_text")
        if name == "command.start":
            safe = self.fields(data, ("command", "action", "cli_version", "boot"))
            safe["build"] = self.build(data.get("build"))
        elif name == "command.finish":
            safe = self.fields(data, ("failed", "duration_ms", "error_type", "stack"))
            safe["error"] = error_code(data.get("error")) if data.get("error") else None
            safe["health"] = self.fields(
                data.get("health"), ("storage", "discarded", "write_failures", "size_limit_reached")
            )
        elif name == "home.native_result":
            safe = {"result": self.native(data.get("result"))}
        else:
            safe = self.fields(
                data,
                (
                    "action",
                    "boot",
                    "model",
                    "firmware",
                    "method",
                    "error_type",
                    "duration_ms",
                    "app_id",
                    "accepted",
                    "status",
                ),
            )
        result["data"] = safe
        return result


SOURCE_FILES = {
    "home-store.js",
    "apps.js",
    "home.py",
    "build-info.js",
    "cli.py",
    "inputs.js",
    "backgrounds.js",
    "diagnostics-context.js",
    "discover.py",
    "root.py",
    "diagnostics-store.js",
    "diagnostics.py",
    "continue-row.js",
    "weather.js",
    "remote.py",
    "sdb.py",
    "artwork.js",
    "diagnostics.js",
    "config.js",
    "index.html",
    "home_control.py",
    "fireplace.js",
    "home-mode.js",
    "cdp.py",
    "photo-weather.js",
    "app-lookup.js",
    "settings-ui.js",
    "index.js",
    "artmode.js",
    "certs.py",
    "brands.js",
    "inspect_app.py",
    "diagnostics-storage.js",
    "homewatch.js",
    "native-navigation.js",
    "clock.js",
    "sdk.py",
    "home-screen.js",
    "app-catalog.js",
    "signer.py",
    "dom.js",
    "device.py",
    "releases.py",
    "main.js",
    "continue-watching.js",
    "network.js",
    "catalog.py",
    "logos.js",
    "startup.js",
    "build_info.py",
    "__init__.py",
    "settings.js",
    "__main__.py",
}

SOURCE_FILES.update({"diagnostic_privacy.py", "diagnostics-privacy.js"})
