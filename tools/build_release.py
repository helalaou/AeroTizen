"""Build unsigned launcher packages or native CLI archives for GitHub releases."""

import argparse
import ast
import hashlib
import json
import os
import platform
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
VERSION = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")
TIZEN = "{http://tizen.org/ns/widgets}"
ENTRYPOINTS = {"aerotizen": "cli"}


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
    launcher = root / "launcher"
    widget = ET.parse(launcher / "config.xml").getroot()
    version = check_version(widget.get("version"))
    if (launcher / "version.txt").read_text(encoding="utf-8").strip() != version:
        raise ValueError("Launcher version.txt does not match config.xml")
    check_tag("launcher", version, tag)
    application = widget.find(f"{TIZEN}application")
    if application is None or not application.get("id") or not application.get("package"):
        raise ValueError("Launcher config.xml must contain a Tizen application id and package")
    settings = json.loads((launcher / "release.json").read_text(encoding="utf-8"))
    minimum = check_version(settings["min_cli_version"])
    files = [launcher / name for name in ("config.xml", "index.html", "icon.png")]
    for directory, suffix in (("css", ".css"), ("js", ".js"), ("service", ".js")):
        files.extend((launcher / directory).rglob(f"*{suffix}"))
    for name in ("service/index.js", "service/artmode.js"):
        if launcher / name not in files:
            raise ValueError(f"Launcher is missing required runtime file {name}")
    for source in files:
        if not source.is_file() or source.resolve() != source.absolute():
            raise ValueError(f"Runtime file must be a regular file without symlinks: {source}")

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


def cli_version(root):
    source = ast.parse((root / "src/aerotizen/__init__.py").read_text(encoding="utf-8"))
    for statement in source.body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "__version__" for target in statement.targets
        ):
            return check_version(ast.literal_eval(statement.value))
    raise ValueError("Missing CLI __version__")


def platform_name():
    systems = {"Linux": "linux", "Darwin": "macos", "Windows": "windows"}
    architectures = {"x86_64": "x86_64", "amd64": "x86_64", "aarch64": "arm64", "arm64": "arm64"}
    try:
        return f"{systems[platform.system()]}-{architectures[platform.machine().lower()]}"
    except KeyError as error:
        raise ValueError(f"Unsupported build platform: {platform.system()} {platform.machine()}") from error


def smoke_binaries(binaries, version):
    """Run copied executables outside the checkout with no Python or source path."""
    with tempfile.TemporaryDirectory(prefix="aerotizen-smoke-") as temporary:
        directory = Path(temporary)
        env = {key: value for key, value in os.environ.items() if not key.startswith("PYTHON")}
        env["PATH"] = ""
        for binary in binaries:
            copied = directory / binary.name
            shutil.copy2(binary, copied)
            for argument in ("--help", "--version"):
                result = subprocess.run(
                    [str(copied), argument],
                    cwd=directory,
                    env=env,
                    check=False,
                    capture_output=True,
                    text=True,
                    timeout=60,
                )
                if result.returncode:
                    raise ValueError(f"{binary.name} {argument} failed: {result.stdout}{result.stderr}")
                if argument == "--version" and version not in result.stdout:
                    raise ValueError(f"{binary.name} reports the wrong version: {result.stdout!r}")


def build_cli(root, output, tag=None):
    version = cli_version(root)
    check_tag("cli", version, tag)
    target = platform_name()
    output.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="aerotizen-build-") as temporary:
        work = Path(temporary)
        # Frozen OpenSSL must not depend on the build machine's certificate path.
        tls_hook = work / "tls_roots.py"
        tls_hook.write_text(
            'import os\nimport certifi\nos.environ.setdefault("SSL_CERT_FILE", certifi.where())\n',
            encoding="utf-8",
        )
        binaries = []
        for name, module in ENTRYPOINTS.items():
            # Do not name the entry script aerotizen.py: it would shadow the package.
            entry = work / f"run_{module}.py"
            entry.write_text(f"from aerotizen.{module} import main\n\nmain()\n", encoding="utf-8")
            subprocess.run(
                [
                    sys.executable,
                    "-m",
                    "PyInstaller",
                    "--noconfirm",
                    "--clean",
                    "--onefile",
                    "--console",
                    "--noupx",
                    "--name",
                    name,
                    "--paths",
                    str(root / "src"),
                    "--collect-data",
                    "aerotizen",
                    "--collect-data",
                    "certifi",
                    "--runtime-hook",
                    str(tls_hook),
                    "--distpath",
                    str(work / "bin"),
                    "--workpath",
                    str(work / "build" / name),
                    "--specpath",
                    str(work),
                    str(entry),
                ],
                cwd=root,
                check=True,
            )
            suffix = ".exe" if platform.system() == "Windows" else ""
            binaries.append(work / "bin" / f"{name}{suffix}")
        smoke_binaries(binaries, version)
        assets = [*binaries, root / "LICENSE"]
        filename = f"aerotizen-{version}-{target}"
        if platform.system() == "Windows":
            package = output / f"{filename}.zip"
            with zipfile.ZipFile(package, "w", compression=zipfile.ZIP_DEFLATED) as archive:
                for asset in assets:
                    archive.write(asset, asset.name)
        else:
            package = output / f"{filename}.tar.gz"
            with tarfile.open(package, "w:gz") as archive:
                for asset in assets:
                    archive.add(asset, arcname=asset.name)
    write_checksums(output / f"{package.name}.sha256", [package])
    return package


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("component", choices=("launcher", "cli"))
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    parser.add_argument("--tag", help="Check that the release tag matches the component version")
    args = parser.parse_args()
    try:
        builder = build_launcher if args.component == "launcher" else build_cli
        package = builder(ROOT, args.output.resolve(), args.tag)
    except (KeyError, ValueError, OSError, ET.ParseError, subprocess.SubprocessError) as error:
        parser.exit(1, f"Release build failed: {error}\n")
    print(package)


if __name__ == "__main__":
    main()
