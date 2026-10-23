import pytest

from aerotizen.sdb import Sdb, SdbError


def test_handshake_reads_banner(fake_tv):
    tv = fake_tv()
    with Sdb("127.0.0.1", port=tv.port, timeout=5) as client:
        assert client.banner == "device::FAKE-TV::0"
        assert client.max_data == 4096


def test_shell_returns_output(fake_tv):
    tv = fake_tv({"0 getduid": "ABCDEF123\n"})
    with Sdb("127.0.0.1", port=tv.port, timeout=5) as client:
        assert client.duid() == "ABCDEF123"


def test_push_uploads_bytes_in_chunks(fake_tv):
    tv = fake_tv()
    payload = bytes(range(256)) * 600  # > 64 KiB, so several DATA packets
    with Sdb("127.0.0.1", port=tv.port, timeout=5) as client:
        client.push(payload, "/tmp/app.wgt")
    assert tv.uploads["/tmp/app.wgt"] == payload


def test_unreachable_tv_raises_helpful_error():
    client = Sdb("127.0.0.1", port=1, timeout=1)
    try:
        client.connect(attempts=1)
    except SdbError as e:
        assert "Developer Mode" in str(e)
    else:
        raise AssertionError("expected SdbError")


def test_entering_a_connected_client_keeps_its_session(fake_tv, monkeypatch):
    # cli.require_sdb() returns a connected client that callers then use in a `with` block.
    tv = fake_tv({"0 getduid": "ABCDEF123\n"})
    client = Sdb("127.0.0.1", port=tv.port, timeout=5).connect()
    monkeypatch.setattr(client, "_connect_once", lambda: pytest.fail("opened a second sdb session"))
    with client as same:
        assert same is client
        assert same.duid() == "ABCDEF123"
