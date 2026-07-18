# Specs — BC Telemetry Buddy

This folder holds **behavior specifications** — the WHAT and WHY of every change, written and approved **before** any plan or code exists. Specs are **Phase 0 (SPEC)** of the development cycle described in [docs/tdd/methodology.md](../tdd/methodology.md); plans under [docs/plans/](../plans/README.md) are Phase 1 and describe the HOW.

A spec is the source of truth for behavior. The GitHub issue is only the intake record: the conversation happens there, but the agreed behavior lives here, versioned and reviewed like code. One spec per issue. A spec may spawn multiple plans (TDD cycles).

---

## Filename convention

Keyed by GitHub issue number, then kebab-case topic:

```
docs/specs/<issue-nr>-<topic>.md
```

Examples:

- `docs/specs/104-settings-validation-fix.md`
- `docs/specs/105-investigate-challenge-findings-tools.md`

**Every spec traces to a GitHub issue.** If you're starting maintainer-initiated work with no issue, create one first (`gh issue create`) — the issue number keys the spec filename and lets CI cross-check PRs mechanically.

> Note: this issue-number keying applies to **specs only**. Plans keep topic-first naming per [docs/plans/README.md](../plans/README.md) — the plan links to its spec via frontmatter.

Specs are **never** moved to a `done/` folder. Issues and PRs link to them by path, and those links must stay stable. Lifecycle lives in the frontmatter `status` field.

---

## Frontmatter

```markdown
---
spec: <issue-nr>-<topic, same as filename>
issue: <issue-nr>
status: draft
created: YYYY-MM-DD
approved:
plans: []
---
```

- `approved:` — set to the approval date when status flips to `approved`.
- `plans:` — append plan file paths as they are created, e.g. `plans: [docs/plans/settings-validation-fix.md]`.

### Status lifecycle

```
draft  →  approved  →  implemented
```

- **draft** — just written. **No plan may be written from a draft spec, and no code from either.** Iterate here with the user. Commit draft specs to `main` as soon as they are written — the status field gates implementation, not visibility; a spec must be on GitHub to be reviewable and linkable from issues/PRs. Spec-only commits are a standing Rule 11 exception (see copilot-instructions.md): agents commit and push them without asking, provided the commit touches nothing outside `docs/specs/`.
- **approved** — the user has explicitly said "go", "approved", "proceed", "looks good", or "yes". **Silence is not approval.** Flip the frontmatter, set `approved:`, and apply the `spec-approved` label to the issue (removing `needs-spec`) at the same moment. AC IDs are frozen from this point — changing intended behavior means amending the spec and re-approving.
- **implemented** — every acceptance criterion is verified by a green test (Verification table complete). Flipped in Phase 9 (DOCUMENT) of the final TDD cycle for this spec, alongside the plan's `done` flip.

---

## Required sections

Copy this template into every spec:

```markdown
## Intent
Problem being solved and why it matters. 2–5 sentences.

## Actors & scope
Who/what consumes this (MCP client, extension user, agent). Packages affected.
- IN: ...
- OUT: ...

## Behavior
Prose behavior specification with concrete examples — tool input/output shapes,
command flows, error behavior. Concrete enough that two people reading it would
write the same tests.

## Acceptance criteria
- **AC1:** Given <precondition>, When <action>, Then <observable outcome>
- **AC2:** ...

IDs are stable once the spec is approved — plans and tests reference them by ID.

## Non-goals
Explicitly out of scope, so it doesn't creep back in.

## Telemetry (Rule 13)
Which user-observable events must fire, at the WHAT level (exact event IDs and
trackEvent call sites belong in the plan). Write "None — no new feature surface"
only with a one-line justification.

## Verification
| AC | Test | Status |
|---|---|---|
| AC1 | planned | planned |

Filled with the real test file + test name in Phase 9 (DOCUMENT). All rows must
read "verified" before status can flip to `implemented`.

## Links
- Issue: #NNN
- Plan(s): docs/plans/<topic>.md
- PR(s): #NNN
```

---

## Spec-lite — the proportional path

Not every change needs a spec file. A change qualifies for **Spec-lite** when **both** hold:

1. It is a **bug fix, refactor, or chore** — not a new user-observable feature or enhancement.
2. Its predicted blast radius is **`safe` or `low-risk`** (see [docs/plans/README.md](../plans/README.md)).

A Spec-lite is a `## Spec-lite` section embedded directly in the plan file — no separate spec file, no separate approval step (the plan approval covers it):

```markdown
## Spec-lite
- Intent: <1–2 lines>
- **AC1:** Given <precondition>, When <action>, Then <observable outcome>
- Eligibility: <bugfix|refactor|chore>, blast radius <safe|low-risk>
```

New user-observable features/enhancements and anything rated `risky` or `breaking` **always** require a full spec file, no exceptions.

For CI, reference a Spec-lite from the PR body with a `Spec-lite: docs/plans/<topic>.md` line.

---

## Knowledge-base exemption

Issues labeled `knowledge-base` are **exempt** from this spec flow. They produce `knowledge-base/**` content, not code, and follow [.claude/skills/kb-article-creation/SKILL.md](../../.claude/skills/kb-article-creation/SKILL.md) end-to-end. Never write a spec file for a KB issue.

---

## Relationship to plans, PromptLog, DesignWalkthrough

| File | Granularity | Scope | Written in |
|---|---|---|---|
| `docs/specs/<issue>-<topic>.md` | One per issue | WHAT/WHY: behavior + acceptance criteria | Phase 0 (SPEC) |
| `docs/plans/<topic>.md` | One per TDD cycle | HOW: files, interfaces, RED tests, blast radius | Phase 1 (PLAN) |
| `docs/PromptLog.md` | Every user prompt | Verbatim prompt | FAST APPEND, every request |
| `docs/DesignWalkthrough.md` | Every significant change | 1–3 line Why/How | FAST APPEND |

---

## Validation

Spec structure is validated by:

```bash
npm run validate-specs        # or: node scripts/validate-specs.js
```

CI runs the same check on every push/PR (`validate-specs` job in `ci.yml`) and fails on structural violations: bad filename, inconsistent frontmatter, missing required sections, or missing/duplicate AC IDs.
