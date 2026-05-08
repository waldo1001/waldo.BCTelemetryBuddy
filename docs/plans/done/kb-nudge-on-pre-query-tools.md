---
topic: kb-nudge-on-pre-query-tools
status: done
created: 2026-05-08
---

## Task
Attach a parameterized "consult KB" nudge to pre-query tool responses (e.g. `get_event_catalog`, `get_tenant_mapping`, `get_event_field_samples`, `get_event_schema`) until `get_knowledge` is called in the session — to make the mandatory KB step harder for the LLM to skip without bloating responses with KB content.

## Scope boundary
- IN: Add session-level `kbConsulted` state to `ToolHandlers`; flip it when `get_knowledge` runs against an available KB. Add a `kbHint` field (single short string) to the responses of four pre-query tools when KB is loaded but not yet consulted. Suggestion strings are parameterized from values the source tool already has.
- IN: New telemetry event `KB_HINT_EMITTED` to measure whether the nudge changes LLM behavior over time.
- OUT: Auto-injecting KB content/metadata into tool responses (different design, dropped). Modifying tool descriptions or `SERVER_INSTRUCTIONS`. Webview/extension behavior. Multi-root path bug (separate plan). Anything in `query_telemetry`, `save_query`, `list_profiles`, `switch_profile`, `get_auth_status`, `get_categories`, `get_recommendations`, `get_external_queries`, cache tools, or `save_knowledge`.

## Files to create / touch
- packages/mcp/src/tools/toolHandlers.ts — add `kbConsulted` flag, set it in `get_knowledge` case, attach `kbHint` after the switch via a private `maybeAttachKbHint(toolName, params, result)` helper.
- packages/shared/src/telemetryEvents.ts — add `MCP_TOOLS.KB_HINT_EMITTED = 'TB-MCP-114'`.
- packages/mcp/src/__tests__/kb-nudge.test.ts (new) — RED tests for the eight ACs below.

## Interface
- `ToolHandlers.kbConsulted: boolean` (private, default `false`).
- `ToolHandlers.maybeAttachKbHint(toolName: string, params: any, result: any): any` (private). Returns the result unchanged or with a `kbHint: string` field added at the top level.

Hint format (single string, ~30–50 tokens):
```
⚠️ Knowledge base not consulted yet. Recommended next: get_knowledge({ eventIds: ["RT0006","RT0008"] }) before writing KQL.
```

Suppression rules (in `maybeAttachKbHint`):
- Skip if `this.knowledgeBase` is null/falsy (KB not loaded — no point nudging for something unavailable).
- Skip if `this.kbConsulted === true`.
- Skip if `toolName` is not one of: `get_event_catalog`, `get_tenant_mapping`, `get_event_field_samples`, `get_event_schema`.

Per-tool suggestion params:
- `get_event_catalog` → `get_knowledge({ eventIds: [<significantEvents from result>] })`. Cap at 5 IDs to keep the string short.
- `get_event_field_samples` → `get_knowledge({ eventId: "<params.eventId>" })`.
- `get_event_schema` → `get_knowledge({ eventId: "<params.eventId>" })`.
- `get_tenant_mapping` → if `params.companyNameFilter` is set: `get_knowledge({ search: "<companyNameFilter>" })`; else generic: `get_knowledge({ category: "playbook" })`.

`kbConsulted` flip rule (in `get_knowledge` case): set to `true` whenever `this.knowledgeBase` is non-null and the search ran (regardless of `articles.length`). Calling `get_knowledge` with a query that returns zero results still counts as consulting — the agent tried.

## Dependencies
- Existing `ToolHandlers.knowledgeBase` (KnowledgeBaseService instance).
- Existing `services.usageTelemetry` for `KB_HINT_EMITTED` event.
- Existing `extractCustomDimensionsFields`-style helper pattern (no new shared lib).

## RED test list
- AC1: `get_event_catalog` returns `result.kbHint` containing `get_knowledge({ eventIds: [...] })` with up to 5 of the catalog's significantEvents IDs, when KB is loaded and `kbConsulted` is false.
  - test file: packages/mcp/src/__tests__/kb-nudge.test.ts
  - test name: "attaches kbHint with significant event IDs to get_event_catalog when KB not yet consulted"
  - seams touched: knowledgeBase (mocked), kusto (mocked to return a catalog)
  - edge cases: significantEvents empty array → suggestion falls back to a generic `get_knowledge({ category: "event-interpretation" })`.

- AC2: `get_event_catalog` returns NO `kbHint` after `get_knowledge` has been called once in the session.
  - test name: "suppresses kbHint on get_event_catalog after get_knowledge has run"
  - edge cases: `get_knowledge` returning zero articles still flips the flag.

- AC3: `get_tenant_mapping` with `companyNameFilter: "Engels"` returns `kbHint` containing `get_knowledge({ search: "Engels" })`.
  - test name: "attaches customer-scoped kbHint to get_tenant_mapping when companyNameFilter is provided"
  - edge cases: filter contains quotes → properly escaped in the hint string.

- AC4: `get_tenant_mapping` with no `companyNameFilter` returns `kbHint` with a generic suggestion (`get_knowledge({ category: "playbook" })`).
  - test name: "attaches generic kbHint to get_tenant_mapping when no companyNameFilter"

- AC5: `get_event_field_samples` returns `kbHint` containing `get_knowledge({ eventId: "<id>" })` for the eventId in params.
  - test name: "attaches event-scoped kbHint to get_event_field_samples"

- AC6: `get_event_schema` returns `kbHint` containing `get_knowledge({ eventId: "<id>" })`.
  - test name: "attaches event-scoped kbHint to get_event_schema"

- AC7: When `this.knowledgeBase` is null (KB not loaded), NO `kbHint` is attached to any tool response — even on first call.
  - test name: "suppresses kbHint entirely when KB is not loaded"
  - rationale: nudging the LLM to call `get_knowledge` when it returns "KB not available" is just noise.

- AC8: `query_telemetry`, `save_query`, `get_categories`, `list_profiles` responses are NEVER modified with `kbHint` (regression guard for scope creep).
  - test name: "never attaches kbHint to non-pre-query tools"
  - covers all four of those tools in one parameterized test.

## Telemetry (Rule 13)
- Event ID: `TELEMETRY_EVENTS.MCP_TOOLS.KB_HINT_EMITTED` = `'TB-MCP-114'`
- `trackEvent` call in: `packages/mcp/src/tools/toolHandlers.ts:maybeAttachKbHint` — fired only when a hint is actually attached (after the suppression rules pass).
- Properties:
  - `toolName` — which tool emitted the hint (`get_event_catalog` | `get_tenant_mapping` | `get_event_field_samples` | `get_event_schema`)
  - `hasEventIds` — `'true'` | `'false'` (whether the hint included specific event IDs)
  - `hasCustomerSearch` — `'true'` | `'false'` (for tenant-mapping path)
  - `profileHash` — same hash already used by other MCP tool events
- No PII: customer name from `companyNameFilter` is NOT sent — only the boolean flag.

## Open questions / assumptions
- Q: Should we re-emit the hint on every subsequent pre-query tool call within the same session if the LLM kept ignoring it? **Assumption:** No — once `kbConsulted` flips, it stays true for the session lifetime. The point is one well-placed nudge, not a repeated one. If the LLM ignores even the parameterized hint, that's a signal we need a stronger mechanism (separate plan).
- Q: Should the hint string include token-cost-conscious wording like "this is a 30-token hint"? **Assumption:** No — agents don't reason about token cost; keep it terse and instructive.
- Assumption: `get_event_catalog`'s `significantEvents` array exists on the result object today. Verify in implementation; if not, derive from the events list using the same heuristic the catalog tool already documents (90% of volume).
- Assumption: A single `kbConsulted` boolean per `ToolHandlers` instance is the right granularity. Stdio MCP creates one `ToolHandlers` per connection, so one boolean = one chat session. HTTP MCP shares a single instance across requests, but only the extension's command-palette features hit HTTP, and those are not the chat surface this nudge targets. (If HTTP cross-session bleed becomes a problem later, switch to a `Map<sessionId, boolean>` — out of scope here.)

## Risks
- The LLM may still ignore the hint (it's data, but it's still advisory). If so, we'll see `KB_HINT_EMITTED` events with no follow-up `GET_KNOWLEDGE` event in the same session — measurable, and the trigger to consider full content injection.
- Hint text may collide with a future tool result field named `kbHint`. Low risk — none exists today; document the field in the affected tool definitions if it persists.
- `companyNameFilter` containing characters that break a JSON-style suggestion string (quotes, backslashes). Mitigation: build the suggestion via `JSON.stringify` rather than string concatenation.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Adds one new optional response field (`kbHint`) to four tools; no existing field is renamed or removed.
  - Suggestion strings are derived from values already in the call's params/result — no new external dependency, no new I/O.
  - Suppression rules ensure no behavior change when KB is not loaded (current default for workspaces without `.bctb-config.json`).
- **Who/what could break:**
  - MCP tool consumers who *strict-shape-match* tool responses (e.g. parse with a closed schema). Unlikely — JSON tool responses are typically open. None known internally.
  - Telemetry pipeline: new event ID `TB-MCP-114` is additive; existing dashboards keep working.
  - Cache files / saved queries / KB cache: untouched.
  - Extension webview: untouched (Issue 2 is a separate plan).
- **Detection:**
  - Regression: AC8 fails if the hint leaks into non-pre-query tools.
  - Field-shape regression: existing tool tests fail if the result JSON shape gains an unexpected field by surprise (we update them deliberately to allow the optional field).
  - User-visible signal: a chat where `get_event_catalog` returns *both* `significantEvents` and `kbHint`, and a follow-up turn where the LLM calls `get_knowledge` with the suggested params — visible in MCP logs and in `KB_HINT_EMITTED` → `GET_KNOWLEDGE` event sequencing.

Patch release (MCP `v3.3.13`). No CHANGELOG BREAKING entry.

## Out-of-scope follow-ups
- **Pre-existing npm audit findings** carried over from baseline (not introduced by this cycle): mcp 11 high + 2 critical; shared 5 high + 1 critical; extension 8 high + 1 critical. Runtime deps include handlebars, hono, undici, jws, protobufjs, path-to-regexp. Needs a dedicated dep-bump plan before next release.
- Decide whether the legacy `getWorkspacePath()` in extension.ts:901-904 should also migrate to `findConfigWorkspace()` (separate latent bug, only affects HTTP MCP / command palette).
- Issue 2: webview multi-root path bug — separate plan.
- Issue 1, escalation path if nudges still fail: KB metadata injection (id+title+1-line per matched article) into `get_event_catalog` and `get_tenant_mapping`. Re-evaluate after collecting `KB_HINT_EMITTED` vs `GET_KNOWLEDGE` correlation data.
- Deprecation of the `MANDATORY: Call get_knowledge…` block in `SERVER_INSTRUCTIONS` once the data-channel nudge proves effective.
