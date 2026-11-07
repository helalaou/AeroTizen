"""Find a successful PR CI run for a single squash-merged push."""

import json
import os
import subprocess
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def read_github(path, **query):
    url = f"{os.environ['GITHUB_API_URL']}/{path}"
    if query:
        url += "?" + urlencode(query)
    # These endpoints are public. Keep the reusable release workflow's token scopes unchanged.
    request = Request(url, headers={"Accept": "application/vnd.github+json", "User-Agent": "AeroTizen-CI"})
    with urlopen(request, timeout=5) as response:
        return json.load(response)


def verified_pr_run(repo, branch, commit, base, tree, read=read_github):
    api = f"repos/{repo}"
    pulls = read(f"{api}/commits/{commit}/pulls", per_page=20)
    for pull in pulls:
        if not pull["merged_at"] or pull["merge_commit_sha"] != commit or pull["base"]["ref"] != branch:
            continue
        head = pull["head"]["sha"]
        runs = read(
            f"{api}/actions/workflows/ci.yml/runs",
            event="pull_request",
            head_sha=head,
            status="success",
            per_page=5,
        )["workflow_runs"]
        marker = f"Select test jobs for PR #{pull['number']} (base {base}, tree {tree})"
        for run in runs:
            if run["event"] != "pull_request" or run["head_sha"] != head or run["conclusion"] != "success":
                continue
            jobs = read(f"{api}/actions/runs/{run['id']}/jobs", per_page=50)["jobs"]
            if any(
                step["name"] == marker and step["conclusion"] == "success"
                for job in jobs
                if job["name"] == "changes" and job["conclusion"] == "success"
                for step in job["steps"]
            ):
                return run["id"]
    return None


def git(*args):
    return subprocess.check_output(["git", *args], text=True).strip()


def main():
    commit = os.environ["GITHUB_SHA"]
    base = os.environ["BEFORE"]
    if git("rev-list", "--parents", "-n", "1", "HEAD").split() != [commit, base]:
        return
    try:
        run = verified_pr_run(
            os.environ["GITHUB_REPOSITORY"],
            os.environ["GITHUB_REF_NAME"],
            commit,
            base,
            git("rev-parse", "HEAD^{tree}"),
        )
    except (OSError, KeyError, TypeError, ValueError) as error:
        print(f"Could not verify previous PR CI. Running the selected push jobs. {error}")
        return
    if run is not None:
        print(f"PR CI run {run} already passed for this base and tree.")
        with open(os.environ["GITHUB_OUTPUT"], "a") as output:
            print(f"run={run}", file=output)


if __name__ == "__main__":
    main()
