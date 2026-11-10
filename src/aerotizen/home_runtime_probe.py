"""Opt-in .NET 3.0 startup and getter diagnostics; never a Home backup or writer."""

import json
import re
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import __version__, catalog, home, home_probe, releases, sdk
from aerotizen.device import DeviceSessionError
from aerotizen.sdb import SdbError

PAYLOAD_PATH = Path(__file__).parent / "helpers/home-runtime-probe.json"
FILES = ("AeroTizenRuntimeProbe.dll", "AeroTizenRuntimeProbe.runtimeconfig.json")
PREFIX = "AEROTIZEN_HOME_RUNTIME\t"
FILE_PREFIX = "AEROTIZEN_HOME_RUNTIME_FILE\t"
LIBRARIES = (
    "libvconf.so.0",
    "libcapi-appfw-app-operation-tv.so.0",
    "libcapi-appfw-app-manager.so.0",
    "libapp-context-manager-common.so",
)
GETTERS = (
    *(key for key, kind in home.SETTINGS.items() if kind == "string"),
    "auto_start",
    "main_operation",
    "launcher_registration",
)
CAPABILITIES = ("CapInh", "CapPrm", "CapEff", "CapBnd", "CapAmb")
CHECKS = (*("library." + name for name in LIBRARIES), *("getter." + name for name in GETTERS))
STATUSES = {"ok", "absent", "unavailable", "missing_library", "missing_symbol", "skipped", "error"}
STARTUP_MARKER_PREFIX = "AEROTIZEN_RUNTIME_STARTUP_MARKER="
STAGES = {
    "arguments",
    "runtime",
    "bitness",
    "identity.uid",
    "identity.gid",
    "identity.capabilities",
    "identity.label",
    "platform",
    "native_guard",
    *CHECKS,
    "complete",
}
ERROR_CATEGORIES = {
    "missing_library",
    "missing_symbol",
    "type_load_failed",
    "missing_method",
    "access_denied",
    "io_error",
    "managed_exception",
    "unexpected_arguments",
}


def load_helper():
    try:
        if json.loads(PAYLOAD_PATH.read_text())["target_framework"] != "netcoreapp3.0":
            raise ValueError("Unexpected target")
        return home.load_helper(path=PAYLOAD_PATH, names=FILES)
    except (OSError, ValueError, KeyError, TypeError, DeviceSessionError) as error:
        raise DeviceSessionError(
            "The .NET 3.0 diagnostic payload is missing or invalid. Reinstall this build."
        ) from error


def parse_output(result, capabilities, launcher, *, app_context=False):
    """Discard all raw runtime/launcher messages and unknown identity fields."""
    if result.get("staging_cleaned") is not True:
        raise DeviceSessionError("Runtime diagnostic temporary-file cleanup was not confirmed.")
    try:
        code = result["exit_code"]
        if type(code) is not int or not 0 <= code <= 255 or launcher not in sdk.PROBE_LAUNCHERS:
            raise ValueError("Invalid execution")
        channels = {"file": {}, "console": {}}
        stages = {"file": [], "console": []}
        launchers, timeouts, markers = [], [], []
        launcher_errors = set()
        allowed = {
            "started",
            "complete",
            "runtime",
            "bits",
            "uid",
            "gid",
            "identity",
            "tizen",
            "security_label",
            "NoNewPrivs",
            "argument_count",
            "managed_exit_code",
            "error_category",
            *CAPABILITIES,
            *CHECKS,
        }
        for line in result["stdout"].splitlines():
            if line.startswith("AEROTIZEN_RUNTIME_LAUNCHER="):
                launchers.append(line.split("=", 1)[1])
            elif line.startswith("AEROTIZEN_RUNTIME_TIMEOUT="):
                timeouts.append(line.split("=", 1)[1])
            elif line.startswith(STARTUP_MARKER_PREFIX):
                markers.append(line[len(STARTUP_MARKER_PREFIX) :])
            elif line.startswith(sdk.RUNTIME_ERROR_PREFIX):
                category = line[len(sdk.RUNTIME_ERROR_PREFIX) :]
                if category in sdk.RUNTIME_ERROR_PATTERNS:
                    launcher_errors.add(category)
            elif line.startswith((PREFIX, FILE_PREFIX)):
                channel, prefix = (
                    ("file", FILE_PREFIX) if line.startswith(FILE_PREFIX) else ("console", PREFIX)
                )
                key, value = line[len(prefix) :].split("\t")
                if key == "stage":
                    if value not in STAGES or value in stages[channel]:
                        raise ValueError("Unknown or repeated stage")
                    stages[channel].append(value)
                else:
                    if key not in allowed or key in channels[channel]:
                        raise ValueError("Unknown or repeated field")
                    channels[channel][key] = value
            else:
                message = line.lower()
                launcher_errors.update(
                    category
                    for category, pattern in sdk.RUNTIME_ERROR_PATTERNS.items()
                    if re.search(pattern, message)
                )
        # A flushed file is authoritative. Never combine partial channels into a false completion.
        source = "file" if channels["file"] or stages["file"] else "console"
        fields = channels[source]
        last_stage = stages[source][-1] if stages[source] else None
        if len(launchers) != 1 or launchers[0] not in ("available", "missing") or timeouts not in ([], ["1"]):
            raise ValueError("Invalid launcher result")
        available = launchers[0] == "available"
        if markers not in ([], ["written"], ["not_observed"]) or (markers and not available):
            raise ValueError("Invalid startup marker result")
        startup_marker = markers[0] if markers else None
        complete = fields.get("complete") == "1"
        if any(fields.get(key, "1") != "1" for key in ("started", "complete")):
            raise ValueError("Invalid completion")
        if complete and not {"started", "runtime", "bits", "tizen", *CHECKS} <= fields.keys():
            raise ValueError("Incomplete managed report")
        if not available and (code != 127 or fields or timeouts):
            raise ValueError("Invalid missing launcher")
        for key in ("argument_count", "managed_exit_code"):
            if key in fields and (
                not re.fullmatch(r"\d{1,10}", fields[key])
                or int(fields[key]) > (255 if key == "managed_exit_code" else 4294967295)
            ):
                raise ValueError("Invalid managed execution metadata")
        error_category = fields.get("error_category")
        if error_category is not None and error_category not in ERROR_CATEGORIES:
            raise ValueError("Unknown managed error category")
        if complete and (
            error_category is not None
            or fields.get("managed_exit_code", "0") != "0"
            or fields.get("argument_count", "0") != "0"
            or (source == "file" and not {"argument_count", "managed_exit_code"} <= fields.keys())
        ):
            raise ValueError("Inconsistent managed completion")
        checks = {}
        for key in CHECKS:
            if key not in fields:
                checks[key] = None
                continue
            status, native_code = fields[key].split(",")
            if status not in STATUSES or (
                native_code != "-" and not re.fullmatch(r"-?\d{1,10}", native_code)
            ):
                raise ValueError("Invalid getter result")
            checks[key] = {"status": status, "code": None if native_code == "-" else int(native_code)}

        def number(key, allowed_values=None):
            value = fields.get(key, "")
            if not re.fullmatch(r"\d{1,10}", value):
                return None
            value = int(value)
            return (
                value if value <= 4294967295 and (allowed_values is None or value in allowed_values) else None
            )

        runtime = fields.get("runtime", "")
        runtime = runtime if re.fullmatch(r"\.NET(?: Core)? \d{1,3}(?:\.\d{1,5}){1,3}", runtime) else None
        state = "failed"
        if not available:
            state = "missing_launcher"
        elif timeouts:
            state = "timed_out"
        elif code == 0 and complete:
            state = "completed"
        return {
            "schema_version": 2,
            "probe": "home-dotnet30-execution",
            "cli_version": __version__,
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "read_only": True,
            "device": {
                "platform_version": home_probe._version(capabilities.get("platform_version")),
                "cpu_arch": capabilities.get("cpu_arch")
                if capabilities.get("cpu_arch") in home_probe.ARCHITECTURES
                else None,
            },
            "launcher": {
                "path": launcher,
                "available": available,
                "app_context_requested": app_context,
                "errors": sorted(launcher_errors),
            },
            "execution": {
                "state": state,
                "exit_code": code,
                "managed_started": startup_marker == "written" or fields.get("started") == "1",
                "startup_marker": startup_marker,
                "managed_completed": complete,
                "report_source": source if fields or last_stage else None,
                "last_stage": last_stage,
                "argument_count": number("argument_count"),
                "managed_exit_code": number("managed_exit_code"),
                "error_category": error_category,
                "target_framework": "netcoreapp3.0",
                "runtime": runtime,
                "architecture_bits": number("bits", {32, 64}),
                "uid": number("uid"),
                "gid": number("gid"),
                "tizen": None if fields.get("tizen") not in ("0", "1") else fields["tizen"] == "1",
                "capabilities": {
                    key: fields[key].lower()
                    if re.fullmatch(r"[0-9A-Fa-f]{1,16}", fields.get(key, ""))
                    else None
                    for key in CAPABILITIES
                },
                "no_new_privileges": number("NoNewPrivs", {0, 1}),
                "security_label_category": fields.get("security_label")
                if fields.get("security_label") in {"System", "User", "_", "other"}
                else None,
            },
            "libraries": {name: checks["library." + name] for name in LIBRARIES},
            "getters": {name: checks["getter." + name] for name in GETTERS},
            "transport": {"access": "sdk_uid_901", "staging_cleaned": True},
            "native_home_supported": None,
        }
    except (KeyError, TypeError, ValueError) as error:
        raise DeviceSessionError("Runtime diagnostic returned an invalid report.") from error


def collect(session, launcher="dotnet-launcher", *, app_context=False):
    path = "/usr/bin/" + launcher
    if path not in sdk.PROBE_LAUNCHERS:
        raise ValueError("Unknown diagnostic launcher")
    files = load_helper()
    capabilities = session.capability()
    if app_context:
        try:
            installed = catalog.parse_applist(session.applist())
        except (OSError, SdbError) as error:
            raise DeviceSessionError(
                "Could not confirm the installed AeroTizen launcher; no runtime probe was staged."
            ) from error
        if not any(app["appid"] == releases.APP_ID for app in installed):
            raise DeviceSessionError(
                "The installed AeroTizen launcher was not found; no runtime probe was staged."
            )
    try:
        result = sdk.run_standalone_probe(session, files, FILES[0], path, app_context=app_context)
    except (OSError, DeviceSessionError) as error:
        raise DeviceSessionError(
            "Runtime diagnostic transport failed; temporary-file cleanup is unconfirmed. "
            "Check SDB and allow the TV to connect back to this computer."
        ) from error
    return parse_output(result, capabilities, path, app_context=app_context)
