# TDD Methodology — BC Telemetry Buddy

> **Source of truth for rules:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md).
> This file holds the **how** of the TDD cycle. For *why we do this* and the project-wide rules (logging, git, telemetry), read copilot-instructions.md.

Every code change in this workspace — new feature, bug fix, refactor — follows the cycle below. The cycle is the default; it is not opt-in.

---

## The 9-phase cycle

The skill [.github/skills/tdd-workflow/SKILL.md](../../.github/skills/tdd-workflow/SKILL.md) is the actionable index. This doc explains the phases in prose.

1. **PLAN** — write a committed markdown plan file, stop, wait for approval
2. **FRAME** — post a ≤150-word framing of where this step sits in the project
3. **WRITE TESTS** — write the failing test(s) that encode the requirement
4. **PROVE RED** — run the test, observe the failure, confirm the failure is about behavior (not plumbing)
5. **SCAFFOLD** — add the minimum module shape so the test fails for the right reason
6. **IMPLEMENT** — smallest code that turns the test green
7. **VERIFY PASS** — full suite + coverage thresholds
8. **SECURITY SCAN** — run the [`/security-scan`](../../.github/skills/security-scan/SKILL.md) skill; a finding blocks the cycle
9. **DOCUMENT** — PromptLog, DesignWalkthrough, CHANGELOGs, UserGuide

---

## Phase 1 — PLAN (write a file, then STOP)

**Non-negotiable, before anything else in the cycle.**

Write a markdown plan file at `docs/plans/<topic>.md` (flat naming — no date or slice prefix). The filename is a short kebab-case topic, e.g. `docs/plans/event-catalog-pagination.md`, `docs/plans/mcp-auth-telemetry-fix.md`.

### Frontmatter

```markdown
---
topic: <short kebab-case topic>
status: draft
created: YYYY-MM-DD
---
```

`status` transitions manually: `draft` → `approved` → `done`. Never skip `approved`.

### Required sections

1. **Task** — one sentence. If you can't state it in one sentence, split it.
2. **Scope boundary** — what is IN this change and what is explicitly OUT. Be ruthless: a plan is one TDD cycle, not a sprint.
3. **Files to create / touch** — exact paths under `packages/shared`, `packages/mcp`, `packages/extension`, or `docs/`.
4. **Interface** — function signatures, tool schema (for MCP tools), command contribution (for extension commands).
5. **Dependencies** — existing services/modules this relies on.
6. **RED test list** — for each acceptance criterion: test file, test name, seams touched, edge cases.
7. **Telemetry** — new event IDs to add to `telemetryEvents.ts`, which handlers/services call `trackEvent`. Required by Rule 13.
8. **Open questions / assumptions** — anything the agent would otherwise silently decide. Each entry is either a question for the user or a stated assumption flagged for confirmation.
9. **Risks** — what could go wrong, what would force a rollback.
10. **Blast radius / breakage prediction** — **mandatory.** Rate the change as `safe` | `low-risk` | `risky` | `breaking`, justify the rating, list who/what could break (MCP tool consumers, saved queries on disk, KB cache, extension users, CI, downstream scripts), and describe how a regression would be detected. If the rating is `risky` or `breaking`, also spell out the migration path and whether a version bump is required. A plan cannot be submitted for approval without this section filled in. See [docs/plans/README.md](../plans/README.md#required-sections) for the rating definitions.
11. **Out-of-scope follow-ups** — bullet list of deliberately deferred items, so they don't get lost.

### Stop for approval

After writing the file, **post its path in chat and stop.** Do not proceed to Phase 2 until the user explicitly approves with words like "go", "approved", "proceed", "looks good", "yes".

**Silence is not approval.** If the user has not spoken, you do not have approval.

If the user requests changes, edit the plan file and re-ask. Never start FRAME or tests from an unapproved plan. On approval, flip the frontmatter `status: draft` → `status: approved`.

---

## Phase 2 — FRAME (≤150 words, in chat)

Before anything else, post a short framing that answers all four questions. Hard cap: **150 words total**.

1. **Goal of this step** — what are we creating, in one sentence.
2. **Where it stands in the project** — which prior steps it builds on, what comes after it, whether it's MCP-side or extension-side or shared.
3. **Why it is needed** — what breaks or is missing without it.
4. **What it contributes** — which MCP tool / service / seam / user flow this advances.

This framing is for the user's benefit — it keeps the session grounded in the bigger picture and catches "wait, why are we doing this?" moments before the RED list locks the work in.

The FRAME lives in chat only. It is not committed.

---

## Phase 3 — WRITE TESTS

Write failing tests FIRST. Tests go in `__tests__/` directories per package:

```
packages/shared/src/__tests__/<module>.test.ts
packages/mcp/src/__tests__/<feature>.test.ts
packages/extension/src/__tests__/<feature>.test.ts
```

Test structure pattern (from this project):

```typescript
// 1. Mock dependencies at top level
jest.mock('@bctb/shared', () => ({
    ServiceName: jest.fn().mockImplementation(() => ({
        method: jest.fn().mockResolvedValue(result)
    }))
}));

// 2. Import after mocks
import { ClassUnderTest } from '../module.js';

// 3. Describe blocks matching class/function structure
describe('ClassUnderTest', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    describe('methodName', () => {
        it('should handle normal case', async () => { /* ... */ });
        it('should handle error case', async () => { /* ... */ });
        it('should handle edge case', async () => { /* ... */ });
    });
});
```

See [testability-patterns.md](testability-patterns.md) for the full mocking catalog (vscode namespace, fs, MSAL, Kusto, etc).

**What to test, in priority order:**

1. Happy path — normal inputs produce expected outputs
2. Error paths — invalid inputs, network failures, auth failures
3. Edge cases — empty arrays, null values, boundary values
4. Integration points — cross-package imports work correctly
5. **Telemetry** — verify `usageTelemetry.trackEvent` is called with correct name and properties. This is not optional; Rule 13 makes it part of the definition of done.

**What NOT to test:** see [coverage-policy.md](coverage-policy.md) for the exclusion list.

---

## Phase 4 — PROVE RED

Run the test and observe the failure. This phase exists because a test that "fails" from a missing import is not a real RED — it's a typo.

```bash
cd packages/<pkg> && npx jest --no-coverage src/__tests__/<file>.test.ts
```

- If the failure is about **plumbing** (`Cannot find module`, `is not a function`, `unexpected token`) → go to Phase 5 (SCAFFOLD), then come back.
- If the failure is about **behavior** (`expected X received Y`, `expected function to throw`) → you have a true RED.

Post in chat: `RED confirmed: <failure message>`. Do not move on without this line.

---

## Phase 5 — SCAFFOLD

Minimum shape so the test can reach its assertion:

- Files + module exports
- Explicit type signatures
- Stub implementation throwing `new Error("not implemented: <name>")`
- Fakes for any untouched seams the test needs (prefer existing mocks from [testability-patterns.md](testability-patterns.md))

The scaffold is testable code structure — not behavior. Add to `TOOL_DEFINITIONS` and an empty handler case if this is a new MCP tool. Add the command contribution to `package.json` and register an empty handler if this is a new extension command.

Go back to Phase 4 and re-run. You should now see a *behavior* failure.

---

## Phase 6 — IMPLEMENT

Write the *minimum* code to turn this one test green. Not the prettiest, not the most general. Resist writing the next test's implementation "while you're here".

TypeScript conventions:

- ES2022 + ESM modules in `shared/` and `mcp/` (`import/export`)
- CommonJS in `extension/` (VSCode requirement)
- Cross-package imports via `@bctb/shared`
- Dependency injection via constructor parameters
- SOLID principles, especially SRP and DIP
- Functions under 20 lines
- `const` over `let`, avoid `any`

Project-specific patterns:

- MCP tools: add to `TOOL_DEFINITIONS` in `toolDefinitions.ts`, implement handler in `toolHandlers.ts`
- Shared services: export from `src/index.ts`, use DI
- Extension commands: register in `extension.ts`, implement in a service class
- Config: use `MCPConfig` from shared, loaded via `loadConfig()`
- **Telemetry is mandatory** (Rule 13): add event ID to `packages/shared/src/telemetryEvents.ts`, call `trackEvent` in the handler

Run the touched test file. Confirm it's green. Run the full suite. Confirm nothing else went red.

Post in chat: `GREEN: <test name>`.

Loop back to Phase 3 for the next RED on the list. When the list is empty, proceed.

---

## Phase 7 — VERIFY PASS (full suite + coverage)

Run all tests for affected packages with coverage:

```bash
cd packages/<pkg> && npm run test:coverage
npm test               # from root — all packages
npm run build          # from root — cross-package compile check
```

Coverage thresholds are enforced by Jest. See [coverage-policy.md](coverage-policy.md) for the full table and exclusion rules.

- If tests fail → fix the implementation, not the tests.
- If coverage drops → add tests for the uncovered paths, or justify an exclusion.

Then REFACTOR with the tests as a safety net: rename for clarity, extract helpers where duplication is *real* (not speculative), tighten types, delete dead code. After each meaningful change, run the full suite. If it goes red, revert.

---

## Phase 8 — SECURITY SCAN

Run the [`/security-scan`](../../.github/skills/security-scan/SKILL.md) skill. It scans for:

- Real tenant GUIDs in fixtures, snapshots, or test data
- Bearer tokens / access tokens in logs, error messages, or committed files
- AAD client secrets or connection strings
- Untracked `.env`-like files creeping into the repo
- Real customer names in knowledge-base `appliesTo` fields
- High / critical `npm audit` findings

A finding **blocks** the cycle. Never "note and continue". On a real secret hit, follow the rotation guidance in the skill before doing anything else.

Only on PASS, continue to Phase 9.

---

## Phase 9 — DOCUMENT

1. **PromptLog + DesignWalkthrough** (Rule 2, always): append the user prompt to `docs/PromptLog.md` with a new GUID and a one-line entry to `docs/DesignWalkthrough.md` referencing the same GUID. Follow the FAST APPEND strategy from copilot-instructions.md — never read these files.
2. **Component CHANGELOG**: update `packages/<component>/CHANGELOG.md` if the change is user-visible.
3. **UserGuide**: update `docs/UserGuide.md` if user-facing behavior changed.
4. **Plan file**: flip the frontmatter of the Phase 1 plan from `status: approved` → `status: done`.

Docs that are not updated at the moment of the change will never be updated. This step is not optional.

Finally, tell the user: "Changes ready — please review and commit when ready." Never run git commands without explicit request (Rule 11).

---

## Bug fixes and refactors — same cycle, different emphasis

- **Bug fix**: Phase 3 starts with a regression test that reproduces the bug. Phase 4 confirms the test fails against the current (broken) code. Phase 6 fixes the bug. If the fix reveals that a *previously passing* test encoded the wrong behavior, update that test — and explain why in the plan file.
- **Refactor**: The Phase 1 plan explicitly states "no behavior change". Existing tests are the safety net; you do not add new tests unless the refactor surfaces a missing one. Phases 4 and 5 usually collapse (no new scaffolding). Phase 7 is the main gate.

---

## Behavioral rules (hard)

1. Never write implementation code before a failing test.
2. Never skip Phase 1. A plan file must exist and be approved.
3. Never mark a phase done without running the tests or skill.
4. Never mark something as done with failing tests.
5. If a test is hard to write, the **code** is wrong — fix the seam, not the test.
6. Run tests in the terminal. Never assume tests pass without running them.
7. Show test output to the user at each verify step.
8. If a test reveals a bug in existing code, fix the bug (not the test).
9. Keep functions small — extract helpers when a function exceeds 20 lines.
10. Silence is not approval. If the user has not spoken, you do not have approval.
