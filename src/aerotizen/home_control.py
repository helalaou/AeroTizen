"""Guarded, explicit SDK-only Home assignment and exact baseline restore."""

import base64
import hashlib
import json
import os
import re
import secrets
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import home, remote, sdk

PAYLOAD_PATH = Path(__file__).parent / "helpers/home-control.json"
HELPER_FILES = ("AeroTizenHomeControl.dll", "AeroTizenHomeControl.runtimeconfig.json")
PREFIX = "AEROTIZEN_HOME_CONTROL="
SUPPORTED_DEVICE = ("QE65LS03DAUXXU", "T-PTMDDEUC-0090-REL-202605141701")
MAX_RECEIPT_BYTES = 2 * 1024 * 1024
MAX_RECOVERY_CHAIN = 128


def load_helper():
    try:
        return home.load_helper(path=PAYLOAD_PATH, names=HELPER_FILES)
    except home.HomeError as exc:
        raise home.HomeError(
            "Home control payload is missing or invalid. Build it with python tools/build_home_control.py."
        ) from exc


def preview(action, backup=None, *, boot=False, art_return=False):
    if boot and action != "apply":
        raise home.HomeError("--boot applies only to Home apply.")
    if art_return and action != "apply":
        raise home.HomeError("--art-return applies only to Home apply.")
    result = {
        "action": action,
        "will_write": False,
        "requires_yes": True,
        "target": home.releases.APP_ID if action == "apply" else "saved original Home",
        "watcher_after": "native" if action == "apply" else "watcher",
        "startup": "Preserve the original startup settings; native boot is a separate phase.",
    }
    if boot:
        result["boot"] = True
        result["startup"] = "Enable Smart Hub autostart (1). The TV may update its derived startup IDs."
    elif action == "restore":
        result["startup"] = (
            "Restore all saved startup values, including autostart; recover boot using its matching receipt."
        )
    if art_return:
        result["art_return"] = True
        result["startup"] += (
            " Set Frame first-screen target to AeroTizen; restart is needed to refresh Art's cached target."
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
            if path.stat().st_size > MAX_RECEIPT_BYTES:
                return None
            request = json.loads(path.read_text())["request"]
            if (
                type(request.get("schema_version")) is not int
                or request["schema_version"] != 1
                or request["transaction"] != token
                or request["baseline_sha256"] != digest
                or base64.b64decode(request["baseline_base64"], validate=True) != raw
            ):
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


def change(session, info, action, *, backup=None, state_dir=None, boot=False, art_return=False):
    if action not in ("apply", "restore"):
        raise home.HomeError("Unknown Home action.")
    if type(boot) is not bool or (boot and action != "apply"):
        raise home.HomeError("--boot applies only to Home apply.")
    if type(art_return) is not bool or (art_return and action != "apply"):
        raise home.HomeError("--art-return applies only to Home apply.")
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
    if not status["complete"]:
        raise home.HomeError("Incomplete Home state; no write was attempted.")
    device = status["device"]
    for key in ("model", "firmware_build", "cpu_arch", "os_version"):
        if device.get(key) != original["device"].get(key):
            raise home.HomeError(
                "Device or firmware differs from the original backup; no write was attempted."
            )
    if (device["model"], device["firmware_build"]) != SUPPORTED_DEVICE:
        raise home.HomeError("Home writes are not enabled for this model and firmware.")
    token = secrets.token_hex(16)
    raw = backup.read_bytes()
    if hashlib.sha256(raw).hexdigest() != digest:
        raise home.HomeError("The backup changed during preflight; no write was attempted.")
    request = {
        "schema_version": 1,
        "action": action,
        "transaction": token,
        "baseline_sha256": digest,
        "baseline_base64": base64.b64encode(raw).decode(),
    }
    if boot:
        request["boot"] = True
    if art_return:
        request["art_return"] = True
    if action == "restore":
        source = _boot_restore_transaction(status, backup, raw, digest)
        if source:
            request["restore_boot_transaction"] = source
        elif (
            status["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"]
            != original["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"]
        ):
            raise home.HomeError(
                "Autostart changed and the matching boot receipt is unavailable; no write was attempted."
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
            raise home.HomeError(
                (result.get("Error") or "Home control failed.") + f" Receipt: {receipt_path}"
            )
        final = home.read_status(session, None, info)
        expected = original["home"]["default_app"] if action == "restore" else home.releases.APP_ID
        expected_settings = {key: dict(value) for key, value in original["home"]["settings"].items()}
        if action == "apply":
            expected_settings[home.HOME_KEY]["value"] = home.releases.APP_ID
        if art_return:
            expected_settings["db/first_screen/type"]["value"] = home.releases.APP_ID
        observed = {
            key: {"type": value["type"], "value": value["value"]}
            for key, value in final["home"]["settings"].items()
        }
        if boot:
            expected_settings["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 1
            for key in ("db/appfw/startup_appid", "db/appfw/booting_appid_backup"):
                value = observed[key]
                if value["type"] == "string" and value["value"] == home.releases.APP_ID:
                    expected_settings[key]["value"] = home.releases.APP_ID
        control = final["watcher"].get("control", {})
        if (
            not final["complete"]
            or final["device"]["identity_sha256"] != identity
            or final["home"]["main_operation"]["value"] != expected
            or observed != expected_settings
            or control.get("mode") != ("native" if action == "apply" else "watcher")
            or control.get("protocol") != 1
            or control.get("app_id") != home.releases.APP_ID
            or control.get("persistent") is not True
        ):
            raise home.HomeError(
                "The writer completed, but final Home/watcher verification failed. "
                "Inspect status before retrying."
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
        }
    except BaseException as exc:
        receipt["error"] = str(exc) or type(exc).__name__
        _write_receipt(receipt_path, receipt)
        raise
