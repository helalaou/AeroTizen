# HomeWatcher client migration baseline

`homewatch.js` is frozen byte-for-byte from `7cbe459`, immediately before the
browser-side HomeWatcher TypeScript migration. The comparison suite runs the same
startup, request recovery and handoff cases against this file and the typed service.

It is test evidence, not a launcher asset. Do not update it to match new behavior.
The background watcher service has a separate baseline under `../watcher-service/`.
