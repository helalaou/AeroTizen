"""Private, durable receipts for root setup and recovery. Never print pairing secrets."""

import hashlib
import ipaddress
import json
import os
import re
import secrets
from pathlib import Path

from aerotizen import remote

APP_ID = "org.aerotizen.roothelper"
VERSION = "0.1.0"
BRIDGE_PORT = 26104
PHASES = {"prepared", "installed", "root_requested", "waiting_boot", "active", "removing", "removed"}


def receipt_path(host, state_dir=None):
    ipaddress.IPv4Address(host)
    key = hashlib.sha256(host.encode()).hexdigest()
    return Path(state_dir or remote.CONFIG_DIR) / "root" / key / "receipt.json"


def selected_path(host, state_dir=None):
    default = receipt_path(host, state_dir)
    pointer = default.with_name("selected.json")
    if not pointer.exists():
        return default
    if pointer.is_symlink() or pointer.stat().st_size > 4096:
        raise ValueError("Invalid root recovery-record location")
    value = json.loads(pointer.read_text())
    if not isinstance(value, dict) or set(value) != {"path"} or not isinstance(value["path"], str):
        raise ValueError("Invalid root recovery-record location")
    path = Path(value["path"])
    if not path.is_absolute():
        raise ValueError("Root recovery-record location must be absolute")
    if not path.exists() or path.is_symlink():
        raise ValueError("Saved root recovery record is missing or linked; restore its private folder")
    return path


def remember(host, path, state_dir=None):
    save(receipt_path(host, state_dir).with_name("selected.json"), {"path": str(Path(path).absolute())})


def archive_removed(path, receipt):
    destination = Path(path).parent / "history" / (receipt["installation_id"] + ".json")
    if not destination.exists():
        save(destination, receipt)
    elif load(destination) != receipt:
        raise ValueError("Conflicting root recovery history; keep the original records")


def save(path, receipt):
    path = Path(path)
    if path.is_symlink() or path.parent.is_symlink():
        raise ValueError("Refusing a linked root receipt path")
    path.parent.mkdir(parents=True, mode=0o700, exist_ok=True)
    path.parent.chmod(0o700)
    temporary = path.with_name(".receipt-" + secrets.token_hex(8))
    try:
        descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "w") as stream:
            json.dump(receipt, stream, indent=2)
            stream.write("\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
        if os.name != "nt":
            directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def load(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 256 * 1024:
        raise ValueError("Invalid root receipt; keep the original private recovery folder")
    value = json.loads(path.read_text())
    if (
        not isinstance(value, dict)
        or type(value.get("schema_version")) is not int
        or value["schema_version"] != 1
        or value.get("app_id") != APP_ID
        or value.get("phase") not in PHASES
        or any(
            not isinstance(value.get(field), str)
            or not re.fullmatch(r"[a-f0-9]{" + str(length) + r"}", value[field])
            for field, length in (
                ("installation_id", 32),
                ("device_identity_sha256", 64),
                ("duid_sha256", 64),
                ("certificate_sha256", 64),
                ("token", 64),
            )
        )
        or type(value.get("bridge_port")) is not int
        or not 1024 <= value["bridge_port"] <= 65535
        or value["bridge_port"] in (26101, 26102)
    ):
        raise ValueError("Root receipt identity or pairing data is invalid")
    for field in ("host", "original_pc_host"):
        if not isinstance(value.get(field), str):
            raise ValueError("Invalid original TV or PC address")
        address = ipaddress.IPv4Address(value[field])
        if address.is_loopback or address.is_unspecified or address.is_multicast:
            raise ValueError("Invalid original TV or PC address")
    return value


def find(host, state_dir=None):
    try:
        ipaddress.IPv4Address(host)
    except ValueError:
        return None
    path = selected_path(host, state_dir)
    return load(path) if path.exists() or path.is_symlink() else None


def public_status(receipt):
    fields = ("app_id", "version", "installation_id", "phase", "host", "bridge_port", "original_pc_host")
    return {name: receipt[name] for name in fields if name in receipt}
