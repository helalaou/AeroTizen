# Launcher agent instructions

Before changing launcher code, read [CONTRIBUTING.md](../CONTRIBUTING.md) and the
[component ownership guide](../docs/component-structure.md). For CSS or icon changes,
also read the [style rules](../docs/styles.md) or [icon rules](../docs/icons.md).

## Code quality

- In modern frontend code, use `const` when a binding does not change, one binding
  per declaration, and no `var` or nested ternaries.
- Use named objects for configuration and choice data, such as `{ value, label }`.
  Keep fixed options and lookup maps outside components. Use guard clauses for rules
  with a priority or range.
- Treat props, inventories and state snapshots as read-only. Create new arrays and
  objects for updates. Do not reassign parameters or write to their properties.
  Keep necessary mutation in owned timers, refs, private buffers and service adapters;
  app composition may publish and restore the legacy runtime's UI bridges.
- Name components by their role and give each one a clear responsibility. Use layout
  variants for shared behavior, as with `Clock`. Share components when screens need
  the same behavior; avoid abstractions based only on similar markup.
- Let Preact render markup and view state. Register nodes with refs for focus and
  geometry work. Keep platform commands and subscriptions in their existing owners;
  do not add polling or requests to presentation components.
- Follow the documented dependency direction and style owners. Use theme tokens and
  the shared icon components. Remove code made obsolete by the change.
- Co-locate migrated styles in `Component.module.css`. Use semantic data/ARIA hooks
  for focus and selection; never use generated class names as runtime APIs. Legacy
  services must request UI changes through bridges, not mutate component classes.
- Put components with styles or private helpers in a component-named directory,
  such as `AppGrid/AppGrid.tsx` and `AppGrid/AppGrid.module.css`. Keep small components
  without companion files flat. Move existing components when working on their
  styles; avoid unrelated bulk moves or one-line barrel files.
- Use local module classes without ID/global scopes. Standard CSS nesting is compiled
  for Chromium 69; keep it at two levels or fewer and leave copied legacy CSS flat.
- Use shared duration tokens from `css/motion.css` for UI motion. Keep component
  reduced-motion queries only for behavior that cannot be expressed by those tokens.

## Compatibility

Keep legacy `js/` scripts ES5-compatible. Target Chromium 69 for compiled frontend
code and browser APIs, with an ES2018 syntax ceiling. Preserve saved settings and service interfaces. Keep
broader global-service migrations separate from unrelated changes. Comparison
fixtures are frozen evidence; do not change them only to make a regression test pass.

## Completion

- Review the full task diff for naming, responsibilities, duplication, mutation and
  unnecessary complexity. Passing lint alone does not complete this review.
- For code changes, run formatting, lint and type checks from the repository root.
  Run the build and relevant Node/browser tests for behavior, rendering or lifecycle
  changes. For documentation-only changes, check formatting and link targets.
- Fix violations rather than weakening checks. Explain any necessary exception.
- Keep a development server running for frontend work; reuse an existing server when
  possible. Share its local and network URLs. Report physical TV validation separately
  from browser checks.
