"""Configure physical app shortcuts through the paired TV helper."""

import json
import re
import sys
import unicodedata
from pathlib import Path

from aerotizen import catalog, releases, root_state
from aerotizen.device import DeviceSession, DeviceSessionError
from aerotizen.root_bridge import BridgeClient, BridgeSdb
from aerotizen.sdb import SdbError

LEGACY_LABEL = re.compile(r"[a-z][a-z0-9-]{0,23}")
APP_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,119}")
PROTOCOL = 1
LEARN_TIMEOUT_SECONDS = 25
MAX_LABEL_LENGTH = 48
MAX_LOOKUP_CODES = 4
MAX_KEY_CODE = 767
READ_ACTIONS = {"list", "status", "key-names", "input-devices"}


class ButtonAvailabilityError(DeviceSessionError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def configure_parser(parser, handler):
    commands = parser.add_subparsers(dest="buttons_command", required=True)
    actions = {
        "list": "discover app buttons on the connected remote and show saved shortcuts",
        "status": "show saved shortcuts and whether they are active",
        "key-names": "read the names Samsung assigns to raw key codes",
        "input-devices": "show the input devices registered with the TV compositor",
        "learn": "learn an app button from a physical press",
        "map": "open an installed app with an app button",
        "disable": "make an app button do nothing",
        "unmap": "restore the original action of an app button",
        "reset": "restore all original actions and forget learned buttons",
    }
    for action, help_text in actions.items():
        command = commands.add_parser(action, help=help_text)
        command.add_argument("--json", action="store_true", help="print machine-readable status")
        command.add_argument("--receipt", type=Path, help="use a specific private root recovery record")
        if action not in READ_ACTIONS:
            command.add_argument("--yes", action="store_true", help="apply the change")
        if action not in READ_ACTIONS and action != "reset":
            command.add_argument("button", help='name for the physical app button (e.g. "Amazon Prime")')
        if action == "map":
            command.add_argument("--app", required=True, help="installed app name or Tizen app ID")
        if action == "key-names":
            command.add_argument("codes", metavar="CODE", type=int, nargs="+", help="key codes to look up")
        command.set_defaults(fn=handler, button_action=action)


def resolve_app(target, host, receipt):
    target = target.strip()
    name = target.casefold()
    if name == "launcher":
        return releases.APP_ID
    has_id_syntax = APP_ID.fullmatch(target) is not None
    allow_id_fallback = has_id_syntax and ("." in target or target.isdecimal())
    try:
        with BridgeSdb(host, receipt) as sdb:
            apps = catalog.parse_applist(sdb.applist())
    except (OSError, SdbError):
        if allow_id_fallback:
            return target  # The helper can verify an ID without an app list.
        raise

    if has_id_syntax and any(app["appid"] == target for app in apps):
        return target
    matches = {
        app["appid"]
        for app in apps
        if name in (app["name"].casefold(), app["appid"].casefold()) and APP_ID.fullmatch(app["appid"])
    }
    if len(matches) == 1:
        return matches.pop()
    if matches:
        raise ValueError("More than one installed app has that name. Pass its Tizen app ID.")
    if allow_id_fallback:
        return target
    raise ValueError("Installed app not found. Use aerotizen apps --json to find its Tizen app ID.")


def valid_label(label):
    return (
        isinstance(label, str)
        and bool(label)
        and label == label.strip()
        and not any(unicodedata.category(char) in ("Cc", "Cs", "Zl", "Zp") for char in label)
        and len(label.encode("utf-16-le")) // 2 <= MAX_LABEL_LENGTH
    )


def run(args, host, state_dir, *, expected_identity=None, target_app_id=None):
    action = args.button_action
    label = getattr(args, "button", "").strip()
    if action not in READ_ACTIONS and action != "reset" and not valid_label(label):
        raise ValueError(f"Use a single-line button name of up to {MAX_LABEL_LENGTH} characters.")
    receipt = root_state.load(args.receipt) if args.receipt else root_state.find(host, state_dir)
    if not receipt or receipt["phase"] != "active":
        raise ButtonAvailabilityError(
            "pairing_required", "Complete root setup and verify the paired helper with aerotizen root status."
        )
    if expected_identity is not None and receipt["duid_sha256"] != expected_identity:
        raise ButtonAvailabilityError(
            "identity_mismatch", "This address belongs to a different TV. No changes were made."
        )
    apply = getattr(args, "yes", False)
    payload = {"action": action, "apply": apply}
    if action == "key-names":
        if len(args.codes) > MAX_LOOKUP_CODES or any(not 0 <= code <= MAX_KEY_CODE for code in args.codes):
            raise ValueError(f"Enter up to {MAX_LOOKUP_CODES} key codes from 0 to {MAX_KEY_CODE}.")
        payload["codes"] = args.codes
    with DeviceSession(host, lock_dir=Path(state_dir) / "sessions").ownership():
        client = BridgeClient(host, receipt, timeout=LEARN_TIMEOUT_SECONDS if action == "learn" else 8)
        capabilities = client.request()
        if capabilities.get("buttons_protocol") != PROTOCOL:
            raise ButtonAvailabilityError(
                "helper_update_required", "The TV helper needs an update for app buttons."
            )
        if label:
            if not capabilities.get("buttons_friendly_names"):
                label = label.lower()
                if not LEGACY_LABEL.fullmatch(label):
                    raise ButtonAvailabilityError(
                        "helper_update_required", "Update the TV helper to use this button name."
                    )
            payload["button"] = label
        if action == "key-names" and not capabilities.get("buttons_key_names"):
            raise DeviceSessionError("Update the TV helper to look up Samsung key names.")
        if action == "input-devices" and not capabilities.get("buttons_input_devices"):
            raise DeviceSessionError("Update the TV helper to list compositor input devices.")
        if action == "map":
            payload["app_id"] = (
                target_app_id if target_app_id is not None else resolve_app(args.app, host, receipt)
            )
        if action == "learn" and apply:
            print(f"Press the {label} app button on the physical remote once.", file=sys.stderr, flush=True)
        upgrade_discovery = action == "list" and not capabilities.get("buttons_discovery")
        if upgrade_discovery:
            payload["action"] = "status"
        result = client.request("buttons", button_request=payload).get("buttons")
    if not isinstance(result, dict):
        raise DeviceSessionError("The TV helper did not return app button status.")
    if upgrade_discovery:
        result = {**result, "discovery_detail": "Update the TV helper to discover app buttons automatically."}
    return result


def report(result, *, as_json):
    if as_json:
        print(json.dumps(result, indent=2))
    elif "input_devices" in result:
        if result["truncated"]:
            print("Showing the end of the input device listing.")
        if result["input_devices"]:
            print(result["input_devices"])
        if result.get("error"):
            print(result["error"], file=sys.stderr)
    elif "key_names" in result:
        for item in result["key_names"]:
            names = ", ".join(item["names"]) or "No name in the TV key layout"
            suffix = " (truncated)" if item["truncated"] else ""
            print(f"{item['code']}: {names}{suffix}")
    else:
        if result.get("preview"):
            print(result["preview"] + " Use --yes to apply.")
        rules = result.get("rules", [])
        discovered = result.get("discovered")
        if not rules and not discovered and not result.get("error"):
            print("No app buttons found." if discovered is not None else "No saved app buttons.")
        for rule in rules:
            action = {"default": "Original action", "disabled": "Disabled", "app": rule.get("app_id")}
            state = "active" if rule["active"] else "pending" if rule["mode"] != "default" else "ready"
            print(f"{rule['button']}: {action[rule['mode']]} ({state})")
            if rule.get("detail"):
                print(f"  {rule['detail']}")
        for button in discovered or []:
            print(f"{button['button']}: Original action (discovered)")
        if detail := result.get("discovery_detail"):
            print(detail)
        if discovered is not None:
            print("Use buttons learn to add an app button that is missing.")
        if result.get("error"):
            print(result["error"], file=sys.stderr)
