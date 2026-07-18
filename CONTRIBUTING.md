# Contributing to BC Telemetry Buddy

Thanks for wanting to contribute! This repo follows **spec-driven + test-driven development (SDD + TDD)**: every code change traces from an issue, through a behavior spec with acceptance criteria, through failing tests, to implementation. This file tells you what that means for your contribution.

## Setup

```bash
git clone https://github.com/waldo1001/waldo.BCTelemetryBuddy.git
cd waldo.BCTelemetryBuddy
npm ci
npm run build
npm test
```

- Node.js **20 or 22** (the CI matrix).
- npm-workspaces monorepo:

| Package | What it is |
|---|---|
| `packages/shared` | Core services (auth, kusto, cache, queries, sanitize, eventLookup) |
| `packages/mcp` | MCP server (stdio + HTTP) |
| `packages/extension` | VSCode extension |

Useful commands: `npm run dev:mcp` / `npm run dev:extension` (watch mode), `npm run test:coverage` (per package), `npm run validate-specs`, `npm run check-kb-index`.

## The development flow

```
GitHub issue (intake)              ← use the issue forms; blank issues are disabled
  │  triage: needs-spec (code work) or knowledge-base (KB content)
  ▼
Spec   docs/specs/<issue>-<topic>.md    WHAT/WHY + acceptance criteria (AC1..ACn),
  │                                     reviewed like code — see docs/specs/README.md
  ▼
Plan   docs/plans/<topic>.md            HOW: files, interfaces, RED tests keyed to
  │                                     the spec's AC IDs, blast radius
  ▼
Tests first (RED) → implement (GREEN) → coverage ≥ 70% stmts / 60% branches
  → security scan → docs
  ▼
Pull request — links the spec, includes the tests
```

The full methodology lives in [docs/tdd/methodology.md](docs/tdd/methodology.md); spec conventions in [docs/specs/README.md](docs/specs/README.md); plan conventions in [docs/plans/README.md](docs/plans/README.md).

## What every PR must include

For changes under `packages/*/src/`:

1. **Test changes in the same PR** — new behavior gets new tests; bug fixes get a regression test.
2. **A spec reference**, one of:
   - `Spec: docs/specs/<issue>-<topic>.md` in the PR body (file in this PR or already on the base branch),
   - `Spec-lite: docs/plans/<topic>.md` for qualifying small changes (see below),
   - the spec file included in the PR diff, or
   - `Closes #N` where issue N carries the `spec-approved` label.
3. A **CHANGELOG entry** in the affected package(s) (`packages/*/CHANGELOG.md`).
4. **Coverage** stays at or above 70% statements/lines, 60% branches ([docs/tdd/coverage-policy.md](docs/tdd/coverage-policy.md)).

Docs-only, CI-only, and `knowledge-base/**` PRs are exempt from the spec requirement — the `Spec Check` workflow detects this automatically.

## External contributors — what you actually need to do

You do **not** need to run this repo's full agent-driven process. The minimum bar:

1. Open (or find) an issue describing the change; fill in the **Acceptance Criteria** field if you can.
2. Include tests with your code change.
3. Reference the issue from your PR (`Closes #N`).

The `Spec Check` workflow posts an **advisory comment** on fork PRs — it will **never block you**. A maintainer will either write/finish the spec with you or apply the `spec-waived` label.

**Knowledge-base contributions** (telemetry playbooks, query patterns): touch only `knowledge-base/**`, regenerate the index with `npm run generate-kb-index`, and commit both. No spec needed.

## Spec-lite — small changes

Bug fixes, refactors, and chores with a `safe` or `low-risk` blast radius don't need a separate spec file: embed a `## Spec-lite` section (Intent + Given/When/Then acceptance criteria + eligibility line) in the plan file and reference it from the PR body with `Spec-lite: docs/plans/<topic>.md`. New user-observable features and anything `risky`/`breaking` always need a full spec. Details: [docs/specs/README.md](docs/specs/README.md#spec-lite--the-proportional-path).

## Waiver policy

The `spec-waived` label skips the spec check for one PR. It is **maintainer-applied only**, always with a comment explaining why (e.g. trivial upstream fix, emergency patch). Don't ask for a waiver as a first resort.

## Labels reference

| Label | Meaning |
|---|---|
| `needs-triage` | Awaiting maintainer triage |
| `needs-spec` | Code work — needs a behavior spec before implementation (written on pickup) |
| `spec-approved` | Approved spec exists in `docs/specs/` — implementation may start |
| `spec-waived` | Maintainer waiver: spec check skipped for this PR |
| `knowledge-base` | KB content work — exempt from the spec flow |

## Coding standards

- TypeScript strict; no `any`.
- SOLID, DRY, KISS; functions < 20 lines, files < 300 lines where practical.
- Every new MCP tool / extension feature ships **telemetry** (event ID in `packages/shared/src/telemetryEvents.ts` + `trackEvent` call) — this is part of the definition of done.
- Test names read like spec lines and cite the AC they verify.

Full rules: [.github/copilot-instructions.md](.github/copilot-instructions.md) · [docs/tdd/testability-patterns.md](docs/tdd/testability-patterns.md)
