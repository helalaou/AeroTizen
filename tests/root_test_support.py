"""Ephemeral signing certificates for package tests; no TV credentials."""

import datetime

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID


def make_certificates(tmp_path):
    certs = tmp_path / "certs"
    certs.mkdir()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "test")])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(1)
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=1))
        .sign(key, hashes.SHA256())
    )
    for role in ("author", "distributor"):
        (certs / (role + ".p12")).write_bytes(
            pkcs12.serialize_key_and_certificates(
                role.encode(), key, cert, None, serialization.BestAvailableEncryption(b"test")
            )
        )
    (certs / "password.txt").write_text("test")
    return certs
