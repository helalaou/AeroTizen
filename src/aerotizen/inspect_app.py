"""Restart a TV app with its web inspector for ``aerotizen inspect``."""

import time
import urllib.request

from aerotizen.sdb import Sdb


def run(host, app_id, local_port=9222):
    try:  # debug launch only works when the app isn't already running
        with urllib.request.urlopen(
            urllib.request.Request(f"http://{host}:8001/api/v2/applications/{app_id}", method="DELETE"),
            timeout=5,
        ):
            pass
        time.sleep(2)
    except OSError:
        pass
    with Sdb(host, timeout=60).connect() as connection:
        port = connection.debug_launch(app_id)
        print(f"inspector: TV port {port} -> http://localhost:{local_port}/json", flush=True)
        connection.forward(local_port, port)
