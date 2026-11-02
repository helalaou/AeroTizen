# CLI update validation

Run all checks against copies in a new temporary folder. Do not use the installed
production CLI as a test target. The updater changes only the executable that started
the command, retains a runnable backup, and uses no TV connection.

Older published releases do not contain this updater. A downloaded old release can
test replacement, backup and recovery, but cannot itself run the new command. The
end-to-end test therefore also freezes the current source as a temporary `0.0.0`
fixture, then runs its actual `update cli` command against the latest published stable
release. Temporary current-version and `99.0.0` builds cover the two no-op cases.
These fixtures are never published as releases and do not change tracked version files.

## Repeat the native checks

Install the development dependencies, PyInstaller 6.22.1 or newer, and certifi. Build
both native Home helpers as required by the existing standalone builder, then run:

```sh
python tools/test_cli_self_update.py --output /absolute/path/to/new-temporary-folder
```

The script downloads official CLI 2.4.0 and the latest stable CLI for the current
platform, verifies their checksums, builds the three updater fixtures, and preserves
`report.json` plus scenario logs. `--old-version X.Y.Z` selects another published
stable CLI. It uses only the supplied output folder for replacement tests. The
Python-install test hashes the running interpreter before and after the refusal.

| Scenario | Required result |
|---|---|
| Downloaded older binary | Replace with the latest binary; previous backup has the exact original hash and runs |
| Running older updater fixture | Actual command downloads, verifies and installs the latest release |
| `--check` | Report available version; executable unchanged and no backup created |
| Already current | No download or replacement |
| Installed version newer | No downgrade |
| Corrupt checksum fixture using real release bytes | Fail before replacement; original executable unchanged |
| Network failure fixture | Original executable unchanged |
| Wrong candidate version | Fail before replacement |
| Final version verification failure | Restore the exact original executable and run its `--version` |
| Python installation | Show pinned installer command; interpreter unchanged |
| Concurrent update | Refuse before downloading an archive or replacing files |
| Read-only installation folder on POSIX | Refuse; original executable unchanged |
| Spaces, ampersand and apostrophe in installation path | Full update and backup work without shell interpretation |

The checksum/network/final-verification failures are deliberately injected fixtures.
They are not claims that the published releases are broken. Adjacent settings
sentinels are checked; the tests do not open production certificates or TV connections.

For a manual terminal check, use the generated `older-updater` fixture in a fresh
folder, run `update cli --check`, compare the executable hash, then run `update cli`.
Run `--version` on both the installed binary and its printed previous-executable backup.
Use the current/newer fixtures to check the two no-op cases. On Windows, wait for the
helper's completion message and inspect the JSON receipt before checking the new file.

## Native platform evidence

The CI matrix runs the real-file scenarios on Linux x64, Windows x64, macOS arm64
and macOS Intel when CLI, packaging or updater paths change. Each job uploads its
report and logs. Local macOS results, native CI results, and unit tests are separate
evidence. A passing unit test with mocked replacement is not Windows executable proof.

Independent frozen child processes use PyInstaller's documented
[`PYINSTALLER_RESET_ENVIRONMENT`](https://pyinstaller.org/en/stable/common-issues-and-pitfalls.html#using-sys-executable-to-spawn-subprocesses-that-outlive-the-application-process-implementing-application-restart)
setting. Windows replacement uses
[`System.IO.File.Replace`](https://learn.microsoft.com/en-us/dotnet/api/system.io.file.replace).
