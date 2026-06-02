---
title: "Job Queue Health Check — Average Processing Time"
category: query-pattern
tags: [job-queue, AL0000E25, AL0000E26, AL0000HE7, scheduling, background-tasks, processing-time]
eventIds: [AL0000E24, AL0000E25, AL0000E26, AL0000HE7]
appliesTo: "BC 22.2+"
author: waldo
created: 2026-04-05
updated: 2026-06-02
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

## Caveats

- **Reused task IDs can inflate duration.** Recurring jobs often keep the same `alJobQueueScheduledTaskId` across many runs within the query window. Because `minif`/`maxif` aggregate per task ID, a single computed duration can span the *earliest* start to the *latest* finish across all of those runs, overstating one run's time. Binning on `startTime` (as above) mitigates this; for fully accurate per-execution durations, pair each start with its *next* finish (sort by timestamp and use `prev()`/`next()`) or also group on a per-run correlation dimension.
- **Only finished jobs are measured.** Runs that failed (AL0000HE7 / AL0000JRG) or were canceled (AL0000KZV) never emit AL0000E26, so they have no end timestamp and drop out of the duration math — analyze those separately.

## Generalization — the "two-event subtraction" pattern

BC has no single "ran for X seconds" field for most operations; it emits a distinct **start** event and **finish** event and you compute duration by subtracting timestamps. Any scenario with paired start/end events (job queue, sessions, environment updates) can be measured the same way: filter to both events, `summarize startTime = minif(...), endTime = maxif(...)` on a shared correlation ID, then `endTime - startTime` (a `timespan`) or `datetime_diff('millisecond', endTime, startTime)`.
