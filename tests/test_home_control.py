"""All device calls are mocks. These tests never connect to a TV."""

import base64
import copy
import hashlib
import json
import os
import shutil
import subprocess
from contextlib import nullcontext
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from aerotizen import cli, home, home_control, remote, sdk
from aerotizen.sdb import SdbError

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def status():
    evidence = json.loads((Path(__file__).parent / "fixtures/home-read-only-tv-20261024.json").read_text())
    return {
        "schema_version": 1,
        "queried_at": "2026-10-24T18:00:00+00:00",
        "complete": True,
        "launcher": {"installed": True, "error": None},
        "device": {**evidence["device"], "identity_sha256": "a" * 64},
        "home": evidence["home"],
        "watcher": {
            **evidence["watcher"],
            "control": {
                "protocol": 1,
                "app_id": home.releases.APP_ID,
                "persistent": True,
                "mode": "watcher",
                "transaction": None,
                "baseline_sha256": None,
            },
        },
        "evidence": {
            **evidence["query_evidence"],
            "access": "sdk_uid_901",
            "uid": 901,
            "authenticated": True,
            "sdk_staging_cleaned": True,
            "query_staging_cleaned": True,
        },
    }


@pytest.mark.parametrize("action", ["apply", "restore"])
def test_cli_preview_never_discovers_or_connects(monkeypatch, action, capsys):
    monkeypatch.setattr(cli, "pick_tv", lambda *args: pytest.fail("No TV contact allowed"))
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", action, "--json"])
    cli.main()
    result = json.loads(capsys.readouterr().out)
    assert not result["will_write"] and result["requires_yes"] and result["action"] == action
    assert "tv_recovery" not in result


def test_control_payload_matches_current_sources():
    manifest = json.loads(home_control.PAYLOAD_PATH.read_text())
    sources = b"\0".join(
        (ROOT / "cli/native/home-control" / name).read_bytes()
        for name in (
            "HomeControl.cs",
            "ControlPolicy.cs",
            "Compatibility.cs",
            "HomeControl.csproj",
            "../home-common/Installation.cs",
        )
    )
    assert manifest["source_sha256"] == hashlib.sha256(sources).hexdigest()
    assert home_control.load_helper()[home_control.HELPER_FILES[0]].startswith(b"MZ")


def native_result(action, *, success=True, rolled_back=False, startup_settings_restored=False, failure=None):
    return {
        "stdout": home_control.PREFIX
        + json.dumps(
            {
                "schema_version": 1,
                "uid": 901,
                "action": action,
                "result": {
                    "Success": success,
                    "RolledBack": rolled_back,
                    "StartupSettingsRestored": startup_settings_restored,
                    "Failure": failure,
                    "Error": None if success else "simulated failure",
                },
            }
        ),
        "exit_code": 0 if success else 1,
        "staging_cleaned": True,
    }


@pytest.mark.parametrize("action", ["apply", "restore"])
@pytest.mark.parametrize("launcher_boot_backup", [False, True])
def test_change_journals_before_writer_and_preserves_original(
    monkeypatch, tmp_path, status, action, launcher_boot_backup
):
    saved = home.save_backup(status, state_dir=tmp_path)
    backup = Path(saved["path"])
    raw = backup.read_bytes()
    final = copy.deepcopy(status)
    if action == "apply":
        final["home"]["main_operation"]["value"] = home.releases.APP_ID
        final["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
        for key in home.STARTUP_KEYS:
            final["home"]["settings"][key]["value"] = home.releases.APP_ID
        final["home"]["settings"][home.AUTOSTART_KEY]["value"] = 1
        final["watcher"]["control"]["mode"] = "native"
    if launcher_boot_backup:
        status["home"]["settings"]["db/appfw/booting_appid_backup"]["value"] = home.releases.APP_ID
    reads = iter([status, final])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))

    def run(session, files, entrypoint, args):
        request = json.loads(files["request.json"])
        assert base64.b64decode(request["baseline_base64"]) == raw
        assert request.get("boot", False) is (action == "apply")
        receipt = next(tmp_path.rglob("transactions/*.json"))
        assert json.loads(receipt.read_text())["state"] == "pending"
        assert args == ("request.json",) and entrypoint == home_control.HELPER_FILES[0]
        return native_result(action)

    monkeypatch.setattr(sdk, "run", run)
    result = home_control.change(object(), {}, action, state_dir=tmp_path)
    assert result["success"] and backup.read_bytes() == raw
    if action == "apply":
        assert result["startup_settings_restored"] is False
    receipt = Path(result["receipt"])
    assert json.loads(receipt.read_text())["state"] == (
        "applied_verified" if action == "apply" else "restored_verified"
    )
    if os.name != "nt":
        assert receipt.stat().st_mode & 0o777 == 0o600


@pytest.mark.parametrize(
    "alteration", ["firmware", "identity", "model", "os_version", "cpu_arch", "incomplete"]
)
def test_preflight_never_invokes_writer_on_mismatch(monkeypatch, tmp_path, status, alteration):
    saved = home.save_backup(status, state_dir=tmp_path)
    if alteration == "firmware":
        status["device"]["firmware_build"] = "OTHER"
    elif alteration == "identity":
        status["device"]["identity_sha256"] = "c" * 64
    elif alteration in ("model", "os_version", "cpu_arch"):
        status["device"][alteration] = "OTHER"
    else:
        status["complete"] = False
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(sdk, "run", lambda *args: pytest.fail("writer must not run"))
    with pytest.raises(home.HomeError):
        home_control.change(object(), {}, "apply", backup=saved["path"], state_dir=tmp_path)
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize(
    "model,firmware",
    [
        ("QE65S90CATXZT", "T-OTHER-TIZEN7"),
        ("QE55Q70BATXXU", "T-OTHER-TIZEN6"),
    ],
)
@pytest.mark.parametrize("startup_settings_restored", [False, True])
@pytest.mark.parametrize("installed", [False, True])
def test_other_models_roundtrip_their_own_original_values(
    monkeypatch, tmp_path, status, model, firmware, startup_settings_restored, installed
):
    status["device"].update(model=model, firmware_build=firmware, os_version="7.0.0", cpu_arch="armv7l")
    status["home"]["main_operation"]["value"] = "Other.StockHome"
    status["home"]["settings"][home.HOME_KEY]["value"] = "Other.StockHome"
    status["home"]["settings"]["db/appfw/startup_appid"]["value"] = "Other.Startup"
    status["home"]["settings"]["db/first_screen/type"]["value"] = "Other.ArtReturn"
    saved = home.save_backup(status, state_dir=tmp_path)
    backup = Path(saved["path"])
    raw = backup.read_bytes()
    native = copy.deepcopy(status)
    native["home"]["main_operation"]["value"] = home.releases.APP_ID
    native["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    native["watcher"]["control"].update(mode="native", baseline_sha256=hashlib.sha256(raw).hexdigest())
    if not startup_settings_restored:
        native["home"]["settings"][home.AUTOSTART_KEY]["value"] = 1
        for key in home.STARTUP_KEYS:
            native["home"]["settings"][key]["value"] = home.releases.APP_ID
    restoring = copy.deepcopy(native)
    restored = copy.deepcopy(status)
    if not installed:
        for snapshot in (restoring, restored):
            snapshot["launcher"]["installed"] = False
            snapshot["watcher"] = {"state": "unknown", "reachable": False}
    reads = iter([status, native, restoring, restored])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))

    def run(session, files, entrypoint, args):
        request = json.loads(files["request.json"])
        assert base64.b64decode(request["baseline_base64"]) == raw
        receipt = backup.parent / "transactions" / (request["transaction"] + ".json")
        assert json.loads(receipt.read_text())["state"] == "pending"
        if request["action"] == "apply":
            native["watcher"]["control"]["transaction"] = request["transaction"]
            if installed:
                restoring["watcher"]["control"]["transaction"] = request["transaction"]
            return native_result("apply", startup_settings_restored=startup_settings_restored)
        recovery_key = "restore_boot_transaction" if installed else "recovery_apply"
        assert (recovery_key in request) is (not startup_settings_restored)
        return native_result(request["action"])

    monkeypatch.setattr(sdk, "run", run)
    assert home_control.change(object(), {}, "apply", state_dir=tmp_path)["success"]
    assert home_control.change(object(), {}, "restore", state_dir=tmp_path)["success"]
    assert backup.read_bytes() == raw


@pytest.mark.parametrize("action", ["apply", "restore"])
@pytest.mark.parametrize(
    "failure",
    [
        "arm64",
        "x86",
        "missing_arch",
        "root",
        "wrong_uid",
        "unauthenticated",
        "unclean_query",
        "unclean_sdk",
        "wrong_type",
        "missing_key",
        "unavailable",
        "empty_value",
        "autostart_value",
    ],
)
def test_incompatible_state_never_journals_or_invokes_writer(monkeypatch, tmp_path, status, action, failure):
    if failure in ("arm64", "x86", "missing_arch"):
        status["device"]["cpu_arch"] = None if failure == "missing_arch" else failure
    saved = home.save_backup(status, state_dir=tmp_path)
    if failure == "root":
        status["evidence"].update(access="temporary_root", uid=0)
    elif failure == "wrong_uid":
        status["evidence"]["uid"] = 5001
    elif failure == "unauthenticated":
        status["evidence"]["authenticated"] = False
    elif failure == "unclean_query":
        status["evidence"]["query_staging_cleaned"] = False
    elif failure == "unclean_sdk":
        status["evidence"]["sdk_staging_cleaned"] = False
    elif failure == "wrong_type":
        status["home"]["settings"][home.HOME_KEY]["type"] = "int"
    elif failure == "missing_key":
        del status["home"]["settings"][home.HOME_KEY]
    elif failure == "unavailable":
        status["home"]["settings"][home.HOME_KEY].update(status="unavailable", value=None, error="missing")
    elif failure == "empty_value":
        status["home"]["settings"][home.HOME_KEY]["value"] = " "
    elif failure == "autostart_value":
        status["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 2
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(sdk, "run", lambda *args: pytest.fail("writer must not run"))
    with pytest.raises(home.HomeError):
        home_control.change(object(), {}, action, backup=saved["path"], state_dir=tmp_path)
    assert not list(tmp_path.rglob("transactions/*.json"))


def test_failed_native_apply_retains_rollback_result_and_original(monkeypatch, tmp_path, status):
    saved = home.save_backup(status, state_dir=tmp_path)
    original = Path(saved["path"]).read_bytes()
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(
        sdk,
        "run",
        lambda *args: native_result(
            "apply", success=False, rolled_back=True, failure={"Differences": {home.STARTUP_KEYS[0]: {}}}
        ),
    )
    with pytest.raises(home.HomeError, match=r"simulated failure.*db/appfw/startup_appid"):
        home_control.change(object(), {}, "apply", state_dir=tmp_path)
    receipt = json.loads(next(tmp_path.rglob("transactions/*.json")).read_text())
    assert receipt["state"] == "rolled_back" and Path(saved["path"]).read_bytes() == original


def test_transport_failure_keeps_pending_recovery_receipt(monkeypatch, tmp_path, status):
    home.save_backup(status, state_dir=tmp_path)
    monkeypatch.setattr(home, "read_status", lambda *args: status)

    def failed(*args):
        raise OSError("callback lost")

    monkeypatch.setattr(sdk, "run", failed)
    with pytest.raises(OSError, match="callback lost"):
        home_control.change(object(), {}, "apply", state_dir=tmp_path)
    receipt = json.loads(next(tmp_path.rglob("transactions/*.json")).read_text())
    assert receipt["state"] == "pending" and receipt["error"] == "callback lost"


def test_final_readback_cannot_claim_success_on_a_watcher_mismatch(monkeypatch, tmp_path, status):
    home.save_backup(status, state_dir=tmp_path)
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(sdk, "run", lambda *args: native_result("apply"))
    with pytest.raises(home.HomeError, match="final Home/watcher"):
        home_control.change(object(), {}, "apply", state_dir=tmp_path)
    receipt = json.loads(next(tmp_path.rglob("transactions/*.json")).read_text())
    assert receipt["state"] == "applied" and "error" in receipt


@pytest.mark.parametrize("partial_startup", [None, home.STARTUP_KEYS[1], home.AUTOSTART_KEY])
def test_cli_only_reports_startup_fallback_after_saved_settings_are_verified(
    monkeypatch, tmp_path, status, capsys, partial_startup
):
    home.save_backup(status, state_dir=tmp_path)
    final = copy.deepcopy(status)
    final["home"]["main_operation"]["value"] = home.releases.APP_ID
    final["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    final["watcher"]["control"]["mode"] = "native"
    if partial_startup:
        final["home"]["settings"][partial_startup]["value"] = (
            1 if partial_startup == home.AUTOSTART_KEY else home.releases.APP_ID
        )
    reads = iter([status, final])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))
    monkeypatch.setattr(sdk, "run", lambda *args: native_result("apply", startup_settings_restored=True))
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    monkeypatch.setattr(cli, "pick_tv", lambda args: "TV")
    monkeypatch.setattr(cli, "require_sdb", lambda host: nullcontext(object()))
    monkeypatch.setattr(home, "device_info", lambda *args, **kwargs: {})
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", "apply", "--yes"])
    if partial_startup:
        with pytest.raises(SystemExit, match=rf"final Home/watcher.*{partial_startup}"):
            cli.main()
    else:
        cli.main()
        assert "Home applied. Startup settings restored" in capsys.readouterr().out


def test_native_policy_failure_boundaries_run_on_host_without_tizen():
    dotnet = os.environ.get("AEROTIZEN_DOTNET") or shutil.which("dotnet")
    if not dotnet:
        pytest.skip("Install the .NET 6 SDK to run the native policy harness")
    result = subprocess.run(
        [
            dotnet,
            "run",
            "--project",
            str(ROOT / "tests/native-home/PolicyTests.csproj"),
            "-c",
            "Release",
            "-p:UseSharedCompilation=false",
        ],
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, result.stdout + result.stderr
    assert "POLICY_TESTS_PASSED=114" in result.stdout


@pytest.mark.parametrize("alias", [[], ["--boot"]])
def test_apply_preview_includes_startup_without_device_contact(monkeypatch, capsys, alias):
    monkeypatch.setattr(cli, "pick_tv", lambda *args: pytest.fail("No TV contact allowed"))
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", "apply", *alias, "--json"])
    cli.main()
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    assert result["boot"] is True and result["will_write"] is False
    assert "autostart (1)" in result["startup"]
    assert ("--boot option is deprecated" in captured.err) is bool(alias)


@pytest.mark.parametrize("derived", [False, True])
def test_boot_apply_and_receipt_bound_restore(monkeypatch, tmp_path, status, derived):
    saved = home.save_backup(status, state_dir=tmp_path)
    raw = Path(saved["path"]).read_bytes()
    native = copy.deepcopy(status)
    native["home"]["main_operation"]["value"] = home.releases.APP_ID
    native["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    native["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 1
    if derived:
        for key in ("db/appfw/startup_appid", "db/appfw/booting_appid_backup"):
            native["home"]["settings"][key]["value"] = home.releases.APP_ID
    native["watcher"]["control"].update(mode="native", baseline_sha256=hashlib.sha256(raw).hexdigest())
    reads = iter([status, native, native, status])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))
    token = None

    def run(session, files, entrypoint, args):
        nonlocal token
        request = json.loads(files["request.json"])
        if request["action"] == "apply":
            assert request["boot"] is True
            assert "art_return" not in request
            token = request["transaction"]
            native["watcher"]["control"]["transaction"] = token
        else:
            assert request["restore_boot_transaction"] == token
        return native_result(request["action"])

    monkeypatch.setattr(sdk, "run", run)
    if not derived:
        with pytest.raises(home.HomeError, match=r"final Home/watcher.*db/appfw/startup_appid"):
            home_control.change(object(), {}, "apply", state_dir=tmp_path)
        return
    assert home_control.change(object(), {}, "apply", state_dir=tmp_path)["success"]
    assert home_control.change(object(), {}, "restore", state_dir=tmp_path)["success"]
    assert Path(saved["path"]).read_bytes() == raw


@pytest.mark.parametrize(
    "receipt_kind",
    ["missing", "normal_home", "startup_fallback", "wrong_baseline", "wrong_token", "wrong_raw"],
)
def test_boot_restore_refuses_missing_or_unrelated_receipts(monkeypatch, tmp_path, status, receipt_kind):
    saved = home.save_backup(status, state_dir=tmp_path)
    raw = Path(saved["path"]).read_bytes()
    digest = hashlib.sha256(raw).hexdigest()
    token = "b" * 32
    control = status["watcher"]["control"]
    control.update(mode="native", transaction=token, baseline_sha256=digest)
    status["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 1
    request = {
        "schema_version": 1,
        "action": "apply",
        "boot": True,
        "transaction": token,
        "baseline_sha256": digest,
        "baseline_base64": base64.b64encode(raw).decode(),
    }
    if receipt_kind == "normal_home":
        request.pop("boot")
    elif receipt_kind == "wrong_baseline":
        request["baseline_sha256"] = "d" * 64
    elif receipt_kind == "wrong_token":
        request["transaction"] = "c" * 32
    elif receipt_kind == "wrong_raw":
        request["baseline_base64"] = base64.b64encode(b"other backup").decode()
    if receipt_kind != "missing":
        path = Path(saved["path"]).parent / "transactions" / f"{token}.json"
        path.parent.mkdir()
        receipt = {"request": request}
        if receipt_kind == "startup_fallback":
            receipt["native_result"] = {"Success": True, "StartupSettingsRestored": True}
        path.write_text(json.dumps(receipt))
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(sdk, "run", lambda *args: pytest.fail("No writer allowed"))
    with pytest.raises(home.HomeError, match="matching boot receipt"):
        home_control.change(object(), {}, "restore", state_dir=tmp_path)


@pytest.mark.parametrize("yes", [False, True])
def test_removed_art_return_option_refuses_before_tv_contact(monkeypatch, capsys, yes):
    monkeypatch.setattr(cli, "pick_tv", lambda *args: pytest.fail("No TV contact allowed"))
    argv = ["aerotizen", "home", "apply", "--boot", "--art-return", "--json"]
    if yes:
        argv.append("--yes")
    monkeypatch.setattr("sys.argv", argv)
    with pytest.raises(SystemExit) as error:
        cli.main()
    assert error.value.code == 2
    assert "unrecognized arguments: --art-return" in capsys.readouterr().err


def test_apply_help_hides_removed_options(monkeypatch, capsys):
    monkeypatch.setattr("sys.argv", ["aerotizen", "home", "apply", "--help"])
    with pytest.raises(SystemExit) as error:
        cli.main()
    assert error.value.code == 0
    output = capsys.readouterr().out
    assert "--boot" not in output and "--art-return" not in output


@pytest.mark.parametrize("installed", [False, True])
@pytest.mark.parametrize("boot", [False, True])
def test_legacy_art_receipts_restore_from_copied_folder(monkeypatch, tmp_path, status, installed, boot):
    saved = home.save_backup(status, state_dir=tmp_path / "old-pc")
    source = Path(saved["path"])
    raw = source.read_bytes()
    token = "b" * 32
    legacy = {
        "schema_version": 1,
        "action": "apply",
        "transaction": token,
        "art_return": True,
        "baseline_sha256": saved["sha256"],
        "baseline_base64": base64.b64encode(raw).decode(),
    }
    if boot:
        legacy["boot"] = True
    home_control._write_receipt(
        source.parent / "transactions" / f"{token}.json", {"request": legacy}, create=True
    )
    copied = tmp_path / "copied-backup"
    shutil.copytree(source.parent, copied)
    backup = copied / source.name
    current = copy.deepcopy(status)
    current["home"]["main_operation"]["value"] = home.releases.APP_ID
    for key in (home.HOME_KEY, "db/first_screen/type"):
        current["home"]["settings"][key]["value"] = home.releases.APP_ID
    if boot:
        current["home"]["settings"]["db/menu/smart_hub/ontvsetting/auto_start"]["value"] = 1
        for key in ("db/appfw/startup_appid", "db/appfw/booting_appid_backup"):
            current["home"]["settings"][key]["value"] = home.releases.APP_ID
    current["watcher"]["control"].update(mode="native", transaction=token, baseline_sha256=saved["sha256"])
    final = copy.deepcopy(status)
    if not installed:
        current, final = absent_status(current), absent_status(final)
    reads = iter([current, final])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))

    def run(session, files, entrypoint, args):
        request = json.loads(files["request.json"])
        assert request["action"] == "restore" and "art_return" not in request
        assert base64.b64decode(request["baseline_base64"]) == raw
        if boot and installed:
            assert request["restore_boot_transaction"] == token
        elif boot:
            assert request["recovery_apply"]["transaction"] == token
            assert "art_return" not in request["recovery_apply"]
        else:
            assert "restore_boot_transaction" not in request and "recovery_apply" not in request
        return native_result("restore")

    monkeypatch.setattr(sdk, "run", run)
    result = home_control.change(object(), {}, "restore", backup=backup, state_dir=tmp_path / "new-pc")
    assert result["success"] and result["status"]["launcher"]["installed"] is installed
    assert backup.read_bytes() == raw and not (tmp_path / "new-pc").exists()


@pytest.fixture
def boot_backup(tmp_path, status):
    saved = home.save_backup(status, state_dir=tmp_path / "old-pc")
    backup = Path(saved["path"])
    raw = backup.read_bytes()
    token = "b" * 32
    request = {
        "schema_version": 1,
        "action": "apply",
        "transaction": token,
        "boot": True,
        "baseline_sha256": saved["sha256"],
        "baseline_base64": base64.b64encode(raw).decode(),
    }
    home_control._write_receipt(
        backup.parent / "transactions" / f"{token}.json", {"request": request}, create=True
    )
    native = copy.deepcopy(status)
    native["home"]["main_operation"]["value"] = home.releases.APP_ID
    for item in native["home"]["settings"].values():
        item["value"] = 1 if item["type"] == "int" else home.releases.APP_ID
    native["watcher"]["control"].update(mode="native", transaction=token, baseline_sha256=saved["sha256"])
    return backup, raw, native


@pytest.mark.parametrize("failures", [1, 2])
@pytest.mark.parametrize("lost_reply", [False, True])
@pytest.mark.parametrize("exported", [False, True])
def test_boot_restore_can_retry_from_default_or_copied_pc_folder(
    monkeypatch, tmp_path, status, boot_backup, failures, lost_reply, exported
):
    backup, raw, native = boot_backup
    if exported:
        destination = tmp_path / "copied-backup"
        shutil.copytree(backup.parent, destination)
        backup = destination / backup.name
    state = tmp_path / ("new-pc" if exported else "old-pc")
    counter = 0
    tokens = iter(["c" * 32, "d" * 32, "e" * 32])
    monkeypatch.setattr(home_control.secrets, "token_hex", lambda size: next(tokens))
    monkeypatch.setattr(home, "read_status", lambda *args: copy.deepcopy(native))

    def run(session, files, entrypoint, args):
        nonlocal counter
        request = json.loads(files["request.json"])
        control = native["watcher"]["control"]
        assert request["restore_boot_transaction"] == control["transaction"]
        assert request["transaction"] != control["transaction"]
        receipt = backup.parent / "transactions" / f"{request['transaction']}.json"
        assert json.loads(receipt.read_text())["state"] == "pending"
        control.update(mode="hold", transaction=request["transaction"])
        counter += 1
        if counter <= failures:
            # The writer changed Home, then failed before restoring autostart.
            native["home"]["main_operation"] = copy.deepcopy(status["home"]["main_operation"])
            if lost_reply:
                raise OSError("restore response lost")
            return native_result("restore", success=False)
        native.clear()
        native.update(copy.deepcopy(status))
        return native_result("restore")

    monkeypatch.setattr(sdk, "run", run)
    for _ in range(failures):
        with pytest.raises((home.HomeError, OSError)):
            home_control.change(object(), {}, "restore", backup=backup, state_dir=state)
        assert native["watcher"]["control"]["mode"] == "hold"
    result = home_control.change(object(), {}, "restore", backup=backup, state_dir=state)
    assert result["success"] and Path(result["receipt"]).parent == backup.parent / "transactions"
    assert counter == failures + 1 and backup.read_bytes() == raw
    assert len(list((backup.parent / "transactions").glob("*.json"))) == failures + 2
    if exported:
        assert not state.exists(), "A copied bundle must not need the original PC configuration directory"


@pytest.mark.parametrize(
    "corruption",
    [
        "cycle",
        "wrong_token",
        "wrong_hash",
        "wrong_raw",
        "missing_parent",
        "not_boot",
        "unknown_action",
        "oversized",
        "boolean_schema",
        "traversal",
        "native_restore",
        "restore_boot_flag",
        "restore_art_flag",
    ],
)
def test_boot_recovery_rejects_invalid_receipt_chains(monkeypatch, tmp_path, boot_backup, corruption):
    backup, raw, native = boot_backup
    transactions = backup.parent / "transactions"
    apply_token, restore_token = "b" * 32, "c" * 32
    root = json.loads((transactions / f"{apply_token}.json").read_text())
    request = {
        **root["request"],
        "action": "restore",
        "transaction": restore_token,
        "restore_boot_transaction": apply_token,
    }
    request.pop("boot")
    native["watcher"]["control"].update(mode="hold", transaction=restore_token)
    if corruption == "cycle":
        request["restore_boot_transaction"] = restore_token
    elif corruption == "wrong_token":
        request["transaction"] = "d" * 32
    elif corruption == "wrong_hash":
        root["request"]["baseline_sha256"] = "d" * 64
    elif corruption == "wrong_raw":
        root["request"]["baseline_base64"] = base64.b64encode(b"different baseline").decode()
    elif corruption == "missing_parent":
        request["restore_boot_transaction"] = "d" * 32
    elif corruption == "not_boot":
        root["request"]["boot"] = False
    elif corruption == "unknown_action":
        request["action"] = "other"
    elif corruption == "boolean_schema":
        request["schema_version"] = True
    elif corruption == "traversal":
        request["restore_boot_transaction"] = "../outside"
    elif corruption == "native_restore":
        native["watcher"]["control"]["mode"] = "native"
    elif corruption == "restore_boot_flag":
        request["boot"] = True
    elif corruption == "restore_art_flag":
        request["art_return"] = True
    home_control._write_receipt(transactions / f"{apply_token}.json", root)
    home_control._write_receipt(transactions / f"{restore_token}.json", {"request": request})
    if corruption == "oversized":
        (transactions / f"{restore_token}.json").write_bytes(b" " * (home_control.MAX_RECEIPT_BYTES + 1))
    monkeypatch.setattr(home, "read_status", lambda *args: native)
    monkeypatch.setattr(
        sdk, "run", lambda *args: pytest.fail("Invalid recovery proof must not reach the writer")
    )
    with pytest.raises(home.HomeError, match="matching boot receipt"):
        home_control.change(object(), {}, "restore", backup=backup, state_dir=tmp_path)
    assert backup.read_bytes() == raw


def test_boot_recovery_chain_is_bounded(monkeypatch, boot_backup):
    backup, raw, native = boot_backup
    transactions = backup.parent / "transactions"
    root = json.loads((transactions / ("b" * 32 + ".json")).read_text())
    request = {
        **root["request"],
        "action": "restore",
        "transaction": "c" * 32,
        "restore_boot_transaction": "b" * 32,
    }
    request.pop("boot")
    home_control._write_receipt(transactions / ("c" * 32 + ".json"), {"request": request})
    native["watcher"]["control"].update(mode="hold", transaction="c" * 32)
    monkeypatch.setattr(home_control, "MAX_RECOVERY_CHAIN", 1)
    assert (
        home_control._boot_restore_transaction(native, backup, raw, root["request"]["baseline_sha256"])
        is None
    )


def absent_status(status):
    result = copy.deepcopy(status)
    result["launcher"] = {"installed": False, "error": None}
    result["watcher"] = {"reachable": False, "state": "unknown"}
    return result


@pytest.mark.parametrize("exported", [False, True])
@pytest.mark.parametrize("lost_reply", [False, True])
def test_uninstalled_boot_restore_retries_with_pc_evidence(
    monkeypatch, tmp_path, status, boot_backup, exported, lost_reply
):
    backup, raw, applied = boot_backup
    if exported:
        destination = tmp_path / "copied-backup"
        shutil.copytree(backup.parent, destination)
        backup = destination / backup.name
    current = absent_status(applied)
    original = absent_status(status)
    monkeypatch.setattr(home, "read_status", lambda *args: copy.deepcopy(current))
    attempts = 0

    def run(session, files, entrypoint, args):
        nonlocal attempts
        request = json.loads(files["request.json"])
        assert request["launcher_absent"] is True
        assert "restore_boot_transaction" not in request
        assert base64.b64decode(request["recovery_apply"]["baseline_base64"]) == raw
        assert request["recovery_apply"]["boot"] is True
        receipt = backup.parent / "transactions" / f"{request['transaction']}.json"
        assert json.loads(receipt.read_text())["state"] == "pending"
        attempts += 1
        if attempts == 1:
            current["home"]["main_operation"] = copy.deepcopy(status["home"]["main_operation"])
            if lost_reply:
                raise OSError("reply lost after uninstall")
            return native_result("restore", success=False)
        current.clear()
        current.update(copy.deepcopy(original))
        return native_result("restore")

    monkeypatch.setattr(sdk, "run", run)
    with pytest.raises((home.HomeError, OSError)):
        home_control.change(object(), {}, "restore", backup=backup, state_dir=tmp_path / "new-pc")
    result = home_control.change(object(), {}, "restore", backup=backup, state_dir=tmp_path / "new-pc")
    assert result["success"] and attempts == 2 and backup.read_bytes() == raw
    assert result["status"]["launcher"]["installed"] is False
    assert not (tmp_path / "new-pc").exists()


@pytest.mark.parametrize("already_original", [False, True])
def test_same_restore_cli_works_without_launcher_or_boot_receipt(
    monkeypatch, tmp_path, status, already_original, capsys
):
    backup = home.save_backup(status, state_dir=tmp_path)["path"]
    original = absent_status(status)
    current = copy.deepcopy(original)
    if not already_original:
        current["home"]["main_operation"]["value"] = home.releases.APP_ID
        current["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    reads = iter([current, original])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))
    monkeypatch.setattr(cli, "require_sdb", lambda host: nullcontext(object()))
    monkeypatch.setattr(home, "device_info", lambda *args, **kwargs: {})
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)

    def run(session, files, entrypoint, args):
        request = json.loads(files["request.json"])
        assert request["launcher_absent"] and "recovery_apply" not in request
        return native_result("restore")

    monkeypatch.setattr(sdk, "run", run)
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "192.0.2.10", "home", "restore", "--yes", "--json"])
    cli.main()
    assert json.loads(capsys.readouterr().out)["success"]
    assert Path(backup).is_file()


@pytest.mark.parametrize(
    "case", ["unknown", "missing", "installed_service_offline", "absent_service_online", "apply_absent"]
)
def test_installation_uncertainty_never_bypasses_service(monkeypatch, tmp_path, status, case):
    home.save_backup(status, state_dir=tmp_path)
    action = "restore"
    if case == "unknown":
        status["launcher"] = {"installed": None, "error": "permission denied"}
    elif case == "missing":
        status.pop("launcher")
    elif case == "installed_service_offline":
        status["watcher"] = {"reachable": False, "state": "unknown"}
    else:
        status["launcher"]["installed"] = False
        if case == "apply_absent":
            action = "apply"
            status["watcher"]["reachable"] = False
    monkeypatch.setattr(home, "read_status", lambda *args: status)
    monkeypatch.setattr(sdk, "run", lambda *args: pytest.fail("No writer allowed"))
    with pytest.raises(home.HomeError):
        home_control.change(object(), {}, action, state_dir=tmp_path)
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("corruption", ["missing", "hash", "raw", "token", "schema", "not_boot", "oversized"])
def test_uninstalled_boot_restore_refuses_invalid_pc_proof(monkeypatch, tmp_path, boot_backup, corruption):
    backup, raw, current = boot_backup
    current = absent_status(current)
    path = backup.parent / "transactions" / ("b" * 32 + ".json")
    receipt = json.loads(path.read_text())
    request = receipt["request"]
    if corruption == "hash":
        request["baseline_sha256"] = "c" * 64
    elif corruption == "raw":
        request["baseline_base64"] = base64.b64encode(b"other original").decode()
    elif corruption == "token":
        request["transaction"] = "c" * 32
    elif corruption == "schema":
        request["schema_version"] = True
    elif corruption == "not_boot":
        request["boot"] = False
    path.write_text(json.dumps(receipt))
    if corruption == "missing":
        path.unlink()
    elif corruption == "oversized":
        path.write_bytes(b" " * (home_control.MAX_RECEIPT_BYTES + 1))
    monkeypatch.setattr(home, "read_status", lambda *args: current)
    monkeypatch.setattr(sdk, "run", lambda *args: pytest.fail("No writer allowed"))
    with pytest.raises(home.HomeError, match="matching boot receipt"):
        home_control.change(object(), {}, "restore", backup=backup, state_dir=tmp_path)
    assert backup.read_bytes() == raw


def test_uninstalled_receipt_scan_is_bounded(monkeypatch, boot_backup):
    backup, raw, current = boot_backup
    monkeypatch.setattr(home_control, "MAX_RECOVERY_RECEIPTS", 0)
    with pytest.raises(home.HomeError, match="Too many recovery receipts"):
        home_control._uninstalled_boot_request(backup, raw, current["watcher"]["control"]["baseline_sha256"])


def test_reinstallation_during_restore_cannot_claim_verified_success(monkeypatch, status, tmp_path):
    home.save_backup(status, state_dir=tmp_path)
    reads = iter([absent_status(status), status])
    monkeypatch.setattr(home, "read_status", lambda *args: next(reads))
    monkeypatch.setattr(sdk, "run", lambda *args: native_result("restore"))
    with pytest.raises(home.HomeError, match="final Home/watcher"):
        home_control.change(object(), {}, "restore", state_dir=tmp_path)
    receipt = json.loads(next(tmp_path.rglob("transactions/*.json")).read_text())
    assert receipt["state"] == "restored" and "error" in receipt


@pytest.fixture
def launcher_startup(monkeypatch, status, tmp_path):
    backup = Path(home.save_backup(status, state_dir=tmp_path)["path"])
    raw = backup.read_bytes()
    offline = copy.deepcopy(status)
    offline["watcher"] = {"reachable": False, "state": "unknown"}
    final = copy.deepcopy(status)
    final["home"]["main_operation"]["value"] = home.releases.APP_ID
    final["home"]["settings"][home.HOME_KEY]["value"] = home.releases.APP_ID
    for key in home.STARTUP_KEYS:
        final["home"]["settings"][key]["value"] = home.releases.APP_ID
    final["home"]["settings"][home.AUTOSTART_KEY]["value"] = 1
    final["watcher"]["control"]["mode"] = "native"
    session = SimpleNamespace(host="192.0.2.10", shell_bounded=Mock(return_value=""))
    query = Mock(side_effect=[offline, status, final])
    launch = Mock(return_value=(True, "HTTP 200 true"))

    def write(connection, files, entrypoint, args):
        assert connection is session
        request = json.loads(files["request.json"])
        assert base64.b64decode(request["baseline_base64"]) == raw
        assert json.loads(next(tmp_path.rglob("transactions/*.json")).read_text())["state"] == "pending"
        return native_result("apply")

    writer = Mock(side_effect=write)
    now = [0.0]
    clock = SimpleNamespace(
        monotonic=lambda: now[0],
        sleep=lambda seconds: now.__setitem__(0, now[0] + seconds),
    )
    monkeypatch.setattr(home, "read_status", query)
    monkeypatch.setattr(remote, "rest_launch", launch)
    monkeypatch.setattr(sdk, "run", writer)
    monkeypatch.setattr(home_control, "time", clock)
    return SimpleNamespace(
        backup=backup,
        raw=raw,
        offline=offline,
        ready=status,
        final=final,
        session=session,
        query=query,
        launch=launch,
        writer=writer,
        now=now,
    )


def test_apply_starts_launcher_once_and_waits_before_journaling(launcher_startup, tmp_path, capsys):
    h = launcher_startup

    def delayed_ready(*args):
        if h.query.call_count <= 3:
            assert not list(tmp_path.rglob("transactions/*.json"))
            h.writer.assert_not_called()
            return h.offline
        return h.ready if h.query.call_count == 4 else h.final

    h.query.side_effect = delayed_ready
    result = home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    assert result["success"] and result["status"] == h.final
    h.launch.assert_called_once_with(h.session.host, home.releases.APP_ID)
    h.session.shell_bounded.assert_not_called()
    h.writer.assert_called_once()
    assert h.backup.read_bytes() == h.raw
    captured = capsys.readouterr()
    assert not captured.out and "Starting AeroTizen" in captured.err


def test_apply_uses_owned_sdk_connection_if_http_launch_is_unavailable(launcher_startup, tmp_path):
    h = launcher_startup
    h.launch.return_value = (False, "HTTP API unavailable")
    assert home_control.change(h.session, {}, "apply", state_dir=tmp_path)["success"]
    h.launch.assert_called_once()
    h.session.shell_bounded.assert_called_once_with(
        f"0 was_execute {home.releases.APP_ID}", timeout=home_control.LAUNCH_TIMEOUT, max_output=8192
    )


def test_apply_service_timeout_never_writes_even_when_launch_was_accepted(launcher_startup, tmp_path):
    h = launcher_startup
    h.query.side_effect = lambda *args: h.offline
    with pytest.raises(home.HomeError, match="did not become ready") as raised:
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    assert "aerotizen launch DclHome001.Home" in str(raised.value)
    assert "No Home settings were changed" in str(raised.value)
    assert h.now[0] == home_control.SERVICE_START_TIMEOUT
    h.launch.assert_called_once()
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


def test_apply_launch_transport_failure_never_writes(launcher_startup, tmp_path):
    h = launcher_startup
    h.launch.return_value = (False, "connection refused")
    h.session.shell_bounded.side_effect = SdbError("SDK launch failed")
    with pytest.raises(home.HomeError, match="TV could not start AeroTizen"):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    assert h.query.call_count == 1
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


def test_apply_refuses_a_ready_response_that_arrives_after_startup_timeout(launcher_startup, tmp_path):
    h = launcher_startup

    def late_response(*args):
        if h.query.call_count == 1:
            return h.offline
        h.now[0] = home_control.SERVICE_START_TIMEOUT + 1
        return h.ready

    h.query.side_effect = late_response
    with pytest.raises(home.HomeError, match="did not become ready"):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("missing", [False, True])
def test_apply_refuses_invalid_backup_before_launcher_start(launcher_startup, tmp_path, missing):
    h = launcher_startup
    if missing:
        h.backup.unlink()
    else:
        h.backup.write_text("{}")
    with pytest.raises(home.HomeError):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    h.launch.assert_not_called()
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("after_start", [False, True])
@pytest.mark.parametrize(
    "field,value",
    [
        ("protocol", 2),
        ("protocol", True),
        ("app_id", "other.app"),
        ("persistent", False),
        ("mode", "blocked"),
    ],
)
def test_apply_rejects_incompatible_service_before_writer(
    launcher_startup, tmp_path, after_start, field, value
):
    h = launcher_startup
    incompatible = copy.deepcopy(h.ready)
    incompatible["watcher"]["control"][field] = value
    h.query.side_effect = [h.offline, incompatible] if after_start else [incompatible]
    with pytest.raises(home.HomeError, match="service is incompatible"):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    assert h.launch.call_count == int(after_start)
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("missing_control", [False, True])
def test_apply_rejects_malformed_service_response(launcher_startup, tmp_path, missing_control):
    h = launcher_startup
    malformed = copy.deepcopy(h.ready)
    if missing_control:
        malformed["watcher"].pop("control")
    else:
        malformed["watcher"]["error"] = {"code": "http_error"}
    h.query.side_effect = [h.offline, malformed]
    with pytest.raises(home.HomeError, match="service is incompatible"):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("after_start", [False, True])
@pytest.mark.parametrize(
    "case", ["identity", "firmware", "incomplete", "uninstalled", "installation_unknown", "unverified_sdk"]
)
def test_apply_rechecks_preflight_before_and_after_launcher_start(
    launcher_startup, tmp_path, after_start, case
):
    h = launcher_startup
    invalid = copy.deepcopy(h.ready)
    if case == "identity":
        invalid["device"]["identity_sha256"] = "b" * 64
    elif case == "firmware":
        invalid["device"]["firmware_build"] = "different"
    elif case == "incomplete":
        invalid["complete"] = False
    elif case == "unverified_sdk":
        invalid["evidence"]["authenticated"] = False
    else:
        invalid["launcher"]["installed"] = False if case == "uninstalled" else None
    h.query.side_effect = [h.offline, invalid] if after_start else [invalid]
    with pytest.raises(home.HomeError):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    assert h.launch.call_count == int(after_start)
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("failure", [home.HomeError("SDK query failed"), KeyboardInterrupt()])
def test_apply_query_failure_or_interrupt_never_writes(launcher_startup, tmp_path, failure):
    h = launcher_startup
    h.query.side_effect = [h.offline, failure]
    with pytest.raises(type(failure)):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    h.writer.assert_not_called()
    assert h.backup.read_bytes() == h.raw
    assert not list(tmp_path.rglob("transactions/*.json"))


def test_apply_refuses_a_backup_changed_during_launcher_start(launcher_startup, tmp_path):
    h = launcher_startup

    def launch(*args):
        h.backup.write_bytes(h.raw + b"\n")
        return True, "accepted"

    h.launch.side_effect = launch
    with pytest.raises(home.HomeError, match="backup changed during startup"):
        home_control.change(h.session, {}, "apply", state_dir=tmp_path)
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("action", ["apply", "restore"])
def test_ready_service_needs_no_launcher_start(launcher_startup, tmp_path, action):
    h = launcher_startup
    h.query.side_effect = [h.ready, h.final if action == "apply" else h.ready]
    if action == "restore":
        h.writer.side_effect = lambda *args: native_result("restore")
    assert home_control.change(h.session, {}, action, state_dir=tmp_path)["success"]
    h.launch.assert_not_called()
    h.session.shell_bounded.assert_not_called()


def test_restore_does_not_automatically_launch(launcher_startup, tmp_path):
    h = launcher_startup
    with pytest.raises(home.HomeError, match="service is unavailable"):
        home_control.change(h.session, {}, "restore", state_dir=tmp_path)
    h.launch.assert_not_called()
    h.writer.assert_not_called()
    assert not list(tmp_path.rglob("transactions/*.json"))


@pytest.mark.parametrize("command", ["apply", "status", "backup"])
def test_cli_startup_keeps_json_output_valid_and_read_only_commands_passive(
    launcher_startup, monkeypatch, tmp_path, capsys, command
):
    h = launcher_startup
    monkeypatch.setattr(cli, "require_sdb", lambda host: nullcontext(h.session))
    monkeypatch.setattr(home, "device_info", lambda *args, **kwargs: {})
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    args = ["aerotizen", "--tv", h.session.host, "home", command, "--json"]
    if command == "apply":
        args.append("--yes")
    monkeypatch.setattr("sys.argv", args)
    cli.main()
    captured = capsys.readouterr()
    result = json.loads(captured.out)
    if command == "apply":
        assert result["success"] and "Starting AeroTizen" in captured.err
    else:
        assert result["watcher"]["reachable"] is False and not captured.err
        h.launch.assert_not_called()
        h.writer.assert_not_called()
