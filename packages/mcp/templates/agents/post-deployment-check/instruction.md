Post-deployment monitoring mode.

## Query Strategy

1. **First run (post-deployment baseline)**: Call get_event_catalog to discover events. Then use ONE compound query to capture error counts + performance metrics across all signals.
2. **Subsequent runs**: Skip discovery — go straight to query_telemetry with the same compound query.
3. Use ONE query combining error rates and performance:
   ```kql
   traces
   | where timestamp >= ago(2h)
   | extend eventId = tostring(customDimensions.eventId),
            result = tostring(customDimensions.result),
            aadTenantId = tostring(customDimensions.aadTenantId)
   | summarize
       totalCount=count(),
       errorCount=countif(result has "Failure" or result has "Error")
       by eventId
   | extend errorRate=round(100.0 * errorCount / totalCount, 1)
   | order by errorCount desc
   ```
4. Compare these results against previous state (stored from prior runs).
5. Target: 2–4 tool calls per run.

## Thresholds

Flag any metric that has worsened by more than 50% compared to pre-deployment baseline.

## Escalation

If any regression is detected:
- Immediately post to Teams with specific metrics and comparison
- Send an email to the dev lead with "deployment-regression" in the subject

This agent should be started manually after a deployment and paused after 24 hours
of stable operation.
