# Preact Settings migration

This is the first implementation stage of [issue #18](https://github.com/helalaou/AeroTizen/issues/18).
The work starts from upstream `main`, independently of [release PR #23](https://github.com/helalaou/AeroTizen/pull/23).
Merge the release process first. Rebase this branch and connect its compiled output to
release packaging before making Preact the default launcher.

## Current scope

`npm run build` copies runtime files into `dist/launcher/`, replaces only the Settings
markup and renderer, and includes Preact's license. It excludes TypeScript/TSX source. App IDs,
the watcher, Home, CSS, persistence keys and TV APIs remain the same. Preact 10.29.8 is
pinned with the lockfile. All code is bundled locally; no CDN or runtime module loader
is required.

The build uses Vite with the official `@preact/preset-vite`, following the
[Preact Vite setup](https://preactjs.com/guide/v10/getting-started/#create-a-vite-powered-preact-app).
This integrates the documented preset into the existing repository rather than generating
a new application over the launcher. Vite library mode emits a single classic-script IIFE
for the Settings entry point; the production widget has no Vite client or development entry.
Two small Vite plugins retain the widget assets and load the existing boot script after
the development Settings entry point. The dev server uses the preset's hot refresh support.

All new Settings code is TypeScript. `tsconfig.json` uses `strict: true`,
`jsx: "react-jsx"` and `jsxImportSource: "preact"`, as documented in the
[Preact TypeScript guide](https://preactjs.com/guide/v10/typescript/). Props, actions,
runtime interfaces, events and refs are typed. The existing global JavaScript modules
are described by a small interface; this does not type-check their implementations.
`npm run typecheck` checks the browser source and Vite config. Builds and CI include it.

The source `launcher/` remains the legacy baseline. Its normal installation path still
works without Node. The compiled build is for development and validation until release
packaging is connected; this branch does not change published packages.

The build targets Chromium 69 and also checks every shipped script against ES2018.
[Samsung's engine table](https://developer.samsung.com/smarttv/develop/specifications/web-engine-specifications.html)
lists Chromium 69 for Tizen 5.5 / 2020 TVs. A syntax target does not check API availability,
CSS behaviour or physical TV compatibility.

## Code boundaries

- `settings/index.tsx` is the composition root. It creates the stores, services,
  actions and remote-key bridge once, then mounts a provider and the Settings root.
  Components use typed context or props; they do not read the launcher global.
- `settings/state/createSettingsStore.ts` publishes immutable snapshots of the existing
  `A.settings` object. That object remains the source of persisted preferences.
  Its small `subscribe` API publishes saves and loads, including changes made by legacy
  modules. Unchanged snapshots and nested values retain their identity. Actions use
  named commands and replace arrays/maps; components do not write storage.
- `settings/services/createSettingsServices.ts` adapts the existing TV and launcher
  operations. It exposes data and commands, including data-only app branding. Only
  this boundary calls unmigrated services. The weather adapter can cancel callback
  delivery; the existing search client cannot abort an active request.
- `settings/services/createSettingsBridge.ts` retains the existing key-router interface. It changes open/closed
  state and delegates keys to the current hook handlers. It does not build markup or
  request root renders. Commands flush store notifications before the next remote event.
- `settings/hooks/useSettingsPresentation.ts` owns shell classes and the preview message.
  Navigation hooks own pointer/remote focus; weather hooks own search and location entry.
  Components compose these behaviors and render markup.
- `shared/` contains the small store, navigation engine and hooks for subscriptions,
  input drafts, image retries and focus retention. Settings-specific navigation collects
  actual visual rows under the Settings root, so wrapped controls need no fixed column
  counts. Arrow keys use cached rows and update focus without component renders.
- Preact owns all markup inside `#settings-root`, including the sheet and app artwork.
  The data-only branding helper in `brands.js` reuses existing brand rules; Settings
  does not call legacy tile constructors, append child nodes or copy HTML strings.
  Imperative DOM access is limited to focus, scroll, input focus/blur and shell body
  classes. Navigation owns the `focused` class; the focus hook restores it after a
  local image render. Preact owns the remaining classes, attributes and children.
- Saved preferences are shared state. Open/preview state belongs to the screen store;
  text drafts and weather search state belong to their hooks. The cached form stays
  mounted after first open. Closing removes its settings subscription, pending image
  timers and pending callback delivery. Reopening reads current preferences.
- Every component has its own file and uses an `export const` arrow function.
  Exported helpers also use `const`. ESLint enforces these conventions.

Keep these boundaries when adding Settings controls. Promote a helper to `shared/` only
when it expresses a reusable behavior. Home and other screens keep their current DOM
ownership until their own migration; this change adds no second rendering path there.

## Directory layout

```text
launcher/src/
  settings/
    index.tsx, dev.ts              # Build/development entry points
    SettingsRoot.tsx, Settings.tsx # Shell and screen composition
    SettingsProvider.tsx, context.ts
    types.ts, navigation.ts       # Feature contracts and visual row collection
    components/                   # Controls used by Settings sections
    sections/
      BackgroundSettings.tsx, DisplaySettings.tsx
      apps/                       # App menu and its tile components
      inputs/                     # Input controls and names
      weather/                    # Weather UI and location/search hooks
    hooks/                        # Screen lifecycle and navigation hooks
    state/                        # Settings snapshots and named actions
    services/                     # Legacy runtime types, adapters and key-router bridge
  shared/
    hooks/                        # Reusable store, draft, focus and image behavior
    navigation/                   # Screen-independent focus engine
    state/                        # Observable store primitive
```

Keep section-specific hooks and components together. Keep props and local state types
beside their owner; `types.ts` holds contracts used across Settings. Legacy globals are
described only in `services/launcherRuntime.ts`. Use hooks for state and lifecycle work;
keep deterministic commands and calculations as plain functions.

## Local verification

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npm run dev
```

Open `http://localhost:8019` at 1920×1080. The network URL is printed at startup.
Vite watches source files and supplies hot refresh for Settings components.
Use `dist/launcher/` when testing the compiled app. An installation of `launcher/` tests
the legacy baseline. Use a modern desktop browser for Vite development; use the production
build for TV compatibility checks.

Browser comparisons use separate static servers for the baseline and production build.
Run the servers in separate terminals after building. The browser scripts test the
Preact URL opened by the caller, so they can also check Vite at port 8019.

```sh
python3 -m http.server 8020 --bind 127.0.0.1 --directory launcher
python3 -m http.server 8032 --bind 127.0.0.1 --directory dist/launcher
npx --package @playwright/cli playwright-cli -s=settings open http://127.0.0.1:8032
npx --package @playwright/cli playwright-cli -s=settings resize 1920 1080
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_ui.browser.js
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_resources.browser.js
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_performance.browser.js > /tmp/settings-performance.log
```

The UI check mocks weather requests. It checks remote opening/closing, focus bounds,
scrolling, IME Done, saved and empty input names, visibility controls, app selection,
speed bounds, preview, stale search callbacks, persistence and stable DOM nodes.
It also checks asynchronous artwork failure/fallback/success, focus during image loads,
external settings updates, active drafts, repeated opens and console errors. The resource
check controls artwork deadlines to verify retries, detached image events and cleanup.
These are fixed-resolution TV screens; mobile layout is not part of this migration.

## Initial browser measurements: 23 October 2026

Desktop Chromium 156.0.8078.48, 1920×1080, static Black background, matching sample app
inventories, at commit `2c37209` before the file refactor and Vite/TypeScript conversion. Five paired rounds
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

## Architecture pass measurements: 23 October 2026

At commit `85b3aba`, the same five-round script was repeated against the compiled architecture refactor,
with Chromium 156.0.8078.48, a 1920×1080 viewport, Black background and matching app
inventories. The timing and hardware limits above still apply.

| Measurement | Legacy | Preact |
|---|---:|---:|
| First open, median synchronous work | 3.6 ms | 6.0 ms |
| Reopen, median synchronous work | 1.4 ms | 1.4 ms |
| Clock change, median synchronous work | 1.5 ms | 0.7 ms |
| Arrow event, p95 synchronous work | 0.1 ms | 0.1 ms |
| Retained JavaScript heap, median | 1.82 MiB | 2.43 MiB |
| Settings script, including Preact | 14,540 bytes | 38,055 bytes |

This version includes subscribed state, synchronous remote-event transactions and
Preact-owned artwork with cleanup. The added code and cached component state cost
bytes and heap. This desktop sample supports no claim of a first-open improvement.
Keep the hardware measurements as a merge requirement.

## Required before merge

1. Merge PR #23, rebase, and make its launcher release job run the locked frontend build
   on the exact release commit. Package `dist/launcher/`, including its dependency license.
   Verify the WGT contains compiled Settings and excludes TypeScript/source and build tools.
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
