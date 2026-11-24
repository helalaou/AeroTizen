"""Native Home queries and recovery proofs remain tied to public CLI contracts."""

import json
from pathlib import Path

from aerotizen import home, home_control, sdk

FIXTURES = Path(__file__).parent / "fixtures"


def test_native_home_query_and_baseline_match_cli():
    fixture = json.loads((FIXTURES / "home-control.json").read_text())
    assert (
        home.parse_query(fixture["query_output"], expected_uid=901, cleanup_marker=sdk.CLEANUP_MARKER)
        == fixture["query"]
    )
    assert home.baseline_from_status(fixture["status"]) == fixture["original"]


def test_native_home_recovery_cases_match_cli(tmp_path):
    fixture = json.loads((FIXTURES / "home-recovery.json").read_text())
    raw = bytes.fromhex(fixture["raw_hex"])
    for case in fixture["cases"]:
        directory = tmp_path / case["name"]
        receipts = directory / "transactions"
        receipts.mkdir(parents=True)
        backup = directory / "original-home.json"
        backup.write_bytes(raw)
        for token, receipt in case["receipts"].items():
            (receipts / f"{token}.json").write_text(json.dumps(receipt))
        assert (
            home_control._boot_restore_transaction(case["status"], backup, raw, fixture["digest"])
            == case["active"]
        )
        assert home_control._uninstalled_boot_request(backup, raw, fixture["digest"]) == case["absent"]
