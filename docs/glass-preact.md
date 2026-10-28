# Optional Preact Glass interface

PR #30 is rebuilt on the Preact Home core. Review/merge the core migration first;
this branch preserves the earlier contribution's history and includes that dependency.
The other feature PRs (#28 clocks, #29 HDMI, #34 cards) remain independently reviewable.
The integration branch records their combined conflict resolutions and includes #72.

Classic stays the default. Settings > Settings appearance > Glass enables the satin
header, Samsung Home shortcut, source dock and compact Settings category menu. The
preference persists. Categories are Home appearance, Applications, Backgrounds,
Weather and clock, and Inputs. Continue Watching remains available under Applications.
The actual Preact controls are composed into panes, with no DOM reparenting or cloned
handlers. Sidebar Up/Down selects, Right/OK expands, Back or Left at the content edge
returns to categories, and a second Back closes. The close button is also reachable
through content navigation. Text input and speed-adjustment retain their existing
priority and IME handling. Ref-measured scope navigation uses screen coordinates;
late inventory/preference updates retain the current control instead of resetting it.

A single content focus plate replaces per-control outlines; a header plate moves
between shortcuts/tabs. Selected states and connection metadata do not add focus rings.
Reduced-motion rules, bounded transitions and immediate remote transactions remain.
The dock reuses input switching/native Live TV commands and distinguishes connected,
selected, recognised standby and empty ports when the HDMI contribution is present.
Background category browsing changes no persisted setting and makes no weather request;
choosing an ordinary background exits photo mode through the shared weather service.
No new wallpaper client, native HOME policy, watcher or firmware modification is added.
Existing runtime translations remain available through the service adapter; untranslated
new labels fall back to English. This does not replace the independent locale PR #27.

Compiled-browser regression checks cover categories, Back/Left, focus bounds and one
outline, background browsing, persistence and Samsung Home escape. The original suite
still runs in Classic mode; additional integration checks exercise Glass with clock,
HDMI, cards and solar-cache fixes. Screenshots are generated at 1920x1080. Physical
S90C performance, animation/remote latency, standby devices and reboot acceptance remain
pending until the owner tests the exact signed integration build.

Parity review follow-up: dock badges distinguish RECOGNISED and PINNED evidence
from ON/ACTIVE signal state. Optional per-port pins retain reference reachability
without inventing a connection. Core hidden-session and stale-move fixes remain
part of the #73 dependency; clock-navigation fixes belong to #28.
