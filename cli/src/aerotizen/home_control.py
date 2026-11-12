"""Guarded, explicit SDK-only Home assignment and exact baseline restore."""

import base64
import hashlib
import json
import os
import re
import secrets
import sys
import tempfile
import time
from datetime import datetime, timezone
from itertools import islice
from pathlib import Path

from aerotizen import diagnostics, home, remote, sdk
from aerotizen.sdb import SdbError

PAYLOAD_PATH = Path(__file__).parent / "helpers/home-control.json"
HELPER_FILES = ("AeroTizenHomeControl.dll", "AeroTizenHomeControl.runtimeconfig.json")
PREFIX = "AEROTIZEN_HOME_CONTROL="
MAX_RECEIPT_BYTES = 2 * 1024 * 1024
MAX_RECOVERY_CHAIN = 128
MAX_RECOVERY_RECEIPTS = 1024
SERVICE_START_TIMEOUT = 15.0
SERVICE_POLL_INTERVAL = 1.0
LAUNCH_TIMEOUT = 8
START_RECOVERY = (
    f"Open AeroTizen on the TV or run 'aerotizen launch {home.releases.APP_ID}', then retry. "
    "No Home settings were changed."
)


def load_helper():
    try:
        return home.load_helper(path=PAYLOAD_PATH, names=HELPER_FILES)
    except home.HomeError as exc:
        raise home.HomeError(
            "Home control payload is missing or invalid. "
            "Build it with python cli/tools/build_home_control.py."
        ) from exc


def preview(action, backup=None):
    result = {
        "action": action,
        "will_write": False,
        "requires_yes": True,
        "target": home.releases.APP_ID if action == "apply" else "saved original Home",
        "watcher_after": "native"
        if action == "apply"
        else "watcher if AeroTizen is installed; otherwise absent",
        "startup": (
            "Assign both startup app IDs to AeroTizen, then enable Smart Hub autostart (1). "
            "If the TV rejects startup setup, try to keep Home with the saved startup settings."
        ),
    }
    if action == "apply":
        result["boot"] = True
    elif action == "restore":
        result["startup"] = (
            "Restore all saved startup values, including autostart; recover boot using its matching receipt."
        )
    if backup is not None:
        try:
            document = json.loads(Path(backup).read_text())
            original, digest = home._load_backup(Path(backup), document["device"]["identity_sha256"])
        except (ValueError, KeyError, TypeError) as exc:
            raise home.HomeError("The preview backup is invalid.") from exc
        result["baseline_sha256"] = digest
        result["original_home"] = original["home"]
    return result


def _write_receipt(path, document, *, create=False):
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    raw = (json.dumps(document, indent=2) + "\n").encode()
    descriptor, temporary = tempfile.mkstemp(prefix=".home-receipt-", dir=path.parent)
    temporary = Path(temporary)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(raw)
            stream.flush()
            os.fsync(stream.fileno())
        if create:
            os.link(temporary, path)
        else:
            os.replace(temporary, path)
        if os.name != "nt":
            folder = os.open(path.parent, os.O_RDONLY)
            try:
                os.fsync(folder)
            finally:
                os.close(folder)
    finally:
        temporary.unlink(missing_ok=True)


def parse_result(output, action, exit_code):
    records = [line[len(PREFIX) :] for line in output.splitlines() if line.startswith(PREFIX)]
    try:
        if len(records) != 1:
            raise ValueError("Missing or duplicate control result")
        document = json.loads(records[0])
        result = document["result"]
        if (
            type(document["schema_version"]) is not int
            or document["schema_version"] != 1
            or type(document["uid"]) is not int
            or document["uid"] != 901
            or document["action"] != action
            or type(result["Success"]) is not bool
            or type(result["RolledBack"]) is not bool
            or type(result.get("StartupSettingsRestored", False)) is not bool
            or (result["Success"] and result["RolledBack"])
            or (result.get("Error") is not None and not isinstance(result["Error"], str))
            or result["Success"] != (exit_code == 0)
        ):
            raise ValueError("Invalid control result fields")
        return result
    except (KeyError, TypeError, ValueError) as exc:
        raise home.HomeError(
            "Native Home control result was not confirmed; inspect status before retrying."
        ) from exc


def _receipt_request(path, token, raw, digest):
    try:
        if path.stat().st_size > MAX_RECEIPT_BYTES:
            return None
        receipt = json.loads(path.read_text())
        request = receipt["request"]
        if (
            type(request.get("schema_version")) is not int
            or request["schema_version"] != 1
            or request["transaction"] != token
            or request["baseline_sha256"] != digest
            or base64.b64decode(request["baseline_base64"], validate=True) != raw
        ):
            return None
        result = receipt.get("native_result")
        if (
            request.get("action") == "apply"
            and isinstance(result, dict)
            and result.get("Success") is True
            and result.get("StartupSettingsRestored") is True
        ):
            # The apply verified the saved autostart value before it committed Home.
            return None
        return request
    except (OSError, AttributeError, KeyError, TypeError, ValueError):
        return None


def _uninstalled_boot_request(backup, raw, digest):
    # Uninstall removes the service's active token. A matching, durable PC boot
    # apply request still proves which baseline authorised the autostart change.
    # Older receipts can include art_return; keep accepting that recovery metadata.
    paths = list(islice((backup.parent / "transactions").glob("*.json"), MAX_RECOVERY_RECEIPTS + 1))
    if len(paths) > MAX_RECOVERY_RECEIPTS:
        raise home.HomeError("Too many recovery receipts; preserve the folder and review it before restore.")
    for path in sorted(paths):
        if not re.fullmatch(r"[a-f0-9]{32}", path.stem):
            continue
        request = _receipt_request(path, path.stem, raw, digest)
        if (
            request
            and request.get("action") == "apply"
            and request.get("boot") is True
            and type(request.get("art_return", False)) is bool
            and "restore_boot_transaction" not in request
        ):
            return {
                key: request[key]
                for key in (
                    "schema_version",
                    "action",
                    "transaction",
                    "boot",
                    "baseline_sha256",
                    "baseline_base64",
                )
            }
    return None


def _boot_restore_transaction(status, backup, raw, digest):
    control = status["watcher"].get("control", {})
    token = control.get("transaction")
    if (
        control.get("mode") not in ("native", "hold")
        or control.get("baseline_sha256") != digest
        or not isinstance(token, str)
        or not re.fullmatch(r"[a-f0-9]{32}", token)
    ):
        return None
    # A failed restore has its own hold token. Follow its durable PC request
    # back to the boot apply, but authorise the token currently held by the TV.
    active = token
    seen = set()
    for _ in range(MAX_RECOVERY_CHAIN):
        if not isinstance(token, str) or not re.fullmatch(r"[a-f0-9]{32}", token) or token in seen:
            return None
        seen.add(token)
        try:
            path = Path(backup).parent / "transactions" / f"{token}.json"
            request = _receipt_request(path, token, raw, digest)
            if request is None:
                return None
            if request["action"] == "apply":
                return active if request.get("boot") is True else None
            if (
                request["action"] != "restore"
                or control["mode"] != "hold"
                or request.get("boot", False) is not False
                or request.get("art_return", False) is not False
            ):
                return None
            token = request.get("restore_boot_transaction")
        except (OSError, AttributeError, KeyError, TypeError, ValueError):
            return None
    return None


def _check_compatibility(status):
    """Require a successful SDK query and complete typed settings, on any model."""
    if status["device"].get("cpu_arch") not in ("arm", "armv7", "armv7l"):
        raise home.HomeError("Native Home needs a 32-bit ARM Tizen runtime; no write was attempted.")
    evidence = status.get("evidence", {})
    if (
        evidence.get("access") != "sdk_uid_901"
        or type(evidence.get("uid")) is not int
        or evidence["uid"] != 901
        or any(
            evidence.get(key) is not True
            for key in ("authenticated", "sdk_staging_cleaned", "query_staging_cleaned")
        )
    ):
        raise home.HomeError("A verified SDK UID 901 Home query is required; no write was attempted.")
    try:
        current = status["home"]
        if current["operation"] != home.OPERATION or set(current["settings"]) != set(home.SETTINGS):
            raise home.HomeError("Required native Home settings are unavailable.")
        values = [(current["main_operation"], "string")]
        values += [(current["settings"][key], kind) for key, kind in home.SETTINGS.items()]
        for item, kind in values:
            home._value(item, kind)
            if item["status"] != "ok" or (kind == "string" and not item["value"].strip()):
                raise home.HomeError("Required native Home values are unavailable or empty.")
        if current["settings"][home.AUTOSTART_KEY]["value"] not in (0, 1):
            raise home.HomeError("Native Home needs autostart to be 0 or 1.")
    except (KeyError, TypeError) as exc:
        raise home.HomeError("Required typed native Home settings are unavailable.") from exc


def _check_preflight(status, original):
    if status["complete"] is not True:
        raise home.HomeError("Incomplete Home state; no write was attempted.")
    device = status["device"]
    for key in ("identity_sha256", "model", "firmware_build", "cpu_arch", "os_version"):
        if device.get(key) != original["device"].get(key):
            raise home.HomeError(
                "Device or firmware differs from the original backup; no write was attempted."
            )
    _check_compatibility(status)
    installed = status.get("launcher", {}).get("installed")
    if type(installed) is not bool:
        raise home.HomeError("Cannot confirm whether AeroTizen is installed; no write was attempted.")
    return installed


def _require_control_service(watcher):
    control = watcher.get("control")
    if (
        watcher.get("error") is not None
        or not isinstance(control, dict)
        or type(control.get("protocol")) is not int
        or control["protocol"] != 1
        or control.get("app_id") != home.releases.APP_ID
        or control.get("persistent") is not True
        or control.get("mode") not in ("watcher", "native", "hold")
    ):
        raise home.HomeError(
            "The Home control service is incompatible. Check 'aerotizen home status' "
            "and use a matching launcher before retrying. "
            "No Home settings were changed."
        )


def _start_launcher(session):
    print("Starting AeroTizen and waiting for its control service...", file=sys.stderr)
    diagnostics.event("app.launch_requested", app_id=home.releases.APP_ID)
    accepted, _ = remote.rest_launch(session.host, home.releases.APP_ID)
    if not accepted:
        # Reuse the owned SDK connection when the TV's HTTP launch API is unavailable.
        try:
            session.shell_bounded(
                f"0 was_execute {home.releases.APP_ID}", timeout=LAUNCH_TIMEOUT, max_output=8192
            )
        except (OSError, SdbError) as exc:
            raise home.HomeError("The TV could not start AeroTizen. " + START_RECOVERY) from exc


def _wait_for_control_service(session, info, original):
    deadline = time.monotonic() + SERVICE_START_TIMEOUT
    while time.monotonic() < deadline:
        status = home.read_status(session, None, info)
        if not _check_preflight(status, original):
            raise home.HomeError("AeroTizen installation changed during startup; no write was attempted.")
        if status["watcher"].get("reachable") is True:
            _require_control_service(status["watcher"])
            if time.monotonic() <= deadline:
                return status
        remaining = deadline - time.monotonic()
        if remaining > 0:
            time.sleep(min(SERVICE_POLL_INTERVAL, remaining))
    raise home.HomeError(
        "AeroTizen's control service did not become ready within "
        f"{SERVICE_START_TIMEOUT:g} seconds after launch. " + START_RECOVERY
    )


def change(session, info, action, *, backup=None, state_dir=None):
    if action not in ("apply", "restore"):
        raise home.HomeError("Unknown Home action.")
    files = load_helper()
    status = home.read_status(session, None, info)
    identity = status["device"]["identity_sha256"]
    directory = Path(state_dir) if state_dir is not None else Path(remote.CONFIG_DIR)
    backup = (
        Path(backup).expanduser().absolute()
        if backup is not None
        else directory / "backups" / identity / "original-home.json"
    )
    original, digest = home._load_backup(backup, identity)
    installed = _check_preflight(status, original)
    if not installed and (action == "apply" or status["watcher"]["reachable"]):
        raise home.HomeError(
            "Apply needs an installed launcher; an unexpected running service also blocks restore."
        )
    raw = backup.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise home.HomeError("The backup changed during preflight; no write was attempted.")
    if installed and status["watcher"].get("reachable") is not True:
        if action != "apply":
            raise home.HomeError(
                "AeroTizen is installed but its control service is unavailable; start it and retry."
            )
        _start_launcher(session)
        status = _wait_for_control_service(session, info, original)
        if hashlib.sha256(backup.read_bytes()).hexdigest() != digest:
            raise home.HomeError("The backup changed during startup; no write was attempted.")
    if installed and action == "apply":
        _require_control_service(status["watcher"])
    device = status["device"]
    token = secrets.token_hex(16)
    request = {
        "schema_version": 1,
        "action": action,
        "transaction": token,
        "baseline_sha256": digest,
        "baseline_base64": base64.b64encode(raw).decode(),
    }
    if action == "apply":
        # Keep the receipt field used to authorise restoring autostart after apply.
        request["boot"] = True
    if action == "restore":
        if not installed:
            request["launcher_absent"] = True
        source = _boot_restore_transaction(status, backup, raw, digest) if installed else None
        if source:
            request["restore_boot_transaction"] = source
        elif (
            status["home"]["settings"][home.AUTOSTART_KEY]["value"]
            != original["home"]["settings"][home.AUTOSTART_KEY]["value"]
        ):
            proof = None if installed else _uninstalled_boot_request(backup, raw, digest)
            if proof is None:
                raise home.HomeError(
                    "Autostart changed and the matching boot receipt is unavailable; no write was attempted."
                )
            request["recovery_apply"] = proof
    diagnostics.event(
        "home.prepared",
        action=action,
        boot=action == "apply",
        transaction=token,
        model=device["model"],
        firmware=device["firmware_build"],
    )
    receipt_path = backup.parent / "transactions" / f"{token}.json"
    receipt = {
        "schema_version": 1,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "backup_path": str(backup),
        "request": request,
        "state": "pending",
        "helper_sha256": hashlib.sha256(files[HELPER_FILES[0]]).hexdigest(),
    }
    _write_receipt(receipt_path, receipt, create=True)  # Durable recovery data precedes the writer.
    try:
        files["request.json"] = json.dumps(request).encode()
        native = sdk.run(session, files, HELPER_FILES[0], ("request.json",))
        receipt["transport"] = native
        _write_receipt(receipt_path, receipt)
        result = parse_result(native["stdout"], action, native["exit_code"])
        receipt["native_result"] = result
        diagnostics.event("home.native_result", result=result)
        receipt["state"] = (
            "applied"
            if result["Success"] and action == "apply"
            else "restored"
            if result["Success"]
            else "rolled_back"
            if result["RolledBack"]
            else "failed"
        )
        _write_receipt(receipt_path, receipt)
        if not result["Success"]:
            failure = result.get("Failure")
            differing = failure.get("Differences") if isinstance(failure, dict) else None
            keys = [
                key
                for key in ("operation/main", *home.SETTINGS)
                if isinstance(differing, dict) and key in differing
            ]
            details = f" Settings that differed: {', '.join(keys)}." if keys else ""
            raise home.HomeError(
                (result.get("Error") or "Home control failed.") + details + f" Receipt: {receipt_path}"
            )
        final = home.read_status(session, None, info)
        expected = original["home"]["default_app"] if action == "restore" else home.releases.APP_ID
        expected_settings = {key: dict(value) for key, value in original["home"]["settings"].items()}
        startup_settings_restored = result.get("StartupSettingsRestored", False)
        if action == "apply":
            expected_settings[home.HOME_KEY]["value"] = home.releases.APP_ID
            if not startup_settings_restored:
                for key in home.STARTUP_KEYS:
                    expected_settings[key]["value"] = home.releases.APP_ID
                expected_settings[home.AUTOSTART_KEY]["value"] = 1
        observed = {
            key: {"type": value["type"], "value": value["value"]}
            for key, value in final["home"]["settings"].items()
        }
        control = final["watcher"].get("control", {})
        watcher_valid = (
            (
                control.get("mode") == ("native" if action == "apply" else "watcher")
                and control.get("protocol") == 1
                and control.get("app_id") == home.releases.APP_ID
                and control.get("persistent") is True
            )
            if installed
            else final["watcher"].get("reachable") is False
        )
        if (
            not final["complete"]
            or final["device"]["identity_sha256"] != identity
            or final["home"]["main_operation"]["value"] != expected
            or observed != expected_settings
            or final.get("launcher", {}).get("installed") is not installed
            or not watcher_valid
        ):
            keys = [key for key, value in expected_settings.items() if observed.get(key) != value]
            if final["home"]["main_operation"]["value"] != expected:
                keys.insert(0, "operation/main")
            details = f" Settings that differed: {', '.join(keys)}." if keys else ""
            raise home.HomeError(
                "The writer completed, but final Home/watcher verification failed."
                + details
                + " Inspect status before retrying."
            )
        if hashlib.sha256(backup.read_bytes()).hexdigest() != digest:
            raise home.HomeError("Original backup changed; preserve the transaction receipt for recovery.")
        receipt["state"] += "_verified"
        _write_receipt(receipt_path, receipt)
        return {
            "action": action,
            "success": True,
            "backup": str(backup),
            "receipt": str(receipt_path),
            "status": final,
            **({"startup_settings_restored": startup_settings_restored} if action == "apply" else {}),
        }
    except BaseException as exc:
        receipt["error"] = str(exc) or type(exc).__name__
        _write_receipt(receipt_path, receipt)
        raise
