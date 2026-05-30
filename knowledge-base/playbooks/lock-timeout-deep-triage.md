---
id: lock-timeout-deep-triage
title: "Lock Timeout Deep Triage (RT0012/RT0013)"
category: playbook
tags: [RT0012, RT0013, locks, timeouts, blocking, performance, integration, snapshot, contention]
eventIds: [RT0012, RT0013]
appliesTo: "BC 21.0+"
author: waldo
created: 2026-05-30
updated: 2026-05-30
---

## When to use this

- Lock timeout spikes or unexplained "busy" errors
- Users report intermittent posting failures or saves timing out
- Job queue entries failing with lock-related errors
- Integration sync jobs (Magento, Shopware, CRM, Dataverse) causing contention
- You need to identify **who is blocking whom** and on which table

## When NOT to use this

- No RT0012/RT0013 events in the event catalog → no lock timeouts occurring
- Deadlocks (RT0028) → use the [deadlock-root-cause-analysis](deadlock-root-cause-analysis.md) playbook
- Slow queries without lock contention → check RT0005 (long-running SQL)
- Quick one-off lock check → use the simpler [lock-timeout-investigation](../query-patterns/lock-timeout-investigation.md) query-pattern

## Key Fields

### RT0012 — "Database lock timed out" (the victim)

| Field | Populated | Use |
|---|---|---|
| `clientType` | 100% | "Background" or "WebClient" — shows whether foreground users or background jobs are affected |
| `sqlStatement` | 100% | Full SQL that timed out — reveals the exact blocked operation |
| `alObjectName` | 100% | AL object executing when the timeout hit |
| `extensionName` | 100% | Extension owning the victim code |
| `alStackTrace` | 100% | Full AL call stack — critical for root-cause |
| `snapshotId` | 100% | Links to RT0013 entries for blocker identification |
| `companyName` | 100% | Which BC company was affected |
| `aadTenantId` | 100% | Tenant GUID (shows "common" for on-prem) |
| `environmentName` | 45% | Environment name — empty for on-prem tenants |
| `sessionId` | 100% | BC session ID for correlation |

### RT0013 — "Database lock snapshot entry" (the participants)

| Field | Populated | Use |
|---|---|---|
| `snapshotId` | 100% | Join key back to RT0012 |
| `sqlTableName` | 100% | The contested table |
| `sqlLockRequestMode` | 100% | "X" (exclusive), "U" (update), "S" (shared) |
| `sqlLockRequestStatus` | 100% | "GRANT" = holder/blocker, "WAIT" = victim |
| `sqlLockResourceType` | 100% | "KEY" (row-level) or "OBJECT" (table-level) |
| `alObjectName` | 65% | Empty for "TableData"-level system locks |
| `extensionName` | 65% | Empty for "TableData"-level system locks |
| `alStackTrace` | 65% | Only present for AL code-level locks |
| `clientType` | 65% | Session type of the lock participant |
| `alObjectType` | 100% | "TableData" entries (35%) have no AL-level info — this is normal |

> **Note:** ~35% of RT0013 rows have `alObjectType = "TableData"` with no AL object info. These represent system-level or internal locks — they still provide `sqlTableName`, `sqlLockRequestMode`, and `sqlLockRequestStatus` which are the critical fields.

## Step 1: Overview — how many timeouts and who is affected?

Get the big picture: total lock timeouts split by foreground vs. background, and which extensions are involved.

```kql
traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0012"
| extend
    clientType = tostring(customDimensions.clientType),
    objectName = tostring(customDimensions.alObjectName),
    extensionName = tostring(customDimensions.extensionName),
    company = tostring(customDimensions.companyName),
    sqlStatement = tostring(customDimensions.sqlStatement)
| summarize
    lockTimeouts = count(),
    companies = dcount(company)
    by clientType, objectName, extensionName
| order by lockTimeouts desc
| take 20
```

**What to look for:**
- `clientType = "WebClient"` → real users hitting lock errors (they see "busy" messages)
- `clientType = "Background"` → job queue or scheduled tasks failing (may auto-retry)
- High `companies` count → widespread issue vs. single-tenant problem

## Step 2: Daily trend — is it getting worse?

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId == "RT0012"
| extend clientType = tostring(customDimensions.clientType)
| summarize lockTimeouts = count() by bin(timestamp, 1d), clientType
| order by timestamp asc
```

**What to look for:**
- Sudden spikes → correlate with deployment dates, new integrations, or batch job schedule changes
- Gradual increase → growing data volume or added concurrent users
- Regular daily pattern → scheduled jobs competing at specific times

## Step 3: By customer/environment — who is most affected?

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId == "RT0012"
| extend
    aadTenantId = tostring(customDimensions.aadTenantId),
    environmentName = tostring(customDimensions.environmentName),
    clientType = tostring(customDimensions.clientType)
| summarize
    lockTimeouts = count(),
    foreground = countif(clientType == "WebClient"),
    background = countif(clientType == "Background"),
    firstSeen = min(timestamp),
    lastSeen = max(timestamp)
    by aadTenantId, environmentName
| order by lockTimeouts desc
| take 20
```

**What to look for:**
- Is it one tenant or many? One tenant → likely their specific integration/customization
- High `foreground` count → users are being impacted directly
- `environmentName` empty → on-prem tenant (cannot use environment-level filtering)

## Step 4: By source process — which code is the victim?

Identify which AL objects are timing out most, split by session type.

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId == "RT0012"
| extend
    objectName = tostring(customDimensions.alObjectName),
    extensionName = tostring(customDimensions.extensionName),
    clientType = tostring(customDimensions.clientType),
    company = tostring(customDimensions.companyName)
| summarize
    lockTimeouts = count(),
    foreground = countif(clientType == "WebClient"),
    background = countif(clientType == "Background"),
    companies = dcount(company)
    by objectName, extensionName
| order by lockTimeouts desc
| take 20
```

**What to look for:**
- Integration extensions (NC365, Shopware, CRM sync) appearing as victims → they're being blocked by something else
- Standard "Item Jnl.-Post Batch" or "Sales-Post" → core posting routines competing for the same tables
- Same extension appearing with high foreground AND background counts → self-contention between interactive and batch operations

## Step 5: Recent events detail — what SQL is being blocked?

Look at the actual blocked SQL statements to understand the operation type.

```kql
traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0012"
| extend
    clientType = tostring(customDimensions.clientType),
    company = tostring(customDimensions.companyName),
    objectName = tostring(customDimensions.alObjectName),
    extensionName = tostring(customDimensions.extensionName),
    snapshotId = tostring(customDimensions.snapshotId),
    sqlStatement = tostring(customDimensions.sqlStatement)
| project timestamp, clientType, company, objectName, extensionName, snapshotId, sqlStatement
| order by timestamp desc
| take 20
```

**What to look for:**
- `SELECT ... WITH(UPDLOCK)` → pessimistic locking pattern (common in integrations)
- `DELETE FROM` → large batch deletes holding locks
- `INSERT INTO` → insert contention on clustered index
- Table name in the SQL → confirms which table is the bottleneck

## Step 6: Snapshot analysis — who is blocking whom?

Join RT0012 (victim) with RT0013 (lock snapshot) via `snapshotId` to identify the actual blocker.

```kql
let victims = traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0012"
| extend
    snapshotId = tostring(customDimensions.snapshotId),
    victimObject = tostring(customDimensions.alObjectName),
    victimExtension = tostring(customDimensions.extensionName),
    victimClientType = tostring(customDimensions.clientType);
let snapshots = traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0013"
| where tostring(customDimensions.sqlLockRequestStatus) == "GRANT"
| extend
    snapshotId = tostring(customDimensions.snapshotId),
    sqlTable = tostring(customDimensions.sqlTableName),
    lockMode = tostring(customDimensions.sqlLockRequestMode),
    blockerObject = tostring(customDimensions.alObjectName),
    blockerExtension = tostring(customDimensions.extensionName),
    blockerClientType = tostring(customDimensions.clientType);
victims
| join kind=inner (snapshots) on snapshotId
| summarize
    count = count(),
    foregroundVictims = countif(victimClientType == "WebClient"),
    backgroundVictims = countif(victimClientType == "Background")
    by victimObject, victimExtension, blockerObject, blockerExtension, sqlTable, lockMode
| order by count desc
| take 15
```

**What to look for:**
- **Blocker with empty `blockerObject`** → system-level/TableData lock (35% of RT0013); the `sqlTable` still tells you which table
- **Same extension as victim and blocker** → self-contention (e.g., parallel integration jobs)
- **High `foregroundVictims`** → this specific blocker is causing user-visible errors
- **Lock mode "X" (exclusive)** → write operation holding the lock; "U" (update) → SELECT with UPDLOCK

> **Join reliability:** snapshotId is 100% populated on RT0012 with a 98% match rate to RT0013. The median is 2 RT0013 entries per snapshot; complex scenarios can produce up to 100 entries.

## Step 7: Blocker drill-down — what is the blocker doing?

Once you identify the top blocker from Step 6, get the stack traces.

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
| where tostring(customDimensions.sqlLockRequestStatus) == "GRANT"
| extend
    snapshotId = tostring(customDimensions.snapshotId),
    sqlTable = tostring(customDimensions.sqlTableName),
    blockerObject = tostring(customDimensions.alObjectName),
    blockerStack = tostring(customDimensions.alStackTrace);
victims
| join kind=inner (snapshots) on snapshotId
| where isnotempty(blockerStack)
| project timestamp = now(), victimObject, blockerObject, sqlTable, victimStack, blockerStack
| take 5
```

**What to look for in stack traces:**
- Format: `"ObjectName"(ObjectType ObjectId).Method line N - ExtensionName by Publisher version X.Y.Z`
- Look for HTTP calls, external service waits, or long-running operations in the blocker stack
- Integration subscribers (`OnAfterOnDatabaseModify`, `OnBeforeInsert`) holding locks across API calls
- Nested COMMIT/transaction boundaries that extend lock duration

## Step 8: Lock resource analysis — row-level vs. table-level

```kql
traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0013"
| extend
    sqlTable = tostring(customDimensions.sqlTableName),
    lockMode = tostring(customDimensions.sqlLockRequestMode),
    lockStatus = tostring(customDimensions.sqlLockRequestStatus),
    lockResourceType = tostring(customDimensions.sqlLockResourceType),
    objectName = tostring(customDimensions.alObjectName),
    extensionName = tostring(customDimensions.extensionName)
| summarize
    count = count()
    by sqlTable, lockMode, lockStatus, lockResourceType, objectName, extensionName
| order by count desc
| take 20
```

**What to look for:**
- `lockResourceType = "KEY"` → row-level lock contention (specific records being contested)
- `lockResourceType = "OBJECT"` → table-level lock (entire table locked — more severe, affects all operations)
- High "X" (exclusive) + "KEY" → multiple processes modifying the same records
- "U" (update) + "GRANT" → UPDLOCK/pessimistic read holding locks unnecessarily

## Interpretation Tips

- **Background blocking foreground**: Integration jobs holding locks that cause users to see "busy" errors. Fix: reduce lock duration, use smaller transactions, or schedule integrations outside business hours.
- **Self-contention** (same extension is both victim and blocker): Parallel execution of the same integration. Fix: serialize job queue entries, implement retry logic, or reduce batch size.
- **System-level locks** (empty `alObjectName` in RT0013): Internal BC platform operations or TableData-level locks. Less actionable from AL code — may need platform-level investigation or RCSI enablement (on-prem).
- **UPDLOCK patterns**: Integration apps doing `SELECT ... WITH(UPDLOCK)` for pessimistic locking. Fix: switch to optimistic concurrency where possible.
- **Spike correlation**: Lock timeout spikes often align with deployment dates (new subscriber code), schedule changes (overlapping jobs), or data volume growth (larger posting batches).

## Related Playbooks

- [Deadlock Root Cause Analysis (RT0028)](deadlock-root-cause-analysis.md) — when locks escalate to deadlocks
- [Lock Timeout Investigation](../query-patterns/lock-timeout-investigation.md) — simpler query-pattern for quick checks

## Event Reference

| Event ID | Description | Role in this playbook |
|---|---|---|
| RT0012 | Database lock timed out | The victim — process that failed |
| RT0013 | Database lock snapshot entry | Lock participants — identifies blocker (GRANT) and victim (WAIT) |
