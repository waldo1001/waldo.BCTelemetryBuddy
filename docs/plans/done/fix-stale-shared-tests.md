---
topic: fix-stale-shared-tests
status: done
created: 2026-05-08
---

## Task
Fix the 2 pre-existing failures in `packages/shared` that were captured as the baseline during the npm-audit-remediation cycle. Both are stale-test-string mismatches — the implementation in `src/config.ts` and `src/auth.ts` evolved (added `vscode_auth` to the tenantId exemption, rewrote the friendly error message) but the corresponding test assertions in `src/__tests__/config.test.ts` and `src/__tests__/auth.test.ts` were never updated. The tests fail green-path; behavior is correct.

## Scope boundary
- IN:
  - Update `packages/shared/src/__tests__/config.test.ts:177` to match the current `validateConfig` output, which lists both `azure_cli` and `vscode_auth` as exemptions for `BCTB_TENANT_ID`.
  - Update `packages/shared/src/__tests__/auth.test.ts:468` to assert against a stable substring that the current `authenticateVSCode` error message actually contains (`'BCTB_ACCESS_TOKEN environment variable not set'` is a load-bearing first line; `'This happens when:'` and `'Solutions:'` are also present and intentional).
  - Re-run `packages/shared` Jest with coverage to confirm 0 failures and that the suite returns to a clean exit.
- OUT:
  - Any changes to `src/config.ts` or `src/auth.ts`. The behavior they encode is correct; only the assertions are wrong.
  - The extension branch-coverage shortfall (66.26% vs 70% threshold). That is a separate, larger concern with no failing test — track in out-of-scope follow-ups.
  - Any test refactoring beyond the two failing assertions. Don't tidy adjacent tests or extract helpers.
  - Adding new RED tests for the underlying behaviors. The behaviors are already covered elsewhere; adding tests just to make this look more thorough is scope creep.

## Files to create / touch
- `packages/shared/src/__tests__/config.test.ts` — line 177 only: update expected string to match `validateConfig`'s current message.
- `packages/shared/src/__tests__/auth.test.ts` — line 468 only: change `.toThrow('Troubleshooting')` to `.toThrow('BCTB_ACCESS_TOKEN environment variable not set')`. That substring is a stable, intentional first line of the error and is unlikely to drift with future copy edits.
- No source files. If the test fails for any other reason after the assertion update, the plan stops and we open a separate cycle to investigate.

## Interface
No interface change. Both files are tests; no public API, schema, command, or config key is touched.

## Dependencies
- Existing Jest harness in `packages/shared`.
- The `validateConfig` function in `packages/shared/src/config.ts` and the `authenticateVSCode` method in `packages/shared/src/auth.ts` — both are read-only inputs to this plan; their behavior is the spec the tests must conform to.

## RED test list
The "RED" is already on disk — the two failing assertions, captured as the baseline during the npm-audit-remediation cycle. They have been failing for some time; both fail behaviorally (not plumbing), which is exactly what Phase 4 calls for.

- AC1: `config.test.ts › should return error when tenantId is missing` passes after the assertion update.
  - check: `cd packages/shared && npx jest --no-coverage src/__tests__/config.test.ts -t "tenantId is missing"`
  - seams touched: none.
- AC2: `auth.test.ts › should fail when vscode_auth is used but no token is provided` passes after the assertion update.
  - check: `cd packages/shared && npx jest --no-coverage src/__tests__/auth.test.ts -t "no token is provided"`
  - seams touched: none.
- AC3: Full `packages/shared` Jest with coverage exits 0 with 306/306 passing.
  - check: `cd packages/shared && npm run test:coverage`
  - edge cases: coverage thresholds — `shared` is well above 70% (87.75% stmts, 81.74% branch in last run); fixing 2 tests does not move coverage materially.

## Telemetry (Rule 13)
Not applicable. Test-only change; no new tool, command, service path, or event ID.

## Open questions / assumptions
- Assumption: the current `validateConfig` and `authenticateVSCode` messages are the correct, intended copy. They exist in shipped code and have been live for at least one release cycle; if the user wanted different wording, it would have been changed in source, not in the test. We conform tests to source, not the other way around.
- Assumption: the `'BCTB_ACCESS_TOKEN environment variable not set'` substring chosen for the auth assertion is stable. It is the literal first sentence of the error and the actionable identifier of the failure mode. If a future refactor renames the env var, both the source and test will move together — that's acceptable.
- Q: Should we assert the full error message via snapshot instead of substring? No — snapshots over user-facing copy create test churn on every wording tweak. A load-bearing substring is the right granularity.

## Risks
- A test-only change has a real (but small) risk of papering over a regression: if source genuinely *should* still say "Troubleshooting" or *should not* exempt `vscode_auth`, then by updating the assertion we lock in a bug. Mitigation: I have read the source for both behaviors before writing this plan and the current behavior is intentional (`vscode_auth` exemption matches `BCTB_AUTH_FLOW=vscode_auth` design; the friendlier error message is a deliberate UX rewrite).
- No risk to runtime, build, or release. Test fixtures only.

## Blast radius / breakage prediction
- **Rating:** `safe`
  - Two assertion updates inside test files. No production code, no config, no public API, no schema, no event ID.
  - The change strictly *removes* a false-negative signal from CI — making the suite reflect the real behavior.
- **Who/what could break:** Nothing. Tests cannot break consumers; if a consumer ever depended on the old error wording, that dependency was already wrong (since the wording shipped years ago).
- **Detection:** the per-package and root `npm test` runs immediately surface any regression. If anything fails after the change, it's a different bug and the plan stops.

No migration, version bump, or release note required — internal test hygiene.

## Out-of-scope follow-ups
- **Extension branch coverage 66.26% < 70% threshold.** Pre-existing, surfaced during the audit-remediation cycle's Phase 7 coverage runs. Likely the result of large webview providers (`AgentMonitoringSetupProvider.ts` at 45.45% branch) shipping without proportional tests. Worth a separate plan that either raises the test floor or formally lowers the threshold with justification.
- **`shared` `auth.ts` and `queries.ts` line coverage in the 66–80% range.** Not failing, but worth a sweep — separate plan.
- **The `Force exiting Jest` worker leaks** logged in mcp + shared runs. Indicates a teardown leak (likely the `kb-load-gate.test.ts` console.error console-ref or an MSAL cache handle). Investigate separately — it's noise today but will mask a real hang one day.
