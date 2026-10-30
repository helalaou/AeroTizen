"""Build real distributions through the root compatibility route and the CLI package."""

import email
import subprocess
import sys
import tarfile
import zipfile
from pathlib import Path

import pytest
from pyproject_hooks import BuildBackendHookCaller

from aerotizen import __version__

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(scope="module")
def distributions(tmp_path_factory):
    result = {}
    for package in ("root", "cli"):
        source = ROOT if package == "root" else ROOT / "cli"
        output = tmp_path_factory.mktemp(f"package-{package}")
        subprocess.run(
            [sys.executable, "-m", "build", "--no-isolation", "--outdir", str(output), str(source)],
            check=True,
            capture_output=True,
            text=True,
            timeout=120,
        )
        result[package] = {"wheel": next(output.glob("*.whl")), "sdist": next(output.glob("*.tar.gz"))}
    return result


def wheel_files(path):
    with zipfile.ZipFile(path) as archive:
        return {name: archive.read(name) for name in archive.namelist() if not name.endswith("/RECORD")}


def test_root_and_cli_build_the_same_wheel(distributions):
    root = wheel_files(distributions["root"]["wheel"])
    assert root == wheel_files(distributions["cli"]["wheel"])
    metadata_bytes = next(value for name, value in root.items() if name.endswith("/METADATA"))
    metadata = email.message_from_bytes(metadata_bytes)
    assert metadata["Name"] == "aerotizen"
    assert metadata["Version"] == __version__
    assert metadata["Requires-Python"] == ">=3.10"
    assert {value for value in metadata.get_all("Requires-Dist") if "extra ==" not in value} == {
        "websocket-client>=1.6",
        "cryptography>=41",
    }
    entrypoints = next(value for name, value in root.items() if name.endswith("/entry_points.txt"))
    assert b"aerotizen = aerotizen.cli:main" in entrypoints
    for filename in (
        "ca/vd_tizen_dev_public2.crt",
        "ca/vd_tizen_dev_author_ca.cer",
        "helpers/home-query.json",
        "helpers/home-control.json",
    ):
        assert root[f"aerotizen/{filename}"] == (ROOT / "cli/src/aerotizen" / filename).read_bytes()
    assert not any(name.startswith(("launcher/", "cli/", "tools/")) for name in root)


@pytest.mark.parametrize("package", ["root", "cli"])
def test_sdist_builds_without_the_repository(package, distributions, tmp_path):
    with tarfile.open(distributions[package]["sdist"]) as archive:
        assert not any("/obj/" in name or "/bin/" in name for name in archive.getnames())
        archive.extractall(tmp_path, filter="data")
    source = tmp_path / f"aerotizen-{__version__}"
    assert 'build-backend = "setuptools.build_meta"' in (source / "pyproject.toml").read_text()
    assert (source / "native/home-query/HomeQuery.cs").is_file()
    assert (source / "native/home-control/HomeControl.cs").is_file()
    assert (source / "tools/build_release.py").is_file()
    assert not (source / "launcher").exists()
    output = tmp_path / "rebuilt"
    subprocess.run(
        [sys.executable, "-m", "build", "--no-isolation", "--wheel", "--outdir", str(output), str(source)],
        check=True,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert wheel_files(next(output.glob("*.whl"))) == wheel_files(distributions[package]["wheel"])


def test_root_editable_wheel_points_to_cli_source(tmp_path):
    backend = BuildBackendHookCaller(ROOT, "_root_build_backend", backend_path=["cli"])
    filename = backend.build_editable(str(tmp_path))
    with zipfile.ZipFile(tmp_path / filename) as archive:
        paths = [archive.read(name).decode() for name in archive.namelist() if name.endswith(".pth")]
    assert paths == [str(ROOT / "cli/src") + "\n"]
