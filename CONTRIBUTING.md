# Contributing

Thanks for taking a look. The most useful contribution is trying AeroTizen on your TV and
opening a "Tested on my TV" issue: every model and firmware year behaves a bit differently, and
only a handful of models have been tested so far.

## Development setup

```bash
git clone https://github.com/helalaou/AeroTizen
cd AeroTizen
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"     # the aerotizen CLI + pytest + ruff
npm ci                      # launcher build and lint tools
```

The separate native Home query and control helpers require the .NET 6 SDK:

```bash
python tools/build_home_query.py
python tools/build_home_control.py
```

Build both before running the full Python suite or building a standalone CLI. CI
uses SDK 6.0.428. Standalone CLI releases include both payloads; users do not need
a .NET SDK. Home commands use the SDK user by default; temporary root is an
explicit option for reads only. See [inspection](docs/home-read-only.md) and
[apply/restore](docs/home-apply-restore.md). The policy test harness runs on the
host without loading any Tizen library. Set `AEROTIZEN_DOTNET` if the SDK is not on
`PATH`. Tests use mocks or localhost servers; they do not contact a real TV.

Checks (CI runs the same):

```bash
ruff check . && ruff format --check .
pytest
npm run lint
npm run typecheck  # strict TypeScript checks for Settings and Vite config
npm run build      # type checks, then compiled Settings in dist/launcher
npm test           # launcher tests: tests/*.test.cjs, run in a Node sandbox
npx playwright install chromium # once per Playwright version; CI also installs OS dependencies
npm run test:browser # compiled Settings and legacy comparison, with managed local servers
```

Use Node.js 22.12 or newer, or Node 20.19+ within the 20.x series, as required by Vite.
CI uses the latest Node 20.x. The watcher tests use mock clocks and network replies to cover the Art Mode protocol, status checks,
relaunch cancellation and app visibility, without contacting a TV.

## Project layout

| Path | What |
|---|---|
| `src/aerotizen/` | Python CLI: sdb client, certificates, package signing, debloat |
| `launcher/` | TV runtime files and the legacy Settings baseline |
| `launcher/src/settings/` | TypeScript/TSX Settings components, state, actions and service adapters |
| `launcher/src/settings/sections/` | Settings sections with their own controls and hooks |
| `launcher/src/shared/` | Store subscriptions, ref-based navigation and reusable lifecycle hooks |
| `launcher/src/shared/icons/` | SVG icon components, one per TSX file |
| `tests/browser/` | Playwright regression checks at the TV's 1920×1080 viewport |
| `vite.config.mts` | Official Preact preset, dev server and TV bundle settings |
| `dist/launcher/` | Generated TV runtime with compiled Settings; no Node needed on TV |
| `launcher/js/config.js` | Launcher behaviour and settings |
| `launcher/js/app-catalog.js` | App IDs, Samsung store IDs and optional fallback branding |
| `launcher/js/app-lookup.js` | Shared ID lookup and legacy name compatibility |
| `launcher/service/` | Background service that reclaims the screen from Samsung Home |
| `tests/` | pytest suite (`test_*.py`, a fake TV covers the sdb protocol) and launcher tests (`*.test.cjs`) |
| `dns/`, `docs/` | Ad/telemetry blocklists and the settings guide |

## Working on the launcher

- Run `npm run dev`, then open http://localhost:8019 at 1920×1080. The server also
  prints a network URL for another device. Vite supplies hot updates for Settings
  components and serves the legacy runtime files. TV-only features use sample data.
- Run `npm run build` for the compiled runtime in `dist/launcher/`.
  Releases package this directory. The source launcher retains the legacy Settings
  comparison baseline. Edit the TSX components for Settings changes.
  See [Preact Settings](docs/preact-settings.md) for scope and validation.
- Preview in a desktop browser: `python3 -m http.server -d launcher`, open
  http://localhost:8000 at 1920×1080. This serves the legacy Settings baseline.
- On the TV: `aerotizen install ./dist/launcher`, then `aerotizen inspect launcher`.
  This restarts the launcher in debug mode and exposes Chrome DevTools at
  http://localhost:9222/json. Press Ctrl+C to stop forwarding.
- Keep legacy scripts ES5-compatible. Compiled Settings targets Chromium 69, the 2020
  TV engine, with an ES2018 syntax ceiling. Animate with `transform` only.

Inspection is included in both the Python package and standalone CLI. It uses the
same automatic TV discovery as other commands. To select a TV, use
`aerotizen --tv <tv-ip> inspect launcher`. To inspect another app or choose a local
port, use `aerotizen inspect APPID --port 9223`.
The separate `aerotizen-inspect` Python command has been replaced by `aerotizen inspect`.

`aerotizen install launcher` installs the latest published launcher, even when a
`launcher` directory exists in the current directory. Build first, then use
`aerotizen install ./dist/launcher` to test local changes. For a fork's published app, use
`aerotizen install launcher --release-repo OWNER/REPO`.

## Releases

The CLI and TV launcher have independent versions, release PRs, and GitHub releases.
Use a Conventional Commit title for each pull request. The **Validate PR title** check
runs when a PR is opened, reopened, edited, or updated with new commits. Supported
types are `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`,
`chore`, and `revert`. Scopes are optional. For example:

```text
feat(launcher): add a settings screen
fix(cli): handle failed launcher downloads
feat(cli)!: change certificate storage
chore(main): release cli 2.2.0
```

Use `!` in the title for a breaking change. Squash-merge each PR and keep its validated
title as the final commit title, so Release Please can select versions and write
release notes. Individual commits on a development branch do not need this format.
Source paths determine which component changes; commit scopes alone do not route
releases.

See [Release process](docs/releases.md) for required repository settings, assets,
local package checks, and failed-build recovery. Build outputs belong in release
assets, not in Git.

## Updating app metadata

Edit `launcher/js/app-catalog.js`. It is a data-only script so the launcher can load it
without a build step or an asynchronous JSON request. Keep one record per app:

- `key` identifies the catalogue record; `name` makes it easy to find and review.
- `variants` pairs verified Tizen `appId` and Samsung `storeId` values. Keep IDs as
  strings. Add variants for known identifiers; do not guess IDs for untested apps.
- `preloaded: true` marks native apps whose discovery and Home watcher use the
  Samsung store ID. Existing Netflix and Prime Video mappings are kept here.
- `fallback` holds optional background, logo, label and colour settings. A logo
  pairs its Simple Icons `slug` with a pinned source `version`; use `null` for no
  logo. A `null` label keeps an existing logo-only card.
- `legacy.artworkNames` retains exact name matches; `legacy.brandPrefixes` retains
  prefix matches. These are compatibility fallbacks while more IDs are verified.

Both artwork and fallback branding check verified IDs first. TV-provided store IDs
and cache paths still take precedence over catalogue artwork mappings. Apps without
a match keep their own icon and name on the generated default background. Image
files and cache paths do not need to be added to the catalogue.

To add or update a fallback logo, edit its catalogue entry and run
`python3 tools/fetch_logos.py`. The generator reads the catalogue and writes
`launcher/js/logos.js`; do not edit the generated SVG paths. Keep the catalogue
object valid JSON inside its script wrapper so both Python and the launcher can
read it. Some logos require an older source version because newer Simple Icons
releases removed them.

Run `npm test` and `npm run lint`. Catalogue tests check unique IDs, valid logo
references, legacy matching and the preloaded IDs sent to the Home watcher.

## Pull requests

- One change per PR, with a short description of what you tested and on which TV.
- New launcher strings and behaviour should work with only the remote (no pointer).
- For UI changes, screenshots or a short video from the TV are really helpful (before and after
  if you can). They make the idea much easier to follow and review. A photo of the screen is fine.
- Don't commit certificates, `.wgt` packages or anything from `~/.config/aerotizen`.
