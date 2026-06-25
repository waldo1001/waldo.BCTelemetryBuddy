---
topic: mcp-workspace-knowledge-discovery
status: done
created: 2026-06-25
---

# Host-agnostic workspace & knowledge discovery for the MCP server

## Context

When the bctb MCP server is launched by the VS Code extension it correctly loads the workspace `.bctb-config.json` and `.vscode/.bctb/knowledge`. Under any non-VS-Code host (Claude Code, Cursor CLI, raw stdio, CI) it loads only the global `--config` file, serves global profiles, and reports **"Knowledge Base is not available"** — silently, because telemetry queries still succeed.

**Root cause (verified):** The extension sets `BCTB_WORKSPACE_PATH`; other hosts don't. Both config shapes default `workspacePath` to `process.env.BCTB_WORKSPACE_PATH ?? process.cwd()` ([config.ts:267](../../packages/mcp/src/config.ts#L267), [config.ts:293](../../packages/mcp/src/config.ts#L293)). So even when `--config` points at the workspace config, `configFilePath` is set correctly but `workspacePath` resolves to the host's cwd (a sibling folder). [maybeLoadKnowledgeBase](../../packages/mcp/src/mcpSdkServer.ts#L43-L68) then checks `<cwd>/.bctb-config.json`, finds nothing, returns `null` silently, and [get_knowledge](../../packages/mcp/src/tools/toolHandlers.ts#L342-L347) returns a bare "not available" message with no diagnostics. A literal `${workspaceFolder}` token in config also resolves to cwd outside VS Code ([config.ts:354-364](../../packages/mcp/src/config.ts#L354-L364)).

**Outcome:** the server discovers its workspace host-agnostically — via the loaded config file's directory, via an unexpanded-token guard, and via the MCP **roots** capability — so workspace knowledge loads under any compliant host, and when it genuinely can't, the failure is loud and actionable.

## Task
Make the MCP server resolve its workspace (and therefore knowledge/cache/queries) without depending on VS-Code-only `${workspaceFolder}` expansion or `BCTB_WORKSPACE_PATH`.

## Scope boundary
- **IN:** S2 config-dir anchoring; S3 unexpanded-token guard; S1 MCP-roots fallback discovery; loud diagnostics in KB load + `get_knowledge`; 2 new telemetry events; README note for `BCTB_WORKSPACE_PATH` / per-project `.mcp.json` (S4/S5 as docs).
- **OUT:** Roots discovery swapping the active **connection/profile** (conservative by design — a client-supplied root must not silently retarget which App Insights resource is queried; cross-tenant risk). HTTP-transport changes (roots is stdio-only; HTTP keeps its own VS Code workspace awareness). Changing the VS Code extension's env-injection path.

## Files to create / touch
- `packages/mcp/src/config.ts` — add `resolveWorkspacePath()`; replace the two inline `workspacePath` expressions.
- `packages/mcp/src/mcpSdkServer.ts` — change `maybeLoadKnowledgeBase` return shape; add exported `discoverWorkspaceViaRoots()`; wire `oninitialized`; emit `WORKSPACE_RESOLVED`.
- `packages/mcp/src/tools/toolHandlers.ts` — actionable `get_knowledge` unavailable message; new public `kbSkipReason`; add `kbSkipReason`/`resolvedVia` to the existing trackEvent.
- `packages/shared/src/telemetryEvents.ts` — `WORKSPACE_RESOLVED = 'TB-MCP-003'`, `ROOTS_DISCOVERY = 'TB-MCP-004'`.
- Docs: `README.md` / MCP setup docs — `BCTB_WORKSPACE_PATH` override + per-project `.mcp.json` launch pattern.

## Interface
```ts
// config.ts
export function resolveWorkspacePath(
  rawWorkspacePath: string | undefined,
  configFilePath: string | null
): { path: string; via: 'explicit' | 'env' | 'config-dir' | 'cwd'; tokenStripped: boolean }
```
Resolution order (env first, to keep VS Code byte-identical):
1. `BCTB_WORKSPACE_PATH` (if set and not a `${...}` token) → `env`
2. `rawWorkspacePath` (if set and not a token) → `explicit`
3. `dirname(configFilePath)` (if set) → `config-dir`  ← **the fix**
4. `process.cwd()` → `cwd`
A candidate still matching `/\$\{[^}]+\}/` is treated as unset (`tokenStripped: true`) and falls through (S3).

```ts
// mcpSdkServer.ts
maybeLoadKnowledgeBase(cfg): Promise<{ service: KnowledgeBaseService | null;
  reason: 'loaded'|'no-workspace-config'|'load-failed'|'no-workspace-path';
  workspaceConfigPath: string }>
export function discoverWorkspaceViaRoots(server, cfg, toolHandlers): Promise<KnowledgeBaseService | null>
```
`get_knowledge` unavailable response gains `message` (with path tried + reason), `workspaceTried`, `resolvedVia` — full paths go only to the model, never telemetry.

## Dependencies
- `@modelcontextprotocol/sdk` 1.26.0 — `McpServer.server` (low-level `Server`), `Server.oninitialized`, `Server.getClientCapabilities()`, `Server.listRoots()` (all confirmed present in installed `.d.ts`).
- Existing `KnowledgeBaseService(workspacePath, kbConfig)`, `initializeServices`, `createCommonProperties` + `cleanTelemetryProperties`.

## Sequencing (S1 integration)
Keep the eager `maybeLoadKnowledgeBase` before `server.connect()` as the **primary** path (after S2 it already succeeds for `--config <workspace>/.bctb-config.json`). If it returns no service, register a one-shot `server.server.oninitialized = () => void discoverWorkspaceViaRoots(...)` **before connect**. `discoverWorkspaceViaRoots`: bail if client doesn't advertise `roots`; `listRoots()` (try/catch, non-fatal); for each `file://` root check `<root>/.bctb-config.json` + `<root>/.vscode/.bctb/knowledge`; first match → construct a new `KnowledgeBaseService`, `loadAll()`, assign `toolHandlers.knowledgeBase`, emit `ROOTS_DISCOVERY`. **Race accepted, not blocked:** the unavailable message is self-healing (tells the model KB is still resolving → retry); the next call finds it populated. Blocking dispatch on a `listRoots` round-trip would add latency to every session and risk a slow-client deadlock.

### Connection vs. knowledge decoupling (precedence rule — user-confirmed)
The loaded config supplies the **connection**; `workspacePath` supplies the **knowledge**. These are independent. Discovery order for config (which connection) is *unchanged* by this plan — and it never hard-errors: missing cwd config falls through to `$BCTB_WORKSPACE_PATH` → `~/.bctb/config.json` → `~/.bctb-config.json`, and total absence yields a soft "Configuration Incomplete" (server still boots). What changes is **where knowledge comes from**, with this precedence:
1. **Eager (config-dir), gated:** load workspace KB from `dirname(configFilePath)` *only when that directory genuinely is a workspace* — i.e. the existing `<workspacePath>/.bctb-config.json` gate passes. This is automatically true when `--config` points at a workspace `.bctb-config.json`, and automatically false when `--config` points at a user/global config (its directory won't contain a file literally named `.bctb-config.json`), so eager correctly skips for the global-config case.
2. **Roots fallback:** when eager loaded nothing, `discoverWorkspaceViaRoots` makes the host's opened workspace the knowledge source — even though the connection came from a user/global config. This is the "roots first, then config-dir" intent: roots is authoritative for knowledge whenever config-dir is not itself a workspace.
3. **Loud unavailable:** if neither yields a knowledge folder, the `get_knowledge` message names the path(s) tried + reason.
An explicit `--config <workspace>/.bctb-config.json` (case 1) wins for *that* workspace and is not second-guessed by roots.

## RED test list
- **AC1** config-dir anchoring: no env, no `workspacePath`, `configFilePath` set → `via:'config-dir'`, path = dirname. (config.test.ts · seams: none · edges: trailing slash, relative configPath)
- **AC2** env wins (VS Code no-regress): `BCTB_WORKSPACE_PATH` set → `via:'env'` even when config-dir differs. (config.test.ts)
- **AC3** explicit absolute `workspacePath` preserved → `via:'explicit'`. (config.test.ts)
- **AC4** token guard: `workspacePath:'${workspaceFolder}'`, no env → `tokenStripped:true`, falls to config-dir. (config.test.ts)
- **AC5** KB-load diagnostics: missing workspace config → `reason:'no-workspace-config'`, correct `workspaceConfigPath`, loud `console.error`. (kb-load-gate.test.ts · fs mock · migrate the 4 existing gate tests to the new `{service,...}` shape)
- **AC6** `get_knowledge` unavailable: `knowledgeBase=null` → message contains path + reason; NO telemetry property value contains `/` or `\`. (knowledge-base-tools.test.ts · telemetry)
- **AC7** roots discovery happy path: caps `{roots:{}}`, `listRoots`→`[{uri:'file:///ws'}]`, fs true for `/ws` → `KnowledgeBaseService` built with `/ws`, `toolHandlers.knowledgeBase` set, `ROOTS_DISCOVERY` `{matched:true,kbLoaded:true}`. (mcp-sdk-server.test.ts · fake low-level Server + fs)
- **AC8** no roots advertised: caps `{}` → returns null, `listRoots` never called. (mcp-sdk-server.test.ts)
- **AC9** eager load succeeded → roots path short-circuits (no second KB construct). (mcp-sdk-server.test.ts)
- **AC10** event IDs `TB-MCP-003/004` exist and are unique. (telemetryEvents test)
- **AC11** connection/knowledge decoupling: config from a user/global path whose dir has NO `.bctb-config.json` → eager returns `reason:'no-workspace-config'` (skipped), then roots loads KB from `/ws`; connection fields unchanged. (mcp-sdk-server.test.ts · fake Server + fs)
- **AC12** no hard error on missing cwd config: `loadConfigFromFile` with no `--config`/env/cwd/home config → returns null (no throw); `validateConfig` returns errors without throwing. (config.test.ts)
- **Seam to add:** export `discoverWorkspaceViaRoots` so it unit-tests against a hand-built fake `Server` independent of `startSdkStdioServer`. Reuse existing `fs.existsSync` + `@bctb/shared` jest mocks; no network.

## Telemetry (Rule 13)
- `TELEMETRY_EVENTS.MCP.WORKSPACE_RESOLVED = 'TB-MCP-003'` — once at startup. Props: `via` (`explicit|env|config-dir|cwd|roots`), `tokenStripped` (bool), `host` (`vscode|other`). Call site: `startSdkStdioServer` after config load.
- `TELEMETRY_EVENTS.MCP.ROOTS_DISCOVERY = 'TB-MCP-004'` — in `discoverWorkspaceViaRoots`. Props: `clientAdvertisedRoots` (bool), `rootsCount` (int), `matched` (bool), `kbLoaded` (bool).
- **No paths/URIs in any property** (security-scan check #6). Tests assert path-free.

## Open questions / assumptions
- Assumption: roots locates knowledge only, never swaps the connection (confirmed conservative choice).
- Assumption: full bundle in one cycle (user-confirmed). `BCTB_WORKSPACE`/`BCTB_CONFIG` aliases NOT added — existing `BCTB_WORKSPACE_PATH` is documented instead.

## Risks
- `oninitialized` is a single assignable hook — if the SDK or other code already sets it, overwriting would drop that handler. Mitigation: confirm it's currently unused (it is) and chain rather than replace if that changes.
- Roots URIs may be non-`file://` (rare) — skip unsupported schemes, count them in `rootsCount`, don't throw.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Env-first ordering in `resolveWorkspacePath` makes the VS Code path byte-identical (`BCTB_WORKSPACE_PATH` always set there). New branches fire only when env is unset and `workspacePath` is unset/token — exactly the broken non-VS-Code case.
  - `get_knowledge` **success** branch untouched; only the already-failing branch gains fields. Roots path only runs when eager load already failed.
- **Who/what could break:** (a) consumers string-matching the exact old "not available" message — additive change, low; (b) for non-VS-Code users the KB/cache location moves from `<cwd>/.vscode/.bctb/...` to `<workspace>/...` — that *is* the fix (old location was the bug; see `docs/plans/done/skip-kb-load-without-workspace-config.md`); (c) telemetry pipeline gains 2 additive event IDs.
- **Detection:** `config.test.ts` + `kb-load-gate.test.ts` fail on any resolution-order regression; disappearance of "Knowledge Base is not available" under Claude Code is the user-visible signal; `WORKSPACE_RESOLVED.via` + `ROOTS_DISCOVERY` in App Insights confirm new paths fire in the field.

## Verification (end-to-end)
1. `npm run test` (root) + `npm run test:coverage` in `packages/mcp` + `packages/shared` — all green, thresholds held.
2. `npm run build` — clean compile.
3. Manual repro: point `--config` at a workspace `.bctb-config.json` whose folder has `.vscode/.bctb/knowledge`, with cwd a sibling folder → `get_knowledge` returns workspace articles (was "not available").
4. Roots path: host advertising roots + `--config` at the *global* file → `get_knowledge` resolves workspace knowledge via roots; stderr `[MCP]` log shows `via:'roots'`.
5. Negative: no workspace anywhere → `get_knowledge` message names the path tried + reason.
6. Phase 8 `security-scan` skill + Phase 9 docs.

## Out-of-scope follow-ups
- Allow roots discovery to also propose/switch the active connection (with explicit user opt-in), if demand appears.
- `BCTB_WORKSPACE` / `BCTB_CONFIG` env aliases if the canonical `BCTB_WORKSPACE_PATH` proves unintuitive.
- **Dependency audit (pre-existing, repo-wide):** `npm audit` reports high-severity advisories in transitive deps of the Azure/Kusto/App-Insights SDKs (`@grpc/grpc-js`, `protobufjs`, `form-data`, `hono`, `fast-uri`). These predate this cycle (no dependency changes here) and shipped in v3.4.1/mcp-v3.5.1. Track a dedicated dependency-bump cycle (`npm audit fix` + regression run) — not a blocker for this change.
