# CLAUDE.md

All instructions for working in this repository are in **`AGENTS.md`** (root), which points to the single source of truth: `.github/copilot-instructions.md`.

Read `AGENTS.md` first. It covers logging rules, TDD workflow, SOLID principles, git rules, release process, and mandatory skills.

---

## HARD RULE FOR CLAUDE CODE — Read before doing anything else

**You may NOT write or edit any source code file until you have:**

1. Written a plan file under [docs/plans/](docs/plans/) following [docs/plans/README.md](docs/plans/README.md)
2. Posted the plan file path in chat
3. Received **explicit** user approval ("go", "approved", "proceed", "looks good", "yes")

**Silence is not approval.** If the user has not spoken, you do not have approval.

"It's a small change" is not an exception. "I know what to do" is not an exception. "The user asked me to just do it" is not an exception unless they explicitly say "skip the design phase".

The plan phase is the cheapest point at which to catch a wrong approach. A 30-second approval gate is cheaper than a wrong implementation.

**Every new feature or tool MUST also include telemetry** (event IDs in `telemetryEvents.ts` + `trackEvent` calls). This is part of the definition of done — not optional.

## The 9-phase TDD cycle

Every code change follows: **PLAN → FRAME → TESTS → PROVE RED → SCAFFOLD → IMPLEMENT → VERIFY PASS → SECURITY SCAN → DOCUMENT**.

Full details live in three places:

- [.github/skills/tdd-workflow/SKILL.md](.github/skills/tdd-workflow/SKILL.md) — actionable phase index + component checklists
- [docs/tdd/methodology.md](docs/tdd/methodology.md) — the cycle in prose
- [docs/tdd/testability-patterns.md](docs/tdd/testability-patterns.md) — mocking catalog, seams, conventions
- [docs/tdd/coverage-policy.md](docs/tdd/coverage-policy.md) — thresholds, exclusions, enforcement

Phase 8 (SECURITY SCAN) invokes [.github/skills/security-scan/SKILL.md](.github/skills/security-scan/SKILL.md). A finding blocks the cycle.

See `.github/copilot-instructions.md` Rule 13 for the telemetry requirements.

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


