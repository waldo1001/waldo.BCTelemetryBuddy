---
id: lock-timeout-investigation
title: "Investigating Lock Timeouts (RT0012 + RT0013)"
category: query-pattern
tags: [locks, RT0012, RT0013, deadlocks, timeouts, performance, integrations]
eventIds: [RT0012, RT0013]
appliesTo: "BC 21.0+"
author: waldo
created: 2026-04-05
updated: 2026-04-05
---

## When to use this

When users report sporadic "busy" errors, posting failures, or you see lock timeout events spiking. Lock contention is the #1 performance issue in BC environments with integrations — seen across NC365/Magento, TDO, CRM/Dataverse, Shopware, and other sync apps.

## Step 1: How many lock timeouts and which tables?

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId == "RT0012"
| extend
    company = tostring(customDimensions.companyName),
    objectName = tostring(customDimensions.alObjectName),
    extensionName = tostring(customDimensions.extensionName)
| summarize
    count = count(),
    lastSeen = max(timestamp)
    by company, objectName, extensionName
| order by count desc
| take 20
```

## Step 2: Daily trend — is it getting worse?

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId == "RT0012"
| summarize count() by bin(timestamp, 1d)
| render timechart
```

## Step 3: Who is blocking whom? (the power query)

Join RT0012 (victim) with RT0013 (snapshot) on `snapshotId` to identify the actual blocker:

```kql
let victims = traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0012"
| extend
    snapshotId = tostring(customDimensions.snapshotId),
    victimObject = tostring(customDimensions.alObjectName),
    victimStack = tostring(customDimensions.alStackTrace);
let snapshots = traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0013"
| extend
    snapshotId = tostring(customDimensions.snapshotId),
    sqlTable = tostring(customDimensions.sqlTableName),
    lockMode = tostring(customDimensions.sqlLockRequestMode),
    lockStatus = tostring(customDimensions.sqlLockRequestStatus),
    blockerObject = tostring(customDimensions.alObjectName),
    blockerStack = tostring(customDimensions.alStackTrace);
victims
| join kind=inner (
    snapshots | where lockStatus == "GRANT"
) on snapshotId
| summarize
    count = count()
    by victimObject, blockerObject, sqlTable, lockMode
| order by count desc
| take 15
```

## Key Fields

- `snapshotId` — links victims (RT0012) to lock snapshot details (RT0013)
- `sqlLockRequestMode` — UPDLOCK, EXCLUSIVELOCK, etc.
- `sqlLockRequestStatus` — "WAIT" (victim), "GRANT" (blocker)
- `alStackTrace` — AL call stack showing what code caused the lock

## Common Root Causes

1. **Integration `OnAfterOnDatabaseModify` subscribers** — global event subscribers from sync apps hold locks across HTTP calls
2. **`SELECT ... WITH(UPDLOCK)` patterns** — integration apps doing pessimistic locking on high-traffic tables
3. **Batch jobs competing with users** — large posting routines overlapping with interactive sessions
4. **On-prem without RCSI** — READCOMMITTED isolation causes read-write conflicts; enabling RCSI eliminates this class entirely
