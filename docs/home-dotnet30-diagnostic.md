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
unchanged. On the reported TU8079 / Tizen 5.5, both standalone launchers exited 0
without console startup evidence. The file-marker version also observed no
startup marker with `dotnet-launcher-inhouse`. The app-context mode below has not
yet been tested on that TV. On dosolly's GU65TU7179UXZG, the standard
`dotnet-launcher --app-context` test wrote the startup marker, but no console
results or completion marker were received. This confirms managed startup;
it does not distinguish a later failure from lost console output.

The next test is limited to that TU7179 and the same standard launcher with
`--app-context`. The updated probe also saves its results and progress to a
private temporary file, independent of console output. Native Home support
remains unverified.

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
marker separately from the console. It also creates an empty private report
file. The helper flushes each result and a checkpoint before each operation to
that file, and records its own return code. Console errors do not stop the checks.
The script reads at most 16 KiB of this file and removes both files with the
other staged files. Settings values, argument contents and exception messages
are not recorded. An incomplete final record is discarded after a forced stop.
A TV-side watchdog attempts to terminate the launcher after 12 seconds, then
attempts a forced stop two seconds later. The
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
- `execution.report_source`: `file` uses the flushed file results; `console` uses
  console results when no file results arrived; `null` means neither arrived.
  Partial file results are never combined with console results to claim completion.
- `execution.last_stage` is the last checkpoint before an operation, or `complete`
  after the checks. A missing result for that stage helps locate where progress
  stopped. It does not identify the cause by itself.
- `execution.argument_count` records only the count, never argument contents.
- `execution.managed_exit_code` is the helper's return code, separate from the
  launcher's exit code. `execution.error_category` is a fixed safe category for
  a caught managed failure or unexpected arguments. Native crashes and forced
  termination can leave only the preceding checkpoint.
- `launcher.app_context_requested` records whether `--app-context` was selected.
  It describes the requested environment, not proof that Samsung accepted it or
  that managed code started. Use the startup and getter results for that evidence.
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

## Test the installed AeroTizen app context

CleanFrame's separate [2020 Frame helper instructions](https://github.com/nthnclrk/CleanFrame/blob/main/scripts/native-home/frame-2020/README.md)
set `APP_ID` to the installed launcher when invoking `dotnet-launcher --standalone`.
This led to observed managed startup on dosolly's TU7179, but no getter results
have been received. CleanFrame's firmware and owner-supplied transport differ
from the issue #84 TVs.

After reviewing the previous report, run the same selected launcher with an
explicit AeroTizen context and a new output path:

```sh
aerotizen --tv TV_IP home diagnose-runtime \
  --launcher dotnet-launcher --app-context \
  --output home-runtime-tu7179-file-report.json
```

This mode first checks the installed-app list for `DclHome001.Home`. If it cannot
confirm that app, it stops before staging the runtime probe. It sets `APP_ID` only
for the selected diagnostic process. It does not install or launch another app,
change the installed launcher, or change Home/startup/watcher settings. The
managed payload, getters, time limit, and cleanup are the same in both modes.

Without `--app-context`, the probe explicitly clears `APP_ID` so an inherited SDK
shell value cannot affect the comparison. Do not run both launchers or modes as
an automatic fallback. Review each result before requesting another run. A
successful runtime probe still does not establish Home writes or recovery;
keep `home apply` on hold.

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
startup failure, missing executables, timeout, altered payloads, hidden console
output, partial file results, report symlinks, output redaction, file publication
and confirmed staging cleanup. Compiled host checks also cover a hidden or closed
console and unexpected arguments. They do not replace a physical TV
test. Full older-TV Home support remains separate work.
