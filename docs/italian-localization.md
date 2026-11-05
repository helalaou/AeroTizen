# Italian launcher translation

Italian uses the shared i18next catalogue system introduced in upstream PR #121.
`launcher/src/shared/i18n/en.json` remains authoritative: `it.json` translates all
228 keys with identical interpolation tokens. `catalogues.ts` registers `it` as
Italiano. No custom language detector, DOM text replacement, prefix slicing,
network translation service or timer is added. Existing preferences, app titles,
custom HDMI labels, port IDs and location names retain their values.

Settings → Language offers Italiano and Use TV language. The existing resolver
selects Italian for `it`/`it-IT`; an explicit choice is persisted by the shared
settings service. Unsupported languages use the existing fallback rules. English
and Russian registration is preserved. All catalogues ship offline in the compiled
launcher; Chromium 69 / ES2018 remains the production target.

## Automated validation

The existing catalogue test checks every registered language for exact key parity,
nonempty values and placeholder parity. Italian tests exercise shared resolution
and interpolation, automatic/manual selection, persistence and category navigation
in Classic and Glass. The production browser suite and packaging checks remain
unchanged quality gates. Browser checks do not certify physical remote behavior.

## Manual Samsung S90C acceptance

Use the normal documented in-place update flow with the existing signing identity
and a verified, reinstallable working WGT. Preserve private preferences and keep
the previous signed package for rollback. Do not uninstall or remap native HOME.

1. With the TV runtime language Italian, choose Settings → Language → Use TV
   language. Verify Home, All apps and all eight Settings categories are Italian.
2. Select English, then Italiano. Verify the change is immediate and D-pad focus
   remains visible. Return with Back; reopen Settings and restart the launcher to
   confirm the selected language persists.
3. In both Classic and Glass, navigate every pane with the remote. Check wrapping,
   clipping, selected controls, Home/All apps tabs and Continue Watching. Pay
   particular attention to the HDMI standby hint and weather-search explanations.
4. Search for Sassari; verify the location interpolates correctly. Check an HDMI
   custom name and installed app titles remain unchanged. Check clock/date formats,
   weather wallpapers and their saved selections.
5. Verify physical HOME, Live TV/channel switching and return from YouTube/Prime
   Video still behave as before. These are smoke checks, not changes in this PR.
6. Switch back to English or Use TV language to reverse the language choice. If an
   app rollback is necessary, reinstall the retained working signed WGT using the
   existing recovery procedure. A WGT rollback does not restore private preferences.

Physical testing of this new catalogue is pending; no TV has been contacted by
automated preparation or validation.
