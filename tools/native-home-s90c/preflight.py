#!/usr/bin/env python3
"""Read-only S90C physical HOME compatibility preflight.

Never installs, stages, launches or runs any native helper. It does not
write settings. The firmware and native original-state still need independent
verification; successful preflight is NOT permission to apply.
"""

import argparse
import ipaddress
import json
import urllib.error
import urllib.request

MODEL = "QE65S90CATXZT"
# Restrict probing to RFC 1918 LAN addresses. ipaddress.is_private also
# accepts special-use/documentation ranges, which are not private home LANs.
RFC1918_NETWORKS = tuple(
    ipaddress.ip_network(net) for net in ("10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16")
)
CAPS = {
    "cpu_arch": "armv7",
    "architecture": "32",
    "platform_version": "9.0",
    "sdk_toolpath": "/home/owner/share/tmp/sdk_tools",
}


def check_host(value):
    """Accept only local IPv4 destinations; avoid querying arbitrary URLs."""
    try:
        host = ipaddress.ip_address(value)
    except ValueError as exc:
        raise argparse.ArgumentTypeError("Use the TV's private IPv4 address") from exc
    if host.version != 4 or not any(host in net for net in RFC1918_NETWORKS):
        raise argparse.ArgumentTypeError("Expected a private, non-loopback TV IPv4 address")
    return str(host)


def check_model(device):
    if not isinstance(device, dict) or device.get("modelName") != MODEL:
        raise RuntimeError("STOP: TV model is not the tested " + MODEL)
    return device.get("modelName")


def check_capabilities(values):
    if not isinstance(values, dict):
        raise RuntimeError("STOP: missing SDB capabilities")
    unexpected = {key: (CAPS[key], values.get(key)) for key in CAPS if values.get(key) != CAPS[key]}
    if unexpected:
        raise RuntimeError("STOP: unsupported SDB architecture/platform: " + repr(unexpected))
    return True


def probe(host):
    url = "http://" + host + ":8001/api/v2/"
    with urllib.request.urlopen(url, timeout=5) as response:
        payload = json.load(response)
    model = check_model(payload.get("device") if isinstance(payload, dict) else None)
    from aerotizen.sdb import Sdb

    with Sdb(host, timeout=9) as device:
        check_capabilities(device.capability())
    return {
        "read_only": True,
        "model": model,
        "architecture": CAPS["cpu_arch"],
        "platform": CAPS["platform_version"],
        "status": "DEVICE_PREFLIGHT_ONLY",
        "native_home": "NOT_QUERIED",
        "firmware": "MUST_BE_VERIFIED_SEPARATELY_BY_NATIVE_GUARD",
        "recovery": "NOT_VALIDATED",
        "permission_to_apply": False,
    }


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only Samsung S90C HOME preflight. Does not modify the TV."
    )
    parser.add_argument(
        "--host", type=check_host, required=True, help="private IPv4 address of the owner's Samsung S90C"
    )
    args = parser.parse_args(argv)
    try:
        print(json.dumps(probe(args.host), indent=2))
    except (OSError, ValueError, RuntimeError, urllib.error.URLError) as error:
        parser.exit(1, "STOP: " + str(error) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
