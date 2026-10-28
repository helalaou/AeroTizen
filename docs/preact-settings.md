# Preact Settings migration

This is the first implementation stage of [issue #18](https://github.com/helalaou/AeroTizen/issues/18).
It builds on the merged [release PR #23](https://github.com/helalaou/AeroTizen/pull/23).
Release packaging compiles Settings on the exact release commit and ships that output.

Merge this Settings migration before other launcher UI feature PRs. Rebase pending
Settings changes onto these components after it lands, so new controls use the Preact
state and navigation patterns and the cutover does not require another port.

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

The source `launcher/` retains the legacy Settings comparison baseline. Release packages
contain only the compiled renderer. Install `dist/launcher/` to test local changes;
installing the source directory tests the baseline. Release users do not need Node.

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
- `settings/services/createSettingsInventory.ts` subscribes to app discovery and input
  changes. It publishes cached immutable lists, so a late TV callback or hot-plug update
  reaches the open or cached Settings form without a preference change. Matching lists
  retain identity; the composition root disposes both subscriptions on replacement.
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
- `shared/` contains the small store, navigation engine and hooks for external store
  subscriptions, input drafts and image retries. Store subscriptions use Preact's
  documented `useSyncExternalStore` hook.
- `settings/components/RemoteControl.tsx` renders the focused class and tab position
  from the selected key in context. Its ref callback registers the control with the
  navigation engine. Layout reads these registered nodes, including wrapped and hidden
  controls; there are no DOM selector lists or imperative focus-class repairs.
  Rows use vertical overlap, so centred controls with different heights stay together.
  Arrow keys update focus state and rerender the control hosts. App artwork and section
  components do not need to rerender for focus changes.
  Pointer focus selects a key without remote scrolling, so a click cannot move its target
  between pointer-down and pointer-up. Space uses the button activation command;
  text fields retain native space entry. TV arrow, OK and IME handling remain in the router.
- Navigation remeasures when the screen opens, preview visibility or section layout
  changes, inventory changes, weather results/status change, or the viewport resizes.
  Unrelated preference updates reuse the geometry cache. Open/close commands keep their
  store updates and browser-focus work within one synchronous integration transaction.
- Date/time examples use a timestamp captured by the open command. They stay stable
  during that opening and refresh on the next opening, without a timer or wall-clock
  reads during rendering.
- Preact owns all markup inside `#settings-root`, including classes, attributes,
  children, the sheet and app artwork. The data-only branding helper in `brands.js`
  reuses existing brand rules. Refs handle browser focus, blur, scrolling, measurements
  and remote activation. The presentation hook synchronizes body classes and the
  existing toast outside the Settings root. These are external browser/runtime effects.
- Saved preferences are shared state. Open/preview state belongs to the screen store;
  text drafts and weather search state belong to their hooks. Drafts override saved
  values only while editing; they are not copied from props in an effect. One effect
  owns each pending image attempt and its cleanup. Closing cancels pending image timers,
  resets failed image sequences for the next opening, and cancels search callback delivery.
  Successfully loaded image nodes stay cached. The cached form keeps its store subscription until
  unmount, so external preference changes remain current while the form is hidden.
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
    types.ts                      # Feature contracts
    components/                   # Declarative remote-control host and section controls
    sections/
      BackgroundSettings.tsx, DisplaySettings.tsx
      apps/                       # App menu and its tile components
      inputs/                     # Input controls and names
      weather/                    # Weather UI and location/search hooks
    hooks/                        # Screen lifecycle and navigation hooks
    state/                        # Settings snapshots and named actions
    services/                     # Legacy runtime types, adapters and key-router bridge
  shared/
    hooks/                        # Reusable store subscription, draft and image behavior
    icons/                        # SVG icon components, one per TSX file
    navigation/                   # Ref registry, visual rows and focus state
    state/                        # Observable store primitive
```

Keep section-specific hooks and components together. Keep props and local state types
beside their owner; `types.ts` holds contracts used across Settings. Legacy globals are
described only in `services/launcherRuntime.ts`. Use hooks for state and lifecycle work;
keep deterministic commands and calculations as plain functions.

This follows the documented distinction between [rendered UI and ref-based browser
operations](https://react.dev/learn/manipulating-the-dom-with-refs), with the
[Preact external store hook](https://preactjs.com/guide/v10/hooks/#usesyncexternalstore)
for the existing launcher state. ESLint enforces hook ordering and complete dependency
arrays through `eslint-plugin-react-hooks`.

## Local verification

```sh
npm ci
npm run lint
npm run typecheck
npm run build
npm test
npx playwright install chromium
npm run test:browser
npm run dev
```

Open `http://localhost:8019` at 1920×1080. The network URL is printed at startup.
Vite watches source files and supplies hot refresh for Settings components.
Use `dist/launcher/` when testing the compiled app. An installation of `launcher/` tests
the legacy baseline. Use a modern desktop browser for Vite development; use the production
build for TV compatibility checks.

`npm run test:browser` builds the launcher and runs the pinned Playwright runner.
It starts and stops baseline/production static servers on loopback ports 8170/8171.
Each test gets a separate browser context at 1920×1080. CI installs Chromium with its
OS dependencies and runs the same command. Failure screenshots and traces are saved
under ignored `test-results/` and uploaded by CI; comparison screenshots are test artifacts.

The separate performance sample remains a manual desktop comparison. Start these
servers in separate terminals after building:

```sh
python3 -m http.server 8020 --bind 127.0.0.1 --directory launcher
python3 -m http.server 8032 --bind 127.0.0.1 --directory dist/launcher
npx --package @playwright/cli playwright-cli -s=settings open http://127.0.0.1:8032
npx --package @playwright/cli playwright-cli -s=settings resize 1920 1080
npx --package @playwright/cli playwright-cli -s=settings run-code --filename tests/settings_performance.browser.js > /tmp/settings-performance.log
```

The UI check mocks weather requests. It checks remote opening/closing, focus bounds,
scrolling, IME Done, saved and empty input names, visibility controls, app selection,
speed bounds, preview, stale search callbacks, persistence and stable DOM nodes.
It also checks asynchronous artwork failure/fallback/success, focus during image loads,
external settings updates, active drafts, repeated opens, native focus/tab position and console errors. The resource
check controls artwork deadlines to verify retries, detached image events and cleanup.
Fixtures wait for the initial paint and passive subscriptions before driving the UI;
rapid interactions within each fixture still exercise synchronous remote transactions.
The focus check also uses real browser arrow, Enter and Escape events and checks native
focus after text entry.
Regression cases also cover first pointer activation, Space without consuming input
spaces, stable date previews, zero geometry reads for an unrelated clock setting, and
late TV discovery/hot-plug callbacks while preserving an active text draft.
Artwork recovery also checks that reopening retries exhausted candidates from the first
source while preserving loaded image nodes and avoiding another request for them.
These are fixed-resolution TV screens; mobile layout is not part of this migration.

## Desktop measurements: 24 October 2026

Desktop Chromium 156.0.8078.48, 1920×1080, Black background and matching sample app
inventories. Five paired rounds alternate variant order. Each round measures one first
open, 25 reopens, 25 clock changes and 100 synthetic arrow events. Retained JavaScript
heap is measured after garbage collection with Settings open.

| Measurement | Legacy | Preact |
|---|---:|---:|
| First open, median synchronous work | 3.7 ms | 7.4 ms |
| Reopen, median synchronous work | 1.6 ms | 1.3 ms |
| Clock change, median synchronous work | 1.7 ms | 0.9 ms |
| Arrow event, p95 synchronous work | 0.2 ms | 0.5 ms |
| Retained JavaScript heap, median | 1.85 MiB | 2.60 MiB |
| Settings script, including Preact | 14,540 bytes | 39,507 bytes |

Rendering focus state and native focus events adds work compared with direct class
writes. It also gives Preact full ownership of the rendered controls. The physical TV
checks remain required; these small desktop samples do not establish TV response time.
The script runs events in tight loops and measures synchronous work, excluding paint,
physical remote transmission and screen latency. No startup or animation result is claimed.

## Release and TV validation

The release process builds the compiled runtime before packaging. Package checks require
the Settings bundle, mount and Preact license, reject a stale manifest, and verify the
unsigned archive through the release downloader. CI also builds a real release package.

On 24 October 2026, this Settings implementation was installed in place on a Samsung
Frame QE65LS03DAUXXU running Tizen 9. The installed runtime matched the compiled package,
saved settings and five Home items were preserved, and key-event checks covered opening,
closing, reopening and vertical navigation. The tester then checked Settings with the TV
remote. The Home watcher and Frame Art Mode guard remained active.

This is functional validation. Paired performance measurements of this final build,
startup, retained heap, animation and physical remote latency remain outstanding.
Physical 2020 TV testing also remains outstanding; the Chromium 69 build target is not
hardware proof.

Keep this first change limited to Settings. Migrate Home, shared tiles and dialogs in
separate changes after the build and hardware checks are complete.
