"""Read native Home state and save an immutable, device-bound local baseline."""

import base64
import hashlib
import json
import math
import os
import secrets
import shlex
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import releases, remote
from aerotizen.device import DeviceSessionError
from aerotizen.root import SUPPORTED_VERSION

OPERATION = "http://tizen.org/appcontrol/operation/main"
HOME_KEY = "db/appfw/home_appid"
SETTINGS = {
    HOME_KEY: "string",
    "db/appfw/startup_appid": "string",
    "db/appfw/booting_appid_backup": "string",
    "db/first_screen/type": "string",
    "db/menu/smart_hub/ontvsetting/auto_start": "int",
}
PAYLOAD_PATH = Path(__file__).parent / "helpers/home-query.json"
HELPER_FILES = ("AeroTizenHomeQuery.dll", "AeroTizenHomeQuery.runtimeconfig.json")
QUERY_PREFIX = "AEROTIZEN_HOME_QUERY="
CLEANUP_MARKER = "AEROTIZEN_HOME_QUERY_CLEANED"


class HomeError(DeviceSessionError):
    pass


def load_helper(*, path=None, names=HELPER_FILES):
    try:
        manifest = json.loads((PAYLOAD_PATH if path is None else path).read_text())
        if (
            not isinstance(manifest, dict)
            or type(manifest.get("schema_version")) is not int
            or manifest["schema_version"] != 1
            or set(manifest["files"]) != set(names)
        ):
            raise ValueError("Unexpected helper manifest")
        files = {}
        for name in names:
            item = manifest["files"][name]
            data = base64.b64decode(item["base64"], validate=True)
            if not data or len(data) > 1024 * 1024 or hashlib.sha256(data).hexdigest() != item["sha256"]:
                raise ValueError("Helper checksum mismatch")
            files[name] = data
        return files
    except (OSError, ValueError, KeyError, TypeError) as exc:
        raise HomeError(
            "Read-only Home helper is missing or invalid. Build it with python tools/build_home_query.py."
        ) from exc


def query_script(files):
    directory = f"/tmp/aerotizen-home-read-{secrets.token_hex(12)}"
    lines = [
        "set -eu",
        f"work={shlex.quote(directory)}",
        'mkdir -m 700 "$work"',
        "cleanup() {",
        "  result=$?; trap - EXIT",
        '  rm -f "$work/AeroTizenHomeQuery.dll" "$work/AeroTizenHomeQuery.runtimeconfig.json" || exit 90',
        '  rmdir "$work" || exit 91',
        f"  printf '\\n%s\\n' {CLEANUP_MARKER}",
        '  exit "$result"',
        "}",
        "trap cleanup EXIT",
    ]
    for name in HELPER_FILES:
        data = files[name]
        encoded = base64.b64encode(data).decode()
        digest = hashlib.sha256(data).hexdigest()
        lines.extend(
            [
                f"printf '%s' {shlex.quote(encoded)} | base64 -d > \"$work/{name}\"",
                f"printf '%s  %s\\n' {digest} \"$work/{name}\" | sha256sum -c - >/dev/null",
            ]
        )
    lines.append('/usr/bin/dotnet "$work/AeroTizenHomeQuery.dll"')
    return "\n".join(lines)


def query_command(files):
    # The pinned upstream agent doubles backslashes in ProcessStartInfo.Arguments.
    # An ASCII base64 envelope preserves the exact script after that boundary.
    encoded = base64.b64encode(query_script(files).encode()).decode()
    command = f"printf %s {shlex.quote(encoded)} | base64 -d | /bin/sh"
    if len(command.encode()) > 65536:
        raise HomeError("The Home helper exceeds the upstream command-size limit.")
    return command


def _value(value, kind):
    if not isinstance(value, dict) or value.get("type") != kind:
        raise HomeError("The Home helper returned an invalid typed value.")
    if value.get("status") == "unavailable":
        if value.get("value") is not None or not isinstance(value.get("error"), str):
            raise HomeError("The Home helper returned an invalid unavailable value.")
    elif value.get("status") != "ok" or type(value.get("value")) is not {"string": str, "int": int}[kind]:
        raise HomeError("The Home helper returned an invalid typed value.")


def parse_query(stdout, *, expected_uid=0, cleanup_marker=CLEANUP_MARKER):
    lines = stdout.splitlines()
    records = [line[len(QUERY_PREFIX) :] for line in lines if line.startswith(QUERY_PREFIX)]
    if len(records) != 1 or lines.count(cleanup_marker) != 1:
        raise HomeError("The Home query or its temporary-file cleanup was not confirmed.")
    try:
        query = json.loads(records[0])
        if (
            type(query["schema_version"]) is not int
            or query["schema_version"] != 1
            or query["read_only"] is not True
            or type(query["uid"]) is not int
            or query["uid"] != expected_uid
            or query["architecture_bits"] != 32
            or query["os_release"]["ID"] != "tizen"
            or not query["os_release"]["BUILD_ID"]
            or not query["os_release"]["VERSION_ID"]
            or set(query["settings"]) != set(SETTINGS)
            or query["watcher"]["state"]
            not in ("active", "paused", "unknown", "native", "handoff", "blocked")
            or type(query["watcher"]["reachable"]) is not bool
        ):
            raise ValueError("Unexpected query fields")
        _value(query["main_operation"], "string")
        for key, kind in SETTINGS.items():
            _value(query["settings"][key], kind)
        diagnostic = query["watcher"].get("error")
        if diagnostic is not None and (
            not isinstance(diagnostic, dict)
            or diagnostic.get("code")
            not in ("timeout", "connection_error", "http_error", "invalid_response", "query_error")
            or not isinstance(diagnostic.get("message"), str)
            or not diagnostic["message"]
            or (
                "http_status" in diagnostic
                and (
                    type(diagnostic["http_status"]) is not int or not 100 <= diagnostic["http_status"] <= 599
                )
            )
            or ("socket_error" in diagnostic and not isinstance(diagnostic["socket_error"], str))
        ):
            raise ValueError("Invalid Home service diagnostic")
        boot = query.get("boot")
        launcher = query["launcher"]
        if not isinstance(launcher, dict) or (
            type(launcher.get("installed")) is not bool
            and not (launcher.get("installed") is None and isinstance(launcher.get("error"), str))
        ):
            raise ValueError("Invalid launcher installation evidence")
        if boot is not None and (
            not isinstance(boot, dict)
            or not isinstance(boot.get("id"), str)
            or str(uuid.UUID(boot["id"])) != boot["id"]
            or type(boot["uptime_seconds"]) not in (int, float)
            or not math.isfinite(boot["uptime_seconds"])
            or boot["uptime_seconds"] < 0
        ):
            raise ValueError("Invalid boot evidence")
        return query
    except (ValueError, KeyError, TypeError) as exc:
        raise HomeError("The Home helper returned an invalid query document.") from exc


def _mode(main, settings):
    home = settings[HOME_KEY]
    if main["status"] != "ok" or home["status"] != "ok":
        return "unknown"
    if main["value"] != home["value"]:
        return "inconsistent"
    return {releases.APP_ID: "native", "com.samsung.tv.csfs": "stock"}.get(home["value"], "custom")


def device_info(session, host, *, backup=None, state_dir=None):
    """Keep Home recovery usable before Samsung's optional HTTP server starts."""
    try:
        return remote.info(host)
    except SystemExit as error:
        if not isinstance(error.__cause__, OSError):
            raise
        identity = session.duid().strip()
        if not identity or "fail" in identity.lower():
            raise HomeError("TV metadata is offline and SDK identity is unavailable.") from error
        digest = hashlib.sha256(identity.encode()).hexdigest()
        directory = Path(state_dir) if state_dir is not None else Path(remote.CONFIG_DIR)
        path = Path(backup) if backup is not None else directory / "backups" / digest / "original-home.json"
        try:
            saved, _ = _load_backup(path.expanduser(), digest)
        except HomeError as exc:
            raise HomeError(
                "TV metadata is offline and no valid backup matches the SDK identity. "
                "Open Samsung Home, then retry."
            ) from exc
        return {
            "modelName": saved["device"]["model"],
            "model": saved["device"]["platform"],
            "_aerotizen_metadata_source": "identity-bound original backup; HTTP metadata unavailable",
        }


def read_status(session, provider, info):
    files = load_helper()  # Check package data before starting any root operation.
    identity = session.duid().strip()
    if not identity or "fail" in identity.lower():
        raise HomeError("The TV did not return a device identity.")
    capabilities = session.capability()
    if provider is None:
        from aerotizen import sdk

        result = sdk.run(session, files, HELPER_FILES[0])
        if result["exit_code"] != 0:
            raise HomeError("SDK Home query failed: " + result["stdout"][-2000:])
        query = parse_query(result["stdout"], expected_uid=901, cleanup_marker=sdk.CLEANUP_MARKER)
        provenance = {
            "access": "sdk_uid_901",
            "uid": 901,
            "authenticated": True,
            "sdk_staging_cleaned": result["staging_cleaned"],
            "query_staging_cleaned": True,
        }
    else:
        command = query_command(files)
        evidence = session.root(provider, (command,))
        query = parse_query(evidence["commands"][0]["stdout"])
        provenance = {
            "access": "temporary_root",
            "root_tool_version": SUPPORTED_VERSION,
            "authenticated": evidence["authenticated"],
            "uid": query["uid"],
            "upstream_staging_cleaned": evidence["staging_cleaned"],
            "system_files_unchanged": evidence["system_files_unchanged"],
            "query_staging_cleaned": True,
        }
    if session.duid().strip() != identity:
        raise HomeError("The TV identity changed during the Home query.")
    main, settings = query["main_operation"], query["settings"]
    return {
        "schema_version": 1,
        "queried_at": datetime.now(timezone.utc).isoformat(),
        "device": {
            "identity_sha256": hashlib.sha256(identity.encode()).hexdigest(),
            "model": info.get("modelName"),
            "platform": info.get("model"),
            "cpu_arch": capabilities.get("cpu_arch"),
            "os_version": query["os_release"]["VERSION_ID"],
            "firmware_build": query["os_release"]["BUILD_ID"],
        },
        "home": {
            "operation": OPERATION,
            "main_operation": main,
            "settings": settings,
            "mode": _mode(main, settings),
        },
        "watcher": query["watcher"],
        "launcher": query["launcher"],
        "boot": query.get("boot"),
        "complete": all(item["status"] == "ok" for item in [main, *settings.values()]),
        "evidence": {
            **provenance,
            "model_metadata_source": info.get("_aerotizen_metadata_source", "live HTTP metadata"),
            "helper_sha256": hashlib.sha256(files[HELPER_FILES[0]]).hexdigest(),
        },
    }


def baseline_from_status(status):
    if status.get("complete") is not True:
        raise HomeError("Cannot back up incomplete native Home state; resolve unavailable reads first.")
    home = status["home"]
    baseline = {
        "schema_version": 1,
        "kind": "aerotizen.home-baseline",
        "captured_at": status["queried_at"],
        "device": status["device"],
        "home": {
            "operation": OPERATION,
            "default_app": home["main_operation"]["value"],
            "settings": {
                key: {"type": value["type"], "value": value["value"]}
                for key, value in home["settings"].items()
            },
        },
        "evidence": status["evidence"],
    }
    validate_backup(baseline, status["device"]["identity_sha256"])
    return baseline


def validate_backup(document, identity):
    try:
        if (
            type(document["schema_version"]) is not int
            or document["schema_version"] != 1
            or document["kind"] != "aerotizen.home-baseline"
            or document["device"]["identity_sha256"] != identity
            or len(identity) != 64
            or any(c not in "0123456789abcdef" for c in identity)
            or not isinstance(document["device"]["firmware_build"], str)
            or not document["device"]["firmware_build"]
            or not isinstance(document["device"]["model"], str)
            or not document["device"]["model"]
            or not isinstance(document["captured_at"], str)
            or not document["captured_at"]
            or document["home"]["operation"] != OPERATION
            or not isinstance(document["home"]["default_app"], str)
            or not document["home"]["default_app"]
            or set(document["home"]["settings"]) != set(SETTINGS)
        ):
            raise ValueError("Invalid baseline metadata or device binding")
        home = document["home"]
        for key, kind in SETTINGS.items():
            item = home["settings"][key]
            if item["type"] != kind or type(item["value"]) is not {"string": str, "int": int}[kind]:
                raise ValueError("Invalid typed baseline setting")
        if not home["settings"][HOME_KEY]["value"]:
            raise ValueError("Home application is empty")
        if home["default_app"] == releases.APP_ID or any(
            item["value"] == releases.APP_ID for item in home["settings"].values()
        ):
            raise ValueError("AeroTizen is already present in the Home/startup baseline")
        evidence = document["evidence"]
        required = ["authenticated", "query_staging_cleaned"]
        if evidence["access"] == "temporary_root":
            required += ["upstream_staging_cleaned", "system_files_unchanged"]
            expected_uid = 0
        elif evidence["access"] == "sdk_uid_901":
            required += ["sdk_staging_cleaned"]
            expected_uid = 901
        else:
            raise ValueError("Unknown baseline access method")
        for key in required:
            if document["evidence"][key] is not True:
                raise ValueError("Baseline lacks verified read/cleanup evidence")
        if (
            type(evidence["uid"]) is not int
            or evidence["uid"] != expected_uid
            or len(evidence["helper_sha256"]) != 64
            or any(c not in "0123456789abcdef" for c in evidence["helper_sha256"])
        ):
            raise ValueError("Invalid native query provenance")
    except (KeyError, TypeError, ValueError) as exc:
        raise HomeError(f"Invalid Home backup: {exc}") from exc


def _load_backup(path, identity):
    try:
        if path.stat().st_size > 128 * 1024:
            raise ValueError("Backup file is too large")
        raw = path.read_bytes()
        document = json.loads(raw)
        validate_backup(document, identity)
        return document, hashlib.sha256(raw).hexdigest()
    except (OSError, ValueError) as exc:
        raise HomeError(f"Cannot read existing Home backup at {path}: {exc}") from exc


def save_backup(status, *, output=None, state_dir=None):
    identity = status["device"]["identity_sha256"]
    directory = Path(state_dir) if state_dir is not None else Path(remote.CONFIG_DIR)
    path = (
        Path(output).expanduser().absolute()
        if output is not None
        else (directory / "backups" / identity / "original-home.json")
    )
    created = False
    if not path.exists():
        candidate = baseline_from_status(status)
        path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor, temporary = tempfile.mkstemp(prefix=".home-backup-", dir=path.parent)
        temporary = Path(temporary)
        try:
            with os.fdopen(descriptor, "wb") as stream:
                stream.write((json.dumps(candidate, indent=2) + "\n").encode())
                stream.flush()
                os.fsync(stream.fileno())
            try:
                os.link(temporary, path)  # Atomic create-if-absent, never replace an original.
                created = True
                if os.name != "nt":
                    folder = os.open(path.parent, os.O_RDONLY)
                    try:
                        os.fsync(folder)
                    finally:
                        os.close(folder)
            except FileExistsError:
                pass
        finally:
            temporary.unlink(missing_ok=True)
    document, digest = _load_backup(path, identity)
    return {
        "path": str(path),
        "created": created,
        "sha256": digest,
        "matches_current": status.get("complete") is True
        and document["home"]
        == {
            "operation": OPERATION,
            "default_app": status["home"]["main_operation"]["value"],
            "settings": {
                key: {"type": value["type"], "value": value["value"]}
                for key, value in status["home"]["settings"].items()
            },
        },
        "firmware_matches": document["device"]["firmware_build"] == status["device"]["firmware_build"],
    }
