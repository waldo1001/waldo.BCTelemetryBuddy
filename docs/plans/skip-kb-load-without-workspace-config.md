---
topic: skip-kb-load-without-workspace-config
status: done
created: 2026-04-15
---

## Task
Fix the v3.3.11 KB gate: skip KB eager-load when the **workspace** has no `.bctb-config.json`, even if `loadConfigFromFile` fell back to `~/.bctb/config.json`.

## Scope boundary
- IN: Replace the `hasConfigFile` gate in [packages/mcp/src/mcpSdkServer.ts](packages/mcp/src/mcpSdkServer.ts) with a direct `fs.existsSync(path.join(resolvedConfig.workspacePath, '.bctb-config.json'))` check. The home-dir fallback for `loadConfigFromFile` is preserved for everything else (auth, tool execution) — only KB eager-load is gated on workspace-local config.
- OUT: Changing `loadConfigFromFile` fallback order; changing how `workspacePath` is resolved; extension KB webview refresh (user-initiated, already fine).

## Files to create / touch
- packages/mcp/src/mcpSdkServer.ts — replace the `hasConfigFile` helper parameter with a workspace-local check.
- packages/mcp/src/__tests__/kb-load-gate.test.ts — update tests: new case "skips KB when config came from home dir (workspace has no .bctb-config.json)".

## Interface
`maybeLoadKnowledgeBase(resolvedConfig, hasWorkspaceConfig)` — renamed parameter. The caller computes `hasWorkspaceConfig` as `fs.existsSync(path.join(resolvedConfig.workspacePath, '.bctb-config.json'))` after config resolution.

## Dependencies
- `fs.existsSync`, `path.join` (node built-ins).
- No new services.

## RED test list
- AC1: When the workspace directory has no `.bctb-config.json`, `maybeLoadKnowledgeBase` returns null — even if `resolvedConfig` is a valid config object (as it would be after a home-dir fallback).
  - test file: packages/mcp/src/__tests__/kb-load-gate.test.ts (extend existing)
  - test name: "does not eager-load KB when workspace has no .bctb-config.json (home-dir fallback scenario)"
  - seams touched: fs (mock fs.existsSync)
  - edge cases: workspacePath unset → treat as missing.
- AC2: When the workspace directory contains a `.bctb-config.json`, KB loads as before (regression guard).
  - test name: "eager-loads KB when workspace has a .bctb-config.json"

## Telemetry (Rule 13)
No new event — this is a gate correction on an existing path.

## Open questions / assumptions
- Assumption: The user's unrelated-workspace problem is caused specifically by the home-dir fallback hitting `~/.bctb/config.json` (they have one). Verified: `loadConfigFromFile` lines 208-218 fall back to `~/.bctb/config.json` or `~/.bctb-config.json`, and `workspacePath` is then set from `BCTB_WORKSPACE_PATH` / `process.cwd()` (lines 267, 293), so the KB cache lands in the current workspace.
- Assumption: A workspace-local `.bctb-config.json` is the only signal the user cares about for "this is a BCTB workspace". If a user intentionally uses only a home-dir config, they lose community KB caching until they add a workspace file. (Same trade-off framing as v3.3.11 but now correctly scoped.)

## Risks
- If a user deliberately runs BCTB in home-dir-only mode and relies on community KB being cached into the current directory, they'll see an empty KB in `get_knowledge` until they add a workspace config file. This is the same trade-off as v3.3.11 — just now applied to the right signal.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Single-file change, pure control-flow. No tool schemas, config keys, or on-disk formats touched.
  - The fix tightens an existing gate; it does not widen surface area.
  - Workspaces with a local `.bctb-config.json` see **no** behavior change — KB still loads and caches.
- **Who/what could break:** Users running MCP via a home-dir config *without* any workspace file who expected community KB to be cached somewhere. They'll get empty `get_knowledge` until they add a workspace config. No saved queries, tool schemas, telemetry pipeline, or extension code affected.
- **Detection:** New unit test (AC1) fails if the gate regresses; AC2 catches a workspace-local regression. Post-merge, a user report of "get_knowledge empty in a workspace that has .bctb-config.json" would be the signal.

Patch release (v3.3.12). No CHANGELOG BREAKING entry, no version-bump beyond patch.

## Out-of-scope follow-ups
- Consider removing the `~/.bctb/config.json` home-dir fallback entirely (separate discussion — it's load-bearing for CLI use without a workspace).
- Cleanup of stale `kb-cache/` directories already written to unrelated workspaces (still out-of-scope; manual deletion).
