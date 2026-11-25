"""Uninstalling apps without a physical TV: the TV expects app IDs, not package IDs."""

import json
from pathlib import Path

import pytest

from aerotizen import cli, home, releases

LAUNCHER = f"app_id={releases.APP_ID} app_title=AeroTizen"
OTHER = "app_id=Abcdefghij.Player app_title=Player"


@pytest.fixture
def tv(monkeypatch, tmp_path):
    class TV:
        def __init__(self):
            self.installed = [LAUNCHER, OTHER]
            self.removed = []
            self.home_queries = 0
            self.home_error = None
            self.home_status = {
                "complete": True,
                "queried_at": "2026-11-25T12:00:00+00:00",
                "device": {
                    "identity_sha256": "a" * 64,
                    "model": "TEST-TV",
                    "firmware_build": "T-TEST-001",
                    "cpu_arch": "armv7",
                    "os_version": "9.0.0",
                },
                "evidence": {
                    "access": "sdk_uid_901",
                    "uid": 901,
                    "authenticated": True,
                    "sdk_staging_cleaned": True,
                    "query_staging_cleaned": True,
                    "helper_sha256": "b" * 64,
                },
                "home": {
                    "main_operation": {"type": "string", "status": "ok", "value": "com.samsung.tv.csfs"},
                    "settings": {
                        key: {
                            "type": kind,
                            "status": "ok",
                            "value": 0 if kind == "int" else "com.samsung.tv.csfs",
                        }
                        for key, kind in home.SETTINGS.items()
                    },
                },
            }

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            pass

        def close(self):
            pass

        def applist(self):
            return "\n".join(self.installed)

        def uninstall(self, app_id):
            self.removed.append(app_id)
            self.installed = [line for line in self.installed if f"app_id={app_id} " not in line]
            return f"app_id[{app_id}] uninstall completed"

    fake = TV()

    def read_status(session, provider, info):
        assert session is fake and provider is None
        fake.home_queries += 1
        if fake.home_error:
            raise fake.home_error
        return fake.home_status

    monkeypatch.setattr(home, "read_status", read_status)
    monkeypatch.setattr(cli, "require_sdb", lambda host: fake)
    monkeypatch.setattr(cli, "snapshot", lambda host, text: "snapshot.txt")
    monkeypatch.setattr(cli, "STATE_DIR", tmp_path)
    return fake


def run(monkeypatch, *arguments):
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "tv", *arguments])
    cli.main()


def test_uninstall_launcher_uses_the_app_id(monkeypatch, tv, capsys):
    run(monkeypatch, "uninstall", "launcher", "--yes")
    assert tv.removed == [releases.APP_ID]
    assert "Uninstalled AeroTizen" in capsys.readouterr().out


def test_uninstall_asks_first_and_mentions_lost_settings(monkeypatch, tv):
    prompts = []
    monkeypatch.setattr("builtins.input", lambda prompt: prompts.append(prompt) or "n")
    run(monkeypatch, "uninstall", "launcher")
    assert tv.removed == []
    assert "settings" in prompts[0]
    assert tv.home_queries == 0


def test_uninstall_reports_missing_apps_and_refusals(monkeypatch, tv):
    with pytest.raises(SystemExit, match="not installed"):
        run(monkeypatch, "uninstall", "Missing.App", "--yes")
    tv.uninstall = lambda app_id: "was get app info failed"
    with pytest.raises(SystemExit, match=r"still installed\. TV said: was get app info failed"):
        run(monkeypatch, "uninstall", "Abcdefghij.Player", "--yes")


def test_uninstall_rejects_unsafe_ids(monkeypatch, tv):
    with pytest.raises(SystemExit, match="application ID"):
        run(monkeypatch, "uninstall", "bad;id", "--yes")


def test_debloat_removes_packages_by_app_id(monkeypatch, tv):
    run(monkeypatch, "debloat", "--remove", "Abcdefghij", "--yes")
    assert tv.removed == ["Abcdefghij.Player"]


@pytest.mark.parametrize(
    "assignment",
    [
        "operation/main",
        "db/appfw/home_appid",
        "db/appfw/startup_appid",
        "db/appfw/booting_appid_backup",
        "db/first_screen/type",
    ],
)
def test_uninstall_names_each_assignment_without_suggesting_restore_when_backup_is_missing(
    monkeypatch, tv, assignment
):
    state = tv.home_status["home"]
    target = state["main_operation"] if assignment == "operation/main" else state["settings"][assignment]
    target["value"] = releases.APP_ID
    with pytest.raises(SystemExit, match=assignment) as error:
        run(monkeypatch, "uninstall", "launcher", "--yes")
    assert "No valid original Home backup" in str(error.value)
    assert "home restore" not in str(error.value)
    assert tv.removed == []


def test_uninstall_names_multiple_assignments_and_suggests_restore_for_a_valid_backup(monkeypatch, tv):
    home.save_backup(tv.home_status, state_dir=cli.STATE_DIR)
    assignments = ("db/appfw/home_appid", "db/appfw/booting_appid_backup")
    for setting in assignments:
        tv.home_status["home"]["settings"][setting]["value"] = releases.APP_ID
    with pytest.raises(SystemExit, match="home restore --yes") as error:
        run(monkeypatch, "uninstall", "launcher", "--yes")
    for setting in assignments:
        assert setting in str(error.value)
    assert tv.removed == []


@pytest.mark.parametrize("problem", ["malformed", "wrong_device", "wrong_firmware"])
def test_uninstall_does_not_suggest_restore_for_an_unusable_backup(monkeypatch, tv, problem):
    path = Path(home.save_backup(tv.home_status, state_dir=cli.STATE_DIR)["path"])
    if problem == "malformed":
        path.write_text("{")
    else:
        backup = json.loads(path.read_text())
        key, value = {
            "wrong_device": ("identity_sha256", "c" * 64),
            "wrong_firmware": ("firmware_build", "T-TEST-002"),
        }[problem]
        backup["device"][key] = value
        path.write_text(json.dumps(backup))
    setting = "db/appfw/booting_appid_backup"
    tv.home_status["home"]["settings"][setting]["value"] = releases.APP_ID
    with pytest.raises(SystemExit, match=setting) as error:
        run(monkeypatch, "uninstall", "launcher", "--yes")
    assert "No valid original Home backup" in str(error.value)
    assert "home restore" not in str(error.value)
    assert tv.removed == []


def test_uninstall_watcher_cannot_remove_the_active_home_package(monkeypatch, tv):
    tv.installed.append("app_id=DclHome001.Watcher app_title=Watcher")
    tv.home_status["home"]["main_operation"]["value"] = releases.APP_ID
    with pytest.raises(SystemExit, match="operation/main"):
        run(monkeypatch, "uninstall", "DclHome001.Watcher", "--yes")
    assert tv.removed == []


def test_uninstall_stops_if_native_home_is_unavailable(monkeypatch, tv):
    tv.home_status["complete"] = False
    with pytest.raises(SystemExit, match="Cannot verify all native Home"):
        run(monkeypatch, "uninstall", "launcher", "--yes")
    assert tv.removed == []
    tv.home_error = home.HomeError("SDK query failed")
    with pytest.raises(SystemExit, match="uninstall stopped: SDK query failed"):
        run(monkeypatch, "uninstall", "launcher", "--yes")
    assert tv.removed == []


def test_uninstall_other_apps_does_not_need_native_home_queries(monkeypatch, tv):
    tv.home_error = home.HomeError("SDK query unavailable")
    run(monkeypatch, "uninstall", "Abcdefghij.Player", "--yes")
    assert tv.removed == ["Abcdefghij.Player"]
    assert tv.home_queries == 0
