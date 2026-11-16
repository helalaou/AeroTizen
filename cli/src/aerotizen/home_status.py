"""Read current Home settings from the paired TV helper and launcher."""

import http.client
import re

from aerotizen import diagnostics, releases
from aerotizen.device import DeviceSessionError
from aerotizen.sdb import SdbError

APP_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,255}")
APP_FIELDS = ("home_button_app", "home_app", "startup_app", "startup_backup_app")
ROUTING_PROTOCOL = 1
ROUTING_MODES = ("watcher", "native", "hold", "blocked")


def read_native_settings(session):
    try:
        settings = session.read_root_home_status()
    except (OSError, SdbError, ValueError, RecursionError):
        return None
    if not isinstance(settings, dict):
        return None
    apps = {}
    for field in APP_FIELDS:
        value = settings.get(field)
        apps[field] = value if isinstance(value, str) and (not value or APP_ID.fullmatch(value)) else None
    autostart = settings.get("smart_hub_autostart")
    return {**apps, "smart_hub_autostart": autostart if type(autostart) is bool else None}


def read_routing_mode(session):
    try:
        status = diagnostics.fetch_watcher_status(session)
    except (OSError, SdbError, http.client.HTTPException, ValueError, RecursionError):
        return None
    control = status.get("homeControl") if isinstance(status, dict) else None
    if (
        not isinstance(control, dict)
        or control.get("app_id") != releases.APP_ID
        or type(control.get("protocol")) is not int
        or control["protocol"] != ROUTING_PROTOCOL
    ):
        return None
    mode = control.get("mode")
    return mode if mode in ROUTING_MODES else None


def read_paired(session):
    if not session.managed_root:
        raise DeviceSessionError("Paired Home status requires a connection through the paired TV helper.")

    native = read_native_settings(session)
    settings = native or {}
    # A watcher status timeout can close the SDB stream. Read the native status first.
    return {
        "schema_version": 1,
        "native_settings_source": "paired_helper" if native is not None else None,
        "home_button": {
            "assigned_app": settings.get("home_button_app"),
            "configured_app": settings.get("home_app"),
        },
        "startup": {
            "app": settings.get("startup_app"),
            "backup_app": settings.get("startup_backup_app"),
            "smart_hub_autostart": settings.get("smart_hub_autostart"),
        },
        "aerotizen_routing_mode": read_routing_mode(session),
    }
