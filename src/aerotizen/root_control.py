"""Resumable root setup/status/remove. Home and Art settings are never written."""

import base64
import hashlib
import ipaddress
import json
import re
import secrets
import socket
import time
import uuid
from pathlib import Path

from aerotizen import home, remote, root_package, root_state, root_transfer, sdk
from aerotizen.device import DeviceSession, DeviceSessionError
from aerotizen.root_bridge import BridgeClient, BridgeError

APP_ID = root_state.APP_ID
ROW = ("app_id", "package", "app_type", "app_component", "app_onboot", "app_autorestart", "app_exec")


def preview(operation, host, *, receipt=None):
    ipaddress.IPv4Address(host)
    result = {
        "operation": operation,
        "host": host,
        "app_id": APP_ID,
        "preview": True,
        "home_settings_writes": False,
        "art_settings_writes": False,
    }
    if receipt:
        result["original_pc_host"] = receipt["original_pc_host"]
    return result


def _info(host):
    try:
        return remote.info(host)
    except SystemExit as exc:
        raise DeviceSessionError("TV is not reachable; keep the saved recovery instructions") from exc


def _source(info):
    value = str(info.get("developerIP", ""))
    try:
        address = ipaddress.IPv4Address(value)
        if (
            info.get("developerMode") != "1"
            or address.is_loopback
            or address.is_unspecified
            or address.is_multicast
        ):
            raise ValueError
        with socket.socket(socket.AF_INET) as probe:
            probe.bind((value, 0))
    except (OSError, ValueError) as exc:
        raise DeviceSessionError(
            "Normal SDB needs Developer Mode On and Host PC IP set to this computer's address"
        ) from exc
    return value


def _managed(managed, prefix):
    return {Path(name).name: data for name, data in managed.items() if name.startswith(prefix)}


def _parse(result, prefix):
    values = [
        json.loads(line[len(prefix) :]) for line in result["stdout"].splitlines() if line.startswith(prefix)
    ]
    if result["exit_code"] != 0 or len(values) != 1:
        # Do not echo payloads or private bootstrap JSON into diagnostics.
        error = values[0].get("error") if values else "SDK completion was not confirmed"
        raise DeviceSessionError("Root helper operation failed: " + str(error))
    return values[0]


def _registry(session, managed):
    bridge = _managed(managed, "bin/AeroTizenRootBridge")
    result = _parse(
        sdk.run(session, bridge, "AeroTizenRootBridge.dll", ("--registry",)), "AEROTIZEN_ROOT_REGISTRY="
    )
    row = result.get("row")
    if row is not None:
        if not isinstance(row, list) or len(row) != len(ROW):
            raise DeviceSessionError("Malformed root helper registration")
        expected = [
            APP_ID,
            APP_ID,
            "dotnet",
            "svcapp",
            row[4],
            "false",
            f"/opt/usr/apps/{APP_ID}/bin/AeroTizenRootHelper.dll",
        ]
        if len(row) != len(ROW) or row != expected or row[4] not in ("false", "true"):
            raise DeviceSessionError("The root helper registration belongs to another installation")
    return result


def _same_device(session, receipt, info):
    duid = session.duid()
    if hashlib.sha256(duid.encode()).hexdigest() != receipt["duid_sha256"]:
        raise DeviceSessionError("Root receipt is for a different TV")
    status = home.read_status(session, None, info)
    if status["device"]["identity_sha256"] != receipt["device_identity_sha256"] or not status["complete"]:
        raise DeviceSessionError("TV identity or complete Home snapshot could not be verified")
    return status


def _bootstrap(session, path, receipt, managed, upstream, operation):
    stage = sdk.DIRECTORY + "/arsetup-" + secrets.token_hex(8)
    values, manifest = root_package.setup_bundle(receipt, managed, upstream, stage, operation=operation)
    request = {
        "package": manifest["package"],
        "setup_stage": stage,
        "pairing_json": json.dumps(
            {
                "schema_version": 1,
                "installation_id": receipt["installation_id"],
                "token": receipt["token"],
                "database_uid": receipt["database_uid"],
                "database_gid": receipt["database_gid"],
            }
        ),
        "server_pfx": receipt["server_pfx"],
        "root_json": json.dumps(receipt["public_config"]),
        "bridge_files": {
            name: base64.b64encode(value).decode()
            for name, value in _managed(managed, "bin/AeroTizenRootBridge").items()
        },
        "files": {name: base64.b64encode(value).decode() for name, value in values.items()},
    }
    attempt = {"nonce": manifest["nonce"], "operation": operation, "requested_at": time.time()}
    receipt.setdefault("attempts", []).append(attempt)
    receipt["phase"] = "root_requested" if operation == "install" else "removing"
    root_state.save(path, receipt)  # Durable PC intent before a root operation.
    result = _parse(
        root_transfer.run(
            session,
            _managed(managed, "bin/AeroTizenRootBridge"),
            json.dumps(request).encode(),
            base64.b64decode(receipt["server_pfx"], validate=True),
            receipt["certificate_sha256"],
        ),
        "AEROTIZEN_ROOT_BOOTSTRAP=",
    )
    expected = "bridge_ready" if operation == "install" else "cleanup_verified"
    if (
        result.get("passed") is not True
        or result.get("protected_proof_verified") is not True
        or result.get("staging_cleaned") is not True
        or result.get("system_files_unchanged") is not True
        or result.get("same_boot") is not True
        or result.get("nonce") != manifest["nonce"]
        or result.get(expected) is not True
    ):
        raise DeviceSessionError("Root helper did not verify its proof, operation and cleanup")
    attempt["verified"] = True
    root_state.save(path, receipt)
    return result


def status(host, *, receipt_path=None, wait=0, state_dir=None):
    path = Path(receipt_path) if receipt_path else root_state.selected_path(host, state_dir)
    if not path.exists():
        return {"installed": False, "root_available": False, "phase": "not_configured"}
    receipt = root_state.load(path)
    result = {
        **root_state.public_status(receipt),
        "root_available": False,
        "installed": False if receipt["phase"] == "removed" else None,
    }
    if receipt["phase"] == "removed":
        return result
    deadline = time.monotonic() + wait
    with DeviceSession(host).ownership():
        while True:
            try:
                reply = BridgeClient(
                    host, receipt, timeout=min(8, max(1, deadline - time.monotonic())) if wait else 8
                ).request()
                result = {
                    **root_state.public_status(receipt),
                    "root_available": True,
                    "current_boot_id": reply["boot_id"],
                    "automatic_startup_enabled": reply["automatic_startup_enabled"],
                    "automatic_boot_verified": reply.get("origin") == "boot"
                    and reply["boot_id"] != receipt["baseline_boot_id"],
                    "bootstrap_completed": reply.get("bootstrap_completed") is True,
                    "installed": reply.get("helper_installed") is True,
                }
                if reply.get("startup_error"):
                    result["startup_error"] = reply["startup_error"]
                if (
                    reply.get("origin") == "boot"
                    and not result["bootstrap_completed"]
                    and time.monotonic() < deadline
                ):
                    time.sleep(min(2, max(0, deadline - time.monotonic())))
                    continue
                return result
            except (OSError, ValueError, BridgeError) as exc:
                result = {
                    **root_state.public_status(receipt),
                    "root_available": False,
                    "installed": None,
                    "error": str(exc),
                }
                if time.monotonic() >= deadline:
                    return result
                time.sleep(min(2, max(0, deadline - time.monotonic())))


def setup(host, *, state_dir=None, receipt_path=None, runtime=None, release=None, wait=0):
    path = Path(receipt_path) if receipt_path else root_state.selected_path(host, state_dir)
    receipt = root_state.load(path) if path.exists() else None
    if receipt and receipt["phase"] == "removing":
        raise DeviceSessionError("Finish root remove --yes before starting root setup again")
    managed, xml, icon = root_package.runtime_files(runtime)
    if receipt and receipt["phase"] == "removed":
        root_state.archive_removed(path, receipt)
        receipt = None
    if receipt and receipt["phase"] in ("waiting_boot", "active"):
        checked = status(host, receipt_path=path, wait=wait)
        if (
            checked.get("root_available")
            and checked.get("automatic_boot_verified")
            and checked.get("bootstrap_completed")
            and checked.get("installed")
            and checked.get("automatic_startup_enabled")
        ):
            with DeviceSession(host, bridge_receipt=receipt) as session:
                current = _same_device(session, receipt, _info(host))
                registry = _registry(session, managed)
                if not registry.get("row") or registry["row"][4] != "true":
                    raise DeviceSessionError("Dedicated automatic startup is not enabled")
            receipt["phase"] = "active"
            receipt["verified_boot_id"] = checked["current_boot_id"]
            root_state.save(path, receipt)
            root_state.remember(host, path, state_dir)
            return {
                **checked,
                "phase": "active",
                "setup_complete": True,
                "home_values_unchanged": current["home"] == receipt["home_before"],
            }
        return {
            **checked,
            "setup_complete": False,
            "next_step": "Set Developer Mode Host PC IP to 127.0.0.1 and restart the TV; "
            "rerun root setup --yes.",
        }
    info = _info(host)
    source = _source(info)
    upstream = root_package.upstream_payloads(
        Path(state_dir or remote.CONFIG_DIR) / "root-cache", release=release
    )
    with DeviceSession(host, source_address=source, direct=True) as session:
        before = home.read_status(session, None, info)
        if not before["complete"]:
            raise DeviceSessionError("Save a complete Home snapshot before root setup")
        preflight = _parse(
            sdk.run(
                session,
                _managed(managed, "bin/AeroTizenRootBridge"),
                "AeroTizenRootBridge.dll",
                ("--preflight",),
            ),
            "AEROTIZEN_ROOT_PREFLIGHT=",
        )
        if (
            type(preflight.get("schema_version")) is not int
            or preflight["schema_version"] != 1
            or not str(preflight.get("runtime", "")).startswith("6.")
            or any(
                type(preflight.get(name)) is not int or preflight[name] <= 0
                for name in ("database_uid", "database_gid")
            )
            or str(uuid.UUID(preflight["boot_id"])) != preflight["boot_id"]
            or preflight["boot_id"] != before["boot"]["id"]
        ):
            raise DeviceSessionError(
                "Root preflight did not verify runtime, boot and non-root database ownership"
            )
        registry = _registry(session, managed)
        if receipt is None:
            if registry.get("row") is not None:
                raise DeviceSessionError("A helper already exists; use its original private root receipt")
            duid = session.duid()
            if not re.fullmatch(r"[A-Za-z0-9_-]{1,128}", duid):
                raise DeviceSessionError("TV returned an invalid certificate identity")
            certificates = Path(state_dir or remote.CONFIG_DIR) / "certs" / duid
            if not (certificates / "distributor.p12").is_file():
                raise DeviceSessionError(
                    "Create signing certificates first: aerotizen --tv " + host + " certs"
                )
            installation = secrets.token_hex(16)
            receipt = {
                "schema_version": 1,
                "app_id": APP_ID,
                "version": root_state.VERSION,
                "host": host,
                "installation_id": installation,
                "device_identity_sha256": before["device"]["identity_sha256"],
                "duid_sha256": hashlib.sha256(duid.encode()).hexdigest(),
                "baseline_boot_id": preflight["boot_id"],
                "original_pc_host": source,
                "bridge_port": root_state.BRIDGE_PORT,
                "phase": "prepared",
                "original_registration": None,
                "home_before": before["home"],
                "database_uid": preflight["database_uid"],
                "database_gid": preflight["database_gid"],
                **root_package.new_pairing(installation),
            }
            root_state.save(path, receipt)
            root_state.remember(host, path, state_dir)
        else:
            _same_device(session, receipt, info)
            certificates = Path(state_dir or remote.CONFIG_DIR) / "certs" / session.duid()
        package = path.parent / "helper.tpk"
        if registry.get("row") is None:
            config = root_package.package_helper(package, receipt, managed, upstream, xml, icon, certificates)
            receipt["public_config"] = config
            receipt["package_sha256"] = root_package.digest(package.read_bytes())
            root_state.save(path, receipt)
            upload_name = "aerotizen-root-" + receipt["installation_id"] + ".tpk"
            try:
                output = session.install_native(package.read_bytes(), upload_name)
            finally:
                _parse(
                    sdk.run(
                        session,
                        _managed(managed, "bin/AeroTizenRootBridge"),
                        "AeroTizenRootBridge.dll",
                        ("--clean-upload", upload_name, receipt["package_sha256"]),
                    ),
                    "AEROTIZEN_ROOT_UPLOAD=",
                )
            if "install completed" not in output and "key[end] val[ok]" not in output:
                raise DeviceSessionError("TV did not confirm root helper installation")
            receipt["phase"] = "installed"
            root_state.save(path, receipt)
        registry = _registry(session, managed)
        if registry.get("installation_id") != receipt["installation_id"]:
            raise DeviceSessionError("Installed root helper is not this saved installation")
        # Recover a lost completion reply from matching live evidence without re-running root.
        live = None
        try:
            live = BridgeClient(host, receipt, timeout=3).request()
        except (OSError, ValueError, BridgeError):
            pass
        if not live or not registry.get("row") or registry["row"][4] != "true":
            receipt["registration_others_before"] = registry["other_rows_sha256"]
            _bootstrap(session, path, receipt, managed, upstream, "install")
        after = _same_device(session, receipt, _info(host))
        registry_after = _registry(session, managed)
        if (
            not registry_after.get("row")
            or registry_after["row"][4] != "true"
            or registry_after["other_rows_sha256"] != registry["other_rows_sha256"]
            or before["home"] != after["home"]
        ):
            raise DeviceSessionError(
                "Root setup preservation checks failed; use the saved receipt to remove it"
            )
        receipt["phase"] = "waiting_boot"
        root_state.save(path, receipt)
    return {
        **root_state.public_status(receipt),
        "setup_complete": False,
        "receipt": str(path),
        "home_values_unchanged": True,
        "next_step": "Set Developer Mode Host PC IP to 127.0.0.1 and restart; rerun root setup --yes.",
    }


def remove(host, *, state_dir=None, receipt_path=None, runtime=None, release=None):
    path = Path(receipt_path) if receipt_path else root_state.selected_path(host, state_dir)
    receipt = root_state.load(path)
    if receipt["phase"] == "removed":
        return {**root_state.public_status(receipt), "removed": True}
    managed, _, _ = root_package.runtime_files(runtime)
    receipt["phase"] = "removing"
    root_state.save(path, receipt)
    if not receipt.get("private_state_removed"):
        with DeviceSession(host).ownership():
            try:
                reply = BridgeClient(host, receipt).request("remove")
                if reply.get("prepared_for_removal") is not True:
                    raise DeviceSessionError(
                        "Bridge did not confirm disabling startup and removing pairing files"
                    )
                receipt["private_state_removed"] = True
                root_state.save(path, receipt)
            except (OSError, ValueError, BridgeError):
                pass
    info = _info(host)
    if info.get("developerIP") == "127.0.0.1":
        return {
            **root_state.public_status(receipt),
            "removed": False,
            "next_step": f"Restore Developer Mode Host PC IP to {receipt['original_pc_host']}, "
            "restart, then rerun root remove --yes.",
        }
    source = _source(info)
    with DeviceSession(host, source_address=source, direct=True) as session:
        before = _same_device(session, receipt, info)
        registry = _registry(session, managed)
        if registry.get("row") and registry.get("installation_id") != receipt["installation_id"]:
            raise DeviceSessionError("A different helper is installed; refusing removal")
        if not receipt.get("private_state_removed") and receipt.get("public_config"):
            upstream = root_package.upstream_payloads(
                Path(state_dir or remote.CONFIG_DIR) / "root-cache", release=release
            )
            _bootstrap(session, path, receipt, managed, upstream, "remove")
            receipt["private_state_removed"] = True
            root_state.save(path, receipt)
        if registry.get("row"):
            session.uninstall(APP_ID)
        if _registry(session, managed).get("row") is not None:
            raise DeviceSessionError("Root helper is still registered; removal is incomplete")
        after = _same_device(session, receipt, _info(host))
        if before["home"] != after["home"]:
            raise DeviceSessionError(
                "Home values changed during removal; no Home values were written by root remove"
            )
        receipt["phase"] = "removed"
        root_state.save(path, receipt)
    return {**root_state.public_status(receipt), "removed": True, "home_values_unchanged": True}
