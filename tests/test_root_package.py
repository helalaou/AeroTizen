"""Signed helper contents, stock-payload integrity and cross-language launch contracts."""

import json
import os
import shlex
import shutil
import sqlite3
import subprocess
import tarfile
import time
import uuid
import zipfile
from pathlib import Path

import pytest

from aerotizen import root_package as package
from aerotizen import root_state
from root_test_support import make_certificates
from test_root_bridge import native_root as native_fixture
from test_root_bridge import receipt_data

native_root = native_fixture
ROOT = Path(__file__).resolve().parents[1]


def managed():
    return {name: ("managed fixture " + name).encode() for name in package.MANAGED}


def helper_manifest():
    template = (ROOT / "cli/native/root-helper/tizen-manifest.xml").read_text()
    return template.replace("@CLI_VERSION@", root_state.RUNTIME_VERSION)


def test_signed_helper_contains_no_pairing_secrets(tmp_path, monkeypatch):
    values = {name: ("stock fixture " + name).encode() for name in package.UPSTREAM}
    monkeypatch.setattr(package, "UPSTREAM", {name: package.digest(value) for name, value in values.items()})
    receipt = receipt_data()
    output = tmp_path / "helper.tpk"
    package.package_helper(
        output,
        receipt,
        managed(),
        values,
        helper_manifest().encode(),
        b"icon",
        make_certificates(tmp_path),
    )
    assert package.validate_package(output)["installation_id"] == receipt["installation_id"]
    with zipfile.ZipFile(output) as archive:
        payload = b"".join(archive.read(name) for name in archive.namelist())
        assert receipt["token"].encode() not in payload
        assert receipt["server_pfx"].encode() not in payload
        assert not any(name.endswith((".pfx", ".p12", ".key")) for name in archive.namelist())
        assert b"app-control" not in archive.read("tizen-manifest.xml")


@pytest.mark.parametrize("change", ["home", "restart", "identity", "privilege"])
def test_helper_manifest_cannot_take_over_home_or_add_privileges(change):
    xml = helper_manifest()
    if change == "home":
        xml = xml.replace("</service-application>", "<app-control/> </service-application>")
    elif change == "restart":
        xml = xml.replace('auto-restart="false"', 'auto-restart="true"')
    elif change == "identity":
        xml = xml.replace(root_state.APP_ID, "com.samsung.foreign")
    else:
        xml = xml.replace("privilege/internet", "privilege/appmanager.launch")
    with pytest.raises(ValueError):
        package.validate_manifest(xml)


def test_corrupt_cached_release_fails_without_network(tmp_path, monkeypatch):
    (tmp_path / "samsung-tv-root-0.0.12.tar.gz").write_bytes(b"corrupt")
    monkeypatch.setattr(
        package.urllib.request, "urlopen", lambda *a, **k: pytest.fail("bad cache used network")
    )
    with pytest.raises(ValueError, match="checksum"):
        package.upstream_payloads(tmp_path)


@pytest.mark.parametrize("operation", ["install", "upgrade", "remove"])
def test_native_setup_archive_contract(native_root, tmp_path, operation):
    release = os.environ.get("AEROTIZEN_TEST_ROOT_RELEASE")
    if not release:
        pytest.skip("Set AEROTIZEN_TEST_ROOT_RELEASE for the pinned-payload archive integration check")
    values, manifest = package.setup_bundle(
        receipt_data(),
        managed(),
        package.upstream_payloads(tmp_path, release=release),
        "/home/owner/share/tmp/sdk_tools/arsetup-" + uuid.uuid4().hex[:16],
        operation=operation,
    )
    output = tmp_path / "bundle"
    output.mkdir()
    for name, value in values.items():
        (output / name).write_bytes(value)
    assert manifest["service"]["operation"] == operation
    result = subprocess.run(
        [*native_root, "--check-bundle", str(output)], capture_output=True, text=True, timeout=20
    )
    assert result.returncode == 0, result.stderr


def test_native_per_boot_archive_factory_matches_its_validator(native_root, tmp_path):
    release = os.environ.get("AEROTIZEN_TEST_ROOT_RELEASE")
    if not release:
        pytest.skip("Pinned upstream release required for the native runtime archive check")
    values = managed()
    receipt = receipt_data()
    config = package.public_config(receipt, values)
    for name, data in {
        **values,
        **{
            "res/payload/" + name: value
            for name, value in package.upstream_payloads(tmp_path, release=release).items()
        },
        "bin/root.json": json.dumps(config).encode(),
    }.items():
        path = tmp_path / "installed" / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    nonce = uuid.uuid4().hex
    result = subprocess.run(
        [*native_root, "--bundle", str(tmp_path / "installed"), str(tmp_path / "runtime"), nonce],
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert result.returncode == 0, result.stderr
    framed = subprocess.run(
        [*native_root, "--report-contract", str(tmp_path / "runtime")],
        capture_output=True,
        text=True,
        timeout=20,
    )
    assert framed.returncode == 0, framed.stderr
    archive = next((tmp_path / "runtime").glob("archive-root-*.tar.gz"))
    with tarfile.open(archive, "r:gz") as source:
        script = source.extractfile("launch.sh").read().decode("ascii")
    command = script.strip().splitlines()[-1]
    check_isolated_launch(command, tmp_path / "boot-launch", "sh", receipt["installation_id"], nonce, "boot")


@pytest.mark.parametrize("shell_name", ["sh", "bash", "dash"])
def test_detached_setup_child_cannot_keep_the_sdk_callback_open(native_root, tmp_path, shell_name):
    shell = shutil.which(shell_name)
    if not shell:
        pytest.skip(shell_name + " required")
    installation, nonce = uuid.uuid4().hex, uuid.uuid4().hex
    result = subprocess.run(
        [*native_root, "--setup-launch", installation, nonce],
        capture_output=True,
        text=True,
        check=True,
        timeout=15,
    )
    check_isolated_launch(result.stdout, tmp_path, shell_name, installation, nonce, "setup")


def check_isolated_launch(source, tmp_path, shell_name, installation, nonce, origin):
    shell = shutil.which(shell_name)
    if not shell:
        pytest.skip(shell_name + " required")
    tmp_path.mkdir(exist_ok=True)
    marker = tmp_path / "detached"
    scope_marker = tmp_path / "scope-requested"
    stub = tmp_path / "dotnet"
    runner = tmp_path / "systemd-run"
    runner.write_text(
        f"#!{shell}\nset -eu\n"
        'test "$1" = --quiet\ntest "$2" = --scope\n'
        + 'test "$3" = '
        + shlex.quote(f"--unit=aerotizen-root-{installation}-{nonce}.scope")
        + '\ntest "$4" = --\nprintf scoped > '
        + shlex.quote(str(scope_marker))
        + '\nshift 4\nexec "$@"\n'
    )
    runner.chmod(0o700)
    # Isolate the closed-descriptor probe: dash treats its redirection error as fatal.
    stub.write_text(
        f"#!{shell}\nset -eu\nif ( : >&3 ) 2>/dev/null; then exit 70; fi\n"
        + 'test "$#" -eq 5\ntest "$1" = '
        + shlex.quote(f"/opt/usr/apps/{root_state.APP_ID}/bin/AeroTizenRootBridge.dll")
        + '\ntest "$2" = --serve\ntest "$3" = '
        + shlex.quote(installation)
        + '\ntest "$4" = '
        + shlex.quote(nonce)
        + '\ntest "$5" = '
        + shlex.quote(origin)
        + "\n"
        + "printf detached > "
        + shlex.quote(str(marker))
        + "\n"
    )
    stub.chmod(0o700)
    command = "exec 3>" + shlex.quote(str(tmp_path / "sdk-callback")) + "; "
    command += source.replace("/usr/bin/systemd-run", shlex.quote(str(runner))).replace(
        "/usr/bin/dotnet", shlex.quote(str(stub))
    )
    completed = subprocess.run([shell, "-c", command], timeout=5)
    assert completed.returncode == 0
    deadline = time.monotonic() + 2
    while not marker.exists() and time.monotonic() < deadline:
        time.sleep(0.01)
    assert scope_marker.read_text() == "scoped"
    assert marker.read_text() == "detached"


@pytest.mark.parametrize("wrong", [None, "executable", "trigger", "missing"])
def test_actual_native_registration_sql_is_scoped_and_transactional(native_root, wrong):
    result = subprocess.run([*native_root, "--sql"], capture_output=True, text=True, timeout=15, check=True)
    sql = "\n".join(line for line in result.stdout.splitlines() if not line.startswith("."))
    connection = sqlite3.connect(":memory:")
    try:
        connection.execute(
            "CREATE TABLE package_app_info "
            "(app_id, package, app_type, app_component, app_onboot, app_autorestart, app_exec)"
        )
        own = (
            root_state.APP_ID,
            root_state.APP_ID,
            "dotnet",
            "svcapp",
            "false",
            "false",
            f"/opt/usr/apps/{root_state.APP_ID}/bin/"
            + ("other.dll" if wrong == "executable" else "AeroTizenRootHelper.dll"),
        )
        if wrong != "missing":
            connection.execute("INSERT INTO package_app_info VALUES (?,?,?,?,?,?,?)", own)
        connection.execute(
            "INSERT INTO package_app_info VALUES "
            "('Samsung.Home','Samsung','dotnet','uiapp','true','false','Home')"
        )
        if wrong == "trigger":
            connection.execute(
                "CREATE TRIGGER foreign_trigger AFTER UPDATE ON package_app_info BEGIN SELECT 1; END"
            )
        connection.commit()
        if wrong:
            with pytest.raises(sqlite3.IntegrityError):
                connection.executescript(sql)
            connection.rollback()
        else:
            connection.executescript(sql)
        row = connection.execute(
            "SELECT app_onboot FROM package_app_info WHERE app_id=?", (root_state.APP_ID,)
        ).fetchone()
        assert row == (("true" if wrong is None else "false",) if wrong != "missing" else None)
        assert connection.execute(
            "SELECT app_onboot FROM package_app_info WHERE app_id='Samsung.Home'"
        ).fetchone() == ("true",)
    finally:
        connection.close()
