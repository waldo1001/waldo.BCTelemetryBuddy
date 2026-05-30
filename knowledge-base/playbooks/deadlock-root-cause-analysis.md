---
id: deadlock-root-cause-analysis
title: "Deadlock Root Cause Analysis (RT0028)"
category: playbook
tags: [RT0028, deadlock, locks, blocking, performance, sql, background, job-queue, integration]
eventIds: [RT0028, RT0013]
appliesTo: "BC 20.0+"
author: waldo
created: 2026-05-30
updated: 2026-05-30
---

## When to use this

- Deadlock spikes or recurring posting failures
- Job queue entries failing with "deadlock victim" errors
- Integration batch conflicts (CRM sync, data search indexing)
- Users reporting intermittent save/post failures

## When NOT to use this

- No RT0028 events in the event catalog → no deadlocks are occurring
- Lock *timeouts* without deadlocks → use the lock-timeout-investigation playbook instead
- Slow queries without blocking → check RT0005 (long-running SQL)

## Key Fields

| Field | Populated | Use |
|---|---|---|
| `clientType` | 100% | Background / WebClient / WebServiceClient — first triage split |
| `sqlStatement` | 100% | Full SQL causing the deadlock (includes lock hints, table name) |
| `alObjectId` / `alObjectType` | 100% | Always available, reliable for grouping |
| `alObjectName` | 80% | Human-readable object name (empty for system-level operations) |
| `alStackTrace` | 80% | Full AL call stack with line numbers and extension info |
| `extensionPublisher` | 80% | Who owns the code (Microsoft, ISV, custom) |
| `sqlServerSessionId` | 100% | Correlate with RT0013 to find the other deadlock participant |
| `environmentName` | 80% | Which environment (LIVE, SANDBOX, etc.) |

**Fields that do NOT exist on RT0028** (common misconception):
- ~~`sqlTableName`~~ → extract from `sqlStatement` via regex
- ~~`snapshotId`~~ → exists on RT0025 (wait statistics) and RT0013 (lock snapshots), not on RT0028
- ~~`lockMode`~~ / ~~`lockStatus`~~ → RT0013 uses `sqlLockRequestMode` and `sqlLockRequestStatus`

## Step 1: Are deadlocks happening? (Trend by day)

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| summarize deadlocks = count() by bin(timestamp, 1d)
| order by timestamp asc
| render timechart
```

## Step 2: Triage by client type

Background sessions (job queues) typically cause the majority of deadlocks. This tells you where to focus.

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| summarize count() by tostring(customDimensions.clientType)
| order by count_ desc
```

## Step 3: Deadlocks by environment

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| summarize count() by tostring(customDimensions.environmentName)
| order by count_ desc
```

## Step 4: Top source processes (by AL object)

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| extend objName = iif(
    tostring(customDimensions.alObjectName) == "",
    strcat(tostring(customDimensions.alObjectType), " ", tostring(customDimensions.alObjectId)),
    tostring(customDimensions.alObjectName))
| summarize count() by objName, tostring(customDimensions.extensionPublisher)
| order by count_ desc
| take 20
```

## Step 5: Deadlocks by SQL operation and table

The `sqlTableName` field does not exist on RT0028. Extract the table from `sqlStatement` using the BC SQL naming convention (`CURRENTCOMPANY$TableName$ExtensionGUID`).

> Note: Not all SQL uses the `CURRENTCOMPANY$...$` convention. Data search indexing operations use `$ndo$datasearch$tablename$guid` — the coalesce handles both patterns.

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| extend sqlStmt = tostring(customDimensions.sqlStatement)
| extend tableName = coalesce(
    extract(@"CURRENTCOMPANY\$([^$]+)\$", 1, sqlStmt),
    extract(@"\$ndo\$datasearch\$([^$]+)\$", 1, sqlStmt))
| extend sqlOp = case(
    sqlStmt startswith "UPDATE", "UPDATE",
    sqlStmt startswith "INSERT", "INSERT",
    sqlStmt startswith "DELETE", "DELETE",
    sqlStmt startswith "SELECT", "SELECT",
    "OTHER")
| summarize count() by tableName, sqlOp
| order by count_ desc
| take 20
```

## Step 6: Recent deadlocks with full detail

```kql
traces
| where customDimensions.eventId == "RT0028"
| order by timestamp desc
| take 20
| extend
    clientType = tostring(customDimensions.clientType),
    objName = tostring(customDimensions.alObjectName),
    sqlStmt = tostring(customDimensions.sqlStatement),
    stackTrace = tostring(customDimensions.alStackTrace),
    extPublisher = tostring(customDimensions.extensionPublisher),
    extName = tostring(customDimensions.extensionName),
    envName = tostring(customDimensions.environmentName)
| project timestamp, envName, clientType, objName, extPublisher, extName, sqlStmt, stackTrace
```

## Step 7: Week-over-week comparison

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(14d)
| summarize
    thisWeek = countif(timestamp > ago(7d)),
    lastWeek = countif(timestamp between (ago(14d) .. ago(7d)))
| extend changePercent = round(100.0 * (thisWeek - lastWeek) / lastWeek, 1)
```

## Step 8: Correlate with lock snapshots (RT0013)

Use `sqlServerSessionId` from RT0028 to find the other participant in the deadlock via RT0013 lock snapshot entries:

```kql
let deadlockSessions = traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(7d)
| extend sqlSessionId = tostring(customDimensions.sqlServerSessionId)
| distinct sqlSessionId;
traces
| where customDimensions.eventId == "RT0013"
| where timestamp > ago(7d)
| extend sqlSessionId = tostring(customDimensions.sqlServerSessionId)
| where sqlSessionId in (deadlockSessions)
| extend
    sqlLockRequestMode = tostring(customDimensions.sqlLockRequestMode),
    sqlLockRequestStatus = tostring(customDimensions.sqlLockRequestStatus),
    tableName = tostring(customDimensions.sqlTableName)
| summarize count() by sqlSessionId, sqlLockRequestMode, sqlLockRequestStatus, tableName
| order by count_ desc
```

## Step 9: By extension publisher (responsibility assignment)

```kql
traces
| where customDimensions.eventId == "RT0028"
| where timestamp > ago(30d)
| extend publisher = iif(
    tostring(customDimensions.extensionPublisher) == "",
    "System (no AL context)",
    tostring(customDimensions.extensionPublisher))
| summarize count() by publisher
| order by count_ desc
```

## Interpretation Tips

- **Background > 50%**: Deadlocks are mostly job-queue-driven. Check for overlapping scheduled tasks (e.g., CRM sync + data search indexing running simultaneously).
- **UPDLOCK in sqlStatement**: Explicit lock escalation — review the AL code for unnecessary `LockTable()` calls or overly broad record filters before modify operations.
- **Data search indexing (`$ndo$datasearch$`)**: This is BC's full-text search indexing. Consider disabling unused search indexes or staggering the rebuild schedule.
- **Integration Table Synch**: CRM/Dataverse sync jobs — these run with UPDLOCK. If conflicting with user posting, consider scheduling them outside business hours.
- **Empty `alObjectName` (alObjectType = "System")**: System-level operations where BC has no AL code context. The `sqlStatement` is your only diagnostic tool here.
- **alStackTrace format**: Contains object name, type, ID, trigger/function, line number, extension name, publisher, and version. Multi-line for deep stacks. Example:
  ```
  "My Codeunit"(CodeUnit 50100).OnRun(Trigger) line 3 - My App by Publisher version 1.0.0.0
  ```
- **Stable week-over-week**: Not a crisis, but persistent contention. Look for architectural fixes (record filter narrowing, lock sequence alignment) rather than hotfixes.

## Related Playbooks

- **Lock timeout investigation** — for RT0012 events (blocking without deadlock)
- **Database wait statistics** — for RT0026 events (resource-level waits: CPU, I/O, memory)

## Event Reference

| Event ID | Meaning | Correlation |
|----------|---------|-------------|
| RT0028 | Database deadlock occurred | Primary event for this playbook |
| RT0013 | Database lock snapshot entry | Other side of the deadlock (via `sqlServerSessionId`) |
| RT0025 | Wait statistics snapshot taken | Header event — not directly useful |
| RT0026 | Wait statistics snapshot entry | Resource-level waits (CPU, locks, I/O) |
