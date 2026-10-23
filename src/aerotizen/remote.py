"""Samsung Smart TV remote over the local network (port 8002, no Developer Mode needed).

The first connection shows an Allow/Deny prompt on the TV; the token it returns
is cached so later connections are silent.
"""

import base64
import http.client
import json
import os
import ssl
import time
import urllib.error
import urllib.request

import websocket

CLIENT_NAME = base64.b64encode(b"AeroTizen").decode()
CONFIG_DIR = os.path.join(os.path.expanduser("~"), ".config", "aerotizen")


def info(host):
    try:
        return json.load(urllib.request.urlopen(f"http://{host}:8001/api/v2/", timeout=5))["device"]
    except OSError as e:
        raise SystemExit(
            f"Can't reach the TV at {host} ({getattr(e, 'reason', e)}). Is it on and finished booting?"
        ) from e


def app_status(host, app_id):
    try:
        return json.load(
            urllib.request.urlopen(f"http://{host}:8001/api/v2/applications/{app_id}", timeout=3)
        )
    except Exception:
        return None


def rest_launch(host, app_id, port=8001):
    """Open an app through the TV's local REST API. Returns (accepted, what the TV said).

    2022 (Tizen 6.5) TVs ignore ed.apps.launch on the remote channel without replying, but
    accept this. The TV answers `true` when it took the request.
    """
    req = urllib.request.Request(
        f"http://{host}:{port}/api/v2/applications/{app_id}", method="POST", data=b""
    )
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            body = r.read().decode(errors="replace").strip()
            return r.status == 200 and body == "true", f"HTTP {r.status} {body[:120]}"
    except urllib.error.HTTPError as e:
        with e:
            return False, f"HTTP {e.code} {e.read().decode(errors='replace').strip()[:120]}"
    except OSError as e:
        return False, str(getattr(e, "reason", e))
    except (http.client.HTTPException, ValueError) as e:  # e.g. an app id that isn't URL-safe
        return False, f"{type(e).__name__}: {e}"


class Remote:
    def __init__(self, host, timeout=30):
        self.host, self.timeout = host, timeout
        self.token_file = os.path.join(CONFIG_DIR, f"{host}.token")
        self.ws = None

    def _token(self):
        try:
            with open(self.token_file) as f:
                return f.read().strip()
        except FileNotFoundError:
            return None

    def connect(self):
        url = f"wss://{self.host}:8002/api/v2/channels/samsung.remote.control?name={CLIENT_NAME}"
        token = self._token()
        if token:
            url += f"&token={token}"
        self.ws = websocket.create_connection(url, timeout=self.timeout, sslopt={"cert_reqs": ssl.CERT_NONE})
        msg = json.loads(self.ws.recv())
        if msg.get("event") != "ms.channel.connect":
            raise RuntimeError(f"TV refused the remote connection: {msg.get('event')}")
        new_token = msg.get("data", {}).get("token")
        if new_token and new_token != token:
            os.makedirs(CONFIG_DIR, exist_ok=True)
            with open(self.token_file, "w") as f:
                f.write(new_token)
        return self

    def close(self):
        if self.ws:
            time.sleep(0.3)
            self.ws.close()

    def __enter__(self):
        return self.connect()

    def __exit__(self, *exc):
        self.close()

    def key(self, key, times=1, delay=0.25):
        for _ in range(times):
            self.ws.send(
                json.dumps(
                    {
                        "method": "ms.remote.control",
                        "params": {
                            "Cmd": "Click",
                            "DataOfCmd": key,
                            "Option": "false",
                            "TypeOfRemote": "SendRemoteKey",
                        },
                    }
                )
            )
            time.sleep(delay)

    def hold(self, key, seconds=1.0):
        """Press and hold a remote button (e.g. a long-press on OK)."""

        def send(cmd):
            self.ws.send(
                json.dumps(
                    {
                        "method": "ms.remote.control",
                        "params": {
                            "Cmd": cmd,
                            "DataOfCmd": key,
                            "Option": "false",
                            "TypeOfRemote": "SendRemoteKey",
                        },
                    }
                )
            )

        send("Press")
        time.sleep(seconds)
        send("Release")

    def keys(self, sequence, delay=0.6):
        """Send a list like ["KEY_HOME", ("KEY_DOWN", 3), "KEY_ENTER"]."""
        for step in sequence:
            if isinstance(step, (int, float)):
                time.sleep(step)
                continue
            key, times = (step, 1) if isinstance(step, str) else step
            self.key(key, times, delay)

    def launch(self, app_id, wait=3.0):
        """Open an app over the remote channel. Returns the TV's reply, or None if it sent none."""
        self.ws.send(
            json.dumps(
                {
                    "method": "ms.channel.emit",
                    "params": {
                        "event": "ed.apps.launch",
                        "to": "host",
                        "data": {"appId": app_id, "action_type": "DEEP_LINK"},
                    },
                }
            )
        )
        deadline = time.monotonic() + wait
        try:
            while time.monotonic() < deadline:
                self.ws.settimeout(max(0.1, deadline - time.monotonic()))
                try:
                    msg = json.loads(self.ws.recv())
                except ValueError:
                    continue
                if msg.get("event") == "ed.apps.launch":
                    return msg.get("data")
        except (websocket.WebSocketTimeoutException, websocket.WebSocketConnectionClosedException):
            pass
        finally:
            self.ws.settimeout(self.timeout)
        return None
