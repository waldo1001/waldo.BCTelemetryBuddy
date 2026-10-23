---
topic: codecov-upload-stability
status: done
created: 2026-10-23
spec: spec-lite
---

# Plan: Stable Codecov project status (#140)

## Spec-lite
- Intent: `codecov/project` failed on a PR that only changed dependencies (#138). Codecov reported the status after merging 7 of the 10 uploads, and with no `codecov.yml` its default threshold is 0%. Separately, shared coverage has **never** reached Codecov: `packages/shared/jest.config.js` doesn't emit `coverage-final.json`. The goal is a project status that reflects real coverage changes, and includes shared.
- **AC1:** Given the repo root, When `codecov.yml` is read, Then `codecov.notify.after_n_builds` and `comment.after_n_builds` equal the number of coverage uploads the `ci.yml` matrix actually produces (computed from the workflow, currently 10), and `coverage.status.project.default` has `target: auto` and `threshold: 0.5%`.
- **AC2:** Given `codecov.yml`, When flags are read, Then `mcp`, `shared` and `extension` have `carryforward: true`, so a missing upload reuses the last report instead of lowering coverage.
- **AC3:** Given `packages/shared/jest.config.js`, When `npm run test:coverage` runs in `packages/shared`, Then `packages/shared/coverage/coverage-final.json` exists (a `json` reporter is added), so the CI step `Upload shared coverage to Codecov` finds its file.
- **AC4:** Given this PR's CI run, When Codecov reports, Then the `shared` flag shows up in the upload list (no `not_found_files` warning in the upload log), and `codecov/project` passes.
- Eligibility: chore (CI config), blast radius `safe`.

## Task
Add `codecov.yml` (wait for all uploads, 0.5% threshold, carryforward flags), and make shared emit `coverage-final.json`.

## Scope boundary
- **IN:** `codecov.yml` (new), the shared Jest `coverageReporters`, a consistency test, `docs/tdd/coverage-policy.md` (one paragraph).
- **OUT:** raising or changing the local Jest thresholds (70%); codecov-action v4 → v5 (a separate decision, since v5 changes token handling); per-file coverage targets.

## Files to create / touch
| Path | Change |
|---|---|
| `codecov.yml` | **new** |
| `packages/shared/jest.config.js` | `coverageReporters: ['text', 'lcov', 'html', 'json']` |
| `packages/mcp/src/__tests__/codecov-config-consistency.test.ts` | **new**: AC1–AC3 |
| `docs/tdd/coverage-policy.md` | a "Codecov" paragraph: after_n_builds, threshold, carryforward |

## Interface
```yaml
codecov:
  notify:
    after_n_builds: 10      # = uploads in ci.yml: test-mcp 2×(mcp+shared) + test-extension 3 OS × 2 node
coverage:
  status:
    project:
      default: { target: auto, threshold: 0.5% }
    patch:
      default: { target: auto }
comment:
  after_n_builds: 10
flag_management:
  default_rules:
    carryforward: true
  individual_flags:
    - { name: mcp, paths: [packages/mcp/src/] }
    - { name: shared, paths: [packages/shared/src/] }
    - { name: extension, paths: [packages/extension/src/] }
```

## Dependencies
- `ci.yml`'s `codecov/codecov-action@v4` steps (flags `mcp`, `shared`, `extension`).
- The existing `jobBlock`-style text parsing from `release-workflow-consistency.test.ts`.

## RED test list
| AC | Test | RED today |
|---|---|---|
| AC1 | "AC1: after_n_builds equals the upload count derived from ci.yml" | `codecov.yml` missing |
| AC2 | "AC2: mcp/shared/extension flags carry forward" | missing |
| AC3 | "AC3: shared jest config emits a json coverage report" | `coverageReporters` has no `json` |
| AC4 | the PR's CI and Codecov status | checked in CI |

## Telemetry
None. CI-only configuration (Rule 13 doesn't apply).

## Open questions / assumptions
- **Assumption:** once shared starts uploading, the project percentage moves (shared is about 88%, above the 85.5% average). The first PR shows a jump against the old base, which is expected, and after merge that becomes the new base.
- **Assumption:** a 0.5% threshold is tight enough to catch real regressions (around 23 lines across about 4,600) while tolerating rounding and OS variance.

## Risks
- If `after_n_builds` is higher than the real number of uploads, Codecov **never** posts a status, and the PR shows it as pending forever. AC1's test derives the number from `ci.yml`, so a matrix change that isn't reflected in `codecov.yml` fails locally.
- **Rollback:** delete `codecov.yml` (one commit).

## Blast radius / breakage prediction
- **Rating:** `safe`
  - CI reporting configuration only; no product code, package output, or test behavior changes.
- **Who/what could break:** CI status reporting (Codecov checks), which isn't required for merge.
- **Detection:** the AC1–AC3 unit tests; this PR's Codecov status and upload log.

## Out-of-scope follow-ups
- `codecov/codecov-action` v4 → v5 (Node 24 runtime). v5 changes token and OIDC handling, so it gets its own small cycle. The action is third-party, so the AC4 check in #137 (which only covers `actions/*`) doesn't include it.

## Outcome (2026-10-23)
- AC1–AC3 ✅ `codecov-config-consistency.test.ts`. RED was 4/4 before the change; all pass now. The upload count derived from `ci.yml` is 10.
- `codecov.yml` validated with `https://codecov.io/validate` ("Valid!").
- `packages/shared` now writes `coverage/coverage-final.json`.
- AC4 is verified on this PR's CI: the `shared` upload must have no `not_found_files`, and the Codecov status must post only after all 10 uploads.
