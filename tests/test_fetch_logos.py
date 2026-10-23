import io
import json
import runpy
import urllib.request
from pathlib import Path

import pytest

generator = runpy.run_path(str(Path(__file__).resolve().parents[1] / "tools" / "fetch_logos.py"))


def write_catalog(tmp_path, apps):
    path = tmp_path / "app-catalog.js"
    path.write_text(
        "// Data-only catalogue\nwindow.AeroTizen.catalog = " + json.dumps({"apps": apps}) + ";\n",
        encoding="utf-8",
    )
    return path


def app_with_logo(key, slug="example", version="1.2.3"):
    return {"key": key, "fallback": {"logo": {"slug": slug, "version": version}}}


def test_real_catalogue_sources_match_generated_logos():
    sources = generator["logo_sources"]()
    output = generator["OUT"].read_text(encoding="utf-8")
    logos = json.loads(output.split("window.LOGOS = ", 1)[1].strip().removesuffix(";"))
    assert sources.keys() == logos.keys()


def test_generator_uses_catalogue_sources_and_skips_apps_without_logos(tmp_path, monkeypatch):
    catalog = write_catalog(
        tmp_path,
        [
            app_with_logo("first"),
            app_with_logo("shared"),
            app_with_logo("second", "other", "4.5.6"),
            {"key": "native-artwork"},
            {"key": "app-icon", "fallback": {"logo": None}},
        ],
    )
    requests = []

    def fetch(url, timeout):
        requests.append(url)
        return io.BytesIO(b'<svg><path d="M0 0h24"/></svg>')

    monkeypatch.setattr(urllib.request, "urlopen", fetch)
    output = tmp_path / "logos.js"
    generator["generate"](catalog, output)
    assert requests == [
        "https://cdn.jsdelivr.net/npm/simple-icons@1.2.3/icons/example.svg",
        "https://cdn.jsdelivr.net/npm/simple-icons@4.5.6/icons/other.svg",
    ]
    logos = json.loads(output.read_text().split("window.LOGOS = ", 1)[1].strip().removesuffix(";"))
    assert logos == {"example": "M0 0h24", "other": "M0 0h24"}


@pytest.mark.parametrize(
    "apps, message",
    [
        ([app_with_logo("invalid", version="latest")], "Invalid logo version"),
        ([app_with_logo("first"), app_with_logo("second", version="2.0.0")], "Conflicting source versions"),
    ],
)
def test_invalid_sources_leave_generated_file_intact(tmp_path, monkeypatch, apps, message):
    catalog = write_catalog(tmp_path, apps)
    output = tmp_path / "logos.js"
    output.write_text("existing logos")

    def unexpected_fetch(*args, **kwargs):
        pytest.fail("Invalid catalogue must fail before fetching any logos")

    monkeypatch.setattr(urllib.request, "urlopen", unexpected_fetch)
    with pytest.raises(ValueError, match=message):
        generator["generate"](catalog, output)
    assert output.read_text() == "existing logos"


def test_missing_svg_path_leaves_generated_file_intact(tmp_path, monkeypatch):
    catalog = write_catalog(tmp_path, [app_with_logo("example")])
    output = tmp_path / "logos.js"
    output.write_text("existing logos")
    monkeypatch.setattr(urllib.request, "urlopen", lambda *args, **kwargs: io.BytesIO(b"<svg/>"))
    with pytest.raises(ValueError, match="No SVG path found"):
        generator["generate"](catalog, output)
    assert output.read_text() == "existing logos"
