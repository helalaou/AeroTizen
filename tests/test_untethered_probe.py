"""The offline prototype must not accept modified or executable proof bundles."""

import hashlib
import io
import json
import tarfile

import pytest

from aerotizen import untethered_probe as probe


@pytest.fixture
def bundle_inputs(tmp_path, monkeypatch):
    release, agent = tmp_path / "release", tmp_path / "agent"
    payload = release / "_internal/payloads/common"
    payload.mkdir(parents=True)
    agent.mkdir()
    pins = {}
    for name in probe.UPSTREAM_FILES["6.0"]["hashes"]:
        data = ("verified fixture " + name).encode()
        (payload / name).write_bytes(data)
        pins[name] = hashlib.sha256(data).hexdigest()
    for name in probe.AGENT_FILES:
        (agent / name).write_bytes(("agent fixture " + name).encode())
    monkeypatch.setitem(probe.UPSTREAM_FILES, "6.0", {"directory": "common", "hashes": pins})
    return release, agent, tmp_path / "bundle"


def prepare(inputs):
    manifest = probe.prepare_bundle(*inputs)
    assert probe.validate_bundle(inputs[2]) == manifest
    return manifest


def update_file(directory, manifest, name, value):
    (directory / name).write_bytes(value)
    manifest["files"][name] = {"sha256": hashlib.sha256(value).hexdigest(), "size": len(value)}
    (directory / "probe.json").write_text(json.dumps(manifest))


def test_bundle_copies_stock_bytes_and_keeps_signing_key_off_disk(bundle_inputs):
    release, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    for name in probe.UPSTREAM_FILES["6.0"]["hashes"]:
        assert (directory / name).read_bytes() == (release / "_internal/payloads/common" / name).read_bytes()
    assert not any("private" in path.name or path.suffix in (".p12", ".key") for path in directory.iterdir())
    assert manifest["upstream_version"] == "0.0.12"
    assert directory.stat().st_mode & 0o777 == 0o700


def test_signed_archive_only_records_fresh_root_identity(bundle_inputs):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    with tarfile.open(directory / (manifest["package"] + ".tar.gz")) as archive:
        assert archive.getnames() == ["launch.sh"]
        script = archive.extractfile("launch.sh").read().decode()
    assert 'test "$(id -u)" = 0' in script and 'test "$(id -ru)" = 0' in script
    assert "/proc/sys/kernel/random/boot_id" in script
    assert manifest["nonce"] in script
    assert "chmod 444" in script
    assert 'mkdir -m 755 "$proofdir"' in script and 'cd "$proofdir"' in script
    assert "set -C" in script
    assert "systemctl" not in script and "app_onboot" not in script
    record = next(line for line in script.splitlines() if line.startswith("printf '")).split("'", 2)[1]
    value = json.loads(record.replace("%s", "11111111-2222-3333-4444-555555555555").replace(r"\n", "\n"))
    assert value["uid"] == 0 and value["nonce"] == manifest["nonce"]


def test_changed_upstream_is_rejected_even_with_a_changed_manifest(bundle_inputs):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    update_file(directory, manifest, "SamsungTvArchiveRoot.dll", b"changed upstream payload")
    with pytest.raises(ValueError, match="checksum"):
        probe.validate_bundle(directory)


def test_unverified_release_never_creates_output(bundle_inputs):
    release, _, directory = bundle_inputs
    (release / "_internal/payloads/common/SamsungTvArchiveRoot.dll").write_bytes(b"wrong version")
    with pytest.raises(ValueError, match="Unverified upstream"):
        probe.prepare_bundle(*bundle_inputs)
    assert not directory.exists()


def test_upstream_update_requires_a_new_tested_pair(bundle_inputs, monkeypatch):
    monkeypatch.setattr(probe, "SUPPORTED_VERSION", "0.0.13")
    with pytest.raises(ValueError, match="tested upstream/agent"):
        probe.prepare_bundle(*bundle_inputs)
    assert not bundle_inputs[2].exists()


def test_existing_output_is_preserved(bundle_inputs):
    _, _, directory = bundle_inputs
    directory.mkdir()
    (directory / "keep.txt").write_text("original")
    with pytest.raises(ValueError, match="already exists"):
        probe.prepare_bundle(*bundle_inputs)
    assert (directory / "keep.txt").read_text() == "original"


def test_linked_release_file_is_rejected(bundle_inputs):
    release, agent, _ = bundle_inputs
    file = release / "_internal/payloads/common/SamsungTvArchiveRoot.dll"
    original = file.read_bytes()
    file.unlink()
    target = agent / "not-a-release.dll"
    target.write_bytes(original)
    file.symlink_to(target)
    with pytest.raises(ValueError, match="Invalid probe file"):
        probe.prepare_bundle(*bundle_inputs)


@pytest.mark.parametrize(
    "field,value",
    [
        ("schema_version", True),
        ("nonce", "../bad"),
        ("package", "archive-root-'; id"),
        ("runtime", []),
        ("files", []),
    ],
)
def test_invalid_manifest_cannot_select_paths_or_versions(bundle_inputs, field, value):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    manifest[field] = value
    (directory / "probe.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError, match="Unsupported"):
        probe.validate_bundle(directory)


@pytest.mark.parametrize("change", ["extra-file", "missing-file", "linked-file", "changed-size"])
def test_file_inventory_and_bytes_must_match(bundle_inputs, change):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    file = directory / "passwd"
    if change == "extra-file":
        (directory / "private.pem").write_bytes(b"must never ship")
    elif change == "missing-file":
        file.unlink()
    elif change == "linked-file":
        target = directory.parent / "passwd"
        file.rename(target)
        file.symlink_to(target)
    else:
        manifest["files"]["passwd"]["size"] = True
        (directory / "probe.json").write_text(json.dumps(manifest))
    with pytest.raises(ValueError):
        probe.validate_bundle(directory)


def test_replacing_passwd_and_hash_does_not_change_the_probe(bundle_inputs):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    update_file(directory, manifest, "passwd", b"another account mapping\n")
    with pytest.raises(ValueError, match="passwd bind view"):
        probe.validate_bundle(directory)


def test_a_new_signature_cannot_authorize_a_different_root_command(bundle_inputs):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    archive, signature, public = probe._signed_archive(b"#!/bin/sh\nexit 0\n")
    for name, data in {
        manifest["package"] + ".tar.gz": archive,
        manifest["package"] + ".tar.gz.signature": signature,
        "public.pem": public,
    }.items():
        update_file(directory, manifest, name, data)
    with pytest.raises(ValueError, match="fixed identity probe"):
        probe.validate_bundle(directory)


def test_archive_cannot_contain_additional_members(bundle_inputs):
    _, _, directory = bundle_inputs
    manifest = prepare(bundle_inputs)
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as archive:
        for name in ["launch.sh", "another-file"]:
            data = b"exit 0\n"
            member = tarfile.TarInfo(name)
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))
    # Sign an internally consistent archive to exercise the member guard.
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    archive = buffer.getvalue()
    for name, data in {
        manifest["package"] + ".tar.gz": archive,
        manifest["package"] + ".tar.gz.signature": key.sign(archive, padding.PKCS1v15(), hashes.SHA256()),
        "public.pem": key.public_key().public_bytes(
            serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo
        ),
    }.items():
        update_file(directory, manifest, name, data)
    with pytest.raises(ValueError, match="Unexpected proof archive"):
        probe.validate_bundle(directory)
