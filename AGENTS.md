# AGENTS.md

This file is the entry point for Claude Code (claude.ai/code) and any other AI agent working in this repository.

## Single Source of Truth

All instructions, rules, logging requirements, TDD workflow, and behavioral standards live in one file:

```
.github/copilot-instructions.md
```

**Read that file before doing anything else.** GitHub Copilot reads it automatically; all other agents (Claude Code, etc.) must read it explicitly at the start of every session.

## What `.github/copilot-instructions.md` covers

- Rule 0: Never ask for confirmation — just do it
- Rule 1: Always ask "why" if context is missing
- Rule 2: Log every action (PromptLog.md + DesignWalkthrough.md)
- Rules 3–7: Logging format, workflow, and examples
- Rule 8: Always create tests
- Rule 9: Maintain comprehensive documentation
- Rule 10: SOLID principles and code quality standards
- Rule 11: Never execute git commands without explicit user request
- Rule 12: Release workflow automation
- Rule 13: Always add telemetry for new features and tools (event IDs + trackEvent calls)
- **Mandatory Skills** — load `.github/skills/tdd-workflow/SKILL.md` before any code change
- **Default TDD Workflow** — the 6-phase design → test → implement cycle that applies to ALL code changes
- **Project Architecture Reference** — packages layout, test locations, test commands

## Skills

Before any code change, explicitly load and follow the skill(s) under `.github/skills/`:

```
.github/skills/tdd-workflow/SKILL.md   ← mandatory for all code changes
.github/skills/security-scan/SKILL.md  ← invoked from Phase 8 of tdd-workflow and before every release
.github/skills/release/SKILL.md        ← mandatory for version bumps / publishes
```

Load skills using `read_file` before generating any code or tests.

## TDD reference docs

The `tdd-workflow` skill deep-links into:

- [docs/tdd/methodology.md](docs/tdd/methodology.md) — the 9-phase cycle (PLAN → FRAME → TESTS → PROVE RED → SCAFFOLD → IMPLEMENT → VERIFY → SECURITY SCAN → DOCUMENT)
- [docs/tdd/testability-patterns.md](docs/tdd/testability-patterns.md) — mocking catalog, seams, package conventions
- [docs/tdd/coverage-policy.md](docs/tdd/coverage-policy.md) — thresholds, exclusions, enforcement
- [docs/plans/README.md](docs/plans/README.md) — plan-file naming and status lifecycle

**Hard rule:** no source-code edits until a plan file exists under `docs/plans/` and the user has **explicitly** approved it. Silence is not approval.

**Every plan must predict its own blast radius.** Required section: rating (`safe` | `low-risk` | `risky` | `breaking`), justification, who/what could break, and how a regression would be detected. `risky`/`breaking` ratings must also list the migration path and version-bump implications. A plan missing this section cannot be submitted for approval — see [docs/plans/README.md](docs/plans/README.md#required-sections).

## Quick Reference: Build & Test Commands

```bash
npm run build          # Build all packages
npm test               # Run all tests
npm run clean          # Clean dist directories

cd packages/mcp && npm test             # MCP only
cd packages/extension && npm test       # Extension only
cd packages/shared && npm test          # Shared only
cd packages/<pkg> && npm run test:coverage  # With coverage report
```
