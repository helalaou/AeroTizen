# Continue Watching MVP: Frame test

2024 Samsung Frame, Tizen 9. Launcher version 2.3.0, with the existing native Home,
boot and Art Mode configuration. This is an experimental build on
`feat/continue-watching-discovery`; it has not been added to PR #49.

## What is implemented

- Off by default, with saved app choices in Settings.
- Discovery from installed Continue Watching metadata, including hidden services
  in the same package. Store IDs use exact catalogue identity, not app names.
- A combined Home row, ordered by provider activity timestamp. Unknown times sort
  last. Exact duplicate content IDs are collapsed within a source; distinct
  episodes and zero-offset next episodes remain eligible.
- Direct on-device GET reads, bounded timeouts and empty-result retries. Refresh
  runs at startup, on return and on source changes. There is no periodic polling.
  Disabled or hidden readers cancel pending work.
- Viewing records stay in memory. No account login, root helper or PC runtime.
- Card selection forwards the provider's opaque payload through Samsung's
  `PAYLOAD.values` application-control envelope. Oversized payloads are rejected,
  not truncated. Failed launches show an error.

## Initial verification

Normal SDB was used for the update and debugger. No root calls, provider launches,
Home writes, uninstall or account requests were used in this test.

| Source discovered on TV | Selected | Result |
| --- | --- | --- |
| Prime Video | Yes | 2 cards |
| ITVX | Yes | 5 cards, including older distinct episodes |
| Channel 4 | Yes | Empty after retries; remains selectable |
| YouTube | No | Declared support discovered; feed not read |

The real Home screen rendered 7 cards with artwork, provider labels, episode
labels and available progress. Debugger network events confirmed HTTP 200 reads
from `[::1]:9013`, with no disk cache or service worker response.

Saved launcher preferences survived the update. Final native Home values and the
persisted watcher control receipt matched the stable pre-install snapshot.
The debugger was closed and AeroTizen was left visible in normal operation, with
Prime Video, ITVX and Channel 4 enabled for the user's cold-boot test.

Local validation: 139 unit tests, 9 browser tests, ESLint, TypeScript, compiled
build and shipped-script syntax checks passed. Browser plugin was unavailable;
the repository's Playwright workflow was used. Private viewing data, network
bodies and settings backups are excluded from Git.

## Still to verify

- That each provider opens the selected programme/episode on screen. Local tests
  check the envelope and payload; dispatch alone is not programme-launch proof.
- Accuracy of YouTube's shared list, other TV models and older Tizen versions.
- Provider timestamp precision and whether old ITVX episodes match its current UI.

Stremio's local helper and BBC iPlayer integration are outside this MVP.

## Follow-up: artwork and provider accuracy

The user confirmed ITVX's current in-app row contains only The Only Way Is Essex
S38 E12, and Channel 4 has in-app Continue Watching items. Repeat AeroTizen and
root GET reads returned the same 5 ITVX records and empty Channel 4 list. Root
access therefore did not resolve either shared-feed discrepancy. Subsequent package
inspection briefly started the provider apps without a playback request, then
returned to AeroTizen; native Home settings stayed unchanged.

ITVX's installed `cw-service.js` was acquired for static inspection. Its `get`
action only reads EBHelper; `onStart` does not refresh provider data. It has no
current-list reconciliation. No guessed service request, deletion or age filter
was introduced. REA evidence: `ev_81623973ae862e20bc6c38b23111dba022f1901448d37cef3aa7a98ef4154277`.
The earlier registration snapshot also lacks a Channel 4 background-service row;
that historical fact does not prove its foreground app never publishes.

Measured content artwork: ITVX 400×225; Prime Video 444×250. Both are 16:9.
The previous 414×310 image box used `cover`, causing a crop. Artwork now has a
414×233 frame with `contain`; programme labels sit below it. Source names are
replaced by the TV app artwork. Settings reuses the existing app tile component
at 176×176, with selection check marks and no record counts.

ITVX's incorrect list and Channel 4's empty feed remain unresolved data-source
issues. Do not describe them as matching the provider app. A later optional
Channel 4 publisher-code check could not complete when external SDB connection
failed; the earlier successful normal/root feed comparison remains valid.

The final visual check confirmed all four selected app icons loaded from the TV,
at 176×176. The user's existing YouTube selection was preserved; three YouTube
cards also rendered. This does not establish a match to YouTube's in-app row.
All ten rendered image frames measured 414×233 with `contain`; source-name labels
and Settings record counts were absent. Original preferences, native Home values
and the watcher receipt matched the pre-update snapshot. The debugger was closed
and a fresh API check reported AeroTizen running and visible.


## Samsung-only cold boot: 26 October 2026

**Passed on the clean production build.** After a full power-off and 60-second
power disconnection, the user confirmed both YouTube and Prime Video populated
automatically within the five-minute observation window. Settings and provider
apps stayed closed; no TV calls, debugger, root session or Stremio helper were
used during startup. Records are not cached across launcher restarts. This is one
confirmed clean cold-boot pass on the tested 2024 Frame / Tizen 9.0.

Earlier failures exposed a clock bug. The TV clock began near the Unix epoch and
changed to the current date before app discovery completed. This expired the
Date.now()-based retry window, so initial network errors received no startup
retries. A passive capture retained those original results even after a later
foreground refresh returned both feeds. The retry deadline now uses elapsed
performance.now() time. Local regressions cover forward/backward clock corrections
and the fixed five-minute limit. Feed URLs also have distinct cache keys, tested
with real browser caching enabled. Cache isolation alone did not fix cold boot.

Validation passed: 146 JavaScript tests, nine focused browser tests, ESLint,
TypeScript, production build and shipped-script syntax checks. The compiled
reader matches its source. Temporary passive diagnostics are absent
from this clean package and from the feature sources.

The update used an in-place installation. Saved preferences, native Home/boot
settings and watcher control were preserved; Stremio remains a separate follow-up.
ITVX's stale shared records and Channel 4's empty shared feed remain unresolved
provider-data limits. Correct selected-programme/episode launch still needs
physical confirmation for each provider.

## Review fixes: 27 October 2026

A shorter feed now clamps the carousel offset immediately, including while focus
is on the app grid or in Settings. Source records remain bounded in memory and
are revalidated when the TV clock changes. The existing header clock tick detects
the correction; there is no extra timer or feed request. Ordinary ticks preserve
card nodes, and genuinely future timestamps still sort as unknown.

Both review regressions failed before the fixes and now pass. Local validation
passed 149 JavaScript tests, all 20 browser tests, ESLint, TypeScript and production
build checks. Browser tests include list shrinkage in both focus states and clock
correction after both feeds have settled. The earlier cold-boot pass above used
the previous build; these review fixes have not been installed on the TV. Stremio
remains outside this change.


## PR build: TV rendering check, 27 October 2026

The Samsung-only PR build was installed in place on the same 2024 Frame / Tizen 9.
The installed Continue Watching, carousel, Home navigation and clock scripts
matched the compiled package byte for byte. Two YouTube cards and one Prime Video
card rendered with their programme images and app icons. The Home screenshot is
saved as `screenshots/continue-watching-tv.png`.

Saved launcher preferences, native Home settings, the persisted watcher control
and installed-app inventory were preserved. Stremio modules and its Settings
option were absent. The debugger was closed and AeroTizen was left running and
visible in normal operation. No root or provider app launch was used.

This was a warm-start rendering check. A new cold boot, physical clock-correction
and list-shrinkage regression tests, and selected-programme launch were not part
of this check. Channel 4 was still retrying its empty shared feed; ITVX was not
selected.
