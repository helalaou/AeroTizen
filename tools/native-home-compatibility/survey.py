#!/usr/bin/env python3
"""Read-only Samsung TV HOME compatibility survey.

This script is intentionally NOT an app installer or native HOME activator.
It sends a single TV status GET and asks the existing AeroTizen SDB connector
for capabilities; it never uploads files, runs shell commands or writes vconf.
Matching an independently reported TV does NOT authorize use of any helper.
"""
import argparse
import ipaddress
import json
from pathlib import Path
import urllib.request

REFERENCES = Path(__file__).with_name("references.json")


def private_ipv4(value):
    try:
        address = ipaddress.ip_address(value)
    except ValueError as error:
        raise argparse.ArgumentTypeError("Expected a private TV IPv4 address") from error
    if address.version != 4 or not address.is_private or address.is_loopback or address.is_link_local:
        raise argparse.ArgumentTypeError("Expected a private TV IPv4 address")
    return str(address)


def reference_for(model, catalogue):
    return next((item for item in catalogue["references"] if item["model"] == model), None)


def assess(device, capabilities, catalogue):
    """Offline function. Never authorizes native modification."""
    if not isinstance(device, dict) or not isinstance(capabilities, dict):
        raise ValueError("Missing TV identity or SDB capabilities")
    model = device.get("modelName")
    if not isinstance(model, str) or not model.strip():
        raise ValueError("TV model not reported")
    arch = str(capabilities.get("cpu_arch") or "")
    bits = str(capabilities.get("architecture") or "")
    platform = str(capabilities.get("platform_version") or "")
    if not platform or not arch or not bits:
        raise ValueError("Incomplete SDB capabilities")
    known = reference_for(model, catalogue)
    comparable = known is not None and arch == known["arch"] and bits == known["bitness"] and platform == known["tizen"]
    return {
        "model": model,
        "tizen_reported": platform,
        "cpu_arch_reported": arch,
        "architecture_reported": bits,
        "firmware_reported_unverified": device.get("firmwareVersion") or None,
        "reference_match": comparable,
        "reference_evidence": known["evidence"] if comparable else "unverified",
        "reference_firmware": known["firmware"] if comparable else None,
        "expected_auto_start_is_not_universal": True,
        "native_libraries_checked": False,
        "native_home_values_checked": False,
        "native_helper_compiled_for_this_tv": False,
        "restore_validated": False,
        "native_write_authorized": False,
        "next_step": "Independent native read-only baseline, firmware/library/runtime review, and private restore validation required"
    }


def query_read_only(host):
    with urllib.request.urlopen("http://" + host + ":8001/api/v2/", timeout=5) as response:
        payload = json.load(response)
    if not isinstance(payload, dict):
        raise ValueError("Invalid TV status response")
    # Existing AeroTizen CLI SDB module. Sdb.capability is a read-only command.
    from aerotizen.sdb import Sdb
    with Sdb(host, timeout=9) as connection:
        caps = connection.capability()
    catalog = json.loads(REFERENCES.read_text(encoding="utf-8"))
    return assess(payload.get("device"), caps, catalog)


def main(argv=None):
    parser = argparse.ArgumentParser(description="Samsung TV HOME compatibility: read-only survey")
    parser.add_argument("--host", required=True, type=private_ipv4)
    args = parser.parse_args(argv)
    try:
        print(json.dumps(query_read_only(args.host), indent=2))
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, "STOP: read-only survey failed: " + str(error) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
