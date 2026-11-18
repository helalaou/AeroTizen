import json
import runpy
from io import BytesIO
from pathlib import Path
from urllib.parse import urlsplit

import pytest

SCRIPT = Path(__file__).resolve().parents[1] / "tools" / "ci_reuse.py"
verified_pr_run = runpy.run_path(str(SCRIPT))["verified_pr_run"]


@pytest.fixture
def github():
    return {
        "commits/squash/pulls": [
            {
                "number": 42,
                "merged_at": "2026-11-07T10:00:00Z",
                "merge_commit_sha": "squash",
                "head": {"sha": "pr-head"},
                "base": {"ref": "main"},
            }
        ],
        "actions/workflows/ci.yml/runs": {
            "workflow_runs": [
                {"id": 123, "event": "pull_request", "head_sha": "pr-head", "conclusion": "success"}
            ]
        },
        "actions/runs/123/jobs": {
            "jobs": [
                {
                    "name": "changes",
                    "conclusion": "success",
                    "steps": [
                        {
                            "name": "Select test jobs for PR #42 (base prior, tree matching)",
                            "conclusion": "success",
                        }
                    ],
                }
            ]
        },
    }


def find_run(github, base="prior", tree="matching"):
    def read(path, **query):
        if path.endswith("/workflows/ci.yml/runs"):
            assert query["event"] == "pull_request"
            assert query["head_sha"] == "pr-head"
        return github[path.removeprefix("repos/owner/repo/")]

    return verified_pr_run("owner/repo", "main", "squash", base, tree, read)


def test_reuses_a_successful_run_that_tested_the_pushed_tree_and_base(github):
    assert find_run(github) == 123


@pytest.mark.parametrize(("base", "tree"), [("new-base", "matching"), ("prior", "different")])
def test_a_matching_tree_alone_is_not_enough(github, base, tree):
    assert find_run(github, base, tree) is None


@pytest.mark.parametrize(("key", "value"), [("merged_at", None), ("merge_commit_sha", "other")])
def test_requires_the_associated_pr_to_have_merged_this_commit(github, key, value):
    github["commits/squash/pulls"][0][key] = value
    del github["actions/workflows/ci.yml/runs"]
    assert find_run(github) is None


@pytest.mark.parametrize("conclusion", [None, "failure", "cancelled"])
def test_requires_the_whole_pr_run_to_have_succeeded(github, conclusion):
    github["actions/workflows/ci.yml/runs"]["workflow_runs"][0]["conclusion"] = conclusion
    del github["actions/runs/123/jobs"]
    assert find_run(github) is None


@pytest.mark.parametrize(
    "marker", ["Select test jobs", "Select test jobs for PR #41 (base prior, tree matching)"]
)
def test_requires_the_recorded_checkout_for_this_pr(github, marker):
    github["actions/runs/123/jobs"]["jobs"][0]["steps"][0]["name"] = marker
    assert find_run(github) is None


@pytest.fixture
def ci_command(monkeypatch, tmp_path, github):
    output = tmp_path / "outputs"
    for name, value in {
        "GITHUB_SHA": "squash",
        "BEFORE": "prior",
        "GITHUB_REPOSITORY": "owner/repo",
        "GITHUB_REF_NAME": "main",
        "GITHUB_API_URL": "https://api.github.com",
        "GITHUB_OUTPUT": str(output),
        "RELEASE_REF": "",
        "RELEASE_BRANCH": "main",
    }.items():
        monkeypatch.setenv(name, value)

    checkout = {"parents": "squash prior", "tree": "matching"}
    monkeypatch.setattr(
        "subprocess.check_output",
        lambda args, **kw: checkout["parents"] if "rev-list" in args else checkout["tree"],
    )

    def response(request, **kwargs):
        path = urlsplit(request.full_url).path.removeprefix("/repos/owner/repo/")
        return BytesIO(json.dumps(github[path]).encode())

    monkeypatch.setattr("urllib.request.urlopen", response)

    def execute(**environment):
        for name, value in environment.items():
            monkeypatch.setenv(name, value)
        runpy.run_path(str(SCRIPT), run_name="__main__")
        return output.read_text() if output.exists() else ""

    return execute, checkout


@pytest.mark.parametrize("release_ref", ["", "squash"])
def test_matching_push_and_release_commands_output_the_verified_run(ci_command, release_ref):
    execute, _ = ci_command
    assert execute(RELEASE_REF=release_ref) == "run=123\n"


def test_a_release_retry_checks_its_pinned_tag_after_main_has_advanced(ci_command):
    execute, _ = ci_command
    assert (
        execute(
            RELEASE_REF="squash",
            GITHUB_SHA="new-main",
            BEFORE="new-parent",
            GITHUB_REF_NAME="manual-retry-branch",
        )
        == "run=123\n"
    )


@pytest.mark.parametrize("parents", ["squash", "squash prior second-parent", "other prior"])
def test_a_release_needs_a_single_parent_and_the_requested_commit(ci_command, parents):
    execute, checkout = ci_command
    checkout["parents"] = parents
    assert execute(RELEASE_REF="squash") == ""


def test_a_push_cannot_reuse_results_when_its_before_commit_is_not_the_parent(ci_command):
    execute, _ = ci_command
    assert execute(BEFORE="different-parent") == ""


@pytest.mark.parametrize(("field", "value"), [("parents", "squash new-base"), ("tree", "new-tree")])
def test_a_release_with_a_different_base_or_tree_keeps_normal_tests_enabled(ci_command, field, value):
    execute, checkout = ci_command
    checkout[field] = value
    assert execute(RELEASE_REF="squash") == ""


@pytest.mark.parametrize("release_ref", ["", "squash"])
def test_an_api_failure_leaves_normal_test_jobs_enabled(ci_command, monkeypatch, release_ref):
    def timeout(*args, **kwargs):
        raise TimeoutError

    execute, _ = ci_command
    monkeypatch.setattr("urllib.request.urlopen", timeout)
    assert execute(RELEASE_REF=release_ref) == ""
