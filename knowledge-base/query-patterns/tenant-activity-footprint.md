---
title: "Tenant Activity Footprint: What Users Actually Do"
category: query-pattern
tags: [usage, footprint, pages, reports, user-activity, clientType, behavioral-analysis, client-actions, excel, financial-reports]
eventIds: [CL0001, CL0003, RT0006, RT0004, RT0056, AL0000O76, AL0000OKU]
appliesTo: "BC 24.0+"
author: Gerardo Renteria
created: 2026-06-22
updated: 2026-06-23
---

Before you can help a customer improve adoption or spot usage anomalies, you need to know what users actually do. These queries map the behavioral footprint of a BC tenant — pages visited, reports run, devices used, and which modern features are being adopted or quietly ignored.

> **Requires BC 24.0+** for consistent `user_Id` alignment across both `traces` and `pageViews` tables.
> On earlier versions, user tracking is limited to server-side events only.

> **Prerequisite:** Users must have a Telemetry ID assigned in their User Card
> (`Users → User Card → Telemetry ID → Set field to random GUID`).
> The `user_Id` column is an anonymous GUID — it does not expose names or emails.

---

## When to use this

- You want to know which pages and reports are actually used in a tenant
- A customer asks "are users using the system?" and you need numbers, not guesses
- You need to count unique human users vs. API/service accounts
- You want to know whether users are on mobile or only desktop
- You need to trace everything a specific user did — pages opened, reports run, actions taken
- You want to find who visited a specific page or ran a specific report

## When NOT to use this

- **No Telemetry IDs assigned** → `user_Id` will be empty everywhere. Check first: `pageViews | where isnotempty(user_Id) | count`. Zero = no IDs assigned, user-level queries return nothing.
- **You need user names, not GUIDs** → telemetry only captures anonymous IDs. Map them via `Users → User Card → Telemetry ID` in BC.
- **BC version < 24** → `user_Id` unreliable across `traces` + `pageViews`; some events won't appear.
- **Tenant is fully API-driven** → RT0004 will be dominated by service accounts. CL0003 will return little or no data since service accounts do not trigger client-side UI events. `pageViews` is the only reliable human-activity signal in that case.

---

## Events used

| Event ID | Table | What it captures | Min version | Validated |
| --- | --- | --- | --- | --- |
| CL0001 | `pageViews` | Page opened — `name`, `clientType`, `user_Id`, `companyName` | BC 16+ | ✅ |
| CL0003 | `traces` | Client action invoked — `clientAction`, `alObjectName`, `screenRes` | BC 22+ | ✅ real data |
| RT0006 | `traces` | Report generated — `alObjectName`, `extensionName`, `extensionPublisher` | BC 16+ | ✅ |
| RT0004 | `traces` | Authorization succeeded (Open Company) — filter by `clientType` to exclude API/S2S | BC 16.1+ | ✅ |
| RT0056 | `traces` | Open in Excel — `alObjectName` (page), `clientType`, `extensionPublisher` | BC 2024 R2+ | ✅ docs |
| AL0000O76 | `traces` | Financial report run from request page — `alReportDefinitionCode`, `alRowDefinitionCode`, `alColumnDefinitionCode` | **BC v26+** | ✅ docs |
| AL0000OKU | `traces` | Financial report run on-screen — same dimensions as AL0000O76 | **BC v26+** | ✅ docs |

---

## Query 1 — Most visited pages (functional area overview)

```kusto
pageViews
| where timestamp > ago(30d)
| where isnotempty(user_Id)
| extend environmentName = tostring(customDimensions.environmentName)
| extend companyName     = tostring(customDimensions.companyName)
| extend clientType      = tostring(customDimensions.clientType)
| summarize
    pageOpenCount = count(),
    uniqueUsers   = dcount(user_Id)
    by pageName = name, environmentName, companyName, clientType
| order by pageOpenCount desc
```

**What to look for:** Counts clustered around one area (Sales*, Purchase*) = that's where the core work is. Low counts across the board = adoption issue or most users don't have Telemetry IDs. `Dialog` and `PageSearchForm` are navigation UI — filter them out if they dominate the top results.

---

## Query 2 — Most executed reports

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "RT0006"
| where tostring(customDimensions.result) == "Success"
| extend environmentName     = tostring(customDimensions.environmentName)
| extend companyName         = tostring(customDimensions.companyName)
| extend reportName          = tostring(customDimensions.alObjectName)
| extend reportId            = tostring(customDimensions.alObjectId)
| extend extensionPublisher  = tostring(customDimensions.extensionPublisher)
| extend extensionName       = tostring(customDimensions.extensionName)
| summarize
    runCount    = count(),
    uniqueUsers = dcount(user_Id)
    by reportName, reportId, extensionPublisher, extensionName, environmentName, companyName
| order by runCount desc
```

**What to look for:** High `runCount` with low `uniqueUsers` = one person hammering that report. High `uniqueUsers` = broadly used across the team. `extensionPublisher` tells you whether it's a Microsoft base report or an ISV custom one — useful context but not the main story.

---

## Query 3 — Active unique users per day

> ⚠️ **Important:** RT0004 includes API/service-to-service sessions (`clientType = WebServiceClient`, `ODataClient`, `BackgroundClient`).
> Filter by `clientType` to count only human interactive sessions.
> `userType` dimension (Delegated_admin / Internal_Admin / Normal user) is available from **BC v26+** only.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "RT0004"
| where tostring(customDimensions.clientType) !in ("WebServiceClient", "ODataClient", "BackgroundClient")
| extend environmentName = tostring(customDimensions.environmentName)
| extend userType        = tostring(customDimensions.userType)   // available BC v26+
| summarize
    uniqueUsers = dcount(user_Id),
    totalLogins = count()
    by bin(timestamp, 1d), environmentName, userType
| order by timestamp asc
```

**What to look for:** If the filtered query returns no rows, all RT0004 sessions were API or service accounts — the tenant is fully API-driven. Use `pageViews | summarize dcount(user_Id)` as the reliable alternative; `pageViews` never fires for API or background sessions. On BC < v26, `userType` will be empty for all rows — remove it from the `by` clause if you want cleaner output.

---

## Query 4 — Device and client type distribution

```kusto
pageViews
| where timestamp > ago(30d)
| extend clientType      = tostring(customDimensions.clientType)
| extend environmentName = tostring(customDimensions.environmentName)
| summarize sessions = count(), uniqueUsers = dcount(user_Id)
    by clientType, environmentName
| order by sessions desc
```

**What to look for:** All Desktop = classic office setup. Phone or Tablet in the mix = warehouse, field sales, or service operations. Typical values: `Web`, `Phone`, `Tablet`, `Desktop`.

---

## Query 5 — Single user activity trail (pages + reports + actions)

Replace `<user_Id GUID>` with the Telemetry ID from the User Card. Returns the complete session timeline across all 7 events, ordered chronologically.

```kusto
let targetUser = "<user_Id GUID>";
union
    (pageViews
        | where user_Id == targetUser
        | where timestamp > ago(2d)
        | project timestamp,
            eventType   = "CL0001 - PageView",
            name,
            clientType  = tostring(customDimensions.clientType),
            companyName = tostring(customDimensions.companyName),
            detail      = ""
    ),
    (traces
        | where user_Id == targetUser
        | where timestamp > ago(2d)
        | where tostring(customDimensions.eventId) in ("RT0006", "RT0004", "RT0056", "AL0000O76", "AL0000OKU", "CL0003")
        | project timestamp,
            eventType   = tostring(customDimensions.eventId),
            name        = tostring(customDimensions.alObjectName),
            clientType  = tostring(customDimensions.clientType),
            companyName = tostring(customDimensions.companyName),
            detail      = tostring(customDimensions.clientAction)
    )
| order by timestamp asc
```

**What to look for:** The `detail` column shows `clientAction` for CL0003 events only (e.g. `UI.AnalysisMode.Enabled`). For all other events in the timeline — page views, logins, reports, Excel exports, financial reports — it is empty. Read the timeline top to bottom to reconstruct the session.

---

## Query 6 — Most used client actions (what users DO)

Goes beyond page navigation — shows which specific UI features users are actually triggering.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "CL0003"
| extend clientAction   = tostring(customDimensions.clientAction)
| extend alObjectName   = tostring(customDimensions.alObjectName)
| extend clientType     = tostring(customDimensions.clientType)
| extend companyName    = tostring(customDimensions.companyName)
| summarize
    actionCount = count(),
    uniqueUsers = dcount(user_Id)
    by clientAction, alObjectName, clientType, companyName
| order by actionCount desc
```

**What to look for:** `UI.AnalysisMode.Enabled/Disabled` dominating = users are actively using Analysis Mode. If CL0003 returns no rows at all, Telemetry IDs are likely missing for most users.

---

## Query 7 — Screen resolution distribution (from CL0003)

Quick sanity check on the display environment.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "CL0003"
| extend screenRes      = tostring(customDimensions.screenRes)
| extend environmentName = tostring(customDimensions.environmentName)
| summarize count() by screenRes, environmentName
| order by count_ desc
```

**What to look for:** 1920×1080 dominating = standard office setup. 1280×720 or below = older hardware or RDP sessions. Supporting signal only — don't over-index on it.
> `screenRes` is not documented in the official BC telemetry docs — validated from real tenant data. Present in all CL0003 events observed.

---

## Query 8 — Open in Excel usage (RT0056)

> Requires **BC 2024 release wave 2+**.
> Fires when a user successfully opens a page in Excel. Shows which pages are exported and by how many users.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "RT0056"
| extend pageName          = tostring(customDimensions.alObjectName)
| extend clientType        = tostring(customDimensions.clientType)
| extend companyName       = tostring(customDimensions.companyName)
| extend environmentName   = tostring(customDimensions.environmentName)
| extend extensionPublisher = tostring(customDimensions.extensionPublisher)
| extend extensionName     = tostring(customDimensions.extensionName)
| summarize
    exportCount = count(),
    uniqueUsers = dcount(user_Id)
    by pageName, extensionPublisher, extensionName, clientType, companyName, environmentName
| order by exportCount desc
```

**What to look for:** Pages with high `exportCount` show where users regularly take data out of BC into Excel. `extensionPublisher` tells you which extension owns the page.

---

## Query 9 — Optional: Financial report usage (AL0000O76 / AL0000OKU)

> Requires **BC v26 (2025 release wave 1)+**.
> Field names confirmed from official documentation.
> If no rows return, Financial Reports feature is not in use in this tenant.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) in ("AL0000O76", "AL0000OKU")
| extend eventId              = tostring(customDimensions.eventId)
| extend reportDefinitionCode = tostring(customDimensions.alReportDefinitionCode)
| extend rowDefinitionCode    = tostring(customDimensions.alRowDefinitionCode)
| extend columnDefinitionCode = tostring(customDimensions.alColumnDefinitionCode)
| extend companyName          = tostring(customDimensions.companyName)
| extend environmentName      = tostring(customDimensions.environmentName)
| summarize
    runCount    = count(),
    uniqueUsers = dcount(user_Id)
    by reportDefinitionCode, rowDefinitionCode, columnDefinitionCode,
       eventId, companyName, environmentName
| order by runCount desc
```

**What to look for:** No rows = Financial Reports not configured or tenant is on BC < v26. `AL0000O76` fires when the user ran the report from the request page. `AL0000OKU` fires when they viewed it on-screen.

---

## User-level queries

The queries above tell you what the tenant does. These tell you who does it.

### Query 10 — User activity ranking (who is most active?)

```kusto
union
    (pageViews
        | where timestamp > ago(30d)
        | where isnotempty(user_Id)
        | project timestamp, user_Id, eventType = "PageView"
    ),
    (traces
        | where timestamp > ago(30d)
        | where isnotempty(user_Id)
        | where tostring(customDimensions.eventId) in ("RT0006", "RT0056", "AL0000O76", "AL0000OKU", "CL0003")
        | project timestamp, user_Id, eventType = tostring(customDimensions.eventId)
    )
| summarize
    totalEvents  = count(),
    pageViews    = countif(eventType == "PageView"),
    reports      = countif(eventType == "RT0006"),
    excelExports = countif(eventType == "RT0056"),
    actions      = countif(eventType == "CL0003")
    by user_Id
| order by totalEvents desc
```

**What to look for:** Large gap between `totalEvents` and `pageViews` = the user runs a lot of reports or uses many client actions, not just browsing. Cross-reference GUIDs via `Users → User Card → Telemetry ID` in BC.

---

### Query 11 — Who visited a specific page?

Replace `<page name>` with the exact page name from Query 1 results (e.g. `Sales Order List`).

```kusto
pageViews
| where timestamp > ago(30d)
| where name == "<page name>"
| summarize
    visits     = count(),
    firstVisit = min(timestamp),
    lastVisit  = max(timestamp)
    by user_Id
| order by visits desc
```

**What to look for:** `firstVisit` shows when that user first hit the page — useful for tracking onboarding or feature rollout adoption. Sort by `lastVisit` desc to find the most recent visitor.

---

### Query 12 — Who ran a specific report?

Replace `<report name>` with the exact report name from Query 2 results (e.g. `Standard Sales - Invoice`).

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "RT0006"
| where tostring(customDimensions.result) == "Success"
| where tostring(customDimensions.alObjectName) == "<report name>"
| summarize
    runs     = count(),
    firstRun = min(timestamp),
    lastRun  = max(timestamp)
    by user_Id
| order by runs desc
```

**What to look for:** A single user with very high `runs` = power user or automated trigger. If `runs = 1` for most users, it's a report everyone runs occasionally (reconciliation, VAT settlement). Combine with Query 5 to see the full session context around when they ran it.

---

### Query 13 — Who ran a report by object ID?

More reliable than filtering by name when report names vary by localization.
The object ID is in the `reportId` column from Query 2, or in the AL object declaration in the source code.

```kusto
traces
| where timestamp > ago(30d)
| where tostring(customDimensions.eventId) == "RT0006"
| where tostring(customDimensions.result) == "Success"
| where tostring(customDimensions.alObjectId) == "<report object ID>"  // e.g. "1306"
| summarize
    runs       = count(),
    firstRun   = min(timestamp),
    lastRun    = max(timestamp)
    by user_Id, reportName = tostring(customDimensions.alObjectName)
| order by runs desc
```

**What to look for:** Check `reportName` to confirm the localized name in this tenant — the same object ID can display differently across locales.

---

## Example questions

Copy and adapt these prompts when querying the AI. Replace `[tenant]` with the tenant or company name.

### Understand what the tenant does

- "Show me the activity footprint of [tenant] for the last 30 days" → Queries 1–4, 6–9
- "Which pages are visited most in [tenant]?" → Query 1
- "Which reports run most often in [tenant]?" → Query 2
- "How many unique users are active per day in [tenant]?" → Query 3
- "Are users on mobile or tablet in [tenant], or only desktop?" → Query 4
- "Which modern features are users adopting in [tenant]? Are they using Analysis Mode?" → Query 6
- "What screen resolutions do users have in [tenant]?" → Query 7
- "Which pages are users exporting to Excel in [tenant]?" → Query 8
- "Are financial reports being used in [tenant]?" → Query 9 *(requires BC v26+)*

### Investigate a specific user

- "Who are the most active users in [tenant] in the last 30 days?" → Query 10
- "What did user `<GUID>` do in [tenant] in the last 2 days? Show me everything chronologically." → Query 5
- "What did the most active user do today in [tenant]?" → Query 10 first to get the GUID, then Query 5

### Reverse lookup — who did what

- "Who visited the [page name] page in [tenant] this week?" → Query 11
- "Who ran the [report name] report in [tenant] in the last 30 days?" → Query 12
- "Who ran the report with object ID [ID] in [tenant]?" → Query 13
- "Which users have used Analysis Mode in [tenant]?" → Query 6, filter `clientAction == 'UI.AnalysisMode.Enabled'`

---

## Adjusting the time range

All queries use `ago(30d)` as the default window. Replace it with any of the following:

| Pattern | Meaning |
| --- | --- |
| `ago(2d)` | Last 2 days |
| `ago(7d)` | Last 7 days |
| `ago(90d)` | Last 90 days |
| `between(datetime(2026-06-01) .. datetime(2026-06-22))` | Fixed date range |
| `startofmonth(now())` | Since the start of the current month |

For the user trail (Query 5), a shorter window like `ago(7d)` or `ago(2d)` is recommended — longer windows produce very large result sets.

> **Timezone note:** All timestamps in Application Insights are stored and returned in **UTC**.
> If your users are in a different timezone, the hours in the results will not match local time.
> To convert to a specific timezone, add:
> ```kusto
> | extend localTime = datetime_utc_to_local(timestamp, 'Europe/Rome')  // adjust timezone as needed
> ```
> Common values: `'Europe/London'`, `'Europe/Paris'`, `'America/New_York'`, `'America/Chicago'`.
> Use `localTime` instead of `timestamp` in your `project` or `order by` clauses when you need local times.

---

## Limitations

- `user_Id` is an **anonymous GUID** — you cannot identify users by name without a separate mapping.
  If the Telemetry ID has been reset or is null, those sessions won't appear in user-level queries.
- `clientType` in `pageViews` custom dimensions may differ slightly from the standard AI `client_Type` column. Validate which one is populated in your tenant.
- `RT0004` (authorization) includes S2S and API sessions — always filter by `clientType` before counting human users. `userType` is available from BC v26+ only.
- `AL0000O76` and `AL0000OKU` (financial reports) require **BC v26+** — they will not appear in earlier versions regardless of usage. `RT0056` (Open in Excel) requires **BC 2024 release wave 2+**.
- Always run `get_event_field_samples` first to confirm optional events are present in the tenant before building further queries.
- `CL0003.clientAction` contains UI-level action codes (e.g. `UI.AnalysisMode.Enabled`), not business-level actions like "Post" — interpret accordingly.
- This pattern covers **BC Online and on-premises v24+**. On earlier versions,
  `user_Id` is only populated for server-side events, not for `pageViews`.
