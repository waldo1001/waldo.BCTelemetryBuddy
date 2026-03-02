Monitor overall error rates across Business Central environments.

## Query Strategy

1. **First run**: Call get_event_catalog with status="error" to discover error events. Then call get_event_field_samples for the top 3 most frequent error event types.
2. **Subsequent runs**: Skip discovery — go straight to query_telemetry.
3. Use ONE compound query for all error events:
   ```kql
   traces
   | where timestamp >= ago(1h)
   | extend eventId = tostring(customDimensions.eventId),
            aadTenantId = tostring(customDimensions.aadTenantId),
            result = tostring(customDimensions.result)
   | where result has "Failure" or result has "Error"
   | summarize errorCount=count() by eventId, aadTenantId
   | order by errorCount desc
   | take 20
   ```
4. Run a second query for overall health (success vs error ratio) if needed.
5. Target: 3–5 tool calls per run (subsequent runs), 6–8 on first run.

## Thresholds

Flag any event type where:
- Error count in the last hour exceeds 100, OR
- Error rate increased by more than 200% compared to the typical rate from previous runs

## Escalation

For flagged issues:
- First detection: Log the finding (no action)
- Second consecutive detection: Post to Teams with affected tenants and error details
- Third consecutive detection: Send an email to the dev lead

Summarize overall health: percentage of events in error vs success state.
