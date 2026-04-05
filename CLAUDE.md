# CLAUDE.md

All instructions for working in this repository are in **`AGENTS.md`** (root), which points to the single source of truth: `.github/copilot-instructions.md`.

Read `AGENTS.md` first. It covers logging rules, TDD workflow, SOLID principles, git rules, release process, and mandatory skills.

---

## Quick Reference: Build & Test Commands

```bash
# Root workspace (runs all packages)
npm run build          # Build all packages
npm run test           # Run all tests (Jest)
npm run clean          # Clean dist directories

# Watch-mode development
npm run dev:mcp        # Watch-mode for MCP backend
npm run dev:extension  # Watch-mode for extension

# Per-package (run from packages/mcp, packages/extension, or packages/shared)
npm run build          # Build this package
npm run test           # Run Jest tests
npm run test:coverage  # Tests with coverage report (70% threshold enforced)
npm run test:watch     # Watch-mode tests
npm run compile        # TypeScript type-check only

# Extension-specific
npm run package        # Create .vsix for marketplace
```

## Quick Reference: Architecture

```
packages/
  shared/      Core services (auth, kusto, cache, queries, sanitize, eventLookup)
  mcp/         MCP server (stdio + HTTP). tools/toolDefinitions.ts + toolHandlers.ts
  extension/   VSCode extension. services/ + webviews/
```

Auth flows (set via `BCTB_AUTH_FLOW`): `vscode_auth` | `azure_cli` | `device_code` | `client_credentials`

MCP tools: `get_event_catalog`, `get_event_field_samples`, `query_telemetry`, `save_query`, `get_saved_queries`, `get_external_queries`

Release tags: extension → `v3.x.x` (no prefix) · MCP → `mcp-v2.x.x`


