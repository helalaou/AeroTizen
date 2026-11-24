"""Native SDK staging remains byte-compatible with the public CLI transport."""

import json
from pathlib import Path

from aerotizen import sdk


def test_sdk_transport_fixture_matches_cli():
    fixture = json.loads((Path(__file__).parent / "fixtures/sdk-transport.json").read_text())
    files = {item["name"]: bytes.fromhex(item["data_hex"]) for item in fixture["files"]}
    script, command, stage, paths = sdk.build_script(
        files, fixture["entrypoint"], fixture["args"], fixture["callback"], fixture["port"], fixture["token"]
    )
    assert script == fixture["script"]
    assert command == fixture["command"]
    assert stage == fixture["stage"]
    assert paths == fixture["paths"]
