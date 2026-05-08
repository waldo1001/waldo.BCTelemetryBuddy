---
topic: kb-webview-multiroot-path
status: done
created: 2026-05-08
completed: 2026-05-08
---

## Task
Fix the "Manage Knowledge Base" webview (and the latent HTTP-MCP `getWorkspacePath()` helper) so they pick the workspace folder that actually contains `.bctb-config.json` in a multi-root workspace, instead of always returning `folders[0]`.

## Scope boundary
- IN: Migrate two call sites in `packages/extension/src/` from `vscode.workspace.workspaceFolders?.[0]` to the existing `findConfigWorkspace()` helper:
  1. `KnowledgeBaseProvider._getWorkspacePath()` at [packages/extension/src/webviews/KnowledgeBaseProvider.ts:121-124](packages/extension/src/webviews/KnowledgeBaseProvider.ts#L121-L124) — fixes the empty-KB-after-refresh symptom.
  2. `getWorkspacePath()` at [packages/extension/src/extension.ts:901-904](packages/extension/src/extension.ts#L901-L904) used by `startMCP()` for the HTTP MCP server cwd / `BCTB_WORKSPACE_PATH` — latent bug for command-palette features in multi-root workspaces.
- IN: New telemetry property `multiRootResolved` on the existing `KB_PANEL_OPENED` event, recording whether the chosen folder was the first one (`'false'`) or a later one (`'true'`) — measurable signal for whether the fix matters in the wild.
- OUT: Stdio MCP startup ([extension.ts:706](packages/extension/src/extension.ts#L706)) — already uses `findConfigWorkspace`. Issue 1 (KB nudge — separate plan). Webview UX changes, refresh logic, GitHub fetch behavior, cache-shape changes, KB content. Cleanup of any orphaned `App/.vscode/.bctb/kb-cache/` directories left by the bug (manual deletion).

## Files to create / touch
- packages/extension/src/webviews/KnowledgeBaseProvider.ts — replace `_getWorkspacePath()` body with a call to `findConfigWorkspace()`; add the import. The method's return contract (`string | undefined`) is unchanged.
- packages/extension/src/extension.ts — replace `getWorkspacePath()` body with a call to `findConfigWorkspace()`. The function's return contract (`string | undefined`) is unchanged.
- packages/extension/src/__tests__/knowledgeBaseProvider-multiroot.test.ts (new) — RED tests covering the webview path resolution.
- packages/extension/src/__tests__/extension-getWorkspacePath.test.ts (new) — RED test covering the `extension.ts` helper, isolated from the rest of `activate()`.

## Interface
- `KnowledgeBaseProvider._getWorkspacePath()` — no signature change; behavior change only.
- `getWorkspacePath()` (in extension.ts) — no signature change; behavior change only.
- `findConfigWorkspace()` — already exists, already exported from `services/workspaceFinder.ts`, already covered by tests in `__tests__/workspaceFinder.test.ts`. No change.

## Dependencies
- Existing `findConfigWorkspace()` helper at [packages/extension/src/services/workspaceFinder.ts](packages/extension/src/services/workspaceFinder.ts).
- Existing test scaffolding pattern in [packages/extension/src/__tests__/workspaceFinder.test.ts](packages/extension/src/__tests__/workspaceFinder.test.ts) (mocks `vscode.workspace.workspaceFolders` and `fs.existsSync`).

## RED test list
- AC1: In a multi-root workspace where `.bctb-config.json` lives in the **third** folder, `KnowledgeBaseProvider._loadArticleData()` reads the cache and local KB from that third folder — not from `folders[0]`.
  - test file: packages/extension/src/__tests__/knowledgeBaseProvider-multiroot.test.ts
  - test name: "loads articles from the workspace folder containing .bctb-config.json (multi-root)"
  - seams touched: vscode (mock workspaceFolders), fs (mock existsSync + readFileSync for cache JSON and a knowledge dir)
  - edge cases: cache file in folder[2] has 4 articles → returned; folder[0] has nothing → not read.

- AC2: In a single-root workspace (no multi-root), `_loadArticleData()` still reads from that single folder. Regression guard for the common case.
  - test name: "loads articles from the single workspace folder when only one is open"

- AC3: When NO workspace folder contains `.bctb-config.json`, `_loadArticleData()` falls back to `folders[0]` (matches `findConfigWorkspace`'s documented fallback).
  - test name: "falls back to first folder when no .bctb-config.json is present in any folder"

- AC4: When no workspace is open at all, `_loadArticleData()` returns `noWorkspace: true`. Regression guard.
  - test name: "returns noWorkspace when no folders are open"

- AC5: `_refreshFromGitHub()` writes the cache into the *config-bearing* folder, not `folders[0]`. (Verifies the fix propagates beyond initial load into the refresh path.)
  - test name: "refresh writes cache into the workspace folder containing .bctb-config.json"
  - seams touched: vscode (workspaceFolders), KnowledgeBaseService (mock `loadAll` to capture constructor args).
  - assertion: `KnowledgeBaseService` is constructed with the third folder's path, not the first.

- AC6: `getWorkspacePath()` (the standalone helper in `extension.ts`) returns the config-bearing folder in a multi-root workspace.
  - test file: packages/extension/src/__tests__/extension-getWorkspacePath.test.ts
  - test name: "returns the workspace folder containing .bctb-config.json in a multi-root workspace"
  - seams touched: vscode (workspaceFolders), fs (existsSync).
  - note: requires exporting `getWorkspacePath` from `extension.ts` (currently file-private). Either export it or extract it into `services/workspaceFinder.ts` as a thin wrapper. Plan choice: extract. See "Open questions".

- AC7: `getWorkspacePath()` returns the only folder in a single-root workspace, and `undefined` when no workspace is open. Regression guards bundled together.
  - test name: "single-root and no-workspace behavior unchanged"

## Telemetry (Rule 13)
- No new event ID — this fix is a correction on existing call sites, not a new feature.
- Add one property to the existing `KB_PANEL_OPENED` event (`TB-EXT-xxx`, already defined): `multiRootResolved: 'true' | 'false' | 'singleRoot'`. Lets us measure post-merge how often the fix actually matters in user workspaces.
- Property is set in `KnowledgeBaseProvider.show()` right after computing `workspacePath`; no PII, just a structural flag.

## Open questions / assumptions
- Q: Export the existing `getWorkspacePath()` from `extension.ts`, or extract it into `services/workspaceFinder.ts`? **Plan choice:** extract — call it `getActiveWorkspacePath()` in `workspaceFinder.ts`, and make the existing `extension.ts` function a one-line forwarder (or delete the forwarder and update its three callers). Cleaner test isolation; consistent with how `findConfigWorkspace` already lives there.
- Assumption: `findConfigWorkspace()`'s fallback to `folders[0]` when no folder has a config file is the desired behavior for AC3. Verified — it matches the helper's documented contract and what existing callers (`profileManager`, `telemetryService`) already rely on.
- Assumption: The webview `_handleOpenArticle()` path (which uses `workspacePath` to resolve local-article files at [KnowledgeBaseProvider.ts:343](packages/extension/src/webviews/KnowledgeBaseProvider.ts#L343)) is fine to migrate as a side-effect of the `_getWorkspacePath()` change — those local files live in the same config-bearing folder. No separate AC needed; covered by AC1's mocked filesystem.

## Risks
- Extension users with a multi-root workspace whose `.bctb-config.json` is in `folders[0]` see no change (the common case). Users whose config is in `folders[1+]` see the webview suddenly start showing their KB — a *behavior change* but a corrective one (the previous behavior was the bug).
- Test 5 depends on intercepting `KnowledgeBaseService` construction. Use a Jest module-level mock of `@bctb/shared` rather than touching the real service.
- `getActiveWorkspacePath()` extraction touches more than the two original call sites if other code in `extension.ts` uses the file-private `getWorkspacePath()`. Mitigation: grep all callers and migrate them in the same change (in-scope — they're all the same bug).

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Two call-site migrations to a helper that already exists and is already tested. The behavior change is limited to multi-root workspaces with a config file outside `folders[0]` — a corrective change, not a feature.
  - No tool schemas, MCP wire formats, config keys, cache file shapes, telemetry event IDs, or saved-query formats are touched.
  - Single-root workspaces (the dominant case) see byte-for-byte identical behavior.
- **Who/what could break:**
  - Extension users in a contrived multi-root setup who *intentionally* relied on the buggy behavior (e.g. KB cache landing in `folders[0]` while their config sat in `folders[2]`). No realistic case for this — the resulting cache was orphaned.
  - File-private `getWorkspacePath()` callers inside `extension.ts` if extraction is incomplete. Detection: TypeScript compile error if any caller is missed.
  - HTTP MCP server: now starts in the correct cwd in multi-root setups. Possible side-effect: queries that *implicitly* relied on `folders[0]` being the cwd may resolve relative paths differently. Mitigation: search for `cwd`-relative path usage in MCP startup; none found in initial sweep, but verify in implementation.
- **Detection:**
  - Regression: AC2 (single-root) and AC4 (no workspace) catch the common-case regressions.
  - Multi-root regression: AC1, AC3, AC5, AC6 cover the new behavior.
  - User-visible signal: if a user reports "KB panel went empty after upgrade", check `KB_PANEL_OPENED.multiRootResolved` — should be `'true'` for them.

Patch release of the extension (`v3.3.13`-equivalent on the extension's own version line — the extension uses `v3.x.x` tags per CLAUDE.md). No CHANGELOG BREAKING entry.

## Out-of-scope follow-ups
- Cleanup of orphaned `<folder[0]>/.vscode/.bctb/kb-cache/` directories already written by the buggy refresh path on user machines. Manual deletion only — too fragile to automate, low-stakes if left.
- Audit any remaining `workspaceFolders?.[0]` usages elsewhere in the extension (initial sweep flagged ~10 hits in [extension.ts](packages/extension/src/extension.ts); most are config-discovery paths that already check before use, but a separate audit plan would be worth writing if a third bug surfaces).
- Issue 1 KB nudge — separate plan: [kb-nudge-on-pre-query-tools.md](docs/plans/kb-nudge-on-pre-query-tools.md).
