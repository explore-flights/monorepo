# Repository guidance

## Scope and architecture

This repository powers `explore.flights`:

- `ui/`: React 19, Vite, React Router, React Query, MapLibre, and plain CSS/CSS Modules.
- `go/api/`: Echo API backed by DuckDB. Local development listens on `127.0.0.1:8080`.
- `go/cron/`: Lambda action dispatcher for ingestion and pipeline orchestration.
- `go/common/`: shared Go domain models, clients, adapters, and utilities.
- `updater/`: Python 3.14/DuckDB updater and Parquet export workflow.
- `cdk/`: TypeScript CDK stacks and constructs.
- `protobuf/`: protobuf sources used by the API.
- `opentelemetry-lambda/`: upstream submodule; do not edit unless explicitly requested.

There is no root build. Work and verify from the owning module. Respect a requested scope such as
`ui/` literally; do not change an API, backend, data model, or infrastructure to simplify a
frontend-only task unless the user expands the scope.

## Cross-cutting rules

- Prefer narrow changes and reuse existing abstractions before adding another variant.
- Fix shared behavior in the owning shared component or function, not with page-specific patches.
- Preserve behavior outside the requested area. When a user excludes a page or subsystem, confirm
  it has no diff and include it in regression checks.
- Follow the data path when a contract changes: updater SQL/export, Go DB scans and web models,
  `ui/src/api/types.ts`, and all consumers.
- Keep the public API surface stable unless the task explicitly requests a contract change.
- Do not edit generated/dependency/build output such as `node_modules/`, `ui/dist/`, `cdk/cdk.out/`,
  deployment ZIPs, Lambda bootstraps, or local DuckDB/Parquet files.
- Preserve user work. There may be unrelated unstaged changes.

## UI conventions

Read `ui/src/styles/README.md` before changing styles. For substantial UI refinement or visual QA,
use the repository skill `refine-explore-flights-ui`.

### TypeScript and React

- Use TypeScript's type system rather than assertions or runtime ambiguity. Avoid explicit `any`,
  `unknown`, and `never` unless the boundary genuinely cannot be represented more precisely.
- Use required properties when the property is always present, even if its value can be
  `undefined`. Use optional properties only when omission is real.
- Model mutually exclusive states with discriminated unions instead of bags of optional fields.
- Do not use non-null assertions. Narrow with guards and model query/error states explicitly.
- Always use braces and multiline bodies for control flow. Avoid nested ternaries and generally
  prefer readable branches over dense expressions. Keep related statements grouped with blank
  lines.
- Move browser-storage behavior into `ui/src/app/preferences.tsx`; consumers should use
  `usePreferences()` rather than reading `localStorage` directly.
- Reuse shared controls, option ranking/filtering, schedules, calendars, metadata, and token-input
  primitives. `SimpleSelect` and the currently unused `SingleSelect` are intentional; keep them.
- Keep input normalization and option ordering shared across every instance. Code matches should
  rank ahead of name matches; airport search also includes area codes.

### CSS and responsive design

- Keep the hybrid architecture: global CSS owns tokens, reset, themes, app/page layout, and shared
  primitives; colocated `*.module.css` owns isolated component internals.
- Consume variables from `ui/src/styles/00-tokens.css`. Do not introduce magic colors, spacing,
  radii, layer values, or sub-12px text when an existing token applies.
- Do not add Sass unless a concrete need exceeds plain CSS Modules. Avoid `!important`.
- Put responsive behavior with the owning component when possible. A shared overlay, dropdown,
  picker, or z-index problem must be solved by that component, not by a page selector.
- Restructure crowded mobile layouts; do not solve them by shrinking text. Preserve desktop
  behavior when a request is mobile-only.

### Product and UX behavior

- Prefer a calm, functional interface: remove duplicated controls, labels, metrics, and card layers.
- Make presets modify visible filters. Empty filters mean "all"; clearing must not restore hidden
  defaults.
- Use precise domain language and state the unit and denominator for counts.
- Summary/insight interactions should reveal or focus their supporting data.
- Preserve journeys and other real domain groupings instead of flattening records for convenience.
- Prefer progressive disclosure to hiding detail. Keep layouts usable on desktop and real mobile
  browsers, including iOS-specific focus and selection behavior.
- Production route paths are canonical (`/flight/...`, `/airport/...`, `/allegris`, etc.). Do not add
  legacy redirects unless explicitly requested.

## Backend and data conventions

- The year-partitioned schedule endpoints use local departure dates from variant history. Do not
  reintroduce UTC-date joins merely for partition selection.
- Keep Go HTTP/wire concerns in `go/api/web`, query access in `go/api/db`, and domain search logic in
  `go/api/business`.
- For updater changes, inspect `updater/src/updater/sql/schema.sql` and the ordered `11_`/`12_`/`13_`
  scripts. Keep schema, history, derivative exports, Go scans, and UI models synchronized.
- Treat the canonical DuckDB as valuable data. For local investigations use the
  `audit-explore-flights-data` skill and retain read-only access unless the user explicitly asks to
  execute a mutation.
- DuckDB updates can behave as delete/insert under foreign keys. Generate guarded SQL and a
  verified backup/drop/recreate order instead of assuming an in-place update is safe.

## Development and verification

Use the smallest meaningful set, then expand for cross-cutting changes:

- UI (`ui/`): `npm run format:check`, `npm run lint`, `npm run build`, and `git diff --check`.
- Go API/common: `go test ./...` in each touched module.
- Go cron: `go test ./... -tags "lambda,lambda.norpc"`.
- CDK (`cdk/`): `npm run lint` and `npm run build`. Full synth requires CI-produced bundles.
- Updater (`updater/`): `uv run updater --help` plus targeted Python/DuckDB checks.

For visual or interaction changes, test the affected flow in the browser at desktop and mobile
widths. Include awkward intermediate widths such as 944px and narrow phones around 375–390px.
Check overflow, focus, keyboard interaction, stale async results, theme contrast, and console errors.

Before starting a local server, check whether the user already has the backend or UI running. Track
only processes you start, and stop those processes before handoff. Never kill a process merely
because it uses the expected port if it was not started by the current task.

## Deployment note

`.github/workflows/deploy.yml` currently builds the new UI for beta and pins the legacy production
UI to an older commit. Inspect that workflow before changing deployment or assuming beta and
production serve the same frontend.
