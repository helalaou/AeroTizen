import hashlib
import io
import os
import stat
import sys
import tarfile
import zipfile

import pytest

from aerotizen import releases, self_update


def archive_bytes(files, suffix="tar.gz"):
    data = io.BytesIO()
    if suffix == "zip":
        with zipfile.ZipFile(data, "w") as archive:
            for name, value in files:
                archive.writestr(name, value)
    else:
        with tarfile.open(fileobj=data, mode="w:gz") as archive:
            for name, value in files:
                info = tarfile.TarInfo(name)
                info.size = len(value)
                archive.addfile(info, io.BytesIO(value))
    return data.getvalue()


@pytest.fixture
def update(tmp_path, monkeypatch):
    executable = "aerotizen.exe" if os.name == "nt" else "aerotizen"
    target = tmp_path / executable
    target.write_bytes(b"old-binary")
    target.chmod(0o755)
    suffix = "zip" if os.name == "nt" else "tar.gz"
    name = f"aerotizen-2.5.0-test.{suffix}"
    data = archive_bytes([(executable, b"new-binary"), ("LICENSE", b"MIT")], suffix)
    url = "https://github.com/example/AeroTizen/releases/download/cli-v2.5.0/" + name
    selected = releases.CLIRelease(
        "2.5.0", "https://github.com/example/AeroTizen/releases/tag/cli-v2.5.0", url, url + ".sha256"
    )
    responses = {url: data, url + ".sha256": f"{hashlib.sha256(data).hexdigest()}  {name}\n".encode()}
    monkeypatch.setattr(releases, "_read_url", lambda url, limit: responses[url])
    monkeypatch.setattr(sys, "frozen", True, raising=False)
    monkeypatch.setattr(sys, "executable", str(target))
    monkeypatch.setattr(self_update, "verify_version", lambda *args: None)
    return target, selected, responses


@pytest.mark.skipif(os.name == "nt", reason="Windows uses the separate native handoff tests")
def test_replacement_retains_a_verified_backup_and_unrelated_files(update):
    target, selected, _ = update
    settings = target.parent / "settings.json"
    settings.write_bytes(b"private-settings")
    result = self_update.install(selected)
    assert target.read_bytes() == b"new-binary"
    assert result.backup.read_bytes() == b"old-binary"
    assert stat.S_IMODE(target.stat().st_mode) == 0o755
    assert settings.read_bytes() == b"private-settings"
    assert not list(target.parent.glob(".aerotizen-update-*"))


def test_checksum_failure_preserves_the_old_executable(update):
    target, selected, responses = update
    responses[selected.download_url] += b"corruption"
    with pytest.raises(self_update.UpdateError, match="checksum mismatch"):
        self_update.install(selected)
    assert target.read_bytes() == b"old-binary"
    assert not list(target.parent.glob(".aerotizen-update-*"))


def test_missing_checksum_asset_prevents_any_download(update, monkeypatch):
    target, selected, _ = update
    selected = releases.CLIRelease(selected.version, selected.release_url, selected.download_url)
    monkeypatch.setattr(
        releases, "_read_url", lambda *args: pytest.fail("No download without a checksum asset")
    )
    with pytest.raises(self_update.UpdateError, match="archive and checksum"):
        self_update.install(selected)
    assert target.read_bytes() == b"old-binary"


def test_wrong_checksum_filename_is_rejected_before_archive_download(update, monkeypatch):
    target, selected, responses = update
    responses[selected.checksum_url] = b"0" * 64 + b"  other.tar.gz"
    calls = []
    monkeypatch.setattr(releases, "_read_url", lambda url, limit: calls.append(url) or responses[url])
    with pytest.raises(self_update.UpdateError, match="does not name"):
        self_update.install(selected)
    assert calls == [selected.checksum_url]
    assert target.read_bytes() == b"old-binary"


def test_failed_download_preserves_the_old_executable(update, monkeypatch):
    target, selected, _ = update

    def fail(*args):
        raise releases.ReleaseError("Network unavailable")

    monkeypatch.setattr(releases, "_read_url", fail)
    with pytest.raises(releases.ReleaseError, match="Network unavailable"):
        self_update.install(selected)
    assert target.read_bytes() == b"old-binary"


@pytest.mark.skipif(os.name == "nt", reason="Windows uses the separate native handoff tests")
@pytest.mark.parametrize("stage", ["before", "after"])
def test_failed_version_probe_keeps_or_restores_previous_executable(update, monkeypatch, stage):
    target, selected, _ = update

    def verify(path, version):
        if (path == target) == (stage == "after"):
            raise self_update.UpdateError("Version check failed")

    monkeypatch.setattr(self_update, "verify_version", verify)
    with pytest.raises(self_update.UpdateError, match="Version check failed"):
        self_update.install(selected)
    assert target.read_bytes() == b"old-binary"
    assert not list(target.parent.glob(".aerotizen-update-*"))


def test_python_install_never_replaces_the_interpreter(update, monkeypatch):
    target, selected, _ = update
    monkeypatch.setattr(sys, "frozen", False)
    with pytest.raises(
        self_update.UpdateError,
        match=r"-m pip install --upgrade git\+https://github.com/example/AeroTizen@cli-v2\.5\.0",
    ):
        self_update.install(selected, repository="example/AeroTizen")
    assert target.read_bytes() == b"old-binary"
    assert not list(target.parent.glob(".*.update.lock"))


def test_concurrent_update_is_rejected_before_download(update, monkeypatch):
    target, selected, _ = update
    monkeypatch.setattr(releases, "_read_url", lambda *args: pytest.fail("No download while locked"))
    with self_update.update_lock(target), pytest.raises(self_update.UpdateError, match="Cannot lock"):
        self_update.install(selected)
    assert target.read_bytes() == b"old-binary"


@pytest.mark.parametrize("suffix", ["zip", "tar.gz"])
@pytest.mark.parametrize("bad_name", ["../aerotizen", "/aerotizen", "extra", "aerotizen/../aerotizen"])
def test_archive_paths_and_unexpected_files_are_rejected(suffix, bad_name):
    data = archive_bytes([(bad_name, b"bad"), ("LICENSE", b"MIT")], suffix)
    with pytest.raises(self_update.UpdateError):
        self_update.unpack_binary(data, "archive." + suffix, "aerotizen")


@pytest.mark.parametrize("suffix", ["zip", "tar.gz"])
def test_archive_must_include_license(suffix):
    data = archive_bytes([("aerotizen", b"binary")], suffix)
    with pytest.raises(self_update.UpdateError, match="executable and LICENSE"):
        self_update.unpack_binary(data, "archive." + suffix, "aerotizen")


def test_tar_links_are_rejected():
    data = io.BytesIO()
    with tarfile.open(fileobj=data, mode="w:gz") as archive:
        entry = tarfile.TarInfo("aerotizen")
        entry.type = tarfile.SYMTYPE
        entry.linkname = "/etc/passwd"
        archive.addfile(entry)
    with pytest.raises(self_update.UpdateError, match="link"):
        self_update.unpack_binary(data.getvalue(), "archive.tar.gz", "aerotizen")


def test_zip_device_entries_are_rejected():
    data = io.BytesIO()
    with zipfile.ZipFile(data, "w") as archive:
        entry = zipfile.ZipInfo("aerotizen")
        entry.external_attr = (stat.S_IFCHR | 0o600) << 16
        archive.writestr(entry, b"device")
        archive.writestr("LICENSE", b"MIT")
    with pytest.raises(self_update.UpdateError, match="unexpected files"):
        self_update.unpack_binary(data.getvalue(), "archive.zip", "aerotizen")


def test_binary_size_is_bounded(monkeypatch):
    monkeypatch.setattr(self_update, "MAX_BINARY_BYTES", 4)
    data = archive_bytes([("aerotizen", b"too-large"), ("LICENSE", b"MIT")])
    with pytest.raises(self_update.UpdateError, match="allowed size"):
        self_update.unpack_binary(data, "archive.tar.gz", "aerotizen")


def test_independent_child_environment_resets_pyinstaller_and_loader(monkeypatch):
    monkeypatch.setenv("PYTHONPATH", "untrusted")
    monkeypatch.setenv("LD_LIBRARY_PATH", "bundled")
    monkeypatch.setenv("LD_LIBRARY_PATH_ORIG", "original")
    monkeypatch.setattr(sys, "platform", "linux")
    environment = self_update.child_environment()
    assert "PYTHONPATH" not in environment
    assert environment["PYINSTALLER_RESET_ENVIRONMENT"] == "1"
    assert environment["LD_LIBRARY_PATH"] == "original"
