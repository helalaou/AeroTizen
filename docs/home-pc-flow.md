# Home button and startup

Both Home options run on the TV after setup and work without root.

| Option | What happens when you press Home |
| --- | --- |
| **Watcher (default)** | The background service detects a return to Samsung Home and reopens AeroTizen. |
| **Native Home (experimental)** | The TV routes Home directly to AeroTizen and the watcher stops. Startup support depends on the TV and firmware. |

## Watcher limits

- Return works from Samsung Home and Netflix on tested TVs. YouTube, Prime Video,
  Stremio, Spotify and HbbTV apps can leave the TV on Samsung Home because they
  do not report visibility. Use **Back** or open AeroTizen from the Samsung app row.
- The watcher pauses in Live TV and YouTube. On the tested Frame, Native Home
  returned from both.
- The watcher waits while Art Mode is active or if the TV does not report its Art
  Mode or power state. Watcher cold boot is unverified on the tested 2024 Frame.

## Native Home setup

Install the CLI and launcher from the [Quick Start](../README.md#quick-start).
Check your model in the [TV reports](tv-compatibility.md). Run `aerotizen --version`
to identify your CLI. If you run from the extracted folder, use `./aerotizen` on
macOS or Linux, or `.\aerotizen.exe` in PowerShell. Replace `TV_IP` with the TV address.

### Before first launch

Before you open AeroTizen, save the original Home and startup settings:

```sh
aerotizen --tv TV_IP home status
aerotizen --tv TV_IP home backup
```

Keep any existing valid original backup. On some TVs, opening AeroTizen changes
only `db/appfw/booting_appid_backup` to `DclHome001.Home`. Apply accepts that
specific difference from the saved original. A new backup requires original values.
See [backup behaviour](home-read-only.md#backup-behavior).

The CLI saves `original-home.json` in `~/.config/aerotizen/backups/<TV identity>/`.
Keep the **whole folder**, including the `transactions/` directory. Later backups
keep the original file and report if the current settings differ.

### Apply Native Home

Open AeroTizen to start its control service. Preview the change, then apply it:

```sh
aerotizen home apply
aerotizen --tv TV_IP home apply --yes
```

CLI 3.0.0 sets both Home bindings and tries to assign both startup app IDs. When
both IDs match, it enables Smart Hub autostart. If startup setup fails, it keeps
the Home bindings only if it can verify the original startup settings. Check the
result in the CLI.

For the old `--boot` workflow, see the [CLI 2.6.0 instructions](https://github.com/helalaou/AeroTizen/blob/cli-v2.6.0/README.md#choose-how-home-works).

### Verify on the TV

Disconnect TV or One Connect power for 60 seconds, then restart. Check which app
opens. Press Home from YouTube, Prime Video and Samsung Home. On the tested Frame,
AeroTizen took about 30 seconds to appear with native startup enabled. Home from
Art Mode opened Samsung's Art page first. A second Home press opened AeroTizen.
Samsung Home remains available in AeroTizen Settings.

## Restore and transfer to another PC

Restore before uninstalling AeroTizen. The CLI uses your saved Home and startup
settings and re-enables the watcher if AeroTizen is installed:

```sh
aerotizen home restore                                  # offline preview
aerotizen --tv TV_IP home restore --yes
```

Disconnect TV or One Connect power for 60 seconds. Reconnect it and check that
Home opens Samsung Home. Keep the backup on the PC after uninstall.

### Recovery and backup transfer

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

If Samsung's HTTP API on port 8001 is unavailable, Home commands can use model and
platform metadata from a valid original backup for the connected TV. The CLI still
checks the device identity, firmware, CPU and native values over SDB. The first
backup needs live model metadata.

## Compatibility and testing on another TV

Apply and restore check for an SDK UID 901 connection, a 32-bit ARM Tizen runtime,
complete Home and startup values, and the required native functions. Apply also
checks the launcher and its control service. A failed compatibility check stops
before any Home writes or watcher handoff. The backup must match the TV, firmware,
OS and architecture. The CLI saves the write request and baseline under
`transactions/` before it writes. A failed write or verification attempts rollback.
Keep the whole backup folder and check `home status` if a change fails. If the
Home helper cannot start, use the [read-only runtime probe](home-runtime-probe.md).

The [Frame comparison](home-profile-isolation-tv-20261026.json) covers Home return
from YouTube, Prime Video and Samsung Home. Samsung Home checks waited 10 seconds.
The test also found that changing the Art return target caused a Samsung loading
spinner. Current builds keep the original Art target and accept backups from the
earlier build. See the [Night Mode comparison](home-pc-roundtrip-tv-20261025.json)
and the [65-inch S90C report](home-s90c-tv-20261027.json) for the conditions tested.

For development tests, use the CLI and signed launcher from the same checkout.
Build the native helpers as described in [development setup](../CONTRIBUTING.md#development-setup).
Record the CLI commit, launcher build, TV model, firmware, Home return, startup and
restore results. Remove private paths and device IDs before you share a report.

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
The cause is unresolved. These diagnostics help distinguish failure types.
