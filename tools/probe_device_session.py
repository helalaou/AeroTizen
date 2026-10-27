"""Explicit hardware test: direct SDB -> temporary archive-root -> direct SDB.

This acquires root and stages temporary files. It does not change Home settings,
install applications, disable UEP, or install a persistent service.
Run from the checkout with PYTHONPATH=src. Evidence excludes account data and DUID.
"""

import argparse
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

from aerotizen import catalog, remote
from aerotizen.device import DeviceSession
from aerotizen.root import SUPPORTED_VERSION, SamsungTvRoot

COMMANDS = ("id", "uname -m", "cat /etc/os-release")


def inventory_fingerprint(text):
    # vd_applist includes volatile fields and ordering. Compare only installed
    # identities and versions; usage counters and cache sizes are not installs.
    apps = catalog.parse_applist(text)
    if not apps:
        raise RuntimeError("The TV did not return a readable installed-app inventory.")
    stable = sorted((app["appid"], app["pkgid"], app.get("version") or "") for app in apps)
    encoded = json.dumps(stable, separators=(",", ":")).encode()
    return len(apps), hashlib.sha256(encoded).hexdigest()


def snapshot(session):
    duid = session.duid()
    if not duid or "fail" in duid.lower():
        raise RuntimeError("The TV did not return a device identity.")
    count, fingerprint = inventory_fingerprint(session.applist())
    return {
        "device_identity_sha256": hashlib.sha256(duid.encode()).hexdigest(),
        "applications_count": count,
        "applications_sha256": fingerprint,
        "capabilities": session.capability(),
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--tv", required=True, help="TV IPv4 address")
    parser.add_argument("--root-tool", required=True, type=Path)
    parser.add_argument("--sdb", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    report = {
        "schema_version": 1,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "host": args.tv,
        "root_tool_version": SUPPORTED_VERSION,
        "passed": False,
    }
    exit_code = 0
    try:
        info = remote.info(args.tv)
        report["model"] = info.get("modelName")
        report["platform"] = info.get("model")
        provider = SamsungTvRoot(args.root_tool, args.sdb)
        with DeviceSession(args.tv) as session:
            report["before"] = snapshot(session)
            print("Direct SDB verified; starting temporary root handoff.", flush=True)
            try:
                report["root"] = session.root(provider, COMMANDS)
            finally:
                # Report recovery even when the root command or evidence check fails.
                try:
                    report["after"] = snapshot(session)
                    report["same_device"] = (
                        report["before"]["device_identity_sha256"]
                        == report["after"]["device_identity_sha256"]
                    )
                    report["applications_unchanged"] = (
                        report["before"]["applications_sha256"] == report["after"]["applications_sha256"]
                    )
                except Exception as exc:
                    report["recovery_error"] = str(exc)
            if "after" not in report:
                raise RuntimeError("Direct SDB recovery was not verified.")
            report["passed"] = report["same_device"] and report["applications_unchanged"]
            if not report["passed"]:
                raise RuntimeError("Device identity or installed applications changed during the test.")
    except KeyboardInterrupt:
        report["error"] = "Interrupted; check recovery and upstream cleanup before retrying."
        exit_code = 130
    except Exception as exc:
        report["error"] = str(exc)
        exit_code = 1
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(f"{'PASS' if report['passed'] else 'FAIL'}: {args.output}")
    if "error" in report:
        print(report["error"])
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
