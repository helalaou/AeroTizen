# Repository agent instructions

These code quality rules apply across the repository. Follow more specific instructions
in nested `AGENTS.md` files as well.

- Give protocol values, limits, durations and identifiers meaningful constants. Include
  units in names where useful. Keep constants with their owner; share them when callers
  use the same rule, rather than collecting unrelated values in one constants file.
- Prefer small, pure functions for validation, transformation and decisions. Treat inputs
  as read-only and return new values. Keep I/O and necessary mutable state in explicit
  service or platform owners, with dependencies and cleanup visible.
- Reuse existing helpers and remove repeated rules where that improves clarity. Keep
  abstractions focused on a shared responsibility; similar syntax alone is not a reason
  to combine different behavior.
- Apply these rules when changing code. Preserve existing behavior and compatibility,
  and keep unrelated refactors separate.

Read [CONTRIBUTING.md](CONTRIBUTING.md) for development checks and
[launcher/AGENTS.md](launcher/AGENTS.md) before changing launcher code.
