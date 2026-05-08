---
topic: kb-mandatory-even-simplest
status: done
created: 2026-05-08
---

## Task
Reframe the `get_knowledge` instructions across all three prompt surfaces so the rule is unskippable for simple queries — by explaining **why** the KB matters (customer-specific data topology, not just KQL syntax) and adding "query is too simple" to the explicit anti-patterns list.

## Background
A real failure mode (reported back from a model session): the agent skipped `get_knowledge` on a basic `summarize count() by eventId` query, reasoning "this is just an aggregation, no complex types, no timespans — what could the KB add?". The KB article it missed was about customer-specific **data topology** (a dual-stream tenant where data flows through two tenant IDs). The query was simple; the answer it produced was wrong because half the data was invisible.

The agent's own diagnosis: the current instructions frame `get_knowledge` primarily around "proven KQL patterns and investigation playbooks", which makes it sound query-complexity-dependent. It is not. Customer-specific data topology affects every query regardless of complexity — a simple `count()` over half the data is just as wrong as a complex one over half the data.

## Scope boundary
- IN:
  - [packages/extension/src/chatParticipant.ts](packages/extension/src/chatParticipant.ts) — workflow narrative, tool list, quick-reference sections that mention `get_knowledge`.
  - [packages/extension/src/agentDefinitions.ts](packages/extension/src/agentDefinitions.ts) — equivalent sections in the custom-agent prompt.
  - [packages/mcp/src/tools/serverInstructions.ts](packages/mcp/src/tools/serverInstructions.ts) — Step 2 of "MANDATORY Tool-Call Sequence", workflow prompt content, and the existing "common mistakes" list.
- OUT:
  - No behavior change in MCP tool handlers or extension services.
  - No CHANGELOG / README copy edits.
  - No new telemetry events — prompt-text only.
  - No edits to KB articles, profile schemas, or runtime `kb-nudge` text.

## Files to create / touch
- packages/extension/src/chatParticipant.ts
- packages/extension/src/agentDefinitions.ts
- packages/mcp/src/tools/serverInstructions.ts
- packages/mcp/src/__tests__/server-instructions.test.ts (one new contains-assertion)

## Interface
No code interface change. Prompt-string edits, two kinds:

**1. Reframing the rule statement (one site per file).** Where the current text says some variant of "check for proven KQL patterns and investigation playbooks", expand it to:

> "check for **customer-specific data patterns (dual streams, tenant mappings, known quirks) AND proven KQL patterns** — the KB contains critical context about HOW and WHERE data flows, not just how to query it. This applies to every query regardless of complexity."

**2. New entry in the existing anti-pattern / "common mistakes" list (one site per file).** Add:

> "**Rationalizing 'the query is too simple for KB'** — The KB contains customer-specific data topology (dual-stream tenants, special filters, known data gaps) that affects ALL queries regardless of complexity. A simple `count()` query is just as wrong as a complex one if it's missing half the data."

The MCP `serverInstructions.ts` already has a numbered "common mistakes" section and a customer/dual-stream warning at item 6 — the new bullet slots in next to those. The chat participant and agent files will need a brief equivalent block if one doesn't already exist; if not, the new bullet is appended to the closest "rules / never skip" block rather than creating a new section.

## Dependencies
None. Pure string edits. `SERVER_INSTRUCTIONS` is already consumed by the MCP server `instructions` field and by tests.

## RED test list
- AC1: Server instructions reframe `get_knowledge` to mention customer-specific data topology, not only KQL patterns.
  - test file: packages/mcp/src/__tests__/server-instructions.test.ts
  - test name: "frames get_knowledge around data topology, not only KQL patterns"
  - assertion: `SERVER_INSTRUCTIONS` contains a phrase like "HOW and WHERE data flows" (or equivalent — exact phrase pinned by the test)
  - seams touched: none
  - edge cases: none

- AC2: Server instructions list "query is too simple" as a forbidden rationalization.
  - test file: packages/mcp/src/__tests__/server-instructions.test.ts
  - test name: "rejects 'query is too simple for KB' as a rationalization"
  - assertion: `SERVER_INSTRUCTIONS` contains a phrase like "too simple for KB" (or equivalent — exact phrase pinned by the test)
  - seams touched: none
  - edge cases: none

No new tests for `chatParticipant.ts` / `agentDefinitions.ts`: those files have no existing contains-style coverage for prompt strings, so adding the first one establishes a new test pattern and exceeds the scope of a wording tweak. The MCP test is the canary — if the wording philosophy changes again, the MCP test fails first and forces re-alignment of the other two surfaces by hand.

## Telemetry (Rule 13)
N/A — no new feature or tool. Rule 13 applies to "every new feature or tool"; this is a prompt-wording clarification on `get_knowledge`, which already has telemetry.

## Open questions / assumptions
- Assumption: the user wants the reframing applied to all three surfaces (chat participant, agent, MCP server instructions). Confirmed by the original ask: "Add to all descriptions".
- Assumption: terse but explicit is preferred over verbose. Each surface gets the reframed rule statement once and the new anti-pattern bullet once — not at every `get_knowledge` mention.
- Q: Keep the existing "proven KQL patterns" wording alongside the new "data topology" framing, or replace it? **Default:** keep both ("data topology AND proven KQL patterns") so we don't lose the original signal — the source-AI's own suggestion was additive, not replacing.

## Risks
- Prompt bloat: every extra clause costs context budget. Mitigation: insert at one rule-statement site and one anti-pattern site per file, not at every `get_knowledge` mention.
- Test brittleness: `server-instructions.test.ts` does substring assertions. The two new assertions pin specific phrases; if future copy edits drop those phrases, the tests fail loudly — that's the intended brittleness for prompt-rule guarantees.
- Cross-surface drift: three files now duplicate the same rule. If one is edited later without the others, the surfaces disagree. The MCP test catches drift on the MCP side; the extension files have no equivalent guard. Acceptable for now; a follow-up to consolidate is listed below.

## Blast radius / breakage prediction
- **Rating:** `safe`
  - String-only edits inside prompt content sent to the LLM at runtime. No exported types, schemas, tool names, command IDs, config keys, or on-disk formats change.
  - The MCP `instructions` payload is informational. Clients accept arbitrary text. No version bump needed.
  - Existing test assertions remain true (we add phrases, not remove the ones already pinned).
- **Who/what could break:** none. Worst case: agents call `get_knowledge` slightly more often, which is the intended outcome.
- **Detection:** `npm run test` in `packages/mcp` fails if an existing assertion is accidentally broken; the two new assertions detect the inverse — that the new phrases are present.

## Out-of-scope follow-ups
- Update the runtime `kb-nudge` handler text to echo the same "even for simple queries" reframing.
- Consolidate the three prompt sources behind one shared constant so future wording changes happen in one place.
- Consider whether `get_knowledge` itself should be auto-invoked server-side as a precondition to `query_telemetry` (rather than relying on prompt rules) — much larger design question, separate cycle.
