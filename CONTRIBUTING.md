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

Checks (CI runs the same):

```bash
ruff check . && ruff format --check .
pytest
npm run lint
npm run typecheck  # strict TypeScript checks for Settings and Vite config
npm run build      # type checks, then compiled Settings in dist/launcher
npm test           # launcher tests: tests/*.test.cjs, run in a Node sandbox
```

Use Node.js 22.12 or newer, or Node 20.19+ within the 20.x series, as required by Vite.
CI uses the latest Node 20.x. The watcher tests use mock clocks and network replies to cover the Art Mode protocol, status checks,
relaunch cancellation and app visibility, without contacting a TV.

## Project layout

| Path | What |
|---|---|
| `src/aerotizen/` | Python CLI: sdb client, certificates, package signing, debloat |
| `launcher/` | TV runtime files and the legacy Settings baseline |
| `launcher/src/settings/` | TypeScript/TSX Settings components, actions and remote navigation |
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
  This branch keeps the source launcher as a working baseline while the release process
  PR is pending. See [Preact Settings](docs/preact-settings.md) for scope and merge checks.
- Preview in a desktop browser: `python3 -m http.server -d launcher`, open
  http://localhost:8000 at 1920×1080. This serves the legacy Settings baseline.
- On the TV: `aerotizen install launcher`, then `aerotizen-inspect <tv-ip> DclHome001.Home`
  gives you Chrome DevTools for the running app at http://localhost:9222.
- Keep legacy scripts ES5-compatible. Compiled Settings targets Chromium 69, the 2020
  TV engine, with an ES2018 syntax ceiling. Animate with `transform` only.

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
- Don't commit certificates, `.wgt` packages or anything from `~/.config/aerotizen`.
