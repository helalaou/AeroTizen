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

## DOM and style ownership

Only `src/index.ts` discovers the Home, Settings, wallpaper, Fireplace and toast mount hosts. Preact renders the
toast. Its mount owns the dismissal timer and exposes the existing toast commands. Components register their own
nodes with refs. Home scroll and carousel offsets are state; Preact renders the
transforms and scrolled class. Settings enters a category through registered controls
inside that pane, rather than a document/CSS query. Native focus, geometry reads and
Settings scroll-container movement remain explicit layout operations.

Modules use local classes such as `digits`, `horizontal` and `temperature`.
Unmigrated classes name their component or role, such as `input-card__status`.
Version/model names are absent from active view styles.
Existing semantic IDs such as `editor`, `grid`, `rows`, `weather` and `time`, and remote
`data-key` values, remain stable for integration and test tools. Persisted preference
keys and values also remain compatible.

| Stylesheet                                                             | Owner                                                                               |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `themes.css`                                                           | Shared semantic paint tokens and Classic/Glass values                               |
| `motion.css`                                                           | Shared UI durations and reduced-motion policy                                       |
| `settings/components/*.module.css`                                     | Shared Settings focus, choices, group layout, headings and selection badges         |
| `settings/SettingsRoot.module.css`                                     | Settings overlay and preview visibility                                             |
| `settings/layout/SettingsDrawer.module.css`                            | Drawer frame, headings, sidebar and active pane layout                              |
| `settings/layout/SettingsCategory.module.css`                          | Category and Samsung Home rows, current state and update notice                     |
| `settings/layout/SettingsHelp.module.css`                              | Sidebar remote help                                                                 |
| `settings/layout/SettingsFocusIndicator.module.css`                    | Measured Settings focus plate and motion preference                                 |
| `settings/sections/inputs/InputName.module.css`                        | Input-name field layout and focus states                                            |
| `settings/sections/**/*.module.css`                                    | Section layouts, app options, wallpaper controls, weather search and About          |
| `shared/components/AppFallback.module.css`                             | Shared logo/label geometry with explicit Home, favourite, source and badge variants |
| `base.css`                                                             | Page sizing, fonts, hidden state and native/preview visibility                      |
| `backgrounds.css`, `runtime.css`, `photo-weather.css`                  | Background layers, Fireplace/toast and weather photos                               |
| `home/components/Home/Home.module.css`                                 | Home viewport, fades, page reveals, section spacing and content clearance           |
| `home/components/HomeHeader.module.css`                                | Header layout, shortcuts, tabs and expanded clock clearance                         |
| `home/components/HeaderFocusIndicator.module.css`                      | Measured shortcut/tab focus plates and shared motion durations                      |
| `status/Clock.module.css`                                              | Compact, vertical, horizontal, minimal and bold time/date layouts                   |
| `status/HeaderStatus.module.css`                                       | Compact/expanded status placement                                                   |
| `status/WeatherStatus.module.css`, `status/NetworkStatus.module.css`   | Weather and network presentation, with explicit layout/state props                  |
| `home/components/AppGrid/AppGrid.module.css`                           | App sizes, columns and clock clearance                                              |
| `home/components/HomeAppCard/HomeAppCard.module.css`                   | Shared app/Fireplace frame and focus/moving states                                  |
| `home/components/AppArtwork/AppArtwork.module.css`                     | App image geometry                                                                  |
| `home/components/FireplaceCard/FireplaceCard.module.css`               | Fireplace card artwork                                                              |
| `home/components/HomeControl/HomeControl.module.css`                   | Home control focus reset                                                            |
| `home/components/HomeSectionHeading/HomeSectionHeading.module.css`     | Shared Home section headings                                                        |
| `home/components/ContinueWatchingRow/ContinueWatchingRow.module.css`   | Continue Watching track spacing                                                     |
| `home/components/ContinueWatchingCard/ContinueWatchingCard.module.css` | Card focus, artwork, source badges, titles and progress                             |
| `home/components/HorizontalScroller/HorizontalScroller.module.css`     | Shared horizontal viewport, track layout and motion                                 |
| `input-dock.css`                                                       | InputDock and InputCard layout/states                                               |
| `home/components/AppActionsMenu/AppActionsMenu.module.css`             | App actions and menu selection                                                      |
| `home/components/ReorderControls/ReorderControls.module.css`           | Reorder arrows and local motion                                                     |
| `icons.css`                                                            | Shared interface icon sizing                                                        |

Module paths in this table are relative to `launcher/src/`; global sheets are in
`launcher/css/`. Generated module class names are private. Runtime and test hooks
use semantic IDs, roles, `data-key`, `data-focused`, `data-settings-focus` and
`data-selection-indicator`. Drawer tests use `data-settings-drawer` part names,
`data-expanded` and the help/title/update-notice data hooks. Global `.focused`
remains only as a transition hook for unmigrated styles; only Preact writes it.
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

The wallpaper pane checks for WebGL when it opens. A failed setup or lost
context hides the WebGL choices and leaves the saved wallpaper's static
base in place. The preference is retained for the next launch. CSS wallpapers
and weather photos remain available.

The Fireplace view renders the overlay and volume notice from a shared state
snapshot. Its canvas ref starts the TypeScript animation when the overlay opens.
The Fireplace bridge starts audio on launch and stops it on close. Native YouTube
launch and remote key routing use the same bridge as before.
