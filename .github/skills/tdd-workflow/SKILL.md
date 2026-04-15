---
name: tdd-workflow
description: 'Test-Driven Development workflow for BC Telemetry Buddy. Enforces the 9-phase PLAN → FRAME → TESTS → PROVE RED → SCAFFOLD → IMPLEMENT → VERIFY → SECURITY SCAN → DOCUMENT cycle. Use when: adding features, fixing bugs, refactoring code, implementing new MCP tools, extension commands, or shared-lib modules. Mandatory before any code change.'
---

# /tdd-workflow — BC Telemetry Buddy TDD enforcer

You are about to make a code change in BC Telemetry Buddy. This skill forces you through the TDD cycle defined in [docs/tdd/methodology.md](../../../docs/tdd/methodology.md). **Do not skip phases. Do not merge phases.**

## When to use

- Implementing a new MCP tool (`toolDefinitions.ts` + `toolHandlers.ts`)
- Adding a new extension command, service, or webview provider
- Adding a new shared-library module or service
- Fixing a bug (reproduce with a regression test first)
- Refactoring existing code
- Any change that touches `packages/shared`, `packages/mcp`, or `packages/extension`

## Before you start — load the rules

Re-read these before you write anything:

1. [docs/tdd/methodology.md](../../../docs/tdd/methodology.md) — the 9-phase cycle in prose
2. [docs/tdd/testability-patterns.md](../../../docs/tdd/testability-patterns.md) — mocking catalog, seams, package conventions
3. [docs/tdd/coverage-policy.md](../../../docs/tdd/coverage-policy.md) — thresholds, exclusions, enforcement
4. [.github/copilot-instructions.md](../../copilot-instructions.md) — project-wide rules (logging, git, telemetry)

If the task is a bug fix or refactor, also read the "Bug fixes and refactors" section at the bottom of [methodology.md](../../../docs/tdd/methodology.md).

---

## HARD GATE — Read this before touching any file

**You may NOT write or edit any source-code file until you have:**

1. Written a plan file under [docs/plans/](../../../docs/plans/) and posted its path in chat
2. Received explicit user approval ("go", "approved", "proceed", "looks good", "yes")

**Silence is not approval.** If the user has not spoken, you do not have approval. "It's a small change" is not an exception. "I know what to do" is not an exception. "The user asked me to just do it" is not an exception unless they explicitly say "skip the design phase".

The design phase is the cheapest point at which to catch a wrong approach. A 30-second approval gate is cheaper than a wrong implementation.

---

## The 9-phase cycle

| # | Phase | What it produces | Where it lives |
|---|---|---|---|
| 1 | **PLAN** | Committed markdown plan file | `docs/plans/<topic>.md` |
| 2 | **FRAME** | ≤150-word framing of the step | Chat only |
| 3 | **WRITE TESTS** | Failing test(s) in `__tests__/` | Test file |
| 4 | **PROVE RED** | `RED confirmed: <failure>` line | Chat + terminal |
| 5 | **SCAFFOLD** | Stubs throwing `not implemented` | Source files |
| 6 | **IMPLEMENT** | Minimal code that turns test green | Source files |
| 7 | **VERIFY PASS** | Full suite + coverage at thresholds | Terminal |
| 8 | **SECURITY SCAN** | `/security-scan` → PASS | Chat + terminal |
| 9 | **DOCUMENT** | PromptLog, DesignWalkthrough, CHANGELOG | Docs |

Details for each phase are in [methodology.md](../../../docs/tdd/methodology.md). The rest of this file is **actionable checklists and references** — use it as a working surface, not a replacement for the prose doc.

---

## Phase 1 — PLAN (file, then STOP)

Write `docs/plans/<topic>.md` with the frontmatter and sections from [methodology.md §Phase 1](../../../docs/tdd/methodology.md). See [docs/plans/README.md](../../../docs/plans/README.md) for the file-naming convention, status lifecycle, and **required sections** (including the `Blast radius / breakage prediction` section added below).

**Blast radius is mandatory.** Every plan must include a rating of `safe` | `low-risk` | `risky` | `breaking`, with justification, who/what could break, and how a regression would be detected. If the rating is `risky` or `breaking`, the plan must also spell out the migration path and version-bump implications *before* asking for approval. Do not post the plan for approval without this section filled in.

**After writing the file, post its path in chat and STOP. Wait for explicit approval.** On approval, flip `status: draft` → `status: approved`.

## Phase 2 — FRAME (chat, ≤150 words)

Post in chat: goal / where-it-stands / why-needed / what-it-contributes. Hard cap 150 words. Not committed.

## Phase 3 — WRITE TESTS

Test file locations:

```
packages/shared/src/__tests__/<module>.test.ts
packages/mcp/src/__tests__/<feature>.test.ts
packages/extension/src/__tests__/<feature>.test.ts
```

Mocking patterns are in [testability-patterns.md](../../../docs/tdd/testability-patterns.md). Include a telemetry assertion — Rule 13 makes `trackEvent` part of the definition of done.

## Phase 4 — PROVE RED

```bash
cd packages/<pkg> && npx jest --no-coverage src/__tests__/<file>.test.ts
```

Post in chat: `RED confirmed: <failure message>`. If the failure is about plumbing (`Cannot find module`, `is not a function`), go to Phase 5 first.

## Phase 5 — SCAFFOLD

Minimum shape so the test can fail for the *right* reason:

- New files + module exports
- Explicit type signatures
- Stub implementations throwing `new Error("not implemented: <name>")`
- For a new MCP tool: add to `TOOL_DEFINITIONS`, add an empty handler case
- For a new extension command: register in `extension.ts`, add command contribution in `package.json`

Go back to Phase 4. You should now see a behavior failure.

## Phase 6 — IMPLEMENT

Minimum code to turn this one test green. Loop back to Phase 3 for the next RED.

## Phase 7 — VERIFY PASS

```bash
cd packages/<pkg> && npm run test:coverage   # per package with coverage
npm test                                     # all packages
npm run build                                # from root — cross-package compile check
```

Thresholds: see [coverage-policy.md](../../../docs/tdd/coverage-policy.md). If tests fail, fix the implementation, not the tests.

## Phase 8 — SECURITY SCAN

Run the [`/security-scan`](../security-scan/SKILL.md) skill. A finding **blocks** the cycle. Never "note and continue".

## Phase 9 — DOCUMENT

1. PromptLog + DesignWalkthrough (Rule 2 — FAST APPEND, never read these files)
2. `packages/<component>/CHANGELOG.md` if user-visible
3. `docs/UserGuide.md` if user-facing behavior changed
4. Flip plan file `status: approved` → `status: done`

Then: "Changes ready — please review and commit when ready." Never run git commands without explicit request (Rule 11).

---

## MCP Tool Development Checklist

When adding a new MCP tool, follow this exact sequence:

- [ ] **Phase 1 (PLAN):** Plan file in `docs/plans/` covering tool name, description, `inputSchema`, `annotations`, handler logic, telemetry event ID
- [ ] **Phase 3 (TESTS):** Test `TOOL_DEFINITIONS` contains the tool; test handler dispatch; test business logic per AC; test `usageTelemetry.trackEvent` is called with correct event name and properties
- [ ] **Phase 4 (PROVE RED):** Run the test file, confirm behavior-level failure
- [ ] **Phase 5 (SCAFFOLD):** Add tool to `TOOL_DEFINITIONS`, add empty handler case throwing `not implemented`; add `TOOL_NAME: 'TB-MCP-1xx'` to `TELEMETRY_EVENTS.MCP_TOOLS` in `packages/shared/src/telemetryEvents.ts`
- [ ] **Phase 6 (IMPLEMENT):** Write handler logic in `toolHandlers.ts`; add `trackEvent` call inside the handler case for meaningful outcomes (in addition to the generic `Mcp.ToolCompleted` that fires automatically)
- [ ] **Phase 7 (VERIFY):** All tests green, coverage meets threshold, `npm run build` from root
- [ ] **Phase 8 (SECURITY):** `/security-scan` passes — pay extra attention to check #6 (telemetry properties)
- [ ] **Phase 9 (DOCUMENT):** CHANGELOG, tool description in UserGuide if user-facing, flip plan to `done`

## Extension Service / Command Checklist

- [ ] **Phase 1 (PLAN):** Service interface, dependencies, command palette entry, telemetry event names
- [ ] **Phase 3 (TESTS):** Mock `vscode` namespace and `@bctb/shared`; test service logic; test `trackOperationWithTelemetry` or `trackEvent` is called for key operations
- [ ] **Phase 4 (PROVE RED):** Behavior-level failure confirmed
- [ ] **Phase 5 (SCAFFOLD):** Empty service class / command registration
- [ ] **Phase 6 (IMPLEMENT):** Fill in service logic; use `trackOperationWithTelemetry` for async ops, `usageTelemetry.trackEvent` for simple events; add event IDs to `TELEMETRY_EVENTS.EXTENSION` if significant
- [ ] **Phase 7 (VERIFY):** Tests green; register command in `extension.ts` and `package.json`; `npm run build` from root
- [ ] **Phase 8 (SECURITY):** `/security-scan` passes
- [ ] **Phase 9 (DOCUMENT):** CHANGELOG, UserGuide

## Shared Library Checklist

- [ ] **Phase 1 (PLAN):** Types, interfaces, function signatures, which packages will consume this
- [ ] **Phase 3 (TESTS):** Mock external deps (axios, fs, MSAL); tests in `packages/shared/src/__tests__/`
- [ ] **Phase 4 (PROVE RED):** Behavior-level failure confirmed
- [ ] **Phase 5 (SCAFFOLD):** Module with type stubs; export from `src/index.ts`
- [ ] **Phase 6 (IMPLEMENT):** Minimal implementation
- [ ] **Phase 7 (VERIFY):** Tests green, coverage ≥70%, `npm run build` from root (shared must build first); verify MCP and extension can import new exports
- [ ] **Phase 8 (SECURITY):** `/security-scan` passes
- [ ] **Phase 9 (DOCUMENT):** CHANGELOG if API-surface change

---

## Quick command reference

```bash
# Run one test file
cd packages/<pkg> && npx jest --no-coverage src/__tests__/<file>.test.ts

# Run all tests for a package with coverage
cd packages/<pkg> && npm run test:coverage

# Run all tests from root
npm test

# Build (cross-package project references)
npm run build
```

---

**If at any phase the test is hard to write, the code is wrong — not the test. Stop, fix the seam, continue. Never skip a test "just this once".**
