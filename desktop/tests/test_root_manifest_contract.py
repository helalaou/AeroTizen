"""Native root-runtime manifest rules stay aligned with the public CLI."""

from pathlib import Path

import pytest

from aerotizen import root_package, root_state


def test_native_root_manifest_fixture_matches_cli():
    xml = (
        (Path(__file__).parent / "fixtures/root-manifest.xml")
        .read_text()
        .replace("ROOT_RUNTIME_VERSION", root_state.RUNTIME_VERSION)
    )
    root_package.validate_manifest(xml.encode())
    for old, new in [
        ('on-boot="true"', 'on-boot="false"'),
        ("tv-samsung", "mobile"),
        ("privilege/internet", "privilege/other"),
    ]:
        with pytest.raises(ValueError):
            root_package.validate_manifest(xml.replace(old, new).encode())
