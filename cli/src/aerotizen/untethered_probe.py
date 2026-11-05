"""Offline bundle builder for the experimental TV-local root probe.

No TV connection, boot registration, release download or public CLI command is
implemented here. The upstream TV payload is copied without modification.
"""

import gzip
import hashlib
import io
import json
import os
import re
import secrets
import tarfile
import tempfile
from pathlib import Path

from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding, rsa

from aerotizen.root import SUPPORTED_VERSION


def _payload_hashes(dll, runtimeconfig, dependencies):
    return {
        "SamsungTvArchiveRoot.dll": dll,
        "SamsungTvArchiveRoot.runtimeconfig.json": runtimeconfig,
        "SamsungTvArchiveRoot.deps.json": dependencies,
    }


STAGING_ROOT = "/home/owner/share/tmp/sdk_tools"
PROBE_ROOT_VERSION = "0.0.12"
AGENT_FILES = (
    "AeroTizenRootProbe.dll",
    "AeroTizenRootProbe.runtimeconfig.json",
    "AeroTizenRootProbe.deps.json",
)
# TV payloads from the previously verified v0.0.12 macOS ARM64 archive. These
# are managed assemblies; the host executable is neither copied nor executed.
UPSTREAM_FILES = {
    "6.0": {
        "directory": "common",
        "hashes": _payload_hashes(
            "5f647158f4c4fd502f1481c2692a95663516e934d11a13b45d5cd821d85d9671",
            "681a7f9dd3ecb637e2f1198c9cbd9d0e1b42994c211c64c8ffe2fba3f2c0442b",
            "fc0e154d1a440bbbc23cf6997f85a3d780667f1b324f88d922cda1b2ab52557e",
        ),
    },
    "3.1": {
        "directory": "common31",
        "hashes": _payload_hashes(
            "8c9c6380bfa6f3c6c73b4e31306f95d8bb389f8dd3a3d72dd75030e2251f8989",
            "818abac6065c8b3de67cdb136773c1e584705913877ab1f9961d8def7fdbc16d",
            "66c5c3188578f1f9521542475b63fa1a2a62e31c8c93bbc0e7fc8ac3102e9f03",
        ),
    },
}


def _read_file(path):
    path = Path(path)
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= 1024 * 1024:
        raise ValueError(f"Invalid probe file: {path.name}")
    with path.open("rb") as stream:
        data = stream.read(1024 * 1024 + 1)
    if not 0 < len(data) <= 1024 * 1024:
        raise ValueError(f"Invalid probe file: {path.name}")
    return data


def proof_script(package, nonce, payload_hash):
    """The signed archive performs one identity read and writes one proof file."""
    if (
        not re.fullmatch(r"archive-root-[a-f0-9]{16}", package)
        or not re.fullmatch(r"[a-f0-9]{32}", nonce)
        or not re.fullmatch(r"[a-f0-9]{64}", payload_hash)
    ):
        raise ValueError("Invalid proof identity")
    record = (
        '{"schema_version":1,"uid":0,"euid":0,"gid":0,"boot_id":"%s",'
        f'"nonce":"{nonce}","payload_sha256":"{payload_hash}"}}\\n'
    )
    return f"""#!/bin/sh
set -eu
umask 077
test "$(id -u)" = 0
test "$(id -ru)" = 0
test "$(id -g)" = 0
boot=$(cat /proc/sys/kernel/random/boot_id)
case "$boot" in *[!a-f0-9-]*|'') exit 80;; esac
proofdir={STAGING_ROOT}/aerotizen-probe-proof-{nonce}
test ! -e "$proofdir"
test ! -L "$proofdir"
mkdir -m 755 "$proofdir"
chsmack -a _ "$proofdir"
cd "$proofdir"
proof=proof.json
test ! -e "$proof.new"
test ! -L "$proof.new"
set -C
printf '{record}' "$boot" > "$proof.new"
set +C
chmod 444 "$proof.new"
chsmack -a _ "$proof.new"
mv -f "$proof.new" "$proof"
""".encode("ascii")


def _signed_archive(script):
    buffer = io.BytesIO()
    with (
        gzip.GzipFile(fileobj=buffer, mode="wb", mtime=0) as compressed,
        tarfile.open(fileobj=compressed, mode="w", format=tarfile.USTAR_FORMAT) as archive,
    ):
        member = tarfile.TarInfo("launch.sh")
        member.mode, member.mtime, member.size = 0o600, 0, len(script)
        archive.addfile(member, io.BytesIO(script))
    data = buffer.getvalue()
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    signature = key.sign(data, padding.PKCS1v15(), hashes.SHA256())
    key.public_key().verify(signature, data, padding.PKCS1v15(), hashes.SHA256())
    public = key.public_key().public_bytes(
        serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
    )
    return data, signature, public  # The private signing key never leaves memory.


def prepare_bundle(release, agent, output, *, runtime="6.0"):
    """Build a new, private host directory; never replace an existing bundle."""
    if SUPPORTED_VERSION != PROBE_ROOT_VERSION:
        raise ValueError("The probe needs a newly tested upstream/agent version pair")
    if runtime not in UPSTREAM_FILES:
        raise ValueError("Expected runtime 3.1 or 6.0")
    output = Path(output).absolute()
    if output.exists() or output.is_symlink():
        raise ValueError("Output already exists; use a new bundle directory")
    source = UPSTREAM_FILES[runtime]
    upstream = Path(release) / "_internal/payloads" / source["directory"]
    files = {}
    for name, expected in source["hashes"].items():
        data = _read_file(upstream / name)
        if hashlib.sha256(data).hexdigest() != expected:
            raise ValueError(f"Unverified upstream {SUPPORTED_VERSION} payload: {name}")
        files[name] = data
    for name in AGENT_FILES:
        files[name] = _read_file(Path(agent) / name)
    package, nonce = "archive-root-" + secrets.token_hex(8), secrets.token_hex(16)
    archive, signature, public = _signed_archive(
        proof_script(package, nonce, source["hashes"]["SamsungTvArchiveRoot.dll"])
    )
    files.update(
        {
            package + ".tar.gz": archive,
            package + ".tar.gz.signature": signature,
            "public.pem": public,
            "passwd": b"owner:x:0:0:owner:/home/owner:/bin/sh\n",
        }
    )
    manifest = {
        "schema_version": 1,
        "upstream_version": SUPPORTED_VERSION,
        "runtime": runtime,
        "package": package,
        "nonce": nonce,
        "files": {
            name: {"sha256": hashlib.sha256(data).hexdigest(), "size": len(data)}
            for name, data in sorted(files.items())
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".aerotizen-probe-", dir=output.parent) as temporary:
        stage = Path(temporary) / "bundle"
        stage.mkdir(mode=0o700)
        for name, data in files.items():
            (stage / name).write_bytes(data)
            (stage / name).chmod(0o600)
        (stage / "probe.json").write_text(json.dumps(manifest, indent=2) + "\n")
        (stage / "probe.json").chmod(0o600)
        validate_bundle(stage)
        # The caller must choose an unused output path; do not merge old files.
        # mkdir is an exclusive claim, unlike rename onto an existing empty
        # directory. Publish the manifest last so a partial copy cannot validate.
        output.mkdir(mode=0o700)
        for path in sorted(stage.iterdir(), key=lambda item: item.name == "probe.json"):
            os.rename(path, output / path.name)
    return manifest


def validate_bundle(directory):
    """Check bytes, fixed file inventory and the signed proof-only archive."""
    directory = Path(directory)
    raw = _read_file(directory / "probe.json")
    if len(raw) > 16384:
        raise ValueError("Oversized probe manifest")
    manifest = json.loads(raw)
    if not isinstance(manifest, dict):
        raise ValueError("Unsupported probe manifest")
    if (
        set(manifest) != {"schema_version", "upstream_version", "runtime", "package", "nonce", "files"}
        or type(manifest["schema_version"]) is not int
        or manifest["schema_version"] != 1
        or manifest["upstream_version"] != SUPPORTED_VERSION
        or not isinstance(manifest["runtime"], str)
        or manifest["runtime"] not in UPSTREAM_FILES
        or not isinstance(manifest["package"], str)
        or not re.fullmatch(r"archive-root-[a-f0-9]{16}", manifest["package"])
        or not isinstance(manifest["nonce"], str)
        or not re.fullmatch(r"[a-f0-9]{32}", manifest["nonce"])
        or not isinstance(manifest["files"], dict)
    ):
        raise ValueError("Unsupported probe manifest")
    package = manifest["package"]
    expected_hashes = UPSTREAM_FILES[manifest["runtime"]]["hashes"]
    names = {
        *AGENT_FILES,
        *expected_hashes,
        package + ".tar.gz",
        package + ".tar.gz.signature",
        "public.pem",
        "passwd",
    }
    if set(manifest["files"]) != names or {p.name for p in directory.iterdir()} != names | {"probe.json"}:
        raise ValueError("Unexpected bundle file inventory")
    data = {}
    for name in names:
        item = manifest["files"][name]
        value = _read_file(directory / name)
        digest = hashlib.sha256(value).hexdigest()
        if (
            not isinstance(item, dict)
            or set(item) != {"sha256", "size"}
            or type(item["size"]) is not int
            or item["size"] != len(value)
            or item["sha256"] != digest
            or (name in expected_hashes and digest != expected_hashes[name])
        ):
            raise ValueError(f"Bundle checksum mismatch: {name}")
        data[name] = value
    if data["passwd"] != b"owner:x:0:0:owner:/home/owner:/bin/sh\n":
        raise ValueError("Unexpected passwd bind view")
    public = serialization.load_pem_public_key(data["public.pem"])
    if not isinstance(public, rsa.RSAPublicKey) or public.key_size != 2048:
        raise ValueError("Unsupported proof signing key")
    public.verify(
        data[package + ".tar.gz.signature"], data[package + ".tar.gz"], padding.PKCS1v15(), hashes.SHA256()
    )
    with gzip.GzipFile(fileobj=io.BytesIO(data[package + ".tar.gz"])) as compressed:
        expanded = compressed.read(32769)
    if len(expanded) > 32768:
        raise ValueError("Oversized proof archive")
    with tarfile.open(fileobj=io.BytesIO(expanded), mode="r:") as archive:
        members = archive.getmembers()
        script = proof_script(package, manifest["nonce"], expected_hashes["SamsungTvArchiveRoot.dll"])
        if len(members) != 1 or members[0].name != "launch.sh" or not members[0].isfile():
            raise ValueError("Unexpected proof archive")
        if members[0].size != len(script) or archive.extractfile(members[0]).read() != script:
            raise ValueError("Proof archive does not match the fixed identity probe")
    return manifest
