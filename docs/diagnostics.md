# Diagnostic logs

Use a current CLI and launcher build. Reproduce the problem, then run:

```sh
./aerotizen --tv TV_IP logs export --output aerotizen-report.zip
```

This creates a ZIP you can attach to a bug report. Existing files are never overwritten.
Include the steps you took and what appeared on the TV. Logs cannot confirm what was
visible on screen. No report is sent or uploaded automatically.

## PC logs

Each parsed CLI command writes a JSON-lines log under `~/.config/aerotizen/logs/`.
`./aerotizen logs open` prints and opens the folder. Set `AEROTIZEN_LOG_DIR` to use
another folder. The CLI keeps the last 10 files, at most 256 KiB each. A failed command
prints its log path. If log storage fails, the command keeps its normal behaviour.
Help, version output and parser errors do not create logs.

Logs include the CLI version, command, duration, device operation names, normal command
output and failures. Certificate/login and inspector command output is excluded.
Credentials, device identifiers, network addresses, URLs and private paths are filtered.
Redaction is best effort: read the report before sharing it.

Home apply/restore records include the requested action and model/firmware. When a native
readback fails, the helper saves the phase, expected and observed settings, and differing
keys **before rollback**. The result also reports whether rollback succeeded. This adds
evidence for errors such as “Final Home readback failed”; it does not establish a fix or
write permission for that firmware. Native compatibility and recovery checks stay in place.

## TV logs

The launcher records startup, app launch requests, visibility changes, Home app-control
operations, script error names and Samsung Home handoffs. Its background service records
startup, routing mode, watcher decisions and requests. Content payloads, programme titles,
account data, raw errors and stack traces are not recorded.

UI logs use local storage. They are sent to the existing local service on load, return to
the launcher, an error, or a successful service request. If the existing service is not
ready, delivery gets up to three short retries while the launcher is visible. Retries
stop when it is hidden. There is no continuous polling, and diagnostic delivery never
starts the service. The service keeps a separate log file in private app storage. Each
log keeps at most 200 recent events within a size limit. Old events are discarded. Storage failures
leave logging in memory; they do not block the launcher. Uninstall removes TV logs.

`--tv TV_IP logs export` makes one bounded, read-only request to the running local service
through SDB. No root, inspector, service launch or Home setting change is needed. A stopped
service, an older launcher or an unavailable TV produces a PC-only report with the reason.
On the tested Frame, cold-start UI events stayed queued until opening another app and
returning Home. A normal launch request did not flush them. Bounded delivery retries did
not resolve this case. Existing UI/service logs survived restart, and the new service
startup was available immediately. After a cold start, make an app roundtrip before
exporting if you need the newest UI events. See the [TV test record](diagnostics-frame-tv-20261028.json).

## Export and recovery

`./aerotizen logs export` works without a TV connection. Both forms include recent PC logs,
CLI/OS/Python versions, and summaries of up to 20 Home recovery records in the default PC
backup folder. The TV form also includes the latest service/UI events if available.
A separately copied backup folder is not searched automatically.

The ZIP excludes raw recovery requests, original backup files, certificates and token
files. It cannot restore Home. Keep the **whole original Home backup folder** for restore;
log rotation and export do not modify that folder. TV logs and PC logs are diagnostic
history, not a replacement for recovery records.
