# Background service baseline

The four JavaScript files are byte-for-byte snapshots from AeroTizen commit
`d3adce1a72e7b2e41ecd2681783d3d4511de85ee`, before the background service
TypeScript migration. They are excluded from TV packages and formatting.

The Art Mode and watcher suites can use this baseline with
`AEROTIZEN_TEST_SERVICE_BASELINE=1 node --test tests/artmode.test.cjs tests/watcher.test.cjs`.
