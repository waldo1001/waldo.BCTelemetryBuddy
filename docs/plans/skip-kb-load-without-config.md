---
topic: skip-kb-load-without-config
status: done
created: 2026-04-15
---

## Task
Stop the MCP server from creating `.vscode/.bctb/kb-cache/community-articles.json` in workspaces that have no BCTB configuration.

## Scope boundary
- IN: Gate `KnowledgeBaseService.loadAll()` in [packages/mcp/src/mcpSdkServer.ts](packages/mcp/src/mcpSdkServer.ts) so it only runs when a `.bctb-config.json` was actually discovered (`loadConfigFromFile` returned non-null).
- OUT: Any change to `KnowledgeBaseService` itself, extension KB status bar, or KB webview refresh behavior (those are user-initiated).

## Files to create / touch
- packages/mcp/src/mcpSdkServer.ts — track whether fileConfig was found; skip KB eager load + cache write when absent.
- packages/mcp/src/__tests__/mcpSdkServer.test.ts (or nearest existing test file) — add a RED test for the new gate.

## Interface
No public API change. Internal behavior: when `loadConfigFromFile(...)` returns null (no workspace config), `kbService.loadAll()` is not called and `toolHandlers.knowledgeBase` stays unset. `get_knowledge` will return its normal "KB not loaded" path.

## Dependencies
- `loadConfigFromFile` — already returns null when no config file found.
- `KnowledgeBaseService.loadAll` — unchanged.

## RED test list
- AC1: When `loadConfigFromFile` returns null, `mcpSdkServer` startup does NOT invoke `KnowledgeBaseService` (and therefore no cache file is written).
  - test file: packages/mcp/src/__tests__/mcpSdkServer.test.ts (create if missing; otherwise colocate with existing startup test)
  - test name: "does not eager-load KB when no workspace BCTB config exists"
  - seams touched: none (mock `loadConfigFromFile` + `KnowledgeBaseService` constructor)
  - edge cases: config file present but invalid → KB still loads (unchanged); config file missing → KB skipped.
- AC2: When `loadConfigFromFile` returns a config, KB load is still attempted (regression guard).
  - test name: "eager-loads KB when workspace BCTB config is present"

## Telemetry (Rule 13)
No new user-facing tool or command. MCP startup already emits its own logs; no new `trackEvent` required. (Rule 13 applies to new features/tools; this is a bug fix gating existing behavior.)

## Open questions / assumptions
- Assumption: The only reason the KB cache file appears in unrelated workspaces is the unconditional eager load at [packages/mcp/src/mcpSdkServer.ts:227-240](packages/mcp/src/mcpSdkServer.ts#L227-L240). Verified: that is the only code path in MCP that writes `community-articles.json`.
- Assumption: It is acceptable for `get_knowledge` to return empty/"not loaded" when MCP starts in an unconfigured workspace — the user is not using BCTB there anyway.

## Risks
- If a user intentionally runs MCP against env-var config only (no file), this change stops the KB from loading. Mitigation: gate on `fileConfig !== null` specifically, matching the "no config file in workspace" case the user reported; env-var-only flows still hit `loadConfig()` path and will now skip KB. If that turns out to matter, a follow-up can add an explicit `knowledgeBase.enabled` opt-in.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - No public API, tool schema, config key, or on-disk format changes. Only gates an internal eager-load.
  - Existing workspaces with a valid `.bctb-config.json` see identical behavior (KB still loads, cache still written).
  - Workspaces *without* a BCTB config stop getting `.vscode/.bctb/kb-cache/community-articles.json` created — this is the intended user-visible change.
- **Who/what could break:** A user relying on MCP being started with env-var-only config (no file) AND expecting the community KB to populate. In that edge case, `get_knowledge` will return empty until they add a config file. No saved queries, tool schemas, or telemetry pipelines affected.
- **Detection:** New unit test (AC1) fails if the gate regresses; a regression in the "config present" path is caught by AC2. Post-merge, a user report of "get_knowledge returns nothing in a configured workspace" would be the signal.

No version bump or CHANGELOG "BREAKING" entry required. A normal patch release note ("fix: don't create KB cache in workspaces without BCTB config") is sufficient.

## Out-of-scope follow-ups
- Consider making KB eager-load opt-in via `knowledgeBase.enabled` even when a config file is present, so users can disable entirely.
- Consider cleaning up stale `.vscode/.bctb/kb-cache/` directories that were already created in unrelated workspaces (one-shot cleanup command).
