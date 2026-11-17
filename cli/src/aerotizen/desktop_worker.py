"""Bounded TV operations for the desktop app's private JSON protocol."""

import contextlib
import hashlib
import io
import ipaddress
import json
import os
import re
import sys
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
from tempfile import TemporaryDirectory
from threading import Thread
from types import SimpleNamespace

from aerotizen import (
    __version__,
    buttons,
    catalog,
    discover,
    home,
    home_control,
    home_status,
    releases,
    remote,
)
from aerotizen.cli import install_signed_package, packages
from aerotizen.device import DeviceSession
from aerotizen.diagnostic_privacy import Policy
from aerotizen.sdb import SdbError, uninstall_failure_line

PROTOCOL_VERSION = 1
WORKER_NAME = "aerotizen-desktop-worker"
MAX_REQUEST_BYTES = 16 * 1024
MAX_TEXT_CHARACTERS = 256
MAX_DISCOVERED_TVS = 32
BUTTON_APP_LOOKUP_TIMEOUT_SECONDS = 4
BUTTON_CHANGE_ACTIONS = {"app": "map", "disabled": "disable", "default": "unmap"}
BUTTON_CHANGE_UNVERIFIED = (
    "The TV could not confirm the change. Refresh Button mapping to check the current assignment."
)
IDENTITY_PATTERN = re.compile(r"[a-f0-9]{64}")
PACKAGE_IDENTIFIER = re.compile(rf"[A-Za-z0-9][A-Za-z0-9_.-]{{0,{MAX_TEXT_CHARACTERS - 1}}}")
APP_COUNT_HEADER = re.compile(r"^\s*apps count\s*:\s*(\d+)\s*$", re.IGNORECASE | re.MULTILINE)
APP_LIST_ERROR = re.compile(r"^\s*(?:error|fail(?:ed|ure)?|permission denied)\b", re.IGNORECASE)
UNINSTALL_REFUSAL = re.compile(r"can\s*not\s+uninstall\s+app[.!]?", re.IGNORECASE)
CERTIFICATE_FILES = ("author.p12", "distributor.p12", "password.txt", "device-profile.xml")
OPERATIONS = (
    "handshake",
    "discover",
    "connect",
    "list_apps",
    "list_buttons",
    "list_button_apps",
    "change_button",
    "remove_apps",
    "launcher_catalog",
    "install_launcher",
    "read_home_backup",
    "prepare_native_home",
    "apply_native_home",
    "restore_home_backup",
)


class RequestError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def text_value(value, fallback="Unknown"):
    if not isinstance(value, str) or not value.strip():
        return fallback
    return "".join(character for character in unescape(value).strip() if character.isprintable())[
        :MAX_TEXT_CHARACTERS
    ]


def host_value(value):
    try:
        if not isinstance(value, str):
            raise ValueError
        host = ipaddress.IPv4Address(value)
        if host.is_multicast or host.is_unspecified or str(host) == "255.255.255.255":
            raise ValueError
        return str(host)
    except (ValueError, TypeError) as error:
        raise RequestError("invalid_address", "Enter a valid TV IPv4 address.") from error


def validate_request(request):
    if (
        not isinstance(request, dict)
        or type(request.get("protocol")) is not int
        or request["protocol"] != PROTOCOL_VERSION
        or not isinstance(request.get("id"), str)
        or not 0 < len(request["id"]) <= 80
        or request.get("operation") not in OPERATIONS
        or not isinstance(request.get("params", {}), dict)
    ):
        raise RequestError("invalid_request", "The desktop request is invalid or incompatible.")
    return request.get("params", {})


def find_tvs():
    return [
        {
            "host": host_value(tv.get("ip")),
            "name": text_value(tv.get("name"), "Samsung TV"),
            "model": text_value(tv.get("model"), "Samsung TV"),
        }
        for tv in discover.discover()[:MAX_DISCOVERED_TVS]
    ]


def technical_details(session, info):
    try:
        capabilities = session.capability()
    except (SdbError, OSError):
        capabilities = {}
    policy = Policy()
    return {
        "model_code": policy.value(info.get("modelName"), "model"),
        "tizen_version": policy.value(capabilities.get("platform_version"), "tizen"),
        "architecture": policy.value(capabilities.get("cpu_arch"), "arch"),
        "platform": policy.value(info.get("model"), "platform"),
        "root_runtime_version": policy.value(session.root_runtime_version, "version"),
    }


def _home_backup_path(identity):
    return Path(remote.CONFIG_DIR) / "backups" / identity / "original-home.json"


def _home_backup_summary(identity):
    path = _home_backup_path(identity)
    try:
        if not path.exists():
            return {"status": "missing"}
        if not path.is_file():
            return {"status": "unreadable"}
        document, _ = home._load_backup(path, identity)
        captured_at = datetime.fromisoformat(document["captured_at"]).isoformat()
    except (OSError, ValueError, home.HomeError):
        return {"status": "unreadable"}
    return {"status": "saved", "captured_at": captured_at}


def _verified_backup_document(identity, captured_at):
    try:
        document, _ = home._load_backup(_home_backup_path(identity), identity)
        verified_at = datetime.fromisoformat(document["captured_at"]).isoformat()
    except (OSError, ValueError, RecursionError, home.HomeError) as error:
        raise RequestError("backup_unreadable", "The original Home backup could not be verified.") from error
    if verified_at != captured_at:
        raise RequestError("backup_changed", "The backup changed. Refresh the TV connection to review it.")
    return document


def read_home_backup(params):
    identity = checked_identity(params.get("expected_identity"))
    document = _verified_backup_document(identity, params.get("captured_at"))
    values = document["home"]["settings"]
    startup, startup_backup = home.STARTUP_KEYS
    autostart = values[home.AUTOSTART_KEY]["value"]
    return {
        "home_button_app": document["home"]["default_app"],
        "home_app": values[home.HOME_KEY]["value"],
        "startup_app": values[startup]["value"],
        "startup_backup_app": values[startup_backup]["value"],
        "first_screen": values[home.FIRST_SCREEN_KEY]["value"],
        "smart_hub_autostart": bool(autostart) if autostart in (0, 1) else None,
    }


def prepare_native_home(params):
    """Verify or save this TV's backup using only reads and a local file write."""
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    path = _home_backup_path(expected)
    with DeviceSession(host) as session:
        _, identity = read_identity(session, expected)
        try:
            if not path.exists() and not path.is_symlink():
                try:
                    info = remote.info(host)
                except (OSError, SystemExit) as error:
                    raise home.HomeError(
                        "The TV model could not be read. Open Samsung Home and try again."
                    ) from error
                status = home.read_paired_backup_status(session, identity, info)
                read_identity(session, expected)
                home.save_backup(status, output=path)
            document, digest = home._load_backup(path, identity)
            captured_at = datetime.fromisoformat(document["captured_at"]).isoformat()
        except home.HomeError as error:
            raise RequestError("backup_unavailable", str(error)) from error
        except (ValueError, RecursionError) as error:
            raise RequestError(
                "backup_unavailable", "The original Home backup could not be verified."
            ) from error
    return {"id": identity, "captured_at": captured_at, "backup_sha256": digest}


def _verified_backup_digest(identity, backup_sha256):
    if not isinstance(backup_sha256, str) or not IDENTITY_PATTERN.fullmatch(backup_sha256):
        raise RequestError("invalid_request", "The Home backup verification is invalid.")
    try:
        _, digest = home._load_backup(_home_backup_path(identity), identity)
    except (OSError, ValueError, RecursionError, home.HomeError) as error:
        raise RequestError("backup_unreadable", "The original Home backup could not be verified.") from error
    if digest != backup_sha256:
        raise RequestError("backup_changed", "The backup changed. Refresh the TV connection to review it.")


def apply_native_home(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    _verified_backup_digest(expected, params.get("backup_sha256"))
    with DeviceSession(host) as session:
        read_identity(session, expected)
        try:
            info = home.device_info(session, host, state_dir=remote.CONFIG_DIR)
            home_control.change(session, info, "apply", state_dir=remote.CONFIG_DIR)
        except home.HomeError as error:
            raise RequestError("apply_failed", str(error)) from error
        return _connected_profile(session, host, expected, info)


def restore_home_backup(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    _verified_backup_document(expected, params.get("captured_at"))
    with DeviceSession(host) as session:
        read_identity(session, expected)
        try:
            info = home.device_info(session, host, state_dir=remote.CONFIG_DIR)
            home_control.change(session, info, "restore", state_dir=remote.CONFIG_DIR)
        except home.HomeError as error:
            raise RequestError("restore_failed", str(error)) from error
        return _connected_profile(session, host, expected, info)


def checked_identity(expected):
    if not isinstance(expected, str) or not IDENTITY_PATTERN.fullmatch(expected):
        raise RequestError("invalid_request", "The saved TV identity is invalid.")
    return expected


def read_identity(session, expected):
    duid = session.duid().strip()
    if not duid or len(duid) > MAX_TEXT_CHARACTERS or "fail" in duid.lower():
        raise RequestError("identity_unavailable", "The TV did not return its device identity.")
    identity = hashlib.sha256(duid.encode()).hexdigest()
    if expected is not None and identity != expected:
        raise RequestError(
            "identity_mismatch", "This address belongs to a different TV. No changes were made."
        )
    return duid, identity


def signing_profile(duid):
    # The DUID comes from the network. Use it only as one directory name.
    if not re.fullmatch(r"[A-Za-z0-9_#-][A-Za-z0-9_#.-]*", duid) or duid.endswith("."):
        return None
    directory = Path(remote.CONFIG_DIR) / "certs" / duid
    if all((directory / name).is_file() for name in CERTIFICATE_FILES):
        return directory
    return None


def installed_launcher_version(session):
    launchers = [app for app in catalog.parse_applist(session.applist()) if app["appid"] == releases.APP_ID]
    if not launchers:
        return None
    if len(launchers) != 1 or launchers[0]["pkgid"] != releases.PACKAGE_ID:
        raise RequestError("unexpected_package", "The TV reported an unexpected launcher package.")
    return text_value(launchers[0].get("version"), "Unknown")


def package_revision(package):
    apps = sorted((app["appid"], app["name"], app.get("version") or "") for app in package["apps"])
    return hashlib.sha256(json.dumps(apps, separators=(",", ":")).encode()).hexdigest()


def app_rows(installed):
    entries = [
        {
            "id": pkgid,
            "name": text_value(package["name"]),
            "apps": list(dict.fromkeys(text_value(app["name"]) for app in package["apps"])),
            "protected": package["class"] == "protected",
            "revision": package_revision(package),
        }
        for pkgid, package in installed.items()
    ]
    return sorted(entries, key=lambda entry: entry["name"].casefold())


def list_apps(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    with DeviceSession(host) as session:
        read_identity(session, expected)
        installed = packages(session.applist())
        read_identity(session, expected)
    return app_rows(installed)


def button_rows(status):
    rows = {}
    for rule in status["rules"]:
        label = rule["button"]
        mode = rule["mode"]
        app_id = rule.get("app_id")
        if (
            not buttons.valid_label(label)
            or mode not in BUTTON_CHANGE_ACTIONS
            or type(rule["active"]) is not bool
        ):
            raise ValueError("Invalid app button")
        if mode == "app" and (not isinstance(app_id, str) or not buttons.APP_ID.fullmatch(app_id)):
            raise ValueError("Invalid app button target")
        rows[label.casefold()] = {
            "button": label,
            "mode": mode,
            "app_id": app_id if mode == "app" else None,
            "active": mode != "default" and rule["active"],
        }
    for button in status.get("discovered") or []:
        label = button["button"]
        if buttons.valid_label(label):
            rows.setdefault(
                label.casefold(), {"button": label, "mode": "default", "app_id": None, "active": False}
            )
    return sorted(rows.values(), key=lambda row: row["button"].casefold())


def button_app_names(host, expected):
    with DeviceSession(host, timeout=BUTTON_APP_LOOKUP_TIMEOUT_SECONDS) as session:
        read_identity(session, expected)
        installed = catalog.parse_applist(session.applist())
        read_identity(session, expected)
    return {
        app["appid"]: text_value(app["name"], app["appid"])
        for app in installed
        if buttons.APP_ID.fullmatch(app["appid"])
    }


def list_button_apps(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    return [
        {"id": app_id, "name": name}
        for app_id, name in sorted(
            button_app_names(host, expected).items(), key=lambda app: (app[1].casefold(), app[0])
        )
    ]


def list_buttons(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    try:
        status = buttons.run(
            SimpleNamespace(button_action="list", receipt=None),
            host,
            remote.CONFIG_DIR,
            expected_identity=expected,
        )
    except buttons.ButtonAvailabilityError as error:
        if error.code in ("pairing_required", "helper_update_required"):
            return {"status": error.code}
        raise RequestError(error.code, str(error)) from error
    if status.get("error"):
        raise RequestError("button_rules_unreadable", "The saved button assignments could not be read.")
    rows = button_rows(status)
    app_names = {releases.APP_ID: "AeroTizen"}
    if any(row["app_id"] and row["app_id"] not in app_names for row in rows):
        try:
            app_names.update(button_app_names(host, expected))
        except (OSError, SdbError):
            pass  # The authenticated assignments are still available without display names.
    return {
        "status": "ready",
        "buttons": [{**row, "app_name": app_names.get(row["app_id"])} for row in rows],
        "discovery_detail": text_value(status.get("discovery_detail"), None),
    }


def run_button_edit(host, expected, action, *, label="", app_id=None):
    args = SimpleNamespace(button_action=action, button=label, receipt=None, yes=True)
    try:
        status = buttons.run(
            args,
            host,
            remote.CONFIG_DIR,
            expected_identity=expected,
            target_app_id=app_id,
        )
    except buttons.ButtonAvailabilityError as error:
        raise RequestError(error.code, str(error)) from error
    except (OSError, SdbError) as error:
        raise RequestError("button_change_unverified", BUTTON_CHANGE_UNVERIFIED) from error
    if detail := status.get("error"):
        raise RequestError("button_change_failed", text_value(detail, BUTTON_CHANGE_UNVERIFIED))
    return status


def change_button_inventory(host, expected, change):
    action = change.get("action")
    if action == "reset" and set(change) == {"action"}:
        status = run_button_edit(host, expected, "reset")
        if status.get("rules") == []:
            return True
    elif action == "learn" and set(change) == {"action", "button"}:
        label = change.get("button")
        if not buttons.valid_label(label):
            raise RequestError(
                "invalid_request", f"Use a button name of up to {buttons.MAX_LABEL_LENGTH} characters."
            )
        status = run_button_edit(host, expected, "learn", label=label)
        if any(
            row["button"].casefold() == label.casefold() and row["mode"] == "default"
            for row in button_rows(status)
        ):
            return True
    else:
        raise RequestError("invalid_request", "Choose a button action.")
    raise RequestError("button_change_unverified", BUTTON_CHANGE_UNVERIFIED)


def change_button(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    change = params.get("change")
    if not isinstance(change, dict):
        raise RequestError("invalid_request", "Choose a remote button and an action.")
    if "action" in change:
        return change_button_inventory(host, expected, change)
    label = change.get("button")
    mode = change.get("mode")
    app_id = change.get("app_id")
    if not buttons.valid_label(label) or not isinstance(mode, str) or mode not in BUTTON_CHANGE_ACTIONS:
        raise RequestError("invalid_request", "Choose a remote button and an action.")
    if mode == "app" and (not isinstance(app_id, str) or not buttons.APP_ID.fullmatch(app_id)):
        raise RequestError("invalid_request", "Choose an installed app.")

    status = run_button_edit(
        host, expected, BUTTON_CHANGE_ACTIONS[mode], label=label, app_id=app_id if mode == "app" else None
    )
    saved = next((row for row in button_rows(status) if row["button"].casefold() == label.casefold()), None)
    if saved is None and mode == "default":
        saved = {"button": label, "mode": "default", "app_id": None, "active": False}
    if saved is None or saved["mode"] != mode or (mode == "app" and saved["app_id"] != app_id):
        raise RequestError("button_change_unverified", BUTTON_CHANGE_UNVERIFIED)
    return {**saved, "button": label, "app_name": "AeroTizen" if saved["app_id"] == releases.APP_ID else None}


def removal_selection(value):
    if not isinstance(value, list) or not value:
        raise RequestError("invalid_request", "Select at least one package to remove.")
    selected = {}
    for item in value:
        pkgid = item.get("id") if isinstance(item, dict) else None
        revision = item.get("revision") if isinstance(item, dict) else None
        if (
            not isinstance(pkgid, str)
            or not PACKAGE_IDENTIFIER.fullmatch(pkgid)
            or pkgid in selected
            or not isinstance(revision, str)
            or not IDENTITY_PATTERN.fullmatch(revision)
        ):
            raise RequestError("invalid_request", "Review the installed packages and select them again.")
        selected[pkgid] = revision
    return selected


def checked_app_inventory(session):
    raw = session.applist()
    installed = packages(raw)
    app_ids = [app["appid"] for item in installed.values() for app in item["apps"]]
    count = APP_COUNT_HEADER.search(raw)
    if count:
        complete = int(count[1]) == len(app_ids)
    else:
        complete = installed and "app_tizen_id" not in raw and not APP_LIST_ERROR.match(raw)
    if not complete or len(set(app_ids)) != len(app_ids):
        raise RequestError(
            "inventory_unavailable", "Could not verify the TV's app list. Refresh the TV and try again."
        )
    return installed


def removal_app_id(pkgid, revision, installed):
    package = installed.get(pkgid)
    if package is None or package_revision(package) != revision:
        raise RequestError(
            "apps_changed", "The app list changed. Refresh the TV and review your selection again."
        )
    if package["class"] == "protected":
        raise RequestError("protected_package", "The selection includes a protected package.")
    app_id = package["apps"][0]["appid"]
    if not PACKAGE_IDENTIFIER.fullmatch(app_id):
        raise RequestError("invalid_app_id", "The TV reported an unsupported app identifier.")
    return app_id


def remove_apps(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    selected = removal_selection(params.get("packages"))
    with DeviceSession(host) as session:
        read_identity(session, expected)
        current = checked_app_inventory(session)
        read_identity(session, expected)
        # Validate every package before starting the first uninstall.
        for pkgid, revision in selected.items():
            removal_app_id(pkgid, revision, current)
        results = []
        for pkgid, revision in selected.items():
            status = "not_attempted"
            detail = ""
            if current is not None:
                try:
                    app_id = removal_app_id(pkgid, revision, current)
                except RequestError:
                    results.append({"id": pkgid, "status": status})
                    continue
                try:
                    reply = session.uninstall(app_id)
                    after = checked_app_inventory(session)
                    read_identity(session, expected)
                except (SdbError, OSError, ValueError):
                    current = None
                    status = "unverified"
                else:
                    # A dropped or incomplete list must not count as a successful removal.
                    if current.keys() - after.keys() - {pkgid}:
                        current = None
                        status = "unverified"
                    else:
                        current = after
                        status = "still_installed" if pkgid in current else "removed"
                        if status == "still_installed":
                            if any(
                                UNINSTALL_REFUSAL.fullmatch(line.strip(" \t\x00"))
                                for line in reply.splitlines()
                            ):
                                status = "refused"
                            else:
                                detail = text_value(uninstall_failure_line(reply), fallback="")
            result = {"id": pkgid, "status": status}
            if detail:
                result["detail"] = detail
            results.append(result)
    return {"apps": app_rows(current) if current is not None else None, "results": results}


def _connected_profile(session, host, expected, info):
    duid, identity = read_identity(session, expected)
    launcher_version = installed_launcher_version(session)
    details = technical_details(session, info)
    if session.duid().strip() != duid:
        raise RequestError("identity_mismatch", "The TV identity changed during the connection check.")
    native_home_settings = home_status.read_native_settings(session)
    # A timeout closes the SDB stream, so check this optional status after the TV identity.
    home_routing_mode = home_status.read_routing_mode(session) if launcher_version else None
    return {
        "identity_sha256": identity,
        "host": host,
        "name": text_value(info.get("name"), "Samsung TV"),
        "model": text_value(info.get("modelName"), "Samsung TV"),
        "launcher_version": launcher_version,
        "launcher_signing_ready": signing_profile(duid) is not None,
        "transport": "paired_root" if session.managed_root else "developer",
        "developer_mode": text_value(info.get("developerMode"), "Unknown"),
        "developer_host": text_value(info.get("developerIP"), "Unknown"),
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "technical_details": details,
        "home_backup": _home_backup_summary(identity),
        "home_routing_mode": home_routing_mode,
        "native_home_settings": native_home_settings,
    }


def connect_tv(params):
    host = host_value(params.get("host"))
    expected = params.get("expected_identity")
    if expected is not None:
        checked_identity(expected)
    try:
        info = remote.info(host)
    except SystemExit:
        info = {}
    with DeviceSession(host) as session:
        return _connected_profile(session, host, expected, info)


def install_launcher(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    version = params.get("version")
    current = params.get("current_version")
    confirmed = params.get("confirm_replace")
    if (
        not isinstance(version, str)
        or not 0 < len(version) <= MAX_TEXT_CHARACTERS
        or not releases.VERSION.fullmatch(version)
        or "current_version" not in params
        or (current is not None and (not isinstance(current, str) or len(current) > MAX_TEXT_CHARACTERS))
        or type(confirmed) is not bool
    ):
        raise RequestError("invalid_request", "Choose a published launcher version.")
    if current == version:
        raise RequestError("already_installed", "This version is already installed.")
    if (
        current is not None
        and not confirmed
        and (
            not releases.VERSION.fullmatch(current)
            or releases.version_key(version) < releases.version_key(current)
        )
    ):
        raise RequestError("confirmation_required", "Confirm replacement of the current version first.")

    with TemporaryDirectory(prefix="aerotizen-desktop-install-") as temporary:
        try:
            downloaded = releases.download_launcher(Path(temporary), version=version)
        except releases.ReleaseError as error:
            raise RequestError(
                "release_unavailable",
                "Could not get a verified launcher package. "
                "Check your internet connection and desktop app version.",
            ) from error
        # Use the TV's existing authorized SDB connection. This only installs a signed widget.
        with DeviceSession(host) as session:
            duid, _ = read_identity(session, expected)
            if installed_launcher_version(session) != current:
                raise RequestError(
                    "launcher_changed", "The installed version changed. Refresh the TV and try again."
                )
            profile = signing_profile(duid)
            if profile is None:
                raise RequestError("certificates_required", "Set up this TV's signing certificates first.")
            read_identity(session, expected)
            try:
                installed = install_signed_package(session, downloaded.path, temporary, profile)
            except (ValueError, OSError, SdbError) as error:
                raise RequestError(
                    "install_failed",
                    "Could not verify installation. Refresh the TV before retrying. "
                    "Check that you are using the original signing profile.",
                ) from error
            if installed != version:
                raise RequestError(
                    "version_unverified",
                    "The TV did not report the requested version. Refresh the TV to check.",
                )
            return installed


def handle(request):
    request_id = request.get("id") if isinstance(request, dict) else None
    response = {"protocol": PROTOCOL_VERSION, "id": request_id}
    try:
        params = validate_request(request)
        with contextlib.redirect_stdout(io.StringIO()):
            if request["operation"] == "handshake":
                result = {"name": WORKER_NAME, "version": __version__, "operations": list(OPERATIONS)}
            elif request["operation"] == "discover":
                result = find_tvs()
            elif request["operation"] == "list_apps":
                result = list_apps(params)
            elif request["operation"] == "list_buttons":
                result = list_buttons(params)
            elif request["operation"] == "list_button_apps":
                result = list_button_apps(params)
            elif request["operation"] == "change_button":
                result = change_button(params)
            elif request["operation"] == "remove_apps":
                result = remove_apps(params)
            elif request["operation"] == "launcher_catalog":
                result = releases.launcher_catalog()
            elif request["operation"] == "install_launcher":
                result = install_launcher(params)
            elif request["operation"] == "read_home_backup":
                result = read_home_backup(params)
            elif request["operation"] == "prepare_native_home":
                result = prepare_native_home(params)
            elif request["operation"] == "apply_native_home":
                result = apply_native_home(params)
            elif request["operation"] == "restore_home_backup":
                result = restore_home_backup(params)
            else:
                result = connect_tv(params)
        return {**response, "result": result}
    except RequestError as error:
        return {**response, "error": {"code": error.code, "message": str(error)}}
    except releases.ReleaseError:
        return {
            **response,
            "error": {
                "code": "release_unavailable",
                "message": "Could not load launcher versions.",
            },
        }
    except OSError as error:
        if request["operation"] == "discover":
            return {
                **response,
                "error": {
                    "code": "discovery_failed",
                    "message": "TV search could not access the local network. Allow network access for "
                    "AeroTizen Desktop in system settings, then retry or enter the TV IP address.",
                    "system_error": error.errno,
                },
            }
        return connection_error(response)
    except (SdbError, SystemExit):
        return connection_error(response)
    except (ValueError, TypeError, KeyError):
        return {
            **response,
            "error": {"code": "invalid_response", "message": "The TV returned an unsupported response."},
        }


def connection_error(response):
    return {
        **response,
        "error": {
            "code": "connection_failed",
            "message": "Could not connect. Check the TV address, Developer Mode and Host PC IP. "
            "Also allow AeroTizen Desktop to access the local network in system settings.",
        },
    }


def stop_on_input_close():
    # Read from the raw pipe so interpreter shutdown can close buffered stdin when the request finishes.
    os.read(sys.stdin.fileno(), 1)
    os._exit(0)


def main():
    line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    try:
        if len(line) > MAX_REQUEST_BYTES:
            raise ValueError
        request = json.loads(line)
    except (ValueError, UnicodeError):
        request = None
    if (
        isinstance(request, dict)
        and request.get("operation") in ("list_apps", "list_buttons", "list_button_apps")
        and request.get("cancellable") is True
    ):
        Thread(target=stop_on_input_close, daemon=True).start()
    print(json.dumps(handle(request), separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
