"""Validate and snapshot a user-selected widget before desktop installation."""

import hashlib
import re
import stat
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath

from aerotizen.cli import app_metadata_of

MAX_WIDGET_BYTES = 256 * 1024 * 1024
MAX_UNPACKED_BYTES = 512 * 1024 * 1024
MAX_WIDGET_ENTRIES = 10_000
MAX_CONFIG_BYTES = 256 * 1024
COPY_CHUNK_BYTES = 1024 * 1024
MAX_IDENTIFIER_CHARACTERS = 256
MAX_VERSION_CHARACTERS = 64
PACKAGE_IDENTIFIER = re.compile(rf"[A-Za-z0-9_.-]{{1,{MAX_IDENTIFIER_CHARACTERS}}}")
WIDGET_VERSION = re.compile(r"[0-9]+(?:\.[0-9]+){0,3}")
WIDGET_NAMESPACE = "{http://www.w3.org/ns/widgets}"
TIZEN_NAMESPACE = "{http://tizen.org/ns/widgets}"


def inspect(path):
    path = Path(path)
    if not path.is_file() or path.suffix.lower() != ".wgt":
        raise ValueError("Choose a .wgt app file.")
    if not 0 < path.stat().st_size <= MAX_WIDGET_BYTES:
        raise ValueError("Choose a .wgt file smaller than 256 MiB.")
    try:
        with zipfile.ZipFile(path) as archive:
            entries = archive.infolist()
            names = [entry.filename for entry in entries]
            if (
                len(entries) > MAX_WIDGET_ENTRIES
                or sum(entry.file_size for entry in entries) > MAX_UNPACKED_BYTES
                or len(set(names)) != len(names)
                or any(
                    entry.flag_bits & 1
                    or "\\" in entry.filename
                    or ":" in entry.filename
                    or PurePosixPath(entry.filename).is_absolute()
                    or ".." in PurePosixPath(entry.filename).parts
                    or stat.S_ISLNK(entry.external_attr >> 16)
                    for entry in entries
                )
            ):
                raise ValueError("The .wgt file contains unsupported or unsafe entries.")
            config = archive.getinfo("config.xml")
            if config.file_size > MAX_CONFIG_BYTES:
                raise ValueError("The app's config.xml is too large.")
            root = ET.fromstring(archive.read(config))
        app_id, version = app_metadata_of(path)
    except (zipfile.BadZipFile, KeyError, ET.ParseError, RuntimeError, NotImplementedError) as error:
        raise ValueError("This is not a valid Tizen .wgt app. Check its config.xml.") from error
    application = root.find(f"{TIZEN_NAMESPACE}application")
    package_id = application.get("package", "") if application is not None else ""
    if (
        not PACKAGE_IDENTIFIER.fullmatch(package_id)
        or len(app_id) > MAX_IDENTIFIER_CHARACTERS
        or not app_id.startswith(f"{package_id}.")
    ):
        raise ValueError("The app has an invalid package ID.")
    if (
        not isinstance(version, str)
        or not WIDGET_VERSION.fullmatch(version)
        or len(version) > MAX_VERSION_CHARACTERS
    ):
        raise ValueError("The app must declare a valid version in config.xml.")
    name = root.findtext(f"{WIDGET_NAMESPACE}name", default=app_id).strip() or app_id
    return {"app_id": app_id, "package_id": package_id, "name": name, "version": version}


def snapshot(source, directory, expected_sha256=None):
    """Sign the reviewed bytes, even if the user's original file changes later."""
    source = Path(source)
    if not source.is_file() or source.suffix.lower() != ".wgt":
        raise ValueError("Choose a .wgt app file.")
    target = Path(directory) / "selected.wgt"
    digest = hashlib.sha256()
    size = 0
    with source.open("rb") as original, target.open("wb") as copied:
        while data := original.read(COPY_CHUNK_BYTES):
            size += len(data)
            if size > MAX_WIDGET_BYTES:
                raise ValueError("Choose a .wgt file smaller than 256 MiB.")
            digest.update(data)
            copied.write(data)
    checksum = digest.hexdigest()
    if expected_sha256 is not None and checksum != expected_sha256:
        raise ValueError("The app file changed. Choose it again and review the new version.")
    return target, checksum
