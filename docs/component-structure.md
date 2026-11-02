# Launcher component ownership

Home and Settings share preferences, status data and small utilities. Each screen
owns its controls and navigation state. Promote a component to `shared/` when both
screens need the same behavior, rather than because they have a similar shape.

| Component | Responsibility | Data and commands |
| --- | --- | --- |
| `home/Home` | Compose the screen and refresh focus when its inventory or layout changes | Shared settings/inventory and Home controller |
| `HomeHeader` | Shortcuts, page tabs and status placement | Home navigation and shared status stores |
| `HeaderFocusIndicator` | Measure a registered shortcut/tab and render its focus position | Explicit `shortcuts` or `tabs` group |
| `AppGrid` | Render one keyed page of apps, preserving artwork while another page is active | Ordered IDs, app records, layout settings and visibility |
| `AppCard`, `FireplaceCard` | Launchable Home app and fireplace presentation | Existing app commands through `HomeControl` |
| `ContinueWatchingRow`, `ContinueWatchingCard` | Feed clipping/offset and item presentation | Immutable feed items; live launch records stay in the service |
| `InputDock`, `InputCard` | Input collection and one input's label, artwork and connection state | Existing input service capabilities and commands |
| `AppActionsMenu`, `ReorderControls` | App actions and move/drop controls | Home controller actions; menu positioning is rendered from state |
| `status/Clock` | One time/date view with compact, vertical, horizontal, minimal and bold layouts | Shared time snapshot and formatter; no timer |
| `WeatherStatus`, `NetworkStatus` | Render status data | Shared snapshots; no requests or DOM scraping |
| `settings/SettingsRoot` | Open/closed shell and lazy content lifetime | Settings view state |
| `SettingsContent` | Assemble sections and bind screen navigation | Shared preferences and Settings inventory/actions |
| `layout/SettingsDrawer` | Category sidebar and active pane, shared by both themes | Drawer state and registered pane refs |
| `SettingsFocusIndicator` | Measure registered Settings controls and render the focus position | Sidebar/content container refs |
| `AppearanceSettings`, `ClockSettings`, `InputSettings` | Appearance/card choices, clock choices and Live TV/HDMI controls respectively | Section-specific settings and named actions |
| `HomeAppsSettings`, `AppOption`, `FireplaceOption`, `AppStoreOption` | Home membership and app-store options | Selection state; they do not launch Home tiles |
| `ChoiceGroup`, `ChoiceOption` | A labelled choice group and one selectable option | Value, options and selection callback |
| `SettingsControl` | Register a Settings control and render focus/activation | Settings navigation context |

`HomeControl` and `SettingsControl` remain separate because they use different
navigation contracts. Neither starts platform services. Shared navigation, hooks and
contracts cannot import screens; ESLint enforces that dependency direction.

## DOM and style ownership

Only `src/index.ts` discovers the two app mount hosts. Components register their own
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

| Stylesheet | Owner |
| --- | --- |
| `preact-home.css` | Home viewport/masks, page movement and header focus geometry |
| `clock-layouts.css` | Clock layouts and their header clearance; clock choice previews |
| `source-dock.css` | InputDock and InputCard layout/states |
| `tile-actions.css` | AppActionsMenu and ReorderControls |
| `theme-layout.css` | Shared drawer layout and Classic/Glass paint for Home and Settings |
| `card-modes.css` | App card size/column variants |
| `style.css`, `photo-weather.css` | Base controls/runtime surfaces and weather-photo layer |

Theme token and selector consolidation is a separate cleanup stage. Legacy view
fixtures retain their old clock stylesheet so comparisons do not follow active
clock-selector changes. They are excluded from production packages.
