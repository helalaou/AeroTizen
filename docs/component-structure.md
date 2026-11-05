# Launcher component ownership

Home and Settings share preferences, status data and small utilities. Each screen
owns its controls and navigation state. Promote a component to `shared/` when both
screens need the same behavior, rather than because they have a similar shape.

| Component                                                            | Responsibility                                                                  | Data and commands                                                            |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `backgrounds/BackgroundSceneView`                                    | Render decorative gradients, waves and particle canvas                          | Background bridge provides scenes and speed. The app mounts and disposes it. |
| `home/Home`                                                          | Compose the screen and refresh focus when its inventory or layout changes       | Shared settings/inventory and Home controller                                |
| `HomeHeader`                                                         | Shortcuts, page tabs and status placement                                       | Home navigation and shared status stores                                     |
| `HeaderFocusIndicator`                                               | Measure a registered shortcut/tab and render its focus position                 | Explicit `shortcuts` or `tabs` group                                         |
| `AppGrid`                                                            | Render one keyed page of apps, preserving artwork while another page is active  | Ordered IDs, app records, layout settings and visibility                     |
| `AppCard`, `FireplaceCard`                                           | Launchable Home app and fireplace presentation                                  | Existing app commands through `HomeControl`                                  |
| `ContinueWatchingRow`, `ContinueWatchingCard`                        | Feed clipping/offset and item presentation                                      | Immutable feed items; live launch records stay in the service                |
| `InputDock`, `InputCard`                                             | Input collection and one input's label, artwork and connection state            | Existing input service capabilities and commands                             |
| `shared/components/AppFallback`                                      | Shared app logo/icon and label fallback for Home and Settings                   | App presentation, image lifetime and visibility                              |
| `AppActionsMenu`, `ReorderControls`                                  | App actions and move/drop controls                                              | Home controller actions; menu positioning is rendered from state             |
| `status/Clock`                                                       | One time/date view with compact, vertical, horizontal, minimal and bold layouts | Shared time snapshot and formatter; no timer                                 |
| `WeatherStatus`, `NetworkStatus`                                     | Render status data                                                              | Shared snapshots; no requests or DOM scraping                                |
| `settings/SettingsRoot`                                              | Open/closed shell and lazy content lifetime                                     | Settings view state                                                          |
| `SettingsContent`                                                    | Assemble sections and bind screen navigation                                    | Shared preferences and Settings inventory/actions                            |
| `layout/SettingsDrawer`                                              | Category sidebar and active pane, shared by both themes                         | Drawer state and registered pane refs                                        |
| `SettingsFocusIndicator`                                             | Measure registered Settings controls and render the focus position              | Sidebar/content container refs                                               |
| `AppearanceSettings`, `ClockSettings`, `InputSettings`               | Appearance/card choices, clock choices and Live TV/HDMI controls respectively   | Section-specific settings and named actions                                  |
| `HomeAppsSettings`, `AppOption`, `FireplaceOption`, `AppStoreOption` | Home membership and app-store options                                           | Selection state; they do not launch Home tiles                               |
| `ChoiceGroup`, `ChoiceOption`                                        | A labelled choice group and one selectable option                               | Value, options and selection callback                                        |
| `SelectionIndicator`                                                 | Decorative selected-choice check with a consistent contrast badge               | Parent control owns selection and `aria-pressed`                             |
| `SettingsControl`                                                    | Register a Settings control and render focus/activation                         | Settings navigation context                                                  |

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

Classes name their component or role: `clock__time`, `clock--horizontal`,
`weather-status__temperature`, `input-card__status`, `settings-drawer__pane` and
`header-focus-indicator--tabs`. Version/model names are absent from active view styles.
Existing semantic IDs such as `editor`, `grid`, `rows`, `weather` and `time`, and remote
`data-key` values, remain stable for integration and test tools. Persisted preference
keys and values also remain compatible.

| Stylesheet                                            | Owner                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------- |
| `themes.css`                                          | Shared semantic paint tokens and Classic/Glass values           |
| `base.css`                                            | Page sizing, fonts, hidden state and native/preview visibility  |
| `backgrounds.css`, `runtime.css`, `photo-weather.css` | Background layers, Fireplace/toast and weather photos           |
| `home.css`, `home-header.css`                         | Home viewport/page movement, header layout and focus indicators |
| `clock.css`                                           | Clock variants, status placement and expanded header clearance  |
| `app-cards.css`                                       | App artwork, card sizes/columns and moving/focused states       |
| `continue-watching.css`                               | Continue Watching row, cards, labels and progress               |
| `input-dock.css`                                      | InputDock and InputCard layout/states                           |
| `settings.css`                                        | Settings drawer, controls, choice previews and focus indicators |
| `app-actions-menu.css`                                | AppActionsMenu and ReorderControls                              |
| `icons.css`                                           | Shared interface icon sizing                                    |

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
