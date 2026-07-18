---
topic: sdd-process-upgrade
status: done
created: 2026-07-18
spec: spec-lite
---

# Plan: SDD process upgrade — spec-driven development layer on top of the TDD cycle

> Approved by the user via Claude Code plan mode on 2026-07-18 (full plan reviewed and accepted before any file was written). This plan self-applies the new proportionality rule: it touches no `packages/*/src` code, so it carries a Spec-lite instead of a full spec file.

## Spec-lite

- Intent: Add a spec-driven development (SDD) layer — Phase 0 — in front of the existing 9-phase TDD cycle, and wire spec/test enforcement into GitHub issues and PRs, so every code change traces issue → approved spec (acceptance criteria) → plan → tests → implementation.
- **AC1:** Given a feature/bug issue is picked up, When work starts, Then an approved `docs/specs/<issue>-<topic>.md` (or qualifying embedded Spec-lite) must exist before any plan or code, enforced by the governance docs and skills.
- **AC2:** Given a PR that changes `packages/*/src/**`, When the `Spec Check` workflow runs, Then it requires test changes plus a spec reference — advisory for fork PRs, failing for internal PRs once `SPEC_CHECK_MODE: enforce` — and is skippable only via the maintainer-applied `spec-waived` label.
- **AC3:** Given any file in `docs/specs/`, When CI runs, Then `scripts/validate-specs.js` fails the build on structural violations (bad filename, inconsistent frontmatter, missing sections, missing/duplicate AC IDs).
- **AC4:** Given the open backlog, When triage completes, Then all open non-`knowledge-base` issues carry `needs-spec`, and KB issues remain on the `/kb-article-creation` flow untouched.
- Eligibility: chore (process/CI/docs only), blast radius low-risk.

## Task

Introduce a spec layer (docs/specs/ + Phase 0 + /spec-authoring skill) and enforce spec/test linkage on all PRs and outstanding issues via labels, templates, CONTRIBUTING.md, and two CI additions.

## Scope boundary

- IN: docs/specs/ convention + validator; spec-authoring skill; governance-chain edits (copilot-instructions Rule 14 + hard-gate extension, AGENTS.md, CLAUDE.md, methodology, plans README, tdd-workflow + kb-article-creation skills); PR/issue templates; CONTRIBUTING.md; spec-check.yml (warn mode); validate-specs CI job; labels + backlog triage.
- OUT: any `packages/*/src` change; mass spec backfill for open issues; branch-protection settings (GitHub UI, maintainer action); flipping spec-check to enforce (separate follow-up after one clean internal PR).

## Files to create / touch

Create: `docs/specs/README.md`, `.claude/skills/spec-authoring/SKILL.md`, `scripts/validate-specs.js`, `.github/workflows/spec-check.yml`, `CONTRIBUTING.md`, this plan.
Edit: `.github/copilot-instructions.md`, `AGENTS.md`, `CLAUDE.md`, `docs/tdd/methodology.md`, `docs/plans/README.md`, `.claude/skills/tdd-workflow/SKILL.md`, `.claude/skills/kb-article-creation/SKILL.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/{feature-request,bug-report}.yml`, `.github/workflows/ci.yml`, `.github/workflows/README.md`, `README.md`, `.github/skills/README.md`, `package.json`.

## Interface

- `node scripts/validate-specs.js [file ...]` — exit 1 on structural violations; npm alias `validate-specs`.
- `spec-check.yml` — `pull_request_target` on main/develop; env `SPEC_CHECK_MODE: warn|enforce`; never checks out PR code (API only); one upserted comment per PR.
- Spec frontmatter contract: `spec`, `issue`, `status: draft|approved|implemented`, `created`, `approved`, `plans`.

## Dependencies

- `scripts/generate-kb-index.js` (validator pattern), `pr-label.yml` (`pull_request_target` precedent), existing plan/TDD governance chain, `gh` CLI for labels/triage.

## RED test list

Not applicable — no `packages/*/src` code. Executable checks standing in for RED/GREEN: `validate-specs.js` proven red on a malformed fixture and green on none; spec-check behavior verified on a live test PR (see Verification in the walkthrough below).

## Telemetry (Rule 13)

None — process/CI/docs change, no product surface. `scripts/validate-specs.js` is dev-time repo tooling exactly like `generate-kb-index.js` (no telemetry).

## Open questions / assumptions

- Q: make `Spec / test linkage` a required branch-protection check at enforce-flip? (Recommended; maintainer UI action.)
- Assumption: maintainer-initiated work always gets an issue first, so specs stay issue-keyed.

## Risks

- Buggy spec-check could annoy contributors → warn-mode rollout, single upserted comment, fork PRs never fail.
- Governance-doc edits could contradict existing cross-references → Phase 1–9 numbering kept intact; SPEC added as Phase 0.

## Blast radius / breakage prediction

- **Rating:** `low-risk`
  - Zero product source changes; MCP server and extension runtime behavior unchanged.
  - New CI is additive (one job + one standalone workflow shipping in warn mode).
  - `pull_request_target` risk neutralized by never checking out or executing PR code (API reads only, same posture as `pr-label.yml`).
- **Who/what could break:** external contributors (friction — mitigated by advisory-only comments, CONTRIBUTING.md, `spec-waived`); CI (spurious failure — mitigated by warn mode); agent workflows (mitigated: additive edits, phase numbers stable).
- **Detection:** warn-mode test PR exercising the check; advisory comments appearing on existing fork PRs #127/#108; `validate-specs` job output on the first merged spec; first internal PR after the enforce flip.

## Out-of-scope follow-ups

- Flip `SPEC_CHECK_MODE` to `enforce` after one clean internal PR; add as required status check.
- Courtesy comments on PRs #127/#108 pointing at CONTRIBUTING.md (after this lands on main).
- First real `/spec-authoring` run on an open issue (e.g. #104).
