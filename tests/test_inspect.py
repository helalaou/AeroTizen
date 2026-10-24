"""Inspect command routing and debug-session lifetime without a physical TV."""

from contextlib import nullcontext

import pytest

from aerotizen import cli, inspect_app, releases


@pytest.fixture
def inspector(monkeypatch):
    events = []
    failures = {"stop": None, "forward": KeyboardInterrupt()}

    def stop(request, timeout):
        events.append(("stop", request.full_url, request.method, timeout))
        if failures["stop"]:
            raise failures["stop"]
        return nullcontext()

    class Connection:
        def __init__(self, host, timeout):
            self.host, self.timeout = host, timeout

        def connect(self):
            events.append(("connect", self.host, self.timeout))
            return self

        def __enter__(self):
            return self

        def __exit__(self, *exc):
            events.append(("close",))

        def debug_launch(self, app_id):
            events.append(("debug", app_id))
            return 7011

        def forward(self, local_port, tv_port):
            events.append(("forward", local_port, tv_port))
            raise failures["forward"]

    monkeypatch.setattr(inspect_app.urllib.request, "urlopen", stop)
    monkeypatch.setattr(inspect_app.time, "sleep", lambda delay: events.append(("wait", delay)))
    monkeypatch.setattr(inspect_app, "Sdb", Connection)
    return events, failures


@pytest.mark.parametrize(
    "arguments,host,app_id,port",
    [
        (["inspect", "launcher"], "discovered-tv", releases.APP_ID, 9222),
        (["--tv", "selected-tv", "inspect", "launcher"], "selected-tv", releases.APP_ID, 9222),
        (["inspect", "Example.App", "--port", "9223"], "discovered-tv", "Example.App", 9223),
    ],
)
def test_inspect_restarts_and_forwards_the_selected_app(
    monkeypatch, inspector, capsys, arguments, host, app_id, port
):
    events, _ = inspector
    discoveries = []

    def discover():
        discoveries.append(True)
        return [{"ip": "discovered-tv"}]

    monkeypatch.setattr(cli.discover, "discover", discover)
    monkeypatch.setattr("sys.argv", ["aerotizen", *arguments])
    cli.main()
    assert discoveries == ([] if host == "selected-tv" else [True])
    assert events == [
        ("stop", f"http://{host}:8001/api/v2/applications/{app_id}", "DELETE", 5),
        ("wait", 2),
        ("connect", host, 60),
        ("debug", app_id),
        ("forward", port, 7011),
        ("close",),
    ]
    output = capsys.readouterr().out
    assert f"http://localhost:{port}/json" in output
    assert "Inspector stopped." in output


def test_inspect_can_start_when_the_stop_request_fails(monkeypatch, inspector):
    events, failures = inspector
    failures["stop"] = OSError("app was not running")
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "tv", "inspect", "launcher"])
    cli.main()
    assert ("wait", 2) not in events
    assert ("debug", releases.APP_ID) in events
    assert events[-1] == ("close",)


def test_inspect_reports_forwarding_errors_and_closes_the_session(monkeypatch, inspector):
    events, failures = inspector
    failures["forward"] = OSError("port already in use")
    monkeypatch.setattr("sys.argv", ["aerotizen", "--tv", "tv", "inspect", "launcher"])
    with pytest.raises(SystemExit, match="Inspect failed: port already in use"):
        cli.main()
    assert events[-1] == ("close",)


@pytest.mark.parametrize(
    "arguments,message",
    [
        (["inspect", "bad;command"], "application ID"),
        (["inspect", "launcher", "--port", "0"], "between 1 and 65535"),
        (["inspect", "launcher", "--port", "65536"], "between 1 and 65535"),
    ],
)
def test_inspect_rejects_invalid_arguments_before_discovery(monkeypatch, arguments, message):
    def unexpected_discovery():
        pytest.fail("Invalid arguments must not start TV discovery")

    monkeypatch.setattr(cli.discover, "discover", unexpected_discovery)
    monkeypatch.setattr("sys.argv", ["aerotizen", *arguments])
    with pytest.raises(SystemExit, match=message):
        cli.main()
