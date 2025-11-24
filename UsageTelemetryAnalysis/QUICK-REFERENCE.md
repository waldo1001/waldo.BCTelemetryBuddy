# Quick Reference - Usage Telemetry vs BC Telemetry

## At a Glance

| Purpose | Table | Event ID Location | Example Event |
|---------|-------|-------------------|---------------|
| **Analyze BC Telemetry** | `traces` | `customDimensions.eventId` | RT0005, LC0012 |
| **Analyze Tool Usage** | `customEvents` | `name` column | Mcp.QueryTelemetry |

## Quick Detection

**You're analyzing BC Telemetry if:**
- User mentions customers, companies, AL extensions
- Looking for RT/LC event IDs
- Analyzing Business Central performance/errors
- Use `traces` table

**You're analyzing Usage Telemetry if:**
- User mentions "this tool", "this extension", "usage stats"
- Questions about features, adoption, users
- Files in `UsageTelemetryAnalysis/` folder
- Use `customEvents` table

## Table Comparison

### BC Telemetry (`traces`)
```kql
traces
| where timestamp >= ago(7d)
| where tostring(customDimensions.eventId) == "RT0005"
| extend 
    companyName = tostring(customDimensions.companyName),
    aadTenantId = tostring(customDimensions.aadTenantId),
    executionTime = toreal(customDimensions.executionTimeInMs)
```

### Usage Telemetry (`customEvents`)
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend 
    success = tobool(customDimensions.success),
    queryName = tostring(customDimensions.queryName),
    durationMs = todouble(customMeasurements.durationMs)
```

## Common Query Patterns

### Discovery

**BC Telemetry:**
```kql
// Use MCP tools
mcp_bc_telemetry__get_event_catalog()
mcp_bc_telemetry__get_event_field_samples("RT0005")
```

**Usage Telemetry:**
```kql
// Direct queries
customEvents
| summarize count() by name
```

### Performance Analysis

**BC Telemetry:**
```kql
traces
| where customDimensions.eventId == "RT0005"
| extend duration = toreal(customDimensions.executionTimeInMs)
| summarize P95 = percentile(duration, 95)
```

**Usage Telemetry:**
```kql
customEvents
| where name == "Mcp.QueryTelemetry"
| extend duration = todouble(customMeasurements.durationMs)
| summarize P95 = percentile(duration, 95)
```

### User/Customer Analysis

**BC Telemetry:**
```kql
traces
| extend 
    company = tostring(customDimensions.companyName),
    tenant = tostring(customDimensions.aadTenantId)
| summarize Events = count() by company, tenant
```

**Usage Telemetry:**
```kql
customEvents
| summarize 
    Events = count(),
    Sessions = dcount(session_Id)
    by user_Id
```

## Field Extraction Cheatsheet

### BC Telemetry
```kql
| extend 
    eventId = tostring(customDimensions.eventId),
    aadTenantId = tostring(customDimensions.aadTenantId),
    companyName = tostring(customDimensions.companyName),
    environmentName = tostring(customDimensions.environmentName),
    environmentType = tostring(customDimensions.environmentType),
    extensionName = tostring(customDimensions.extensionName),
    alObjectName = tostring(customDimensions.alObjectName)
```

### Usage Telemetry
```kql
| extend 
    // From customDimensions
    eventId = tostring(customDimensions.eventId),
    success = tobool(customDimensions.success),
    errorType = tostring(customDimensions.errorType),
    component = tostring(customDimensions.component),
    version = tostring(customDimensions.version),
    // From customMeasurements
    durationMs = todouble(customMeasurements.durationMs),
    resultRowCount = tolong(customMeasurements.resultRowCount),
    // From standard columns
    userId = tostring(user_Id),
    sessionId = tostring(session_Id)
```

## Example Questions

### BC Telemetry Questions
- "Show me slow queries for customer Contoso"
- "What RT0012 events occurred today?"
- "Analyze deadlocks in the Sales extension"
- "Performance issues in environment Production"

### Usage Telemetry Questions
- "How many users are active today?"
- "What's the most popular feature?"
- "Show query performance trends"
- "Error rate for the extension"
- "Cache hit rate this week"

## Tools to Use

### BC Telemetry
✅ `mcp_bc_telemetry__get_event_catalog`  
✅ `mcp_bc_telemetry__get_event_field_samples`  
✅ `mcp_bc_telemetry__get_tenant_mapping`  
✅ `mcp_bc_telemetry__query_telemetry`  
✅ `mcp_bc_telemetry__save_query`  

### Usage Telemetry
❌ Don't use MCP discovery tools (they expect `traces` table)  
✅ Write direct KQL queries against `customEvents`  
✅ Use standard Application Insights columns  
✅ Can still use save_query for reusable patterns  

## Typical Workflows

### Analyzing BC Customer Issues
1. `get_event_catalog()` - discover events
2. `get_event_field_samples("RT0005")` - understand structure
3. `get_tenant_mapping()` - find customer tenant ID
4. `query_telemetry()` - execute analysis
5. Present findings to user

### Analyzing Tool Usage
1. Discover events: `customEvents | summarize count() by name`
2. Inspect structure: `customEvents | where name == "X" | take 5`
3. Build analysis query directly
4. Execute and present results
5. Save useful patterns as reusable queries

## Configuration

### BC Telemetry Profile
```json
{
  "bcTelemetryBuddy.profiles": [
    {
      "name": "Customer Production",
      "appInsightsAppId": "customer-app-id",
      "kustoCluster": "cluster.region.kusto.windows.net",
      "kustoDatabase": "customer_database"
    }
  ]
}
```

### Usage Telemetry Profile
```json
{
  "bcTelemetryBuddy.profiles": [
    {
      "name": "Tool Usage Analytics",
      "appInsightsAppId": "bctb-usage-app-id",
      "kustoCluster": "usage.region.kusto.windows.net",
      "kustoDatabase": "bctb_usage_telemetry"
    }
  ]
}
```

## Summary

| Aspect | BC Telemetry | Usage Telemetry |
|--------|--------------|-----------------|
| **What** | Business Central app performance/errors | BC Telemetry Buddy tool usage |
| **Who** | BC customers/companies | Extension users |
| **Table** | `traces` | `customEvents` + `customMetrics` |
| **Events** | RT0005, LC0012, etc. | Mcp.QueryTelemetry, Extension.CommandExecuted |
| **Tools** | Use MCP discovery tools | Direct KQL queries |
| **Filter** | By tenant, company, extension | By user, session, version |
| **Audience** | BC developers, consultants | Tool maintainers, product analytics |

---

**When in doubt:**  
- Look at the **table name** in the query  
- Check if it's about **BC customers** (traces) or **tool users** (customEvents)  
- Read the folder context (`UsageTelemetryAnalysis/` = usage telemetry)
