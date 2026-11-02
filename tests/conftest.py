"""Shared fixtures: a fake TV that speaks enough of the sdb protocol for the client tests."""

import socket
import struct
import threading

import pytest

from aerotizen import sdb


def _frame(cmd, arg0, arg1, payload=b""):
    return (
        struct.pack("<6I", cmd, arg0, arg1, len(payload), sum(payload) & 0xFFFFFFFF, cmd ^ 0xFFFFFFFF)
        + payload
    )


def _read_frame(conn):
    header = b""
    while len(header) < 24:
        chunk = conn.recv(24 - len(header))
        if not chunk:
            return None
        header += chunk
    cmd, arg0, arg1, length, _sum, _magic = struct.unpack("<6I", header)
    payload = b""
    while len(payload) < length:
        payload += conn.recv(length - len(payload))
    return cmd, arg0, arg1, payload


class FakeTV:
    """Accepts one connection; answers CNXN, shell:<cmd> from `replies`, and sync: uploads."""

    def __init__(self, replies=None):
        self.replies = replies or {}
        self.uploads = {}
        self.server = socket.socket()
        self.server.bind(("127.0.0.1", 0))
        self.server.listen(1)
        self.port = self.server.getsockname()[1]
        threading.Thread(target=self._run, daemon=True).start()

    def close(self):
        for sock in (getattr(self, "conn", None), self.server):
            if sock is not None:
                sock.close()

    def _run(self):
        try:
            self.conn, _ = self.server.accept()
        except OSError:
            return  # closed before a client connected
        self._serve(self.conn)

    def _serve(self, conn):
        remote_id = 100
        sync = {}
        while True:
            try:
                frame = _read_frame(conn)
            except OSError:
                return
            if frame is None:
                return
            cmd, arg0, arg1, payload = frame
            if cmd == sdb.CNXN:
                conn.sendall(_frame(sdb.CNXN, sdb.VERSION, 4096, b"device::FAKE-TV::0\0"))
            elif cmd == sdb.OPEN:
                remote_id += 1
                service = payload.rstrip(b"\0").decode()
                conn.sendall(_frame(sdb.OKAY, remote_id, arg0))
                if service.startswith("shell:"):
                    conn.sendall(
                        _frame(sdb.WRTE, remote_id, arg0, self.replies.get(service[6:], "").encode())
                    )
                    conn.sendall(_frame(sdb.CLSE, remote_id, arg0))
                elif service == "sync:":
                    sync[remote_id] = bytearray()
            elif cmd == sdb.WRTE and arg1 in sync:
                # WRTE carries (client id, our id); acknowledge each one before the next arrives.
                conn.sendall(_frame(sdb.OKAY, arg1, arg0))
                sync[arg1] += payload
                if payload[:4] == b"DONE":
                    self.uploads.update(self._parse_upload(bytes(sync.pop(arg1))))
                    conn.sendall(_frame(sdb.WRTE, arg1, arg0, b"OKAY" + struct.pack("<I", 0)))
                    conn.sendall(_frame(sdb.CLSE, arg1, arg0))

    @staticmethod
    def _parse_upload(buf):
        i, path, data = 0, None, bytearray()
        while i + 8 <= len(buf):
            tag, (n,) = buf[i : i + 4], struct.unpack("<I", buf[i + 4 : i + 8])
            if tag == b"SEND":
                path = buf[i + 8 : i + 8 + n].decode()
            elif tag == b"DATA":
                data += buf[i + 8 : i + 8 + n]
            elif tag == b"DONE":
                n = 4
            i += 8 + n
        return {path: bytes(data)}


@pytest.fixture
def fake_tv():
    made = []

    def make(replies=None):
        tv = FakeTV(replies)
        made.append(tv)
        return tv

    yield make
    for tv in made:
        tv.close()


@pytest.fixture(autouse=True)
def isolated_cli_logs(monkeypatch, tmp_path):
    """Do not write test command logs into the user profile."""
    monkeypatch.setenv("AEROTIZEN_LOG_DIR", str(tmp_path / "cli-logs"))
