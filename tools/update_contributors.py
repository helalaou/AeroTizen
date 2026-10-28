"""Regenerate the contributor avatars at the top of README.md from merged pull requests.

  python3 tools/update_contributors.py [OWNER/REPO]

Lists everyone who has had a pull request merged (bots excluded), in order of their first
merged PR, with the repository owner first. Set GITHUB_TOKEN to avoid API rate limits.
CI runs this after each merge and opens a pull request when someone new appears.
"""

import json
import os
import re
import sys
import urllib.request
from pathlib import Path

README = Path(__file__).resolve().parent.parent / "README.md"
START, END = "<!-- contributors:start -->", "<!-- contributors:end -->"


def merged_pull_authors(repo):
    """Return [(login, merged_at)] for every merged, non-bot pull request."""
    token = os.environ.get("GITHUB_TOKEN")
    found, page = [], 1
    while True:
        url = f"https://api.github.com/repos/{repo}/pulls?state=closed&per_page=100&page={page}"
        req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
        if token:
            req.add_header("Authorization", f"Bearer {token}")
        with urllib.request.urlopen(req, timeout=30) as r:
            pulls = json.load(r)
        if not pulls:
            return found
        for pr in pulls:
            user = pr.get("user") or {}
            if pr.get("merged_at") and user.get("type") == "User":
                found.append((user["login"], pr["merged_at"]))
        page += 1


def contributors(repo):
    owner = repo.split("/")[0]
    first = {}
    for login, merged_at in merged_pull_authors(repo):
        if login not in first or merged_at < first[login]:
            first[login] = merged_at
    first.pop(owner, None)
    return [owner, *sorted(first, key=lambda login: (first[login], login.lower()))]


PER_ROW = 7


def render(logins):
    rows = []
    for i in range(0, len(logins), PER_ROW):
        cells = "\n".join(
            f'    <td align="center"><a href="https://github.com/{login}">'
            f'<img src="https://github.com/{login}.png?size=100" width="64" height="64" alt="{login}">'
            f"<br><sub>{login}</sub></a></td>"
            for login in logins[i : i + PER_ROW]
        )
        rows.append(f"  <tr>\n{cells}\n  </tr>")
    return f"{START}\n<table>\n" + "\n".join(rows) + f"\n</table>\n{END}"


def update(text, logins):
    pattern = re.compile(re.escape(START) + ".*?" + re.escape(END), re.S)
    if not pattern.search(text):
        raise SystemExit(f"README.md has no {START} … {END} block")
    return pattern.sub(lambda _: render(logins), text)


def main():
    repo = sys.argv[1] if len(sys.argv) > 1 else "helalaou/AeroTizen"
    text = README.read_text()
    new = update(text, contributors(repo))
    if new != text:
        README.write_text(new)
        print("README.md updated")
    else:
        print("README.md already up to date")


if __name__ == "__main__":
    main()
