"""Launch an app on the TV with its web inspector and expose it on localhost.

  aerotizen-inspect <tv-ip> DclHome001.Home [9222]

Then open http://localhost:9222/json for the DevTools target, or point a
Chrome DevTools Protocol client at it. Ctrl+C to stop.
"""

import argparse
import time
import urllib.request

from aerotizen import __version__
from aerotizen.sdb import Sdb


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", action="version", version=f"aerotizen-inspect {__version__}")
    parser.add_argument("host", help="TV IP address")
    parser.add_argument("app_id", help="Application id")
    parser.add_argument("port", type=int, nargs="?", default=9222, help="Local port (default: 9222)")
    args = parser.parse_args()
    host, app_id, local = args.host, args.app_id, args.port
    try:  # debug launch only works when the app isn't already running
        urllib.request.urlopen(
            urllib.request.Request(f"http://{host}:8001/api/v2/applications/{app_id}", method="DELETE"),
            timeout=5,
        )
        time.sleep(2)
    except Exception:
        pass
    keep = Sdb(host, timeout=60).connect()
    port = keep.debug_launch(app_id)
    print(f"inspector: TV port {port} -> http://localhost:{local}/json", flush=True)
    keep.forward(local, port)


if __name__ == "__main__":
    main()
