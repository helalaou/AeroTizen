"""Keep native inventory fixtures tied to the current CLI rules and revision bytes."""

import json
from pathlib import Path

import pytest

from aerotizen import buttons, catalog, desktop_worker
from aerotizen.cli import packages

FIXTURE = json.loads((Path(__file__).parent / "fixtures/app-inventory.json").read_text())


def test_protection_policy_matches_the_native_contract_fixture():
    assert FIXTURE["protected_packages"] == sorted(catalog.PROTECTED_PKGS)
    assert FIXTURE["protected_hints"] == list(catalog.PROTECTED_NAME_HINTS)


@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda case: case["name"])
def test_inventory_projection_matches_current_cli(case):
    def project():
        rows = desktop_worker.app_rows(packages(case["raw"]))
        names = {
            app["appid"]: desktop_worker.text_value(app["name"], app["appid"])
            for app in catalog.parse_applist(case["raw"])
            if buttons.APP_ID.fullmatch(app["appid"])
        }
        targets = [
            {"id": app_id, "name": name}
            for app_id, name in sorted(names.items(), key=lambda app: (app[1].casefold(), app[0]))
        ]
        return rows, targets

    if "error" in case:
        with pytest.raises((ValueError, TypeError, KeyError)):
            project()
    else:
        rows, targets = project()
        assert rows == case["packages"]
        assert targets == case["targets"]
