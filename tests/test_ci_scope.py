"""Select component checks by changed files without enabling desktop CI."""

import runpy
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "tools/ci_scope.py"
select_jobs = runpy.run_path(str(SCRIPT))["select_jobs"]


@pytest.mark.parametrize(
    "path",
    [
        b"desktop/src-tauri/src/services/apps.rs",
        b"cli/src/aerotizen/desktop_next_feature.py",
        b"cli/tools/build_desktop_next_feature.py",
        b"tests/test_desktop_next_feature.py",
        b"cli/src/aerotizen/local_package.py",
    ],
)
def test_desktop_changes_need_no_component_checks_or_new_workflow_entries(path):
    assert select_jobs([path]) == {
        "cli": False,
        "launcher": False,
        "readme_only": False,
        "format_contributing": False,
    }


@pytest.mark.parametrize(
    ("path", "cli", "launcher"),
    [
        (b"cli/src/aerotizen/buttons.py", True, False),
        (b"cli/native/root-bridge/ButtonService.cs", True, False),
        (b"launcher/src/app/App.tsx", False, True),
        (b"tests/browser/navigation.spec.cjs", False, True),
        (b"launcher/src/service/watcher.ts", True, True),
        (b"launcher/config.xml", True, True),
        (b".github/workflows/ci.yml", True, True),
        (b"tools/ci_scope.py", True, True),
        (b"unknown/new-tool", True, True),
    ],
)
def test_desktop_changes_do_not_hide_other_components_or_shared_changes(path, cli, launcher):
    result = select_jobs([b"desktop/src/main.tsx", path])
    assert (result["cli"], result["launcher"]) == (cli, launcher)


@pytest.mark.parametrize(
    ("path", "readme", "format_contributing"),
    [(b"README.md", True, False), (b"CONTRIBUTING.md", False, True), (b"docs/settings.md", False, False)],
)
def test_documentation_keeps_its_existing_checks(path, readme, format_contributing):
    assert select_jobs([b"desktop/README.md", path]) == {
        "cli": False,
        "launcher": False,
        "readme_only": readme,
        "format_contributing": format_contributing,
    }


def test_an_empty_diff_keeps_all_component_checks():
    result = select_jobs([])
    assert result["cli"] and result["launcher"]


@pytest.fixture
def selector(monkeypatch, tmp_path):
    output = tmp_path / "outputs"
    monkeypatch.setenv("GITHUB_OUTPUT", str(output))
    monkeypatch.setenv("GITHUB_EVENT_NAME", "pull_request")
    monkeypatch.setenv("BEFORE", "previous-push")
    monkeypatch.setenv("RELEASE_REF", "")
    monkeypatch.setenv("REUSED_PR_CI_RUN", "")

    def execute(**environment):
        for name, value in environment.items():
            monkeypatch.setenv(name, value)
        runpy.run_path(str(SCRIPT), run_name="__main__")
        return dict(line.split("=", 1) for line in output.read_text().splitlines())

    return execute


@pytest.mark.parametrize(("event", "base"), [("pull_request", "HEAD^1"), ("push", "previous-push")])
def test_workflow_outputs_skip_suites_for_a_desktop_diff(selector, monkeypatch, event, base):
    def diff(command, **_kwargs):
        assert command == ["git", "diff", "--no-renames", "--name-only", "-z", base, "HEAD", "--"]
        return SimpleNamespace(
            returncode=0, stdout=b"desktop/src/main.tsx\0cli/src/aerotizen/desktop_new.py\0"
        )

    monkeypatch.setattr(subprocess, "run", diff)
    assert selector(GITHUB_EVENT_NAME=event) == {
        "cli": "false",
        "launcher": "false",
        "readme_only": "false",
        "format_contributing": "false",
    }


def test_unavailable_history_cannot_hide_checks(selector, monkeypatch):
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda *_args, **_kwargs: SimpleNamespace(returncode=1, stdout=b"desktop/src/main.tsx\0"),
    )
    result = selector()
    assert result["cli"] == result["launcher"] == "true"


@pytest.mark.parametrize(("reused", "expected"), [("", "true"), ("verified-run", "false")])
def test_release_checks_still_require_verified_reuse(selector, monkeypatch, reused, expected):
    monkeypatch.setattr(
        subprocess, "run", lambda *_args, **_kwargs: pytest.fail("Diffed an unverified release")
    )
    result = selector(RELEASE_REF="pinned-release", REUSED_PR_CI_RUN=reused)
    assert result["cli"] == result["launcher"] == expected
