# Clock layouts

The shared Preact `Clock` renders one selected layout: compact, vertical, horizontal,
minimal or bold. Compact remains the default. Expanded variants preserve the Large
Vertical, Horizontal, Thin and Bold typography and the existing `clockLayout` and
`aeroClockStyle` settings.

`status/HeaderStatus.tsx` composes time/date and weather presentation. `useClock`
reads one shared time store and reuses the existing locale formatter. `WeatherStatus`
renders the shared weather snapshot. Views add no timer or forecast client, and do
not scrape weather markup or use a MutationObserver. The existing service owns
weather requests, matching caches, unit conversion, cancellation and solar policy.

Settings controls live in `settings/sections/ClockSettings.tsx`. Browser coverage includes all layouts,
12/24-hour and date choices, visibility, persistence, remote navigation and locale
fields. Clock uses structured hour/minute/day-period fields where available, retaining
the formatted-string fallback for older Intl implementations. Compact width reserves
cached font/locale measurements through a ref.

Clock styles use component classes such as `clock__time` and `clock--horizontal`;
weather uses its own `weather-status__*` classes. Historical model/version selectors
are confined to comparison fixtures. Expanded layouts keep the 24 px content clearance. TV testing of the completed cleanup is deferred;
reference-version results do not establish older-TV compatibility.
