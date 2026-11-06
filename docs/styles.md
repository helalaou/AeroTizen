# Launcher style rules

Use the [component ownership map](component-structure.md) to find a stylesheet.
New or migrated components import a sibling `Component.module.css`. Keep layout
and state selectors with their component, and remove the old global rules when
migrating. Shared Settings choices, groups, section headings, focus/selection
indicators and input names now use modules. The remaining global styles are
migrated in separate changes. Keep theme paint in
`launcher/css/themes.css`, which defines the default Classic values and the
`body.glass-ui` overrides. Prefer role names such as `--settings-surface`,
`--header-focus-surface` and `--menu-border` over new colour literals for shared
surfaces, text, borders, focus and shadows. Component-specific artwork and input
state palettes stay with their component.

## Cascade and state

`launcher/index.html` loads tokens and base rules first, then global component
styles and the compiled `js/launcher-ui.css`. Vite imports module styles directly
in development; the development page removes the production CSS link. Keep this
link in the packaged widget: the library build emits CSS separately from JavaScript.

Each active selector is defined once within its media context. Use component
classes and explicit state modifiers. Migrated controls use `data-focused="true"`
and `aria-pressed="true"`; never query a generated module class from runtime code
or tests. Keep the Settings scope under `#editor` while the global sheet remains;
modules may use `:global(#editor)` to retain that existing scope. Do not add global
aliases for generated classes. Keep module selectors flat and Chromium 69 compatible.

Do not add extra IDs or theme selectors to beat an earlier rule. The Clock owns
expanded header clearance; the header and Home styles supply compact defaults.

App brand data sets `--app-background` on AppCard and AppOption. The card style
uses that value, while Settings can supply its focused surface through a normal
state rule. Do not put state paint into an inline background style.

`ControlGroup` owns wrapping and grid layout for Settings controls. `ChoiceGroup`
supplies its choices; time/date and input-name sections use the same layout owner.
`SelectionIndicator` takes an explicit small variant for wallpaper swatches.
Component variants must not depend on a parent's private CSS class.

## Runtime DOM boundary

Preact owns component classes and focus state. Settings asks `homeScreen.blur()`
to clear Home focus; the old document-wide `.focused` sweep has been removed.
`HomeControl` and `SettingsControl` render `data-focused` from their state. Their
global `.focused` class remains temporarily for unmigrated styles and checks.
ESLint rejects legacy `classList` access on component nodes, `className` assignments
and `setAttribute("class", ...)` calls.

The remaining shell classes are public integration hooks, not module classes:

| Hook                                         | Owner                        | Purpose                                                         |
| -------------------------------------------- | ---------------------------- | --------------------------------------------------------------- |
| `body.tv`                                    | `launcher/js/inputs.js`      | Hide Home while the native TVWindow is visible                  |
| `body.glass-ui`, `body.clock-layout-compact` | `home/index.tsx`             | Apply the existing appearance and clock modes before measuring  |
| `body.editing`, `body.previewing`            | `useSettingsPresentation.ts` | Settings and wallpaper preview visibility, with unmount cleanup |

The obsolete DOM constructors, list-chunking helper and focus sweep live only in
the comparison helper. Keep frozen fixture scripts and CSS out of the migration.
Native/background adapters also own page transparency; dynamic
geometry, progress and brand custom properties remain explicit inline data.

The global `[hidden]` rule must override component display rules, including SVG
status hosts. The remaining `!important` declarations also cover reduced motion
and native/preview visibility. Keep these exceptions documented. Normal focus,
selection, theme and layout rules must use the cascade without `!important`.

## Checks and compatibility

Prettier formats CSS. `npm run lint:css` runs the focused Stylelint rules in
`stylelint.config.cjs` across both `launcher/css/` and `launcher/src/`:
syntax/property mistakes, invalid colours and units,
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
The browser comparison helper serves the unchanged `tests/fixtures/legacy-dom.js`
at the legacy page's shared DOM-script URL. This retains the old focus behaviour
without shipping it in the production widget or changing the frozen renderer.
