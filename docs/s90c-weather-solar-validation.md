# S90C solar-cache regression: hardware test and rollback

Status: **procedure prepared; physical TV testing has not been performed**.
This follows [PR #35](https://github.com/helalaou/AeroTizen/pull/35) and
[helalaou's review](https://github.com/helalaou/AeroTizen/pull/35#pullrequestreview-5677661602).
The deterministic 23:00 scenario is covered by unit and compiled-browser tests.

## 1. Prepare on the PC, without contacting the TV

Use a new worktree under Documents. Do not overwrite the installed-build checkout,
the original signed package, certificate files, original Home backup or its
transactions folder. Do not use Downloads. Preserve reference/integration branches.

From an existing fork checkout in PowerShell:

```powershell
$solarRoot = Join-Path "$HOME\Documents" ("AeroTizen_Solar_Test_" + (Get-Date -Format "yyyyMMdd_HHmmss"))
git fetch https://github.com/motorgrid-ita/AeroTizen.git fix/weather-cache-solar-refresh
if ($LASTEXITCODE -ne 0) { throw "Fetch failed" }
git worktree add --detach $solarRoot FETCH_HEAD
if ($LASTEXITCODE -ne 0) { throw "Worktree creation failed" }
Set-Location $solarRoot
git rev-parse HEAD
npm.cmd ci --no-audit --no-fund
npm.cmd run lint
npm.cmd run build
npm.cmd test
```

Run each command only after the previous one succeeds. Compare HEAD with the fix
PR's exact reviewed commit before signing. The build includes TypeScript checks
and parses shipped scripts as ES2018, targeting Chromium 69. The compiled launcher
is `dist/launcher`; do not install the source `launcher` directory.

Before installation, locate and hash the known-good signed WGT currently used by
this TV. Keep it as a separate, read-only rollback copy. Record the current Home
mode and app/settings behavior through the already verified CLI. Keep the TV's
Developer Mode host IP unchanged. These read-only status checks still contact the
TV and should be run only when the tester starts hardware validation.

## 2. Sign and update in place

Use the **same author certificate** as the installed AeroTizen package. Do not
regenerate certificates or substitute the Apps2Samsung/TizenTube author identity.
For the existing S90C backup-based workflow, keep using temporary copies of the
verified author/distributor certificates and device profile, then verify both
signatures/digests and record the new package SHA-256 before sending it to the TV.
The immutable original backup must remain unchanged. Never upload certificates,
private keys or passwords to GitHub.

If (and only if) the CLI's configured certificate directory has already been
verified to contain that matching author certificate, its ordinary installer can
sign and install the compiled folder:

```powershell
# Use the existing, verified AeroTizen CLI environment and the actual TV address.
& $verifiedCliPython -m aerotizen --tv $tvIp install "$solarRoot\dist\launcher"
```

`$verifiedCliPython` and `$tvIp` are explicit tester-supplied values, not automatic
TV discovery. If the certificate configuration has not been verified, stop before
this command and use the existing backup-based signing workflow instead.

If using the already signed WGT workflow, transfer that exact hash-verified WGT
with `DeviceSession.install`, as in the earlier S90C integration test. The CLI's
`install PATH` signs again, so do not treat it as a raw pre-signed-package uploader.

Update **DclHome001.Home in place**; do not uninstall it or run `home apply`,
`home restore`, firmware updates or native preference writes for this wallpaper
test. If an installer requests uninstall/reset to continue, stop and investigate.
Confirm installation completion and relaunch AeroTizen using the verified CLI:

```powershell
& $verifiedCliPython -m aerotizen --tv $tvIp launch DclHome001.Home
```

## 3. Test matrix

1. **Normal weather:** with Dynamic weather wallpapers Off, confirm temperature,
   city, unit and the selected background still work. Old cache entries remain
   valid for the widget; missing solar fields alone do not cause a request.
2. **Legacy cache at night:** near 23:00 in the saved city's actual local time,
   start with a recent legacy cache lacking `day`/`solar` (or with `day: 1` and no
   solar). Enable Settings > Dynamic weather wallpapers > Automatic (weather).
   Expect the chosen background while the shared forecast is pending, then the
   night scene. A daytime image must not flash first. Do not change the TV clock.
3. **Valid solar cache:** enable/disable repeatedly with fresh current-day solar
   data. Expect no additional forecast just for enabling wallpapers.
4. **Offline/failed forecast:** with unusable solar fields, keep the chosen
   background while the existing temperature cache remains visible up to its
   normal age limit. Repeated toggles must not cause immediate retry loops.
   With valid current solar cache, the matching scene may remain while offline.
5. **Location change:** change to a different saved city while a forecast is
   pending. The old response must not replace the new city's scene or temperature.
   Restore the original city after testing.
6. **Day/sunset/night:** at the saved city's real times, verify normal weather
   scenes, clear/partly-cloudy sunset (45 minutes before to 20 minutes after),
   storm/snow preservation during daylight/sunset, and night priority afterward.
7. **Hidden header:** hide the header weather widget with wallpapers enabled.
   Wallpapers still update. Disable both consumers: automatic weather requests stop.
8. **Return to Off:** the previous background and animation speed are restored.
   Check navigation, HOME return, a native app and Live TV as smoke tests; those
   paths are not changed by this fix.

Do not manipulate cache fields on the TV just to manufacture a test until the
original cache/preferences have been captured locally and the tester explicitly
chooses that diagnostic step. A real legacy cache is not guaranteed to remain
available: successful forecast responses will update it. The browser regression
provides the reproducible 23:00 test when hardware cache injection is unnecessary.
A single S90C pass does not establish compatibility or performance on other TVs.

## 4. Diagnostics

In an already available launcher inspector, these are read-only console checks:

```javascript
({enabled: AeroTizen.settings.weatherPhoto,
  widget: AeroTizen.settings.showWeather,
  scene: document.getElementById('weather-photo').className,
  fallbackVisible: !document.getElementById('bg').hidden,
  phase: Weather.solarPhase(Weather.currentReading(), Date.now())})
```

Use the inspector Network panel to count automatic requests to Open-Meteo and, for
Automatic location, ipapi. Enable should start at most one matching request chain;
repeated toggles reuse it. Failed completed attempts wait for the existing cadence.
Aborting because both consumers are Off legitimately permits a new request on
re-enable. There is still one 20-minute weather timer; the pre-existing wallpaper
solar timer does not make forecast requests. Opening the inspector may restart the
app and affect timing; note that in the test report.

Record model, reported firmware/Tizen version, commit/package hash, time and saved
city timezone, cache age/solar presence, scene before/after and request counts.
Redact account details and precise coordinates before posting diagnostics publicly.

## 5. Rollback

First choose **Dynamic weather wallpapers > Off**. This is the immediate functional
rollback and retains the selected background, speed and normal weather widget.
If package rollback is needed, reinstall the separately preserved known-good WGT
with the same author certificate, using the verified raw signed-package workflow.
Do not overwrite the rollback package with the test build or re-sign it with a new
author. If the TV refuses an older version, stop: do not uninstall a launcher still
assigned to native HOME merely to bypass a downgrade restriction.

This fix does not migrate settings or the cache key. A refreshed cache remains
readable by the preceding implementation. After restoring the known-good package,
check settings, HOME and native app returns. Home/boot recovery, if independently
needed, remains the existing documented baseline-and-receipt process; it is not
part of this wallpaper validation and must not overwrite the original baseline.
