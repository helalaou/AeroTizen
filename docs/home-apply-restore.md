# Native Home apply, restore and watcher handoff

The [PC-managed flow](home-pc-flow.md) covers the current backup location,
portable backup folders and retry after an interrupted boot restore.

Apply and restore passed on the recorded Frame on 2026-10-24 with SDK UID 901,
without root. The user confirmed Home from YouTube returns to AeroTizen and
Settings → Samsung Home opens the stock Home screen. Native mode survived an
in-place package update and service restart. Exact original Home and startup
values were restored after the tests. See the
[device evidence](home-apply-restore-tv-20261024.json).
Physical results above cover `QE65LS03DAUXXU`, Tizen 9, build
`T-PTMDDEUC-0090-REL-202605141701`. Other models and firmware can now test after
[compatibility checks](home-pc-flow.md#compatibility-and-testing-on-another-tv).
The writer requires a 32-bit ARM Tizen runtime, SDK UID 901, available native APIs
and complete typed settings; it never acquires root or falls back to root.
Other models and firmware remain physically unverified. [Native boot and Art Mode](home-native-boot.md)
passed a separate device test, with a slow startup and a two-press Art exit.
The TV's Art and app-control APIs already timed out before this update.

## Recorded device results

| Check | Result |
| --- | --- |
| Signed launcher update | In-place install passed; 27 installed source files matched the signed build. |
| Saved settings | All five Home favourites and the saved settings matched after the first update. A second settings read after the restart was unavailable because the inspector timed out. |
| Native apply | Both Home entries changed to `DclHome001.Home`; startup values and autostart zero stayed unchanged. |
| Watcher handoff | No additional polls, Art queries or launch calls over 73.1 seconds; ordinary `/home` did not reenable it. |
| Service persistence | The same signed package was installed again in place. The new service retained the transaction and native mode, with all activity counters zero. This was not a TV reboot test. |
| Home button | User opened YouTube and pressed Home once; AeroTizen appeared. |
| Samsung escape | User selected Settings → Samsung Home; Samsung Home appeared. |
| Restore | Original Home/startup snapshot matched exactly; watcher mode returned and seven polls ran in a two-second resume check. |

The updated launcher remains installed. Samsung Home was left open with its normal
escape pause enabled. Opening AeroTizen clears that pause. The original Home backup
was not replaced; its checksum stayed unchanged. Signed launcher recovery files,
settings and transaction receipts were saved privately beside that backup.
A later [native boot run](home-native-boot.md) left native Home and boot enabled
at the user's request; see that guide for the latest device state.

## Offline previews

These commands make no TV connection and stage no files:

```sh
aerotizen home apply
aerotizen home restore
```

Use `--json` for structured output. `--backup PATH` adds the validated original
values to a preview. Without a path, execution uses the connected TV's immutable
`backups/<identity hash>/original-home.json`. A missing or invalid baseline blocks
all writes; neither command creates or replaces the original.

## Execution, when device testing is authorised

Apply needs an updated, signed launcher with the new service installed and started.
Restore detects whether it remains installed. Installation, launching and the
commands below are separate device operations. Do not run them while playback
must remain untouched.

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home apply --yes
aerotizen --tv TV_IP home restore --yes
```

`--yes` is required for execution. Before the writer runs, the CLI verifies device
identity, model, architecture, OS and exact firmware against the backup. It stores
a private transaction receipt with the original backup bytes and checksum. The
native helper checks UID 901, a 32-bit ARM Tizen runtime, required native library
exports, firmware matching the saved original, the backup checksum/schema, and
complete live Home values. It resolves setter symbols without invoking them before
watcher handoff or native writes. Missing APIs or incompatible settings stop the change.
Apply also checks that the installed AeroTizen app is eligible for native Home.

The writer is a separate assembly from the getter-only query. A normal status or
backup command cannot call its setters. Each payload and staged request has a
SHA-256 check, bounded transport and confirmed temporary-file cleanup. A transport
failure retains the pending receipt and reports uncertain cleanup; it is not
treated as a failed apply with permission to retry blindly. The native control
lock file remains in the SDK temporary directory so concurrent runs share an inode.

## Order and failure behavior

Apply first requires the complete original Home/startup snapshot and a compatible
service in watcher mode. The service atomically saves `hold` in its private file,
flushes the file and parent directory, verifies readback, and cancels every pending
relaunch. Hold and native modes start no polling, Art client or boot-launch timer.
They survive service restarts. Ordinary `/home` and `/watch` messages cannot enable
watching in either mode. Corrupt or unreadable saved state blocks relaunches.

Only after that hold is confirmed does the writer assign `operation/main` and
`home_appid` to `DclHome001.Home`. It preserves every saved startup value and
autostart, including zero, and corrects any derived startup side effects. Each
setter has readback, followed by a full snapshot check. The service then commits
native mode. This phase does not configure native boot.

Apply failures attempt exact restoration before returning to watcher mode. If a
native restore fails, the hold remains for review and recovery. A lost commit
reply leaves confirmation uncertain; inspect status before retrying. Restore accepts saved
values or AeroTizen values left by a partial transaction, but rejects unrelated
app assignments, changed autostart, another baseline, or another firmware. Restore
does not require an eligible target app. It puts the original snapshot back and
checks it before reenabling the existing watcher fallback. A repeated restore is
a no-op once both values and watcher mode are already original.

The loopback mutation endpoint requires POST, JSON, a native-control header, no
browser origin, and matching mode/transaction/baseline values. It is not exposed
by the launcher UI. Existing watcher behavior remains the default on installations
that have no saved native mode. A service without durable storage refuses apply.
If AeroTizen is installed but its service is unavailable or blocked, writes stop;
resolve that service state before retrying restore. If the native application
registry confirms both launcher and service were uninstalled, restore instead
uses the PC backup directly, with a matching PC boot apply receipt required for
changed autostart. The writer rechecks absence before each setter and refuses
unrelated native changes. It does not bypass the watcher because of a timeout.
A successful local build is not recovery proof on a TV; physical recovery after
uninstall remains untested.

## Launcher escape and later device checks

The manifest declares the main app-control operation with reload disabled.
Settings → Samsung Home waits for the watcher's leave acknowledgement and then
explicitly launches `com.samsung.tv.csfs`. It does not exit a native Home app and
rely on the system to select another Home. Native mode remains enabled; the next
physical Home press can return to AeroTizen.

After playback ends and device tests are authorised, verify the updated service's
persistence and protocol first. A no-op restore can validate the transport and
baseline, but does not prove setters or rollback. Then test apply → physical Home
from another app → Samsung escape → restore. Restore returns the old watcher-based
setup; use Samsung escape to keep the stock screen open. Check Back, app switching
and Art Mode separately. Native power-on behavior is a later phase. Do not uninstall
the assigned Home app during this installed-app test. Preserve the original backup
and receipts; the same restore command also supports recovery after uninstall.

## Local validation

Python tests use mocks or localhost fake TVs. A host .NET harness exercises the
same transaction policy with fake native calls, including each failed write,
readback failure, side effects, partial restore, stale baseline and lost commit
response. Node tests cover persistent hold/native modes, restarts, late callbacks,
boot suppression, storage failures, control request guards and Samsung escape.
None of those checks establishes device setter permission or physical behavior.

The native signatures follow the public [ARN0 control source](https://github.com/NelsonEU/arn0-tv/blob/main/native/Control.cs)
and [CleanFrame experiment](https://github.com/nthnclrk/CleanFrame/blob/main/scripts/native-home/README.md).
The manifest behavior follows [Samsung's application-control example](https://developer.samsung.com/smarttv/develop/guides/smart-hub-preview/implementing-personal-preview.html).
Private storage uses the [TV filesystem API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/filesystem-api.html)
to resolve `wgt-private`; no device path is guessed.
