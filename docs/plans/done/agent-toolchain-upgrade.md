---
topic: agent-toolchain-upgrade
status: done
created: 2026-04-13
---

# Agent toolchain upgrade — steal six patterns from waldo.WTF

## Task

Upgrade BC Telemetry Buddy's agent workflow (skills + instructions + reference docs) to adopt six patterns observed in [waldo.WTF](../../../waldo.WTF)'s agent toolchain: persistent plan files, split PROVE RED / SCAFFOLD steps, FRAME step, `/security-scan` skill chained into the TDD cycle, split reference docs under `docs/tdd/`, and explicit "silence is not approval" wording.

## Scope boundary

- **IN:**
  - Create `docs/tdd/` with `methodology.md`, `testability-patterns.md`, `coverage-policy.md`.
  - Create `.github/skills/security-scan/SKILL.md` + `allowlist.txt`.
  - Rewrite `.github/skills/tdd-workflow/SKILL.md` from 6-phase to 9-phase structure as a lean navigational index (~280 lines down from 273 — offset by moving content into `docs/tdd/`).
  - Update `CLAUDE.md` and `AGENTS.md` hard-rule blocks: new approval wording, pointers to `docs/plans/` and `docs/tdd/`.
  - Update `.github/copilot-instructions.md` TDD Workflow section: 9-phase index replacing the inline 6-phase recipe; add security-scan skill to Mandatory Skills list.
  - Create `docs/plans/README.md` with filename convention and status lifecycle.
  - Create `docs/plans/agent-toolchain-upgrade.md` — this file — dogfooding the convention.
- **OUT:**
  - Raising coverage thresholds beyond the current 70%/60%.
  - Creating a `/docs-update` skill (Phase 9 DOCUMENT stays inline — BCTB's docs surface is smaller than waldo.WTF's).
  - Weekend-slice plan naming (BCTB uses flat topic-based naming).
  - Touching any source code under `packages/**`.
  - Updating `.github/copilot-instructions.md` content beyond the TDD section and the Mandatory Skills list (no rule renumbering, no rewrites of Rules 0–13).
  - Touching the MCP tool surface (`toolDefinitions.ts` and friends — that was the earlier discussion thread, explicitly excluded here).

## Files to create / touch

**Create:**

- `docs/tdd/methodology.md`
- `docs/tdd/testability-patterns.md`
- `docs/tdd/coverage-policy.md`
- `.github/skills/security-scan/SKILL.md`
- `.github/skills/security-scan/allowlist.txt`
- `docs/plans/README.md`
- `docs/plans/agent-toolchain-upgrade.md` (this file)

**Edit:**

- `.github/skills/tdd-workflow/SKILL.md` — full rewrite to 9-phase index
- `CLAUDE.md` — hard-rule block + new pointers
- `AGENTS.md` — Skills section + new TDD reference-docs section
- `.github/copilot-instructions.md` — Mandatory Skills + Default TDD Workflow sections only

## Interface

No code surface. This is a docs/process change.

Affected surfaces:

- The TDD cycle becomes 9 phases instead of 6: PLAN → FRAME → WRITE TESTS → PROVE RED → SCAFFOLD → IMPLEMENT → VERIFY PASS → SECURITY SCAN → DOCUMENT.
- Phase 1 output changes from "chat DESIGN block" to "committed file at `docs/plans/<topic>.md`".
- New approval wording: "silence is not approval"; explicit approval keywords ("go", "approved", "proceed", "looks good", "yes").
- `/security-scan` becomes a mandatory gate between VERIFY PASS and DOCUMENT.

## Dependencies

- Existing `.github/skills/tdd-workflow/SKILL.md` (being rewritten)
- Existing `.github/skills/release/SKILL.md` (unchanged in this cycle; will be updated in a follow-up to invoke `/security-scan` as a pre-push gate)
- Existing `.github/copilot-instructions.md` Rule 2 (PromptLog/DesignWalkthrough) — plan files complement but do not replace this
- Existing `.github/copilot-instructions.md` Rule 13 (telemetry mandatory) — referenced from new methodology.md

## RED test list

Not applicable — docs/process change, no automated tests.

Verification steps instead:

- [x] `npm run build` still passes (sanity — should not be affected)
- [x] All new markdown files have valid frontmatter where required
- [x] All relative links between `CLAUDE.md` / `AGENTS.md` / `.github/copilot-instructions.md` / `.github/skills/*/SKILL.md` / `docs/tdd/*` / `docs/plans/*` resolve
- [x] The new 9-phase cycle reads coherently end-to-end (walked through reading `methodology.md` top to bottom)

## Telemetry (Rule 13)

Not applicable — docs/process change, no runtime code. Rule 13 still applies to any code change made *using* this new workflow.

## Open questions / assumptions

- **Q (to user, answered "approve!"):** bundled commit or one-per-section? — Left to the user; no commits made by the agent per Rule 11.
- **Q (to user, unanswered at plan time):** seed the security-scan allowlist with a known-safe fake tenant GUID? — Left empty with an example comment; user will add entries on first false positive.
- **Assumption:** flat topic-based plan naming (`docs/plans/<topic>.md`) is a better fit than waldo.WTF's weekend-slice naming, because BCTB is a released multi-version product, not a fixed-timeline build.
- **Assumption:** keeping the existing `/release` skill separate (not chained from `/tdd-workflow`) is correct because releases are a distinct lifecycle event, not a TDD-cycle outcome.
- **Assumption:** replacing "DESIGN block in chat" with "plan file in `docs/plans/`" is a strict upgrade — the plan file content is a superset of the old DESIGN block, and persistence is a pure win.

## Risks

- **Cycle ceremony creep.** 9 numbered phases is more than 6. *Mitigation:* most new phases are short gates (FRAME is 150 words, PROVE RED is one chat line, SECURITY SCAN runs a skill). The *time* cost is small; the *skipping* cost was the real problem the old 6-phase cycle had.
- **Security-scan false positives blocking work.** *Mitigation:* `allowlist.txt` exists from day one with documented format. User can add entries the first time a false positive hits.
- **Split reference docs drifting from copilot-instructions.md.** *Mitigation:* each `docs/tdd/` file opens with a "source of truth" note pointing back to copilot-instructions.md for *rules*, and only holds the *how*.
- **`npm run build` unaffected by docs change — but the scan skill references files (`packages/shared/src/telemetryEvents.ts`, `packages/shared/src/sanitize.ts`) that must still exist.** *Mitigation:* grep-verified before finalizing.

## Out-of-scope follow-ups

- Update `.github/skills/release/SKILL.md` to invoke `/security-scan` as a pre-push gate (noted in AGENTS.md but not wired in this cycle).
- Seed `allowlist.txt` with a real fake-tenant GUID once the user chooses one.
- Audit the current MCP tool surface for consolidation opportunities (4 overlapping query-discovery tools — discussed earlier in the session but explicitly out of this plan).
- Consider a `get_profile_health` MCP tool as a freshness gate (discussed earlier; out of scope for this cycle).
- Convert existing in-flight work (if any) to the new plan-file format retroactively — probably not worth the churn, but flag it if it comes up.
