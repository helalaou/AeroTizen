"""Managed transport keeps TV ownership and never bypasses a failed pairing."""

import hashlib

import pytest

from aerotizen import device, root_bridge, root_state
from aerotizen.device import DeviceSession, DeviceSessionError


@pytest.mark.parametrize("wrong_device", [False, True])
def test_bridge_route_holds_device_lock_and_checks_sdb_identity(tmp_path, monkeypatch, wrong_device):
    record = {"phase": "active", "duid_sha256": hashlib.sha256(b"expected-device").hexdigest()}
    monkeypatch.setattr(root_state, "find", lambda host: record)
    monkeypatch.setattr(device.remote, "info", lambda host: {"developerIP": "127.0.0.1"})
    monkeypatch.setattr(device, "Sdb", lambda *a, **k: pytest.fail("paired session fell back to direct SDB"))
    clients = []

    class Bridge:
        def __init__(self, host, receipt, **kwargs):
            self.receipt = receipt
            self.closed = False
            clients.append(self)

        def connect(self):
            return self

        def close(self):
            self.closed = True

        def duid(self):
            return "other-device" if wrong_device else "expected-device"

    monkeypatch.setattr(root_bridge, "BridgeSdb", Bridge)
    session = DeviceSession("192.0.2.20", lock_dir=tmp_path)
    if wrong_device:
        with pytest.raises(DeviceSessionError, match="different TV"):
            session.connect()
        assert clients[0].closed
        assert session._lock_file is None
    else:
        with session:
            assert session.managed_root is True
            with pytest.raises(DeviceSessionError, match="Another AeroTizen"):
                DeviceSession("192.0.2.20", lock_dir=tmp_path).connect()
            with pytest.raises(DeviceSessionError, match="direct SDB"):
                session.root(None)
        assert clients[0].closed


def test_bad_saved_pairing_never_tries_an_unpaired_connection(tmp_path, monkeypatch):
    def invalid(host):
        raise ValueError("invalid receipt")

    monkeypatch.setattr(root_state, "find", invalid)
    monkeypatch.setattr(device, "Sdb", lambda *a, **k: pytest.fail("invalid pairing was bypassed"))
    with pytest.raises(DeviceSessionError, match="pairing is invalid"):
        DeviceSession("192.0.2.20", lock_dir=tmp_path).connect()


def test_selected_recovery_record_is_used_by_normal_cli_transport(tmp_path):
    from test_root_bridge import receipt_data

    receipt = receipt_data()
    copied = tmp_path / "copied" / "receipt.json"
    root_state.save(copied, receipt)
    root_state.remember(receipt["host"], copied, tmp_path)
    assert root_state.find(receipt["host"], tmp_path) == receipt
    assert root_state.selected_path(receipt["host"], tmp_path) == copied


def test_invalid_saved_location_is_not_treated_as_no_pairing(tmp_path):
    pointer = root_state.receipt_path("192.0.2.20", tmp_path).with_name("selected.json")
    root_state.save(pointer, {"path": "relative.json"})
    with pytest.raises(ValueError, match="absolute"):
        root_state.find("192.0.2.20", tmp_path)
    root_state.save(pointer, {"path": str(tmp_path / "missing.json")})
    with pytest.raises(ValueError, match="missing"):
        root_state.find("192.0.2.20", tmp_path)
    assert root_state.find("tv-hostname", tmp_path) is None


def test_removed_record_is_archived_before_new_setup(tmp_path):
    from test_root_bridge import receipt_data

    receipt = receipt_data()
    receipt["phase"] = "removed"
    root_state.archive_removed(tmp_path / "receipt.json", receipt)
    saved = tmp_path / "history" / (receipt["installation_id"] + ".json")
    assert root_state.load(saved) == receipt
    root_state.archive_removed(tmp_path / "receipt.json", receipt)
