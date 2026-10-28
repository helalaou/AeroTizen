# Startup and Frame Art return

**The Art return override was removed on 26 October.** The controlled
[profile comparison](home-profile-isolation-tv-20261026.json) reproduced the Home
spinner with this override and restored Home by removing it. Home plus boot passed
with Samsung's original Art target; startup still took about 30 seconds and Art
return required two Home presses. Earlier experiments below describe removed code.

Home writes now use [compatibility checks](home-pc-flow.md#compatibility-and-testing-on-another-tv)
instead of a model/firmware allowlist. The physical results here cover the recorded
QE65LS03DAUXXU firmware. Writes use SDK UID 901 and the immutable original backup;
root and watcher polling remain disabled.

```sh
aerotizen home apply --boot                       # offline preview
aerotizen --tv TV_IP home apply --boot --yes
aerotizen --tv TV_IP home restore --yes
```

Apply still requires the original baseline. Restore an existing assignment before
using apply again; do not replace the original backup with the applied state.
The removed `--art-return` option set `db/first_screen/type` to `DclHome001.Home`.
Current apply commands preserve the original first-screen value. Restore still
recovers that value from older Art-enabled setups, as well as Home and startup
settings; the PC backup and recovery records remain valid.

The Art process caches its first-screen target. A full restart is required before
checking the new return route, and after restoring it. A native write/readback
alone does not establish physical Home-button behavior.

## Evidence for the return target

Read-only inspection of the installed Art assemblies on 24 October 2026 found:

- `ArtApp.dll`, SHA-256 `1b16a95a17c9d248858e1e905e219e2f9acfdf641a9381104f7d0c632612b83e`:
  `MainControlUtil.Exit` (`0x060003fb`) obtains `ApplicationID.CSFSApp`, then asks
  the window controller to launch it with the Art or Media category. This explains
  the user's report that Home from Art opens Samsung Home's Art section.
- `ArtDataManagement.dll`, SHA-256 `2d231751b880b9fd10bb8d2bf961c2673ed0c6ebd6de382e268183c1250aaf89`:
  `ApplicationID.get_CSFSApp` (`0x060017f8`) reads string configuration key 46
  once, then caches the returned ID. REA evidence:
  `ev_12f26f5221bb9007563c8d70127bc63fd2fc7eaadbb96635afcf68d95039d87d`.
- `Tizen.TV.Service.CoBA.Common.dll`, SHA-256
  `f71a4c883ad9a02bd68d08ad7e3de685184c8a758a06b5e163b7dc8dfbf6a887`:
  a local ECMA-335 metadata/IL read confirms `StrKey.FirstScreenType = 46` and
  `<InitializeStrKey>b__0` (`0x06000572`, IL 1124) maps that key to
  `db/first_screen/type`. This last observation used ordinary .NET metadata tools.

These are file-backed static observations. They do not establish all branches of
Samsung's return policy or compatibility with another TV or firmware. The native
REA decompiler providers were unavailable; managed metadata inspection was used.
No system binary or security policy was patched.

## Launcher startup

Home now renders from saved favourites and cached app labels before package
discovery starts. A failed, thrown or missing package callback does not delete
favourites or block navigation. Discovery refreshes tiles after success and defers
a refresh while a tile is being moved. First-run defaults are saved only after
successful discovery.

App discovery and icon/artwork requests start after the page load event, so
optional TV files and package APIs cannot delay initial document loading.

The manifest disables Samsung's launch-time network check because the launcher
can display local content without the network. Weather remains asynchronous. The
manifest's minimum version is 2.4, which supports `reload="disable"`.

References: [Samsung manifest metadata](https://developer.samsung.com/smarttv/develop/guides/fundamentals/configuring-tv-applications.html)
and [Tizen app-control reload behavior](https://docs.stg.tizen.org/application/web/guides/app-management/app-controls/).

`AeroStartup.trace` records script start, settings, Home render, frame readiness
and app discovery. A bounded copy is sent to the local control service's
`startup` status field when that service is ready. The trace is also stored in
`aerotizen.startup.v1` in localStorage. A cold boot can start the UI before the
control server is ready, so a missing service copy is not evidence of a missing UI.
The TV wall clock was not initialized at first-script time on the tested cold
boot; use monotonic mark intervals, not absolute wall-clock values, for UI timing. These diagnostics cannot launch an app or enable watcher
activity. A frame-ready mark measures browser scheduling, not physical panel
illumination. Navigation timestamps and kernel boot evidence are separate.

## Device checks so far

The signed update was installed in place. All 31 installed source files matched
the signed package, and the saved user settings matched the fresh backup. On a
warm inspector launch, Home rendered 340 ms after the first script; frame-ready
was 357 ms and app discovery finished at 1308 ms. These are not cold-boot times.
The Art return setting passed exact readback with native Home and boot retained.
The control service still recorded zero watcher heartbeats, Art queries or app
launches.

The first cold test changed the kernel boot ID and opened AeroTizen without a
Home press or host launch. The user measured about 32 seconds from Power to a
usable screen. The user then confirmed Art stayed visible for 60 seconds and
one Home press opened AeroTizen. All native settings and native control mode
survived the restart; watcher heartbeats, Art queries and launch calls stayed zero.

A read-only temporary-root copy of the app's protected LevelDB log recovered the
cold trace: Home-rendered 1635 ms, frame-ready 1684 ms, apps-requested 1747 ms,
apps-loaded 16386 ms after first script. Complete framed WriteBatch puts were
decoded offline; CRC32C was not validated. No protected database was edited.
Upstream root reported UID 0, staging cleaned and unchanged selected system
files. Root was used only to retrieve diagnostics.

The second build also defers optional images and package discovery until page
load. A warm inspector check showed page-loaded at 579 ms, frame-ready at 583 ms,
app request at 1189 ms and return from that call at 1191 ms. All 31 installed source
files and saved user settings were verified again. Its physical cold test changed the kernel boot ID. The user saw Art immediately,
then AeroTizen automatically after about 10 seconds. After that boot, the user
confirmed that Art stayed visible for 60 seconds and one Home press opened
AeroTizen. The watcher still reported zero polls, Art queries and launch calls.
The second cold trace showed Home-rendered at 3621 ms, page-loaded at 3837 ms,
apps-requested at 4240 ms, immediate return from that call at 4242 ms, and
apps-loaded at 5445 ms after first script. The temporary-root timing preflight
refused one capture attempt; a later attempt passed the same unmodified checks.
These two user estimates started from different visible screens; they are not a
controlled benchmark. Art-only startup with no Power press after reconnect was
not tested. See [device evidence](home-startup-art-return-tv-20261024.json).

### Combined upstream build on 25 October

The branch was rebased onto upstream `029b2a9`, including Preact Settings and
the tile menu. The 2.3.0 signed package passed verification of all 33 installed
runtime files, and saved settings were unchanged. A copied PC backup restored
every saved native value exactly; the watcher resumed and the user confirmed
that Home opened Samsung Home. Fresh native Home, boot and Art-return apply
passed readback. Home from YouTube did not work before a full restart. After
the restart, YouTube stayed open and one physical Home press opened AeroTizen.

The cold boot changed the kernel boot ID and opened AeroTizen automatically.
The user estimated about 45 seconds from Power to AeroTizen. Native settings
and native control mode persisted, with zero watcher polls, Art queries and
launches. A read-only temporary-root copy of the saved LevelDB trace showed
Home-rendered at 1281 ms, frame-ready at 1296 ms, apps-requested at 1529 ms and
apps-loaded at 20984 ms after the first script. All 53 complete log records
passed CRC32C validation before the WriteBatch data was decoded. Staging was
cleaned and the selected system-file checks were unchanged.

The internal render mark does not measure physical panel readiness or explain
the full reported 45-second delay. Startup remains an open performance issue;
these user estimates are not a controlled before/after benchmark.

The Samsung Home escape opened Samsung Home from the new Settings UI. Home
inside Samsung's own menus did not return to AeroTizen; the user reopened it
manually. Two Art trials with Night Mode on ended with a black panel. At that
point the TV reported Art on, power standby, and AeroTizen hidden. With Night
Mode temporarily off, the artwork stayed for two minutes and one Home press
opened AeroTizen. No watcher polls, Art queries or launches were recorded after
the cold boot. The user restored Night Mode to on and left AeroTizen visible.
Final state and the full test sequence are recorded in
[the current round-trip evidence](home-pc-roundtrip-tv-20261025.json).

### Foreground investigation on 25 October

A further cold boot, with no routing changes, took about 30 seconds by user
estimate. Its saved trace showed Home-rendered at 1555 ms and app discovery at
17331 ms after first script. All 74 complete LevelDB log records passed CRC32C
validation. The early PC sampler failed; its temporary staging was checked and
no files remained. Its timing is not usable evidence.

The diagnostic build records window focus and bounded launch-routing flags;
other application payloads are excluded. From Samsung Home, one physical Home
press left AeroTizen hidden and unfocused. Its current requested app-control
nevertheless contained `entry_point=smarthub_key` and `SkipReload=Yes`. No new
JavaScript app-control, focus or visibility event was recorded. An ordinary
`tizen.application.launch` then opened AeroTizen, with focus, immediately.
The native request therefore reaches the selected app; foreground resume remains
an open issue. The absence of a JavaScript event alone does not prove a missing
native request. A separate Home relay is a possible follow-up, not a tested Frame
fix. No Home, boot or Art setting was changed in this investigation.

With focus diagnostics installed, a further cold boot took about 33 seconds.
Home rendered at 1227 ms, gained focus at 1417 ms, and app discovery completed
at 20858 ms after first script. The launch carried `__K_BG_LAUNCH=enable` and
`entry_point=cold_booting`. Samsung's boot manager exited at 8.9 seconds of kernel
uptime. This run does not support a 30-second boot-manager wait or a late window
focus as the explanation for the full visible delay.

A controlled trial deferred discovery when a saved Home and app cache existed.
It still took about 30 seconds to appear. The saved trace confirmed discovery
started at 32117 ms and finished at 34013 ms after first script; Home rendered
at 1377 ms and gained focus at 1545 ms. The 83 and 88 complete records in these
two captures passed CRC32C validation. The extra discovery delay was removed
and the diagnostic build reinstalled with all 33 runtime files and saved
settings verified. Startup remains unresolved; these user estimates and browser
marks do not identify the remaining firmware or display wait. Watcher activity
remained zero. No foreground relaunch, relay or system patch was added.

### Clean reinstall on 26 October

The PR #49 branch included upstream `e23b6c6` and was clean installed without
Continue Watching data. All 33 runtime files were verified before a full power restart.
The user confirmed automatic startup, but Home from both YouTube and Prime Video
stalled on Samsung's loading spinner. During the captured failure, AeroTizen was
running but hidden. Native settings, kernel boot and persistent control mode
were unchanged; watcher heartbeats and launch calls remained zero. No debugger
was opened after this restart, and no Samsung-menu escape had been requested.

One ordinary SDK launch brought AeroTizen forward; the user confirmed the screen.
A manifest-only trial removed `reload="disable"` from the main app-control source.
It did not fix the YouTube return and was reverted to the exact original signed
PR package. A bounded native warning capture provided no matching launch logs.
Direct default-operation requests from SDK UID 901 brought the hidden launcher
forward both with and without `entry_point=smarthub_key` and `SkipReload=Yes`.
These selected flags did not reproduce the failure by themselves; this does not
recreate Samsung's caller context or establish its internal failure. The user
then repeated physical Home from YouTube and again saw the persistent spinner.
A normal launch recovered the UI; the TV API finally reported AeroTizen visible.
The cause remains unresolved, and a full restart is not a reliable fix. This run
supplied no new startup time. See [device results](home-foreground-retest-tv-20261026.json).

## Recovery when Samsung's HTTP API is unavailable

Native Home can be usable before port 8001 starts. Home commands now connect over
SDK first. If the HTTP metadata read fails, they may use model/platform metadata
from an existing validated original backup bound to the live SDK device identity.
The output labels that metadata source. Native values, identity, CPU and firmware
are still queried live; writes still require the recorded model/firmware and
original transaction checks. Another TV's backup, a missing/invalid baseline,
or an unrelated exit reason cannot enable this fallback. Initial backup capture
still needs live model metadata.
