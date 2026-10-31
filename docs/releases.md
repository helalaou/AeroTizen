# Release process

AeroTizen has two release streams in one repository:

| Component | Tag | Version files | Release notes |
|---|---|---|---|
| CLI | `cli-vX.Y.Z` | `src/aerotizen/__init__.py` | `CHANGELOG-CLI.md` |
| Launcher and watcher | `launcher-vX.Y.Z` | `launcher/version.txt`, `launcher/config.xml` | `launcher/CHANGELOG.md` |

Release Please manages both versions from `.release-please-manifest.json`. The existing
`CHANGELOG.md` records earlier combined history. The initial component baseline is 2.1.0.
The first CLI with release downloads is 2.2.0; launcher metadata requires that version.

## Repository setup

Enable GitHub Actions and **Settings → Actions → General → Allow GitHub Actions to
create and approve pull requests**. The workflows request only the permissions needed
for each job.

The default `GITHUB_TOKEN` creates release PRs whose CI runs require approval. A user
with write access selects **Approve workflows to run** on the PR before merging.
GitHub does not start the `pull_request_target` title workflow for a PR created or
updated by this token. After approving CI, edit the release PR description to trigger
**Validate PR title**; the conventional title can stay unchanged. Repeat this after a
bot refresh that adds commits. The optional token below also starts the title check.
For unattended PR checks, optionally add a `RELEASE_PLEASE_TOKEN` Actions secret with
a fine-grained personal access token granting repository **Contents**, **Issues**, and
**Pull requests** read/write permissions. A GitHub App integration can supply an
equivalent installation token only if you add a step to mint a fresh token for each run;
installation tokens expire after one hour and are not suitable as a fixed secret.
Never put a token in a tracked file. See
[GitHub's workflow trigger rules](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/trigger-a-workflow).

Asset builds do not depend on tag or release events from the token: the Release Please
workflow calls the build workflow directly. If a retry targets an older commit whose
workflow files differ from the default branch, the optional token can also need
**Workflows** write permission.

The workflow runs in the repository where it is enabled. Test releases in a fork stay
in that fork. The CLI defaults to `helalaou/AeroTizen`; use `--release-repo OWNER/REPO`
to select a fork explicitly. It never selects a repository from local Git remotes.

### Squash merges and branch protection

A repository administrator must apply these settings in GitHub; adding the workflow
files does not change them.

In **Settings → General → Pull Requests**:

1. Enable **Allow squash merging**.
2. Set its default commit message to **Pull request title**. This also uses the title
   for PRs with only one commit.
3. Disable **Allow merge commits** and **Allow rebase merging**.

Create an **Active** branch ruleset targeting `main` under **Settings → Rules →
Rulesets**, or apply equivalent branch protection:

- Require a pull request before merging, so direct pushes cannot skip the title check.
- Require status checks before merging: **Validate PR title**, **python (3.10)**,
  **python (3.12)**, **python (3.13)**, and **launcher**. Select GitHub Actions as the
  expected check source where available.
- Require branches to be up to date before merging.
- Require linear history, block force pushes, and block branch deletion.
- Apply the rules to maintainers and administrators too; avoid routine bypass entries.

Do not require the Release Please or Build release jobs as PR checks: they run after
merging a release PR. Review approvals can follow the repository's own policy.

The **PR title** workflow uses `pull_request_target`, so it can check contributions
from forks with read-only PR access. It checks metadata and does not check out or run
the contributor's code. It rechecks titles on PR edits and new commits, including
Release Please PRs, using the same allowed types listed in
[CONTRIBUTING](../CONTRIBUTING.md#releases).

For initial setup, merge the workflow into `main` first. It cannot run from the PR
that first introduces it. Open or update a PR after that merge to produce a
**Validate PR title** check, then make that check required. Until both the workflow
and repository settings are active, title validation does not block merges.

Keep the validated PR title when confirming a squash merge. The title check validates
the PR, not a different commit message typed into the merge dialog. See
[GitHub's squash settings](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/configuring-pull-request-merges/configuring-commit-squashing-for-pull-requests)
and [required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets#require-status-checks-to-pass-before-merging).

## Normal release

1. Squash-merge changes into `main` using the validated Conventional Commit PR title.
2. Release Please opens a separate release PR for each changed component. Review its
   version and notes and let CI pass.
3. Merge the release PR. Release Please creates its tag and a **draft** GitHub release.
4. The build workflow checks out that exact commit, runs CI, builds the assets, and
   smoke-tests the CLI binaries. It publishes the release only after all required jobs
   succeed and all assets have been uploaded.

Release Please refreshes pending release PRs even when their release notes have not
changed. This keeps the shared version manifest current after another component is
released. Let CI pass again if that refresh changes the PR commit.

Launcher source changes belong under `launcher/`. The CLI excludes `launcher/` and
`tests/` from its release calculation, so a launcher change with JavaScript tests does
not force a CLI release. A CLI source change with tests still releases the CLI. Shared
root tooling and documentation can affect the CLI; a change needed in both components
must also change the relevant launcher source or metadata. Test-only changes do not
create releases. A commit scope such as `fix(launcher):` is useful context, but paths
determine component ownership.

The launcher builder checks that `version.txt` and `config.xml` agree. Keep the app ID
`DclHome001.Home` and package ID `DclHome001` stable for upgrades. Release Please updates
the widget version; it must not change the Tizen `required_version` attribute.

## Assets and installation

CLI releases contain archives for Linux x64, Windows x64, macOS Apple silicon, and
macOS Intel. Each archive contains `aerotizen` and the license.
Python, dependencies, and Samsung CA files are included in the executable. Each
archive has a `.sha256` checksum file. Linux builds use Ubuntu 22.04; older systems may
need the Python installation method. The native build jobs establish each platform's
build and startup checks; they do not test TV hardware.
These workflows do not apply Windows code signing or Apple notarization.

The web inspector is included as `aerotizen inspect launcher` in both standalone
and Python installations. It replaces the separate `aerotizen-inspect` Python command;
see [Working on the launcher](../CONTRIBUTING.md#working-on-the-launcher).

Launcher releases contain:

- `aerotizen-launcher-X.Y.Z.wgt`: deterministic, unsigned runtime files, including the watcher.
- `launcher-release.json`: schema version, launcher version, minimum CLI version, app and
  package IDs, package filename, and SHA-256 digest.
- `SHA256SUMS`: checksums for the widget and manifest.

The CLI reads all release-list pages and chooses the highest stable `launcher-vX.Y.Z`
version. It ignores CLI releases, drafts, and prereleases. GitHub's repository-wide
`latest` URL is not used. A version pin uses the exact launcher tag.

Downloads are checked before the CLI connects to the TV: checksum, size limits,
archive paths, required files, version, app ID, and package ID. The package is signed
locally with the user's existing certificates. Private keys and TV certificates never
go into release assets. The installer rejects explicit TV errors and old reported
versions. Where firmware does not expose a version, it requires the TV's install
completion reply and states that the installed version is unverified.

Downloaded and signed temporary files are removed after the command. For offline
installation, download the WGT first and pass its local path. The explicit local path
uses the existing local signing route rather than release-manifest validation.

### Launcher updates

Run `aerotizen update launcher --check` to compare the TV's installed version with
the highest stable launcher release. It validates release metadata and shows the
minimum CLI version without downloading the WGT, reading certificates, or writing
to the TV. Add `--release-repo OWNER/REPO` to check a fork.

Run `aerotizen update launcher` to install a newer release. Current and newer
installed versions are left in place. The selected release stays pinned through
download and installation, even if another release is published during the command.
One device session covers the inventory check, signing and installation. The update
reuses the install command's checksum/package checks, saved certificates and TV
completion/version checks. It never uninstalls the app, resets settings or changes
native Home assignments.

If firmware omits the installed version or reports a version that cannot be compared,
the command reports the limitation and stops before downloading the WGT. Use
`aerotizen install launcher` to explicitly install without that comparison, or to
reinstall the current release. The selected release may be older than an unversioned
development build. A missing launcher also needs `aerotizen install launcher`.
Intentional version selection remains available with
`aerotizen install launcher --version X.Y.Z`.

Launcher updates do not replace the CLI executable. Update detection inside the TV
app is separate work.

### CLI updates

Run `aerotizen update cli --check` to compare the running CLI version with the highest
stable `cli-vX.Y.Z` release. It reads release metadata only, ignores launcher releases,
drafts and prereleases, and needs no TV connection or signing certificates. Use
`--release-repo OWNER/REPO` to check a fork.

For GitHub API rate limits, an optional `GH_TOKEN` or `GITHUB_TOKEN` is sent only to
the HTTPS GitHub API and is not forwarded to asset hosts. Temporary HTTP 500/502/503/504
responses are retried twice; other failures are reported without replacing the CLI.

If a newer CLI exists, the check shows the matching OS/CPU archive link and the
release page. If no archive matches, it states that limitation and links to the
release page. Current and newer versions are left unchanged.

Run `aerotizen update cli` to replace a downloaded standalone executable. The updater
requires the selected archive's `.sha256` asset, validates its named checksum, and
accepts only the executable and LICENSE as regular archive files. It rejects paths,
links, duplicate or unexpected files, oversized packages and incomplete archives.
It stages the binary in the installation folder, runs its `--version`, and replaces
the executable only after that version matches the selected release. An installation
lock prevents simultaneous updates. A unique previous-executable backup is retained;
failed final verification restores it. The user configuration and TV certificates
are not moved or rewritten. Folder permission errors stop the update without elevation.

macOS and Linux use an atomic rename, then verify the installed binary. On Windows,
the running executable must first exit: a bundled PowerShell helper waits for that
exit, acquires the installation lock, and uses `File.Replace` with a backup. It retries
briefly while the onefile parent still holds the executable. The CLI reports this as
staged; the helper prints completion and saves a JSON result beside the executable.
`state: complete` confirms success; `restored` means verification failed and the old
executable was restored. A `failed` result can require recovery from the printed
backup path. The helper removes its staging folder after completion.

Python-installed copies report the exact pinned `python -m pip install --upgrade`
command for their interpreter and selected repository. The updater never replaces a
Python interpreter or changes package-manager installations itself.

See [CLI update validation](cli-updates.md) for the manual checks and native test matrix.

## Local checks

Use Python 3.10 or newer, or 3.12 to match the native build jobs:

```sh
python -m pip install -e '.[dev]'
npm ci
npm run build
python tools/build_release.py launcher --output dist/releases/launcher
python -m pip install 'pyinstaller>=6.22.1,<7' certifi
python tools/build_release.py cli --output dist/cli
```

`--tag launcher-vX.Y.Z` or `--tag cli-vX.Y.Z` also checks that a tag matches the source
version. CLI builds target the host OS and CPU. Each built executable is copied outside
the checkout and run with `--help` and `--version`, with Python paths removed.

Launcher release jobs install the locked Node dependencies and compile Settings on the
exact release commit. The unsigned WGT uses `dist/launcher/`, including the Preact license;
TypeScript sources, development tools and the legacy Settings renderer are excluded.
The packager rejects missing builds, stale manifests and missing Settings runtime files.
Node is needed to build the launcher, but is not needed to download or install a release.

## Failed release builds

A failed build leaves the GitHub release as a draft, which the installer ignores.
Select **Re-run failed jobs**. Re-running all Release Please jobs can skip packaging
because the draft already exists and is no longer reported as newly created.
The **Build release** workflow can also be started manually
with the component and its existing draft tag. It validates both before building.
All builds use the tagged source; editing `main` does not change that release.

Do not move a published tag or replace published assets. If the tagged code itself is
broken, fix the component on `main` and make a new version. Do not publish the incomplete
draft manually. Built files stay in release assets rather than the repository. The
frontend compiler runs in CI without adding Node to the user's install steps.
