"""Early returns and errors release the CLI's device session."""

import argparse
import json
from contextlib import contextmanager

import pytest

from aerotizen import buttons, cli
from aerotizen.sdb import SdbError


def test_apps_json_lists_individual_apps_without_a_snapshot(monkeypatch, capsys):
    class TV:
        def applist(self):
            return "DclHome001.Home\tAeroTizen\norg.tizen.netflix-app\tNetflix\n"

    @contextmanager
    def session(host):
        assert host == "tv"
        yield TV()

    monkeypatch.setattr(cli, "require_sdb", session)
    monkeypatch.setattr(cli, "snapshot", lambda *args: pytest.fail("JSON app listing wrote a snapshot"))
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "tv", "apps", "--json"])
    cli.main()
    assert json.loads(capsys.readouterr().out) == {
        "apps": [
            {"app_id": "DclHome001.Home", "name": "AeroTizen"},
            {"app_id": "org.tizen.netflix-app", "name": "Netflix"},
        ],
    }


def test_button_map_accepts_an_app_id_when_the_inventory_is_unavailable(monkeypatch):
    class TV:
        def applist(self):
            raise SdbError("App list unavailable")

    @contextmanager
    def offline_sdb(*args):
        yield TV()

    monkeypatch.setattr(buttons, "BridgeSdb", offline_sdb)
    assert buttons.resolve_app("test.app", "tv", {}) == "test.app"
    with pytest.raises(SdbError, match="App list unavailable"):
        buttons.resolve_app("Test App", "tv", {})


@pytest.mark.parametrize("answer", ["", "invalid"])
def test_debloat_cancel_or_invalid_input_releases_session(monkeypatch, answer):
    events = []

    class TV:
        def applist(self):
            return ""

    @contextmanager
    def session(host):
        events.append("open")
        try:
            yield TV()
        finally:
            events.append("close")

    monkeypatch.setattr(cli, "require_sdb", session)
    monkeypatch.setattr(cli, "snapshot", lambda *args: "snapshot")
    monkeypatch.setattr("builtins.input", lambda *args: answer)
    args = argparse.Namespace(tv="tv", remove=None, yes=False)
    if answer:
        with pytest.raises(ValueError):
            cli.cmd_debloat(args)
    else:
        cli.cmd_debloat(args)
    assert events == ["open", "close"]
