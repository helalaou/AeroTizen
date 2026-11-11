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
npm run typecheck  # strict TypeScript checks for the UI, background service and Vite config
npm run build      # type checks, then compiled Home and Settings in dist/launcher
npm test           # launcher tests: tests/*.test.cjs, run in a Node sandbox
npm run test:service # after build: frozen and packaged background service parity
npm run test:components # Preact component tests in launcher/src
npx playwright install chromium # once per Playwright version; CI also installs OS dependencies
npm run test:browser # compiled Settings and legacy comparison, with managed local servers
```

### Mirror a physical TV for local testing

On a Mac with `uv` and the .NET 6 SDK, wake the TV and check that its [paired root bridge](docs/root-cli.md)
is online. Run this command from the repository root.

```bash
uv run tools/tv_mirror.py --tv TV_IP
```

The command builds a temporary capture helper and opens `http://127.0.0.1:8765/` on the Mac. The
video-only preview runs for three minutes by default. Set `--seconds` to change the duration or press
Ctrl+C to stop. The preview stays on the Mac and the TV and Mac must be on the same trusted network.
The capture path has been verified on the 2024 Samsung Frame QE65LS03DAUXXU running Tizen 9.

### Development checks

Changes limited to `README.md`, `CONTRIBUTING.md`, and `docs/` skip the test suites.
CI still checks README contributor markers and contributor guide formatting when
those files change. Store data that tests read in `tests/fixtures/`.

Put component tests next to the source file, for example `ChoiceOption.test.tsx`.
Use Preact Testing Library to check what the user sees or can activate. Use
Playwright for browser layout, remote navigation between components, and full
launcher flows such as saving settings and reloading.

For a local performance audit, serve a compiled build and run
`node tools/benchmark-launcher.mjs --url http://localhost:8000/ --cpu 4 --output /tmp/launcher-performance.json`.
The audit measures synthetic arrow-key handling, time to two animation frames,
style/layout work, startup readiness, retained heap and idle main-thread work.
It compares animated/static wallpaper, hidden status widgets and Performance mode.
Use the same browser, CPU throttle and sample count for before/after builds.
Desktop CPU throttling does not reproduce TV hardware or physical remote latency.
On slower TVs, **Settings → Appearance → Performance mode** stops wallpaper motion
and UI transitions. Time, date and weather visibility remain separate settings.

Use Node.js 22.12 or newer, or Node 20.19+ within the 20.x series, as required by Vite.
CI uses the latest Node 20.x. The watcher tests use mock clocks and network replies to cover the Art Mode protocol, status checks,
relaunch cancellation and app visibility, without contacting a TV.

Run `npm run format` to apply the shared Prettier rules before committing frontend
changes. Formatting covers launcher JavaScript, TypeScript, TSX, CSS, HTML and JSON;
JavaScript tests and legacy HTML fixtures; root frontend configuration; the launcher build script; this guide;
and the CI workflow. ESLint covers launcher code, tests and frontend tooling.
Stylelint checks global and component-module launcher CSS for errors and duplicate rules. Run either
check alone with `npm run lint:js` or `npm run lint:css`. The TypeScript checks also
reject unused locals and parameters. CI rejects formatting
differences, lint warnings and errors, and type errors.

Frozen generated logos, app-presentation/HomeWatcher snapshots and build/test output are excluded
from formatting. The older catalogue fixture has a dedicated override because its
data object must remain valid JSON. Diagnostics imports its privacy schema from
plain JSON, with CLI parity checked by the Python tests. The current
app catalogue is plain JSON imported into the typed bundle. Legacy JavaScript keeps
ES5 syntax; compiled output retains the Chromium 69 and ES2018 checks.

Prettier uses double quotes, semicolons, a 120-column print width, two-space indentation,
LF line endings, parenthesised arrow parameters and trailing commas wherever supported.
Legacy ES5 scripts limit trailing commas to objects and arrays. Python-readable JSON
uses quoted property names and no trailing commas.

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
Across the repository, name protocol values, limits, durations and identifiers as constants.
Prefer pure functions for validation and transformations, with I/O and mutable state in
explicit owners. Reuse shared rules where useful, without combining unrelated behavior.
These rules are recorded in [AGENTS.md](AGENTS.md) for future changes.
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
Fixed product and technical names live in
[fixedNames.ts](launcher/src/shared/fixedNames.ts). Use these constants directly
for standalone names. In translated phrases, use placeholders such as `{{appName}}`,
`{{samsung}}`, or `{{hdmi}}`; the shared translator supplies their values. Keep
placeholder names unchanged. Fixed-name placeholders may differ between languages
when the wording differs; placeholders for values supplied by callers must match.
Keep terms with local forms, such as Ethernet, in the catalogues. Hardware port IDs,
diagnostics, and text supplied by apps, the TV, or users keep their original values.

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
| `launcher/src/services/`          | TypeScript preferences, apps, inputs, clock, network, weather and Continue Watching services    |
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
| `launcher/src/launcherConfig.ts`  | Launcher behaviour and storage identities                                                       |
| `launcher/src/shared/apps/`       | Readonly app identities, indexed lookups, artwork sources and presentation helpers              |
| `launcher/src/service/`           | Typed background service that reclaims the screen from Samsung Home                             |
| `tests/`                          | pytest suite (`test_*.py`, a fake TV covers the sdb protocol) and launcher tests (`*.test.cjs`) |
| `dns/`, `docs/`                   | Ad/telemetry blocklists and the settings guide                                                  |

The entry point creates one TypeScript preference service and passes it to Home, Settings
and the clock. It owns defaults, saved-data validation, migration and persistence.
TV services use the same snapshot and update API as the UI. The service survives development
hot reload so those services retain their subscriptions. Feature mount functions return
bridges and disposers. Composition owns visibility handling and releases its subscriptions
when tearing down the views. Input discovery publishes data through `inputs.refresh()`;
production services do not render input tiles or replace a renderer at startup.
The input service owns source snapshots, playback state and the foreground cable refresh.
Home and Settings share its records. A Preact playback view synchronizes the native video
surface with shell visibility; the service has no DOM dependency. The Tizen adapter keeps
native source objects private. Hot reload retains one service and its device listeners.
The app service owns immutable inventory and cached labels. Home, Settings and Continue
Watching share its snapshot directly. Tizen discovery and launch handoffs stay in the
app platform adapter. The service survives hot reload and rejects replies after disposal.
Composition creates both typed feed providers with Continue Watching and injects
Stremio first. Feed cancellation and permanent disposal are
separate: hiding the launcher during a valid app handoff must not suppress the launch.
Composition creates one typed native-navigation adapter before the app and input services.
It owns Native Home routing reads, watcher handoff commands and native viewer focus checks.
The typed HomeWatcher service owns startup, readiness, inventory replay and bounded
request recovery. Its Tizen adapter owns HTTP and native service launch operations.
Hot reload keeps both services and pending handoffs; permanent disposal releases their
timers, requests, module loading and listeners. The catalogue is injected directly.
Clock, weather and network services publish immutable snapshots. Views read these
services directly. The weather service subscribes to the shared clock for cache expiry checks.
The network service owns one poller and platform watch, reacts to preference changes,
and publishes only changed readings. Its disposer releases timers and subscriptions.
The weather service owns its refresh timer, cache, cancellable requests and preference subscription.
Views add no polling timers or forecast requests.
Continue Watching owns immutable feed snapshots and bounded retries. Home and Settings share
its arrays directly; Samsung and Stremio adapters retain transport and launching. The service
survives hot reload, and its disposer releases requests, timers and subscriptions.
`Clock` owns time/date presentation and uses layout variants. `WeatherStatus` and
`NetworkStatus` own their markup. Component CSS has one owner; shared theme paint
is defined in `launcher/css/themes.css`. Semantic IDs remain stable for service and
test integration. See [style rules](docs/styles.md) for the cascade and CSS checks.

## Working on the launcher

- Run `npm run dev`, then open http://localhost:8019 at 1920×1080. The server also
  prints a network URL for another device. Vite supplies hot updates for Home and Settings
  components and serves the legacy runtime files. The plain URL opens the full browser
  preview with sample apps, inputs and a fictional Continue Watching feed. It uses one
  settings store; existing local preferences take priority, and older `.demo` preferences
  are carried over when no local preferences exist. A fresh browser context uses Glass,
  Small app cards, the Scroll app layout, six Home favourites and Continue Watching on.
  For README screenshots, use a clean context at 1920×1080.
- Run `npm run build` for the compiled runtime in `dist/launcher/`.
  Releases package this directory. The explicit production HTML mounts Home and
  Settings from one `js/launcher-ui.js` bundle. Edit the TSX components for view changes.
- Preview the compiled launcher: `python3 -m http.server -d dist/launcher`, then
  open http://localhost:8000 at 1920×1080. This is the TV runtime: without native APIs,
  it does not generate sample apps or input devices. The old comparison page is isolated in
  `tests/fixtures/legacy-launcher/` and is served by the browser test runner.
- Browser fixtures and their artwork live under `launcher/src/dev/`, imported only
  by the Vite entry or explicit browser-test setup. Production and TV-dev builds use
  `src/index.ts`; the build rejects rendered modules from `src/dev/`. Browser tests
  inject sample platform adapters through a shared fixture, while native SDK tests
  keep their own adapters. Boundary tests disable those samples and check both TV builds.
- For TV development, run `npm run build:dev`, then `aerotizen install ./dist/launcher-dev`.
  The app name and orange icon badge show the first eight characters of the content
  build ID, for example `AeroTizen Dev 12AB34CD`. The build prints the app name.
  It keeps the package ID, so installing it replaces a copy with that same ID.
- Run `aerotizen inspect launcher` to inspect the TV build.
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
`launcher` directory exists in the current directory. Use `aerotizen install ./dist/launcher`
for a local build without the badge. For a fork's published app, use
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

Edit `launcher/src/shared/apps/appCatalog.json`. It is bundled through typed imports,
so loading the catalogue does not make an asynchronous request. Keep one record per app:

- `key` identifies the catalogue record; `name` makes it easy to find and review.
- `variants` pairs verified Tizen `appId` and Samsung `storeId` values. Keep IDs as
  strings. Each store variant requires both fields. Add variants from TV captures
  or primary project/store metadata; do not guess missing IDs. Keep records sorted by key.
- `sideloaded: true` marks the explicit TizenBrew exception, which has an app ID
  and no store ID.
- `preloaded: true` marks native apps whose discovery and Home watcher use the
  Samsung store ID. Existing Netflix and Prime Video mappings are kept here.
- `legacy.artworkNames` retains exact name matches while more IDs are verified.

Artwork checks verified IDs first. TV-provided store IDs and cache paths take
precedence over catalogue mappings. The installed app icon is the final image
candidate, including for apps outside the catalogue. No app artwork is bundled.

Home, Settings and Continue Watching badges show the app name on a neutral,
theme-based tile until artwork loads. Failed or missing images keep that same
placeholder. Per-app colours, generated gradients and bundled fallback logos are
not part of the production catalogue. The old branding data is a frozen test fixture.
If Samsung artwork is unavailable, the installed package icon appears smaller
with the app name beneath it. This layout follows the loaded image source and
does not depend on an app-specific list or focus.
Keep the catalogue as plain JSON. Image files and cache paths do not belong in it.

Run `npm test` and `npm run lint`. Catalogue tests check complete identity pairs,
unique IDs, the original app set, artwork aliases and preloaded watcher mappings.
Parity tests compare the typed helpers with the frozen JavaScript snapshot from
before their migration. The full-launcher comparison fixture remains unchanged.

## Pull requests

- One change per PR, with a short description of what you tested and on which TV.
- New launcher strings and behaviour should work with only the remote (no pointer).
- For UI changes, screenshots or a short video from the TV are really helpful (before and after
  if you can). They make the idea much easier to follow and review. A photo of the screen is fine.
- Don't commit certificates, `.wgt` packages or anything from `~/.config/aerotizen`.
