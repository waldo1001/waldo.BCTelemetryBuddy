/**
 * MCP Server-Level Instructions
 * 
 * Returned in the MCP `initialize` response as the `instructions` field.
 * This is the standard MCP mechanism for guiding ANY connected agent
 * (GitHub Copilot, Claude Desktop, Cursor, etc.) on how to use this server's tools.
 * 
 * Unlike tool descriptions (which guide individual tool calls), server instructions
 * provide the overarching workflow that agents MUST follow for correct results.
 * 
 * This is separate from tool definitions (SRP) and can be iterated independently.
 */

/**
 * Server-level instructions that guide agents on the correct tool-call workflow.
 * Injected into the MCP `initialize` response so every MCP client receives it
 * automatically during the protocol handshake.
 */
export const SERVER_INSTRUCTIONS = `# BC Telemetry Buddy — Tool Usage Guide

You are connected to the **BC Telemetry Buddy** MCP server, which provides tools for querying and analyzing Microsoft Dynamics 365 Business Central telemetry data stored in Azure Application Insights.

## MANDATORY Tool-Call Sequence

You MUST follow this sequence when building KQL queries. Skipping steps produces broken queries, wrong data types, and wasted tokens on retries.

### Step 1: Discover Events
Call \`get_event_catalog\` FIRST to discover which event IDs exist in the telemetry data.
- Without this, you cannot know which events are available.
- Use filters (status, minCount) to narrow results.
- The response includes a \`significantEvents\` list: events covering 90% of total volume. Investigate ALL of these, not just the first one.

### Step 2: Consult Knowledge Base
Call \`get_knowledge\` with the event IDs discovered in Step 1 to check for proven KQL patterns before writing from scratch.
- \`get_knowledge({ eventId: "RT0006" })\` — find patterns related to a specific event
- \`get_knowledge({ category: "playbook" })\` — find investigation playbooks
- \`get_knowledge({ search: "deadlock" })\` — free-text search
- KB articles are starting points, not the full picture — always follow with Step 3 to catch new fields not yet covered by the article.
- Local workspace articles take precedence over community articles.

### Step 3: Understand Event Fields (MANDATORY before ANY KQL)
Call \`get_event_field_samples\` for EVERY significant event ID from Step 1.
- The catalog response lists events that cover 90% of total volume — call \`get_event_field_samples\` for ALL of them, not just the first one.
- BC events have 20+ fields in customDimensions — you CANNOT guess them.
- This reveals exact data types: duration fields (executionTime, totalTime, serverTime) are TIMESPAN ("hh:mm:ss.fffffff"), NOT numbers. Getting this wrong silently breaks queries.
- Returns real sample values so you write correct KQL on the first attempt.
- Returns a ready-to-use example query — use it as your starting point.
- If \`get_event_field_samples\` reveals fields not mentioned in a KB article, note them for the user.

### Step 4: Map Tenants (when filtering by customer)
Call \`get_tenant_mapping\` when the user mentions a customer or company name.
- BC telemetry uses aadTenantId (GUIDs) for filtering, NOT company names.
- ALWAYS filter KQL by aadTenantId, NEVER by companyName.

### Step 5: Write and Execute KQL
Call \`query_telemetry\` with KQL that is shaped by what Steps 1-4 told you.
- Use field names, data types, and patterns from get_event_field_samples.
- Do NOT guess field names or types.

### Step 6: Save Useful Queries
Call \`save_query\` to persist successful queries for future reuse.

## FORBIDDEN Patterns

These patterns are EXPLICITLY BANNED — never use them:

1. **\`take 1 | project customDimensions\`** — This is unnecessary. \`get_event_field_samples\` already samples 20 rows internally and gives you complete field lists, data types (with automatic timespan detection), occurrence rates, sample values, AND a ready-to-use example query — far more than a raw projection. Always call \`get_event_field_samples\` first; if you still need raw rows after that, use \`query_telemetry\`.

2. **Guessing field names** — Do NOT invent customDimensions field names. Call \`get_event_field_samples\` first.

3. **Treating duration fields as numbers** — Fields like executionTime, totalTime, serverTime are TIMESPAN format ("hh:mm:ss.fffffff"). Use \`totimespan()\` for conversion, not \`toint()\` or \`toreal()\`.

4. **Filtering by companyName** — Always filter by \`aadTenantId\`. Use \`get_tenant_mapping\` to resolve company names to tenant IDs.

## Multi-Profile Workspaces

If the workspace has multiple telemetry profiles:
1. Call \`list_profiles\` to see available profiles and which is active.
2. Call \`switch_profile\` to change to a different customer/environment profile.
3. All subsequent queries use the active profile's credentials.

## Application Insights Tables

| Table | When to use |
|-------|-------------|
| **traces** | MOST queries — all BC runtime events (errors, performance, lifecycle). Each row has customDimensions with eventId and event-specific fields. |
| **pageViews** | Page load times and Web Client performance only. |
| customEvents, customMetrics | Rarely — not standard BC telemetry. |
| requests, dependencies, exceptions | Almost never — HTTP pipeline tables, BC does not emit here. |

Start with \`traces\` unless the question is specifically about page load performance.

## Efficiency Tips

- Combine multiple event types: \`eventId in ("RT0006","RT0007","RT0018")\`
- Multi-dimensional aggregation: \`summarize count() by eventId, aadTenantId\`
- Top-N filtering: \`top 10 by count_\`
- Fewer, smarter queries beat many granular ones.

## Question Coaching & Answer Validation

**The quality of the question determines the quality of the answer.** AI scales thinking — good AND bad.

### When the user's question is vague (e.g., "any problems?", "is it slow?", "what's going on?"):
1. **Rephrase first** — Tell the user what you understood and how you'll investigate before executing.
2. **Suggest investigation paths** — Use \`get_event_catalog\` results to offer 2-3 specific angles (errors, performance, usage patterns).
3. **Let the user choose** — Don't assume which direction to take; present options.

### After presenting results:
1. **State assumptions** — Time range, event scope, tenant selection, what was NOT investigated.
2. **Flag limitations** — Sample size, data coverage gaps, events not included.
3. **Suggest verification** — How the user can double-check your conclusions against what they know.
4. **Propose follow-up questions** — 2-3 deeper questions that build on the findings.

**Why**: Users tend to accept AI output at face value because it looks structured and confident. Stating assumptions and suggesting verification builds critical thinking skills and prevents acting on flawed analysis.
`;

/**
 * Workflow prompt content — same guidance in message format for the MCP prompts/get endpoint.
 * Used by agents that support MCP prompt invocation.
 */
export const WORKFLOW_PROMPT_CONTENT = `Follow the BC Telemetry Buddy tool-call workflow:

1. **get_event_catalog** → Discover available events (ALWAYS FIRST)
2. **get_knowledge(eventId)** → Check knowledge base for proven patterns (BEFORE writing KQL)
3. **get_event_field_samples(eventId)** → Understand fields & types for EACH event (MANDATORY before KQL)
4. **get_tenant_mapping** → Resolve customer names to aadTenantId (when filtering by customer)
5. **query_telemetry** → Execute KQL shaped by what discovery told you (NEVER guess)
6. **save_query** → Persist useful queries for reuse

UNNECESSARY: Do not use "take 1 | project customDimensions" — get_event_field_samples already does this (samples 20 rows) and returns richer results including field types, occurrence rates, and a ready-to-use query.
FORBIDDEN: Never guess field names or treat duration fields as numbers (they are TIMESPAN).
FORBIDDEN: Never filter by companyName — use aadTenantId from get_tenant_mapping.

COACHING: For vague questions, rephrase into a specific question and suggest 2-3 investigation paths before executing.
VALIDATION: After every analysis, state your assumptions, flag limitations, and suggest follow-up questions to go deeper.`;
