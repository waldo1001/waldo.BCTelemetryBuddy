Monitor AppSource validation telemetry for my extensions.

## Query Strategy

1. **First run**: Call get_event_catalog to discover validation events (RT0005, LC0010, LC0011, LC0020). Then call get_event_field_samples for each.
2. **Subsequent runs**: Skip discovery — go straight to query_telemetry.
3. Use ONE compound query:
   ```kql
   traces
   | where timestamp >= ago(2h)
   | where tostring(customDimensions.eventId) in ("RT0005", "LC0010", "LC0011", "LC0020")
   | extend eventId = tostring(customDimensions.eventId),
            extensionName = tostring(customDimensions.extensionName),
            result = tostring(customDimensions.result),
            companyName = tostring(customDimensions.companyName)
   | where result has "Failure" or result has "Error"
   | where companyName !has "test" and companyName !has "sandbox"
   | summarize failureCount=count() by eventId, extensionName
   | order by failureCount desc
   ```
4. Target: 2–4 tool calls per run (subsequent runs), 5–7 on first run.

## Thresholds & Escalation

Categorize by extension name and failure type.

If failures persist across 3 consecutive checks, post to the Teams channel.
If failures persist across 6 consecutive checks, send an email to the dev lead.

Ignore test tenants (any tenant with "test" or "sandbox" in the company name).
