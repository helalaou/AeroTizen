# Interface icons

Use named imports from the pinned `lucide-preact` dependency for interface icons.
Render them through `shared/icons/Icon.tsx`. Defaults are a 24-unit SVG, a two-unit
stroke and `currentColor`; component CSS owns the displayed size. Weather colours
and dark arrows on white move controls are explicit contrast overrides.

Controls keep their visible text and accessible labels. The shared helper makes
icons decorative (`aria-hidden` and `focusable="false"`) unless a standalone status
icon supplies `label`. The network indicator uses this labelled mode. Icons are not
remote-navigation targets. SelectionIndicator renders a decorative check; its
control retains `aria-pressed`.

Import each required icon by name in its owner. Small maps of those named imports
are allowed for input types, weather conditions and directions. Do not import a
namespace, the complete catalogue, or the package dynamically. ESLint rejects those
patterns. The build records retained icon modules in `dist/launcher-icons.json`,
outside the TV runtime. Build tests check that selected modules remain, unused icons
are removed and the UI bundle does not contain the full catalogue.

App logos and artwork stay in the app catalogue and `AppLogoIcon`. The Fireplace
flame is the existing custom motif in `FlameIcon`; it is not a general interface
symbol. These custom SVGs also remain decorative. Input icons are components and
no longer require the runtime SVG string table. Decorative wave artwork lives in
`backgrounds/WaveBackground.tsx`, with its existing shapes and CSS animation.

The old string table, tile constructors and selection badge CSS live only under
`tests/fixtures/legacy-launcher/` for comparison tests. Production `brands.js`
provides presentation data only. Release guards reject the old rendering adapter.

The build copies the dependency's complete LICENSE to
`licenses/lucide-preact.txt`. It includes Lucide's ISC terms and the inherited Feather
MIT notice. Packaging requires that file and the Preact notice. Do not replace it
with a short attribution. See the official [Preact guide](https://lucide.dev/guide/preact/getting-started)
and [license](https://lucide.dev/license).

Compiled scripts continue to target Chromium 69 and pass the ES2018 parser check.
These syntax checks and browser tests do not replace physical TV acceptance.
