"""Build the dedicated helper package and fixed, signed archive launches."""

import base64
import datetime
import hashlib
import io
import json
import re
import secrets
import tarfile
import tempfile
import urllib.request
import uuid
import xml.etree.ElementTree as ET
import zipfile
from importlib.resources import files
from pathlib import Path

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import pkcs12
from cryptography.x509.oid import NameOID

from aerotizen import signer, untethered_probe
from aerotizen.root_state import APP_ID, VERSION

MANAGED = {
    (
        "res/runner/"
        if name == "AeroTizenRootProbe"
        else "res/setup/"
        if name == "AeroTizenBootWriter"
        else "bin/"
    )
    + name
    + suffix
    for name in ("AeroTizenRootHelper", "AeroTizenRootBridge", "AeroTizenRootProbe", "AeroTizenBootWriter")
    for suffix in (".dll", ".runtimeconfig.json", ".deps.json")
}
UPSTREAM = untethered_probe.UPSTREAM_FILES["6.0"]["hashes"]
RELEASE_URL = "https://github.com/chris-ritsen/samsung-tv-root/releases/download/v0.0.12/samsung-tv-root-0.0.12-macos-arm64.tar.gz"
RELEASE_SHA256 = "8ee4587462963f8ad0374f921e41050bd9198a7cb0b15899a5f35a7ad8f50f2c"
NS = {"t": "http://tizen.org/ns/packages"}


def digest(value):
    return hashlib.sha256(value).hexdigest()


def runtime_files(path=None):
    resource = Path(path) if path else files("aerotizen").joinpath("helpers/root-runtime.json")
    try:
        raw = resource.read_bytes()
    except FileNotFoundError as exc:
        raise ValueError(
            "This CLI build lacks the root runtime. Build it with tools/build_root_runtime.py."
        ) from exc
    if len(raw) > 8 * 1024 * 1024:
        raise ValueError("Oversized root runtime")
    data = json.loads(raw)
    if data.get("schema_version") != 1 or data.get("version") != VERSION or set(data["files"]) != MANAGED:
        raise ValueError("Unsupported root runtime")
    values = {}
    for name, item in data["files"].items():
        value = base64.b64decode(item["base64"], validate=True)
        if not 0 < len(value) <= 1024 * 1024 or digest(value) != item["sha256"]:
            raise ValueError("Root runtime checksum differs")
        values[name] = value
    return values, data["manifest"].encode(), base64.b64decode(data["icon"], validate=True)


def upstream_payloads(cache, *, release=None):
    if release:
        directory = Path(release) / "_internal/payloads/common"
        values = {name: untethered_probe._read_file(directory / name) for name in UPSTREAM}
    else:
        cache = Path(cache)
        archive = cache / "samsung-tv-root-0.0.12.tar.gz"
        cache.mkdir(mode=0o700, parents=True, exist_ok=True)
        if archive.is_symlink():
            raise ValueError("Linked upstream cache refused")
        if not archive.exists():
            with urllib.request.urlopen(RELEASE_URL, timeout=30) as response:
                data = response.read(32 * 1024 * 1024 + 1)
            if len(data) > 32 * 1024 * 1024 or digest(data) != RELEASE_SHA256:
                raise ValueError("Upstream release checksum differs")
            temporary = cache / (".release-" + secrets.token_hex(8))
            try:
                with temporary.open("xb") as output:
                    output.write(data)
                temporary.replace(archive)
            finally:
                temporary.unlink(missing_ok=True)
        data = archive.read_bytes()
        if digest(data) != RELEASE_SHA256:
            raise ValueError("Cached upstream release checksum differs")
        values = {}
        with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as source:
            for name in UPSTREAM:
                matches = [
                    item
                    for item in source.getmembers()
                    if item.name.endswith("/_internal/payloads/common/" + name)
                ]
                if len(matches) != 1 or not matches[0].isfile() or not 0 < matches[0].size <= 1024 * 1024:
                    raise ValueError("Upstream release payload inventory differs")
                values[name] = source.extractfile(matches[0]).read()
    if any(digest(values[name]) != expected for name, expected in UPSTREAM.items()):
        raise ValueError("Unverified upstream TV payload")
    return values


def new_pairing(installation):
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "AeroTizen " + installation)])
    now = datetime.datetime.now(datetime.timezone.utc)
    certificate = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - datetime.timedelta(days=1))
        .not_valid_after(now + datetime.timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    pfx = pkcs12.serialize_key_and_certificates(
        b"AeroTizen", key, certificate, None, serialization.NoEncryption()
    )
    return {
        "token": secrets.token_hex(32),
        "certificate_sha256": digest(certificate.public_bytes(serialization.Encoding.DER)),
        "server_pfx": base64.b64encode(pfx).decode(),
    }


def public_config(receipt, managed):
    return {
        "schema_version": 1,
        "app_id": APP_ID,
        "version": VERSION,
        "installation_id": receipt["installation_id"],
        "device_identity_sha256": receipt["device_identity_sha256"],
        "duid_sha256": receipt["duid_sha256"],
        "baseline_boot_id": receipt["baseline_boot_id"],
        "bridge_port": receipt["bridge_port"],
        "certificate_sha256": receipt["certificate_sha256"],
        "files": {name: digest(data) for name, data in sorted(managed.items())},
    }


def validate_manifest(xml):
    root = ET.fromstring(xml)
    application = root.find("t:service-application", NS)
    if (
        root.tag != "{" + NS["t"] + "}manifest"
        or root.attrib != {"package": APP_ID, "api-version": "6.0", "version": VERSION}
        or [node.tag.rsplit("}", 1)[-1] for node in root] != ["profile", "service-application", "privileges"]
        or application is None
        or application.attrib
        != {
            "appid": APP_ID,
            "exec": "AeroTizenRootHelper.dll",
            "type": "dotnet",
            "multiple": "false",
            "taskmanage": "false",
            "nodisplay": "true",
            "on-boot": "true",
            "auto-restart": "false",
        }
        or [node.tag.rsplit("}", 1)[-1] for node in application] != ["label", "icon"]
        or application.find("t:icon", NS).text != "root-helper.png"
        or application.find("t:label", NS).text != "AeroTizen Root Helper"
        or root.find("t:profile", NS).attrib != {"name": "tv-samsung"}
        or [node.text for node in root.findall("t:privileges/t:privilege", NS)]
        != ["http://tizen.org/privilege/internet"]
        or len(list(root.find("t:privileges", NS))) != 1
    ):
        raise ValueError("Root helper must be one dedicated Internet-only service")


def validate_package(path):
    expected = (
        MANAGED
        | {"tizen-manifest.xml", "shared/res/root-helper.png", "bin/root.json"}
        | {"res/payload/" + name for name in UPSTREAM}
        | set(signer.SIG_FILES)
    )
    with zipfile.ZipFile(path) as package:
        if set(package.namelist()) != expected or len(package.namelist()) != len(expected):
            raise ValueError("Unexpected root helper package inventory")
        if any(item.file_size > 1024 * 1024 for item in package.infolist()):
            raise ValueError("Oversized root helper member")
        validate_manifest(package.read("tizen-manifest.xml"))
        config = json.loads(package.read("bin/root.json"))
        if (
            set(config)
            != {
                "schema_version",
                "app_id",
                "version",
                "installation_id",
                "device_identity_sha256",
                "duid_sha256",
                "baseline_boot_id",
                "bridge_port",
                "certificate_sha256",
                "files",
            }
            or type(config.get("schema_version")) is not int
            or config["schema_version"] != 1
            or type(config.get("bridge_port")) is not int
            or not 1024 <= config["bridge_port"] <= 65535
            or config["bridge_port"] in (26101, 26102)
            or any(
                not re.fullmatch(r"[a-f0-9]{64}", str(config.get(name, "")))
                for name in ("device_identity_sha256", "duid_sha256", "certificate_sha256")
            )
            or not re.fullmatch(r"[a-f0-9]{32}", str(config.get("installation_id", "")))
            or config.get("app_id") != APP_ID
            or config.get("version") != VERSION
            or set(config["files"]) != MANAGED
        ):
            raise ValueError("Invalid root helper configuration")
        if str(uuid.UUID(config["baseline_boot_id"])) != config["baseline_boot_id"]:
            raise ValueError("Invalid setup boot identity")
        for name, expected_hash in config["files"].items():
            if digest(package.read(name)) != expected_hash:
                raise ValueError("Installed helper checksum differs")
        if any(digest(package.read("res/payload/" + name)) != value for name, value in UPSTREAM.items()):
            raise ValueError("Modified upstream root payload refused")
        return config


def package_helper(output, receipt, managed, upstream, xml, icon, certificates):
    validate_manifest(xml)
    config = public_config(receipt, managed)
    with tempfile.TemporaryDirectory(prefix="aerotizen-root-package-") as directory:
        root = Path(directory)
        values = {
            **managed,
            **{"res/payload/" + name: data for name, data in upstream.items()},
            "tizen-manifest.xml": xml,
            "shared/res/root-helper.png": icon,
            "bin/root.json": (json.dumps(config, indent=2) + "\n").encode(),
        }
        for name, data in values.items():
            path = root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
        signer.sign_wgt(root, output, certificates)
    validate_package(output)
    return config


def service_script(descriptor, nonce):
    if set(descriptor) != {"operation", "installation_id", "setup_stage", "files"}:
        raise ValueError("Invalid root service descriptor")
    installation = descriptor["installation_id"]
    if not re.fullmatch(r"[a-f0-9]{32}", installation) or not re.fullmatch(r"[a-f0-9]{32}", nonce):
        raise ValueError("Invalid root launch identity")
    bridge_names = {
        "AeroTizenRootBridge" + suffix for suffix in (".dll", ".runtimeconfig.json", ".deps.json")
    }
    if set(descriptor["files"]) != bridge_names:
        raise ValueError("Incomplete bridge checksums")
    lines = []
    for name in (
        "AeroTizenRootBridge.dll",
        "AeroTizenRootBridge.runtimeconfig.json",
        "AeroTizenRootBridge.deps.json",
    ):
        value = descriptor["files"][name]
        if not re.fullmatch(r"[a-f0-9]{64}", value):
            raise ValueError("Invalid bridge checksum")
        path = (
            descriptor["setup_stage"] + "/"
            if descriptor["operation"] == "remove"
            else f"/opt/usr/apps/{APP_ID}/bin/"
        ) + name
        lines.extend(
            [f"test ! -L '{path}'", f"printf '%s  %s\\n' '{value}' '{path}' | sha256sum -c - >/dev/null"]
        )
    dll = f"'/opt/usr/apps/{APP_ID}/bin/AeroTizenRootBridge.dll'"
    if descriptor["operation"] in ("install", "remove") and re.fullmatch(
        r"/home/owner/share/tmp/sdk_tools/arsetup-[a-f0-9]{16}", descriptor["setup_stage"] or ""
    ):
        if descriptor["operation"] == "remove":
            dll = f"'{descriptor['setup_stage']}/AeroTizenRootBridge.dll'"
        operation = "--install" if descriptor["operation"] == "install" else "--cleanup"
        lines.append(
            f"exec /usr/bin/dotnet {dll} {operation} '{descriptor['setup_stage']}' '{installation}' '{nonce}'"
        )
    elif descriptor["operation"] == "serve" and descriptor["setup_stage"] is None:
        lines.append(
            f"/usr/bin/dotnet {dll} --serve '{installation}' '{nonce}' boot </dev/null >/dev/null 2>&1 3>&- &"
        )
    else:
        raise ValueError("Unknown fixed root launch operation")
    return ("\n".join(lines) + "\n").encode("ascii")


def setup_bundle(receipt, managed, upstream, stage, *, operation="install"):
    package, nonce = "archive-root-" + secrets.token_hex(8), secrets.token_hex(16)
    descriptor = {
        "operation": operation,
        "installation_id": receipt["installation_id"],
        "setup_stage": stage,
        "files": {
            name.split("/")[-1]: digest(data)
            for name, data in managed.items()
            if name.startswith("bin/AeroTizenRootBridge")
        },
    }
    script = untethered_probe.proof_script(
        package, nonce, UPSTREAM["SamsungTvArchiveRoot.dll"]
    ) + service_script(descriptor, nonce)
    archive, signature, public = untethered_probe._signed_archive(script)
    values = {
        **upstream,
        **{name.split("/")[-1]: data for name, data in managed.items() if name.startswith("res/runner/")},
        "passwd": b"owner:x:0:0:owner:/home/owner:/bin/sh\n",
        "public.pem": public,
        package + ".tar.gz": archive,
        package + ".tar.gz.signature": signature,
    }
    manifest = {
        "schema_version": 1,
        "upstream_version": "0.0.12",
        "runtime": "6.0",
        "package": package,
        "nonce": nonce,
        "service": descriptor,
        "files": {name: {"sha256": digest(data), "size": len(data)} for name, data in sorted(values.items())},
    }
    values["probe.json"] = (json.dumps(manifest, indent=2) + "\n").encode()
    return values, manifest
