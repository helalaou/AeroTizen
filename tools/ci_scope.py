"""Select existing component checks; desktop builds and tests remain local."""

import os
import subprocess

DESKTOP_PREFIXES = (
    b"desktop/",
    b"cli/src/aerotizen/desktop_",
    b"cli/tools/build_desktop_",
    b"tests/test_desktop_",
)
DESKTOP_FILES = frozenset({b"cli/src/aerotizen/local_package.py"})
DOCUMENTATION_FILES = frozenset({b"README.md", b"CONTRIBUTING.md"})
LAUNCHER_FILES = frozenset(
    {
        b".prettierignore",
        b".prettierrc.json",
        b"eslint.config.js",
        b"launcher-browser.json",
        b"package-lock.json",
        b"package.json",
        b"playwright.config.cjs",
        b"stylelint.config.cjs",
        b"tools/build-launcher.mjs",
        b"tools/check_launcher_ci.py",
        b"tools/dev-build-badge.mjs",
        b"tools/launcher-css-rules.cjs",
        b"tools/translation-lint.cjs",
        b"tsconfig.json",
        b"tsconfig.node.json",
        b"vite.config.mts",
    }
)
# These launcher contracts are also tested by the CLI or Windows Home jobs.
SHARED_LAUNCHER_FILES = frozenset(
    {
        b"launcher/config.xml",
        b"launcher/src/contracts/diagnostics.ts",
        b"tests/diagnostics.test.cjs",
        b"tests/artmode.test.cjs",
        b"tests/helpers/load_typescript.cjs",
        b"tests/helpers/load_service.cjs",
        b"tests/helpers/run_packaged_service_tests.cjs",
        b"tests/home_store.test.cjs",
        b"tests/service_diagnostics.test.cjs",
        b"tests/watcher.test.cjs",
    }
)
SHARED_LAUNCHER_PREFIXES = (
    b"launcher/service/",
    b"launcher/js/diagnostics",
    b"launcher/src/diagnostics/",
    b"launcher/src/service/",
)


def component_scope(path):
    if path in DESKTOP_FILES or path.startswith(DESKTOP_PREFIXES):
        return None
    if path in DOCUMENTATION_FILES or path.startswith(b"docs/"):
        return None
    if path in SHARED_LAUNCHER_FILES or path.startswith(SHARED_LAUNCHER_PREFIXES):
        return "shared"
    if path.startswith(b"cli/"):
        return "cli"
    if path in LAUNCHER_FILES or path.startswith((b"launcher/", b"tests/browser/", b"tests/reporters/")):
        return "launcher"
    if path.startswith(b"tests/helpers/") and path.endswith(b".cjs"):
        return "launcher"
    if path.startswith(b"tests/") and path.count(b"/") == 1 and path.endswith((b".test.cjs", b".browser.js")):
        return "launcher"
    return "shared"


def select_jobs(paths):
    scopes = {component_scope(path) for path in paths}
    # Unknown paths, empty diffs and unavailable history retain all component checks.
    shared = not paths or "shared" in scopes
    cli = shared or "cli" in scopes
    launcher = shared or "launcher" in scopes
    return {
        "cli": cli,
        "launcher": launcher,
        "readme_only": not (cli or launcher) and b"README.md" in paths,
        "format_contributing": not launcher and b"CONTRIBUTING.md" in paths,
    }


def changed_paths(event, before, release_ref):
    # Unverified release commits retain full component checks, regardless of the diff.
    if release_ref:
        return []
    base = "HEAD^1" if event == "pull_request" else before
    diff = subprocess.run(
        ["git", "diff", "--no-renames", "--name-only", "-z", base, "HEAD", "--"],
        capture_output=True,
    )
    return diff.stdout.split(b"\0")[:-1] if diff.returncode == 0 else []


def main():
    if os.environ.get("REUSED_PR_CI_RUN"):
        outputs = {"cli": False, "launcher": False, "readme_only": False, "format_contributing": False}
    else:
        paths = changed_paths(
            os.environ["GITHUB_EVENT_NAME"], os.environ.get("BEFORE", ""), os.environ.get("RELEASE_REF", "")
        )
        outputs = select_jobs(paths)
    with open(os.environ["GITHUB_OUTPUT"], "a") as output:
        for name, value in outputs.items():
            print(f"{name}={str(value).lower()}", file=output)
            print(f"{name}={value}")


if __name__ == "__main__":
    main()
