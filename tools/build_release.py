"""Build unsigned launcher packages or native CLI archives for GitHub releases."""

import argparse
import hashlib
import json
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
TIZEN = "{http://tizen.org/ns/widgets}"


def check_version(value):
    if not isinstance(value, str) or not VERSION.fullmatch(value):
        raise ValueError(f"Expected a stable three-part version, got {value!r}")
    return value


def check_tag(component, version, tag):
    if tag is not None and tag != f"{component}-v{version}":
        raise ValueError(f"Tag {tag!r} does not match {component}-v{version}")


def checksum(path):
    with path.open("rb") as stream:
        digest = hashlib.sha256()
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def write_checksums(path, assets):
    path.write_text("".join(f"{checksum(asset)}  {asset.name}\n" for asset in assets), encoding="utf-8")


def build_launcher(root, output, tag=None):
    source = root / "launcher"
    launcher = root / "dist/launcher"
    widget = ET.parse(source / "config.xml").getroot()
    version = check_version(widget.get("version"))
    if (source / "version.txt").read_text(encoding="utf-8").strip() != version:
        raise ValueError("Launcher version.txt does not match config.xml")
    check_tag("launcher", version, tag)
    application = widget.find(f"{TIZEN}application")
    if application is None or not application.get("id") or not application.get("package"):
        raise ValueError("Launcher config.xml must contain a Tizen application id and package")
    settings = json.loads((source / "release.json").read_text(encoding="utf-8"))
    minimum = check_version(settings["min_cli_version"])
    if not (launcher / "config.xml").is_file():
        raise ValueError("Compiled launcher is missing; run npm ci and npm run build first")
    if (launcher / "config.xml").read_bytes() != (source / "config.xml").read_bytes():
        raise ValueError("Compiled launcher config.xml is stale; run npm run build again")
    files = [launcher / name for name in ("config.xml", "index.html", "icon.png", "licenses/preact.txt")]
    for directory, suffix in (("css", ".css"), ("js", ".js"), ("service", ".js")):
        files.extend((launcher / directory).rglob(f"*{suffix}"))
    if (launcher / "js/photo-weather.js").is_file():
        # PhotoWeather loads these local scenes at runtime. Keep their provenance
        # with them, and fail packaging rather than silently publishing a broken WGT.
        scenes = ("sun", "partly", "cloud", "rain", "storm", "snow", "fog", "night", "sunset")
        weather = launcher / "assets/weather"
        files.extend(weather / f"{scene}.jpg" for scene in scenes)
        files.extend(weather / name for name in ("CREDITS.md", "MANIFEST.json"))
    for name in (
        "js/settings-ui.js",
        "service/index.js",
        "service/artmode.js",
        "service/home-mode.js",
        "service/home-store.js",
    ):
        if launcher / name not in files:
            raise ValueError(f"Launcher is missing required runtime file {name}")
    for source in files:
        if not source.is_file() or source.resolve() != source.absolute():
            raise ValueError(f"Runtime file must be a regular file without symlinks: {source}")
    if 'id="settings-root"' not in (launcher / "index.html").read_text(encoding="utf-8"):
        raise ValueError("Compiled launcher is missing the Preact Settings mount")

    output.mkdir(parents=True, exist_ok=True)
    package = output / f"aerotizen-launcher-{version}.wgt"
    with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for source in sorted(files):
            # Fixed timestamps, permissions and ordering make the unsigned WGT reproducible.
            info = zipfile.ZipInfo(source.relative_to(launcher).as_posix(), date_time=(1980, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, source.read_bytes())
    manifest = output / "launcher-release.json"
    metadata = {
        "schema_version": 1,
        "version": version,
        "min_cli_version": minimum,
        "app_id": application.get("id"),
        "package_id": application.get("package"),
        "asset": package.name,
        "sha256": checksum(package),
    }
    manifest.write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
    write_checksums(output / "SHA256SUMS", [package, manifest])
    return package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("component", choices=("launcher", "cli"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--tag", help="Check that the release tag matches the component version")
    args = parser.parse_args()
    try:
        if args.component == "cli":
            command = [
                sys.executable,
                str(ROOT / "cli/tools/build_release.py"),
                "--output",
                str(args.output.resolve()),
            ]
            if args.tag is not None:
                command.extend(["--tag", args.tag])
            subprocess.run(command, check=True)
            return
        package = build_launcher(ROOT, args.output.resolve(), args.tag)
    except (KeyError, ValueError, OSError, ET.ParseError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Release build failed: {error}\n")
    print(package)


if __name__ == "__main__":
    main()
