# Legacy launcher fixtures

These Home, Settings, feed, input and status renderers support regression and comparison
tests. They are not production entry points or release assets. Change active views
in `launcher/src/` and production markup in `launcher/index.html`.

The fixture page uses `<base href="/launcher/">` to load shared runtime services
and assets from the current launcher. Its styles are frozen in this directory's
`css/` snapshot and load through explicit fixture URLs. This keeps the comparison
render independent of active CSS, including the old clock selectors. Its old view
scripts also load explicitly from this directory. Serve the repository root and open
`/tests/fixtures/legacy-launcher/`, or run `npm run test:browser` for managed servers.
The input view subscribes to the shared data service and keeps its tile constructors
out of production. The old clock renderer is used by Node tests only; the page does not load it.

Keep these fixtures until their comparison tests have equivalent active-view
coverage. Do not copy them back into the launcher or package output.

`status-view.js` preserves the old clock, weather and network markup for comparison
and presentation tests. It subscribes to the same data services as production. Pure
service tests also run without it and reject attempts to query view hosts. The active
clock is `launcher/src/status/Clock.tsx`; the old clock-layout renderer remains only
for legacy regression coverage.

`brands-view.js` retains the original tile constructors and input icon strings for
legacy artwork/rendering tests. Production `brands.js` exposes presentation data
only. `css/selection.css` keeps the old selection badges for the comparison view;
active Settings uses SelectionIndicator and the shared icon components.

`wave-background.js` preserves the old SVG-string renderer for wave comparisons at
fixed animation phases. The fixture uses the last standalone background runtime
in `backgrounds.js` and its original boot script. These scripts stay outside the
launcher package. Production uses the app-owned background view.
