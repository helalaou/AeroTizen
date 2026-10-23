"""Download and verify unsigned launcher assets from GitHub releases."""

import hashlib
import http.client
import io
import json
import re
import stat
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
import zlib
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

from aerotizen import __version__

DEFAULT_REPOSITORY = "helalaou/AeroTizen"
APP_ID = "DclHome001.Home"
PACKAGE_ID = "DclHome001"
MAX_JSON_BYTES = 2 * 1024 * 1024
MAX_PACKAGE_BYTES = 64 * 1024 * 1024
MAX_UNPACKED_BYTES = 128 * 1024 * 1024
VERSION = re.compile(r"(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)")


class ReleaseError(ValueError):
    """A release cannot be downloaded or is not safe to install."""


@dataclass(frozen=True)
class DownloadedLauncher:
    path: Path
    version: str


def _version(value):
    if not isinstance(value, str) or not VERSION.fullmatch(value):
        raise ReleaseError("Expected a stable version in X.Y.Z form.")
    return tuple(int(part) for part in value.split("."))


class _HTTPSRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urllib.parse.urlsplit(newurl).scheme != "https":
            raise ReleaseError("GitHub redirected the download to an insecure URL.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _read_url(url, limit):
    request = urllib.request.Request(
        url,
        headers={"User-Agent": f"aerotizen/{__version__}", "Accept": "application/octet-stream"},
    )
    if urllib.parse.urlsplit(url).netloc == "api.github.com":
        request.add_header("Accept", "application/vnd.github+json")
    try:
        with urllib.request.build_opener(_HTTPSRedirect()).open(request, timeout=30) as response:
            data = response.read(limit + 1)
    except urllib.error.HTTPError as exc:
        with exc:
            if exc.code == 404:
                message = "Release or asset not found. Check the repository and requested version."
            elif exc.code in (403, 429):
                message = "GitHub refused the request or its rate limit was reached. Try again later."
            else:
                message = f"GitHub download failed (HTTP {exc.code}). Try again later."
        raise ReleaseError(message) from exc
    except (OSError, http.client.HTTPException) as exc:
        raise ReleaseError(f"Could not download the launcher: {exc}. Check your connection.") from exc
    if len(data) > limit:
        raise ReleaseError("Release data exceeds the allowed download size.")
    return data


def _json_url(url):
    try:
        return json.loads(_read_url(url, MAX_JSON_BYTES))
    except (ValueError, UnicodeError) as exc:
        if isinstance(exc, ReleaseError):
            raise
        raise ReleaseError("GitHub returned invalid release JSON.") from exc


def _release(repository, version):
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", repository) or any(
        part in (".", "..") for part in repository.split("/")
    ):
        raise ReleaseError("Release repository must be OWNER/REPO, for example helalaou/AeroTizen.")
    api = f"https://api.github.com/repos/{repository}/releases"
    if version is not None:
        _version(version)
        release = _json_url(f"{api}/tags/launcher-v{version}")
        if (
            not isinstance(release, dict)
            or release.get("draft", True)
            or release.get("prerelease", True)
            or release.get("tag_name") != f"launcher-v{version}"
        ):
            raise ReleaseError("The requested version is not a published stable launcher release.")
        return release, version

    candidates = []
    # CLI releases share this listing. Read all pages, then compare launcher versions.
    for page in range(1, 101):
        releases = _json_url(f"{api}?per_page=100&page={page}")
        if not isinstance(releases, list):
            raise ReleaseError("GitHub returned an invalid release list.")
        for release in releases:
            if not isinstance(release, dict):
                raise ReleaseError("GitHub returned an invalid release entry.")
            tag = release.get("tag_name", "")
            if (
                release.get("draft", True)
                or release.get("prerelease", True)
                or not isinstance(tag, str)
                or not tag.startswith("launcher-v")
                or not VERSION.fullmatch(tag.removeprefix("launcher-v"))
            ):
                continue
            found = tag.removeprefix("launcher-v")
            candidates.append((_version(found), release, found))
        if len(releases) < 100:
            break
    else:
        raise ReleaseError("Too many releases to select safely. Use --version X.Y.Z.")
    if not candidates:
        raise ReleaseError(
            f"No stable launcher release is published in {repository}. "
            "Use an explicit local path (install ./launcher) for a development build."
        )
    _, release, found = max(candidates, key=lambda entry: entry[0])
    return release, found


def _asset_url(release, repository, name):
    assets = release.get("assets")
    if not isinstance(assets, list):
        raise ReleaseError("The launcher release has no asset list.")
    matches = [asset for asset in assets if isinstance(asset, dict) and asset.get("name") == name]
    if len(matches) != 1:
        raise ReleaseError(f"The launcher release must contain exactly one {name} asset.")
    prefix = f"https://github.com/{repository}/releases/download/"
    suffix = f"{release['tag_name']}/{name}"
    actual = matches[0].get("browser_download_url")
    if (
        not isinstance(actual, str)
        or actual[: len(prefix)].lower() != prefix.lower()
        or actual[len(prefix) :] != suffix
    ):
        raise ReleaseError(f"Unexpected download URL for {name}.")
    return actual


def _check_package(data, version):
    try:
        with zipfile.ZipFile(io.BytesIO(data)) as package:
            entries = package.infolist()
            if len(entries) > 4096 or sum(entry.file_size for entry in entries) > MAX_UNPACKED_BYTES:
                raise ReleaseError("The launcher package is too large when unpacked.")
            names = set()
            for entry in entries:
                name = entry.filename
                path = PurePosixPath(name)
                if (
                    path.is_absolute()
                    or ".." in path.parts
                    or "\\" in name
                    or ":" in name
                    or name in names
                    or stat.S_ISLNK(entry.external_attr >> 16)
                    or entry.flag_bits & 1
                ):
                    raise ReleaseError("The launcher package contains unsafe or duplicate paths.")
                if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
                    raise ReleaseError("The launcher package uses an unsupported compression method.")
                if path.name in ("author-signature.xml", "signature1.xml"):
                    raise ReleaseError("Expected an unsigned launcher package.")
                names.add(name)
            required = {"config.xml", "index.html", "service/index.js", "service/artmode.js"}
            if not required <= names:
                raise ReleaseError("The launcher package is missing required application files.")
            config = package.read("config.xml")
            if len(config) > 64 * 1024 or b"<!DOCTYPE" in config.upper() or b"<!ENTITY" in config.upper():
                raise ReleaseError("The launcher config.xml is invalid.")
            root = ET.fromstring(config)
            app = root.find("{http://tizen.org/ns/widgets}application")
            if (
                root.tag != "{http://www.w3.org/ns/widgets}widget"
                or root.get("version") != version
                or app is None
                or app.get("id") != APP_ID
                or app.get("package") != PACKAGE_ID
            ):
                raise ReleaseError("The launcher package identity or version does not match its release.")
            # Read every entry to check CRCs before handing the archive to the signer.
            if package.testzip() is not None:
                raise ReleaseError("The launcher package is corrupt.")
    except (
        zipfile.BadZipFile,
        zlib.error,
        ET.ParseError,
        KeyError,
        RuntimeError,
        NotImplementedError,
    ) as exc:
        raise ReleaseError("The launcher release is not a valid application package.") from exc


def download_launcher(destination, *, version=None, repository=DEFAULT_REPOSITORY):
    """Download a stable release, verify it, then write an unsigned widget to destination."""
    release, version = _release(repository, version)
    manifest = _json_url(_asset_url(release, repository, "launcher-release.json"))
    name = f"aerotizen-launcher-{version}.wgt"
    if (
        not isinstance(manifest, dict)
        or type(manifest.get("schema_version")) is not int
        or manifest["schema_version"] != 1
        or manifest.get("version") != version
        or manifest.get("asset") != name
        or manifest.get("app_id") != APP_ID
        or manifest.get("package_id") != PACKAGE_ID
        or not isinstance(manifest.get("sha256"), str)
        or not re.fullmatch(r"[0-9a-f]{64}", manifest["sha256"])
    ):
        raise ReleaseError("The launcher release manifest is invalid or uses an unsupported format.")
    if _version(__version__) < _version(manifest.get("min_cli_version")):
        raise ReleaseError(
            f"Launcher {version} needs AeroTizen CLI {manifest['min_cli_version']} or newer. "
            f"Your CLI is {__version__}; update it first."
        )
    data = _read_url(_asset_url(release, repository, name), MAX_PACKAGE_BYTES)
    if hashlib.sha256(data).hexdigest() != manifest["sha256"]:
        raise ReleaseError("Launcher checksum mismatch. The package was not installed; try again later.")
    _check_package(data, version)
    path = Path(destination) / name
    path.write_bytes(data)
    return DownloadedLauncher(path=path, version=version)
