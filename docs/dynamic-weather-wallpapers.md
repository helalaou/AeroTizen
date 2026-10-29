# Dynamic weather wallpapers

Related to [#19 — More wallpapers, and use wallpapers already on the TV](https://github.com/helalaou/AeroTizen/issues/19).
This implements additional bundled wallpapers only, not reading Samsung Ambient
Mode or Frame Art images already stored on the TV. Issue #19 remains open.

In Settings, choose **Dynamic weather wallpapers → Automatic (weather)**.
The option is off by default. Nine local **AI-generated** landscape scenes follow
clear, partly cloudy, overcast, rain, storm, snow, fog, night and sunset conditions.
See [asset provenance and redistribution](../launcher/assets/weather/CREDITS.md).

The control uses Preact Settings' typed store and named actions. It keeps your
selected still/animated background and speed unchanged; **Off** restores that
selection. Choosing another underlying background while automatic mode is active
changes the saved fallback, not the automatic scene. Existing background choices
and the legacy Settings comparison fixture remain unchanged.

## Weather and time

The feature reuses the existing Weather service, saved city, Open-Meteo request,
cache, cancellation and refresh cadence. It does not add a second weather client.
Weather requests remain enabled when the header weather widget is hidden but the
wallpaper is enabled; disabling both consumers stops automatic weather requests.
The usual approximate IP-location lookup is used only if no city is saved.

Sunrise/sunset are requested with UTC timestamps and converted to epoch milliseconds,
so the saved city's solar phase does not depend on the TV's timezone. Clear or
partly cloudy conditions use sunset from 45 minutes before sunset until 20 minutes
after. Night takes precedence for all weather codes. When the cached reading lacks usable solar data for the current solar day,
enabling wallpapers promptly requests a forecast through the existing weather
client. A matching in-flight request is reused; unsuccessful or incomplete
responses do not trigger repeated requests on every toggle. Without valid solar
data the chosen background stays visible: an old or absent `is_day` value is not
used to guess the current phase. The temperature widget remains usable. Invalid, expired or location-mismatched readings use
the original background; images failing to load also fall back safely.

Solar fields must contain finite numeric sunrise/sunset epochs with a positive
interval shorter than 24 hours, and the reading must satisfy the existing two-hour
age limit. Each pair covers the solar day centered on its sunrise/sunset midpoint
(12 hours on either side), rather than assuming the TV's local calendar day.
Yesterday's or tomorrow's solar pairs are not extrapolated into the current day.
Locations without usable sunrise/sunset (including some polar conditions) retain
the chosen background until trustworthy solar data is available.

See the [S90C solar-cache test and rollback procedure](s90c-weather-solar-validation.md).

## Runtime cost

- Full HD baseline JPEGs, no remote wallpaper downloads or extra animation loop.
- One selected image loads before the underlying animated renderer is suspended.
- At most one 60-second solar-phase timer, only while enabled and visible.
- Hidden-page and disabled-state callbacks are cancelled/ignored.
- No all-scene preload, crossfade, backdrop blur or 4K image allocation. A decoded
  Full HD RGBA surface is roughly 7.9 MiB; browser caching and TV memory usage vary.
- TV-input mode hides the image layer; normal input handling is unchanged.

## Validation still needed on physical TVs

Check saved preferences, visual legibility, image quality/banding, missing-image
fallback, switching off back to an animated background, sunset/night transitions,
and hidden-header behavior. Measure startup, scene decode latency and memory on
older Chromium/Tizen devices. Browser tests do not establish hardware performance.
No HOME remapping, watcher service, native app handoff or Samsung integration is
introduced by this feature.
