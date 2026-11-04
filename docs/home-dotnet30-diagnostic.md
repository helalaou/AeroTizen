# Read-only .NET 3.0 runtime diagnostic

Issue [#84](https://github.com/helalaou/AeroTizen/issues/84) reports a Tizen 5.5 TV
with no `/usr/bin/dotnet`, executable `dotnet-launcher` binaries, and runtime
directories up to `3.0.0`. `home probe` only inventories files. This separate
command tests managed startup and native getter access:

```sh
aerotizen --tv TV_IP home diagnose-runtime --output home-runtime-diagnostic.json
```

This command runs only `/usr/bin/dotnet-launcher --standalone` with the bundled
`netcoreapp3.0` diagnostic. It does not fall back to another launcher, acquire
root, install a package, launch an app, or use the Home query/writer helpers.
The existing `home probe`, `status`, `backup`, `apply` and `restore` routes are
unchanged. No physical Tizen 5.5 test has been performed for this diagnostic.

The SDK transport starts as UID 901. The diagnostic reports its actual UID/GID,
runtime description, process bitness, Linux capability masks, `NoNewPrivs`, and
a limited security-label category. Missing metadata is `null`. The `User` category
does not include any package-specific label suffix. It loads the four fixed
Home-related libraries and calls only the fixed getters used to read Home
settings, main-operation ownership and AeroTizen's app registration. It releases
returned native memory. Native checks are skipped outside a 32-bit Tizen process
or if the managed process unexpectedly runs as root.

Reports contain getter status and numeric return/errno codes, **not setting
values**. A successful app lookup or an explicit “no such app” result distinguishes
access from missing registration. Other unavailable values do not imply absence.
Reports include fixed launcher error categories for recognised messages, such as
`runtime_load_failed` and `access_denied`. The probe checks console output and,
if readable, the first 8 KiB of a current Samsung error log for the launcher PID.
It leaves the system log in place. Raw messages, device IDs, IP addresses, app
lists, account data and signing material are excluded from the report.

The command uploads one temporary script, a DLL and its runtime configuration to
the standard SDK tools folder. The script prepares a temporary startup marker
that the helper updates as soon as it enters `Main()`. The script reads the
marker separately from the console and removes it with the other staged files.
A TV-side watchdog attempts to terminate the
launcher after 12 seconds, then attempts a forced stop two seconds later. The
report is saved only after the transport confirms staging cleanup. If the launcher
changes identity so it cannot be stopped, or the connection fails, the transport
can time out and cleanup is unconfirmed. Stop and share the short error; do not
run further tests until the failure is understood.

Allow the TV to connect back to the computer through the local firewall. Existing
report files and symlinks are refused, including a file created during the run.
The output's parent folder must already exist. Review the report before sharing.

## Interpret the report

- `execution.state: completed`: the diagnostic reached its final marker and exited
  successfully. Check each library/getter result separately.
- `missing_launcher`: the selected executable is absent or not executable.
- `failed`: the executable failed, or no complete managed report was received.
- `timed_out`: the watchdog reached its time limit.
- `execution.startup_marker: written` confirms that managed code ran even when
  the launcher did not forward console output. `not_observed` means the marker
  stayed unset. `null` means it could not be checked. The marker requires write
  access from the launched process. `managed_started` is true if either the file
  or the console shows startup.
- `launcher.errors` contains recognised error categories. An empty list can also
  mean the launcher emitted no matching message or its log was unavailable.
- Getter `ok`: the native getter returned successfully. No value is exported.
- Getter `absent`: the app-manager getter explicitly reported no AeroTizen app.
- `missing_library`, `missing_symbol`, `unavailable`, `error` or `skipped`: the
  relevant check did not establish readable state. Its code can be `null`.

`native_home_supported` remains `null` in every case. This diagnostic is not a Home
backup. Even all-successful getters do not prove write permissions, physical Home
routing, boot behavior or recovery. Do not run `home apply` based on this report.

The inventory's empty version list for `/usr/share/dotnet.tizen/netcoreapp` means
no version-named subdirectories were retained; that directory can contain DLLs.
This diagnostic tests the runtime actually selected by Samsung's launcher. The
target framework does not guarantee that the selected runtime is exactly 3.0.0.

## Test another launcher separately

Only if requested after reviewing the first result, select the other binary and
use a different report path:

```sh
aerotizen --tv TV_IP home diagnose-runtime --launcher dotnet-launcher-inhouse --output home-runtime-inhouse.json
```

Flutter Tizen documents the
[`--standalone` launch form](https://github.com/flutter-tizen/flutter-tizen/wiki/Profiling-the-engine).
A [different TV report](https://github.com/chris-ritsen/samsung-tv-root/issues/1#issuecomment-6388715821)
describes managed startup with cleared effective capabilities. Neither reference
establishes compatibility or getter access on the issue #84 device.

## Payload and local validation

The small diagnostic manifest is committed so a source install includes it without
a host .NET SDK. It contains checksum-verified managed IL and runtime configuration,
with a hash of the source, project and SDK pin. It contains no Samsung binaries. Rebuild it
with .NET SDK 6.0.428:

```sh
python tools/build_home_runtime_probe.py
python tools/build_home_runtime_probe.py --check
```

The existing Python test suite rebuilds and compares the committed payload when
SDK 6.0.428 is available (as configured in CI). Local fake-TV tests cover success,
startup failure, missing executables, timeout, altered payloads, output redaction,
file publication and confirmed staging cleanup. They do not replace a physical TV
test. Full older-TV Home support remains separate work.
