# Contributing

Thanks for taking a look. The most useful contribution is trying AeroTizen on your TV and
opening a "Tested on my TV" issue: every model and firmware year behaves a bit differently, and
so far only one model has been tested.

## Development setup

```bash
git clone https://github.com/helalaou/AeroTizen
cd AeroTizen
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev]"     # the aerotizen CLI + pytest + ruff
npm install                 # ESLint for the launcher (optional)
```

Checks (CI runs the same):

```bash
ruff check . && ruff format --check .
pytest
npm run lint
npm test           # launcher tests: tests/*.test.cjs, run in a Node sandbox
```

Run the local watcher tests with Node.js 18 or newer:

```bash
npm run test:watcher
```

These tests use mock clocks and network replies. They cover the Art Mode protocol, fresh
status checks, relaunch cancellation and app visibility. They do not contact a TV.

## Project layout

| Path | What |
|---|---|
| `src/aerotizen/` | Python CLI: sdb client, certificates, package signing, debloat |
| `launcher/` | The TV app (plain HTML/CSS/JS, no build step) |
| `launcher/js/config.js` | Every launcher constant in one place |
| `launcher/service/` | Background service that reclaims the screen from Samsung Home |
| `tests/` | pytest suite (`test_*.py`, a fake TV covers the sdb protocol) and launcher tests (`*.test.cjs`) |
| `dns/`, `docs/` | Ad/telemetry blocklists and the settings guide |

## Working on the launcher

- Preview in a desktop browser: `python3 -m http.server -d launcher`, open
  http://localhost:8000 at 1920×1080. TV-only features fall back to sample data.
- On the TV: `aerotizen install launcher`, then `aerotizen-inspect <tv-ip> DclHome001.Home`
  gives you Chrome DevTools for the running app at http://localhost:9222.
- Keep it ES5-compatible (older Tizen runtimes) and animate with `transform` only.

## Pull requests

- One change per PR, with a short description of what you tested and on which TV.
- New launcher strings and behaviour should work with only the remote (no pointer).
- Don't commit certificates, `.wgt` packages or anything from `~/.config/aerotizen`.
