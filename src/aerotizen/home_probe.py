"""Inventory TV runtime files without executing them or reading Home settings."""

import json
import os
import re
import shlex
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import __version__, sdk
from aerotizen.device import DeviceSessionError

PREFIX = "AEROTIZEN_HOME_PROBE\t"
COMMANDS = (
    "/usr/bin/dotnet",
    "/usr/bin/dotnet-launcher",
    "/usr/bin/dotnet-launcher-inhouse",
    "/usr/share/dotnet/dotnet",
)
LIBRARIES = tuple(
    directory + "/" + name
    for directory in ("/usr/lib", "/lib")
    for name in (
        "libvconf.so.0",
        "libcapi-appfw-app-operation-tv.so.0",
        "libcapi-appfw-app-manager.so.0",
        "libapp-context-manager-common.so",
    )
)
RUNTIME_DIRECTORIES = (
    "/usr/share/dotnet/shared/Microsoft.NETCore.App",
    "/usr/share/dotnet.tizen",
    "/usr/share/dotnet.tizen/netcoreapp",
)
ARCHITECTURES = {"arm", "armv7", "armv7l", "aarch64", "arm64", "x86", "i686", "x86_64"}
VERSION = re.compile(r"\d{1,3}(?:\.\d{1,3}){1,3}(?:[-+][A-Za-z0-9.]{1,32})?")
RUNTIME_VERSION = re.compile(r"(?:netcoreapp|net)?\d{1,3}(?:\.\d{1,3}){1,3}(?:[-+][A-Za-z0-9.]{1,32})?")
MAX_VERSIONS = 32


def build_script():
    # Every path is built in. No user input is included in the TV script.
    lines = [
        'emit() { printf \'AEROTIZEN_HOME_PROBE\\t%s\\t%s\\n\' "$1" "$2"; }',
        'emit uid "$(id -u)"',
        'emit architecture "$(uname -m 2>/dev/null || true)"',
        "if [ -r /etc/os-release ]; then",
        "  while IFS='=' read -r key value; do",
        '    case "$key" in ID|VERSION_ID|BUILD_ID)',
        '      value=${value#\\"}; value=${value%\\"}',
        '      emit "os.$key" "$value" ;;',
        "    esac",
        "  done < /etc/os-release",
        "fi",
    ]
    for path in (*COMMANDS, *LIBRARIES):
        quoted = shlex.quote(path)
        lines.extend(
            [
                "regular=0; readable=0; executable=0",
                f"[ ! -f {quoted} ] || regular=1",
                f"[ ! -r {quoted} ] || readable=1",
                f"[ ! -x {quoted} ] || executable=1",
                f'emit {shlex.quote("file." + path)} "$regular,$readable,$executable"',
            ]
        )
    for path in RUNTIME_DIRECTORIES:
        quoted = shlex.quote(path)
        lines.extend(
            [
                "present=0; count=0; truncated=0",
                f"if [ -d {quoted} ]; then",
                "  present=1",
                f"  for entry in {quoted}/*; do",
                '    [ -d "$entry" ] || continue',
                f'    if [ "$count" -ge {MAX_VERSIONS} ]; then truncated=1; break; fi',
                f'    emit {shlex.quote("version." + path)} "${{entry##*/}}"',
                "    count=$((count + 1))",
                "  done",
                "fi",
                f'emit {shlex.quote("directory." + path)} "$present,$truncated"',
            ]
        )
    lines.append("emit complete 1")
    return "\n".join(lines)


def _version(value):
    return value if isinstance(value, str) and VERSION.fullmatch(value) else None


def parse_output(result, capabilities):
    """Allow only known fields; never save raw stdout, SDB capabilities or errors."""
    if result.get("exit_code") != 0 or result.get("staging_cleaned") is not True:
        raise DeviceSessionError("Read-only Home probe failed or temporary-file cleanup was not confirmed.")
    fields, versions = {}, {path: [] for path in RUNTIME_DIRECTORIES}
    allowed = {
        "uid",
        "architecture",
        "os.ID",
        "os.VERSION_ID",
        "os.BUILD_ID",
        "complete",
        *("file." + path for path in (*COMMANDS, *LIBRARIES)),
        *("directory." + path for path in RUNTIME_DIRECTORIES),
    }
    try:
        for line in result["stdout"].splitlines():
            if not line.startswith(PREFIX):
                continue  # Discard shell diagnostics, which can contain private data.
            key, value = line[len(PREFIX) :].split("\t")
            if key.startswith("version."):
                path = key[len("version.") :]
                if path not in versions or len(versions[path]) >= MAX_VERSIONS:
                    raise ValueError("Unexpected runtime directory")
                versions[path].append(value if RUNTIME_VERSION.fullmatch(value) else None)
            elif key not in allowed or key in fields:
                raise ValueError("Unexpected or duplicate field")
            else:
                fields[key] = value
        required = allowed - {"os.ID", "os.VERSION_ID", "os.BUILD_ID"}
        if not required <= fields.keys() or fields["uid"] != "901" or fields["complete"] != "1":
            raise ValueError("Incomplete probe")
        files = {}
        for path in (*COMMANDS, *LIBRARIES):
            flags = fields["file." + path].split(",")
            if len(flags) != 3 or any(flag not in ("0", "1") for flag in flags):
                raise ValueError("Invalid file flags")
            files[path] = dict(
                zip(("regular_file", "readable", "executable"), (flag == "1" for flag in flags), strict=True)
            )
        directories = {}
        for path in RUNTIME_DIRECTORIES:
            flags = fields["directory." + path].split(",")
            if len(flags) != 2 or any(flag not in ("0", "1") for flag in flags):
                raise ValueError("Invalid directory flags")
            directories[path] = {
                "present": flags[0] == "1",
                "versions": sorted({value for value in versions[path] if value is not None}),
                "truncated": flags[1] == "1",
            }
        build = fields.get("os.BUILD_ID", "")
        build = build if re.fullmatch(r"T-[A-Za-z0-9._+-]{1,126}", build) else None
        return {
            "schema_version": 1,
            "probe": "home-runtime-inventory",
            "cli_version": __version__,
            "collected_at": datetime.now(timezone.utc).isoformat(),
            "read_only": True,
            "device": {
                "platform_version": _version(capabilities.get("platform_version")),
                "cpu_arch": capabilities.get("cpu_arch")
                if capabilities.get("cpu_arch") in ARCHITECTURES
                else None,
                "os_release": {
                    "id": "tizen" if fields.get("os.ID") == "tizen" else None,
                    "version": _version(fields.get("os.VERSION_ID")),
                    "firmware_build": build,
                },
            },
            "execution": {
                "uid": 901,
                "architecture": fields["architecture"] if fields["architecture"] in ARCHITECTURES else None,
            },
            "commands": {path: files[path] for path in COMMANDS},
            "libraries": {path: files[path] for path in LIBRARIES},
            "runtime_directories": directories,
            "transport": {"access": "sdk_uid_901", "staging_cleaned": True},
            "native_home_supported": None,
        }
    except (KeyError, TypeError, ValueError) as error:
        raise DeviceSessionError("Read-only Home probe returned an invalid or incomplete report.") from error


def collect(session):
    capabilities = session.capability()
    try:
        result = sdk.run_shell(session, build_script())
    except (OSError, DeviceSessionError) as error:
        raise DeviceSessionError(
            "Read-only Home probe transport failed; temporary-file cleanup is unconfirmed. "
            "Check the SDB connection and allow the TV to connect back to this computer."
        ) from error
    return parse_output(result, capabilities)


def save_report(report, destination):
    """Create a local report without replacing an existing file or symlink."""
    destination = Path(destination).expanduser()
    data = json.dumps(report, indent=2) + "\n"
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w", encoding="utf-8", dir=destination.parent, delete=False
        ) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.link(temporary, destination)
    finally:
        if temporary is not None:
            temporary.unlink()
    return destination
