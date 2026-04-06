---
title: "Environment Upgrade Troubleshooting (LC Events)"
category: playbook
tags: [upgrade, LC0101, LC0105, LC0106, LC0107, LC0017, LC0155, lifecycle, environment]
eventIds: [LC0101, LC0105, LC0106, LC0107, LC0017, LC0155]
appliesTo: "BC 21.0+"
author: waldo
created: 2026-04-05
updated: 2026-04-05
---

## When to use this

After a scheduled or manual environment update fails, or you need to confirm an upgrade completed successfully. LC events track the full lifecycle: scheduling → start → success/failure → individual extension upgrade status.

## Step 1: Recent upgrade lifecycle overview

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId in ("LC0101", "LC0105", "LC0106", "LC0107")
| extend
    eventId = tostring(customDimensions.eventId),
    environmentName = tostring(customDimensions.environmentName),
    sourceVersion = tostring(customDimensions.sourceVersion),
    destinationVersion = tostring(customDimensions.destinationVersion),
    failureReason = tostring(customDimensions.failureReason)
| project timestamp, eventId, environmentName, sourceVersion, destinationVersion, failureReason
| order by timestamp desc
```

## Step 2: Extension upgrade failures

```kql
traces
| where timestamp > ago(30d)
| where customDimensions.eventId in ("LC0017", "LC0155")
| extend
    eventId = tostring(customDimensions.eventId),
    extensionName = tostring(customDimensions.extensionName),
    extensionVersion = tostring(customDimensions.extensionVersion),
    failureReason = tostring(customDimensions.failureReason),
    environmentName = tostring(customDimensions.environmentName)
| project timestamp, eventId, environmentName, extensionName, extensionVersion, failureReason
| order by timestamp desc
```

## Step 3: Correlate with errors during upgrade window

Once you know the upgrade start/end time from Step 1, check for errors in that window:

```kql
let upgradeStart = datetime(2025-01-15T02:00:00Z); // adjust from Step 1
let upgradeEnd = datetime(2025-01-15T04:00:00Z);   // adjust from Step 1
traces
| where timestamp between (upgradeStart .. upgradeEnd)
| where customDimensions.eventId startswith "RT" or customDimensions.eventId startswith "AL"
| extend
    eventId = tostring(customDimensions.eventId),
    message = tostring(customDimensions.message)
| summarize count() by eventId
| order by count_ desc
```

## Event Reference

| Event ID | Meaning |
|----------|---------|
| LC0101   | Environment update scheduled |
| LC0105   | Environment update started |
| LC0106   | Environment update completed successfully |
| LC0107   | Environment update failed |
| LC0017   | Extension update succeeded |
| LC0155   | Extension update failed |

## Interpretation Tips

- **LC0107 with `failureReason`** → read the reason carefully; often a specific extension's upgrade code failed
- **LC0155 for a specific extension** → that extension's upgrade codeunit has a bug; contact the publisher
- **No LC0106 after LC0105** → upgrade may still be in progress, or it crashed without logging failure
- **Check Step 3** for RT0012 (lock timeouts) during upgrade → other processes were competing with the upgrade
