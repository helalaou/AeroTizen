# App presentation migration baseline

These four JavaScript files are frozen byte-for-byte from `35ec59e`, after PR #217.
They cover catalogue lookups, artwork priority, package-icon classification and name
formatting immediately before their TypeScript migration.

Node tests compare the typed helpers against this baseline. These files are not
served by the launcher or included in its TV package. Do not update them to match
new behavior.
