"""Run bounded built-in shell probes or managed helpers as SDK UID 901.

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
PROBE_LAUNCHERS = ("/usr/bin/dotnet-launcher", "/usr/bin/dotnet-launcher-inhouse")
RUNTIME_ERROR_PREFIX = "AEROTIZEN_RUNTIME_LAUNCHER_ERROR="
# Keep these patterns compatible with both Python re and the TV's awk.
RUNTIME_ERROR_PATTERNS = {
    "access_denied": "permission denied|operation not permitted|access denied|eacces|eperm",
    "app_context_unavailable": "getlaunchedapppackageid.*(fail|error)|failed to get (the )?(app|package) id",
    "assembly_load_failed": (
        "failed to (load|execute)( the)? assembly|could not load file or assembly|badimageformatexception"
    ),
    "invalid_launcher_option": "(unrecognized|unknown|invalid) option",
    "missing_dependency": "cannot open shared object file|dllnotfoundexception|undefined symbol",
    "runtime_load_failed": (
        "failed to (initialize|load|create) (the )?(coreclr|runtime)|"
        "framework.*not found|you must install or update [.]net"
    ),
    "unhandled_exception": "unhandled exception",
}


def build_script(files, entrypoint, args, callback, port, token):
    if entrypoint not in files:
        raise ValueError("Invalid SDK entrypoint")
    checks = [
        "if [ ! -x /usr/bin/dotnet ]; then",
        f"  printf '%s\\n' {DOTNET_UNAVAILABLE_MARKER}",
        "  exit 127",
        "fi",
    ]
    for name, data in files.items():
        digest = hashlib.sha256(data).hexdigest()
        checks.append(
            f"printf '%s  %s\\n' {digest} {shlex.quote(_path(token, name))} | sha256sum -c - >/dev/null"
        )
    checks.append(
        "/usr/bin/dotnet "
        + " ".join(
            shlex.quote(value)
            for value in [
                _path(token, entrypoint),
                *(_path(token, arg) if arg in files else arg for arg in args),
            ]
        )
    )
    return _build_script(files, "\n".join(checks), callback, port, token)


def _path(token, name):
    return f"{DIRECTORY}/ah-{token}-{name}"


def _build_script(files, body, callback, port, token, scratch=()):
    ipaddress.IPv4Address(callback)
    if not re.fullmatch(r"[a-f0-9]{12}", token) or not 1 <= port <= 65535:
        raise ValueError("Invalid SDK staging token or callback port")
    if any(not re.fullmatch(r"[A-Za-z0-9_.-]{1,80}", name) for name in (*files, *scratch)):
        raise ValueError("Invalid SDK payload names")
    stage = f"{DIRECTORY}/ah-{token}.s"
    claimed = stage[:-1] + "r"
    paths = {name: _path(token, name) for name in files}
    cleanup_paths = [stage, claimed, *paths.values(), *(_path(token, name) for name in scratch)]
    cleanup = "rm -f " + " ".join(shlex.quote(path) for path in cleanup_paths)
    script = (
        "set -u\numask 077\n"
        + "trap "
        + shlex.quote(cleanup)
        + " EXIT\n"
        + f"exec 3<>/dev/tcp/{callback}/{port} || exit 80\n(\n"
        + 'set -eu\ntest "$(id -u)" = 901\n'
        + body
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
    if not files or sum(map(len, files.values())) > 2 * 1024 * 1024:
        raise DeviceSessionError("Invalid SDK helper payload size.")
    return _run(session, files, lambda *transport: build_script(files, entrypoint, args, *transport))


def run_shell(session, script):
    """Run a trusted built-in inventory script; no managed runtime or payload is used."""
    if not isinstance(script, str) or not script or len(script.encode()) > 32768:
        raise DeviceSessionError("Invalid SDK probe script size.")
    return _run(session, {}, lambda *transport: _build_script({}, script, *transport))


def build_standalone_probe(files, entrypoint, launcher, callback, port, token):
    """Separate diagnostic route; never used as a Home query/writer fallback."""
    if launcher not in PROBE_LAUNCHERS or entrypoint not in files:
        raise ValueError("Invalid diagnostic launcher or entrypoint")
    lines = [
        f"if [ ! -x {launcher} ]; then",
        "  printf 'AEROTIZEN_RUNTIME_LAUNCHER=missing\\n'",
        "  exit 127",
        "fi",
        "printf 'AEROTIZEN_RUNTIME_LAUNCHER=available\\n'",
    ]
    for name, data in files.items():
        lines.append(
            f"printf '%s  %s\\n' {hashlib.sha256(data).hexdigest()} "
            f"{shlex.quote(_path(token, name))} | sha256sum -c - >/dev/null"
        )
    marker = entrypoint + ".started"
    assembly_path = shlex.quote(_path(token, entrypoint))
    classify_log = "{ message = tolower($0); " + " ".join(
        f'if (message ~ /{pattern}/) errors["{category}"] = 1;'
        for category, pattern in RUNTIME_ERROR_PATTERNS.items()
    )
    classify_log += f'}} END {{ for (category in errors) print "{RUNTIME_ERROR_PREFIX}" category }}'
    lines.extend(
        [
            f"probe_marker={shlex.quote(_path(token, marker))}",
            '(set -C; printf "0\\n" > "$probe_marker")',
            # Bound startup as well as getters. Retail TVs need not have `timeout`.
            f"{launcher} --standalone {assembly_path} &",
            "probe_pid=$!",
            "(",
            "  sleep 12 >/dev/null 2>&1 3>&-",
            '  kill -0 "$probe_pid" 2>/dev/null || exit 0',
            "  printf 'AEROTIZEN_RUNTIME_TIMEOUT=1\\n'",
            '  kill -TERM "$probe_pid" 2>/dev/null || true',
            "  sleep 2 >/dev/null 2>&1 3>&-",
            '  kill -KILL "$probe_pid" 2>/dev/null || true',
            ") &",
            "watchdog_pid=$!",
            'result=0; wait "$probe_pid" || result=$?',
            'kill "$watchdog_pid" 2>/dev/null || true',
            'wait "$watchdog_pid" 2>/dev/null || true',
            'if [ -f "$probe_marker" ] && [ ! -L "$probe_marker" ] &&',
            '    read -r -n 1 marker < "$probe_marker"; then',
            '  if [ "$marker" = 1 ]; then',
            "    printf '\\nAEROTIZEN_RUNTIME_STARTUP_MARKER=written\\n'",
            "  else",
            "    printf '\\nAEROTIZEN_RUNTIME_STARTUP_MARKER=not_observed\\n'",
            "  fi",
            "fi",
            # Some Samsung launchers redirect stderr to a per-process log.
            'for log in /tmp/dotnet_error."$probe_pid".*.log; do',
            '  [ -f "$log" ] && [ ! -L "$log" ] && [ -r "$log" ] || continue',
            f'  [[ "$log" -ot {assembly_path} ]] && continue',
            '  printf "\\n"',
            f'  head -c 8192 "$log" 2>/dev/null | awk {shlex.quote(classify_log)} 2>/dev/null || true',
            "  break",
            "done",
            'exit "$result"',
        ]
    )
    return _build_script(files, "\n".join(lines), callback, port, token, scratch=(marker,))


def run_standalone_probe(session, files, entrypoint, launcher):
    if not files or sum(map(len, files.values())) > 2 * 1024 * 1024:
        raise DeviceSessionError("Invalid SDK diagnostic payload size.")
    return _run(
        session, files, lambda *transport: build_standalone_probe(files, entrypoint, launcher, *transport)
    )


def _run(session, files, build):
    try:
        ipaddress.IPv4Address(session.host)
    except ValueError as exc:
        raise DeviceSessionError("SDK execution requires the TV's IPv4 address.") from exc
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as route:
        route.connect((session.host, 9))
        callback = route.getsockname()[0]
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind((callback, 0))
        listener.listen(1)
        listener.settimeout(35)
        script, command, stage, paths = build(callback, listener.getsockname()[1], secrets.token_hex(6))
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
