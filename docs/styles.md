# Launcher style rules

Use the [component ownership map](component-structure.md) to find a stylesheet.
All component styles live in co-located `Component.module.css` files. Only
`base.css`, `themes.css` and `motion.css` remain global, for page rules, shared
paint and motion policy. Keep layout and state selectors with their component.

Use a component-named directory for a styled component and its private helpers,
for example `AppGrid/AppGrid.tsx` with `AppGrid/AppGrid.module.css`. Small components
without companion files can stay flat. Apply this structure as components are
migrated; imports name the component file directly, without a barrel per folder.

Keep theme paint in
`launcher/css/themes.css`, which defines the default Classic values and the
`body.glass-ui` overrides. Prefer role names such as `--settings-surface`,
`--header-focus-surface` and `--menu-border` over new colour literals for shared
surfaces, text, borders, focus and shadows. Component-specific artwork and input
state palettes stay with their component.

A theme can also change a few values that components own. A component reads such
a variable with its own value as the fallback, for example
`border-radius: var(--home-card-radius, 10px)`, so Classic and Glass leave them
unset:

- type: `--font-ui`, `--app-label-weight`, `--header-tab-weight`,
  `--home-section-heading-weight`, `--home-section-heading-tracking`,
  `--continue-title-weight`, `--clock-date-weight`, `--clock-time-weight`,
  `--settings-title-transform`, `--settings-title-tracking`,
  `--settings-sidebar-line-height`, `--settings-return-label-wrap`;
- radii: `--home-card-radius`, `--continue-card-radius`,
  `--continue-badge-radius`, `--input-card-radius`, `--input-dock-radius`,
  `--header-tab-radius`, `--header-tab-plate-radius`, `--toast-radius`;
- app tiles: `--home-card-shadow`, `--home-card-focus-transform`,
  `--home-card-focus-shadow-top`, `--home-card-sheen`;
- Continue Watching: `--continue-title-text`, `--continue-focus-label-surface`,
  `--continue-focus-title-text`, `--continue-focus-episode-text`,
  `--continue-artwork-mark`, `--continue-artwork-mark-shadow`;
- inputs: `--input-connected-text`, `--input-connected-icon-text`,
  `--input-connected-subtitle-text`, `--input-focus-icon-text`,
  `--input-empty-opacity`;
- header: `--header-icon-text`, `--header-icon-surface`, `--header-icon-shadow`,
  `--header-tab-plate-surface`, `--header-tab-plate-shadow`,
  `--header-tab-plate-border`, `--header-tab-plate-text`,
  `--header-tab-focus-shadow`, `--header-tab-underline`,
  `--header-tab-underline-shadow`, `--header-status-shadow`,
  `--header-status-divider`;
- Settings: `--choice-selected-text`, `--settings-category-icon`,
  `--settings-scroll-ring-room`;
- spacing and toast: `--home-row-clearance`, `--toast-text`, `--toast-shadow`.

The three `--input-connected-*` text variables are declared in `themes.css`,
where they follow the neutral input text. Four of the variables paint a layer
that is empty until a theme sets it: `--home-card-sheen` over an app tile,
`--continue-artwork-mark` over a Continue Watching image,
`--header-tab-underline` under the current tab and `--header-status-divider`
between weather, date and time.

## Cascade and state

`launcher/index.html` loads tokens and base rules first, then the compiled
`js/launcher-ui.css`. Vite imports module styles directly
in development; the development page removes the production CSS link. Keep this
link in the packaged widget: the library build emits CSS separately from JavaScript.

Each active selector is defined once within its media context. Use component
classes and explicit state modifiers. Migrated controls use `data-focused="true"`
and `aria-pressed="true"`; never query a generated module class from runtime code
or tests. Module selectors must not depend on `#editor`, IDs or global class aliases.
`SettingsControl` owns the shared focus reset in its own module.
Do not override focused controls through an ID selector.
Controls can supply `--settings-control-focus-outline` for a visible focus outline,
as the drawer close button does.
Controls that draw their own focus ring set `data-settings-focus-owner="control"`
so `SettingsFocusIndicator` does not paint a second focus layer over them.

`SettingsRoot` owns the overlay and preview visibility. `SettingsDrawer` owns the
drawer geometry, sidebar and pane layout. `SettingsPanel` owns the shared drawer
and picker surface and font; `SettingsHeading` owns panel/section title, kicker
and description typography. `SettingsCategory` and `SettingsHelp` own the sidebar
rows and remote help. Expanded state uses `data-expanded` on the
frame and sidebar, while the content uses `hidden`. Tests can use the stable
`data-settings-drawer` part names, `data-settings-help`, `data-settings-title` and
`data-settings-update-notice` hooks instead of private classes.

Use standard CSS nesting in `.module.css` files. Vite's Lightning CSS transformer
flattens nested selectors for Chromium 69 in both development and production.
Keep nesting at two levels or fewer. Shared sheets under `launcher/css/` ship as
copied assets, so they must remain flat. Sass is not required for nesting; theme
values remain runtime custom properties such as `var(--control-text)`.

Lightning CSS also adds vendor prefixes for the configured Chromium 69 target.
Write standard properties in compiled modules and let that transformer supply
supported fallbacks; a separate Autoprefixer pass is not needed. All component
styles pass through this compiler; shared page rules retain their
explicit font-smoothing prefix.

The multiline clamp is an intentional exception: keep `display: -webkit-box`,
`-webkit-box-orient: vertical` and `-webkit-line-clamp` together. They form the
legacy clamping behavior needed by older TVs. The installed compiler does not
generate this combination from `line-clamp`, so changing the source to that
single standard property would lose the fallback.

CSS Modules scope class and animation names, not bare element selectors. Apply
local classes such as `.title` and `.description` directly to headings and copy.
Use a nested child selector when that relationship is part of the component,
as with `.small { > svg { ... } }` in `SelectionIndicator`.

Use `shared/styles/text.module.css` for single-line truncation. Import its
`truncate` class and apply it to the text element, alongside the component's local
class. Keep width and layout constraints with the component; the utility only
owns wrapping, clipping and ellipsis. Choice labels retain their two-line default
and use a nested local modifier when a single-line result is requested.

Do not add extra IDs or theme selectors to beat an earlier rule. `HomeHeader` owns
header clearance, `HeaderStatus` owns status placement, and `Clock` owns its layout
variants. Weather receives the clock layout and weather-only state as explicit
props. Their modules do not depend on a parent's private class or body clock mode.
Tests use `data-home-header`, `data-header-focus`, `data-clock-part` and
`data-weather-part`; semantic IDs remain available for integrations.

`HomeAppCard` owns the common app/Fireplace frame, focus, moving state and reorder
controls. `AppGrid` owns sizes, columns and compact/expanded clock clearance through
explicit data attributes. `AppArtworkContent` owns shared image geometry; its inherited radius
keeps images rounded when moving cards expose their overflow.
`HorizontalScroller` owns clipping and track movement for both
app and Continue Watching rows.

`ContinueWatchingRow` owns its track spacing. `ContinueWatchingCard` owns focus,
artwork, source badges, titles and progress. Episode titles combine a local display
modifier with the shared `truncate` utility; other titles keep their two-line clamp.
Tests use `#continue-items > [data-key]`, `data-focused` and `data-continue-part`
hooks. Keep card focus paint and motion with the card, rather than in `base.css`.

`InputDock` owns collection spacing and the compact Glass dock. `InputCard` owns
its frame, icon, labels, status badge and focused/disconnected states. Pass the
compact layout explicitly; child geometry must not depend on a parent's class.
The card exposes `data-input-card`, `data-status`, `data-disconnected`, `data-variant`
and `data-input-part` hooks. Classic and Glass keep their existing layouts.
Theme tokens own neutral input paint; connection-status palettes keep local
defaults through optional named variable fallbacks. Both labels reuse the shared
truncate utility where their layout needs it. Preserve margin-based dock spacing
for Chromium 69, which does not support flex gaps.

`Home` owns the viewport, fades, page reveals and section spacing. The inputs
section exposes `data-home-section="inputs"` as a layout slot. Tests use
`data-home-viewport`, `data-home-mask`, `data-home-page`, `data-app-grid`, `data-columns`,
`data-moving`, `data-reorder-arrow` and `data-app-actions-focus`. Use `data-id` to
identify app cards and ARIA state for menu selection.

The top fade uses a static mask texture. Its container moves by 112px while
`data-home-mask-content` moves by the opposite amount with the same duration and
easing. This keeps content geometry and the fade path unchanged and lets the
compositor animate the fade without repainting its mask on each frame. The bottom
fade remains fixed on the viewport.

App placeholders use `--app-placeholder-surface` and theme text colour. The shared
surface follows the theme card paint: solid in Classic and a glass gradient in Glass.
App names stay visible while an image is pending, missing or failed. Samsung artwork
hides the placeholder without changing the card's geometry. The Fireplace retains
its own motif through `--app-background`; installed apps do not set this property.

`AppArtworkContent` keeps Samsung cache artwork full-size. Package-icon fallbacks
use a smaller image with the app name below it in Home, All apps, Settings and
source badges. `AppFallback` uses its explicit compact layout for that name.
The presentation data identifies the package icon; views do not inspect file paths
or maintain app lists. Icon spacing uses margins for Chromium 69 compatibility.

`SettingsAppCard` owns the common app-choice frame, focus, selection and disabled
states. App and Fireplace options supply their own content. `AppFallback`
owns name sizing and clamping through explicit `home`, `favourite`, `source` and
`badge` variants. Home artwork passes the `badge` variant for Continue Watching
source names. Keep the placeholder free of image requests and timers.

`StoreCard` owns the complete store appearance on All apps and Settings: surface,
corners, focus ring, icon, labels and spacing. Large and small variants change
dimensions; paint and typography rules are shared. The screen wrappers supply
`HomeControl` or `SettingsControl` through `renderControl` for navigation and activation.

`WallpaperSwatch`, `SettingsSlider` and `WeatherSearch` own their control styles.
`SettingsHint` supplies section status/help text. Each section owns its collection
layout, while About applies local classes directly to paragraphs, facts and notes.

`ControlGroup` owns wrapping and grid layout for Settings controls. `ChoiceGroup`
supplies its choices; time/date and input-name sections use the same layout owner.
`SettingsControl` supplies common focus resets; each control owns its state paint.
`SelectionIndicator` takes an explicit small variant for wallpaper swatches.
Component variants must not depend on a parent's private CSS class.

## Motion

`launcher/css/motion.css` owns shared UI durations and one reduced-motion query.
Feedback, focus movement, shape changes and entry effects keep their normal
durations; when the browser reports reduced motion, those durations become `0s`.
Components own the transition properties and easing, and always render their final
state. Do not override the shared motion durations in theme or component rules.
Keep keyframes with their component until multiple components need the same
effect. A shared CSS Module can then own the keyframes and reusable animation class.

Settings, the Home header, app cards, viewport, scrollers, page reveals, app
actions, Continue Watching, inputs and the Fireplace volume notice use this policy.
Reorder arrows also stop moving
under reduced motion.
This removes their repeated media queries and reduced-motion `!important` rules.
New and migrated components should use the same tokens. Keep a local media query only when an effect
needs different behavior, such as replacing movement with a static alternative.
The policy does not change wallpaper or JavaScript animation behavior.
The saved Performance mode also sets these UI durations to zero. Background views
render blobs and waves without animation, and omit WebGL canvases in this mode.
The root `data-performance-mode` attribute is owned by the Home shell.

## Runtime DOM boundary

Preact owns component classes and focus state. Settings asks `homeScreen.blur()`
to clear Home focus; the old document-wide `.focused` sweep has been removed.
`HomeControl` and `SettingsControl` render `data-focused` from their state. Their
old global `.focused` aliases have been removed. Tests assert data/ARIA state on
the current components.

The remaining shell classes are public integration hooks, not module classes:

| Hook            | Owner                          | Purpose                                        |
| --------------- | ------------------------------ | ---------------------------------------------- |
| `body.tv`       | `inputs/InputPlaybackView.tsx` | Hide Home while the native TVWindow is visible |
| `body.glass-ui` | `home/index.tsx`               | Apply the existing appearance before measuring |
| `body.editing`  | `useSettingsPresentation.ts`   | Settings visibility, with unmount cleanup      |

Native/background adapters also own page transparency; dynamic
geometry, progress and feature artwork custom properties remain explicit inline data.

The global `[hidden]` rule must override component display rules, including SVG
status hosts. `base.css` owns native/Settings visibility for `[data-home-header]`
and `[data-home-content]`;
the Settings rule has enough specificity to keep the header visible and dimmed
when native TV is active. Weather-photo visibility uses `data-weather-photo`.
The background mount uses `data-background-host` for fixed canvas sizing.
These shell rules do not need `!important`; only the universal hidden-attribute
rule uses it. Normal focus, selection, theme and layout rules must
use the cascade without `!important`.

## Checks and compatibility

The packaged launcher uses a 1920×1080 CSS canvas, which the TV scales to its
panel. Test layout at that viewport; do not add compact-screen breakpoints just
to fit a smaller desktop preview window.

Prettier formats CSS. `npm run lint:css` runs the focused Stylelint rules in
`stylelint.config.cjs` across both `launcher/css/` and `launcher/src/`:
syntax/property mistakes, invalid colours and units,
duplicate declarations/selectors, and unsafe keyframe declarations. `npm run lint`
runs both ESLint and Stylelint; CI uses that command with zero warnings allowed.
Module rules also reject ID selectors and nesting deeper than two levels.

Keep CSS compatible with Chromium 69. Use `top`, `right`, `bottom` and `left`
instead of the `inset` property; Stylelint rejects the latter. A build's JavaScript
syntax check does not establish CSS or TV compatibility. Animate transforms and
opacity, preserve the reduced-motion rules, and test remote focus after changes.

Keep an explicit `translateZ(0)` when a transform needs 3D compositing.
Lightning CSS can simplify `translate3d(x, y, 0)` to a 2D transform; this can change
SVG rasterization even when geometry stays the same.

Browser tests cover both themes, all clock variants, card/input layouts, Settings
navigation, wallpaper visibility and focus geometry. For cascade changes, compare
compiled before/after screens with fixed time, cached weather and disabled motion.
Browser tests assert current layout and interaction contracts directly. The retired
JavaScript launcher and its CSS snapshot are no longer browser-test baselines.
