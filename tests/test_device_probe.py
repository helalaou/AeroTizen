"""The hardware gate compares installed metadata, not volatile TV counters."""

import runpy
from pathlib import Path

import pytest

probe = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools" / "probe_device_session.py"))


def app(app_id="Example.App", package="Example", version="1.0", uses=1, size=100):
    fields = {
        "app_id": app_id,
        "app_tizen_id": app_id,
        "app_package_name": package,
        "app_version": version,
        "use_count": uses,
        "app_size": size,
    }
    return (
        "-" * 93
        + "\n"
        + "".join(f"--------------{key:<36}={value}-------------\n" for key, value in fields.items())
    )


def test_inventory_ignores_order_usage_and_size():
    before = app() + app("Other.App", "Other")
    after = app("Other.App", "Other", uses=99, size=200) + app(uses=3, size=10)
    assert before != after
    assert probe["inventory_fingerprint"](before) == probe["inventory_fingerprint"](after)


@pytest.mark.parametrize(
    "changed",
    [
        app(version="2.0"),
        app(app_id="Different.App"),
        app(package="Different"),
        app() + app("Other.App", "Other"),
    ],
)
def test_inventory_detects_installed_metadata_changes(changed):
    assert probe["inventory_fingerprint"](app()) != probe["inventory_fingerprint"](changed)


def test_empty_inventory_cannot_pass():
    with pytest.raises(RuntimeError, match="inventory"):
        probe["inventory_fingerprint"]("")
