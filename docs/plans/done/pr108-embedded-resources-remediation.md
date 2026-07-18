---
topic: pr108-embedded-resources-remediation
status: done
created: 2026-07-18
spec: docs/specs/131-query-telemetry-embedded-resources.md
---

# Plan: remediate PR #108 (query_telemetry embedded resources) to green

## Spec
- Spec file: docs/specs/131-query-telemetry-embedded-resources.md (status must be `approved` before execution)
- AC IDs covered by this cycle: AC1–AC8 (all)

## Task
Bring PR #108 to a mergeable, spec-conformant, fully green state by pushing a conflict-resolving merge plus spec-driven amendments to the contributor's branch (maintainerCanModify=true), preserving DmitryKatson's authorship.

## Scope boundary
- IN: merge main into `claude/pull-latest-changes-G1GZS` using the already-tested resolution (verified: full suite 3/3 packages green in a throwaway worktree); amendments for AC6 (mtime-based cleanup), AC7 (`bctb://` URI in embedded resource block, no `file://` paths), AC8 (telemetry ID `TB-MCP-113`→`TB-MCP-117`, already in resolution; fix CHANGELOG mention), `.gitignore` exports entry (already in resolution), replace the brittle source-scrape capabilities test with a real assertion, CHANGELOG Unreleased-section ordering; PR body update (`Closes #131`, Spec line).
- OUT: size caps/truncation for large exports (spec non-goal, follow-up issue); resources for other tools; any change to the inline-text default path.

## Files to create / touch
- `packages/shared/src/exports.ts` — birthtime→mtime (AC6); `bctb://exports/{filename}` as the emitted `fileUri` (AC7)
- `packages/shared/src/__tests__/exports.test.ts` — adjust cleanup + URI expectations (RED first)
- `packages/mcp/src/mcpSdkServer.ts` — merged resolution (imports, capabilities, resource template, tool callback, startup)
- `packages/mcp/src/__tests__/mcp-sdk-server.test.ts` — replace source-scrape test with capabilities assertion; URI assertion for the resource block
- `packages/mcp/src/tools/toolHandlers.ts` + `toolDefinitions.ts`, `packages/shared/src/telemetryEvents.ts`, `.gitignore`, `packages/mcp/CHANGELOG.md`, docs logs — merged resolution
- No changes land in this repo's working tree: all work happens in the throwaway worktree and is pushed to the fork branch.

## Interface
`query_telemetry` gains optional `resultFormat: 'text'|'resource'` and `fileFormat: 'json'|'csv'` (already in PR). No other public surface changes.

## Dependencies
`@modelcontextprotocol/sdk` ^1.26.0 (same on both sides, verified); `ExportService` (new, from the PR); existing telemetry seam.

## RED test list
AC IDs are the spec's. The PR's existing tests already cover AC1–AC5 (all green in the resolved worktree). New/changed, RED first:
- AC6: exports.test.ts — cleanup uses `mtimeMs`; test sets `birthtimeMs: 0` to simulate Linux filesystems
- AC7: mcp-sdk-server.test.ts — embedded resource block URI matches `^bctb://exports/`; exports.test.ts — `fileUri` is `bctb://` form
- AC5 (test-quality fix): replace `toContain('resources: {}')` source-scrape with an assertion on the McpServer constructor's capabilities argument

## Telemetry (Rule 13)
`RESOURCE_EXPORTED: 'TB-MCP-117'` (renumbered from the PR's colliding `TB-MCP-113`), tracked as `Mcp.ResourceExported` with `{toolName, profileHash, fileFormat, rowCount, columnCount}` — no paths, no raw data. Covered by AC8 test.

## Open questions / assumptions
- Assumption: merging main into the PR branch (not rebasing) — standard for fork PRs, preserves the contributor's history.
- Assumption: I approve the fork PR's CI run via API after pushing; if that fails, the maintainer clicks "Approve and run".

## Risks
- The `bctb://` URI change could break a client that resolved the `file://` URI directly — accepted: the feature is unreleased, and `file://` leaking absolute paths is the bigger defect.
- Fork-push rejection if the contributor force-pushed meanwhile — re-fetch and redo on the fresh head.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Feature is opt-in (`resultFormat` defaults to `text`); AC1 pins the default path byte-compatible.
  - Full suite (shared+mcp+extension) already green on the resolved merge in an isolated worktree.
  - Changes land on the PR branch, not main — main is untouched until the PR merges through normal review + CI.
- **Who/what could break:** MCP tool consumers (only if they opt into `resultFormat: 'resource'`); CI on the PR (visible, not harmful); nothing on main.
- **Detection:** PR CI (all jobs + spec-check with `Closes #131`), the new AC6/AC7 tests, and `Mcp.ResourceExported` telemetry once released.

## Out-of-scope follow-ups
- Follow-up issue: export size caps/truncation + host-side by-reference handling.
- Consider surfacing exports via `resources/list` pagination if files accumulate.
