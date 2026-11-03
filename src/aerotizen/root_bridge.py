"""Certificate-pinned TLS bridge; authenticate before sending any SDB bytes."""

import hashlib
import hmac
import json
import secrets
import socket
import ssl
import uuid

from aerotizen.root_state import APP_ID
from aerotizen.sdb import AUTH, CNXN, MAX_DATA, NAMES, VERSION, Sdb, SdbError

MAX_REPLY = 8192


class BridgeError(SdbError):
    pass


class BridgeClient:
    def __init__(self, host, receipt, *, timeout=8):
        self.host, self.receipt, self.timeout = host, receipt, timeout

    def open(self, operation):
        if operation not in ("status", "sdb", "remove"):
            raise BridgeError("Unknown root bridge operation")
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE  # Exact certificate pin is checked before authentication.
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        raw = socket.create_connection((self.host, self.receipt["bridge_port"]), timeout=self.timeout)
        secured = None
        try:
            secured = context.wrap_socket(raw, server_hostname=None)
            pin = hashlib.sha256(secured.getpeercert(binary_form=True)).hexdigest()
            if not hmac.compare_digest(pin, self.receipt["certificate_sha256"]):
                raise BridgeError("Root bridge certificate does not match this TV's saved pairing")
            nonce = secrets.token_hex(16)
            request = {"protocol": 1, "operation": operation, "token": self.receipt["token"], "nonce": nonce}
            secured.sendall(json.dumps(request, separators=(",", ":")).encode() + b"\n")
            reply = bytearray()
            while len(reply) <= MAX_REPLY:
                value = secured.recv(1)
                if not value:
                    raise BridgeError("Root bridge closed before an authenticated reply")
                if value == b"\n":
                    break
                reply.extend(value)
            else:
                raise BridgeError("Root bridge reply exceeds its limit")
            result = json.loads(reply)
            self.verify(result, nonce)
            return secured, result
        except BaseException:
            (secured or raw).close()
            raise

    def verify(self, result, nonce):
        if (
            not isinstance(result, dict)
            or type(result.get("protocol")) is not int
            or result["protocol"] != 1
            or result.get("authenticated") is not True
            or result.get("nonce") != nonce
            or result.get("app_id") != APP_ID
            or result.get("installation_id") != self.receipt["installation_id"]
            or result.get("device_identity_sha256") != self.receipt["device_identity_sha256"]
            or any(type(result.get(name)) is not int or result[name] != 0 for name in ("uid", "euid", "gid"))
        ):
            raise BridgeError("Root bridge did not authenticate the expected TV and root process")
        try:
            if str(uuid.UUID(result["boot_id"])) != result["boot_id"]:
                raise ValueError
        except (KeyError, TypeError, ValueError, AttributeError) as exc:
            raise BridgeError("Root bridge returned an invalid current boot identity") from exc

    def request(self, operation="status"):
        connection, result = self.open(operation)
        connection.close()
        return result


class BridgeSdb(Sdb):
    def __init__(self, host, receipt, *, port=26101, timeout=15):
        super().__init__(host, port=port, timeout=timeout)
        self.receipt = receipt

    def _connect_once(self):
        self.sock, self.root_status = BridgeClient(self.host, self.receipt, timeout=self.timeout).open("sdb")
        self._send(CNXN, VERSION, MAX_DATA, b"host::aerotizen\0")
        command, _, limit, payload = self._recv()
        if command == AUTH or command != CNXN:
            raise BridgeError(f"SDB rejected the bridge handshake: {NAMES.get(command, command)}")
        self.max_data = min(MAX_DATA, limit or MAX_DATA)
        self.banner = payload.decode(errors="replace").strip("\0")
        return self
