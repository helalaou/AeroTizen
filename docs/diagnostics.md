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

The launcher records startup/load, app launch requests and callback results, visibility
changes, Home app-control operations, and Samsung Home/Live TV handoffs. Its background
service records startup, routing mode, watcher decisions and requests. Related request
and result events share an operation ID. A launch accepted by Tizen does not prove it
was visible. Existing visibility checks can report an unconfirmed result; no extra
screen polling is added.

Script errors, rejected promises and handled app-launch failures include a bounded,
redacted message, error name, source basename, line/column when supplied, and up to eight
stack locations. Error formatting runs in a later task. Stack messages, full paths,
content payloads, programme titles and account data are excluded. Secret-like error
messages are omitted. Filtering is best effort; review the ZIP before sharing.

Each new event has a session ID, sequence number and elapsed milliseconds from a
monotonic clock when supported. Use session and sequence to order events from that
process; wall timestamps can be wrong during TV startup. UI and service sessions are
separate. Correlated operation IDs and visibility events help compare them. Older
saved events can lack the new fields; no ordering data is invented for them.

Recording an event updates a bounded memory buffer. Remote handlers do not save logs or
prepare network batches. Upload preparation runs in a later task; delivery uses async HTTP.
The existing background service accepts the batch into memory and returns without waiting
for disk storage. A separate Web Worker is not used for this small, bounded workload.

Dirty buffers are saved in batches after a 500 ms delay. UI logs use asynchronous
IndexedDB transactions; the service uses asynchronous file writes followed by an atomic
rename. Only one save can run at a time. Events received during a save go into the next
batch. There are no synchronous log writes or synchronous fallback writes. Existing UI
logs in localStorage are read once in an idle task for migration; that old key is not
rewritten. If IndexedDB is unavailable, the UI keeps its memory buffer and can still send
records to the service. Storage failure never makes a remote action wait.

Batching is best effort: a power cut, process termination or UI suspension before a save
completes can lose the unsaved events. The normal delay is 500 ms plus storage time;
suspension can make it longer. Records already saved survive restart. Exports read the
service's current memory buffer, including events not yet saved. Home backup and recovery
receipts keep their existing durable writes; they are separate from diagnostic logs.

UI delivery is requested on load, return to the launcher, an error, or a successful service
request. If the service is not ready, delivery gets up to three short retries while the
launcher is visible. Retries stop when it is hidden. There is no continuous polling, and
diagnostic delivery never starts the service. Each log keeps at most 200 recent events
within a size limit. Old events are discarded. Uninstall removes TV logs.

`--tv TV_IP logs export` reads the running local service through SDB and makes a bounded
TV metadata request. No root, inspector, service launch or Home setting change is needed.
The service reads its OS metadata once, asynchronously, outside request handlers. A stopped
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

`report.json` contains:

- PC OS, architecture, Python and CLI version; TV model, firmware, Tizen and architecture
  when available. Unavailable fields remain null with collection status/reasons.
- CLI and launcher content build IDs, Git commit and dirty flag when available. These
  distinguish development builds that share a version. Packaged CLIs embed the build
  identity; compiled launchers share one identity between the UI and service.
- Service routing mode, persistence, watcher heartbeats and launch count. This is the
  service's state, not proof of the TV's native Home assignment.
- Logging health: retained, discarded and invalid events; pending errors; storage state
  and failed reads/writes; the UI's last reported upload queue and delivery attempt status.
  Counts describe the current process and are not lifetime totals. Queue/delivery fields
  are a snapshot before the last acknowledged batch, not a live UI query. A missing UI
  report means its newest records may still be queued or the build is older.
- Bundle file counts and skipped files. The export command's own log may not yet contain
  its finish event because export happens while that command is running.

For Home or startup problems, use:

```sh
./aerotizen --tv TV_IP logs export --include-home --output aerotizen-home-report.zip
```

This optional check stages the existing read-only SDK query helper and cleans it up.
It can take up to 35 seconds. It reads native Home/boot assignments and reports read
and cleanup evidence. It does not apply/restore settings or use root. A failed query
is recorded as unavailable and does not prevent the ZIP from being created. The normal
export skips this helper. An offline report explicitly marks TV context as not requested.

Attach the ZIP to the GitHub bug report form with reproduction steps, expected/actual
behaviour and what was visible on the TV. Logs are evidence of requests and callbacks;
they cannot by themselves prove what the user saw.

The ZIP excludes raw recovery requests, original backup files, certificates and token
files. It cannot restore Home. Keep the **whole original Home backup folder** for restore;
log rotation and export do not modify that folder. TV logs and PC logs are diagnostic
history, not a replacement for recovery records.
