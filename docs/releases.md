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

## Normal release

1. Merge changes into `main` with conventional commit titles.
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
macOS Intel. Each archive contains `aerotizen`, `aerotizen-inspect`, and the license.
Python, dependencies, and Samsung CA files are included in the executables. Each
archive has a `.sha256` checksum file. Linux builds use Ubuntu 22.04; older systems may
need the Python installation method. The native build jobs establish each platform's
build and startup checks; they do not test TV hardware.
These workflows do not apply Windows code signing or Apple notarization.

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

## Local checks

Use Python 3.10 or newer, or 3.12 to match the native build jobs:

```sh
python -m pip install -e '.[dev]'
python tools/build_release.py launcher --output dist/launcher
python -m pip install 'pyinstaller>=6,<7' certifi
python tools/build_release.py cli --output dist/cli
```

`--tag launcher-vX.Y.Z` or `--tag cli-vX.Y.Z` also checks that a tag matches the source
version. CLI builds target the host OS and CPU. Each built executable is copied outside
the checkout and run with `--help` and `--version`, with Python paths removed.

## Failed release builds

A failed build leaves the GitHub release as a draft, which the installer ignores.
Select **Re-run failed jobs**. Re-running all Release Please jobs can skip packaging
because the draft already exists and is no longer reported as newly created.
The **Build release** workflow can also be started manually
with the component and its existing draft tag. It validates both before building.
All builds use the tagged source; editing `main` does not change that release.

Do not move a published tag or replace published assets. If the tagged code itself is
broken, fix the component on `main` and make a new version. Do not publish the incomplete
draft manually. Built files stay in release assets rather than the repository, so a
future frontend compiler can run in CI without adding Node to the user's install steps.
