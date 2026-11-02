# Read-only Home runtime probe

Use `home probe` to investigate a TV where the managed Home helper cannot start.
It uses the existing SDK connection without `/usr/bin/dotnet`, root, Tizen Studio,
or a TV app install. It does not run any runtime it finds, load native libraries,
read Home databases, change Home/boot/watcher settings, or launch apps.

```sh
./aerotizen --tv TV_IP home probe --output home-probe.json
```

The TV must be on, with Developer Mode set to this computer's IP. Allow the TV to
connect back to this computer through the local firewall. The transport uploads
one small temporary shell script into the SDK tools folder and removes it after
completion. It confirms cleanup before saving a report. A timeout means cleanup
is unconfirmed, not that files are known to remain. Stop after a transport error
and report the short error message; no runtime fallback or Home change is made.

The report contains:

- Allowlisted OS version, firmware build, CPU architecture and SDK execution UID.
- File flags for fixed .NET command and native-library paths.
- At most 32 immediate directory entries per fixed runtime location; only version
  names are retained. A flag indicates when the directory scan was truncated.
- Whether the SDK transport confirmed cleanup.

The probe collects no device ID, IP address, host name, app list, signing material,
tokens or raw command output. Missing or unrecognised metadata is `null`, not an
inferred version. It does not contact an external server or upload the report.
Review `home-probe.json` before sharing it. Existing files and symlinks are never
replaced; choose a new output name for another run.

This is a file inventory, not a Home backup or compatibility test. File flags
cannot prove that a runtime starts, that native symbols exist, or that SDK access
can read Home settings. `native_home_supported` remains `null`. Tizen 5.5 support,
alternative runtime execution, key-rule changes and restore testing are separate
work. The reporter's model can be supplied separately with the report; the probe
does not query the TV's HTTP identity endpoint.

## Test the PR code from source

The probe needs Python 3.10 or newer on the computer. For a source install, it also
needs Git and Python's `venv` module. Use a separate environment so the installed
release stays available:

```sh
python3 -m venv .venv-home-probe
.venv-home-probe/bin/python -m pip install \
  'git+https://github.com/metacurb/AeroTizen.git@feat/native-home-read-only-probe-84'
.venv-home-probe/bin/aerotizen --tv TV_IP home probe --output home-probe.json
```

Use the exact commit supplied with the diagnostic instructions instead of the
branch name when reproducing a report. No managed helpers or .NET SDK need to be
built for `home probe`. A Python wheel built from that commit is another install
option; install it in the same isolated environment with `pip install FILE.whl`.
Local fake-TV tests validate collection, filtering and cleanup; they do not
establish physical Tizen 5.5 support.
