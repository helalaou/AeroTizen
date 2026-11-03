"""Send private setup input over pinned TLS, never through shared SDB uploads."""

import hashlib
import hmac
import os
import secrets
import socket
import ssl
import struct
import tempfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.serialization import pkcs12

from aerotizen import sdk
from aerotizen.device import DeviceSessionError


def server_context(pfx, certificate_sha256):
    key, certificate, _ = pkcs12.load_key_and_certificates(pfx, None)
    if (
        not key
        or not certificate
        or hashlib.sha256(certificate.public_bytes(serialization.Encoding.DER)).hexdigest()
        != certificate_sha256
    ):
        raise ValueError("Private setup certificate does not match its saved pin")
    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    with tempfile.TemporaryDirectory(prefix="aerotizen-root-tls-") as temporary:
        values = {
            "certificate.pem": certificate.public_bytes(serialization.Encoding.PEM),
            "key.pem": key.private_bytes(
                serialization.Encoding.PEM,
                serialization.PrivateFormat.PKCS8,
                serialization.NoEncryption(),
            ),
        }
        for name, value in values.items():
            descriptor = os.open(Path(temporary) / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(descriptor, "wb") as output:
                output.write(value)
        context.load_cert_chain(str(Path(temporary) / "certificate.pem"), str(Path(temporary) / "key.pem"))
    return context


def send_input(listener, context, host, token, payload):
    raw, peer = listener.accept()
    with raw:
        if peer[0] != host:
            raise DeviceSessionError("Private setup connection came from an unexpected TV")
        raw.settimeout(15)
        with context.wrap_socket(raw, server_side=True) as connection:
            auth = bytearray()
            while len(auth) <= 64:
                value = connection.recv(1)
                if value == b"\n":
                    break
                if not value:
                    raise DeviceSessionError("Private setup connection closed before authentication")
                auth.extend(value)
            if not hmac.compare_digest(auth, token.encode()):
                raise DeviceSessionError("Private setup authentication failed")
            connection.sendall(struct.pack(">I", len(payload)) + payload)


def run(session, files, payload, pfx, certificate_sha256):
    if not 0 < len(payload) <= 2 * 1024 * 1024:
        raise ValueError("Private root setup input exceeds its limit")
    context = server_context(pfx, certificate_sha256)
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((session.host, 9))
        callback = route.getsockname()[0]
    token = secrets.token_hex(32)
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((callback, 0))
        listener.listen(1)
        listener.settimeout(25)
        with ThreadPoolExecutor(max_workers=1) as pool:
            transfer = pool.submit(send_input, listener, context, session.host, token, payload)
            try:
                result = sdk.run(
                    session,
                    files,
                    "AeroTizenRootBridge.dll",
                    (
                        "--bootstrap-fetch",
                        callback,
                        str(listener.getsockname()[1]),
                        certificate_sha256,
                        token,
                    ),
                )
                transfer.result(timeout=30)
                return result
            finally:
                listener.close()
