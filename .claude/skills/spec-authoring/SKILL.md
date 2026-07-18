---
name: spec-authoring
description: "Spec authoring workflow for BC Telemetry Buddy (SDD Phase 0). Takes a GitHub issue number, drafts a behavior spec with acceptance criteria under docs/specs/, and gates the TDD cycle. Use when: picking up a feature/bug/tech-modernization issue, before any plan or code. Not for knowledge-base issues (use /kb-article-creation)."
---

# /spec-authoring — SDD Phase 0: from GitHub issue to approved spec

You are turning a GitHub issue into an approved behavior specification under `docs/specs/`. No plan (Phase 1) and no code may exist for this work until the spec is approved. Conventions: [docs/specs/README.md](../../../docs/specs/README.md).

## When to use

- Picking up an open issue labeled `needs-spec` (feature, enhancement, bug, tech-modernization)
- Starting maintainer-initiated work — **create the issue first** (`gh issue create`), then run this skill
- The user asks to "spec out" / "write a spec for" an issue or idea

## When NOT to use

- **`knowledge-base` issues** → use `/kb-article-creation`. KB issues produce content, not code, and are exempt from the spec flow (Rule 14).
- **Spec-lite-eligible changes** (bugfix/refactor/chore rated `safe`/`low-risk`) → skip straight to `/tdd-workflow` and embed a `## Spec-lite` section in the plan. See [docs/specs/README.md §Spec-lite](../../../docs/specs/README.md).

## Workflow Phases

```
INTAKE → DRAFT → REVIEW (STOP) → APPROVE → HANDOFF
```

| # | Phase | Produces | Gate |
|---|---|---|---|
| 1 | **INTAKE** | Parsed issue requirements + full/lite decision | Confirm topic slug |
| 2 | **DRAFT** | `docs/specs/<N>-<topic>.md`, `status: draft` | `validate-specs` passes |
| 3 | **REVIEW** | Spec path posted in chat | **STOP — explicit user approval** |
| 4 | **APPROVE** | `status: approved`, issue labels flipped | — |
| 5 | **HANDOFF** | `/tdd-workflow` Phase 1 plan linked to the spec | — |

---

## Phase 1: INTAKE

1. Fetch the issue:
   ```bash
   gh issue view <N> --repo waldo1001/waldo.BCTelemetryBuddy --json title,body,labels,comments
   ```
2. Extract from the issue form fields: Problem, Proposed Solution, Alternatives, Component, Breaking Change, Usage Examples, and Acceptance Criteria (if the reporter filled the field — these seed AC1..ACn but you refine them).
3. Check the labels:
   - `knowledge-base` → **stop**, hand off to `/kb-article-creation`.
   - Otherwise decide **full spec vs Spec-lite** using the eligibility rule (bugfix/refactor/chore AND `safe`/`low-risk` → Spec-lite; anything user-observable-new or `risky`/`breaking` → full spec). If Spec-lite: tell the user and hand off to `/tdd-workflow` directly.
4. Confirm the topic slug with the user: `docs/specs/<N>-<topic>.md`.

## Phase 2: DRAFT

1. Write `docs/specs/<N>-<topic>.md` with `status: draft`, using the template from [docs/specs/README.md](../../../docs/specs/README.md) — all eight sections (Intent, Actors & scope, Behavior, Acceptance criteria, Non-goals, Telemetry, Verification, Links).
2. Acceptance criteria are Given/When/Then, observable, and testable. Number them `**AC1:**`, `**AC2:**`, … — these IDs freeze at approval.
3. Telemetry section: state WHAT must be observable (Rule 13); exact event IDs go in the plan later. "None" requires a one-line justification.
4. Validate:
   ```bash
   node scripts/validate-specs.js docs/specs/<N>-<topic>.md
   ```
5. **Commit and push the draft spec immediately** (standing Rule 11 exception — see copilot-instructions.md): a spec-only commit touching nothing outside `docs/specs/`. Status gates implementation, not visibility; the spec must be on GitHub to be reviewable and linkable.
6. Do **not** touch issue labels yet — that happens at approval.

## Phase 3: REVIEW — STOP

Post the spec file path in chat and **stop**.

Approval requires the explicit words "go", "approved", "proceed", "looks good", or "yes". **Silence is not approval.** Iterate on feedback in the spec file until approval.

## Phase 4: APPROVE

Only after explicit approval:

1. Flip frontmatter: `status: approved`, set `approved: YYYY-MM-DD`. Commit and push the flip (spec-only commit, same standing exception).
2. Update the issue:
   ```bash
   gh issue edit <N> --repo waldo1001/waldo.BCTelemetryBuddy --add-label spec-approved --remove-label needs-spec
   gh issue comment <N> --repo waldo1001/waldo.BCTelemetryBuddy --body "📋 Spec approved: \`docs/specs/<N>-<topic>.md\` — implementation may start."
   ```

## Phase 5: HANDOFF

Invoke `/tdd-workflow`. The Phase 1 plan MUST:

- set `spec: docs/specs/<N>-<topic>.md` in its frontmatter,
- reuse the spec's AC IDs in its RED test list (never invent a parallel numbering),
- be appended to the spec's `plans:` frontmatter list.

---

## Rules

- **Never write a plan from a `draft` spec.** Approved or nothing.
- **AC IDs are frozen after approval.** Changing intended behavior = amend the spec, re-validate, re-approve (back to Phase 3).
- One spec per issue; a spec may span multiple plans/TDD cycles.
- Rule 2 logging applies: FAST APPEND to `docs/PromptLog.md` and `docs/DesignWalkthrough.md` at the end, never read them.
- Rule 11 applies to git; `gh issue edit/comment` label operations are part of this workflow (like `/kb-article-creation`'s issue close).
