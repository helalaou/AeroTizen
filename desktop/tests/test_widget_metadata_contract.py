"""Keep native widget review fixtures aligned with CLI installation metadata."""

import json
import zipfile
from pathlib import Path

import pytest

from aerotizen import catalog, desktop_worker, local_package, releases

FIXTURES = Path(__file__).parent / "fixtures"
CASES = json.loads((FIXTURES / "widget-metadata.json").read_text())


def metadata(path):
    result = local_package.inspect(path)
    if result["package_id"] in catalog.PROTECTED_PKGS - {releases.PACKAGE_ID}:
        raise ValueError("protected package")
    return {**result, "name": desktop_worker.text_value(result["name"], result["app_id"])}


@pytest.mark.parametrize("case", CASES, ids=lambda case: case["name"])
def test_native_widget_metadata_matches_cli(case, tmp_path):
    path = tmp_path / "App.wgt"
    with zipfile.ZipFile(path, "w") as archive:
        archive.writestr("config.xml", case["xml"])
    if "error" in case:
        with pytest.raises(ValueError):
            metadata(path)
    else:
        assert metadata(path) == case["metadata"]


def test_duplicate_widget_fixture_is_rejected_by_cli(tmp_path):
    path = tmp_path / "Duplicate.wgt"
    fixture = json.loads((FIXTURES / "widget-duplicate.json").read_text())
    path.write_bytes(bytes.fromhex(fixture["zip_hex"]))
    with pytest.raises(ValueError, match="unsupported or unsafe"):
        local_package.inspect(path)


@pytest.mark.parametrize(
    "case", json.loads((FIXTURES / "widget-compression.json").read_text()), ids=lambda case: case["name"]
)
def test_native_compression_fixtures_are_valid_cli_widgets(case, tmp_path):
    path = tmp_path / "App.wgt"
    path.write_bytes(bytes.fromhex(case["zip_hex"]))
    assert metadata(path) == CASES[0]["metadata"]
