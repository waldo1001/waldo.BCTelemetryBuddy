# Usage Telemetry Analysis for BC Telemetry Buddy

## Overview

This folder contains instructions and queries for analyzing the **usage telemetry** of the BC Telemetry Buddy software project itself. Unlike Business Central telemetry (which uses `traces` table), this project's usage telemetry is stored in **Application Insights** using the `customEvents` and `customMetrics` tables.

## Key Differences from BC Telemetry

| Aspect | BC Telemetry | Usage Telemetry (This Project) |
|--------|--------------|--------------------------------|
| **Primary Table** | `traces` | `customEvents` + `customMetrics` |
| **Data Location** | `customDimensions` nested object | `customDimensions` + dedicated columns |
| **Event Identification** | `customDimensions.eventId` | `name` column (e.g., "Extension.CommandExecuted") |
| **Schema** | Varies per BC event | Consistent per event type |
| **Tenant Concept** | `aadTenantId` for BC customers | `userId` for extension users |

## Table Structure

### customEvents Table
Primary table for tracking user actions, feature usage, and operational events.

**Key Columns:**
- `timestamp` - When the event occurred
- `name` - Event name (e.g., "Mcp.QueryTelemetry", "Extension.CommandExecuted")
- `customDimensions` - Dynamic properties bag with event-specific data
- `customMeasurements` - Numeric measurements (durations, counts, sizes)
- `user_Id` - Hashed user identifier
- `session_Id` - Session identifier
- `operation_Id` - Request correlation ID

**Common customDimensions fields:**
```kql
| extend 
    eventId = tostring(customDimensions.eventId),          // Event identifier (TB-XXX-NNN)
    success = tobool(customDimensions.success),            // Operation success
    errorType = tostring(customDimensions.errorType),      // Error type if failed
    component = tostring(customDimensions.component),      // "extension" or "mcp"
    version = tostring(customDimensions.version),          // Software version
    caller = tostring(customDimensions.caller),            // Who triggered the event
    correlationId = tostring(customDimensions.correlationId)
```

### customMetrics Table
Used for tracking numeric measurements and performance indicators.

**Key Columns:**
- `timestamp` - When the metric was recorded
- `name` - Metric name (e.g., "query.duration", "cache.hitRate")
- `value` - Numeric value
- `customDimensions` - Context about the metric
- `valueCount` - Number of samples aggregated
- `valueSum` - Sum of all samples
- `valueMin` / `valueMax` - Range of values

## Instructions for BC Telemetry Buddy

### 🚨 CRITICAL: Table Selection

**When analyzing usage telemetry for THIS project:**
1. **ALWAYS use `customEvents` as the primary table** (NOT `traces`)
2. Use `customMetrics` for performance and numeric analysis
3. Event identification uses the `name` column, NOT `customDimensions.eventId`

**Example - CORRECT:**
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend 
    success = tobool(customDimensions.success),
    queryName = tostring(customDimensions.queryName)
| summarize TotalQueries = count(), SuccessRate = countif(success) * 100.0 / count()
```

**Example - WRONG (don't use traces for usage telemetry):**
```kql
traces  // ❌ WRONG - traces is for BC telemetry, not usage telemetry
| where customDimensions.eventId == "TB-MCP-101"
```

### Event Discovery Workflow

Since usage telemetry has a different structure, the discovery workflow is adapted:

#### Step 1: Discover Available Events
```kql
customEvents
| where timestamp >= ago(30d)
| summarize EventCount = count() by name
| order by EventCount desc
```

This shows all event types being tracked (replaces `get_event_catalog` for usage telemetry).

#### Step 2: Understand Event Structure
```kql
customEvents
| where name == "Mcp.QueryTelemetry"
| take 10
| project timestamp, name, customDimensions, customMeasurements
```

This reveals the available fields for a specific event type (replaces `get_event_field_samples`).

#### Step 3: Analyze Patterns
Use standard KQL aggregations, time series analysis, and filtering based on discovered structure.

### Common Query Patterns

#### User Activity Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| extend userId = tostring(user_Id)
| summarize 
    TotalEvents = count(),
    UniqueUsers = dcount(userId),
    EventTypes = dcount(name)
| extend AvgEventsPerUser = TotalEvents * 1.0 / UniqueUsers
```

#### Feature Usage by Event Type
```kql
customEvents
| where timestamp >= ago(30d)
| summarize UsageCount = count() by name
| extend Percentage = round(UsageCount * 100.0 / toscalar(customEvents | where timestamp >= ago(30d) | count), 2)
| order by UsageCount desc
```

#### Error Rate Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| extend 
    success = tobool(customDimensions.success),
    errorType = tostring(customDimensions.errorType),
    component = tostring(customDimensions.component)
| summarize 
    Total = count(),
    Failures = countif(success == false),
    ErrorRate = round(countif(success == false) * 100.0 / count(), 2)
    by component, bin(timestamp, 1d)
| order by timestamp desc
```

#### Performance Metrics (Query Duration)
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend durationMs = todouble(customMeasurements.durationMs)
| summarize 
    QueryCount = count(),
    AvgDuration = round(avg(durationMs), 2),
    P50Duration = round(percentile(durationMs, 50), 2),
    P95Duration = round(percentile(durationMs, 95), 2),
    P99Duration = round(percentile(durationMs, 99), 2),
    MaxDuration = max(durationMs)
    by bin(timestamp, 1h)
| order by timestamp desc
```

#### Cache Effectiveness
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Mcp.QueryTelemetry"
| extend cacheHit = tobool(customDimensions.cacheHit)
| summarize 
    TotalQueries = count(),
    CacheHits = countif(cacheHit == true),
    CacheHitRate = round(countif(cacheHit == true) * 100.0 / count(), 2)
    by bin(timestamp, 1d)
| order by timestamp desc
```

#### Session Analysis
```kql
customEvents
| where timestamp >= ago(7d)
| extend sessionId = tostring(session_Id)
| summarize 
    EventsPerSession = count(),
    SessionDuration = max(timestamp) - min(timestamp),
    EventTypes = make_set(name)
    by sessionId
| extend SessionDurationMinutes = SessionDuration / 1m
| summarize 
    TotalSessions = count(),
    AvgEventsPerSession = round(avg(EventsPerSession), 2),
    AvgSessionDuration = round(avg(SessionDurationMinutes), 2)
```

#### Version Adoption
```kql
customEvents
| where timestamp >= ago(30d)
| extend 
    version = tostring(customDimensions.version),
    component = tostring(customDimensions.component)
| summarize UniqueUsers = dcount(user_Id) by version, component
| order by component asc, UniqueUsers desc
```

#### Command Usage (Extension)
```kql
customEvents
| where timestamp >= ago(7d)
| where name == "Extension.CommandExecuted"
| extend commandId = tostring(customDimensions.commandId)
| summarize UsageCount = count() by commandId
| order by UsageCount desc
```

#### MCP Tool Usage
```kql
customEvents
| where timestamp >= ago(7d)
| where name startswith "Mcp."
| extend 
    toolName = replace_string(name, "Mcp.", ""),
    success = tobool(customDimensions.success)
| summarize 
    CallCount = count(),
    SuccessRate = round(countif(success == true) * 100.0 / count(), 2),
    AvgDuration = round(avg(todouble(customMeasurements.durationMs)), 2)
    by toolName
| order by CallCount desc
```

#### Error Deep Dive
```kql
customEvents
| where timestamp >= ago(7d)
| where tobool(customDimensions.success) == false
| extend 
    errorType = tostring(customDimensions.errorType),
    errorMessage = tostring(customDimensions.errorMessage),
    component = tostring(customDimensions.component),
    eventName = name
| summarize 
    ErrorCount = count(),
    AffectedUsers = dcount(user_Id),
    SampleMessages = make_set(errorMessage, 3)
    by errorType, component, eventName
| order by ErrorCount desc
```

#### Daily Active Users (DAU)
```kql
customEvents
| where timestamp >= ago(30d)
| extend userId = tostring(user_Id)
| summarize DailyActiveUsers = dcount(userId) by bin(timestamp, 1d)
| order by timestamp desc
```

#### Retention Analysis (7-day)
```kql
let firstWeek = customEvents
| where timestamp >= ago(14d) and timestamp < ago(7d)
| distinct tostring(user_Id);
let secondWeek = customEvents
| where timestamp >= ago(7d)
| distinct tostring(user_Id);
let retainedUsers = toscalar(firstWeek | join kind=inner (secondWeek) on user_Id | count);
let firstWeekUsers = toscalar(firstWeek | count);
print 
    FirstWeekUsers = firstWeekUsers,
    RetainedUsers = retainedUsers,
    RetentionRate = round(retainedUsers * 100.0 / firstWeekUsers, 2)
```

### Performance Metrics from customMetrics

```kql
customMetrics
| where timestamp >= ago(7d)
| summarize 
    AvgValue = round(avg(value), 2),
    P95Value = round(percentile(value, 95), 2),
    MaxValue = max(value),
    MeasurementCount = sum(valueCount)
    by name, bin(timestamp, 1h)
| order by timestamp desc, name asc
```

### Event Correlation Analysis

```kql
customEvents
| where timestamp >= ago(1d)
| extend correlationId = tostring(customDimensions.correlationId)
| where isnotempty(correlationId)
| summarize 
    Events = make_list(name),
    Duration = max(timestamp) - min(timestamp),
    Success = min(tobool(customDimensions.success))
    by correlationId
| where array_length(Events) > 1
| extend DurationMs = Duration / 1ms
| order by DurationMs desc
```

## Event Catalog for This Project

Based on the telemetry design in `Instructions/Telemetry-Design-and-Implementation.md`, expected event names include:

### Extension Events (TB-EXT-XXX)
- `Extension.Activated` - Extension startup
- `Extension.CommandExecuted` - User command invoked
- `Extension.ConfigChanged` - Configuration updated
- `Extension.ChatParticipantInvoked` - Copilot chat used
- `Extension.Error` - Extension errors

### MCP Events (TB-MCP-XXX)
- `Mcp.QueryTelemetry` - Telemetry query executed
- `Mcp.GetSavedQueries` - Saved queries retrieved
- `Mcp.SaveQuery` - Query saved
- `Mcp.SearchQueries` - Query search performed
- `Mcp.GetEventCatalog` - Event catalog retrieved
- `Mcp.GetEventFieldSamples` - Field samples analyzed
- `Mcp.GetTenantMapping` - Tenant mapping retrieved

### Kusto Events (TB-KQL-XXX)
- `Kusto.QueryExecuted` - Kusto query run (dependency)
- `Kusto.QueryFailed` - Kusto query failed
- `Kusto.AuthTokenAcquired` - Authentication completed
- `Kusto.AuthTokenExpired` - Token refresh needed

### Authentication Events (TB-AUTH-XXX)
- `Auth.DeviceCodeFlowStarted` - Device code auth initiated
- `Auth.TokenAcquired` - Token obtained successfully
- `Auth.TokenRefreshed` - Token refreshed
- `Auth.AuthenticationFailed` - Auth error

### Cache Events (TB-CACHE-XXX)
- `Cache.Hit` - Cache hit
- `Cache.Miss` - Cache miss
- `Cache.Invalidated` - Cache cleared

## Tips for Analysis

### 1. Always Check Event Structure First
Before writing complex queries, inspect a few sample events:
```kql
customEvents
| where name == "YourEventName"
| take 5
| project timestamp, name, customDimensions, customMeasurements
```

### 2. Use Time Bins for Trends
```kql
| summarize count() by bin(timestamp, 1h)  // Hourly
| summarize count() by bin(timestamp, 1d)  // Daily
```

### 3. Extract Dimensions Carefully
Application Insights may return customDimensions as strings or objects. Use `tostring()`, `tobool()`, `todouble()` for safe extraction.

### 4. Join Events with Dependencies
```kql
customEvents
| where name == "Mcp.QueryTelemetry"
| join kind=inner (
    dependencies
    | where name == "Kusto.QueryExecuted"
) on operation_Id
| project timestamp, EventName = name, DependencyDuration = duration
```

### 5. Correlate User Journey
Use `session_Id` or `operation_Id` to trace user flows:
```kql
customEvents
| where session_Id == "specific-session-id"
| order by timestamp asc
| project timestamp, name, customDimensions
```

### 6. Filter by Component
```kql
| extend component = tostring(customDimensions.component)
| where component == "extension"  // or "mcp"
```

### 7. Identify Power Users
```kql
customEvents
| where timestamp >= ago(30d)
| summarize EventCount = count() by tostring(user_Id)
| order by EventCount desc
| take 10
```

## Common Pitfalls to Avoid

1. ❌ **Don't use `traces` table** - Usage telemetry is in `customEvents`
2. ❌ **Don't filter by `customDimensions.eventId`** - Use `name` column instead
3. ❌ **Don't assume BC telemetry structure** - Usage telemetry has different schema
4. ✅ **Do check actual event names first** - Use discovery queries
5. ✅ **Do use safe type conversions** - Always use `tostring()`, `tobool()`, etc.
6. ✅ **Do correlate by `operation_Id`** - Links related events together

## Example Analysis Session

**User Request:** "Show me how many users are using the query telemetry feature"

**Step 1 - Discover Events:**
```kql
customEvents
| where name contains "Query"
| summarize count() by name
```

**Step 2 - Inspect Structure:**
```kql
customEvents
| where name == "Mcp.QueryTelemetry"
| take 3
| project customDimensions, customMeasurements
```

**Step 3 - Analyze Usage:**
```kql
customEvents
| where timestamp >= ago(30d)
| where name == "Mcp.QueryTelemetry"
| summarize 
    UniqueUsers = dcount(user_Id),
    TotalQueries = count(),
    AvgQueriesPerUser = count() * 1.0 / dcount(user_Id)
```

**Step 4 - Add Trends:**
```kql
customEvents
| where timestamp >= ago(30d)
| where name == "Mcp.QueryTelemetry"
| summarize 
    UniqueUsers = dcount(user_Id),
    QueryCount = count()
    by bin(timestamp, 1d)
| order by timestamp asc
```

## Reference Materials

- Main telemetry design: `Instructions/Telemetry-Design-and-Implementation.md`
- Event catalog: Section 14 in telemetry design doc
- BC telemetry patterns (for comparison): `agentDefinitions.ts`
- Configuration: `.vscode/settings.json` for telemetry profiles

## Quick Start

To analyze this project's usage telemetry with BC Telemetry Buddy:

1. **Configure a separate profile** in workspace settings pointing to the Application Insights resource for this project
2. **Use `customEvents` as the primary table** in all queries
3. **Discover available events** using the patterns above
4. **Apply standard KQL analysis techniques** adapted for the event structure

---

**Remember:** This is analyzing the TOOL's usage (BC Telemetry Buddy), not Business Central telemetry data. The table structure and query patterns are different!
