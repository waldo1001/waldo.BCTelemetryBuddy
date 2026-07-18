---
name: kb-article-creation
description: "Knowledge Base article creation workflow for BC Telemetry Buddy. Automates: GitHub issue intake → validation prompt generation → article creation from validated report → index regeneration → issue closure. Use when: creating new KB articles from GitHub issues, validating telemetry event schemas, writing playbooks/query-patterns/event-interpretations."
---

# /kb-article-creation — BC Telemetry Buddy Knowledge Base workflow

You are creating a new knowledge base article for BC Telemetry Buddy. This skill guides you through the validated, repeatable workflow.

## When to use

- A GitHub issue with label `knowledge-base` needs implementation
- User asks to create a new KB article for any BC telemetry event
- User provides a validation report and wants the article written

> KB issues are **exempt from the SDD spec flow** (Rule 14) — they produce `knowledge-base/**` content, not code. Do not write a `docs/specs/` file for them; this skill is their entire workflow.

## Workflow Phases

```
INTAKE → VALIDATE → WRITE → CORRECT → INDEX → CLOSE
```

| # | Phase | Produces | Gate |
|---|---|---|---|
| 1 | **INTAKE** | Parsed issue requirements | Confirm event IDs and category |
| 2 | **VALIDATE** | Validation prompt file | User runs in MCP-connected session |
| 3 | **WRITE** | KB article `.md` file | Based on validation report |
| 4 | **CORRECT** | Updated article | User provides corrections from re-validation |
| 5 | **INDEX** | Updated `knowledge-base/index.json` | Must pass `--check` |
| 6 | **CLOSE** | GitHub issue closed with summary | `gh issue close` |

---

## Phase 1: INTAKE

1. Fetch the GitHub issue URL to extract:
   - Event ID(s) (e.g., RT0028, LC0101)
   - Proposed category: `playbook` | `query-pattern` | `event-interpretation` | `vendor-pattern`
   - Draft queries (if provided)
   - Key fields mentioned
   - When to use / when not to use

2. Determine the article filename: `knowledge-base/{category-plural}/{slug}.md`
   - Slug is kebab-case derived from the title
   - Category folders: `playbooks/`, `query-patterns/`, `event-interpretations/`, `vendor-patterns/`

3. Confirm with user: "Creating `{category}` article for `{eventId}` — proceed to validation?"

---

## Phase 2: VALIDATE

Generate a validation prompt file at `docs/{eventId}-validation-prompt.md`.

The prompt MUST include these sections (adapt event IDs):

### Template structure:

```markdown
# {EventId} Validation Prompt

> Paste this prompt into a session that has BCTB MCP tools connected to Application Insights with {EventId} data.

---

## Context
[What article we're writing and why]

## Validation Steps — Run ALL of these

### Step 1: Event Catalog Check
Call `get_event_catalog` with daysBack: 30, status: "all", minCount: 1
Report: Is {EventId} present? Count? Related events?

### Step 2: Event Schema
Call `get_event_field_samples` with eventId: "{EventId}", sampleCount: 20, daysBack: 30
Report: ALL fields, types, populated %, notes.

### Step 3: Field Samples
Report sample values for each field. Flag key fields for the use case.

### Step 4: Draft Query Validation
[Include ALL draft KQL queries from the issue]
For each: run via `query_telemetry`, report SUCCESS/FAILED, row count, corrections.

### Step 5: Field Discovery
If queries failed due to wrong field names, report correct names and re-run.

### Step 6: Additional Insights
- Additional useful fields not in drafts?
- Stack trace format/usefulness?
- Session type / client type field?
- Related companion events?

## Output Format
[Structured report template — Event Presence, Schema table, Field Samples, Query Results, Field Name Corrections, Additional Useful Fields, Interpretation Notes]
```

**After creating the file, tell the user:**
> Validation prompt saved to `docs/{eventId}-validation-prompt.md`. Run this in your MCP-connected session and paste back the report.

**Then STOP and wait for the validation report.**

---

## Phase 3: WRITE

When the user provides the validation report:

1. **Parse the report** for:
   - Confirmed field names and types
   - Query corrections (field name fixes, regex patterns)
   - Additional useful fields discovered
   - Interpretation insights

2. **Create the article** at `knowledge-base/{category-plural}/{slug}.md` with:

   **Frontmatter** (required):
   ```yaml
   ---
   id: {slug}
   title: "{Title} ({EventId})"
   category: {category-singular}
   tags: [{eventId}, {relevant}, {tags}]
   eventIds: [{EventId}, {related-ids}]
   appliesTo: "BC 20.0+"
   author: waldo
   created: {today}
   updated: {today}
   ---
   ```

   **Body structure** (adapt to category):
   - `## When to use this` — bullet list of scenarios
   - `## When NOT to use this` — what to use instead
   - `## Key Fields` — table with Field, Populated %, Use
   - `## Step N: {title}` — investigation steps with KQL queries
   - `## Interpretation Tips` — bullet list of patterns and what they mean
   - `## Related Playbooks` — links to companion articles
   - `## Event Reference` — table of event IDs used

3. **Rules for queries:**
   - Use ONLY field names confirmed in the validation report
   - Always `tostring()` customDimensions fields in summarize/extend
   - Handle empty/null fields (use `iif` for fallback)
   - Include `| where timestamp > ago(30d)` for bounded queries
   - Add `| render timechart` where appropriate

4. **Document non-existent fields** explicitly:
   - If the issue assumed fields that don't exist, add a "Fields that do NOT exist" callout

---

## Phase 4: CORRECT

If the user provides corrections after re-validation:

1. Apply all field name corrections
2. Fix regex patterns
3. Update any incorrect event references
4. Verify no stale field names remain

---

## Phase 5: INDEX

Run:
```bash
node scripts/generate-kb-index.js
node scripts/generate-kb-index.js --check
```

Both must succeed. If `--check` fails, the index wasn't regenerated properly.

---

## Phase 6: CLOSE

Close the GitHub issue:
```bash
gh issue close {NUMBER} --repo waldo1001/waldo.BCTelemetryBuddy --comment "✅ KB article created and validated: \`knowledge-base/{path}\`

**Validation completed:**
- {summary of what was validated}
- {field corrections made}
- {query count} queries tested and working

**Article includes:** {step count} investigation steps, field reference, interpretation tips."
```

Clean up the validation prompt file:
```bash
rm docs/{eventId}-validation-prompt.md
```

---

## Article Category Guidelines

| Category | Use for | Structure emphasis |
|---|---|---|
| `playbook` | Multi-step investigation workflows | Steps 1-N with progressive drill-down |
| `query-pattern` | Reusable single-purpose KQL templates | Query + parameters + interpretation |
| `event-interpretation` | Understanding what an event means | Field-by-field explanation |
| `vendor-pattern` | ISV/extension-specific patterns | Vendor context + extension fields |

---

## Quick Reference

- **Frontmatter required fields:** `id`, `title`, `category`, `tags`
- **Category values (singular):** `playbook`, `query-pattern`, `event-interpretation`, `vendor-pattern`
- **Folder names (plural):** `playbooks/`, `query-patterns/`, `event-interpretations/`, `vendor-patterns/`
- **Index generator:** `node scripts/generate-kb-index.js`
- **Existing articles for reference:**
  - `knowledge-base/playbooks/environment-upgrade-troubleshooting.md`
  - `knowledge-base/playbooks/deadlock-root-cause-analysis.md`
  - `knowledge-base/event-interpretations/database-wait-statistics.md`
  - `knowledge-base/query-patterns/lock-timeout-investigation.md`
  - `knowledge-base/query-patterns/job-queue-health-check.md`
