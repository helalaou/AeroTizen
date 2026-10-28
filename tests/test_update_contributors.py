import importlib.util
from pathlib import Path

import pytest

spec = importlib.util.spec_from_file_location(
    "update_contributors", Path(__file__).resolve().parent.parent / "tools" / "update_contributors.py"
)
uc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(uc)


def test_owner_first_then_by_first_merged_pr(monkeypatch):
    pulls = [
        ("later", "2026-10-25T00:00:00Z"),
        ("helalaou", "2026-10-20T00:00:00Z"),
        ("early", "2026-10-21T00:00:00Z"),
        ("later", "2026-10-22T00:00:00Z"),
    ]
    monkeypatch.setattr(uc, "merged_pull_authors", lambda repo: pulls)
    assert uc.contributors("helalaou/AeroTizen") == ["helalaou", "early", "later"]


def test_update_replaces_only_the_marked_block_and_wraps_rows():
    text = f"intro\n{uc.START}\nold\n{uc.END}\nrest\n"
    logins = [f"user{i}" for i in range(9)]
    new = uc.update(text, logins)
    assert new.startswith("intro\n") and new.endswith("\nrest\n")
    assert "old" not in new
    assert new.count("<tr>") == 2
    assert 'alt="user8"' in new


def test_update_requires_markers():
    with pytest.raises(SystemExit):
        uc.update("no markers here", ["helalaou"])


def test_readme_has_markers():
    readme = (Path(__file__).resolve().parent.parent / "README.md").read_text()
    assert uc.START in readme and uc.END in readme
