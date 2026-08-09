---
name: refine-explore-flights-ui
description: Refine, refactor, debug, or visually review the explore.flights React UI under `ui/` while preserving its TypeScript, shared-component, CSS-token, responsive, accessibility, and product conventions. Use for UI/UX passes, page or component cleanup, picker/search behavior, CSS and mobile regressions, component reuse, dead-code cleanup, and browser-based visual QA. Do not use for backend-only, updater-only, or infrastructure-only work.
---

# Refine the explore.flights UI

Keep UI changes reusable, strongly typed, responsive, and grounded in the project's established
product philosophy. Solve defects at the owning abstraction and verify real behavior, not only the
build.

## Gather context

- Read the root `AGENTS.md` and `ui/src/styles/README.md`.
- Inspect the affected page, its shared components, and nearby callers before designing a new API.
- For design or UX work, read [design-philosophy.md](references/design-philosophy.md).
- Check the current diff and preserve unrelated changes. Treat explicit scope exclusions as
  regression targets.
- Check whether ports 4200 and 8080 are already in use before starting servers. Reuse a user-started
  backend when available and never stop it during cleanup.

## Choose the owning abstraction

- Search for an existing primitive, picker, hook, option mapper, filter, calendar, schedule control,
  or formatter before adding another one.
- Put behavior shared by multiple pages in a shared component or function. Do not repair a shared
  overlay, stacking, sizing, focus, filtering, or normalization bug with a page-specific selector.
- Extract only a coherent responsibility. Keep option/query lifecycle, token input, selection
  transaction, and presentation separate when their behavior differs.
- Keep the backend/API surface unchanged for UI-only work. Derive from already-loaded data when it
  is sufficient.

## Implement with strong contracts

- Avoid explicit `any`, `unknown`, `never`, non-null assertions, and contradictory optional fields.
- Use required `T | undefined` when a field or argument is always structurally present but may not
  have a value. Use discriminated unions for mutually exclusive states.
- Use braced multiline control flow and readable branches. Avoid nested ternaries.
- Keep storage and consent behavior behind `usePreferences()`.
- Keep `SimpleSelect` and the intentionally unused `SingleSelect`.
- Make text normalization and ranking shared. In code/name searches, prioritize exact codes, then
  code prefixes, then names/keywords. Include airport area codes.

## Style with the hybrid CSS architecture

- Use global CSS for tokens, themes, resets, app/page layout, cross-component contracts, and shared
  primitives. Use colocated CSS Modules for an isolated component and its responsive states.
- Reuse CSS custom properties from `00-tokens.css`; keep text at least 12px through the type tokens.
- Avoid `!important`, page-specific z-index workarounds, and raw values when a token exists.
- Prefer plain CSS Modules over Sass. Use `:global(...)` only for intentional third-party hooks.
- Restructure at narrow widths rather than shrinking or clipping content. Preserve desktop layout
  when the issue is mobile-only.

## Preserve interaction semantics

- Treat the text box as authoritative. Clear stale async suggestions while a request is pending, and
  keep keyboard selection from accidentally starting a new query.
- Make mobile pickers own their fullscreen/top-layer behavior. Keep X/Done semantics explicit and
  verify real iOS-style focus, draft selection, and filtered-list identity behavior.
- Progressive option lists must filter the full dataset, reset batches and scroll on query changes,
  and reveal more for scrolling and keyboard navigation.
- Make the whole removable token target clickable when it has no competing action.
- Prefer visible editable filter state. Presets update normal fields, active presets toggle off,
  empty means all, and Clear all removes every filter.

## Verify proportionally

- Always run from `ui/`:
  - `npm run format:check`
  - `npm run lint`
  - `npm run build`
- Run `git diff --check` from the repository root.
- For behavior or appearance changes, use the browser on the affected routes at wide desktop,
  944px, and 375–390px. Exercise focus, keyboard, scroll, selection, filters, themes, overflow, and
  the browser console.
- Test complex domain cases, not only the easiest record: multi-leg journeys, empty results,
  filtered-out dates, large option lists, and mixed configurations when relevant.
- Inspect the final diff for dead CSS, unused exports, duplicated logic, accidental backend changes,
  and excluded-page changes.
- Stop only the dev processes started for this task and confirm their ports are clear.
