# Plans — BC Telemetry Buddy

This folder holds the committed output of **Phase 1 (PLAN)** of the [TDD cycle](../tdd/methodology.md). Every non-trivial code change in this repo starts with a plan file here, approved by the user, before any test or implementation is written.

Plans survive the chat session they were written in. They double as a decision log: when a bug surfaces weeks later in a feature, the plan file is where you go to find *why* the feature was built the way it was.

---

## Filename convention

Flat, kebab-case, short topic:

```
docs/plans/<topic>.md
```

Examples:

- `docs/plans/event-catalog-pagination.md`
- `docs/plans/mcp-auth-telemetry-fix.md`
- `docs/plans/setup-wizard-profile-switcher.md`

**Do not** prefix with dates, sprint numbers, or issue IDs. Topic-first naming makes the folder scannable — you can find a plan six months later by guessing the topic.

One plan file per TDD cycle. If a change needs two cycles, write two plan files.

---

## Frontmatter

Every plan file starts with YAML frontmatter:

```markdown
---
topic: <short kebab-case topic, same as filename>
status: draft
created: YYYY-MM-DD
---
```

### Status lifecycle

```
draft  →  approved  →  done
```

- **draft** — just written. The user has not approved it yet. **No code may be written from a draft.**
- **approved** — the user has explicitly said "go", "approved", "proceed", "looks good", or "yes". The TDD cycle can start. Flip this manually after approval; silence is not approval.
- **done** — the cycle is complete, tests are green, docs are updated. Flip this manually in Phase 9 (DOCUMENT).

Never skip `approved`. Never flip `draft` straight to `done`.

If a plan is abandoned, delete the file rather than leaving it as `draft` forever — `git log` preserves it if someone needs to recover it later.

---

## Required sections

Copy the 10 sections below into every plan. See [docs/tdd/methodology.md §Phase 1](../tdd/methodology.md) for the full prose version.

```markdown
## Task
One sentence. If you can't state it in one sentence, split it.

## Scope boundary
- IN: ...
- OUT: ...

## Files to create / touch
- packages/<pkg>/src/<file>.ts
- ...

## Interface
Function signatures, tool schema (for MCP tools), command contribution (for extension commands).

## Dependencies
Existing services/modules this relies on.

## RED test list
- AC1: <behavior in one sentence>
  - test file: packages/<pkg>/src/__tests__/<file>.test.ts
  - test name: "<reads like a spec line>"
  - seams touched: auth | kusto | cache | queries | telemetry | vscode | none
  - edge cases: <empty | pagination | 429 | token-expired | unicode | ...>
- AC2: ...

## Telemetry (Rule 13)
- Event ID: `TELEMETRY_EVENTS.MCP_TOOLS.<NAME>` = `'TB-MCP-1xx'`
- `trackEvent` call in: <handler file:function>
- Properties: <list>

## Open questions / assumptions
- Q: ...
- Assumption: ...

## Risks
- ...

## Blast radius / breakage prediction
Predict how safe or breaking this change is **before** implementing. Pick one rating and justify it in 1–3 bullets.

- **Rating:** `safe` | `low-risk` | `risky` | `breaking`
  - `safe` — internal-only, no API/schema/config/file-format change, pure refactor or gated bug fix. Rollback = revert one commit.
  - `low-risk` — touches behavior users can observe, but backward compatible. Existing configs, saved queries, tool calls, and cache files keep working unchanged.
  - `risky` — changes observable behavior in a way that *could* surprise an existing user (new default, renamed field, new required call order) but has a documented migration or fallback.
  - `breaking` — removes/renames a public tool, command, config key, event ID, cache path, or on-disk format; or changes a return shape a caller depends on. Requires a major-version bump and CHANGELOG "BREAKING" entry.
- **Who/what could break:** MCP tool consumers | extension users | saved queries on disk | KB cache | telemetry pipeline | CI | downstream scripts | none.
- **Detection:** how a regression would show up (test that would fail, log line, user report) — so the reviewer knows what to watch for post-merge.

If the rating is `risky` or `breaking`, the plan MUST also list the migration path and whether a version bump is required before it can be approved.

## Out-of-scope follow-ups
- ...
```

---

## Examples

- [done/agent-toolchain-upgrade.md](done/agent-toolchain-upgrade.md) — the plan that created this folder. A good reference for the format.

---

## Relationship to PromptLog and DesignWalkthrough

Plan files are **not** a replacement for `docs/PromptLog.md` or `docs/DesignWalkthrough.md` (Rule 2). The three serve different purposes:

| File | Granularity | Scope | Written by |
|---|---|---|---|
| `docs/PromptLog.md` | Every user prompt | Verbatim prompt | FAST APPEND, every request |
| `docs/DesignWalkthrough.md` | Every significant change | 1–3 line Why/How | FAST APPEND, every significant change |
| `docs/plans/<topic>.md` | One per TDD cycle | Full plan: scope, interface, tests, risks | Phase 1 of the cycle |

The DesignWalkthrough entry for a change should reference the plan file path so the short entry can be expanded to the full plan.
