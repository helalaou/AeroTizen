"""Root package scripts and pinned upstream files match the public CLI."""

import json
from pathlib import Path

from aerotizen import root_package, untethered_probe


def test_native_root_package_fixture_matches_cli():
    fixture = json.loads((Path(__file__).parent / "fixtures/root-package.json").read_text())
    assert fixture["upstream_hashes"] == root_package.UPSTREAM
    assert (
        untethered_probe.proof_script(
            fixture["package"], fixture["nonce"], root_package.UPSTREAM["SamsungTvArchiveRoot.dll"]
        ).decode()
        == fixture["proof_script"]
    )
    for case in fixture["services"]:
        assert root_package.service_script(case["descriptor"], fixture["nonce"]).decode() == case["script"]

    receipt = json.loads((Path(__file__).parent / "fixtures/root-receipt.json").read_text())
    config = root_package.public_config(
        receipt, {name: b"managed test data" for name in root_package.MANAGED}
    )
    assert config == fixture["configuration"]
    assert root_package.config_bytes(config).decode() == fixture["configuration_json"]
