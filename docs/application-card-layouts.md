# Home application card layouts

PR #34 is updated for Preact Settings and current upstream artwork services.
Square remains the default. Rectangle and 3/4/5 apps per row are optional; Follow
card size retains upstream Big/Small column behavior. The original preference
keys `homeCardMode` and `homeCardColumns` are retained.

Samsung-provided artwork is requested at its existing source resolution in both
modes and contained in the card without replacing it with a low-resolution logo.
Existing upstream brand/icon fallbacks remain available on lookup failure.
The custom brand PNGs from the earlier proposal are removed from the current diff,
as requested in helalaou's review: redistribution rights were not established.
They remain preserved in reference/history; no new rights or license claim is made.
A separate custom-image import feature is not introduced here.

The compiled browser test checks all six mode/column combinations, vertical remote
navigation and reload persistence, recording screenshots. Existing artwork tests
cover native candidate selection and failure recovery. Physical TV artwork quality,
focus animation smoothness and performance remain pending on the S90C and older TVs.

Home layout options apply only to the Home/All apps grid. Settings app pickers
remain standard square icons, with stable DOM/artwork nodes when card mode or
column count changes. Focus uses the shared theme accent rather than a fixed
white border. Artwork sources and their original resolution are unchanged.

Big/Small controls are available only in Follow card size. Choosing an explicit
3/4/5-column count hides those controls without discarding the saved size; returning
to Follow card size restores the preference. Home and Settings icon scopes remain
independent. Physical acceptance of this follow-up is pending.
