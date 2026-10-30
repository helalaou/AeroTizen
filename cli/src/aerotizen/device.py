"""Own one TV connection, including temporary handoffs to a root provider."""

import hashlib
import os
import threading
from pathlib import Path
from typing import Protocol

from aerotizen import remote
from aerotizen.sdb import PORT, Sdb, SdbError


class DeviceSessionError(SdbError):
    pass


class RootProvider(Protocol):
    def prepare(self): ...

    def run(self, host: str, commands: tuple[str, ...]) -> dict: ...

    def disconnect(self, host: str): ...


class DeviceSession:
    """Serialize AeroTizen access to a TV across threads and CLI processes.

    A session holds its host lock until close, including while the raw connection
    is released for an external provider. Other SDK tools do not honor this lock.
    """

    def __init__(self, host, port=PORT, timeout=15, *, lock_dir=None):
        self.host, self.port, self.timeout = host, port, timeout
        self.lock_dir = Path(lock_dir) if lock_dir is not None else Path(remote.CONFIG_DIR) / "sessions"
        self._mutex = threading.RLock()
        self._lock_file = None
        self._connection = None
        self._external = False

    def _acquire(self):
        self.lock_dir.mkdir(parents=True, exist_ok=True)
        key = hashlib.sha256(f"{self.host.lower()}:{self.port}".encode()).hexdigest()
        handle = (self.lock_dir / f"{key}.lock").open("a+b")
        try:
            if os.name == "nt":
                import msvcrt

                handle.seek(0, os.SEEK_END)
                if handle.tell() == 0:
                    handle.write(b"\0")
                    handle.flush()
                handle.seek(0)
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            handle.close()
            raise DeviceSessionError(
                f"Another AeroTizen session owns {self.host}:{self.port}; close it and retry."
            ) from exc
        self._lock_file = handle

    def connect(self):
        with self._mutex:
            if self._external:
                raise DeviceSessionError("The TV connection is handed to a root provider.")
            if self._connection is not None:
                return self
            self._acquire()
            try:
                self._connection = Sdb(self.host, port=self.port, timeout=self.timeout)
                self._connection.connect()
            except BaseException:
                self.close()
                raise
            return self

    def close(self):
        with self._mutex:
            try:
                if self._connection is not None:
                    self._connection.close()
            finally:
                self._connection = None
                if self._lock_file is not None:
                    # Closing releases the OS lock. Keep the inode so waiting
                    # processes can never acquire locks on different files.
                    self._lock_file.close()
                    self._lock_file = None

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    def _require_connection(self):
        if self._external or self._connection is None:
            raise DeviceSessionError("No direct TV connection is active.")
        return self._connection

    @property
    def banner(self):
        with self._mutex:
            return self._require_connection().banner

    def _call(self, method, *args):
        with self._mutex:
            return getattr(self._require_connection(), method)(*args)

    def capability(self):
        return self._call("capability")

    def duid(self):
        return self._call("duid")

    def applist(self):
        return self._call("applist")

    def shell(self, command):
        return self._call("shell", command)

    def shell_bounded(self, command, timeout=30, max_output=131072):
        return self._call("shell_bounded", command, timeout, max_output)

    def push(self, data, path):
        return self._call("push", data, path)

    def pull(self, path):
        return self._call("pull", path)

    def install(self, app_id, data, tool_path):
        return self._call("install", app_id, data, tool_path)

    def uninstall(self, app_id):
        return self._call("uninstall", app_id)

    def launch(self, app_id):
        return self._call("launch", app_id)

    def debug_launch(self, app_id):
        return self._call("debug_launch", app_id)

    def forward(self, local_port, remote_port):
        return self._call("forward", local_port, remote_port)

    def root(self, provider: RootProvider, commands=()):
        """Release SDB, run a bounded root session, then restore direct access.

        A failed or interrupted root run still disconnects the external SDB client
        and reconnects. If release or reconnection fails, close and report the
        recovery failure instead of allowing use of an uncertain connection.
        """
        with self._mutex:
            connection = self._require_connection()
            if self.port != PORT:
                raise DeviceSessionError("The upstream root provider requires SDB port 26101.")
            provider.prepare()
            connection.close()
            self._connection = None
            self._external = True
            failure = None
            result = None
            try:
                try:
                    result = provider.run(self.host, tuple(commands))
                except BaseException as exc:
                    failure = exc
                try:
                    provider.disconnect(self.host)
                except BaseException as exc:
                    raise DeviceSessionError(
                        "Could not release the root provider's SDB session; direct access remains closed."
                        + (f" Root operation also failed: {failure}" if failure else "")
                    ) from exc
                try:
                    self._connection = Sdb(self.host, port=self.port, timeout=self.timeout)
                    self._connection.connect()
                except BaseException as exc:
                    raise DeviceSessionError(
                        "Root handoff ended, but direct SDB reconnection failed."
                        + (f" Root operation also failed: {failure}" if failure else "")
                    ) from exc
            except BaseException:
                self.close()
                raise
            finally:
                self._external = False
            if failure is not None:
                raise failure
            return result
