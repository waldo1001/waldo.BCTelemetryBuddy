---
topic: mcp-workspace-connection-discovery
status: done
created: 2026-07-17
---

# Per-workspace connection discovery for the MCP server under Claude Code

## Context

The BC Telemetry Buddy MCP server ignores a customer workspace's own flat `.bctb-config.json`
connection when run under **Claude Code**, so `switch_profile CoeckTelemetry` fails with "Profile
not found" and the only ways to query a customer are bad (pollute the global config, or rewrite
`--config` and restart).

**Why it happens (verified on this machine + in code):**
- Claude Code registers the server **once, globally** (`~/.claude.json`), pinned to
  `--config /Users/waldo/.config/bc-telemetry-buddy-mcp/config.json` (multi-profile) with `env: {}`.
  No per-workspace signal is passed. ([config.ts:228-367](../../packages/mcp/src/config.ts#L228-L367) —
  when `--config` exists, no workspace discovery for the *connection* runs.)
- `switch_profile`/`list_profiles` ([toolHandlers.ts:1258-1423](../../packages/mcp/src/tools/toolHandlers.ts#L1258-L1423))
  only enumerate profiles **inside** the pinned file — they never look at any other folder.
- The VS Code extension "just works" only because it injects `BCTB_WORKSPACE_PATH`
  ([mcpEnvBuilder.ts:33-52](../../packages/extension/src/services/mcpEnvBuilder.ts#L33-L52)); Claude Code injects no such var.
- The server **already** consumes the MCP `roots` capability
  ([mcpSdkServer.ts:116-174](../../packages/mcp/src/mcpSdkServer.ts#L116-L174), commit `f5854d9`, v3.5.2) — but
  **deliberately for Knowledge Base only**. It reads `<root>/.bctb-config.json` and then *discards the
  connection*, by design, so a client root can never **silently** retarget which App Insights resource is
  queried (cross-tenant safety — [mcp-workspace-knowledge-discovery.md:62-67](done/mcp-workspace-knowledge-discovery.md#L62-L67)).
- That same doc lists this exact request as sanctioned follow-up (line 113): *"Allow roots discovery to
  also propose/switch the active connection (with explicit user opt-in)."*

**Layout / naming facts that shape the design:**
- `COECK.code-workspace` lists folders `App`, `Test`, `TelemetryAnalysis`; the config lives at
  `TelemetryAnalysis/.bctb-config.json` — one level below the customer root, a sibling of `App`.
- **9 of 10** customer configs share `connectionName: "iFacto Customers"` (only Coeck differs), and the
  global config already has a `coeck` profile → discovered profiles **cannot** be keyed on `connectionName`.
- Claude Code injects **`CLAUDE_PROJECT_DIR`** (stable, synchronous, at startup) and answers `roots/list`
  (v2.1.203+). It does **not** expand `${workspaceFolder}` in `.mcp.json`; cwd is unreliable.

**Intended outcome:** Under Claude Code, a workspace's own `.bctb-config.json` becomes a **selectable
profile** (`list_profiles` shows it, `switch_profile` selects it) with **no** global-file edit and **no**
restart. A single **opt-in** env flag makes the local config the active connection automatically on open
("local config wins"), while the safe default preserves the cross-tenant guard.

**User decisions (this session):** (1) **Opt-in auto-activate** — default selectable, one env flag
enables auto-activation. (2) **No interim workaround** — build the feature only.

---

## Task
Make a workspace's `.bctb-config.json` connection discoverable and selectable (and optionally
auto-activatable) under Claude Code via `CLAUDE_PROJECT_DIR` + MCP roots, without editing the global config.

## Scope boundary
- **IN:** stdio path only — `config.ts` (2 new pure helpers), `mcpSdkServer.ts` (collect connections
  during roots discovery + gated auto-activate), `toolHandlers.ts` (workspace-profile registry, merge into
  `list_profiles`, select in `switch_profile`, atomic service rebuild, `baseConfigFilePath` fix),
  `telemetryEvents.ts` (`TB-MCP-006` + extend `TB-MCP-004` props), tool descriptions + README/docs.
- **OUT:** the HTTP `MCPServer` in [server.ts](../../packages/mcp/src/server.ts) (VS Code command-palette only;
  no roots, no `CLAUDE_PROJECT_DIR`; leaving it untouched cannot regress VS Code). Changing the VS Code
  extension. Reacting to `roots/list_changed` (one-shot discovery + on-demand re-scan is enough). Deep
  recursive filesystem scans.

## Files to create / touch
- `packages/shared/src/telemetryEvents.ts` — `MCP.WORKSPACE_PROFILE_SWITCH = 'TB-MCP-006'`; add
  `connectionsFound` to the existing `ROOTS_DISCOVERY` (`TB-MCP-004`) props.
- `packages/mcp/src/config.ts` — add `scanDirForWorkspaceConfigs()` and `readWorkspaceConnectionMeta()`
  (pure, additive; reuse `resolveProfileInheritance` at [config.ts:372](../../packages/mcp/src/config.ts#L372)).
- `packages/mcp/src/tools/toolHandlers.ts` — registry + rewritten `listProfiles`/`switchProfile` +
  `detectInitialProfile` anchored to a new captured `baseConfigFilePath`.
- `packages/mcp/src/mcpSdkServer.ts` — collect connections in `discoverWorkspaceViaRoots`; gated
  auto-activate block in `startSdkStdioServer` (+ mirror after the roots loop).
- `packages/mcp/src/tools/toolDefinitions.ts` — extend `list_profiles`/`switch_profile` descriptions.
- Docs: `packages/mcp/README.md`, MCP setup docs; mark the follow-up in
  `docs/plans/done/mcp-workspace-knowledge-discovery.md` as delivered.
- Tests: `packages/mcp/src/__tests__/{toolHandlers,roots-discovery,config,mcp-sdk-server}.test.ts`
  (+ optional new `workspace-profiles.test.ts`). **Note:** `profile-switching.test.ts` tests the HTTP
  class — the stdio ACs go in `toolHandlers.test.ts`.

## Interface
```ts
// config.ts (new, pure)
export function scanDirForWorkspaceConfigs(dir: string): string[];        // <dir>/.bctb-config.json + <dir>/*/.bctb-config.json, bounded, never throws
export interface WorkspaceConnectionMeta {
  isMultiProfile: boolean;
  connectionName?: string; applicationInsightsAppId?: string; authFlow?: string;
  subProfiles?: Array<{ name: string; connectionName?: string; applicationInsightsAppId?: string; authFlow?: string }>;
}
export function readWorkspaceConnectionMeta(configPath: string): WorkspaceConnectionMeta | null; // normalizes BOTH shapes, excludes `_`-profiles, resolves `extends`; no activation side-effects

// toolHandlers.ts (new state + methods)
interface DiscoveredProfile { key; connectionName; applicationInsightsAppId; authFlow; configPath; subProfileName?; source:'workspace'; origin:'claude-project-dir'|'roots'; realpath }
public  workspaceProfiles: Map<string, DiscoveredProfile>;
public  activeProfileSource: 'file' | 'workspace';
private baseConfigFilePath: string | null;               // captured in ctor from config.configFilePath — the pinned/global file
public  ensureWorkspaceProfilesDiscovered(): void;       // idempotent; CLAUDE_PROJECT_DIR (sync). Called by ctor, list_profiles, switch_profile
public  registerWorkspaceConnection(configPath: string, scannedRootDir: string, origin): void; // dedup by realpath+subProfileName; called by roots path too
private deriveWorkspaceProfileKey(scannedRootDir, connectionName, subProfileName, appId, taken): string;
```
`switch_profile`/`list_profiles` tool schemas are unchanged (workspace entries are just more names).

## Dependencies
- `@modelcontextprotocol/sdk` 1.26.0 (`getClientCapabilities`, `listRoots`, `oninitialized` — already used).
- Existing `loadConfigFromFile` (activation), `resolveProfileInheritance`, `validateConfig`,
  service ctors `AuthService/KustoService/CacheService/QueriesService/ReferencesService`
  ([toolHandlers.ts:1308-1312](../../packages/mcp/src/tools/toolHandlers.ts#L1308-L1312)),
  `createCommonProperties`/`cleanTelemetryProperties`/`hashValue` from `@bctb/shared`, `KnowledgeBaseService`.
- Env: `CLAUDE_PROJECT_DIR` (Claude Code), `BCTB_AUTO_WORKSPACE_CONNECTION` (new opt-in, default OFF).

## Design summary
Two discovery sources feed one in-memory registry (`toolHandlers.workspaceProfiles`):
1. **`CLAUDE_PROJECT_DIR`** — synchronous, in the constructor; `scanDirForWorkspaceConfigs` checks the dir
   and **one level down** (catches the `TelemetryAnalysis` subfolder). Race-free.
2. **MCP roots** — `discoverWorkspaceViaRoots` gains a per-root `registerWorkspaceConnection` call
   (KB behavior byte-identical). Async on `oninitialized`; cached.

`list_profiles` merges registry entries (tagged `source:'workspace'`) with the file-based profiles
enumerated from **`baseConfigFilePath`**. `switch_profile` matches file profiles first, then workspace
entries (by key, or by `connectionName` **only when unambiguous**), activates via
`loadConfigFromFile(discovered.configPath, discovered.subProfileName)`, and rebuilds services **atomically**.
Default active connection is **unchanged** by discovery. When `BCTB_AUTO_WORKSPACE_CONNECTION` is truthy
**and exactly one** connection is discovered, `startSdkStdioServer` auto-activates it with a **loud stderr**
line; `>1` → no auto-pick (ambiguous).

**Keying (handles the collisions):** base label = `basename(scannedRootDir)` (the *opened* folder =
customer, e.g. `Coeck` — **not** the shared `TelemetryAnalysis` or `connectionName`); fall back to
`connectionName` if the root basename is generic (`TelemetryAnalysis|src|app|test|workspace|repo`); if still
non-unique among discovered configs (the 9× "iFacto Customers"), append `#<sha256(appId).slice(0,6)>`; if it
collides with a file-based profile name (e.g. global `coeck`) or an assigned key, extend with the appId
suffix. Multi-profile workspace config → one entry per sub-profile keyed `<label>/<subProfileName>`. Dedup
across sources by `fs.realpathSync(configPath)+subProfileName`.

## RED test list
- **AC-W1** `scanDirForWorkspaceConfigs` finds direct + one-level-down, skips `node_modules`/`.git`/dotdirs, `[]` on none. (config.test.ts · none · empty dir, unreadable dir)
- **AC-W2** `readWorkspaceConnectionMeta` flat → conn/appId/authFlow. (config.test.ts)
- **AC-W3** `readWorkspaceConnectionMeta` multi-profile → subProfiles, `_base` excluded, inherited authFlow resolved. (config.test.ts · guards flaw d)
- **AC-W4** `deriveWorkspaceProfileKey`: `Coeck`→`Coeck`; dup root basename→suffixed; collision with file profile `coeck`→suffixed; generic root→connectionName→`#appId` for 9× "iFacto Customers". (toolHandlers.test.ts)
- **AC-W5** `ensureWorkspaceProfilesDiscovered` with `CLAUDE_PROJECT_DIR`=`Coeck/` (config one level down) populates map; 2nd call no dup. (toolHandlers.test.ts · real temp dirs)
- **AC-W6** `list_profiles` merges workspace entries into a **multi-profile** global output, tagged `source:'workspace'`, `isActive:false`, `usage.workspaceConnections` present. (toolHandlers.test.ts)
- **AC-W7** `list_profiles` surfaces workspace entries even when `baseConfigFilePath` is single/flat. (toolHandlers.test.ts)
- **AC-W8** `switch_profile('Coeck')` → activates flat workspace config, services rebuilt, `activeProfileSource:'workspace'`, `config.applicationInsightsAppId` = workspace appId. (toolHandlers.test.ts · auth/kusto/cache/queries)
- **AC-W9** After a workspace switch, `list_profiles` STILL lists global profiles and `switch_profile('bctb-usage')` (global) SUCCEEDS. (toolHandlers.test.ts · **guards severe flaw h**)
- **AC-W10** `switch_profile` by `connectionName`: unambiguous works; ambiguous (two "iFacto Customers") → error, no state change. (toolHandlers.test.ts)
- **AC-W11** Atomicity: a service ctor throws mid-switch → `config`/`activeProfileName`/`activeProfileSource` unchanged. (toolHandlers.test.ts · guards flaw e)
- **AC-W12** `discoverWorkspaceViaRoots` registers connections per root while KB path (existing AC7/AC9/AC11) stays byte-identical; `connectionsFound` in telemetry. (roots-discovery.test.ts)
- **AC-W13** Dedup by realpath: same config via `CLAUDE_PROJECT_DIR` + roots → one entry. (roots-discovery.test.ts)
- **AC-W14** **Connection guard (mirror of AC11 in the KB doc):** flag **unset** → discovery NEVER changes the active connection even with one workspace config; flag **set** + exactly one → switched + loud stderr; flag set + `>1` → NOT switched. (mcp-sdk-server.test.ts / new workspace-autoactivate.test.ts)
- **AC-W15** Discovered **multi-profile** workspace config → one entry per sub-profile; switch passes `subProfileName` (no "No profile specified" throw). (toolHandlers.test.ts · guards flaw d)
- **AC-W16** `TB-MCP-006` exists, unique, `!== TB-MCP-005`. (telemetryEvents test)
- **AC-W17** `TB-MCP-006` + extended `TB-MCP-004` props are **path-free** (no `/` or `\` in any string value — mirror roots-discovery.test.ts:167-181). (roots-discovery.test.ts)

## Telemetry (Rule 13)
- `TELEMETRY_EVENTS.MCP.WORKSPACE_PROFILE_SWITCH = 'TB-MCP-006'` — emitted in `switchProfile` when
  `activeProfileSource==='workspace'`. Props: `origin`, `authFlow`, `wasAmbiguousMatch`, `previousSource`,
  `autoActivated` (bool). **No paths/URIs/GUIDs** — appId only as `hashValue` if included.
- Extend `TELEMETRY_EVENTS.MCP.ROOTS_DISCOVERY = 'TB-MCP-004'` props with `connectionsFound: number`.
- `TB-MCP-005` is **already** `MCP.ERROR` — do not reuse.

## Open questions / assumptions
- **Assumption:** In a multi-root VSCode window Claude Code advertises either the `.code-workspace` root or
  each folder (undocumented). The direct + one-level-down scan covers both; realpath dedup handles overlap.
  If a customer opens **only** `App` (config in a non-advertised sibling), discovery misses it → documented
  fallback: `--config` or `BCTB_WORKSPACE_PATH` (unchanged behavior).
- **Assumption:** `azure_cli` auth ignores `config.tenantId` ([auth.ts:73-127](../../packages/shared/src/auth.ts#L73-L127)) —
  switching retargets the *App Insights resource*, not the identity. `switch_profile` returns a `note` when
  `authFlow==='azure_cli'`; a wrong-tenant identity surfaces as a 403 at query time.

## Risks
- `oninitialized` is a single assignable hook — keep the existing single wiring; don't add a second.
- Plaintext `clientSecret` in a workspace `.bctb-config.json` is a security-scan concern; `validateConfig`
  already flags unset `${ENV}` secrets.
- Auto-activate is an env flag a user could set globally and forget → mitigations below.

## Blast radius / breakage prediction
- **Rating:** `low-risk` overall (the `toolHandlers.ts` hot path is the one **risky** file; the rest are
  safe/additive).
  - `telemetryEvents.ts`, `config.ts` — **safe**: additive id/prop; two new pure exports; no change to
    `loadConfigFromFile`/`resolveWorkspacePath`.
  - `mcpSdkServer.ts` — **low-risk**: KB gate/first-match/short-circuit unchanged (existing
    `roots-discovery.test.ts` AC7-AC11 stay green); connection collection + auto-activate are new branches;
    auto-activate defaults OFF.
  - `toolHandlers.ts` — **risky**: the `baseConfigFilePath` refactor changes post-switch behavior (fixes the
    strand-the-user trap, flaw h) and adds atomic rebuild (flaw e). Existing single-switch tests
    ([toolHandlers.test.ts:999-1133](../../packages/mcp/src/__tests__/toolHandlers.test.ts#L999-L1133)) must stay green; new ACs are the guardrails.
- **Who/what could break:** MCP tool consumers string-matching `list_profiles` shape (additive fields, low);
  anyone depending on the *buggy* post-switch single-mode collapse (that's the bug being fixed); telemetry
  pipeline (2 additive fields). VS Code extension / HTTP path: **safe by exclusion** (untouched).
- **Detection:** unit suites above; in the field, `TB-MCP-006` and `ROOTS_DISCOVERY.connectionsFound` confirm
  new paths fire; user-visible signal = `switch_profile CoeckTelemetry` succeeds under Claude Code where it
  returned "Profile not found", **and** switching back to a global profile still works.
- **Migration / version:** backward compatible; no config/tool/cache format change. Ships as MCP minor bump
  (v3.6.0). No breaking entry required.

### Cross-tenant safety mitigations (auto-activate)
Default OFF · fire only when **exactly one** connection discovered · **loud stderr** naming the connection ·
`list_profiles.currentProfile.source==='workspace-auto'` so the model announces it · **skip** auto-activate
when the single discovered appId already equals the active/global appId (no retarget needed) · README
documents the flag as "I accept that opening a workspace retargets which App Insights resource is queried."
Discovery (registry population) is always side-effect-free; only an explicit `switch_profile` or the opt-in
flag changes the connection.

## Out-of-scope follow-ups
- React to `notifications/roots/list_changed` (currently one-shot + on-demand re-scan).
- `App`-only layout auto-discovery (sibling not advertised as a root) — documented `--config`/`BCTB_WORKSPACE_PATH` fallback for now.
- A dedicated `use_workspace_config` tool if `switch_profile` naming proves unintuitive.
