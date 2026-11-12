# /// script
# requires-python = ">=3.10"
# dependencies = ["cryptography>=41", "pillow>=11", "websocket-client>=1.6"]
# ///
"""Run a temporary, local mirror of a paired Samsung Frame on this Mac."""

import argparse
import hashlib
import hmac
import ipaddress
import os
import secrets
import shlex
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser
from contextlib import suppress
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "cli" / "src"))

from aerotizen import sdk  # noqa: E402
from aerotizen.device import DeviceSession  # noqa: E402
from aerotizen.sdb import SdbError  # noqa: E402

WIDTH, HEIGHT = 720, 540
LUMA_SIZE = WIDTH * HEIGHT
FRAME_SIZE = LUMA_SIZE * 3 // 2
HELPER_FILES = ("FrameProbe.dll", "FrameProbe.deps.json", "FrameProbe.runtimeconfig.json")
CAPTURE_ERRORS = {
    2: "The TV does not use the tested ARM32 runtime.",
    3: "The TV refused the screen capture.",
    4: "The TV returned an unsupported picture layout.",
    5: "The TV lost its connection to the Mac.",
    6: "The TV does not have the native capture API.",
    81: "The TV could not remove the temporary capture files.",
    124: "The capture helper exceeded its time limit.",
}

PAGE = b"""<!doctype html><html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>AeroTizen TV mirror</title>
<style>
body { background: #101114; color: #eee; font: 16px system-ui; margin: 2rem; }
main { max-width: 1200px; margin: auto; }
h1 { font-size: 1.3rem; }
img { display: block; width: 100%; aspect-ratio: 16 / 9; background: #000; }
</style>
<main><h1>AeroTizen TV mirror</h1><img src="/stream" alt="Live picture from the TV"></main>
</html>"""


def build_helper(build_dir):
    dotnet = shutil.which(os.environ.get("AEROTIZEN_DOTNET", "dotnet"))
    if not dotnet:
        raise RuntimeError("Install the .NET 6 SDK or set AEROTIZEN_DOTNET to its dotnet executable.")
    project = ROOT / "tools" / "tv-mirror" / "FrameProbe.csproj"
    output = build_dir / "output"
    subprocess.run(
        [
            dotnet,
            "build",
            str(project),
            "--configuration",
            "Release",
            "--output",
            str(output),
            f"-p:BaseIntermediateOutputPath={build_dir / 'obj'}/",
            "--nologo",
            "--verbosity",
            "quiet",
        ],
        check=True,
        timeout=120,
        env={**os.environ, "DOTNET_GENERATE_ASPNET_CERTIFICATE": "false"},
    )
    return {name: (output / name).read_bytes() for name in HELPER_FILES}


def launch_capture(session, files, address, port, seconds, stream_token):
    def build(callback, callback_port, staging_token):
        stage_files = []
        for name, data in files.items():
            path = shlex.quote(sdk._path(staging_token, name))
            digest = hashlib.sha256(data).hexdigest()
            stage_files.extend(
                (
                    f"printf '%s  %s\\n' {digest} {path} | sha256sum -c - >/dev/null",
                    f'cp {path} "$work/{name}"',
                )
            )
        staged = "\n".join(stage_files)
        arguments = shlex.join((address, str(port), str(seconds), stream_token))
        names = " ".join(f'"$work/{name}"' for name in HELPER_FILES)
        body = f"""
test -x /usr/bin/dotnet
work=$(mktemp -d {sdk.DIRECTORY}/aero-mirror.XXXXXX)
cleanup() {{ rm -f {names} && rmdir "$work"; }}
trap cleanup EXIT
{staged}
(
    trap cleanup EXIT
    ulimit -c 0
    result=0
    /usr/bin/dotnet "$work/FrameProbe.dll" {arguments} || result=$?
    cleanup || result=81
    trap - EXIT
    printf 'done %s %s\\n' {shlex.quote(stream_token)} "$result" > /dev/tcp/{address}/{port}
) </dev/null >/dev/null 2>&1 3>&- &
trap - EXIT
"""
        return sdk._build_script(files, body, callback, callback_port, staging_token)

    result = sdk._run(session, files, build)
    if result["exit_code"]:
        raise RuntimeError("The TV could not stage the capture helper.")


def encode_jpeg(frame):
    luma = Image.frombytes("L", (WIDTH, HEIGHT), frame[:LUMA_SIZE])
    chroma = frame[LUMA_SIZE:]
    cb, cr = (
        Image.frombytes("L", (WIDTH // 2, HEIGHT // 2), chroma[offset::2]).resize(
            luma.size, Image.Resampling.BILINEAR
        )
        for offset in (0, 1)
    )
    image = Image.merge("YCbCr", (luma, cb, cr)).resize((960, 540), Image.Resampling.BILINEAR)
    with BytesIO() as output:
        image.save(output, "JPEG", quality=82)
        return output.getvalue()


class Preview:
    def __init__(self):
        self.condition = threading.Condition()
        self.frame = b""
        self.count = 0
        self.closed = False

    def publish(self, frame):
        with self.condition:
            self.frame = frame
            self.count += 1
            self.condition.notify_all()

    def close(self):
        with self.condition:
            self.closed = True
            self.condition.notify_all()

    def server(self, port):
        preview = self

        class Handler(BaseHTTPRequestHandler):
            def handle(self):
                with suppress(BrokenPipeError, ConnectionResetError, TimeoutError):
                    super().handle()

            def log_message(self, *args):
                pass

            def do_GET(self):
                if self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}":
                    self.send_error(403)
                    return
                if self.path == "/":
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html; charset=utf-8")
                    self.send_header("Content-Security-Policy", "frame-ancestors 'none'")
                    self.send_header("Content-Length", str(len(PAGE)))
                    self.end_headers()
                    self.wfile.write(PAGE)
                elif self.path == "/stream":
                    self.send_response(200)
                    self.send_header("Cache-Control", "no-store")
                    self.send_header("Cross-Origin-Resource-Policy", "same-origin")
                    self.send_header("Content-Type", "multipart/x-mixed-replace; boundary=frame")
                    self.end_headers()
                    self.connection.settimeout(5)
                    last = 0
                    while True:
                        with preview.condition:
                            preview.condition.wait_for(
                                lambda last=last: preview.count != last or preview.closed
                            )
                            if preview.closed:
                                break
                            last, frame = preview.count, preview.frame
                        header = (
                            f"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: {len(frame)}\r\n\r\n"
                        )
                        self.wfile.write(header.encode() + frame + b"\r\n")
                else:
                    self.send_error(404)

        return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def receive(listener, host, token, preview, ready, *, stopping=False):
    # Only the paired TV learns the one-use token over the authenticated SDB bridge.
    deadline = time.monotonic() + (8 if stopping else 16)
    while (remaining := deadline - time.monotonic()) > 0:
        listener.settimeout(remaining)
        connection, peer = listener.accept()
        with connection:
            if peer[0] != host:
                continue
            connection.settimeout(6)
            with connection.makefile("rb") as stream:
                header = stream.readline(128).split()
                if len(header) < 2 or not hmac.compare_digest(header[1], token.encode("ascii")):
                    continue
                if header[0] == b"done" and len(header) == 3:
                    return int(header[2])
                if stopping or header[0] != b"frames" or len(header) != 2:
                    continue
                while frame := stream.read(FRAME_SIZE):
                    if len(frame) != FRAME_SIZE:
                        raise RuntimeError("The TV sent an incomplete frame.")
                    preview.publish(encode_jpeg(frame))
                    if preview.count == 1:
                        ready()
                deadline = time.monotonic() + 8
    raise TimeoutError("The TV did not confirm capture completion.")


def run_mirror(host, seconds, port, open_browser):
    preview = Preview()
    with (
        tempfile.TemporaryDirectory(prefix="aerotizen-mirror-") as directory,
        socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener,
        socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route,
        preview.server(port) as http,
        DeviceSession(host, timeout=8) as session,
    ):
        if not session.managed_root:
            raise RuntimeError("Mirror requires the paired root bridge. See docs/root-cli.md.")
        route.connect((host, 9))
        address = route.getsockname()[0]
        listener.bind((address, 0))
        listener.listen(2)
        token = secrets.token_hex(32)
        files = build_helper(Path(directory))
        launch_capture(session, files, address, listener.getsockname()[1], seconds, token)
        thread = threading.Thread(target=http.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{http.server_port}/"

        def ready():
            print(f"Live picture at {url} for up to {seconds} seconds. Press Ctrl+C to stop.", flush=True)
            if open_browser:
                webbrowser.open(url)

        try:
            started = time.monotonic()
            result = receive(listener, host, token, preview, ready)
            if result:
                raise RuntimeError(CAPTURE_ERRORS.get(result, f"The TV capture exited with code {result}."))
            if not preview.count:
                raise RuntimeError("The TV did not send a frame.")
            elapsed = time.monotonic() - started
            print("TV cleanup confirmed.", f"Received {preview.count} frames in {elapsed:.1f}s.")
        except KeyboardInterrupt:
            result = receive(listener, host, token, preview, ready, stopping=True)
            if result not in (0, 5):
                raise RuntimeError(
                    CAPTURE_ERRORS.get(result, f"The TV capture exited with code {result}.")
                ) from None
            print("Mirror stopped and TV cleanup was confirmed.")
        finally:
            preview.close()
            http.shutdown()
            thread.join()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--tv", required=True, type=ipaddress.IPv4Address, help="IPv4 address of the paired TV"
    )
    parser.add_argument(
        "--seconds", type=int, default=180, help="capture duration, from 1 to 600 (default: 180)"
    )
    parser.add_argument("--port", type=int, default=8765, help="Mac preview port (default: 8765)")
    parser.add_argument(
        "--no-open", action="store_true", help="print the preview URL without opening a browser"
    )
    args = parser.parse_args()
    if not 1 <= args.seconds <= 600:
        parser.error("--seconds must be between 1 and 600")
    if not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")

    def interrupt(_signal, _frame):
        # uv can forward a second interrupt while the first one is cleaning up.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        raise KeyboardInterrupt

    signal.signal(signal.SIGINT, interrupt)
    try:
        run_mirror(str(args.tv), args.seconds, args.port, not args.no_open)
    except KeyboardInterrupt:
        print("Mirror stopped.")
    except (OSError, RuntimeError, SdbError, subprocess.SubprocessError) as error:
        sys.exit(f"Mirror: {error}")


if __name__ == "__main__":
    main()
