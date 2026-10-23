# Preact Settings migration

This is the first implementation stage of [issue #18](https://github.com/helalaou/AeroTizen/issues/18).
The work starts from upstream `main`, independently of [release PR #23](https://github.com/helalaou/AeroTizen/pull/23).
Merge the release process first. Rebase this branch and connect its compiled output to
release packaging before making Preact the default launcher.

## Current scope

`npm run build` copies runtime files into `dist/launcher/`, replaces only the Settings
markup and renderer, and includes Preact's license. It excludes JSX source. App IDs,
the watcher, Home, CSS, persistence keys and TV APIs remain the same. Preact 10.29.8 is
pinned with the lockfile. All code is bundled locally; no CDN or runtime module loader
is required.

The source `launcher/` remains the legacy baseline. Its normal installation path still
works without Node. The compiled build is for development and validation until release
packaging is connected; this branch does not change published packages.

The build targets Chromium 69 and also checks every shipped script against ES2018.
[Samsung's engine table](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
lists Chromium 69 for Tizen 5.5 / 2020 TVs. A syntax target does not check API availability,
CSS behaviour or physical TV compatibility.

## Code boundaries

- Components in `launcher/src/settings/` receive settings snapshots and named actions.
  Each component has its own file, named after the component, and uses an `export const`
  arrow function. Exported helpers also use `const`. ESLint enforces const exports,
  arrow components and one component per file.
  Rendering does not write storage or call TV APIs.
- `controller.js` owns Settings lifetime, pending location searches, persistence and
  calls into the existing runtime. App selections and input names replace their stored
  arrays/objects so earlier snapshots remain stable.
- `navigation.js` owns transient focus. It caches rows between renders and rebuilds
  them after rendering or resizing. Date controls follow their wrapped visual rows.
  Arrow keys update focus directly without a component render.
- The app-menu bridge mounts the existing artwork renderer once per app identity.
  It retains image callbacks, local cache fallbacks and icon/name fallbacks. Unrelated
  updates reuse those nodes. Moving artwork itself into Preact is a later shared-tile step.

## Local verification

```sh
npm ci
npm run lint
npm run build
npm test
npm run dev
```

Open `http://localhost:8019` at 1920×1080. The network URL is printed at startup.
The dev server watches Settings source; restart it after changing copied runtime files.
Use `dist/launcher/` when testing the compiled app. An installation of `launcher/` tests
the legacy baseline.

Browser comparisons use a second server for the baseline:

```sh
python3 -m http.server 8020 --bind 127.0.0.1 --directory launcher
npx --package @playwright/cli playwright-cli -s=settings open http://127.0.0.1:8019
npx --package @playwright/cli playwright-cli -s=settings resize 1920 1080
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_ui.browser.js
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_performance.browser.js > /tmp/settings-performance.log
```

The UI check mocks weather requests. It checks remote opening/closing, focus bounds,
scrolling, IME Done, saved and empty input names, visibility controls, app selection,
speed bounds, preview, stale search callbacks, persistence and stable DOM nodes.
It also checks asynchronous artwork failure/fallback/success and console errors.
These are fixed-resolution TV screens; mobile layout is not part of this migration.

## Initial browser measurements: 23 October 2026

Desktop Chromium 156.0.8078.48, 1920×1080, static Black background, matching sample app
inventories, at commit `2c37209` before the component-file refactor. Five paired rounds
alternate variant order. Values below are medians.
Each round measures one first open, 25 reopens, 25 clock-format changes and 100 synthetic
arrow events. Retained JavaScript heap is measured after garbage collection with Settings open.

| Measurement | Legacy | Preact |
|---|---:|---:|
| First open, synchronous work | 3.8 ms | 5.2 ms |
| Reopen, synchronous work | 1.6 ms | 1.2 ms |
| Clock change, synchronous work | 1.6 ms | 0.6 ms |
| Arrow event, p95 synchronous work | 0.2 ms | 0.1 ms |
| Retained JavaScript heap | 1.81 MiB | 2.12 MiB |
| Settings script, including Preact | 14,540 bytes | 25,093 bytes |

The first open costs more work and heap. Reopens and clock updates cost less work in
this desktop sample. The synchronous arrow median is below this browser's useful timer
resolution for Preact. These tests run events in tight loops and do not measure paint,
physical remote transmission or screen latency. First-open and heap samples are small.
Do not compare these desktop values directly with the older Frame trial in the issue.
No startup or animation result is claimed. Re-run on the final code and target hardware.

## Required before merge

1. Merge PR #23, rebase, and make its launcher release job run the locked frontend build
   on the exact release commit. Package `dist/launcher/`, including its dependency license.
   Verify the WGT contains compiled Settings and excludes JSX/source and build tools.
2. Verify the release installer downloads that compiled package without Node and preserves
   settings. Remove the legacy renderer once the compiled release path is established;
   retain a comparison baseline from Git rather than two production implementations.
3. Repeat paired performance checks on the supported TV hardware: first open, startup,
   reopens, retained heap, animation and remote response. Check physical remote input,
   focus, scrolling, text entry, persistence and artwork loading/failure.
4. Test a physical 2020 TV. The existing Tizen 9 trial is useful prior evidence, but this
   implementation has not been installed on any TV.

Keep this first change limited to Settings. Migrate Home, shared tiles and dialogs in
separate changes after the build and hardware checks are complete.
