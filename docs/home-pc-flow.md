# PC-managed native Home

Apply needs the updated CLI and a compatible signed launcher. The PC owns the original
Home backup and transaction receipts. Apply and restore run from the CLI; the
launcher does not change these native settings from its UI. The TV then operates
without a running PC or watcher polling.

Native Home is experimental. The latest controlled Frame tests passed Home from
YouTube, Prime Video and Samsung Home with the original Art return target.
Samsung Home checks waited 10 seconds after opening the page.
The earlier Art return override was removed after it reproduced Samsung's loading
spinner. New applies preserve the original Art target. The same restore command
still accepts backups and recovery records from that version. See the
[profile comparison](home-profile-isolation-tv-20261026.json).

## Compatibility and testing on another TV

There is no model or firmware allowlist. Apply and restore require a successful SDK UID 901
query, a 32-bit ARM Tizen runtime, complete typed Home/startup values and the required native
libraries/functions. The writer resolves getter and setter symbols before watcher handoff
or native writes, without calling setters as a probe. Apply also needs an eligible installed
launcher and its persistent control service. Restore does not need the apply-only eligibility
function, including after uninstall.

The backup must still match the connected TV, model, firmware, OS version and architecture.
Checksums, original-state checks, durable PC receipts, per-write readback and rollback remain
in force. A compatible API does not prove write permission or physical Home/boot behaviour.
A setter failure attempts rollback; preserve the backup and inspect status after any failure.
Physical results cover the Tizen 9 Frame and a contributor's Tizen 9 S90C. The
[S90C report](home-s90c-tv-20261027.json) confirms Home-only, boot, YouTube/Prime returns
and installed-app restore. It does not cover absent-app restore or PR37 integration.

For PR testing, use the CLI and signed launcher from the same checkout. Install the CLI with
`python -m pip install -e .`, then build both helpers with `python tools/build_home_query.py`
and `python tools/build_home_control.py` (requires the .NET 6 SDK). Install the signed launcher
from the same checkout; a released CLI or launcher may lack the new control protocol.

Start with `home apply --yes`, restart fully, test Home from video apps and Samsung menus,
then restore and confirm Samsung Home works again. Test `--boot` separately after restore.
Report the CLI commit, model, firmware and observed results, with private device IDs and paths
removed. Passing local tests or preflight does not establish support for another TV. Restore
after uninstall is still awaiting a controlled physical test; restore before normal uninstall.

## Setup

After installing and opening the compatible launcher:

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home backup
aerotizen home apply                                     # offline preview
aerotizen --tv TV_IP home apply --yes
```

The original is saved once in the PC's
`~/.config/aerotizen/backups/<TV identity>/original-home.json`.
Before the native writer runs, its request and baseline bytes are durably saved
under the adjacent `transactions/` directory. Apply needs no TV backup endpoint.
`--boot` enables automatic startup. For Home only, use apply without that flag.
Restore an existing native assignment before applying different options.
After apply or restore, disconnect TV/One Connect power for 60 seconds, then restart.
The latest Home-plus-boot test showed a black screen for about 30 seconds before
AeroTizen opened automatically. Startup performance remains an open issue; browser
render marks do not measure the panel's power-to-screen delay. See the
[startup investigation](home-startup-art-return.md#foreground-investigation-on-25-october).

Art Mode keeps Samsung's original return target, sleep and sensor settings.
One Home press from Art opens Samsung's Art page; a second opens AeroTizen.
Night Mode was left on. The latest short return test does not repeat the earlier
[two-minute Night Mode comparison](home-pc-roundtrip-tv-20261025.json).

Running `home backup` after apply keeps the validated original file unchanged.
It reports that the current native settings differ from the original; it does
not capture the AeroTizen assignment as a new original. A missing original still
blocks apply and restore. No Samsung defaults are guessed.

## Restore and transfer to another PC

The same command restores with or without AeroTizen installed:

```sh
aerotizen home restore                                  # offline preview
aerotizen --tv TV_IP home restore --yes
```

The CLI checks the TV's native application registry, including both launcher and
service registrations. If installed, restore uses the persistent watcher handoff.
If both are absent, the SDK helper restores directly without contacting the
removed service. It needs no root or launcher reinstall. A service timeout is
not proof of uninstall: unknown installation state or an installed app with an
unavailable control service stops restore before writes.

Both paths keep the device, firmware, original checksum and current-value checks.
If uninstall removed the active service transaction, changed autostart requires
a matching boot apply request from the PC's saved receipts. No defaults are guessed.
The native writer rechecks installation before each setter during this recovery.
Local tests cover absent-app restore, partial failures, retries, copied folders
and a concurrent reinstall. Physical recovery after uninstall is not yet TV-tested.

For another authorised PC, copy the complete folder containing `original-home.json`
and `transactions/`. Install the updated CLI and allow that PC's IP in the TV's
Developer Mode settings, then use the copied baseline:

```sh
aerotizen home restore --backup /path/to/copied-folder/original-home.json
aerotizen --tv TV_IP home restore --backup /path/to/copied-folder/original-home.json --yes
```

Receipts are read and written beside the selected baseline, including on the new
PC. That folder must be writable. The original device and firmware checks remain
in force. Restore re-enables the watcher if AeroTizen remains installed; no watcher
is needed after uninstall. Restart the TV fully so Art reloads its original target.
Keep the PC backup after uninstall; it is independent of app storage on the TV.

If a restore fails or its reply is lost, inspect `home status` before retrying.
When the service is left on hold, the CLI validates its saved restore requests
back to the original boot apply. Each request must contain the same baseline
bytes and checksum. Missing, invalid, cyclic or excessively long chains refuse
boot recovery before the native writer runs. Preserve all receipts when copying
or backing up this folder.

The small persistent handoff state on the TV is still needed to keep the watcher
disabled across restarts. It is separate from the PC's recovery backup. There is
no app-private backup upload or download command in this flow.


## Service query diagnostics

`home status` reports a service error in both text and JSON output. JSON stores it under
`watcher.error`, with a `code` and `message`, plus `http_status` or `socket_error` when known.
Codes distinguish `timeout`, `connection_error`, `http_error`, `invalid_response` and
`query_error`. The query remains read-only, uses one bounded 1500 ms request, and does not
start the service, retry a write or change Home settings.

`watcher.reachable: false` means a service response was not confirmed. It does not establish
that AeroTizen was removed. A service returning an HTTP error or malformed response is
reported as reachable with an error. Installation is still checked separately, and native
changes still require the compatible control protocol. Do not bypass these guards.

The S90C contributor found the service unreachable at about 107 seconds of uptime and
reachable in persistent native mode with the matching transaction at about 197 seconds.
The cause is unresolved. These diagnostics help a future capture distinguish failure types;
they do not claim to fix that observation or measure startup time. Live TV remains for PR37.
