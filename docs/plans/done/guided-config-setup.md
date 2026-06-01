---
topic: guided-config-setup
status: done
created: 2026-06-01
---

## Context

Today, setting up a BC Telemetry Buddy connection requires the **VS Code extension's** Setup Wizard webview ([SetupWizardProvider.ts](packages/extension/src/webviews/SetupWizardProvider.ts)) — it validates auth, tests the connection, and writes `.bctb-config.json`. That excludes anyone driving the MCP server from a non-VS-Code client (Claude Code, Cursor, Claude Desktop, plain terminal).

The user wants a setup experience that works **anywhere an agent is connected to the MCP server**, without depending on the extension. The natural, client-agnostic channel already exists: the MCP server registers an MCP **prompt** (`bc-telemetry-workflow`) from [serverInstructions.ts](packages/mcp/src/tools/serverInstructions.ts), advertises `prompts: { listChanged: true }` capability, and **starts even when unconfigured** (`validateConfig` is non-throwing — [mcpSdkServer.ts:259](packages/mcp/src/mcpSdkServer.ts#L259), [config.ts:247](packages/shared/src/config.ts#L247)). So an unconfigured server can still serve a "how to set up" prompt that any MCP client can invoke and execute with its own shell/file tools.

**Outcome:** the user (or any agent) can invoke a `setup-connection` prompt — e.g. in Claude Code as `/mcp__bc-telemetry-buddy-mcp__setup-connection` — and be walked through: auth → discover App Insights endpoints (via `az`, manual fallback) → pick endpoint → pick target workspace folder (multiroot-aware) → write/merge `.bctb-config.json` → advise reload. Two shipped helper scripts make the fiddly steps deterministic. The existing extension surfaces (chat participant, agent file, wizard) gain a pointer "encouraging" this path.

### Cross-client coverage (why prompt AND tool)
MCP **prompt** support is not uniform across clients, but MCP **tool** support is. So the same `SETUP_PROMPT_CONTENT` is delivered two ways:
- **Prompt** `setup-connection` — best UX where supported. ✅ Claude Code (slash command). ⚠️ GitHub Copilot **agent mode** / VS Code native MCP: version-dependent prompt discovery.
- **Tool** `get_setup_guide` — universal fallback. ✅ every MCP client, and it even surfaces to the extension's `@bc-telemetry-buddy` chat participant (which filters `mcp_bc_telemetry__*` tools into `vscode.lm.tools`).

**Execution caveat (stated, not hidden):** running `az` and writing `.bctb-config.json` (via the helper scripts) needs an agent with shell + file access — Claude Code and Copilot **agent mode** have this. The extension **chat participant** does NOT (it cannot create files — platform limitation). From the chat participant, the honest behavior is to relay the steps and point the user to agent mode / the setup prompt — not to claim it performed the setup.

### Decisions locked with the user
- **Prompt/doc + 2 helper scripts** (not pure prose): scripts for (a) endpoint enumeration and (b) safe config merge.
- **`az`-based discovery + manual App-ID fallback**: discovery runs through Azure CLI (works in any shell); if `az` is missing or returns nothing, the user pastes the App ID. The `authFlow` written into the config can still be any of the four — `az` is only the discovery mechanism, not the runtime auth.
- This **supersedes** the earlier extension-side approach (LM tools / `azureResourceService` / `configWriter`). The stale draft at [docs/plans/chat-driven-config-setup.md](docs/plans/chat-driven-config-setup.md) should be deleted at implementation start and this content moved to `docs/plans/guided-config-setup.md`.

## Task
Add a client-agnostic, MCP-prompt-driven connection-setup workflow (backed by a canonical doc + 2 helper scripts), and point the existing extension surfaces at it.

## Scope boundary
- IN:
  - New canonical workflow content `SETUP_PROMPT_CONTENT` + human-readable `docs/setup/connection-setup.md`.
  - New MCP prompt `setup-connection` AND tool `get_setup_guide` (same content), registered alongside `bc-telemetry-workflow` / the existing tools, for cross-client coverage.
  - Two helper scripts shipped in the mcp package: endpoint enumeration + safe `.bctb-config.json` merge.
  - Pointers added to `SERVER_INSTRUCTIONS`, the chat participant prompt, `BCTelemetryBuddy.agent.md`, and a Setup Wizard welcome banner.
  - Usage telemetry for prompt invocation + script runs (Rule 13).
  - Multiroot handled by the workflow/script asking which folder to write into.
- OUT:
  - Removing/relaxing the **webview** wizard's multiroot hard-block (left as-is; the new workflow is the multiroot path).
  - New extension LM tools / `azureResourceService` / `configWriter` TypeScript (explicitly dropped).
  - Changing `.bctb-config.json` schema shape or MCP query tools.
  - Auto-provisioning new App Insights resources.

## Files to create / touch
- CREATE `packages/mcp/src/tools/setupInstructions.ts` — exports `SETUP_PROMPT_CONTENT` (mirrors `WORKFLOW_PROMPT_CONTENT` in [serverInstructions.ts](packages/mcp/src/tools/serverInstructions.ts)).
- CREATE `packages/mcp/scripts/list-endpoints.mjs` — enumerate App Insights components → `[{name, appId, resourceGroup, subscriptionId, tenantId, location}]` via `az` (Resource Graph or per-sub `az monitor app-insights component show`); prints JSON; exits non-zero with a clear message when `az` absent/unauthenticated.
- CREATE `packages/mcp/scripts/write-config.mjs` — given `--folder`, connection fields, optional `--profile`: create single-profile config or merge a named profile into an existing `ProfiledConfig` without clobbering siblings; inject `$schema`; derive `kustoClusterUrl` from subscription; refuse paths outside the target folder.
- CREATE `docs/setup/connection-setup.md` — human-readable mirror of the prompt (the doc the agent/user can read directly).
- TOUCH `packages/mcp/src/mcpSdkServer.ts` — `server.registerPrompt('setup-connection', …)` returning `SETUP_PROMPT_CONTENT`.
- TOUCH `packages/mcp/src/tools/toolDefinitions.ts` + `toolHandlers.ts` — add read-only tool `get_setup_guide` returning `SETUP_PROMPT_CONTENT` (universal-client fallback; also surfaces to the chat participant).
- TOUCH `packages/mcp/src/tools/serverInstructions.ts` — add a short "If the user has no valid config or asks to connect, invoke the `setup-connection` prompt" note.
- TOUCH `packages/mcp/package.json` — ensure `scripts/**` is in `files`/publish set and (optionally) `bin`/`npm run` aliases.
- TOUCH `packages/extension/src/chatParticipant.ts` — `SYSTEM_PROMPT` pointer to the setup prompt/doc (keep the existing "can't create files" note, but tell users to use the agent or run the setup prompt for setup).
- TOUCH `packages/extension/src/agentDefinitions.ts` — add a "Connection Setup" section to `BCTelemetryBuddyAgent` pointing at the prompt/doc + scripts.
- TOUCH `packages/extension/src/webviews/SetupWizardProvider.ts` — welcome-step HTML banner: "Prefer Claude / another editor? Run the `setup-connection` prompt." (HTML copy only; no logic change).
- TOUCH `packages/shared/src/telemetryEvents.ts` — add `TB-MCP-115` (prompt served) and extension `TB-EXT-019` (setup pointer shown), per existing numbering.
- TESTS: `setupInstructions.test.ts` (prompt registered + content invariants), `list-endpoints.test.ts` + `write-config.test.ts` (script behavior with mocked `az`/fs), extend mcpSdkServer prompt-registration test if present.

## Interface
- MCP prompt: `setup-connection` — no args; returns one user-role text message = `SETUP_PROMPT_CONTENT`. (Matches the existing `bc-telemetry-workflow` registration shape at [mcpSdkServer.ts:167](packages/mcp/src/mcpSdkServer.ts#L167).)
- MCP tool: `get_setup_guide` — no args; read-only; returns `SETUP_PROMPT_CONTENT` as text. Universal fallback for clients with weak/no prompt support and for the chat participant.
- `node scripts/list-endpoints.mjs` → stdout JSON array (above shape); non-zero exit + stderr hint on `az`-missing / not-logged-in.
- `node scripts/write-config.mjs --folder <abs> --connectionName <s> --authFlow <flow> --tenantId <guid> --appId <guid> [--kustoClusterUrl <url>] [--clientId <guid>] [--profile <name>]` → writes/merges file, prints `{ filePath, mode }`.
- `SETUP_PROMPT_CONTENT` workflow steps (the prose the agent follows): detect/confirm auth method → (azure_cli) ensure `az login` → run `list-endpoints.mjs` (fallback: ask for App ID) → present endpoints, user picks → determine target folder (list workspace folders; if multiple, ask) → run `write-config.mjs` → tell user to reload window / restart MCP.

## Dependencies
- Existing: MCP SDK `server.registerPrompt`, `WORKFLOW_PROMPT_CONTENT` pattern, `ProfiledConfig`/`MCPConfig` shape ([config.ts](packages/shared/src/config.ts)), `validateConfig` non-throwing start, `bctb.reloadConfig` command, `IUsageTelemetry`.
- External: Azure CLI (`az`) at runtime for discovery — optional, with documented fallback.

## RED test list
- AC1: `setup-connection` prompt AND `get_setup_guide` tool are both registered and return the same non-empty `SETUP_PROMPT_CONTENT`.
  - test file: `packages/mcp/src/tools/__tests__/setupInstructions.test.ts`; seams: none
  - edge cases: content references both the scripts AND the manual fallback; no real GUIDs in content (security-scan); tool is marked read-only.
- AC2: `write-config.mjs` creates a single-profile `.bctb-config.json` when none exists, with `$schema` and derived `kustoClusterUrl`.
  - test file: `packages/mcp/scripts/__tests__/write-config.test.ts`; seams: fs
  - edge cases: refuse path traversal; pretty-printed JSON.
- AC3: `write-config.mjs --profile X` merges into an existing `ProfiledConfig`, preserving other profiles + `defaultProfile`.
  - test name: "adds named profile without clobbering siblings".
- AC4: `list-endpoints.mjs` maps `az` output to `{name, appId, …}` and exits non-zero with a hint when `az` is unavailable/unauthenticated.
  - seams: child_process (mock `az`); edge cases: zero components → empty array + fallback message, multi-subscription, partial 403 skip-and-continue.
- AC5: telemetry fires when the prompt is served and when a setup pointer is shown.
  - seams: telemetry.

## Telemetry (Rule 13)
- `TELEMETRY_EVENTS.MCP_TOOLS.SETUP_PROMPT_SERVED` = `'TB-MCP-115'` — fired in the `setup-connection` prompt handler. Props: none sensitive (just a marker).
- `TELEMETRY_EVENTS.MCP_TOOLS.GET_SETUP_GUIDE` = `'TB-MCP-116'` — fired in the `get_setup_guide` tool handler.
- `TELEMETRY_EVENTS.EXTENSION.SETUP_POINTER_SHOWN` = `'TB-EXT-019'` — when the chat/wizard pointer is surfaced. Props: `surface` (chat|wizard|agent).
- NEVER log appId/tenantId/subscriptionId/account/token (security-scan blocks).

## Open questions / assumptions
- Assumption: scripts are plain `.mjs` run via `node` (no new runtime deps); the doc gives the exact `node …` invocation so any agent shell can run them.
- Assumption: `kustoClusterUrl` is required by `validateConfig` but unused by the App Insights query path ([kusto.ts:61](packages/shared/src/kusto.ts#L61)) — script derives a valid value rather than prompting.
- Assumption: profile name defaults to a slug of `connectionName` unless `--profile` is supplied.
- Q (non-blocking): expose scripts via `npm run`/`bin` aliases, or document the raw `node path/to/script.mjs`? Default: document raw path + add `npm run` aliases for convenience.

## Risks
- `az` enumeration is the fiddliest surface (multi-sub, throttling, partial 403). Mitigation: per-subscription try/catch, skip-and-continue, always-available manual fallback.
- Resolving the script's absolute path from an arbitrary client cwd. Mitigation: doc shows how to locate the installed mcp package path; scripts are self-contained.
- Adding a second prompt slightly enlarges the client's prompt list. Low impact; clearly named/scoped.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Net-new prompt, doc, and scripts; existing MCP tools, prompt, config schema, and on-disk format are unchanged. Edits to existing files are additive (a prompt registration, pointer text, a telemetry constant).
  - `.bctb-config.json` is written in the existing shape; merge logic preserves existing profiles.
- **Who/what could break:** MCP clients see one extra prompt; none of: query tools, saved queries, KB cache, telemetry pipeline (additions only), config readers.
- **Detection:** `setupInstructions.test.ts` asserts registration; `write-config.test.ts` guards config-merge correctness; a regression would show as a corrupted/overwritten config in the merge tests or a missing prompt in the SDK server test.

## Verification (end-to-end)
1. `npm run build && npm test` (all packages) — new RED tests pass.
2. Run the unconfigured MCP in stdio and confirm `prompts/list` includes `setup-connection` and `tools/list` includes `get_setup_guide`; invoke each and confirm identical workflow content. Sanity-check discovery in Claude Code (slash command) and in Copilot agent mode (tool call).
3. In a scratch folder with `az login` done: run `node packages/mcp/scripts/list-endpoints.mjs` → see your App Insights resources; pick one; run `write-config.mjs --folder <scratch> …` → inspect the resulting `.bctb-config.json`; re-run with `--profile second` → confirm both profiles present.
4. Manual-fallback path: temporarily make `az` unavailable → confirm the script exits with the documented hint and the workflow still completes via pasted App ID.
5. In VS Code: confirm the wizard banner + chat/agent pointers render and reference the prompt.
6. Run `/security-scan` before any release (no GUIDs/tokens in new content).

## Out-of-scope follow-ups
- Relax the webview wizard to support multiroot folder selection (separate plan).
- A `setup-create-appinsights` helper to provision a resource when none exists.
- Secret-handling hardening for `client_credentials` (env-var indirection).
