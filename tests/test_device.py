"""Connection ownership, root handoff, and recovery without a physical TV."""

import os
import subprocess
import sys
from pathlib import Path

import pytest

from aerotizen import device
from aerotizen.device import DeviceSession, DeviceSessionError


@pytest.fixture
def rig(tmp_path, monkeypatch):
    events = []
    failures = {}
    clients = []

    class Client:
        banner = "test TV"

        def __init__(self, host, **kwargs):
            self.closed = True
            clients.append(self)

        def connect(self):
            assert all(client.closed for client in clients if client is not self)
            events.append("connect")
            self.closed = False
            if len(clients) == 2 and "reconnect" in failures:
                raise failures["reconnect"]
            return self

        def close(self):
            self.closed = True
            events.append("close")

        def duid(self):
            assert not self.closed
            return "same-device"

    class Provider:
        def prepare(self):
            events.append("prepare")
            if "prepare" in failures:
                raise failures["prepare"]

        def run(self, host, commands):
            assert host == "127.0.0.1" and commands == ("id",)
            assert all(client.closed for client in clients)
            # The OS lock must remain held while no raw socket is open.
            with pytest.raises(DeviceSessionError, match="Another AeroTizen"):
                DeviceSession(host, lock_dir=tmp_path).connect()
            events.append("root")
            if "root" in failures:
                raise failures["root"]
            return {"uid": 0}

        def disconnect(self, host):
            events.append("disconnect")
            if "disconnect" in failures:
                raise failures["disconnect"]

    monkeypatch.setattr(device, "Sdb", Client)
    return DeviceSession("127.0.0.1", lock_dir=tmp_path), Provider(), events, failures, clients


def test_handoff_holds_ownership_and_restores_direct_access(rig):
    session, provider, events, _, _ = rig
    with session.connect() as connection:
        assert connection.duid() == "same-device"
        assert connection.root(provider, ["id"]) == {"uid": 0}
        assert connection.duid() == "same-device"
    assert events == ["connect", "prepare", "close", "root", "disconnect", "connect", "close"]


@pytest.mark.parametrize("error", [RuntimeError("failed"), KeyboardInterrupt()])
def test_failed_or_interrupted_root_recovers_before_reraising(rig, error):
    session, provider, events, failures, _ = rig
    failures["root"] = error
    with session:
        with pytest.raises(type(error)):
            session.root(provider, ["id"])
        assert session.duid() == "same-device"
        assert events[-2:] == ["disconnect", "connect"]


def test_failed_preparation_keeps_the_original_connection(rig):
    session, provider, events, failures, _ = rig
    failures["prepare"] = RuntimeError("wrong version")
    with session:
        with pytest.raises(RuntimeError, match="wrong version"):
            session.root(provider, ["id"])
        assert session.duid() == "same-device"
        assert events == ["connect", "prepare"]


@pytest.mark.parametrize("phase", ["disconnect", "reconnect"])
def test_failed_recovery_closes_and_releases_ownership(rig, phase, tmp_path):
    session, provider, _, failures, clients = rig
    failures[phase] = RuntimeError("recovery failed")
    session.connect()
    with pytest.raises(DeviceSessionError, match="SDB"):
        session.root(provider, ["id"])
    assert all(client.closed for client in clients)
    with pytest.raises(DeviceSessionError, match="No direct"):
        session.duid()
    with DeviceSession("127.0.0.1", lock_dir=tmp_path) as replacement:
        assert replacement.duid() == "same-device"


def test_process_lock_prevents_a_second_cli_owner(rig, tmp_path):
    session, _, _, _, _ = rig
    program = (
        "from aerotizen.device import DeviceSession, DeviceSessionError\n"
        f"session = DeviceSession('127.0.0.1', lock_dir={str(tmp_path)!r})\n"
        "try:\n session.connect()\n"
        "except DeviceSessionError:\n raise SystemExit(23)\n"
    )
    with session:
        result = subprocess.run(
            [sys.executable, "-c", program],
            env={**os.environ, "PYTHONPATH": str(Path(device.__file__).parents[1])},
            capture_output=True,
            timeout=10,
        )
    assert result.returncode == 23, result.stderr.decode()


def test_session_connects_and_releases_a_real_protocol_connection(fake_tv, tmp_path):
    tv = fake_tv({"0 getduid": "TEST-DUID\n"})
    with DeviceSession("127.0.0.1", port=tv.port, lock_dir=tmp_path).connect() as session:
        assert session.duid() == "TEST-DUID"
        with pytest.raises(DeviceSessionError, match="Another AeroTizen"):
            DeviceSession("127.0.0.1", port=tv.port, lock_dir=tmp_path).connect()


def test_failed_initial_connect_closes_client_and_releases_lock(tmp_path, monkeypatch):
    class Broken:
        closed = False

        def __init__(self, *args, **kwargs):
            pass

        def connect(self):
            raise KeyboardInterrupt()

        def close(self):
            Broken.closed = True

    monkeypatch.setattr(device, "Sdb", Broken)
    session = DeviceSession("127.0.0.1", lock_dir=tmp_path)
    with pytest.raises(KeyboardInterrupt):
        session.connect()
    assert Broken.closed
    assert session._lock_file is None
