import argparse
import http.server
import json
import threading

import pytest
import websocket

from aerotizen import cli, remote

APP = "DclHome001.Home"


class _RestTV(http.server.BaseHTTPRequestHandler):
    """POST /api/v2/applications/<id> the way the TV answers it."""

    def do_POST(self):
        known = self.path == f"/api/v2/applications/{APP}"
        body = b"true" if known else b'{"code":404,"message":"Not found error.","status":404}'
        self.send_response(200 if known else 404)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass


@pytest.fixture
def rest_tv():
    server = http.server.HTTPServer(("127.0.0.1", 0), _RestTV)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    yield server.server_address[1]
    server.shutdown()
    server.server_close()


@pytest.fixture
def fast_clock(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(cli.time, "monotonic", lambda: now[0])
    monkeypatch.setattr(cli.time, "sleep", lambda seconds: now.__setitem__(0, now[0] + seconds))


class FakeRemote:
    """Stands in for remote.Remote; `reply` is what the remote channel answers (None: silence)."""

    def __init__(self, reply):
        self.reply, self.launched = reply, []

    def __call__(self, host):
        return self

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        pass

    def launch(self, app_id):
        self.launched.append(app_id)
        return self.reply


def launch_args():
    return argparse.Namespace(tv="tv", appid=APP)


def test_rest_launch_reports_whether_the_tv_accepted(rest_tv):
    assert remote.rest_launch("127.0.0.1", APP, port=rest_tv) == (True, "HTTP 200 true")
    accepted, reply = remote.rest_launch("127.0.0.1", "nope.App", port=rest_tv)
    assert not accepted
    assert reply.startswith("HTTP 404")


def test_launch_fails_loudly_when_the_tv_ignores_it(monkeypatch, fast_clock, capsys):
    # What the 2022 Q60B did with the old CLI: a silent remote channel and an app left hidden.
    monkeypatch.setattr(remote, "rest_launch", lambda host, app: (False, "HTTP 404"))
    fake = FakeRemote(None)
    monkeypatch.setattr(remote, "Remote", fake)
    monkeypatch.setattr(remote, "app_status", lambda host, app: {"running": True, "visible": False})
    with pytest.raises(SystemExit) as exc:
        cli.cmd_launch(launch_args())
    assert "did not come to the screen" in str(exc.value)
    assert fake.launched == [APP]
    assert "remote-channel launch: no reply" in capsys.readouterr().out


def test_launch_checks_status_after_remote_connection_failure(monkeypatch, fast_clock, capsys):
    monkeypatch.setattr(remote, "rest_launch", lambda host, app: (False, "connection refused"))

    def refused_remote(host):
        raise RuntimeError("TV refused the remote connection")

    monkeypatch.setattr(remote, "Remote", refused_remote)
    monkeypatch.setattr(remote, "app_status", lambda host, app: {"running": True, "visible": True})
    cli.cmd_launch(launch_args())
    out = capsys.readouterr().out
    assert "remote-channel launch failed: TV refused the remote connection" in out
    assert f"{APP}: running=True visible=True" in out


def test_launch_uses_rest_and_waits_for_the_app_to_show(monkeypatch, fast_clock, capsys):
    replies = iter([{"running": True, "visible": False}] * 2 + [{"running": True, "visible": True}])
    monkeypatch.setattr(remote, "rest_launch", lambda host, app: (True, "HTTP 200 true"))
    monkeypatch.setattr(remote, "Remote", FakeRemote("unused"))
    monkeypatch.setattr(remote, "app_status", lambda host, app: next(replies))
    cli.cmd_launch(launch_args())
    out = capsys.readouterr().out
    assert "remote-channel" not in out
    assert f"{APP}: running=True visible=True" in out


def test_launch_warns_when_an_accepted_app_never_reports_visible(monkeypatch, fast_clock, capsys):
    monkeypatch.setattr(remote, "rest_launch", lambda host, app: (True, "HTTP 200 true"))
    monkeypatch.setattr(remote, "app_status", lambda host, app: {"running": True, "visible": False})
    cli.cmd_launch(launch_args())
    assert "doesn't report the app as on screen" in capsys.readouterr().out


def test_launch_does_not_count_an_error_reply_as_success(monkeypatch, fast_clock):
    monkeypatch.setattr(remote, "rest_launch", lambda host, app: (False, "HTTP 404"))
    monkeypatch.setattr(remote, "Remote", FakeRemote(404))
    monkeypatch.setattr(remote, "app_status", lambda host, app: None)
    with pytest.raises(SystemExit, match="did not confirm"):
        cli.cmd_launch(launch_args())


class FakeSocket:
    def __init__(self, messages):
        self.messages, self.sent, self.timeout = list(messages), [], None

    def send(self, text):
        self.sent.append(json.loads(text))

    def settimeout(self, value):
        self.timeout = value

    def recv(self):
        if not self.messages:
            raise websocket.WebSocketTimeoutException("timed out")
        return self.messages.pop(0)


def test_remote_launch_waits_for_the_tvs_launch_reply():
    r = remote.Remote("tv", timeout=30)
    r.ws = FakeSocket(
        ['{"event": "ms.channel.clientConnect"}', "not json", '{"event": "ed.apps.launch", "data": 200}']
    )
    assert r.launch(APP) == 200
    assert r.ws.sent[0]["params"]["data"] == {"appId": APP, "action_type": "DEEP_LINK"}
    assert r.ws.timeout == 30, "the socket timeout is restored"
    r.ws = FakeSocket([])
    assert r.launch(APP, wait=0.2) is None
