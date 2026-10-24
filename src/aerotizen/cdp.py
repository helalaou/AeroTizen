"""Tiny Chrome DevTools Protocol client for a TV app exposed by aerotizen inspect.

python3 -m aerotizen.cdp eval "document.title"
python3 -m aerotizen.cdp shot out.png
"""

import base64
import json
import sys
import urllib.request

import websocket


class Page:
    def __init__(self, port=9222):
        targets = json.load(urllib.request.urlopen(f"http://localhost:{port}/json", timeout=10))
        self.ws = websocket.create_connection(targets[0]["webSocketDebuggerUrl"], timeout=60)
        self.n = 0

    def call(self, method, **params):
        self.n += 1
        self.ws.send(json.dumps({"id": self.n, "method": method, "params": params}))
        while True:
            msg = json.loads(self.ws.recv())
            if msg.get("id") == self.n:
                if "error" in msg:
                    raise RuntimeError(msg["error"])
                return msg["result"]

    def eval(self, expr):
        r = self.call("Runtime.evaluate", expression=expr, awaitPromise=True, returnByValue=True)
        if "exceptionDetails" in r:
            raise RuntimeError(
                r["exceptionDetails"].get("exception", {}).get("description") or r["exceptionDetails"]
            )
        return r["result"].get("value")

    def screenshot(self, path):
        data = self.call("Page.captureScreenshot", format="png")["data"]
        with open(path, "wb") as f:
            f.write(base64.b64decode(data))


if __name__ == "__main__":
    page = Page()
    if sys.argv[1] == "eval":
        print(json.dumps(page.eval(sys.argv[2]), indent=1))
    elif sys.argv[1] == "shot":
        page.screenshot(sys.argv[2])
        print("saved", sys.argv[2])
