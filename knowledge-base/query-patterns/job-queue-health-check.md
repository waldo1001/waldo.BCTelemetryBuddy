---
id: job-queue-health-check
title: "Job Queue Health Check — Average Processing Time"
category: query-pattern
tags: [job-queue, AL0000E25, AL0000E26, AL0000HE7, scheduling, background-tasks, processing-time]
eventIds: [AL0000E24, AL0000E25, AL0000E26, AL0000HE7]
appliesTo: "BC 22.2+"
author: waldo
created: 2026-04-05
updated: 2026-04-05
---

## When to use this

When you want to know how long recurring job queue entries actually take to process, and spot jobs that are getting slower over time. This uses the correlation between AL0000E25 (job started) and AL0000E26 (job finished) to calculate real processing duration per execution, then averages per hour.

## Event Reference

| Event ID | Meaning |
|----------|---------|
| AL0000E24 | Job queue entry enqueued |
| AL0000E25 | Job queue entry started |
| AL0000E26 | Job queue entry finished |
| AL0000HE7 | Job queue entry errored |

## Average processing time per hour per job

Correlates start and finish events by `alJobQueueScheduledTaskId` to compute the actual processing duration, then averages per hour per job description.

```kql
traces
| where timestamp > ago(7d)
| where customDimensions.eventId in ("AL0000E25", "AL0000E26")
| where tostring(customDimensions.alJobQueueIsRecurring) in ("Yes", "True")
| extend
    eventId = tostring(customDimensions.eventId),
    jobTaskId = tostring(customDimensions.alJobQueueScheduledTaskId),
    jobDescription = tostring(customDimensions.alJobQueueObjectDescription)
| summarize
    startTime = minif(timestamp, eventId == "AL0000E25"),
    endTime = maxif(timestamp, eventId == "AL0000E26")
    by jobTaskId, jobDescription
| where isnotempty(startTime) and isnotempty(endTime)
| extend processingTimeMs = datetime_diff('millisecond', endTime, startTime)
| summarize avgProcessingTimeMs = avg(processingTimeMs) by bin(startTime, 1h), jobDescription
| order by avgProcessingTimeMs desc
```

## Key Fields

- `alJobQueueScheduledTaskId` — unique ID per job execution (correlation key between start and finish events)
- `alJobQueueObjectDescription` — human-readable name of the job
- `alJobQueueIsRecurring` — "Yes"/"True" for recurring jobs (value is localized in some versions), filters out one-time runs

## Interpretation Tips

- **Rising `avgProcessingTimeMs` over time** → the job is getting slower, likely due to growing data volume
- **Large spikes in specific hours** → correlate with business activity (e.g., end-of-day posting, integration syncs)
- **Jobs with no matching AL0000E26** → job crashed or timed out before finishing; check AL0000HE7 for errors
- Add `| render timechart` to visualize the trend over time
