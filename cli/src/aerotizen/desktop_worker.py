"""Bounded TV operations for the desktop app's private JSON protocol."""

import contextlib
import io
import ipaddress
import json
import re
import sys

from aerotizen import (
    __version__,
    remote,
    root_control,
    root_state,
)
from aerotizen.diagnostic_privacy import Policy
from aerotizen.sdb import SdbError

PROTOCOL_VERSION = 1
WORKER_NAME = "aerotizen-desktop-worker"
MAX_REQUEST_BYTES = 16 * 1024
IDENTITY_PATTERN = re.compile(r"[a-f0-9]{64}")
OPERATIONS = (
    "handshake",
    "setup_root",
    "upgrade_root",
)


class RequestError(ValueError):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


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


def checked_identity(expected):
    if not isinstance(expected, str) or not IDENTITY_PATTERN.fullmatch(expected):
        raise RequestError("invalid_request", "The saved TV identity is invalid.")
    return expected


def _root_receipt(host, expected):
    try:
        receipt = root_state.find(host, remote.CONFIG_DIR)
    except (OSError, ValueError, KeyError) as error:
        raise RequestError(
            "root_recovery_unavailable", "The saved root recovery files could not be read on this computer."
        ) from error
    if receipt and receipt["duid_sha256"] != expected:
        raise RequestError("identity_mismatch", "The saved root recovery record belongs to a different TV.")
    return receipt


def _public_root_status(result, receipt):
    """Expose current proof and UI steps, never the private recovery document."""
    phase = receipt["phase"] if receipt else "not_configured"
    live = result.get("root_available") is True
    complete = (
        phase == "active"
        and live
        and all(
            result.get(key) is True
            for key in (
                "installed",
                "automatic_startup_enabled",
                "automatic_boot_verified",
                "bootstrap_completed",
            )
        )
    )
    version = Policy().value(result.get("runtime_version"), "version") if live else None
    pending = bool(receipt and receipt.get("upgrade"))
    update_available = (
        complete
        and not pending
        and isinstance(version, str)
        and re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is not None
        and tuple(map(int, version.split("."))) < tuple(map(int, root_state.RUNTIME_VERSION.split(".")))
    )
    return {
        "phase": phase,
        "root_available": live,
        "setup_complete": complete,
        "runtime_version": version,
        "target_runtime_version": root_state.RUNTIME_VERSION,
        "update_available": update_available,
        "update_pending": pending,
        "automatic_startup": result.get("automatic_startup_enabled") is True if live else None,
        "automatic_boot_verified": live and result.get("automatic_boot_verified") is True,
        "bootstrap_completed": live and result.get("bootstrap_completed") is True,
        "recovery_saved": receipt is not None,
        "original_pc_host": host_value(receipt["original_pc_host"]) if receipt else None,
    }


def _root_status_after_change(params):
    """Return the verified status after setup or update; standalone reads are native."""
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    receipt = _root_receipt(host, expected)
    result = root_control.status(host, state_dir=remote.CONFIG_DIR) if receipt else {}
    # Recheck a record that another CLI process may have changed during the read.
    current = _root_receipt(host, expected)
    if receipt != current:
        raise RequestError(
            "root_state_changed", "Root setup changed. Refresh Root access to check its current status."
        )
    return _public_root_status(result, current)


def setup_root(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    action = params.get("action")
    if action not in ("start", "verify") or params.get("confirmed") is not True:
        raise RequestError("confirmation_required", "Review and confirm root setup first.")
    receipt = _root_receipt(host, expected)
    phase = receipt["phase"] if receipt else "not_configured"
    if phase == "removing":
        raise RequestError(
            "root_recovery_required", "Finish the existing root removal before starting setup."
        )
    if action == "verify" and phase not in ("waiting_boot", "active"):
        raise RequestError(
            "root_state_changed", "There is no setup waiting for restart. Refresh Root access first."
        )
    if action == "start" and phase in ("waiting_boot", "active"):
        raise RequestError(
            "root_state_changed", "Root setup already exists. Refresh Root access to continue it."
        )
    try:
        root_control.setup(
            host, state_dir=remote.CONFIG_DIR, expected_duid_sha256=expected, verify_only=action == "verify"
        )
    except root_control.RootSetupStateError as error:
        raise RequestError(
            "root_state_changed", "Root setup changed. Refresh Root access to continue safely."
        ) from error
    except root_control.RootIdentityError as error:
        raise RequestError(
            "identity_mismatch",
            "This address or recovery record belongs to a different TV. Root setup stopped.",
        ) from error
    except (OSError, ValueError, SdbError) as error:
        message = str(error)
        if "A helper already exists" in message:
            raise RequestError(
                "root_recovery_required",
                "The TV already has a root helper. "
                "Use the computer or recovery files from its original setup.",
            ) from error
        if "Create signing certificates first" in message:
            raise RequestError(
                "certificates_required",
                "Set up this TV's Samsung signing certificates before starting root setup.",
            ) from error
        if "Normal SDB needs Developer Mode" in message:
            raise RequestError(
                "root_requirements",
                "Turn on Developer Mode and set Host PC IP to this computer's address, then retry.",
            ) from error
        raise RequestError(
            "root_setup_failed",
            "Root setup could not finish. Refresh Root access to check the saved progress before retrying.",
        ) from error
    return _root_status_after_change(params)


def upgrade_root(params):
    host = host_value(params.get("host"))
    expected = checked_identity(params.get("expected_identity"))
    action = params.get("action")
    if action not in ("start", "resume") or params.get("confirmed") is not True:
        raise RequestError("confirmation_required", "Review and confirm the root helper update first.")
    receipt = _root_receipt(host, expected)
    if not receipt or receipt["phase"] != "active":
        raise RequestError("root_state_changed", "Complete root setup before updating the helper.")
    if action == "resume" and not receipt.get("upgrade"):
        raise RequestError("root_state_changed", "There is no pending update. Refresh Root access first.")
    try:
        root_control.upgrade(
            host,
            state_dir=remote.CONFIG_DIR,
            expected_duid_sha256=expected,
            resume_only=action == "resume",
        )
    except root_control.RootIdentityError as error:
        raise RequestError("identity_mismatch", "The recovery record belongs to a different TV.") from error
    except root_control.RootSetupStateError as error:
        raise RequestError("root_state_changed", "Root update changed. Refresh Root access first.") from error
    except (OSError, ValueError, SdbError) as error:
        message = str(error)
        reasons = {
            "original signing certificates": (
                "Restore this TV's original signing certificates on this computer before updating. "
                "Do not create replacement certificates."
            ),
            "CLI build that started it": (
                "Resume this update with the same desktop or CLI build that started it."
            ),
            "unknown or newer": (
                "This helper version cannot be updated by this app. Install a newer desktop release."
            ),
            "same version but does not match": (
                "The helper differs from this build. Install a newer desktop release to update it."
            ),
            "automatic root boot": (
                "Restart the TV with Developer Mode on and Host PC IP set to 127.0.0.1, "
                "then refresh Root access."
            ),
            "paired root service": (
                "Keep Developer Mode on and Host PC IP set to 127.0.0.1 before starting the update."
            ),
        }
        for reason, public_message in reasons.items():
            if reason in message:
                raise RequestError("root_update_requirements", public_message) from error
        raise RequestError(
            "root_update_failed",
            "The root helper update could not finish. "
            "Refresh Root access to check saved progress before retrying.",
        ) from error
    return _root_status_after_change(params)


def handle(request):
    request_id = request.get("id") if isinstance(request, dict) else None
    response = {"protocol": PROTOCOL_VERSION, "id": request_id}
    try:
        params = validate_request(request)
        with contextlib.redirect_stdout(io.StringIO()):
            if request["operation"] == "handshake":
                result = {"name": WORKER_NAME, "version": __version__, "operations": list(OPERATIONS)}
            elif request["operation"] == "setup_root":
                result = setup_root(params)
            elif request["operation"] == "upgrade_root":
                result = upgrade_root(params)
            else:
                raise RequestError("invalid_request", "The desktop request is invalid or incompatible.")
        return {**response, "result": result}
    except RequestError as error:
        return {**response, "error": {"code": error.code, "message": str(error)}}
    except OSError:
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


def main():
    line = sys.stdin.buffer.readline(MAX_REQUEST_BYTES + 1)
    try:
        if len(line) > MAX_REQUEST_BYTES:
            raise ValueError
        request = json.loads(line)
    except (ValueError, UnicodeError):
        request = None
    print(json.dumps(handle(request), separators=(",", ":")), flush=True)


if __name__ == "__main__":
    main()
