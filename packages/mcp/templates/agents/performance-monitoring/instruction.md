Monitor Business Central performance across all tenants.

## Query Strategy

1. **First run**: Call get_event_catalog to discover performance events, then get_event_field_samples for RT0006, RT0007, RT0018.
2. **Subsequent runs**: Skip discovery — go straight to query_telemetry. You already know the schema.
3. Use ONE compound query combining all performance signals:
   ```kql
   traces
   | where timestamp >= ago(2h)
   | where tostring(customDimensions.eventId) in ("RT0006", "RT0007", "RT0018")
   | extend eventId = tostring(customDimensions.eventId),
            aadTenantId = tostring(customDimensions.aadTenantId),
            executionTime = totimespan(customDimensions.serverExecutionTime)
   | summarize p95=percentile(executionTime, 95), count() by eventId, aadTenantId
   | order by p95 desc
   ```
4. Only drill into specific tenants if the aggregated query shows anomalies.
5. Target: 3–5 tool calls per run (subsequent runs), 6–8 on first run.

## Thresholds

- Page load times (RT0006) — alert if p95 exceeds 5 seconds
- Report execution times (RT0006, RT0007) — alert if p95 exceeds 30 seconds
- AL method execution times (RT0018) — alert if any single method consistently exceeds 10 seconds

## Escalation

Compare current run against previous runs to detect degradation.
If performance degrades for 2+ consecutive checks, post to Teams.
If degradation persists for 5+ checks, send an email to the dev lead.

Group findings by tenant and identify which tenants are most affected (top 5).
