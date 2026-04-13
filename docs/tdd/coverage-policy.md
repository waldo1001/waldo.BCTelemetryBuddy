# Coverage Policy — BC Telemetry Buddy

> **Source of truth for rules:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md).
> This file is the **how** of coverage enforcement — thresholds, exclusions, when to add a test vs when to exclude.

Coverage is checked during [Phase 7 — VERIFY PASS](methodology.md) of the TDD cycle. Thresholds are enforced by Jest (`jest.config.*`) and CI. If you drop below a threshold, the build fails.

---

## Thresholds

| Metric | `shared` | `mcp` | `extension` |
|---|---|---|---|
| Statements | 70% | 70% | 70% |
| Branches | 60% | 60% | 60% |
| Functions | 65% | 65% | 70% |
| Lines | 70% | 70% | 70% |

Thresholds are a *floor*, not a target. A file at 71% is not "done" — if the untested 29% covers error paths or edge cases, add tests.

### Why 70% and not 90%

BCTB has a large VSCode UI surface (webviews, extension activation, setup wizards) that cannot be unit-tested without a full extension host. Forcing 90% would mean excluding half the extension package from coverage, which hides real gaps. 70% with a tight exclusion list surfaces gaps more honestly.

If a subsystem *is* unit-testable (shared services, MCP handlers, pure functions), write tests until it's in the 90s — the thresholds are a minimum, not a ceiling.

---

## What NOT to test (exclusion list)

These files have no test host available or no meaningful logic to test:

- **VSCode UI components requiring the full extension host:**
  - `packages/extension/src/extension.ts` (activation entry point)
  - `packages/extension/src/webviews/SetupWizardProvider.ts`
  - `packages/extension/src/webviews/ProfileWizardProvider.ts`
  - Any `*WebviewProvider.ts` that registers with `vscode.window.registerWebviewViewProvider`
- **Pure data files** (no branching logic):
  - `packages/extension/src/agentDefinitions.ts`
- **Auto-generated files:**
  - `packages/shared/src/version.ts`
  - `packages/*/src/telemetryConfig.generated.ts`
- **CLI / server entry points** (thin wrappers around `main()`):
  - `packages/mcp/src/cli.ts`
  - `packages/mcp/src/server.ts`

Exclusions are declared in each package's `jest.config.*` under `coveragePathIgnorePatterns`. **Do not add an exclusion without a one-line comment in the config explaining why.**

---

## When a file falls below threshold

The Jest error will tell you which file and which metric. Your options, in order of preference:

1. **Add tests for the uncovered lines.** This is the default. If you can explain why the uncovered lines exist, you can test them.
2. **Delete the uncovered code.** Dead code is the cheapest thing to remove. If no test exercises it and no feature needs it, it should not be in the repo.
3. **Refactor to narrow the surface.** If a 50-line function has 3 untested branches, extract each branch into a named helper you can test in isolation.
4. **Add a coverage exclusion** (last resort). Only for files that match the categories above. Add a comment explaining why in `jest.config`.

**Never disable a test to get coverage to pass.** If a flaky test is the problem, fix the flake — don't delete the assertion.

---

## Coverage for bug fixes

A bug fix's regression test must *cover the exact lines that were broken*. If the broken code was in a branch that was previously uncovered, the regression test bumps coverage as a side effect — that is a good sign.

If you fix a bug and coverage does not move at all, you either:

- Didn't actually test the fix (the regression test is hitting a different path), or
- Fixed something that wasn't really broken.

Either way, stop and re-check.

---

## Coverage for refactors

Refactors should not move coverage. If a refactor drops coverage, you deleted tested code or added untested branches. If a refactor *raises* coverage without new tests, you probably removed dead code — good, note it in the plan file's "out-of-scope follow-ups" so it doesn't get lost.

---

## Reports

```bash
cd packages/<pkg> && npm run test:coverage
```

HTML report lands in `packages/<pkg>/coverage/lcov-report/index.html`. Open it in a browser to see per-file coverage with line-level highlighting. This is the fastest way to find the exact untested lines when the Jest summary isn't specific enough.
