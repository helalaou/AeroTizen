"""Native paired backups use the existing CLI baseline schema and validation."""

import json
from pathlib import Path
from types import SimpleNamespace

from aerotizen import home


def test_native_paired_backup_fixture_matches_the_cli_baseline_builder():
    fixture = json.loads((Path(__file__).parent / "fixtures/home-paired-backup.json").read_text())
    session = SimpleNamespace(
        managed_root=True, read_root_home_status=lambda: fixture["reply"]["home_settings"]
    )
    status = home.read_paired_backup_status(session, fixture["identity"], fixture["info"])
    status["queried_at"] = fixture["document"]["captured_at"]
    assert home.baseline_from_status(status) == fixture["document"]
    home.validate_backup(fixture["document"], fixture["identity"])
