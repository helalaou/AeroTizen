"""Verify release contents and version contracts before publishing assets."""

import hashlib
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import zipfile
from pathlib import Path

import pytest

from aerotizen import releases

ROOT = Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location("build_release", ROOT / "tools/build_release.py")
build = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(build)


@pytest.fixture
def launcher(tmp_path):
    root = tmp_path / "repo"
    app = root / "launcher"
    for folder in ("css", "js", "service"):
        (app / folder).mkdir(parents=True)
    (app / "config.xml").write_text(
        '<widget xmlns="http://www.w3.org/ns/widgets" '
        'xmlns:tizen="http://tizen.org/ns/widgets" version="2.3.0">'
        '<tizen:application id="DclHome001.Home" package="DclHome001"/></widget>'
    )
    for filename in (
        "index.html",
        "icon.png",
        "css/style.css",
        "js/main.js",
        "service/index.js",
        "service/artmode.js",
        "service/home-mode.js",
        "service/home-store.js",
    ):
        (app / filename).write_bytes(f"contents: {filename}".encode())
    (app / "release.json").write_text('{"min_cli_version": "2.2.0"}')
    (app / "version.txt").write_text("2.3.0\n")
    for filename in (
        "CHANGELOG.md",
        "author-signature.xml",
        "signature1.xml",
        "js/main.js.map",
        "service/README.md",
        "css/.DS_Store",
    ):
        (app / filename).write_text("must not ship")
    runtime = root / "dist/launcher"
    shutil.copytree(app, runtime)
    (runtime / "index.html").write_text('<div id="settings-root"></div>')
    (runtime / "js/settings-ui.js").write_text("compiled Settings")
    (runtime / "licenses").mkdir()
    (runtime / "licenses/preact.txt").write_text("MIT License")
    (runtime / "src/settings").mkdir(parents=True)
    (runtime / "src/settings/index.tsx").write_text("must not ship")
    return root


def test_launcher_is_unsigned_deterministic_and_has_verified_manifest(launcher, tmp_path):
    first = build.build_launcher(launcher, tmp_path / "first", "launcher-v2.3.0")
    for source in (launcher / "dist/launcher").rglob("*"):
        os.utime(source, (1_800_000_000, 1_800_000_000))
    second = build.build_launcher(launcher, tmp_path / "second", "launcher-v2.3.0")
    assert first.read_bytes() == second.read_bytes()
    with zipfile.ZipFile(first) as archive:
        assert archive.namelist() == [
            "config.xml",
            "css/style.css",
            "icon.png",
            "index.html",
            "js/main.js",
            "js/settings-ui.js",
            "licenses/preact.txt",
            "service/artmode.js",
            "service/home-mode.js",
            "service/home-store.js",
            "service/index.js",
        ]
        for name in archive.namelist():
            assert archive.read(name) == (launcher / "dist/launcher" / name).read_bytes()
    manifest = json.loads((first.parent / "launcher-release.json").read_text())
    assert manifest == {
        "schema_version": 1,
        "version": "2.3.0",
        "min_cli_version": "2.2.0",
        "app_id": "DclHome001.Home",
        "package_id": "DclHome001",
        "asset": "aerotizen-launcher-2.3.0.wgt",
        "sha256": hashlib.sha256(first.read_bytes()).hexdigest(),
    }
    for line in (first.parent / "SHA256SUMS").read_text().splitlines():
        digest, name = line.split("  ")
        assert hashlib.sha256((first.parent / name).read_bytes()).hexdigest() == digest


def test_built_launcher_passes_download_verification(launcher, tmp_path, monkeypatch):
    package = build.build_launcher(launcher, tmp_path / "assets", "launcher-v2.3.0")
    base = "https://github.com/helalaou/AeroTizen/releases/download/launcher-v2.3.0/"
    metadata = {
        "tag_name": "launcher-v2.3.0",
        "assets": [
            {"name": name, "browser_download_url": base + name}
            for name in ("launcher-release.json", package.name)
        ],
    }
    monkeypatch.setattr(releases, "__version__", "2.2.0")
    monkeypatch.setattr(releases, "_release", lambda *args: (metadata, "2.3.0"))

    def read_asset(url, limit):
        assert url.startswith(base)
        data = (package.parent / url.removeprefix(base)).read_bytes()
        assert len(data) <= limit
        return data

    monkeypatch.setattr(releases, "_read_url", read_asset)
    destination = tmp_path / "download"
    destination.mkdir()
    downloaded = releases.download_launcher(destination)
    assert downloaded.version == "2.3.0"
    assert downloaded.path.read_bytes() == package.read_bytes()


@pytest.mark.parametrize("tag", ["cli-v2.3.0", "launcher-v2.4.0", "launcher-v2.3.0-rc.1"])
def test_launcher_rejects_wrong_release_tag(launcher, tmp_path, tag):
    with pytest.raises(ValueError, match="does not match"):
        build.build_launcher(launcher, tmp_path / "dist", tag)
    assert not (tmp_path / "dist").exists()


def test_launcher_rejects_mismatched_versions(launcher, tmp_path):
    (launcher / "launcher/version.txt").write_text("2.2.0")
    with pytest.raises(ValueError, match=r"version\.txt"):
        build.build_launcher(launcher, tmp_path / "dist")


def test_launcher_requires_background_service(launcher, tmp_path):
    (launcher / "dist/launcher/service/index.js").unlink()
    with pytest.raises(ValueError, match="missing required runtime file"):
        build.build_launcher(launcher, tmp_path / "dist")


@pytest.mark.skipif(sys.platform == "win32", reason="Creating symlinks requires elevated Windows privileges")
def test_launcher_rejects_symlink_runtime_file(launcher, tmp_path):
    source = launcher / "dist/launcher/js/main.js"
    source.unlink()
    source.symlink_to(launcher / "launcher/release.json")
    with pytest.raises(ValueError, match="without symlinks"):
        build.build_launcher(launcher, tmp_path / "dist")


def test_launcher_requires_compiled_runtime(launcher, tmp_path):
    shutil.rmtree(launcher / "dist/launcher")
    with pytest.raises(ValueError, match="run npm ci and npm run build"):
        build.build_launcher(launcher, tmp_path / "assets")
    assert not (tmp_path / "assets").exists()


def test_launcher_rejects_stale_compiled_manifest(launcher, tmp_path):
    manifest = launcher / "dist/launcher/config.xml"
    manifest.write_text(manifest.read_text().replace('version="2.3.0"', 'version="2.2.0"'))
    with pytest.raises(ValueError, match="stale"):
        build.build_launcher(launcher, tmp_path / "assets")
    assert not (tmp_path / "assets").exists()


@pytest.mark.parametrize("name", ["js/settings-ui.js", "licenses/preact.txt"])
def test_launcher_requires_preact_runtime_and_license(launcher, tmp_path, name):
    (launcher / "dist/launcher" / name).unlink()
    with pytest.raises(ValueError, match=r"(?i)runtime file"):
        build.build_launcher(launcher, tmp_path / "assets")
    assert not (tmp_path / "assets").exists()


def test_launcher_rejects_legacy_settings_markup(launcher, tmp_path):
    (launcher / "dist/launcher/index.html").write_text('<div id="editor"></div>')
    with pytest.raises(ValueError, match="Preact Settings mount"):
        build.build_launcher(launcher, tmp_path / "assets")
    assert not (tmp_path / "assets").exists()


def test_cli_tag_must_match_before_build_starts(tmp_path):
    with pytest.raises(ValueError, match="does not match"):
        build.build_cli(ROOT, tmp_path / "dist", "launcher-v0.0.0")
    assert not (tmp_path / "dist").exists()


@pytest.mark.parametrize(
    "arguments",
    [
        ("--help",),
        ("--version",),
        ("inspect", "--help"),
        ("home", "status", "--help"),
        ("home", "backup", "--help"),
        ("home", "apply", "--help"),
        ("home", "restore", "--help"),
    ],
)
def test_cli_options_do_not_contact_tv(arguments, tmp_path):
    result = subprocess.run(
        [sys.executable, "-m", "aerotizen.cli", *arguments],
        cwd=tmp_path,
        capture_output=True,
        text=True,
        check=True,
        timeout=5,
    )
    assert "aerotizen" in result.stdout


def test_cli_release_requires_the_home_helper_before_freezing(tmp_path):
    source = tmp_path / "src/aerotizen"
    source.mkdir(parents=True)
    (source / "__init__.py").write_text('__version__ = "2.2.0"\n')
    with pytest.raises(ValueError, match="Home helper"):
        build.build_cli(tmp_path, tmp_path / "output")
    assert not (tmp_path / "output").exists()


def add_weather_runtime(launcher):
    runtime = launcher / "dist/launcher"
    (runtime / "js/photo-weather.js").write_text("local weather scenes")
    weather = runtime / "assets/weather"
    weather.mkdir(parents=True)
    names = [
        f"{scene}.jpg"
        for scene in ("sun", "partly", "cloud", "rain", "storm", "snow", "fog", "night", "sunset")
    ]
    for name in [*names, "CREDITS.md", "MANIFEST.json"]:
        (weather / name).write_bytes(f"original asset: {name}".encode())
    return weather


def test_weather_release_includes_all_scenes_and_provenance_without_changing_bytes(launcher, tmp_path):
    weather = add_weather_runtime(launcher)
    first = build.build_launcher(launcher, tmp_path / "first")
    second = build.build_launcher(launcher, tmp_path / "second")
    assert first.read_bytes() == second.read_bytes()
    with zipfile.ZipFile(first) as archive:
        names = [name for name in archive.namelist() if name.startswith("assets/weather/")]
        assert len(names) == 11
        for path in weather.iterdir():
            assert archive.read("assets/weather/" + path.name) == path.read_bytes()


@pytest.mark.parametrize("missing", ["night.jpg", "CREDITS.md", "MANIFEST.json"])
def test_weather_release_refuses_missing_runtime_asset_or_provenance(launcher, tmp_path, missing):
    weather = add_weather_runtime(launcher)
    (weather / missing).unlink()
    with pytest.raises(ValueError, match="Runtime file"):
        build.build_launcher(launcher, tmp_path / "output")
    assert not (tmp_path / "output").exists()
