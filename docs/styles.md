# Launcher style rules

Use the [component ownership map](component-structure.md) to find a stylesheet.
Change a component's layout and states in that file. Keep theme paint in
`launcher/css/themes.css`, which defines the default Classic values and the
`body.glass-ui` overrides. Prefer role names such as `--settings-surface`,
`--header-focus-surface` and `--menu-border` over new colour literals for shared
surfaces, text, borders, focus and shadows. Component-specific artwork and input
state palettes stay with their component.

## Cascade and state

`launcher/index.html` loads tokens and base rules first, then component styles.
Each active selector is defined once within its media context. Use component
classes and explicit state modifiers. Keep the Settings scope under `#editor`;
do not add extra IDs or theme selectors to beat an earlier rule. The Clock owns
expanded header clearance; the header and Home styles supply compact defaults.

App brand data sets `--app-background` on AppCard and AppOption. The card style
uses that value, while Settings can supply its focused surface through a normal
state rule. Do not put state paint into an inline background style.

The global `[hidden]` rule must override component display rules, including SVG
status hosts. The remaining `!important` declarations also cover reduced motion
and native/preview visibility. Keep these exceptions documented. Normal focus,
selection, theme and layout rules must use the cascade without `!important`.

## Checks and compatibility

Prettier formats CSS. `npm run lint:css` runs the focused Stylelint rules in
`stylelint.config.cjs`: syntax/property mistakes, invalid colours and units,
duplicate declarations/selectors, and unsafe keyframe declarations. `npm run lint`
runs both ESLint and Stylelint; CI uses that command with zero warnings allowed.

Keep CSS compatible with Chromium 69. Use `top`, `right`, `bottom` and `left`
instead of the `inset` property; Stylelint rejects the latter. A build's JavaScript
syntax check does not establish CSS or TV compatibility. Animate transforms and
opacity, preserve the reduced-motion rules, and test remote focus after changes.

Browser tests cover both themes, all clock variants, card/input layouts, Settings
navigation, wallpaper visibility and focus geometry. For cascade changes, compare
compiled before/after screens with fixed time, cached weather and disabled motion.
The CSS under `tests/fixtures/legacy-launcher/css/` is a frozen comparison snapshot;
it is neither active source nor part of the release package. Do not update that
snapshot just to make a changed production screen pass a comparison test.
