"""Release widget validation stays aligned with the public CLI."""

import json
from pathlib import Path

import pytest

from aerotizen import releases

FIXTURE = json.loads((Path(__file__).parent / "fixtures/launcher-download.json").read_text())


@pytest.mark.parametrize("case", FIXTURE["packages"], ids=lambda case: case["name"])
def test_native_launcher_package_fixture_matches_cli(case):
    data = bytes.fromhex(case["zip_hex"])
    if case["valid"]:
        releases._check_package(data, FIXTURE["version"])
    else:
        with pytest.raises(releases.ReleaseError):
            releases._check_package(data, FIXTURE["version"])
