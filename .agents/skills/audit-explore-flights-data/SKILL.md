---
name: audit-explore-flights-data
description: Safely inspect, reconcile, and report on explore.flights DuckDB data without modifying the source database. Use for missing airport, airline, aircraft, schedule, history, metadata, rollback, integrity, or external-source reconciliation investigations; for producing CSV/Markdown reports and guarded SQL correction patches; and for reasoning about foreign-key-safe rebuild order. Do not use for normal application code changes or for executing database mutations unless the user explicitly requests execution.
---

# Audit explore.flights data

Investigate the canonical local DuckDB with read-only commands, retain an evidence trail, separate
high-confidence fixes from review candidates, and produce defensive remediation artifacts without
touching the source database.

## Establish scope

- Use the database path supplied for the task. If none is supplied, discover likely local database
  files without opening them and ask before choosing among multiple plausible sources.
- Read `updater/src/updater/sql/schema.sql` and the relevant updater SQL before interpreting tables,
  keys, or history semantics.
- Inspect only the tables required by the request. A user-specified table allowlist is strict; do not
  explore other tables for convenience.
- Infer whether the requested outcome is analysis, proposed fixes, a runnable patch, or execution.
  Analysis and patch generation do not authorize mutation; ask before execution when intent is
  ambiguous.

## Preserve the source database

- Include `-readonly` in every DuckDB CLI command that opens the source:

  ```bash
  duckdb -readonly /absolute/path/to/flights.db -c "SELECT ..."
  ```

- Never remove `-readonly`, attach the source read-write, or run generated SQL against it during an
  audit.
- Treat an error caused by read-only mode as a safety signal; change the validation method rather
  than relaxing access.
- Copy only necessary source rows to Parquet/JSON/CSV for processing. Keep the source path out of
  scripts that might open it without explicit read-only configuration.

## Build an evidence-backed audit

- Start with schema, row counts, null/placeholder distributions, uniqueness, and source-drift checks.
- Use stable composite keys from the schema rather than assuming an IATA code is globally unique.
- Reconcile external data with multiple signals such as code, country, name, coordinates, type, and
  current value. Record provenance for every proposal.
- Use confidence classes with explicit criteria. Keep uncertain, conflicting, or unresolved rows in
  a review file; never silently guess.
- Treat placeholders such as `XXX` or `UTC` according to the field's domain semantics, not as a
  blanket null conversion.
- Prefer official sources for authoritative codes. Clearly label lower-confidence secondary-source
  or inferred matches.

## Produce reviewable artifacts

- Create a uniquely named task directory under the report root designated by the user. If none is
  supplied, use a `codex_ddb_report` directory beside the source database and report its path.
- Keep final artifacts such as:
  - a Markdown audit summary;
  - accepted fixes CSV;
  - manual-review and unresolved CSVs;
  - source/provenance columns and confidence/reason fields;
  - one or more standalone SQL patches.
- Remove downloaded datasets, temporary scripts, staging exports, and intermediate files that are
  only needed for processing. Do not remove final evidence or backups.
- Report exact output paths and concise row counts by confidence/status.

## Generate defensive SQL

- Sort values deterministically and escape SQL literals.
- Wrap changes in a transaction when appropriate.
- Match the full stable key and add a current-value predicate so the patch cannot overwrite data
  that drifted after the audit.
- Keep high-confidence fixes and opt-in review fixes in separate patches unless the user asks for a
  combined file.
- Exclude unresolved rows. Include low-confidence rows only when the user explicitly requests them.
- Validate proposal counts, distinct keys, invalid values, unchanged values, and source drift with
  read-only queries before handoff.

## Handle foreign-key rebuilds cautiously

- Remember that a DuckDB update may be implemented as delete/insert and can fail when referenced.
- When asked for a rebuild script, derive the real table names and dependency order from the schema.
- Export referencing tables first, verify backup row counts, then drop children before parents.
- Apply parent fixes, recreate parents before children, restore data, and verify counts before commit.
- Use an external durable backup for large tables and keep it after the script completes until the
  user verifies the database.
- Do not execute the rebuild script unless the user explicitly asks for execution and authorizes the
  destructive scope.

## Final verification

- Confirm every source-open command retained read-only access.
- Re-run row counts and key uniqueness checks from final CSV/SQL artifacts.
- Confirm the source database modification time and content were not changed by the audit when a
  reliable before/after check is available.
- State what was authoritative, inferred, manually reviewable, and unresolved.
- State explicitly that generated SQL was not executed and the source database was not modified.
