# Device sessions and temporary root

`DeviceSession` owns one TV's direct SDB connection. CLI commands and the inspector
use it. Existing install, certificate, app-list and inspector commands keep their
current syntax. No Home commands are added in this change.

The session holds an OS file lock for the host and port until it closes. This
includes the interval when the direct socket is released for root acquisition.
A second AeroTizen process gets a busy error before it opens a connection or
restarts an inspected app. Other SDK tools do not honor this lock; close external
debug sessions before using this test.

## Root handoff

The optional `SamsungTvRoot` adapter uses the `archive-root` route in upstream
[`samsung-tv-root` v0.0.12](https://github.com/chris-ritsen/samsung-tv-root/releases/tag/v0.0.12).
The executable and its TV payloads must come from a verified upstream archive.
The adapter checks the version but does not download or verify release archives.
Samsung's `sdb` executable and OpenSSL must also be available on the host. Basic
AeroTizen operations still use the built-in Python transport.

The session performs these steps in order:

1. Check local executable paths and the pinned root-tool version.
2. Close the direct SDB connection while retaining the TV lock.
3. Run upstream root acquisition with a bounded process lifetime.
4. Require authenticated UID/EUID/GID/EGID 0, successful requested commands,
   staging cleanup, and unchanged upstream-selected system-file hashes.
5. Disconnect upstream's SDB session for this TV only.
6. Reconnect direct SDB, then return the root result or the original error.

If disconnect or reconnection fails, the session closes and reports a recovery
error. No uncertain connection can be reused. Timeouts and interrupts stop the
child process, with a grace period for upstream cleanup. Forced termination
cannot establish that temporary TV files were removed; the operation fails.

This is temporary root acquisition. It writes staging files, even when the
requested commands only read data. It does not install a boot hook, change Home
ownership, disable UEP, or expose a persistent root server. Root identity does not
prove unrestricted SMACK access. Upstream compatibility still depends on the
exact TV firmware and runtime.

## Explicit hardware test

From a checkout installed with `pip install -e '.[dev]'`:

```sh
python tools/probe_device_session.py \
  --tv TV_IP \
  --root-tool /absolute/path/to/samsung-tv-root \
  --sdb /absolute/path/to/sdb \
  --output /absolute/path/to/handoff.json
```

This test acquires root. It reads `id`, CPU architecture and OS release, then
checks normal SDB access to the same device and unchanged installed applications.
The inventory check sorts app IDs, package IDs and versions. It excludes changing
usage counters, cache sizes and response order. The report stores a hash of the
device identity, not the raw DUID. It does not
read account credentials, viewing history, or Home settings, launch applications,
or pause the Home watcher.

Use the Mac's current TV-facing IPv4 address in the TV's Developer Mode Host PC IP
field. Restart the TV after changing that field. A working HTTP API on port 8001
does not establish SDB access on port 26101.

## Validation boundary

Automated tests cover connection order, ownership across processes, root failure,
interruption, recovery failure, evidence rejection, and child cleanup on POSIX.
They also use the fake-TV protocol fixture for a direct session. Physical-TV
results belong in a separate dated report. A local pass does not establish
Windows execution, other firmware compatibility, native Home behavior, or boot
behavior.

### 24 October 2026

- Python suite: 159 passed. Ruff lint, formatting and diff checks passed.
- The pinned macOS ARM64 root archive matched its GitHub release SHA-256.
  Samsung SDB 4.2.36 matched Samsung's package-list SHA-256 and ran on this Mac.
- The initial attempt could not connect because the Mac's TV-facing address
  differed from the TV's configured Developer Mode host. A fresh check showed
  matching addresses; no TV configuration change was needed.
- With direct SDB working, the first upstream root preflight failed its timing
  check. Normal SDB recovered to the same TV. The next attempt passed without
  changing upstream's checks or selected root route.
- The first successful root run exposed a probe defect: raw app-list output
  changes between ordinary reads. Stable installed metadata matched. The probe
  now compares sorted IDs and versions, with six regression tests.
- The final complete probe passed on `QE65LS03DAUXXU`, ARMv7, Tizen 9.0.0,
  build `T-PTMDDEUC-0090-REL-202605141701`, using the .NET 6 payload.
- Authenticated UID/EUID/GID/EGID 0, command execution, upstream staging cleanup,
  and unchanged `/etc/passwd` and `/usr/share/sdbd/public.pem` were confirmed.
- Direct SDB reconnected to the same TV. All 15 installed app IDs, package IDs
  and versions matched. The root process retained the `User` SMACK label.
- [Sanitized hardware evidence](device-session-tv-20261024.json) excludes the
  network address, device identity hash and installed-app list. Detailed attempt
  reports remain in the local temporary test-tools directory.

The physical connection/root/reconnection gate passed. Native Home, boot routing,
persistent root, and other firmware or host platforms remain separate tests.
