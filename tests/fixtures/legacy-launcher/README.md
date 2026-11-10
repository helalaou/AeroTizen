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
The input view subscribes to its frozen data service and keeps its tile constructors
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

`js/weather.js` is an unchanged copy of the final standalone weather runtime. The
comparison page loads it explicitly from this directory. Production owns weather
in `launcher/src/services/createWeatherService.ts`; its service tests exercise that
TypeScript owner, with the frozen status renderer used only as a test consumer.

The comparison page loads its existing frozen `js/continue-watching.js` explicitly.
Production uses `launcher/src/services/createContinueWatchingService.ts` with the
Samsung and Stremio provider adapters; its tests exercise the TypeScript owner.

`js/apps.js` preserves the final standalone app runtime. The comparison page loads it
explicitly; active app discovery, caching and commands use the TypeScript app service
and Tizen adapter. Production packages exclude this fixture.

`js/inputs-runtime.js` preserves the final standalone input runtime for comparison with
the frozen input renderer. The active input service publishes immutable source
and playback state; the Tizen adapter keeps native source records private.
`hdmi_standby.test.cjs` retains the frozen renderer checks. Active service,
handoff, playback presentation and lifecycle checks exercise the TypeScript owner.

`js/samsung-continue.js` is the unchanged final standalone Samsung provider. Provider
parity tests compare its discovery, requests and native payloads with the typed factory.
The comparison page retains its older self-contained Continue Watching runtime.
Production composition injects the typed Samsung provider after the typed Stremio provider.

`js/stremio-continue.js` is the unchanged final standalone Stremio provider. Protocol
tests compare it with the typed factory, including credential preparation, root gates,
bounded feeds, artwork and cancellation. Production creates both providers directly;
neither standalone provider script enters the TV package.
