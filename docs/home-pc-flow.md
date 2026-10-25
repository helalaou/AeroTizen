# PC-managed native Home

Apply needs the updated CLI and a compatible signed launcher. The PC owns the original
Home backup and transaction receipts. Apply and restore run from the CLI; the
launcher does not change these native settings from its UI. The TV then operates
without a running PC or watcher polling.

Samsung Home remains available from AeroTizen Settings. On the recorded Frame,
pressing Home inside Samsung's own menus does not return to AeroTizen. Open
AeroTizen manually from Samsung's app list after using this escape.

## Setup

After installing and opening the compatible launcher:

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home backup
aerotizen home apply --boot --art-return                 # offline preview
aerotizen --tv TV_IP home apply --boot --art-return --yes
```

The original is saved once in the PC's
`~/.config/aerotizen/backups/<TV identity>/original-home.json`.
Before the native writer runs, its request and baseline bytes are durably saved
under the adjacent `transactions/` directory. Apply needs no TV backup endpoint.
Restart the TV fully after applying Art return, then test Home, boot and Art Mode.
Complete this restart before testing Home from other apps. On the recorded Frame,
Home from YouTube did nothing after an in-place update and restore/apply cycle;
one Home press returned to AeroTizen after a full power restart.
The latest cold tests took about 30–33 seconds to show AeroTizen, by user estimate
(45 seconds in an earlier test). Startup performance remains an open issue; early
browser render marks do not measure the panel's power-to-screen delay. See the
[startup investigation](home-startup-art-return.md#foreground-investigation-on-25-october).

Art Mode keeps Samsung's existing sleep and sensor settings. In the current
test, Night Mode was on and the panel entered standby while Art remained active
and AeroTizen was hidden. With Night Mode temporarily off, artwork stayed for
two minutes and one Home press opened AeroTizen. See the
[device results](home-pc-roundtrip-tv-20261025.json) for the full test sequence.
Night Mode was restored to its original on setting after this comparison.

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
