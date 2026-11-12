# Startup and diagnostics baseline

The four JavaScript files are byte-for-byte snapshots from AeroTizen commit
`6df1d451460106b3db0fbedcd7dccc5332654cc4`, before the TypeScript migration.
Privacy and startup parity checks compare the typed implementation with this baseline.
These files are excluded from TV builds.

The two files in `service/` are byte-for-byte snapshots from commit
`d3adce1a72e7b2e41ecd2681783d3d4511de85ee`, before the service context and
filesystem storage migration. Service parity tests use them as the baseline.
