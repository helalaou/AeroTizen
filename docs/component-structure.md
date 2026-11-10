# Launcher component ownership

Home and Settings share preferences, status data and small utilities. Each screen
owns its controls and navigation state. Promote a component to `shared/` when both
screens need the same behavior, rather than because they have a similar shape.

| Component                                                            | Responsibility                                                                  | Data and commands                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `backgrounds/BackgroundSceneView`                                    | Render decorative gradients, waves and particle canvas                          | Background bridge provides scenes and speed. The app mounts and disposes it. |
| `home/components/Home`                                               | Compose the screen and refresh focus when its inventory or layout changes       | Shared settings/inventory and Home controller                                |
| `HomeHeader`                                                         | Shortcuts, page tabs and status placement                                       | Home navigation and shared status stores                                     |
| `HeaderFocusIndicator`                                               | Measure a registered shortcut/tab and render its focus position                 | Explicit `shortcuts` or `tabs` group                                         |
| `AppGrid`                                                            | Render one keyed page of apps, preserving artwork while another page is active  | Ordered IDs, app records, layout settings and visibility                     |
| `AppCard`, `FireplaceCard`                                           | Launchable Home app and fireplace presentation                                  | Existing app commands through `HomeControl`                                  |
| `ContinueWatchingRow`, `ContinueWatchingCard`                        | Feed section and item presentation                                              | Immutable feed items; live launch records stay in the service                |
| `HorizontalScroller`                                                 | Shared clipping, track movement and offset limits for horizontal app/feed rows  | Each row owns its offset; the Home controller reveals the selected card      |
| `InputDock`, `InputCard`                                             | Input collection and one input's label, artwork and connection state            | Existing input service capabilities and commands                             |
| `shared/components/AppFallback`                                      | Shared app logo/icon and label fallback for Home and Settings                   | App presentation, image lifetime and visibility                              |
| `AppActionsMenu`, `ReorderControls`                                  | App actions and move/drop controls                                              | Home controller actions; menu positioning is rendered from state             |
| `status/Clock`                                                       | One time/date view with compact, vertical, horizontal, minimal and bold layouts | Shared time snapshot and formatter; no timer                                 |
| `WeatherStatus`, `NetworkStatus`                                     | Render status data                                                              | Shared snapshots; no requests or DOM scraping                                |
| `settings/SettingsRoot`                                              | Open/closed shell and lazy content lifetime                                     | Settings view state                                                          |
| `SettingsContent`                                                    | Assemble sections and bind screen navigation                                    | Shared preferences and Settings inventory/actions                            |
| `layout/SettingsDrawer`                                              | Category sidebar and active pane, shared by both themes                         | Drawer state and registered pane refs                                        |
| `SettingsCategory`, `SettingsHelp`                                   | Sidebar rows, update notice and remote help                                     | Explicit row props and translations                                          |
| `SettingsFocusIndicator`                                             | Measure registered Settings controls and render the focus position              | Sidebar/content container refs                                               |
| `AppearanceSettings`, `ClockSettings`, `InputSettings`               | Appearance/card choices, clock choices and Live TV/HDMI controls respectively   | Section-specific settings and named actions                                  |
| `HomeAppsSettings`, `AppOption`, `FireplaceOption`, `AppStoreOption` | Home membership and app-store options                                           | Selection state; they do not launch Home tiles                               |
| `ChoiceGroup`, `ChoiceOption`                                        | A labelled choice group and one selectable option                               | Value, options and selection callback                                        |
| `SelectionIndicator`                                                 | Decorative selected-choice check with a consistent contrast badge               | Parent control owns selection and `aria-pressed`                             |
| `SettingsControl`                                                    | Register a Settings control and render focus/activation                         | Settings navigation context                                                  |
| `SettingsAppCard`                                                    | Common app-choice frame, focus, selection and disabled states                   | Explicit favourite/source variant and control props                          |
| `WallpaperSwatch`, `SpeedSlider`, `WeatherSearch`                    | Wallpaper preview choices, speed adjustment and location input                  | Explicit values, state and callbacks; no platform requests                   |
| `SettingsHint`                                                       | Shared Settings help and status copy                                            | Text, semantic attributes and optional spacing override                      |

Styled components use a component-named directory, such as
`AppGrid/AppGrid.tsx` and `AppGrid/AppGrid.module.css`. Private helpers stay there;
small components with no companion files can remain flat. Apply this pattern as
components are migrated, and import their named file directly.

`SettingsPanel` owns the shared drawer and picker surface: border, radius, shadow,
background, text colour and font. Each consumer owns its position, size and spacing.
`SettingsHeading` owns panel and section titles, optional kickers and descriptions.
Panel titles share one size; section titles use the smaller variant. The colour and
gradient dialogs use the same description style and link their instructions with
`aria-describedby`. `SettingsSection` supplies section spacing and content.

`HomeAppCard` owns the shared app/Fireplace frame, focus and moving state.
`AppCard` and `FireplaceCard` supply app-specific content and paint.

`HomeControl` and `SettingsControl` remain separate because they use different
navigation contracts. Neither starts platform services. Shared navigation, hooks and
contracts cannot import screens; ESLint enforces that dependency direction.

Feature `presentation/` modules select input, network and weather states from data.
Static maps define labels and icons; named helpers express rules with a priority or
range. Components render the selected state. Settings choices use `{ value, label }`
objects, and fixed options live outside the component. Data snapshots use read-only
contracts. Navigation replaces position objects and app order arrays when they change.
Private geometry buffers and DOM ref registries remain local to navigation.

## Preference ownership

`services/createSettingsService.ts` owns preferences, immutable snapshots and persistence.
Defaults, saved-data migration and validation live in `services/preferences/`. The service uses
injected storage and locale defaults, with no Preact or TV API dependency. It keeps the
existing storage keys. `migrateSettings.ts` converts older favourites and card sizes only
when loading, before current-schema validation. Updates use only the current schema.
First-launch `home: null` remains distinct from an intentionally empty `home: []`.

The entry point loads preferences before mounting views. Home and Settings receive
the same service directly. TV services also use `getSnapshot()`, `subscribe()` and
`update()`; there is no mutable settings facade or separate save step.
View teardown releases view subscriptions. The runtime preference service survives
development hot reload so existing TV-service subscriptions remain active.

## App inventory ownership

`services/createAppsService.ts` owns the installed-app inventory, visible app records,
watcher IDs and the existing `aerotizen.apps.v1` label cache. Home, Settings and Continue
Watching read one immutable app snapshot. Unchanged discovery retains the snapshot and
array identities; a changed app retains the other app records. Views do not copy app data.
`subscribeDiscovery()` reports each successful discovery to Continue Watching, including
unchanged inventories: an appcontrol return can carry new playback data without a visibility
event or an app-list change. This completion signal does not invalidate app snapshots.

Cached labels render before package discovery. A failed, malformed or superseded read
does not clear the current inventory or change saved favourites. An unknown favourite
retains its ID label until discovery succeeds. Defaults remain separate from an empty
saved Home list and are selected only after successful discovery, as before.

`platform/tizen/createAppsPlatform.ts` owns Tizen package queries, metadata and launch
commands, with the existing Home handoff bridge. It preserves HbbTV routing, the older
YouTube visibility workaround, Tizen 10 watch preparation, repeated-tap suppression,
app-store fallback, Fireplace playback and correlated diagnostics. Browser preview IDs
and names remain stable. The service receives this adapter, the catalogue, config and
storage; it has no DOM or TV API dependency.

Hot reload retains the app service used by Continue Watching. Disposal cancels discovery
delivery and rejects late handoff and launch callbacks. The old `apps.js` remains only in
the frozen comparison fixture, outside the TV package.

## Clock ownership

`services/createClockService.ts` owns time snapshots, formatting and the width cache.
Home reads the shared clock directly. The clock starts at boot, ticks every 10 seconds,
and refreshes on resume. Hot reload retains the service and its timer. Weather and
Continue Watching receive the same ticks to check expiry and system time corrections.

`platform/tizen/createClockPlatform.ts` supplies TV date/time patterns and browser
locales. Format choices stay in the preference service. The clock reads live time.
Formatters are shared within each tick and cleared on the next tick or resume so
time-zone changes still take effect. Hidden time/date fields do no formatting.
The visible compact clock checks its exact full-day width in cancellable batches
capped at 60 measurements with a 4 ms time budget. It uses the existing minimum width until the
scan completes and shares the exact cached result with synchronous callers.
Home controls select their own focus state; a focus move does not render the
entire Home tree or its status widgets.
Settings controls also subscribe to their own selected state. App and feed cards
retain their rendered content while their scroller offset changes.

## Weather ownership

`services/createWeatherService.ts` owns immutable weather snapshots, the saved forecast cache,
location search and one 20-minute refresh timer. Home reads the service directly; weather photos
subscribe to the same owner. Settings changes update visibility, location and temperature units
without manual UI callbacks. The service subscribes to the shared clock for cache expiry and
system time changes; views add no timers or requests.

`platform/tizen/createWeatherPlatform.ts` owns the cancellable XMLHttpRequest transport and its
eight-second timeout. The service validates external data and ignores cancelled or superseded
responses. Matching cache readings remain usable for two hours, including unit conversion while
offline. The widget and photo wallpaper are separate consumers; automatic requests stop only when
both are disabled. Explicit location searches remain available while they are disabled.

The entry point retains the service through development hot reload. Starting it twice keeps one
refresh timer and one settings/clock subscription. Disposal cancels forecasts and searches,
stops the timer and releases its subscriptions. The legacy weather runtime is kept only in the
frozen comparison fixture, outside the shipped package.

Weather Settings groups Home visibility, location-name visibility and temperature units.
Its shared location summary reads the resolved city even when the Home widget is hidden.
Change location opens an editor without starting a search. Enter or IME Done submits;
matching pending submissions share one request. Results receive remote focus. Selecting a
location, cancelling, leaving the pane or closing Settings clears the editor and cancels
pending delivery. Back first leaves the on-screen keyboard, then closes the editor.
The search uses the existing service and adds no polling timer.

## Network ownership

`services/createNetworkService.ts` owns live network state. Views read its snapshots
directly through `useStore`; `createStatusStores` does not copy network state or
subscribe to it. Settings changes update indicator visibility without a TV query.
Unchanged readings retain snapshot identity and do not notify consumers.

Boot starts the service after the first frame. One 60-second interval and one platform
subscription are shared across views and retained during development hot reload.
`dispose()` cancels pending delivery and releases the interval, platform watch,
settings subscription and consumers.

`platform/tizen/createNetworkPlatform.ts` owns Samsung/Tizen calls and browser
online/offline events. It preserves Samsung signal-level and standard Tizen fallbacks,
including unavailable readings. Native watch IDs are released through the
[SystemInfo API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/systeminfo-api.html).
Cancelled discovery cannot start a later Wi-Fi query or publish a stale reading.

## Continue Watching ownership

`services/createContinueWatchingService.ts` owns feed selection, bounded source records,
immutable snapshots and retry timers. Home and Settings read its item/source arrays without
copying them. Unchanged records retain their identity, including while status changes, so
feed refreshes do not reload card artwork. Normalization validates provider records, retains
zero-progress episodes and sorts by viewing activity, with a maximum of thirty visible items.

Samsung and Stremio adapters register in `continueWatchingProviders` before the bundle loads.
They retain discovery, transport, request cancellation and native launch commands. The first
provider to claim an app keeps it, including while its readiness check is pending. The service
receives these adapters, preferences, app inventory, the shared clock, visibility, wall time,
monotonic time and timers as dependencies; it does not query the DOM or Tizen APIs.

Startup retries share one five-minute monotonic deadline across refreshes and clock corrections.
Settled feeds do not poll. Returning to the launcher refreshes feeds; hiding it or changing
selection cancels pending reads and retries. Shared clock ticks revalidate saved timestamps
after a system-time correction without another request. Hot reload retains the service and
its subscriptions. `dispose()` cancels requests and timers, releases app/preference/clock and
visibility subscriptions, and rejects late replies. The legacy comparison page retains its
existing frozen JavaScript service outside the TV package.

## DOM and style ownership

The Settings focus indicator measures after the view has committed. Resize and structural
change observers keep it attached when a focused control moves without changing its key.
Layout changes snap the content ring into place; moves between equally sized controls keep
the shared focus animation. Measurements are coalesced into a requested frame and stop
when the layout is idle. Observers and pending frames are released on teardown.

Only `src/index.ts` discovers the Home, Settings, wallpaper, Fireplace and toast mount hosts. Preact renders the
toast. Its mount owns the dismissal timer and exposes the existing toast commands. Components register their own
nodes with refs. Home scroll and carousel offsets are state; Preact renders the
transforms and scrolled class. Settings enters a category through registered controls
inside that pane, rather than a document/CSS query. Native focus, geometry reads and
Settings scroll-container movement remain explicit layout operations.

Modules use local classes such as `digits`, `horizontal` and `temperature`.
Background artwork, weather photos, Fireplace, toast and interface icons also use
local module classes. The background mount keeps its fixed canvas geometry in
`base.css`, alongside page sizing and native visibility.
Version/model names are absent from active view styles.
Existing semantic IDs such as `editor`, `grid`, `rows`, `weather` and `time`, and remote
`data-key` values, remain stable for integration and test tools. Persisted preference
keys and values also remain compatible.

| Stylesheet                                                                                       | Owner                                                                               |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- |
| `themes.css`                                                                                     | Shared semantic paint tokens and Classic/Glass values                               |
| `motion.css`                                                                                     | Shared UI durations and reduced-motion policy                                       |
| `settings/components/*/*.module.css`                                                             | Shared Settings focus, choices, group layout, headings and selection badges         |
| `settings/SettingsRoot/SettingsRoot.module.css`                                                  | Settings overlay and preview visibility                                             |
| `settings/layout/SettingsDrawer/SettingsDrawer.module.css`                                       | Drawer frame, headings, sidebar and active pane layout                              |
| `settings/layout/SettingsCategory/SettingsCategory.module.css`                                   | Category and Samsung Home rows, current state and update notice                     |
| `settings/layout/SettingsHelp/SettingsHelp.module.css`                                           | Sidebar remote help                                                                 |
| `settings/layout/SettingsFocusIndicator/SettingsFocusIndicator.module.css`                       | Measured Settings focus plate and motion preference                                 |
| `settings/sections/inputs/InputName/InputName.module.css`                                        | Input-name field layout and focus states                                            |
| `settings/sections/**/*.module.css`                                                              | Section layouts, app options, wallpaper controls, weather search and About          |
| `shared/components/AppFallback/AppFallback.module.css`                                           | Shared logo/label geometry with explicit Home, favourite, source and badge variants |
| `base.css`                                                                                       | Page sizing, fonts, hidden state and native/preview visibility                      |
| `backgrounds/*/*.module.css`                                                                     | Blob, wave, WebGL canvas and weather-photo presentation                             |
| `home/components/Home/Home.module.css`                                                           | Home viewport, fades, page reveals, section spacing and content clearance           |
| `home/components/HomeHeader/HomeHeader.module.css`                                               | Header layout, shortcuts, tabs and expanded clock clearance                         |
| `home/components/HeaderFocusIndicator/HeaderFocusIndicator.module.css`                           | Measured shortcut/tab focus plates and shared motion durations                      |
| `status/Clock/Clock.module.css`                                                                  | Compact, vertical, horizontal, minimal and bold time/date layouts                   |
| `status/HeaderStatus/HeaderStatus.module.css`                                                    | Compact/expanded status placement                                                   |
| `status/WeatherStatus/WeatherStatus.module.css`, `status/NetworkStatus/NetworkStatus.module.css` | Weather and network presentation, with explicit layout/state props                  |
| `home/components/AppGrid/AppGrid.module.css`                                                     | App sizes, columns and clock clearance                                              |
| `home/components/HomeAppCard/HomeAppCard.module.css`                                             | Shared app/Fireplace frame and focus/moving states                                  |
| `home/components/AppArtwork/AppArtwork.module.css`                                               | App image geometry                                                                  |
| `home/components/FireplaceCard/FireplaceCard.module.css`                                         | Fireplace card artwork                                                              |
| `home/components/HomeControl/HomeControl.module.css`                                             | Home control focus reset                                                            |
| `home/components/HomeSectionHeading/HomeSectionHeading.module.css`                               | Shared Home section headings                                                        |
| `home/components/ContinueWatchingRow/ContinueWatchingRow.module.css`                             | Continue Watching track spacing                                                     |
| `home/components/ContinueWatchingCard/ContinueWatchingCard.module.css`                           | Card focus, artwork, source badges, titles and progress                             |
| `home/components/HorizontalScroller/HorizontalScroller.module.css`                               | Shared horizontal viewport, track layout and motion                                 |
| `home/components/InputDock/InputDock.module.css`                                                 | Input collection spacing and compact dock layout                                    |
| `home/components/InputCard/InputCard.module.css`                                                 | Input frame, icon, labels, status badge and focus/state paint                       |
| `home/components/AppActionsMenu/AppActionsMenu.module.css`                                       | App actions and menu selection                                                      |
| `home/components/ReorderControls/ReorderControls.module.css`                                     | Reorder arrows and local motion                                                     |
| `shared/icons/Icon/Icon.module.css`                                                              | Shared interface icon sizing                                                        |
| `fireplace/FireplaceView/FireplaceView.module.css`                                               | Fireplace frame, canvas, hearth and volume notice                                   |
| `app/Toast/Toast.module.css`                                                                     | Transient message layout and stacking                                               |

Module paths in this table are relative to `launcher/src/`; global sheets are in
`launcher/css/`. Generated module class names are private. Runtime and test hooks
use semantic IDs, roles, `data-key`, `data-focused`, `data-settings-focus` and
`data-selection-indicator`. Drawer tests use `data-settings-drawer` part names,
`data-expanded` and the help/title/update-notice data hooks. Active controls expose only `data-focused`; the old global focus alias has been
removed.
Header/status tests use `data-home-header`, `data-header-tabs`, `data-header-focus`,
`data-clock-part` and `data-weather-part`. Shell visibility uses the public
`data-home-header` and `data-home-content` hooks, rather than private module classes.
Home layout/card tests use `data-home-viewport`, `data-home-mask`, `data-home-page`,
`data-columns`, `data-moving`, `data-reorder-arrow` and `data-app-actions-focus`.
See the runtime boundary in the
[style rules](styles.md) for the remaining public body classes.

Each component has one style owner. Theme differences use tokens from `themes.css`;
layout and state rules stay with the component. The legacy comparison page has a
frozen CSS snapshot, so it does not follow active selector changes. These fixtures
are excluded from production packages. See [style rules](styles.md) for the cascade,
CSS checks and Chromium 69 constraints.

See [interface icons](icons.md) for named imports, accessibility, custom artwork and
third-party notices.

## Background boundary

App composition mounts and disposes the background views. The background bridge
handles scene selection, the root colour, speed, and visibility. Boot, Settings
and embedded inputs keep their existing commands and preferences.

The weather photo controller shares the weather code table with the status view.
It owns the image request, the solar phase timer and visibility handling.
`WeatherPhotoView` subscribes to the loaded photo, and the background mount
switches between the photo and the selected wallpaper.

Preact owns the scene markup. The canvas component starts the particle loop when
it mounts and stops it on unmount. Scene changes replace the previous view, and
weather photos suspend it.

Starfield, Nebula, Snow, Fireflies and Rain use WebGL 1. Each scene submits
its particles in one batch. Canvas 2D creates glow textures once at startup
for the sprite effects. Rain draws its streaks directly in the shader.

Solid backgrounds show the saved custom colour first, followed by nineteen presets.
Gradients also start with a custom tile. The pencil sits beside each Custom label
and marks the editable choice. Both editors keep drafts in Settings view state and
preview through the background mount. The TypeScript preference service owns the
custom colour and gradient defaults, validation and persistence. Editors read its
current snapshot and save through its update API. The gradient editor shares the colour controls
and adds two colour stops and a direction. OK selects a stop before editing its colour.
Apply persists the choice; Cancel, Back, closing Settings and teardown restore the saved
wallpaper or weather photo. Left/Right starts at one degree or one percent per press,
then accelerates while held. Key release, focus changes and blur restore fine control.
Up/Down moves between controls and Apply/Cancel. Bright backgrounds select contrasting
floating Home text without changing the chosen background or tab theme.

The wallpaper pane checks for WebGL when it opens. A failed setup or lost
context hides the WebGL choices and leaves the saved wallpaper's static
base in place. The preference is retained for the next launch. CSS wallpapers
and weather photos remain available.

Background tests use `data-background-wave`, `data-background-blob` and
`data-weather-photo`. Icon direction is an explicit `mirrorInRtl` prop.

The Fireplace view renders the overlay and volume notice from a shared state
snapshot. Its canvas ref starts the TypeScript animation when the overlay opens.
The Fireplace bridge starts audio on launch and stops it on close. Native YouTube
launch and remote key routing use the same bridge as before.
