# Preact Home migration

The core migration is deliberately separate from optional clock, HDMI, card-layout
and Glass UI contributions (#28, #29, #34, #30). It starts on upstream main c4b649b.

The production build mounts typed Home components before Settings and the existing
boot script. Both screens share one bundled Preact instance, using existing Vite,
TypeScript, external-store hooks and image-sequence lifecycle patterns. No runtime
CDN, independent weather client or native service rewrite is introduced. The source
HTML declares Home and Settings hosts directly. Legacy views live in
`tests/fixtures/legacy-launcher/`; development and compiled HTML use the same active
views, and release packages reject the old renderers. Existing app discovery, native
handoffs, input switching, weather, clock, network and watcher operations stay behind
typed adapters. Preact owns the header status, controls, grids, action menu and feed
cards. Status services publish data and do not inspect or change view markup.

Remote transactions preserve short/held OK, move/drop persistence, app menu actions,
Home/All apps tabs, Back, per-row navigation, nearest visible feed-card navigation,
carousel clipping and Settings focus restoration. Keyed Home/All apps trees retain
loaded artwork across tab switches. Feed records update in place with stable keys;
the regression test verifies updated progress and retained nodes rather than requiring
legacy reconstruction of a changed record. Input discovery and `inputs.refresh()`
publish data without constructing tiles.
`home/state/createHomeInventory.ts` publishes immutable snapshots from app, input, feed
and preference subscriptions; unchanged data retains its identity. The old input
renderer belongs to the legacy test fixture. Production never replaces `inputs.render`.

Validation includes the entire existing browser suite, additional remote/move/drop/
reload checks and paired 1920x1080 baseline geometry/screenshots. Every compiled
script is parsed at ES2018 and built for Chromium 69. Syntax compatibility is not
proof of TV API/CSS performance. Physical S90C acceptance of this migration is pending;
earlier weather/Home integration tests do not establish acceptance of the new renderer.

PR #72 remains independent: its shared Weather API and solar selection files are not
changed by this migration. The integration branch will include its exact fix commit
for compatibility testing while it remains unmerged. Native HOME, Live TV, YouTube,
Prime Video, Continue Watching and weather service policy tests must remain green.

Parity review follow-up: movement uses installed visible IDs, disappearing move/menu
targets are cancelled safely, and visibility loss clears pending OK/menu state.
The renderer honours optional active/recognised/manually pinned source capabilities
without equating a pin with a live HDMI signal. Compiled lifecycle regressions cover
these interruptions and stale inventory cases.

The fixed content viewport uses a static alpha fade at the bottom and a softer top
fade while scrolled; the header remains outside the mask. Continue Watching cards
use a short transform-only focus transition with reduced-motion support. Their
feed, launch behavior, artwork and progress data are unchanged. These refinements
require physical S90C acceptance.

### Theme-independent motion and navigation

The tested custom reference's `launcher/js/home-screen.js` and
`launcher/css/s90c-v99246-cleanup.css` use cached artwork and a one-shot page reveal,
without delaying remote transactions. The Preact renderer now follows that model
with a 240 ms opacity/short horizontal reveal on the existing page surface.
Home/All apps switch synchronously, including rapid reversals and Back; no screenshot
snapshot, duplicated live page, network reload or animation-completion timer is used.

A fixed outer bottom mask and an inner top mask keep the header untouched. The top
fade interpolates mask position over 320 ms instead of switching gradient images.
Scrolling uses the same duration/easing, with focus clearance outside both fades.
Reduced-motion preferences disable movement and page reveals. Both appearances
share centred tab geometry, Samsung Home access and moving focus plates; Glass
changes their paint rather than adding/removing navigation. Existing Samsung Home
services still own the escape action and native HOME policy remains unchanged.
Physical S90C smoothness and firmware rendering acceptance remain pending.

### Application ownership

`app/createLauncherApp.ts` creates the preference store once for Home, Settings and
the clock. Shared contracts live outside screen folders, and the typed legacy runtime
boundary is in `platform/tizen/launcherRuntime.ts`. Home's mount function receives
these dependencies and returns its bridge and disposer. It releases inventory and
shell subscriptions, cancels held OK state and unmounts its view on disposal.
Composition owns the visibility listener and restores only the bridges it still owns.

The entry point accepts development updates and releases the previous app instance.
Legacy boot and service timers run once; remounting views repaints their status hosts
without restarting those services. Status subscriptions are also released during
replacement; service timers keep their single boot-owned lifecycle.

### Shared status data

`services/createStatusStores.ts` binds the clock, weather and network services once.
Clock ticks recheck weather cache expiry; preference changes update effective status
visibility and unit conversion. These bindings do not start timers or fetch forecasts.
The existing weather cache, request cancellation, retry cadence and solar policy stay
in the weather service. PhotoWeather subscribes to weather updates directly.

`status/HeaderStatus.tsx` composes `Clock` and `WeatherStatus` from shared data.
`Clock` accepts compact, vertical, horizontal, minimal and bold layouts with one
formatting path and timer source. Weather rendering and network rendering are separate
components. Status views do not scrape another view or observe its markup. Compact
time width uses a ref and cached font/locale measurements to keep the header stable.
Saved clock settings are retained. Clock classes now use component names; see
[component ownership](component-structure.md) for screen boundaries and style owners.

### Screen components and navigation refs

Home composes HomeHeader, AppGrid, ContinueWatchingRow, InputDock and AppActionsMenu.
Each collection owns its item presentation. The controller publishes vertical scroll
and carousel offset state; Preact renders transforms and the scrolled class. Ref
registrations supply viewport geometry without document-wide component lookups.
Menu positioning also renders from measured state. Existing keyed app/feed trees and
remote action contracts remain intact.
