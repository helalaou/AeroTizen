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
npm ci                      # launcher build, lint and formatting tools
```

Use the .NET 6 SDK to build the native Home query, Home control, and root runtime helpers.

```bash
python cli/tools/build_home_query.py
python cli/tools/build_home_control.py
python cli/tools/build_root_runtime.py
```

Build these helpers before running the full Python suite or building a standalone CLI. CI
uses SDK 6.0.428. Standalone CLI releases include all three payloads, so users do not need
a .NET SDK. Home commands use the SDK user by default and offer temporary root for
read-only operations. See [inspection](docs/home-read-only.md) and
[setup and recovery](docs/home-pc-flow.md). The policy test harness runs on the
host without loading any Tizen library. Set `AEROTIZEN_DOTNET` if the SDK is not on
`PATH`. Tests use mocks or localhost servers; they do not contact a real TV.

Checks (CI runs the same):

```bash
ruff check . && ruff format --check .
pytest
npm run format:check # checks frontend source, tests and tooling without writing
npm run lint        # ESLint and Stylelint; each rejects warnings
npm run typecheck  # strict TypeScript checks for the launcher and Vite config
npm run build      # type checks, then compiled Home and Settings in dist/launcher
npm test           # launcher tests: tests/*.test.cjs, run in a Node sandbox
npx playwright install chromium # once per Playwright version; CI also installs OS dependencies
npm run test:browser # compiled Settings and legacy comparison, with managed local servers
```

Changes limited to `README.md`, `CONTRIBUTING.md`, and `docs/` skip the test suites.
CI still checks README contributor markers and contributor guide formatting when
those files change. Store data that tests read in `tests/fixtures/`.

Use Node.js 22.12 or newer, or Node 20.19+ within the 20.x series, as required by Vite.
CI uses the latest Node 20.x. The watcher tests use mock clocks and network replies to cover the Art Mode protocol, status checks,
relaunch cancellation and app visibility, without contacting a TV.

Run `npm run format` to apply the shared Prettier rules before committing frontend
changes. Formatting covers launcher JavaScript, TypeScript, TSX, CSS, HTML and JSON;
JavaScript tests and legacy HTML fixtures; root frontend configuration; the launcher build script; this guide;
and the CI workflow. ESLint covers launcher code, tests and frontend tooling.
Stylelint checks active launcher CSS for errors and duplicate rules. Run either
check alone with `npm run lint:js` or `npm run lint:css`. The TypeScript checks also
reject unused locals and parameters. CI rejects formatting
differences, lint warnings and errors, and type errors.

Generated logos and build/test output are excluded from formatting. The app catalogue
and diagnostic privacy schema have a dedicated formatting override: their data objects
must remain valid JSON because Python reads them directly. Legacy JavaScript keeps
ES5 syntax; compiled output retains the Chromium 69 and ES2018 checks.

Prettier uses double quotes, semicolons, a 120-column print width, two-space indentation,
LF line endings, parenthesised arrow parameters and trailing commas wherever supported.
Legacy ES5 scripts limit trailing commas to objects and arrays. The two Python-readable
data files use quoted property names and no trailing commas.

TypeScript uses the recommended type-aware ESLint checks, unused-import detection,
import/export sorting and natural interface-member sorting. Import groups preserve
side-effect import order. Runtime objects and class members retain their order. The
typed rules use the launcher project; Vite uses its Node-specific TypeScript configuration.
The existing zero-warning CI gate also applies to rules configured as warnings.
Modern frontend code also requires `const` where a binding does not change, one binding
per declaration, no nested ternaries and no parameter reassignment or property writes.
App composition may publish and restore the legacy runtime's UI bridges. Legacy ES5 scripts
keep their compatibility rules. Use named option objects and static lookup maps for
presentation data. Keep view snapshots read-only; make new arrays or objects when
changing preferences. Mutable timers, DOM registries and private layout buffers have
explicit owners.
Shared contracts, services, platform adapters and shared utilities cannot import
screens or app composition; ESLint enforces this dependency rule.

## Launcher translations

The [English catalogue](launcher/src/shared/i18n/en.json) defines the keys for
launcher text, including accessibility labels, placeholders, status, and error
messages. To add a language, copy the file and translate the values. Keep the keys
and placeholder names such as `{{name}}`. Register the file and the language's
native name in [catalogues.ts](launcher/src/shared/i18n/catalogues.ts) using a
canonical BCP 47 tag. Registered catalogues ship in the offline TV package.

Use `useTranslation()` in Preact views and `A.translate()` at legacy display
points. Translate full phrases and pass their variable parts as placeholders.
Product names, hardware port IDs, diagnostics, and text supplied by apps, the TV,
or users keep their original values.

TypeScript derives valid translation keys from the English catalogue. ESLint
checks legacy keys and UI literals, and the Node suite checks catalogue parity
and placeholders. Playwright checks the production HTML shell and uses a test-only
locale that replaces copy with symbols. It scans visible text and text attributes
for leftover words in the Home, Settings, empty, and error states it visits in
both themes. Add coverage here for new UI paths.

## Project layout

| Path                              | What                                                                                            |
| --------------------------------- | ----------------------------------------------------------------------------------------------- |
| `cli/src/aerotizen/`              | Python CLI: sdb client, certificates, package signing, debloat                                  |
| `cli/pyproject.toml`              | CLI package metadata; root pip installs use this same definition                                |
| `cli/native/`, `cli/tools/`       | Native Home helpers, root runtime, and CLI build tools                                          |
| `launcher/`                       | Production HTML, runtime files and frontend source                                              |
| `launcher/src/index.ts`           | Shared Home and Settings bundle entry                                                           |
| `launcher/src/app/`               | Application assembly, shared preference ownership and UI teardown                               |
| `launcher/src/contracts/`         | Screen-independent preferences, app/input/feed types and bridge protocols                       |
| `launcher/src/backgrounds/`       | Wallpaper scenes, background bridge and canvas animation                                        |
| `launcher/src/status/`            | Shared status views and hooks; one Clock with compact and expanded layouts                      |
| `launcher/src/services/`          | Shared preference/status snapshots and persistence adapter                                      |
| `launcher/src/platform/tizen/`    | Typed boundary for the existing TV and browser services                                         |
| `launcher/src/dev.ts`             | Development entry that loads the same views before boot                                         |
| `launcher/src/settings/`          | TypeScript/TSX Settings components, state, actions and service adapters                         |
| `launcher/src/settings/sections/` | Settings sections with their own controls and hooks                                             |
| `launcher/src/shared/`            | Store subscriptions, ref-based navigation and reusable lifecycle hooks                          |
| `launcher/src/shared/icons/`      | SVG icon components, one per TSX file                                                           |
| `tests/browser/`                  | Playwright regression checks at the TV's 1920×1080 viewport                                     |
| `tests/fixtures/legacy-launcher/` | Old views used only by regression and comparison tests                                          |
| `vite.config.mts`                 | Official Preact preset, dev server and TV bundle settings                                       |
| `dist/launcher/`                  | Generated TV runtime with shared launcher-ui.js; no Node needed on TV                           |
| `launcher/js/config.js`           | Launcher behaviour and settings                                                                 |
| `launcher/js/app-catalog.js`      | App IDs, Samsung store IDs and optional fallback branding                                       |
| `launcher/js/app-lookup.js`       | Shared ID lookup and legacy name compatibility                                                  |
| `launcher/service/`               | Background service that reclaims the screen from Samsung Home                                   |
| `tests/`                          | pytest suite (`test_*.py`, a fake TV covers the sdb protocol) and launcher tests (`*.test.cjs`) |
| `dns/`, `docs/`                   | Ad/telemetry blocklists and the settings guide                                                  |

The application creates one shared preference store and passes it to Home, Settings
and the clock. Feature mount functions return bridges and disposers. Composition
owns visibility handling and tears down the views before releasing the shared
source subscription. Input discovery publishes data through `inputs.refresh()`;
production services do not render input tiles or replace a renderer at startup.
Clock, weather and network services publish immutable snapshots. The application
binds each status source once; views add no polling timers or forecast requests.
`Clock` owns time/date presentation and uses layout variants. `WeatherStatus` and
`NetworkStatus` own their markup. Component CSS has one owner; shared theme paint
is defined in `launcher/css/themes.css`. Semantic IDs remain stable for service and
test integration. See [style rules](docs/styles.md) for the cascade and CSS checks.

## Working on the launcher

- Run `npm run dev`, then open http://localhost:8019 at 1920×1080. The server also
  prints a network URL for another device. Vite supplies hot updates for Home and Settings
  components and serves the legacy runtime files. TV-only features use sample data.
  For README screenshots, open `?demo=1` in a clean browser context at 1920×1080.
  It loads Glass, sample favourites and a fictional Continue Watching feed. In
  **Settings → Appearance**, select **Square** and set **Apps per row** to **5**.
  Add a fifth favourite to Home.
- Run `npm run build` for the compiled runtime in `dist/launcher/`.
  Releases package this directory. The explicit production HTML mounts Home and
  Settings from one `js/launcher-ui.js` bundle. Edit the TSX components for view changes.
- Preview the compiled launcher: `python3 -m http.server -d dist/launcher`, then
  open http://localhost:8000 at 1920×1080. The old comparison page is isolated in
  `tests/fixtures/legacy-launcher/` and is served by the browser test runner.
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

See [component ownership](docs/component-structure.md) for the Home/Settings responsibility
map, component naming, navigation refs and style owners. Follow the
[interface icon rules](docs/icons.md) for named imports, labels and notices.

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
