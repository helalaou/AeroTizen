"""Check whether the TV executes commands through AeroTizen's SDB SDK path."""

import argparse
import base64
import ipaddress
import json
import re
import secrets
import time

from aerotizen.sdb import Sdb, SdbError

CAPABILITIES = ("platform_version", "cpu_arch", "core_abi", "sdbd_version", "sdbd_plugin_version")
COMMAND_TIMEOUT = 6
MAX_REPLY_BYTES = 4096


def sample(session, *, delayed):
    # Match the envelope used by sdk.py. The random suffix refers to a package
    # that we never upload. The only command on the TV is a no-op or a short wait.
    payload = b"/bin/sleep 2" if delayed else b"/bin/true"
    encoded = base64.b64encode(payload).decode("ascii")
    name = f"new2.tpk`printf${{IFS}}%s${{IFS}}{encoded}|base64${{IFS}}-d|bash`-{secrets.token_hex(8)}.tpk"
    started = time.monotonic()
    reply = session.shell_bounded(f"0 appinstall tpk {name}", COMMAND_TIMEOUT, MAX_REPLY_BYTES)
    elapsed = round((time.monotonic() - started) * 1000)

    # Package manager output can include paths. Report only the reply category.
    reply = reply.strip().lower()
    if not reply or reply == "closed":
        category = "no_output" if not reply else "closed"
    elif "package not found" in reply or "realpath fail" in reply:
        category = "package_not_found"
    elif "invalid character" in reply or "invalid command" in reply:
        category = "invalid_command"
    else:
        category = "other_output"
    return {"elapsed_ms": elapsed, "reply": category}


def collect(session, report):
    caps = session.capability()
    report["capabilities"] = {
        key: value if re.fullmatch(r"[a-zA-Z0-9_.-]{1,40}", value) else None
        for key in CAPABILITIES
        if (value := caps.get(key)) is not None
    }
    report["warmup"] = sample(session, delayed=False)
    samples = report["samples"] = []
    for delay_first in (False, True):
        # Reverse the second pair to reduce the effect of drift between requests.
        first = sample(session, delayed=delay_first)
        second = sample(session, delayed=not delay_first)
        control, delayed = (second, first) if delay_first else (first, second)
        samples.append(
            {
                "control": control,
                "delay": delayed,
                "difference_ms": delayed["elapsed_ms"] - control["elapsed_ms"],
            }
        )
    if all(1500 <= pair["difference_ms"] <= 3500 for pair in samples):
        return "delay_observed"
    if all(pair["control"]["elapsed_ms"] < 1000 and pair["delay"]["elapsed_ms"] < 1000 for pair in samples):
        return "delay_not_observed"
    return "inconclusive"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tv", required=True, type=ipaddress.IPv4Address, help="TV IPv4 address")
    args = parser.parse_args()
    report = {"probe": "aerotizen-sdb-execution", "schema_version": 1}
    try:
        with Sdb(str(args.tv), timeout=COMMAND_TIMEOUT).connect(attempts=1) as session:
            report["result"] = collect(session, report)
    except (OSError, SdbError) as error:
        report["result"] = "sdb_error"
        report["error_type"] = type(error).__name__
    print(json.dumps(report, indent=2))
    return 1 if report["result"] == "sdb_error" else 0


if __name__ == "__main__":
    raise SystemExit(main())
