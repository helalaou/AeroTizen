# Read native Home state and save a baseline

These commands inspect the TV's current native Home assignment and preserve the
original values on the computer. They do not change Home, startup, Art Mode or
watcher settings. [Apply and restore](home-apply-restore.md) use a separate writer.

## Requirements

- Working Developer Mode and an SDB connection from the current allowed host IP.
- The read-only query payload, included in standalone CLI builds. Source users
  build it with `python tools/build_home_query.py` and the .NET 6 SDK.

The default transport runs as SDK UID 901 through the direct Python SDB session.
It stages the helper in the standard SDK temporary folder and uses the published
package-name command workaround. It does not acquire root. The helper targets
.NET Core 3.1 with major-version roll-forward. Other TV runtimes, firmware and
host platforms require their own hardware checks.

Before starting the SDK helper, the CLI checks that `/usr/bin/dotnet` is executable
on the TV. If it is missing or not executable, Native Home stops with a compatibility
error and removes its staged files. Installing .NET on the computer does not fix a
missing TV command. Use the default watcher setup on these TVs. This check does not
add Native Home support for Tizen 5.5; other runtime entry points remain unverified.

## Commands

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home backup
```

Add `--json` for machine-readable output. Optional `--root` explicitly selects the
previous temporary-root transport; it also requires verified `samsung-tv-root`
v0.0.12, its payloads, Samsung SDB and OpenSSL. Use `--root-tool PATH` and `--sdb
PATH`, or put the executables on `PATH`; `SDB` can select Samsung's executable.
There is no automatic escalation. Every read checks completion and cleanup before
saving a baseline. Even SDK-only reads write temporary helper files to the TV.

Status reports the default owner of `operation/main`, the four string settings
`home_appid`, `startup_appid`, `booting_appid_backup` and `first_screen/type`, and
the integer `db/menu/smart_hub/ontvsetting/auto_start`. Watcher status is a GET of
its loopback endpoint: `active` means the service responds and is not in its
explicit paused state. New services also report native, handoff or blocked mode,
plus their control protocol. An unreachable or malformed endpoint is `unknown`.

The helper imports only native getters and memory-management functions. It has
no settings setter or application-control setter. A missing native getter or
unreadable value is reported as unavailable; a stock default is never invented.
An incomplete query cannot become a backup.

## Backup behavior

By default, the baseline is saved under AeroTizen's local configuration folder:

```text
backups/<SHA-256-of-SDB-device-identity>/original-home.json
```

Use `--output PATH` to select a different new file. A baseline records typed
values, native main-operation ownership, device identity hash, model, firmware,
capture time, helper hash, and read/cleanup evidence. It contains no account
credentials or viewing history.

The first file is written through a flushed temporary file and an atomic
create-if-absent link. Missing parent folders are created automatically, including
for a custom `--output` path. Its file mode is 0600 on POSIX. Repeated backups preserve
the first file's bytes and report whether its configuration and firmware still
match. Existing corrupt files or files for another TV are refused, not replaced.
AeroTizen assignments cannot be captured as a new original baseline.

Capture the first backup before opening AeroTizen. On the Q80B reported in
[issue #76](https://github.com/helalaou/AeroTizen/issues/76), opening the launcher
changes only `db/appfw/booting_appid_backup` to `DclHome001.Home`. If you already
saved the original, keep that file; `matches current=False` is expected for this
change, and apply accepts this specific difference. Without an original backup,
return the TV to its stock state, confirm with `home status` that none of the
saved values names AeroTizen, then capture the backup before opening it again.
The CLI does not guess the previous value or replace an existing original.

Validation runs before folder creation. If the first backup is refused because
AeroTizen is already in the values, no backup directory is created. That explains
an absent folder after that refusal, but does not explain the first `WinError 3`
reported in issue #76.

This is a local failsafe copy. No baseline is written onto the TV in this slice,
and successful backup does not establish that restore or native Home routing works.

### Windows path errors

CLI 2.4.0 already creates missing backup directories before writing the file.
Its release commit `1715a3b` also passed the
[Windows Home test job](https://github.com/helalaou/AeroTizen/actions/runs/40574188485/job/122436086717),
which includes creating a first backup with no existing per-TV directory. This
does not reproduce the reporter's Windows environment or test the frozen EXE's
backup command; release EXE smoke checks cover help and offline previews.

A Windows "path not found" error alone does not identify directory creation as
the failed step. The backup is first written to a temporary file in that folder,
then published with an atomic hard link so an existing original cannot be
replaced. Microsoft's [CreateHardLinkW documentation](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-createhardlinkw)
also lists `ERROR_PATH_NOT_FOUND` for paths beyond the Windows path limit. This
is a possible cause, not a confirmed explanation for issue #76.

Errors now distinguish directory creation, temporary-file creation and the final
hard link. A hard-link error also reports the destination path length. Preserve
the full error, Windows version and whether the path is local or redirected when
reporting a failure. If needed, use `home backup --output PATH` with a short path
on a local NTFS drive. Keep that original and pass `--backup PATH` to apply and
restore. Do not delete or overwrite a valid original to test directory creation.

## Native query references

The [ARN0 native query](https://github.com/NelsonEU/arn0-tv/blob/main/native/Query.cs)
and [native control source](https://github.com/NelsonEU/arn0-tv/blob/main/native/Control.cs)
document the Tizen getters and logical setting names used as research references.
AeroTizen's helper is a separate getter-only implementation. The pinned upstream
root agent's argument handling doubles backslashes, so the helper script crosses
that boundary in a base64 envelope. Local shell tests verify checksums and cleanup
on both successful and failed helper execution.

## Hardware result: 24 October 2026

Verified on `QE65LS03DAUXXU`, ARMv7, Tizen 9.0.0, build
`T-PTMDDEUC-0090-REL-202605141701`:

- `home status` read all native values successfully.
- `operation/main` and `home_appid` both named `com.samsung.tv.csfs`.
- `startup_appid` and `booting_appid_backup` both named `org.tizen.tv-viewer`.
- `first_screen/type` named Samsung Home; autostart was integer `0`.
- `home backup` created the local baseline. Repeating it preserved the first
  file and checksum, with file mode 0600.
- A built macOS ARM64 standalone CLI read status using its bundled query helper.
  Its Home values and device identity matched the source CLI's initial read.
- The watcher remained active. Upstream and helper staging cleanup, normal SDB
  recovery, and unchanged upstream-selected system files were confirmed.
- 188 Python tests, Ruff lint/format, workflow Actionlint, and standalone smoke
  checks passed locally. Hosted CI and other platforms were not exercised here.

[Sanitized TV evidence](home-read-only-tv-20261024.json) records the typed values
and checks. Private reports and the baseline retain the device binding; the public
evidence excludes the network address, device identity hash and local backup path.
This result does not establish native Home takeover, boot routing or restore.

## SDK-only follow-up on the same TV

On 24 October 2026, the same getter-only helper read every Home value as Samsung's
SDK user, UID 901, without acquiring root. Home values, firmware and watcher state
matched the earlier root query; the original local backup remained unchanged.
The temporary helper and script files were removed.

The probe used the existing direct SDB connection and the published package-name
command workaround. The helper had to be staged in the standard SDK folder;
loading it from `/tmp` failed before the native query ran. No remote keys,
app launches, playback controls, Home writes or watcher pause were used. The
passive app-status API did not identify the visible app, so uninterrupted film
playback was not independently measured.

[SDK-only TV evidence](home-sdk-read-only-tv-20261024.json) records this result.
This proved native reads without root on this TV and firmware. The current CLI
now integrates that transport, with local automated checks. That CLI integration,
native assignment, restore and power-on behavior have not been retested on the
TV. The historical evidence files record the commands used at the time.
