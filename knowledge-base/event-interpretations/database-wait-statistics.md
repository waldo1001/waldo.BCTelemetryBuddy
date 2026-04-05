---
id: database-wait-statistics
title: "Understanding Database Wait Statistics (RT0026)"
category: event-interpretation
tags: [RT0026, wait-stats, performance, database, cpu, memory, locks, resource-exhaustion]
eventIds: [RT0026]
appliesTo: "BC 20.0+"
author: community
created: 2026-04-05
updated: 2026-04-05
---

## When to use this

When the environment feels slow across the board — not one specific page or process, but general sluggishness. RT0026 reports database wait statistics categories, revealing which resource the SQL database is waiting on most. This is one of the most underused but powerful telemetry signals.

## Step 1: Wait category breakdown (last 7 days)

```kql
traces
| where timestamp > ago(7d)
| where customDimensions.eventId == "RT0026"
| extend
    waitCategory = tostring(customDimensions.databaseWaitStatisticsCategory),
    waitTimeMs = toreal(customDimensions.databaseWaitTimeInMs)
| summarize
    totalWaitMs = sum(waitTimeMs),
    count = count()
    by waitCategory
| order by totalWaitMs desc
```

## Step 2: Wait category trend over time

```kql
traces
| where timestamp > ago(14d)
| where customDimensions.eventId == "RT0026"
| extend
    waitCategory = tostring(customDimensions.databaseWaitStatisticsCategory),
    waitTimeMs = toreal(customDimensions.databaseWaitTimeInMs)
| summarize totalWaitMs = sum(waitTimeMs) by waitCategory, bin(timestamp, 1d)
| render timechart
```

## Step 3: Correlate with specific operations during high-wait periods

```kql
// First find when wait times spiked, then look at what was running
let highWaitDay = datetime(2025-01-15); // adjust from Step 2
traces
| where timestamp between (highWaitDay .. (highWaitDay + 1d))
| where customDimensions.eventId == "RT0005"
| extend
    objectName = tostring(customDimensions.alObjectName),
    executionTime = totimespan(customDimensions.executionTime)
| summarize
    count = count(),
    totalTime = sum(executionTime)
    by objectName
| order by totalTime desc
| take 10
```

## Wait Category Reference

| Category | Meaning | Common Cause |
|----------|---------|--------------|
| **Memory** | SQL waiting for memory grants | Large queries, many concurrent users, missing indexes causing scans |
| **CPU** | SQL waiting for CPU cycles | Heavy computation, too many concurrent queries |
| **Worker Thread** | No available threads to process queries | Thread pool exhaustion from too many concurrent sessions |
| **Buffer IO** | Waiting for disk reads into memory | Large table scans, insufficient database memory |
| **Lock** | Waiting for row/table locks | Concurrent writes to same records — investigate with RT0012/RT0013 |
| **Network IO** | Waiting on network transfer | Large result sets, slow client connections |
| **Compilation** | Waiting for query plan compilation | Many ad-hoc queries causing plan cache churn |

## Interpretation Tips

- **Memory dominant** → look for missing indexes (RT0017) causing full table scans that require large memory grants
- **Lock dominant** → pivot to lock timeout investigation (RT0012/RT0013) to find the conflicting operations
- **Worker Thread exhaustion** → too many concurrent sessions; check for runaway integrations or job queues
- **Sudden category shift** → compare with deployment events (LC events) — a new extension version may have introduced inefficient queries
- If ALL categories are elevated → the environment may need a higher service tier, or a single bad query is cascading
