# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

**BC Telemetry Buddy** is a VSCode extension + MCP backend server that enables natural language querying of Microsoft Dynamics 365 Business Central telemetry data from Azure Application Insights using GitHub Copilot.

The project is a **monorepo** with three npm workspace packages:
- `packages/shared/` — Core business logic (auth, Kusto queries, caching, query discovery). Bundled into both other packages.
- `packages/mcp/` — MCP backend server (Express HTTP + MCP SDK stdio). Spawned as a child process by the extension.
- `packages/extension/` — VSCode extension. Manages MCP lifecycle, UI (setup wizard, webviews), and Copilot chat participant (`@bc-telemetry-buddy`).

## Build & Test Commands

```bash
# Root workspace (runs all packages)
npm run build          # Build all packages
npm run test           # Run all tests (Jest)
npm run clean          # Clean dist directories

# Watch-mode development
npm run dev:mcp        # Watch-mode for MCP backend
npm run dev:extension  # Watch-mode for extension

# Per-package (run from packages/mcp or packages/extension or packages/shared)
npm run build          # Build this package
npm run test           # Run Jest tests
npm run test:coverage  # Tests with coverage report (70% threshold enforced)
npm run test:watch     # Watch-mode tests
npm run compile        # TypeScript type-check only

# Extension-specific
npm run package        # Create .vsix for marketplace

# MCP testing with MCP Inspector
npm install -g @modelcontextprotocol/inspector
# Must set env vars manually in the inspector UI — shell env vars are NOT passed to spawned MCP
# Required: BCTB_WORKSPACE_PATH, BCTB_TENANT_ID, BCTB_APP_INSIGHTS_ID, BCTB_AUTH_FLOW, BCTB_KUSTO_CLUSTER_URL
# Run az login --tenant <tenant-id> first when using azure_cli auth flow
```

## Architecture

### How the Components Fit Together

1. **Extension activates** → reads workspace settings → builds env vars → spawns MCP as a child process (localhost:52345)
2. **User queries** Copilot Chat → Copilot calls MCP tools: `get_event_catalog` → `get_event_field_samples` → `get_saved_queries` → generates KQL → calls `query_telemetry`
3. **MCP** authenticates against Azure (MSAL), executes KQL against App Insights REST API, caches results to `.cache/` in workspace
4. **Saved queries** (`.kql` files in workspace `queries/` folder) are discovered and provided as LLM context

### Key Design Decisions

- **MCP is required** — the extension cannot query Azure directly; all telemetry execution goes through MCP
- **LLM does NL→KQL translation** — MCP only provides context (event catalog, field samples, saved queries); no embeddings
- **Shared library is bundled** into both MCP and extension, not installed as a separate npm dep
- **Workspace-scoped config** — all settings are per-workspace (`.vscode/settings.json` or `.bctb-config.json`); no global settings
- **File-based caching** survives process restarts; TTL-based expiration (default 1 hour)
- **Embedded resources** — `query_telemetry` supports `resultFormat: 'resource'` to return data as MCP embedded resource files (CSV/JSON) for code interpreter processing; exports stored in `.vscode/.bctb/exports/` with 24h auto-cleanup
- **PII sanitization is opt-in** — redacts email, IP, GUIDs, phone, URLs before caching and LLM

### Auth Flows (configurable via `BCTB_AUTH_FLOW`)
- `vscode_auth` — VSCode built-in auth (recommended)
- `azure_cli` — Uses `az login` cached credentials
- `device_code` — Browser login per session
- `client_credentials` — Service principal with secret

### MCP Tools (defined in `packages/mcp/src/tools/toolDefinitions.ts`)
`get_event_catalog`, `get_event_field_samples`, `query_telemetry`, `save_query`, `get_saved_queries`, `get_external_queries`

## Development Rules (from `.github/copilot-instructions.md`)

### Logging Requirement
Every user prompt MUST be logged to **both** `docs/PromptLog.md` and `docs/DesignWalkthrough.md` AFTER completing the work:

**PromptLog.md** — append with GUID-based entry ID:
```
### Entry ID: <new-guid> — YYYY-MM-DD HH:MM
> "<user prompt verbatim>"

---
```

**DesignWalkthrough.md** — append short narrative:
```
- **YYYY-MM-DD** — <Short title> [Entry: <guid>]
  - **Why:** <one-line reason>
  - **How:** <one-line implementation note>
```

**CRITICAL**: Use append-only writes (never read these files). Generate a new GUID for each entry. Use exact timestamps, never placeholders. `docs/CHANGELOG.md` is only updated for releases or when explicitly asked.

### Git Rules
**Never execute git commands** without explicit user request. Make code changes, run build/tests, then tell the user "Changes ready — please review and commit when ready." The only exception is when the user explicitly says to commit/push.

### Testing
Every new module or feature must include tests in the same change. 70% coverage threshold is enforced.

## Release Process

Tags trigger GitHub Actions to publish to VS Code Marketplace and npm:
- Extension tags: `v3.1.10` (no prefix)
- MCP tags: `mcp-v3.2.4` (mcp- prefix)

Release steps: bump `version` in `package.json` → update `packages/[component]/CHANGELOG.md` → commit → tag → push. Extension `ReleaseNotesProvider.ts` only needs updating for MAJOR version bumps.

## CI/CD

6 GitHub Actions workflows: CI (Node 18/20, multi-OS), Release (tag-triggered publish), CodeQL (security), Dependency Review, PR Labeling, Dependabot.
