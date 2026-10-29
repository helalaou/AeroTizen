# Root CLI and per-boot helper

The commands manage `org.aerotizen.roothelper`, a separate hidden .NET service.
They do not write Home assignments, launcher startup values or Art Mode settings.
Launcher UI and app-specific integrations are outside this feature.

## User flow

1. Leave Developer Mode On with Host PC IP set to the computer. Run
   `aerotizen --tv TV_IP root setup` to preview, then add `--yes` to install.
2. Follow the printed TV steps: change Host PC IP to `127.0.0.1` and fully restart.
3. Run `aerotizen --tv TV_IP root setup --yes --wait 240` to finish. Completion
   needs the paired root server from a new boot, a verified TV identity, the actual
   dedicated startup flag and completed SDK/app staging cleanup. Initial PC-driven
   root is reported as setup evidence and cannot satisfy automatic-boot verification.
4. `aerotizen --tv TV_IP root status [--wait 240] [--json]` checks the live root
   process. An old saved proof is insufficient. Other CLI commands select the paired
   SDB bridge automatically while Developer Mode points at localhost.
5. `aerotizen --tv TV_IP root remove --yes` disables future attempts and removes
   private pairing state. Restore the saved PC host address and restart when
   instructed, then repeat the command to finish normal SDK uninstall.

Setup/remove default to previews. A pending restart is shown as pending, never
complete. Re-running a command uses its existing receipt. Lost setup completion
replies are recovered from matching live evidence without another root attempt.
Removal also works with normal PC access if the bridge stopped or the helper was
already uninstalled. A later setup preserves the removed record in private history.

If a computer's address changes, enter its current address in the TV's Developer
Mode menu before using normal SDB. The saved address is the actual setup-time value,
not a hardcoded default for a model. After restoring access, pass a copied private
receipt with `--receipt PATH` when needed. Keep its directory private.

## Components and bounds

- **Per-boot service:** normal app UID. It skips the installation boot, records a
  durable claim keyed by kernel boot ID before any local SDB request, and generates
  a fresh root nonce and signed archive for each later boot. Same-boot activations
  cannot request root again. Automatic restart is off.
- **Payload:** unchanged checksum-pinned `SamsungTvArchiveRoot` v0.0.12 .NET 6
  assemblies. Only a fixed signed helper install/serve/remove operation is added
  around that payload. No firmware files or UEP settings are changed.
- **Root backend:** independent background process. It stores pairing files in a
  root-owned private directory and offers three operations: status, SDB relay and
  removal. It has no shell-command endpoint. SDB relay always targets the TV's own
  `127.0.0.1:26101`.
- **Bridge:** TLS 1.2 or newer, exact certificate pin checked before token transfer,
  then a 256-bit pairing token. Replies include a fresh client nonce, installation
  and device identity, current kernel boot ID and live UID/EUID/GID. The listener
  allows four clients, bounds authentication to five seconds, and bounds relay idle
  time and lifetime. It defaults to port 26104.
- **One-time setup:** preserves a durable private PC receipt before TV writes,
  checks the installed package, then enables only its `app_onboot` row. The SQLite
  writer drops to the captured database owner and verifies cleared effective
  capabilities. Other registration rows and Home snapshots are compared afterward.
- **Removal:** verifies the saved installation before changing anything. Recovery
  can stop the owned root process using its boot ID, executable, start ticks and
  a Linux pidfd; an unrelated/reused PID is refused. Private TV credentials are
  deleted, and normal SDK uninstall removes the dedicated startup registration.

The bridge uses a certificate pin rather than wall-clock certificate validity, so
an unset TV clock does not turn a valid pairing into a startup failure. The optional
loopback metadata read also does not gate SDB readiness. Private setup input crosses
a second pinned TLS connection, authenticated with a one-use key delivered through
the authorised SDB session. It never enters a shared SDB upload. The SDK process
creates its own mode-0600 input inside a mode-0700 directory and removes it afterward.
SDB uploads are owned by user 5001, so private SDB files cannot be read by SDK user 901.

All AeroTizen PC access retains the per-device session lock, including bridge
management. A bad certificate or token never falls back to direct SDB. Root pairing
data is separate from the launcher and its settings. Native Home's existing saved
configuration remains under its own backup workflow.

## Developer build and validation

The release includes the generated managed runtime; end users do not need .NET
or a Tizen compiler. From source, build package data before using the commands:

```sh
python tools/build_home_query.py
python tools/build_home_control.py
python tools/build_root_runtime.py
```

The root build uses the pinned official `Tizen.NET` compile-reference package.
`--framework PATH` can select existing local reference assemblies instead. Only
our managed assemblies, metadata and icon enter package data; Tizen framework DLLs,
keys and upstream executables are excluded. First setup downloads the verified
upstream release and extracts only the pinned TV payload files. `--root-release PATH`
can use an already verified extracted v0.0.12 release.

Local coverage includes the actual native TLS server with Python clients and a
fake SDB device, wrong-pairing rejection, live status, authenticated removal,
same-boot/new-boot guards, guarded SQLite transactions, signed package isolation,
cross-language archive validation and interrupted CLI transactions. CI runs the
archive contract checks with the pinned upstream payload.

**Hardware boundary:** on the Frame/Tizen 9, the CLI test build passed setup,
live authenticated status and wrong-token/certificate rejection. Direct-SDB
recovery removal passed on preceding test builds. Home values and other app
registrations stayed unchanged.
Testing found and fixed SDB/SDK file-owner mismatch, an inherited callback descriptor,
and missing optional first-boot status handling. A cold boot with the Mac offline
then proved automatic root and SDK access through the bridge. The supervisor's
success output omitted its service-result marker, so the app correctly left
setup pending. That framing fix passes a native producer/consumer regression test
but needs a hardware retest. Authenticated removal stopped the bridge and deleted
credentials. A new recovery boot confirmed that the helper stayed disabled,
normal PC access returned, and SDK uninstall completed. Repeat boots on the
corrected build and its final removal remain pending.
See [the hardware test record](root-cli-tv-20261029.json) for completed and pending checks.
