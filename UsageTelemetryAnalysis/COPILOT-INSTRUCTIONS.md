# Copilot Instructions for Usage Telemetry Analysis

## Context Detection

When the user's request includes any of these indicators, you are analyzing **usage telemetry for BC Telemetry Buddy itself**, NOT Business Central telemetry:

**Strong Indicators:**
- References to "usage telemetry" or "UsageTelemetryAnalysis"
- File paths in `UsageTelemetryAnalysis/` folder
- Mentions of "this software", "this project", "this extension", "this tool"
- Queries starting with `customEvents` or `customMetrics`
- Event names starting with "TB-" (e.g., TB-EXT-001, TB-MCP-101)
- References to extension/MCP tool performance
- Questions about "how many users", "what features are used", "adoption"

**Examples:**
- "Show me usage stats for BC Telemetry Buddy"
- "How many users are running queries?"
- "What's the cache hit rate?"
- "Show errors in the extension"
- "Analyze tool performance"

## Critical Mode Switch

When usage telemetry context is detected, **immediately switch modes:**

### ❌ DO NOT Use (Business Central Mode):
- ~~`traces` table~~ → Use `customEvents` instead
- ~~`customDimensions.eventId` filtering~~ → Use `name` column
- ~~`get_event_catalog` tool~~ → Manual discovery queries
- ~~`get_event_field_samples` tool~~ → Manual inspection queries
- ~~BC-specific patterns (RT0005, RT0012, etc.)~~ → TB-XXX-NNN patterns

### ✅ DO Use (Usage Telemetry Mode):
- `customEvents` as primary table
- `customMetrics` for performance metrics
- `name` column for event identification (e.g., "Mcp.QueryTelemetry")
- `customDimensions` and `customMeasurements` extraction
- `user_Id`, `session_Id`, `operation_Id` for correlation
- Direct KQL queries without MCP discovery tools

## Query Structure Templates

### Event Discovery
```kql
customEvents
| where timestamp >= ago(30d)
| summarize EventCount = count(), SampleData = take_any(customDimensions) by name
| order by EventCount desc
```

### Event Structure Inspection
```kql
customEvents
| where name == "EventName"
| take 5
| project timestamp, name, customDimensions, customMeasurements, user_Id, session_Id
```

### Basic Usage Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend 
    success = tobool(customDimensions.success),
    queryName = tostring(customDimensions.queryName),
    cacheHit = tobool(customDimensions.cacheHit)
| summarize 
    TotalQueries = count(),
    SuccessRate = countif(success) * 100.0 / count(),
    CacheHitRate = countif(cacheHit) * 100.0 / count()
```

### Performance Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend durationMs = todouble(customMeasurements.durationMs)
| summarize 
    P50 = percentile(durationMs, 50),
    P95 = percentile(durationMs, 95),
    P99 = percentile(durationMs, 99),
    Max = max(durationMs)
    by bin(timestamp, 1h)
```

### User Activity
```kql
customEvents
| where timestamp >= ago(30d)
| summarize 
    TotalEvents = count(),
    UniqueUsers = dcount(user_Id),
    UniqueSessions = dcount(session_Id)
    by bin(timestamp, 1d)
| extend AvgEventsPerUser = TotalEvents * 1.0 / UniqueUsers
```

## Workflow

### Step 1: Acknowledge Context
When usage telemetry is detected, acknowledge:
> "I see you're analyzing usage telemetry for BC Telemetry Buddy itself. I'll use `customEvents` table instead of `traces`."

### Step 2: Discover Event Structure (if needed)
If the user asks about a feature but doesn't specify an event name:
```kql
customEvents
| where timestamp >= ago(7d)
| where name contains "keyword"
| summarize count() by name
```

### Step 3: Inspect Sample Data
```kql
customEvents
| where name == "DiscoveredEventName"
| take 3
| project customDimensions, customMeasurements
```

### Step 4: Build Analysis Query
Based on discovered structure, create the appropriate analysis query.

### Step 5: Present Results
- Show query used
- Summarize findings clearly
- Highlight interesting patterns
- Suggest follow-up questions if relevant

## Common Analysis Patterns

### Feature Adoption
```kql
customEvents
| where timestamp >= ago(30d)
| summarize UsageCount = count(), UniqueUsers = dcount(user_Id) by name
| extend UsagePerUser = round(UsageCount * 1.0 / UniqueUsers, 2)
| order by UsageCount desc
```

### Error Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| extend success = tobool(customDimensions.success)
| where success == false
| extend errorType = tostring(customDimensions.errorType)
| summarize ErrorCount = count(), AffectedUsers = dcount(user_Id) by errorType, name
| order by ErrorCount desc
```

### Performance Degradation Detection
```kql
customEvents
| where timestamp >= ago(14d)
| where name == "Mcp.QueryTelemetry"
| extend durationMs = todouble(customMeasurements.durationMs)
| summarize AvgDuration = avg(durationMs), QueryCount = count() by bin(timestamp, 1d)
| extend DayOfWeek = format_datetime(timestamp, 'dddd')
| order by timestamp desc
```

### Cache Effectiveness
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend cacheHit = tobool(customDimensions.cacheHit)
| summarize 
    TotalQueries = count(),
    CacheHits = countif(cacheHit == true),
    CacheMisses = countif(cacheHit == false),
    HitRate = round(countif(cacheHit == true) * 100.0 / count(), 2)
    by bin(timestamp, 1d)
```

### User Journey Analysis
```kql
customEvents
| where session_Id == "specific-session-id"  // Replace with actual session
| order by timestamp asc
| project timestamp, name, Action = tostring(customDimensions.commandId)
```

### Version Comparison
```kql
customEvents
| where timestamp >= ago(30d)
| extend version = tostring(customDimensions.version)
| summarize 
    UniqueUsers = dcount(user_Id),
    EventCount = count()
    by version
| order by UniqueUsers desc
```

## Expected Event Names

Based on the project's telemetry design, you should expect events like:

**Extension Events:**
- `Extension.Activated`
- `Extension.Deactivated`
- `Extension.CommandExecuted`
- `Extension.ConfigChanged`
- `Extension.ChatParticipantInvoked`
- `Extension.Error`

**MCP Events:**
- `Mcp.ServerStarted`
- `Mcp.ServerStopped`
- `Mcp.QueryTelemetry`
- `Mcp.GetSavedQueries`
- `Mcp.SaveQuery`
- `Mcp.SearchQueries`
- `Mcp.GetEventCatalog`
- `Mcp.GetEventFieldSamples`
- `Mcp.GetEventSchema`
- `Mcp.GetTenantMapping`

**Kusto Events:**
- `Kusto.QueryExecuted`
- `Kusto.QueryFailed`
- `Kusto.AuthTokenAcquired`
- `Kusto.AuthTokenExpired`

**Cache Events:**
- `Cache.Hit`
- `Cache.Miss`
- `Cache.Invalidated`

**Auth Events:**
- `Auth.DeviceCodeFlowStarted`
- `Auth.TokenAcquired`
- `Auth.TokenRefreshed`
- `Auth.AuthenticationFailed`

## Field Extraction Patterns

### From customDimensions (properties)
```kql
| extend 
    eventId = tostring(customDimensions.eventId),
    success = tobool(customDimensions.success),
    errorType = tostring(customDimensions.errorType),
    component = tostring(customDimensions.component),
    version = tostring(customDimensions.version),
    caller = tostring(customDimensions.caller),
    correlationId = tostring(customDimensions.correlationId),
    commandId = tostring(customDimensions.commandId),
    queryName = tostring(customDimensions.queryName),
    cacheHit = tobool(customDimensions.cacheHit)
```

### From customMeasurements (metrics)
```kql
| extend 
    durationMs = todouble(customMeasurements.durationMs),
    resultRowCount = tolong(customMeasurements.resultRowCount),
    resultSizeKb = todouble(customMeasurements.resultSizeKb),
    cacheSize = tolong(customMeasurements.cacheSize),
    queryCount = tolong(customMeasurements.queryCount)
```

### From Standard Columns
```kql
| extend 
    userId = tostring(user_Id),
    sessionId = tostring(session_Id),
    operationId = tostring(operation_Id),
    eventTime = timestamp
```

## Response Format

When presenting results:

1. **Start with summary:**
   ```
   Found 1,234 query executions from 45 unique users over the last 7 days.
   ```

2. **Show key metrics:**
   ```
   - Success rate: 98.5%
   - Cache hit rate: 67.3%
   - Avg query duration: 324ms (P95: 1,250ms)
   ```

3. **Include the query:**
   ````
   ```kql
   customEvents
   | where timestamp >= ago(7d)
   | where name == "Mcp.QueryTelemetry"
   ...
   ```
   ````

4. **Highlight insights:**
   ```
   Key findings:
   - Cache effectiveness reduced after Nov 20 (from 75% to 67%)
   - Query duration spiked on Nov 22 (P95 went from 1.1s to 2.3s)
   - Error rate stable at ~1.5%
   ```

5. **Suggest follow-ups:**
   ```
   Want to explore:
   - Which queries are slowest?
   - What caused the cache hit rate drop?
   - User retention analysis?
   ```

## Validation Checklist

Before executing a usage telemetry query, verify:

- [ ] ✅ Query uses `customEvents` or `customMetrics` (NOT `traces`)
- [ ] ✅ Event filtering uses `name` column (NOT `customDimensions.eventId`)
- [ ] ✅ Dimensions extracted with proper type conversions (`tostring`, `tobool`, `todouble`)
- [ ] ✅ Time range is specified (`where timestamp >= ago(...)`)
- [ ] ✅ Aggregations use appropriate functions for user analysis (`dcount(user_Id)`, etc.)
- [ ] ❌ Query does NOT reference BC-specific patterns (RT0005, aadTenantId for BC tenants)
- [ ] ❌ Query does NOT use BC telemetry tools (get_event_catalog, get_tenant_mapping)

## Troubleshooting

### No Results Returned
1. Check event name spelling: `| summarize count() by name`
2. Expand time range: `ago(30d)` instead of `ago(7d)`
3. Verify profile configuration points to correct App Insights

### Unexpected Data Structure
1. Inspect raw events: `| take 5 | project *`
2. Check if customDimensions needs JSON parsing
3. List all property names: `| take 1 | project customDimensions`

### Performance Issues
1. Add time filters early in query
2. Limit data with `take` during exploration
3. Use `summarize` instead of returning all rows
4. Avoid scanning large time windows unnecessarily

## Examples

### Example 1: User asks "How many people are using this?"
```kql
customEvents
| where timestamp >= ago(30d)
| summarize 
    ActiveUsers = dcount(user_Id),
    TotalEvents = count(),
    UniqueSessions = dcount(session_Id)
| extend AvgEventsPerUser = round(TotalEvents * 1.0 / ActiveUsers, 2)
```

### Example 2: User asks "What's the most popular feature?"
```kql
customEvents
| where timestamp >= ago(30d)
| summarize UsageCount = count(), Users = dcount(user_Id) by name
| order by UsageCount desc
| take 10
```

### Example 3: User asks "Are queries getting slower?"
```kql
customEvents
| where timestamp >= ago(14d)
| where name == "Mcp.QueryTelemetry"
| extend durationMs = todouble(customMeasurements.durationMs)
| summarize 
    AvgDuration = round(avg(durationMs), 2),
    P95Duration = round(percentile(durationMs, 95), 2)
    by bin(timestamp, 1d)
| order by timestamp asc
```

### Example 4: User asks "Show me error breakdown"
```kql
customEvents
| where timestamp >= ago(7d)
| extend success = tobool(customDimensions.success)
| where success == false
| extend 
    errorType = tostring(customDimensions.errorType),
    component = tostring(customDimensions.component)
| summarize 
    ErrorCount = count(),
    AffectedUsers = dcount(user_Id)
    by errorType, component
| order by ErrorCount desc
```

---

**Remember:** The key difference is the table (customEvents vs traces) and event identification (name vs customDimensions.eventId). Everything else is standard KQL analysis adapted to the Application Insights schema.
