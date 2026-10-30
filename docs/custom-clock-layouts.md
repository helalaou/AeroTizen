# Optional clock layouts

Updates PR #28 on current upstream without rewriting shared history. Classic is
the unchanged default. The optional Preact clock preserves Large Vertical,
Horizontal, Thin and Bold typography from AeroTizen Custom and the original
`clockLayout` / `aeroClockStyle` settings. Date and time formatting remain upstream
operations, including localization, saved 12/24-hour choices and visibility.
The widget subscribes to the existing clock and weather host; it creates no timer
or forecast client. Older firmware without MutationObserver updates on clock ticks.

Settings controls live in Preact `DisplaySettings`. Browser tests exercise all four
styles, visibility, saved date/time choices and reload persistence, with screenshots.
Existing formatter/locale and weather unit tests remain applicable. The modernized
build has not been physically tested on the S90C; reference-version testing does
not establish acceptance of this adaptation or performance on older TVs.

Parity review follow-up: changing clock layout invalidates Settings navigation
geometry immediately. CustomClock reads optional structured hour/minute/day-period
fields from the existing formatter, preserving Finnish separators, Korean leading
periods and Arabic digits; older Intl retains the formatted-string fallback.
Compiled D-pad and locale regressions cover these cases without an extra timer.

The custom-clock content padding targets `main#rows` within the viewport, including
the core renderer's nested animated mask. This preserves the existing 24 px
clearance without changing clock layout or persisted formatting preferences.
