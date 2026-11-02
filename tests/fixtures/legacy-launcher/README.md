# Legacy launcher fixtures

These Home, Settings, feed, input and status renderers support regression and comparison
tests. They are not production entry points or release assets. Change active views
in `launcher/src/` and production markup in `launcher/index.html`.

The fixture page uses `<base href="/launcher/">` to load shared runtime services,
styles and assets from the current launcher. The clock stylesheet is frozen in
`css/clock-layouts.css` here, so old clock selectors do not constrain active names. Its old view scripts load explicitly
from this directory. Serve the repository root and open
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
