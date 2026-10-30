"""Root lifecycle: durable setup, lost replies, restart verification and recovery removal."""

import base64
import copy
import json
import uuid
from contextlib import contextmanager
from types import SimpleNamespace
from unittest.mock import Mock

import pytest

from aerotizen import cli, root_package, root_state
from aerotizen import root_control as control
from aerotizen.device import DeviceSessionError


@pytest.fixture
def rig(tmp_path, monkeypatch):
    host = "192.0.2.20"
    path = root_state.receipt_path(host, tmp_path)
    managed = {name: ("compiled fixture " + name).encode() for name in root_package.MANAGED}
    state = {
        "host": host,
        "developer": "192.0.2.10",
        "boot": str(uuid.uuid4()),
        "installed": False,
        "automatic": False,
        "live": False,
        "origin": "setup",
        "root_calls": [],
        "removed_apps": [],
        "home": {"assignment": "original", "startup": "original"},
        "fail": None,
        "others": "a" * 64,
    }

    class Session:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        @contextmanager
        def ownership(self):
            yield self

        def duid(self):
            return "fixture-duid"

        def install_native(self, data, name):
            saved = root_state.load(path)
            assert saved["phase"] == "prepared"
            assert saved["original_registration"] is None
            assert saved["public_config"]["installation_id"] == saved["installation_id"]
            state["installed"] = True
            state["installation"] = saved["installation_id"]
            return "install completed"

        def uninstall(self, app):
            state["removed_apps"].append(app)
            state["installed"] = False
            return "ok"

    class Bridge:
        def __init__(self, *args, **kwargs):
            pass

        def request(self, operation="status"):
            if not state["live"]:
                raise OSError("bridge not running")
            if operation == "remove":
                state["live"] = False
                return {"prepared_for_removal": True}
            return {
                "boot_id": state["boot"],
                "automatic_startup_enabled": state["automatic"],
                "origin": state["origin"],
                "bootstrap_completed": True,
                "helper_installed": state["installed"],
            }

    def status(*args):
        return {
            "complete": True,
            "device": {"identity_sha256": "b" * 64},
            "home": copy.deepcopy(state["home"]),
            "boot": {"id": state["boot"]},
        }

    def result(prefix, value):
        return {"stdout": prefix + json.dumps(value) + "\n", "exit_code": 0, "staging_cleaned": True}

    def sdk_run(session, files, entrypoint, args=(), **kwargs):
        mode = args[0]
        if mode == "--preflight":
            return result(
                "AEROTIZEN_ROOT_PREFLIGHT=",
                {
                    "schema_version": 1,
                    "runtime": "6.0.9",
                    "boot_id": state["boot"],
                    "database_uid": 301,
                    "database_gid": 301,
                },
            )
        if mode == "--registry":
            row = (
                [
                    root_state.APP_ID,
                    root_state.APP_ID,
                    "dotnet",
                    "svcapp",
                    "true" if state["automatic"] else "false",
                    "false",
                    f"/opt/usr/apps/{root_state.APP_ID}/bin/AeroTizenRootHelper.dll",
                ]
                if state["installed"]
                else None
            )
            return result(
                "AEROTIZEN_ROOT_REGISTRY=",
                {
                    "row": row,
                    "installation_id": state.get("installation"),
                    "other_rows_sha256": state["others"],
                },
            )
        if mode == "--clean-upload":
            return result("AEROTIZEN_ROOT_UPLOAD=", {"removed": True})
        assert mode == "--bootstrap"
        request = json.loads(files["setup-request.json"])
        manifest = json.loads(base64.b64decode(request["files"]["probe.json"]))
        saved = root_state.load(path)
        assert saved["attempts"][-1]["nonce"] == manifest["nonce"]
        assert saved["phase"] in ("root_requested", "removing")
        operation = manifest["service"]["operation"]
        state["root_calls"].append((operation, manifest["nonce"]))
        if state["fail"] == "before":
            state["fail"] = None
            raise OSError("lost before root")
        if operation == "install":
            state["automatic"] = state["live"] = True
        if state["fail"] == "after":
            state["fail"] = None
            raise OSError("completion reply lost")
        return result(
            "AEROTIZEN_ROOT_BOOTSTRAP=",
            {
                "passed": True,
                "protected_proof_verified": True,
                "staging_cleaned": True,
                "system_files_unchanged": True,
                "same_boot": True,
                "nonce": manifest["nonce"],
                "bridge_ready": operation == "install",
                "cleanup_verified": operation == "remove",
            },
        )

    def package(output, receipt, *args):
        output.write_bytes(b"signed helper fixture")
        return root_package.public_config(receipt, managed)

    certificates = tmp_path / "certs/fixture-duid"
    certificates.mkdir(parents=True)
    (certificates / "distributor.p12").write_bytes(b"fixture")
    monkeypatch.setattr(control, "DeviceSession", Session)
    monkeypatch.setattr(control, "BridgeClient", Bridge)
    monkeypatch.setattr(
        control, "_info", lambda host: {"developerIP": state["developer"], "developerMode": "1"}
    )
    monkeypatch.setattr(control, "_source", lambda info: info["developerIP"])
    monkeypatch.setattr(control.home, "read_status", status)
    monkeypatch.setattr(control.sdk, "run", sdk_run)
    monkeypatch.setattr(
        control.root_transfer,
        "run",
        lambda session, files, payload, pfx, pin: sdk_run(
            session, {"setup-request.json": payload}, "AeroTizenRootBridge.dll", ("--bootstrap",)
        ),
    )
    monkeypatch.setattr(root_package, "runtime_files", lambda path=None: (managed, b"xml", b"icon"))
    monkeypatch.setattr(
        root_package,
        "upstream_payloads",
        lambda *args, **kwargs: {name: b"payload" for name in root_package.UPSTREAM},
    )
    monkeypatch.setattr(root_package, "package_helper", package)
    return (
        state,
        path,
        lambda: control.setup(host, state_dir=tmp_path),
        lambda: control.remove(host, state_dir=tmp_path),
    )


def test_setup_requires_a_new_automatic_boot_before_completion(rig):
    state, path, setup, _ = rig
    first = setup()
    assert first["phase"] == "waiting_boot" and first["setup_complete"] is False
    assert len(state["root_calls"]) == 1
    assert setup()["setup_complete"] is False
    state["boot"], state["origin"], state["developer"] = str(uuid.uuid4()), "boot", "127.0.0.1"
    complete = setup()
    assert complete["setup_complete"] is True
    assert root_state.load(path)["phase"] == "active"
    assert len(state["root_calls"]) == 1
    assert state["home"] == {"assignment": "original", "startup": "original"}


def test_manual_setup_root_on_a_new_boot_is_not_automatic_boot_evidence(rig):
    state, _, setup, _ = rig
    setup()
    state["boot"] = str(uuid.uuid4())
    assert setup()["setup_complete"] is False


def test_saved_receipt_does_not_claim_a_live_installation(rig):
    state, path, setup, _ = rig
    setup()
    state["live"] = False
    checked = control.status(state["host"], receipt_path=path)
    assert checked["installed"] is None
    assert checked["root_available"] is False


@pytest.mark.parametrize("recovers", [False, True])
def test_status_wait_uses_latest_attempt_and_cli_exit(rig, tmp_path, monkeypatch, capsys, recovers):
    state, _, setup, _ = rig
    setup()
    reply = {
        "boot_id": str(uuid.uuid4()),
        "automatic_startup_enabled": True,
        "origin": "boot",
        "bootstrap_completed": False,
        "helper_installed": True,
    }
    replies = [{**reply, "startup_error": "cleanup pending"}, OSError("bridge stopped")]
    if recovers:
        replies.append({**reply, "bootstrap_completed": True})
    request = Mock(side_effect=replies)
    monkeypatch.setattr(control, "BridgeClient", lambda *a, **k: SimpleNamespace(request=request))
    now = [0]

    def sleep(seconds):
        now[0] += seconds

    monkeypatch.setattr(control, "time", SimpleNamespace(monotonic=lambda: now[0], sleep=sleep))
    monkeypatch.setattr(cli, "STATE_DIR", str(tmp_path))
    monkeypatch.setattr(
        "sys.argv",
        ["aerotizen", "--tv", state["host"], "root", "status", "--wait", "4" if recovers else "2", "--json"],
    )
    if recovers:
        cli.main()
    else:
        with pytest.raises(SystemExit) as stopped:
            cli.main()
        assert stopped.value.code == 1
    checked = json.loads(capsys.readouterr().out)
    assert request.call_count == len(replies)
    assert checked["root_available"] is recovers
    assert "startup_error" not in checked
    if recovers:
        assert checked["bootstrap_completed"] is True
        assert "error" not in checked
    else:
        assert checked["installed"] is None
        assert checked["error"] == "bridge stopped"
        assert (
            not {
                "current_boot_id",
                "automatic_startup_enabled",
                "automatic_boot_verified",
                "bootstrap_completed",
            }
            & checked.keys()
        )


def test_lost_request_can_retry_with_a_fresh_nonce(rig):
    state, path, setup, _ = rig
    state["fail"] = "before"
    with pytest.raises(OSError):
        setup()
    assert root_state.load(path)["phase"] == "root_requested"
    assert setup()["phase"] == "waiting_boot"
    assert len(state["root_calls"]) == 2 and state["root_calls"][0][1] != state["root_calls"][1][1]


def test_lost_completion_reply_is_recovered_without_another_root_attempt(rig):
    state, _, setup, _ = rig
    state["fail"] = "after"
    with pytest.raises(OSError):
        setup()
    assert setup()["phase"] == "waiting_boot"
    assert len(state["root_calls"]) == 1


def test_remove_disables_bridge_then_resumes_after_normal_pc_recovery(rig):
    state, path, setup, remove = rig
    setup()
    state["developer"] = "127.0.0.1"
    pending = remove()
    assert pending["removed"] is False and root_state.load(path)["private_state_removed"] is True
    assert state["removed_apps"] == []
    state["developer"] = "192.0.2.10"
    assert remove()["removed"] is True
    assert state["removed_apps"] == [root_state.APP_ID]
    assert remove()["removed"] is True
    assert len(state["root_calls"]) == 1


@pytest.mark.parametrize("private_removed", [False, True])
def test_setup_cannot_interrupt_removal_and_can_start_after_it_finishes(rig, monkeypatch, private_removed):
    state, path, setup, remove = rig
    setup()
    state["developer"] = "127.0.0.1"
    state["live"] = private_removed
    assert remove()["removed"] is False
    before = path.read_bytes()
    previous_state = copy.deepcopy(state)
    with monkeypatch.context() as guard:
        guard.setattr(
            root_package, "runtime_files", lambda *a: pytest.fail("setup prepared files during removal")
        )
        with pytest.raises(DeviceSessionError, match="root remove --yes"):
            setup()
    assert path.read_bytes() == before
    assert state == previous_state
    state["developer"], state["boot"] = "192.0.2.10", str(uuid.uuid4())
    assert remove()["removed"] is True
    assert state["live"] is False and state["installed"] is False
    removed = root_state.load(path)
    assert setup()["phase"] == "waiting_boot"
    fresh = root_state.load(path)
    assert fresh["installation_id"] != removed["installation_id"]
    assert not fresh.get("private_state_removed")
    assert root_state.load(path.parent / "history" / (removed["installation_id"] + ".json")) == removed


def test_stopped_bridge_cleanup_works_after_helper_was_uninstalled(rig):
    state, _, setup, remove = rig
    setup()
    state["live"] = state["installed"] = False
    assert remove()["removed"] is True
    assert state["removed_apps"] == []
    assert [item[0] for item in state["root_calls"]] == ["install", "remove"]


def test_foreign_helper_is_not_uninstalled(rig):
    state, _, setup, remove = rig
    setup()
    state["live"] = False
    state["installation"] = uuid.uuid4().hex
    with pytest.raises(DeviceSessionError, match="different helper"):
        remove()
    assert state["removed_apps"] == []


@pytest.mark.parametrize("operation", ["setup", "remove"])
def test_cli_mutation_is_preview_only_by_default(tmp_path, monkeypatch, capsys, operation):
    monkeypatch.setattr(cli, "STATE_DIR", str(tmp_path))
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "192.0.2.20", "root", operation, "--json"])
    monkeypatch.setattr(control, "setup", lambda *a, **k: pytest.fail("preview wrote TV"))
    monkeypatch.setattr(control, "remove", lambda *a, **k: pytest.fail("preview wrote TV"))
    cli.main()
    assert json.loads(capsys.readouterr().out)["preview"] is True
    assert not (tmp_path / "root").exists()
