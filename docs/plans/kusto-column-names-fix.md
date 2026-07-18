---
topic: kusto-column-names-fix
status: approved
created: 2026-07-18
spec: spec-lite
---

# Plan: fix null column names from the App Insights v1 query API

## Spec-lite
- Intent: `parseResult` maps `col.columnName`, but the App Insights v1 API (`api.applicationinsights.io/v1/apps/{app}/query`) returns columns as `{name, type}` — so `columns` is `[null × N]` for every query in production today. Discovered by the PR #108 smoke test (empty CSV header row); confirmed live on the released server.
- **AC1:** Given a v1-API-shaped response (`columns: [{name, type}]`), When `parseResult` runs, Then `columns` contains the real column names.
- **AC2:** Given a Kusto-native-shaped response (`columns: [{columnName, dataType}]`), When `parseResult` runs, Then behavior is unchanged (both shapes supported).
- Eligibility: bugfix, blast radius safe.

## Task
Make `parseResult` column-name mapping tolerant to both API response shapes.

## Scope boundary
- IN: `packages/shared/src/kusto.ts` line ~208 mapping + `KustoColumn` interface note; regression tests for both shapes.
- OUT: any change to row parsing, endpoints, or the PR #108 branch (it inherits the fix by merging main).

## Files to create / touch
- `packages/shared/src/kusto.ts` — `map(col => col.columnName ?? col.name ?? '')`; interface gains optional `name`
- `packages/shared/src/__tests__/kusto.test.ts` — RED test with v1-shaped columns; keep/add columnName-shape case

## Interface
No public surface change — `columns: string[]` finally contains what it always claimed to.

## Dependencies
None beyond existing kusto module.

## RED test list
- AC1: kusto.test.ts — "parseResult maps v1 API column names ({name, type} shape)" — currently RED (returns nulls)
- AC2: kusto.test.ts — "parseResult maps Kusto-native column names ({columnName} shape)" — guards no regression

## Telemetry (Rule 13)
None — bug fix in existing parsing path, no new feature surface.

## Open questions / assumptions
- Assumption: no consumer depends on `columns` being null (they can't — nulls carry no information).

## Risks
- Consumers that positionally index rows are unaffected; consumers that render `columns` (results webview, PR #108 CSV) silently improve.

## Blast radius / breakage prediction
- **Rating:** `safe`
  - One-line mapping fix + tests; output goes from `[null…]` to real names — strictly more information, no shape change.
  - Rollback = revert one commit.
- **Who/what could break:** none identified; MCP tool consumers and the extension webview only gain populated headers.
- **Detection:** the two new unit tests; PR #108 smoke re-run shows a populated CSV header; inline `query_telemetry` responses show real `columns`.

## Out-of-scope follow-ups
- Merge main into PR #108 branch after this lands so its CSV headers populate (one command).
