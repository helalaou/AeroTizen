"""Run a bounded managed helper as SDK UID 901 through the existing SDB session.

This uses the published package-name command workaround, not a root provider.
Only caller-supplied, checksum-verified helper data and one script are staged.
"""

import base64
import hashlib
import ipaddress
import re
import secrets
import shlex
import socket
from concurrent.futures import ThreadPoolExecutor

from aerotizen.device import DeviceSessionError

DIRECTORY = "/home/owner/share/tmp/sdk_tools"
CLEANUP_MARKER = "AEROTIZEN_SDK_CLEANED"
EXIT_PREFIX = "AEROTIZEN_SDK_EXIT="
DOTNET_UNAVAILABLE_MARKER = "AEROTIZEN_SDK_DOTNET_UNAVAILABLE"


def build_script(files, entrypoint, args, callback, port, token):
    ipaddress.IPv4Address(callback)
    if not re.fullmatch(r"[a-f0-9]{12}", token) or not 1 <= port <= 65535:
        raise ValueError("Invalid SDK staging token or callback port")
    if entrypoint not in files or any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", name) for name in files):
        raise ValueError("Invalid SDK payload names")
    stage = f"{DIRECTORY}/ah-{token}.s"
    claimed = stage[:-1] + "r"
    paths = {name: f"{DIRECTORY}/ah-{token}-{name}" for name in files}
    cleanup = "rm -f " + " ".join(shlex.quote(path) for path in [stage, claimed, *paths.values()])
    checks = [
        "set -eu",
        'test "$(id -u)" = 901',
        "if [ ! -x /usr/bin/dotnet ]; then",
        f"  printf '%s\\n' {DOTNET_UNAVAILABLE_MARKER}",
        "  exit 127",
        "fi",
    ]
    for name, path in paths.items():
        digest = hashlib.sha256(files[name]).hexdigest()
        checks.append(f"printf '%s  %s\\n' {digest} {shlex.quote(path)} | sha256sum -c - >/dev/null")
    checks.append(
        "/usr/bin/dotnet "
        + " ".join(
            shlex.quote(value) for value in [paths[entrypoint], *(paths.get(arg, arg) for arg in args)]
        )
    )
    script = (
        "set -u\numask 077\n"
        + "trap "
        + shlex.quote(cleanup)
        + " EXIT\n"
        + f"exec 3<>/dev/tcp/{callback}/{port} || exit 80\n(\n"
        + "\n".join(checks)
        + "\n) >&3 2>&3\nresult=$?\n"
        + cleanup
        + " || exit 81\n"
        + f"printf '\\n{CLEANUP_MARKER}\\n{EXIT_PREFIX}%s\\n' \"$result\" >&3\n"
        + 'exec 3>&-\nexit "$result"\n'
    )
    # Claim the staged script once. Repeated filename evaluation cannot run it twice.
    launch = f"/bin/mv {stage} {claimed} 2>/dev/null&&/bin/cat {claimed}|/bin/bash"
    encoded = base64.b64encode(launch.encode()).decode()
    command = "0 appinstall tpk new2.tpk`printf${IFS}%s${IFS}" + encoded + "|base64${IFS}-d|bash`.tpk"
    if len(command.encode()) > 400:
        raise ValueError("SDK transport command exceeds the reviewed length")
    return script, command, stage, paths


def parse_output(output):
    lines = output.splitlines()
    exits = [line[len(EXIT_PREFIX) :] for line in lines if line.startswith(EXIT_PREFIX)]
    if lines.count(CLEANUP_MARKER) != 1 or len(exits) != 1 or not exits[0].isdigit():
        raise DeviceSessionError("SDK helper completion or staging cleanup was not confirmed.")
    if int(exits[0]) == 127 and DOTNET_UNAVAILABLE_MARKER in lines:
        raise DeviceSessionError(
            "Native Home is unavailable: /usr/bin/dotnet is missing or not executable on the TV. "
            "Installing .NET on your computer will not fix this. Use the default watcher setup instead."
        )
    result = {"stdout": output, "exit_code": int(exits[0]), "staging_cleaned": True}
    return result


def run(session, files, entrypoint, args=()):
    try:
        ipaddress.IPv4Address(session.host)
    except ValueError as exc:
        raise DeviceSessionError("SDK execution requires the TV's IPv4 address.") from exc
    if not files or sum(map(len, files.values())) > 2 * 1024 * 1024:
        raise DeviceSessionError("Invalid SDK helper payload size.")
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((session.host, 9))
        callback = route.getsockname()[0]
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((callback, 0))
        listener.listen(1)
        listener.settimeout(35)
        script, command, stage, paths = build_script(
            files, entrypoint, args, callback, listener.getsockname()[1], secrets.token_hex(6)
        )
        for name, path in paths.items():
            session.push(files[name], path)
        session.push(script.encode(), stage)
        with ThreadPoolExecutor(max_workers=1) as pool:
            task = pool.submit(session.shell_bounded, command, 30, 131072)
            try:
                connection, peer = listener.accept()
                if peer[0] != session.host:
                    connection.close()
                    raise DeviceSessionError("SDK callback came from an unexpected device.")
                data = bytearray()
                with connection:
                    connection.settimeout(30)
                    while True:
                        chunk = connection.recv(16384)
                        if not chunk:
                            break
                        data.extend(chunk)
                        if len(data) > 131072:
                            raise DeviceSessionError("SDK helper output limit exceeded.")
                task.result(timeout=35)
            except (OSError, TimeoutError) as exc:
                raise DeviceSessionError(
                    "SDK query transport failed; temporary-file cleanup is unconfirmed. "
                    f"Staged paths: {', '.join([stage, stage[:-1] + 'r', *paths.values()])}"
                ) from exc
    return parse_output(data.decode(errors="replace"))
