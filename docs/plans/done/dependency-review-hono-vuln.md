---
topic: dependency-review-hono-vuln
status: done
created: 2026-07-20
spec: spec-lite
---

## Spec-lite
- Intent: Unblock PR #127's failing **Dependency Review** check. Root cause (confirmed): the PR makes **zero intentional dependency changes** (only edit to any `package.json` is a removed trailing newline in `packages/mcp/package.json`), yet its `package-lock.json` was regenerated at a later date and pulled in a newer, advisory-laden telemetry stack (hono, protobufjs, ~28 `@opentelemetry/*` + Azure Monitor packages). `dependency-review-action` flags these because they differ from `main`. The fix is to **reset the PR's dependency footprint to `main`'s baseline** so the PR introduces no dependency delta.
- **AC1:** Given the PR branch, When `package-lock.json` is reset to `main`'s and the `overrides` block is removed from root `package.json`, Then `git diff main..HEAD` shows **no dependency-manifest or lockfile changes** (only the pre-existing `packages/mcp/package.json` trailing-newline edit may remain, which carries no dependency change).
- **AC2:** Given the reset branch, When Dependency Review re-runs on PR #127, Then it reports **no changed dependencies** and the check passes.
- **AC3:** Given the reset branch, When `npm ci`, `npm run build`, and `npm test` run, Then they pass (the feature source compiles and tests against `main`'s dependency tree — the feature adds no new deps).
- Eligibility: chore, blast radius `low-risk` (reverting to a released, known-good baseline).

## Task
Reset PR #127's `package-lock.json` (and root `package.json`) to `main`'s dependency baseline so the branch introduces no dependency changes, clearing every Dependency Review advisory at once.

## Scope boundary
- IN: `package-lock.json` (reset to `main`), root `package.json` (remove the `overrides` block previously added in commit 8feab9c), this plan file.
- OUT: any `packages/**/src` source, the feature's own changes, workflow YAML, `fail-on-severity` threshold. Not adding per-package overrides (impractical across ~28 interlocking OTel packages). Not modifying `main`'s own latent advisories here — that is a **separate approved follow-up** (see below).

## Files to create / touch
- `package-lock.json` (reset to `main`)
- `package.json` (remove `overrides`, restoring `main`'s content)
- `docs/plans/dependency-review-hono-vuln.md` (this file)

## Interface
No public interface change. Net effect: PR branch dependency graph becomes byte-identical to `main`'s.

## Dependencies
- Relies only on `git checkout origin/main -- <files>` + npm resolution. The multiroot feature (extension webviews, `telemetryEvents.ts`, tests) adds no runtime dependency.

## RED test list
No new unit test — this is a lockfile/dependency reset, not application logic. Verification is external and objective:
- **AC1:** `git diff origin/main..HEAD -- package-lock.json package.json '**/package.json'` shows no dependency changes. — seams: none
- **AC2:** Dependency Review check on PR #127 goes green after push (re-run + approve fork run). — seams: CI
- **AC3:** `npm ci` (exit 0, lockfile in sync) + `npm run build` (exit 0) + `npm test` (all suites pass). — seams: none

## Telemetry (Rule 13)
N/A — not a new feature or MCP tool; no code path or event added.

## Mechanics (fork PR — supersedes prior hono-override commit)
PR #127 head is fork `stedvo-kmits/stedvo.BCTelemetryBuddy` branch `feature/multiroot-workspace-support`, `maintainerCanModify: true`. Commit `8feab9c` (hono override) already pushed — it treated a symptom and is superseded by this reset.
1. On the checked-out PR branch: `git checkout origin/main -- package-lock.json package.json`.
2. Confirm `git diff origin/main..HEAD` shows no dependency delta.
3. `npm ci` → build → test.
4. Commit a superseding change ("revert unintended dependency churn; reset lockfile to main baseline") and push to the fork branch (net PR dependency diff = empty).
5. Approve the held fork-PR workflow runs; watch Dependency Review pass.

## Open questions / assumptions
- Assumption: pushing to the fork branch is acceptable (confirmed by user; option "I reset & push to fork"). Forward-commit (not force-push) to avoid rewriting the author's branch history; a squash-merge collapses the back-and-forth.
- Assumption: the feature needs none of the bumped deps — verified (`packages/mcp/package.json` diff is a trailing newline only; no `package.json` dependency edits anywhere in the PR).

## Risks
- `git checkout origin/main -- package-lock.json` could leave the lockfile out of sync with a PR-only `package.json` dependency — mitigated: verified the PR changes no dependency declarations, so `main`'s lockfile matches the PR's `package.json` deps exactly (`npm ci` gate confirms).
- Feature source might rely on a transitive version only present in the bumped stack — mitigated: build + full test suite gate it; the feature is pure TypeScript over existing APIs.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Reverts the PR's dependency graph to `main`'s — a released, known-good baseline. No new/unknown versions introduced.
  - No source, API, schema, config, or on-disk-format change. Rollback = revert the reset commit.
  - `npm ci` + full test suite gate lockfile↔manifest sync and runtime behavior.
- **Who/what could break:** CI (the check being fixed). Not: MCP tool consumers, extension users, saved queries, KB cache, telemetry pipeline (telemetry deps return to the exact versions `main` ships and tests against).
- **Detection:** Dependency Review + CI build/test on the PR re-run; post-merge, `npm ci` or the test suite would surface any manifest/lockfile desync.

## Out-of-scope follow-ups (separately APPROVED)
- **main's latent transitive advisories** (hono `<=4.12.24`, the OpenTelemetry/Azure Monitor stack, protobufjs) are present on `main` but never flagged because Dependency Review only reviews PR diffs. User approved a **dedicated follow-up pass on `main`** to patch/override where clean fixes exist — its own spec-lite + plan, done after PR #127 is green.
- Consider a scheduled `npm audit` / Dependabot job so transitive vulns surface on `main` directly.
- Consider pinning `dependency-review-action` to a SHA and silencing the Node 20 deprecation warning.
