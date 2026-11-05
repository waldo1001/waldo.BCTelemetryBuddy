---
topic: codeql-loop-bound
status: done
created: 2026-11-05
spec: spec-lite
---

# Plan: resolve CodeQL alert 384 (loop bound injection in redactRegistered)

## Spec-lite
- Intent: #153's rewrite of `redactRegistered` loops over `text.length`. The function is exported, so a JavaScript caller could pass an array-like object with a huge `length` and stall the process (CodeQL `js/loop-bound-injection`, alert 384). Only iterate over real strings.
- **AC1:** Given a non-string argument, such as `{ length: 1e12 }`, When `redactRegistered` runs, Then it returns promptly with `String(argument)` and does not iterate over the object.
- **AC2:** Given string input, When `redactRegistered` runs, Then the behaviour is unchanged: the existing AC2, AC3 and AC10 tests pass as they are.
- Eligibility: chore, blast radius safe

## Task
Add a `typeof text !== 'string'` guard at the top of `redactRegistered` that returns `String(text)`.

## Scope boundary
- IN: the guard and one test.
- OUT: alerts 380 to 383, which are still open on `main` (see below); the drafted #150 issues and the reporter reply.

## Files to create / touch
| File | Change |
|---|---|
| `packages/shared/src/usageTelemetryUtils.ts` | guard in `redactRegistered` |
| `packages/shared/src/__tests__/azure-cli-tenant.test.ts` | AC1 test |
| `docs/PromptLog.md`, `docs/DesignWalkthrough.md` | Rule 2 appends |

No CHANGELOG entry: no user-visible change.

## Interface
Unchanged: `redactRegistered(text: string): string`.

## Dependencies
None.

## RED test list
Test file: `packages/shared/src/__tests__/azure-cli-tenant.test.ts`. Seams: none.
- AC1: "returns String(input) for an array-like object without iterating".
  - Red today: with the current loop, `{ length: 1e12 }` would iterate a trillion times. To keep the red run from hanging, the red proof uses `{ length: 3, 0: 'a', 1: 'b', 2: 'c' }`: the current loop returns `'abc'` instead of `'[object Object]'`. The test then asserts both: that small object's result, and that `{ length: 1e12 }` returns within the test.
- AC2: existing tests.

## Mutation check
1. Remove the guard. The array-like assertion must fail, and the huge-length case must hang; the runner's 60-second timeout counts a hang as killed.
2. Return `text` unchanged for non-strings (returns an object, not a string).

## Telemetry (Rule 13)
None.

## Open questions / assumptions
What I expect from CodeQL, as a prediction to check:
- 384 should close, because a `typeof` check is a standard sanitiser for `js/loop-bound-injection`. I'm not certain CodeQL recognises it in this exact shape, and I'll report the actual result from `main`'s scan, not the PR's.

Lesson from #153: a PR's alert list only shows alerts in the PR's diff. Alerts outside the diff don't appear there even while still open on `main`. I misread that as "fixed" once.

Alerts **380 to 383 are still open on `main`**: the shell-command alerts in `azureCliToken.ts`. This plan doesn't touch them. The shell is required for `az.cmd` on Windows, and the GUID/domain allowlist is the control: 18 injection tests, a mutation check, and the `windows-latest` CI run. Dismissing them as false positives changes the repo's security state, so that stays your decision.

## Risks
- `String(text)` on a hostile object runs its `toString`. That's acceptable here: callers are internal and pass strings; this only bounds the loop.

## Blast radius / breakage prediction
- **Rating:** `safe`
  - String input takes the same path as before; the guard only affects non-strings, which no caller passes.
  - Rollback is reverting one commit.
- **Who/what could break:** none.
- **Detection:** the existing scrubbing tests (AC10, AC2, AC3) and the new AC1 test.

## Verification
1. Build and all three suites
2. Mutation check
3. `/security-scan`
4. CodeQL alert 384 on `main` after merge
