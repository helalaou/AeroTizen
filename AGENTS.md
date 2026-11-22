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

## Tests

- Read the relevant existing tests before adding coverage. Extend an existing test
  when it already owns the behaviour. Each new test must cover a distinct failure risk.
- Use the lowest test layer that can detect the failure. Keep service rules,
  validation, state transitions, timers and cancellation in unit tests. Use component
  tests for rendered state and local input handling.
- Keep Playwright focused on critical journeys and browser integration: startup,
  remote navigation between components, saving and reloading settings, native
  handoffs, compatibility and representative layout. Explain in the PR why each new
  browser case needs a real browser and is not covered by an existing journey.
- Test shared behaviour once. Add theme, locale, layout or build variants only when
  they exercise different behaviour or a specific browser regression. Avoid exhaustive
  combinations and repeated service or state assertions in browser tests.
- Use named steps for related checks in one journey. Keep independent journeys in
  separate tests with fresh storage and browser contexts.
- Assert observable behaviour or an explicit performance or resource contract.
  Avoid tests that mirror implementation details or lock down incidental markup,
  exact spacing or private fields.
- Remove obsolete coverage when replacing behaviour. Do not retain duplicate browser
  tests after moving checks to unit or component tests.
- When changing browser coverage, check the per-file timing report and report the
  test count and runtime change. Keep CI unsharded while this small suite is fast;
  use measured runtime to justify future parallel jobs.
