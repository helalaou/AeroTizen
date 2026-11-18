from contextlib import nullcontext
from types import SimpleNamespace

import pytest

from aerotizen import buttons


def rename_args(name):
    return SimpleNamespace(button_action="rename", button="Netflix", new_name=name, receipt=None, yes=True)


@pytest.mark.parametrize("name", ["", " ", "a" * 49, "line\nbreak", "bad\ud800"])
def test_invalid_rename_stops_before_contacting_tv(monkeypatch, tmp_path, name):
    monkeypatch.setattr(buttons.root_state, "find", lambda *_: pytest.fail("Invalid name reached TV state"))
    with pytest.raises(ValueError, match="single-line button name"):
        buttons.run(rename_args(name), "192.0.2.20", tmp_path)


def test_older_helper_is_rejected_before_sending_rename(monkeypatch, tmp_path):
    monkeypatch.setattr(buttons.root_state, "find", lambda *_: {"phase": "active"})
    monkeypatch.setattr(buttons, "DeviceSession", lambda *_a, **_k: SimpleNamespace(ownership=nullcontext))
    calls = []

    def request(operation="status", **_kwargs):
        calls.append(operation)
        return {"buttons_protocol": buttons.PROTOCOL, "buttons_friendly_names": True}

    monkeypatch.setattr(buttons, "BridgeClient", lambda *_a, **_k: SimpleNamespace(request=request))
    with pytest.raises(buttons.ButtonAvailabilityError, match="Update the TV helper") as error:
        buttons.run(rename_args("Streaming"), "192.0.2.20", tmp_path)
    assert error.value.code == "helper_update_required"
    assert calls == ["status"]
