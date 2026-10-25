"""Early returns and errors release the CLI's device session."""

import argparse
from contextlib import contextmanager

import pytest

from aerotizen import cli


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
