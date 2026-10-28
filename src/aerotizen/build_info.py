"""Public build identity. No paths, remotes or author data are included."""

import hashlib
import json
import re
import subprocess
from functools import lru_cache
from pathlib import Path

from aerotizen import __version__


def describe(root=None, version=None):
    root = Path(root) if root is not None else Path(__file__).resolve().parents[2]
    source = root / "src/aerotizen"
    if not source.is_dir():
        source = Path(__file__).resolve().parent
    digest = hashlib.sha256()
    content_id = None
    try:
        for path in sorted(source.rglob("*")):
            if path.is_file() and path.suffix in (".py", ".json") and path.name != "_build.json":
                digest.update(
                    path.relative_to(source).as_posix().encode() + b"\0" + path.read_bytes() + b"\0"
                )
        content_id = digest.hexdigest()
    except OSError:
        pass  # Optional build metadata must not prevent a command from running.
    result = {
        "version": version or __version__,
        "build_id": content_id,
        "commit": None,
        "dirty": None,
    }
    try:
        if not (root / ".git").exists():
            return result
        commit = subprocess.run(
            ["git", "-C", str(root), "rev-parse", "HEAD"],
            capture_output=True,
            text=True,
            timeout=2,
            check=True,
        ).stdout.strip()
        if re.fullmatch(r"[0-9a-f]{40,64}", commit):
            result["commit"] = commit
            result["dirty"] = bool(
                subprocess.run(
                    ["git", "-C", str(root), "status", "--porcelain", "--untracked-files=normal"],
                    capture_output=True,
                    text=True,
                    timeout=2,
                    check=True,
                ).stdout
            )
    except (OSError, subprocess.SubprocessError):
        pass
    return result


@lru_cache(maxsize=1)
def current():
    try:
        value = json.loads(Path(__file__).with_name("_build.json").read_text(encoding="utf-8"))
        if re.fullmatch(r"[0-9a-f]{64}", value["build_id"]):
            return {key: value.get(key) for key in ("version", "build_id", "commit", "dirty")}
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return describe()
