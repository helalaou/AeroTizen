# Preact Home migration

The core migration is deliberately separate from optional clock, HDMI, card-layout
and Glass UI contributions (#28, #29, #34, #30). It starts on upstream main c4b649b.

The production build mounts typed Home components before Settings and the existing
boot script. Both screens share one bundled Preact instance, using existing Vite,
TypeScript, external-store hooks and image-sequence lifecycle patterns. No runtime
CDN, independent weather client or native service rewrite is introduced. The source
HTML and legacy Home renderer remain a comparison fixture; compiled HTML does not
load the legacy Home or Continue Watching renderer. Existing app discovery, native
handoffs, input switching, weather, clock, network and watcher operations stay behind
typed adapters. Stable header status hosts remain owned by their existing services;
Preact owns the surrounding header, controls, grids, action menu and feed cards.

Remote transactions preserve short/held OK, move/drop persistence, app menu actions,
Home/All apps tabs, Back, per-row navigation, nearest visible feed-card navigation,
carousel clipping and Settings focus restoration. Keyed Home/All apps trees retain
loaded artwork across tab switches. Feed records update in place with stable keys;
the regression test verifies updated progress and retained nodes rather than requiring
legacy reconstruction of a changed record. Input subscription/render compatibility
publishes data instead of writing into Preact-owned children.

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
