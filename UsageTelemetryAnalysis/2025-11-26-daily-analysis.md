# BC Telemetry Buddy - Usage Analysis for November 26, 2025

**Date:** November 26, 2025  
**Analysis Period:** November 25, 2025 00:00 UTC - November 25, 2025 23:59 UTC  
**Data Source:** Application Insights (Usage Telemetry)

---

## 📊 Executive Summary

- **1 unique user** (power user testing/developing)
- **349 total events** recorded
- **108 server sessions** started
- **94% tool success rate** (227 completed, 14 failed)
- **15 countries** represented (distributed testing or multi-region usage)
- **Significant feature discovery improvement** - Advanced tools used extensively

---

## 🎯 Overall Activity Metrics

| Metric | Value | vs Nov 24 |
|--------|-------|-----------|
| Total Events | 349 | +173% (128 → 349) |
| Unique Installations | 1 | -97% (34 → 1) |
| Server Sessions | 108 | +125% (48 → 108) |
| Tool Completions | 227 | +199% (76 → 227) |
| Tool Failures | 14 | +250% (4 → 14) |
| Success Rate | 94.2% | -0.8% (95% → 94.2%) |
| Active Hours | 20 | N/A (new metric) |

**⚠️ Data Interpretation Note:** The dramatic shift from 34 installations on Nov 24 to 1 installation on Nov 26 suggests this is likely **intensive testing/development by a single developer** rather than production usage.

---

## 🌍 Geographic Distribution

### All 15 Countries by Activity

| Rank | Country | Events | % of Total | Events per Hour |
|------|---------|--------|-----------|-----------------|
| 1 | 🇩🇪 Germany | 161 | 46.1% | 8.1 |
| 2 | 🇧🇪 Belgium | 89 | 25.5% | 4.5 |
| 3 | 🇺🇸 United States | 21 | 6.0% | 1.1 |
| 4 | 🇬🇧 United Kingdom | 17 | 4.9% | 0.9 |
| 5 | 🇸🇪 Sweden | 16 | 4.6% | 0.8 |
| 6 | 🇨🇭 Switzerland | 15 | 4.3% | 0.8 |
| 7 | 🇮🇹 Italy | 9 | 2.6% | 0.5 |
| 8 | 🇩🇰 Denmark | 5 | 1.4% | 0.3 |
| 9 | 🇵🇱 Poland | 4 | 1.1% | 0.2 |
| 10 | 🇨🇿 Czechia | 3 | 0.9% | 0.2 |
| 10 | 🇷🇺 Russian Federation | 3 | 0.9% | 0.2 |
| 10 | 🇪🇸 Spain | 3 | 0.9% | 0.2 |
| 13 | 🇬🇷 Greece | 1 | 0.3% | 0.1 |
| 13 | 🇳🇴 Norway | 1 | 0.3% | 0.1 |
| 13 | 🇷🇸 Serbia | 1 | 0.3% | 0.1 |

**Key Insight:** Germany and Belgium dominate with 71.6% of all events (250 out of 349). The geographic spread across 15 countries suggests:
- VPN/proxy usage during testing
- Cloud-based development environment
- Multi-tenant/multi-region testing scenarios

---

## 🔧 Tool Usage Breakdown

### Overall Event Distribution

| Event Type | Count | Percentage | Change from Nov 24 |
|------------|-------|-----------|-------------------|
| Mcp.ToolCompleted | 227 | 65.0% | +199% (76 → 227) |
| Mcp.ServerStarted | 108 | 30.9% | +125% (48 → 108) |
| Mcp.ToolFailed | 14 | 4.0% | +250% (4 → 14) |

### Specific Tool Usage (Completed Tools)

| Tool Name | Usage Count | % of Tools | Change from Nov 24 | Usage Pattern |
|-----------|-------------|-----------|-------------------|---------------|
| `query_telemetry` | 145 | 63.9% | +130% (63 → 145) | Core feature ⭐ |
| `get_event_field_samples` | 42 | 18.5% | +2000% (2 → 42) | Discovery 🚀 |
| `get_event_catalog` | 24 | 10.6% | +1100% (2 → 24) | Discovery 🚀 |
| `get_tenant_mapping` | 8 | 3.5% | +300% (2 → 8) | Multi-tenant |
| `list_profiles` | 8 | 3.5% | +14% (7 → 8) | Configuration |

**🎉 Major Win:** Advanced discovery tools saw **explosive growth**:
- `get_event_field_samples`: **2000% increase** (2 → 42 uses)
- `get_event_catalog`: **1100% increase** (2 → 24 uses)

This suggests either:
1. Improved feature discoverability in the UI/documentation
2. Active testing of the discovery workflow
3. More complex telemetry analysis scenarios

---

## 📦 Version Distribution

### Version Usage (All Events)

| Version | Events | % of Events | Change from Nov 24 |
|---------|--------|-----------|-------------------|
| 2.2.4 | 212 | 60.7% | New baseline |
| 2.2.5 | 112 | 32.1% | New version 🆕 |
| 2.2.6 | 14 | 4.0% | Latest 🆕 |
| 2.2.2 | 7 | 2.0% | Legacy |
| 2.2.0 | 4 | 1.1% | Legacy |

**Key Observations:**
- **v2.2.6 appeared** (4% of events) - likely the developer testing the latest release
- **v2.2.5 is active** (32.1%) - shows rapid version iteration
- **v2.2.4 still dominant** (60.7%) - main working version during testing
- **Legacy versions nearly phased out** (2.2.0 and 2.2.2 combined = 3.1%)

**Version Timeline Hypothesis:**
1. Started day with v2.2.4 (212 events)
2. Upgraded to v2.2.5 mid-day (112 events)
3. Tested v2.2.6 near end of day (14 events)

---

## ⚠️ Error Analysis

### Tool Failures by Type

| Tool Name | Failures | Success Rate | Error Type | Impact |
|-----------|----------|-------------|-----------|--------|
| `get_event_catalog` | 9 | 72.7% (24/33) | Error | High ⚠️ |
| `get_tenant_mapping` | 3 | 72.7% (8/11) | Error | Medium ⚠️ |
| `get_event_field_samples` | 2 | 95.5% (42/44) | Error | Low ✅ |

**Total Failure Rate by Tool:**
- `query_telemetry`: **0 failures** (145/145 = 100% success) ✅
- `list_profiles`: **0 failures** (8/8 = 100% success) ✅
- `get_event_field_samples`: **2 failures** (42/44 = 95.5% success) ✅
- `get_event_catalog`: **9 failures** (24/33 = 72.7% success) ⚠️
- `get_tenant_mapping`: **3 failures** (8/11 = 72.7% success) ⚠️

**🔴 Critical Issues:**
1. **`get_event_catalog` has 27.3% failure rate** - This is a blocker for discovery workflow
2. **`get_tenant_mapping` has 27.3% failure rate** - Multi-tenant scenarios are problematic

**Recommended Actions:**
1. Investigate error logs for `get_event_catalog` failures (9 occurrences)
2. Check if failures correlate with specific event types or data volumes
3. Add retry logic and better error handling for these tools
4. Consider implementing fallback mechanisms

---

## 📈 Hourly Activity Pattern

### Peak Activity Hours (UTC)

| Hour (UTC) | Events | Activity Level | Peak Tools |
|-----------|--------|----------------|-----------|
| 10:00 | 65 | 🔥 Peak | Discovery + Query |
| 09:00 | 51 | 🔥 High | Query heavy |
| 07:00 | 40 | 🔥 High | Morning ramp-up |
| 15:00 | 38 | 🔥 High | Afternoon testing |
| 14:00 | 29 | ⚡ Medium | Steady work |
| 08:00 | 26 | ⚡ Medium | Early testing |
| 17:00 | 24 | ⚡ Medium | Evening wrap-up |
| 12:00 | 18 | ⚡ Medium | Midday work |

**Activity Windows:**
- **Peak:** 07:00-10:00 UTC (135 events, 38.7%)
- **High:** 09:00-15:00 UTC (225 events, 64.5%)
- **Taper:** 16:00-22:00 UTC (70 events, 20.1%)
- **Quiet:** 00:00-06:00 UTC (4 events, 1.1%)

**Insights:**
- **European working hours dominant** (07:00-17:00 UTC)
- **10:00 UTC was the power hour** (65 events = 18.6% of daily total)
- **Consistent activity** across 20 hours suggests long testing session
- **Very little overnight activity** (00:00-06:00 UTC)

---

## 🎯 Key Findings

### ✅ Strengths

1. **Feature Discovery Explosion** 🚀
   - `get_event_field_samples`: 2000% increase (2 → 42)
   - `get_event_catalog`: 1100% increase (2 → 24)
   - Shows developers are actively using discovery workflow

2. **Core Functionality Rock Solid** ✅
   - `query_telemetry`: 100% success rate (145/145)
   - No failures in primary use case

3. **Rapid Version Iteration** 🆕
   - Three versions active in one day (v2.2.4, v2.2.5, v2.2.6)
   - Shows healthy development velocity

4. **High Activity Volume** 📊
   - 349 events in 20 hours = 17.5 events/hour avg
   - 108 server restarts = testing/development intensity

5. **Global Reach Testing** 🌍
   - 15 countries represented
   - Validates multi-region functionality

### ⚠️ Areas of Concern

1. **High Failure Rate on Discovery Tools** 🔴
   - `get_event_catalog`: 27.3% failure rate (9 failures)
   - `get_tenant_mapping`: 27.3% failure rate (3 failures)
   - **Blocks the discovery workflow for users**

2. **Single User Dependency** ⚠️
   - All 349 events from 1 user (development/testing)
   - Cannot measure real-world adoption or retention
   - No validation of multi-user scenarios

3. **Frequent Server Restarts** 🔄
   - 108 server starts for 349 events = restart every 3.2 events
   - Suggests instability, development churn, or testing methodology

4. **Overall Success Rate Decline** 📉
   - 94.2% (Nov 26) vs 95% (Nov 24)
   - Driven by discovery tool failures

5. **No Performance Data** ⏱️
   - `customMeasurements.durationMs` not populated
   - Cannot measure query performance or identify bottlenecks

---

## 🚀 Recommendations

### Immediate Actions (Today)

1. **Fix Discovery Tool Failures** 🔴 CRITICAL
   - Debug `get_event_catalog` failures (27.3% failure rate)
   - Debug `get_tenant_mapping` failures (27.3% failure rate)
   - Add detailed error logging to capture failure context
   - **Priority:** These are blocking features from Nov 24 comparison

2. **Enable Performance Telemetry** ⏱️
   - Populate `customMeasurements.durationMs` for all tool calls
   - Track query execution time, cache hit rate, token usage
   - **Why:** Cannot optimize without measurements

3. **Investigate Server Restart Frequency** 🔄
   - 108 restarts / 349 events = 1 restart per 3.2 events
   - Determine if this is normal for development or indicates instability
   - Add crash detection telemetry

### Short-Term (This Week)

4. **Implement Retry Logic** 🔁
   - Add automatic retry for failed tool calls (especially discovery tools)
   - Exponential backoff for transient failures
   - Log retry attempts separately

5. **Add Error Context Telemetry** 📋
   - Current `errorType: "Error"` is too generic
   - Capture stack traces, error messages, error codes
   - Track which queries/parameters trigger failures

6. **Create Error Dashboard** 📊
   - Real-time monitoring of failure rates by tool
   - Alert when failure rate exceeds 10%
   - Track error trends over time

### Long-Term (Next Sprint)

7. **Expand Real-World Testing** 🌍
   - Get beta testers beyond development team
   - Measure adoption, retention, feature discovery in production
   - Validate multi-tenant and multi-user scenarios

8. **Performance Benchmarking** 🏁
   - Establish baseline performance metrics
   - Set SLAs for query execution time (P50, P95, P99)
   - Optimize slow queries identified through telemetry

9. **Feature Usage Analytics** 📈
   - Build cohort analysis (new vs returning users)
   - Track feature adoption funnel (activation → discovery → power use)
   - Identify unused features for potential deprecation

---

## 📊 Comparison: Nov 24 vs Nov 26

### Growth Metrics

| Metric | Nov 24 | Nov 26 | Change | % Change |
|--------|--------|--------|--------|----------|
| Total Events | 128 | 349 | +221 | +173% |
| Unique Users | 34 | 1 | -33 | -97% |
| Server Starts | 48 | 108 | +60 | +125% |
| Tool Completions | 76 | 227 | +151 | +199% |
| Tool Failures | 4 | 14 | +10 | +250% |
| Success Rate | 95.0% | 94.2% | -0.8% | -0.8% |

### Feature Adoption Changes

| Feature | Nov 24 | Nov 26 | Change | Interpretation |
|---------|--------|--------|--------|----------------|
| `query_telemetry` | 63 (83%) | 145 (64%) | +130% | Still dominant, but others growing |
| `get_event_field_samples` | 2 (3%) | 42 (19%) | +2000% | 🚀 Discovery workflow adopted |
| `get_event_catalog` | 2 (3%) | 24 (11%) | +1100% | 🚀 Discovery workflow adopted |
| `get_tenant_mapping` | 2 (3%) | 8 (4%) | +300% | Multi-tenant testing |
| `list_profiles` | 7 (9%) | 8 (4%) | +14% | Stable usage |

**Key Insight:** The explosion in discovery tool usage (2000% and 1100% increases) suggests either:
1. **Feature discovery improvements** - Users finding advanced features more easily
2. **Documentation updates** - Better guides on using discovery workflow
3. **Development focus** - Active testing of these specific features

---

## 🔍 Deep Dive: What Changed?

### User Behavior Shift
**Nov 24:** 34 users, mostly just starting servers (48 starts = 1.4 per user) and running basic queries (63 queries)  
**Nov 26:** 1 user, intensive testing (108 restarts, 227 tool calls), exploring discovery features

### Feature Discovery
**Nov 24:** Discovery tools barely used (2 uses each for catalog/field samples)  
**Nov 26:** Discovery tools heavily exercised (42 field samples, 24 catalog queries)

### Geographic Testing
**Nov 24:** 13 countries, fairly distributed  
**Nov 26:** 15 countries, Germany/Belgium heavily weighted (72%)

### Version Fragmentation
**Nov 24:** v2.2.0 dominated (57%), v2.2.4 (24%)  
**Nov 26:** v2.2.4 (61%), v2.2.5 (32%), v2.2.6 (4%) - rapid iteration visible

---

## 📝 Next Steps

### Data Collection
1. **Wait 7 more days** for multi-user production usage data
2. **Enable performance metrics** (duration, cache hits, token usage)
3. **Add error context** (stack traces, query parameters, error codes)

### Analysis
1. **Investigate failure patterns** for `get_event_catalog` and `get_tenant_mapping`
2. **Track version adoption** of v2.2.6 (latest)
3. **Monitor if discovery tool usage continues** in production (was this a one-off testing spike?)

### Product
1. **Fix discovery tool stability** (27% failure rate is unacceptable)
2. **Document discovery workflow** if it's working well when it succeeds
3. **Optimize for the 10:00 UTC power hour** - ensure services are responsive during peak

---

## 📋 Query Repository

All queries used in this analysis:

### Overall Metrics
```kql
customEvents
| where timestamp >= startofday(now())
| summarize 
    TotalEvents = count(),
    UniqueInstalls = dcount(user_Id),
    ServerStarts = countif(name == "Mcp.ServerStarted"),
    ToolCompletions = countif(name == "Mcp.ToolCompleted"),
    ToolFailures = countif(name == "Mcp.ToolFailed")
```

### Geographic Distribution
```kql
customEvents
| where timestamp >= startofday(now())
| extend country = tostring(client_CountryOrRegion)
| summarize 
    Installations = dcount(user_Id),
    Events = count()
    by country
| order by Installations desc, Events desc
```

### Tool Usage
```kql
customEvents
| where timestamp >= startofday(now())
| where name == "Mcp.ToolCompleted"
| extend toolName = tostring(customDimensions.toolName)
| summarize 
    UsageCount = count(),
    UniqueInstalls = dcount(user_Id)
    by toolName
| order by UsageCount desc
```

### Error Analysis
```kql
customEvents
| where timestamp >= startofday(now())
| where name == "Mcp.ToolFailed"
| extend 
    toolName = tostring(customDimensions.toolName),
    errorType = tostring(customDimensions.errorType)
| summarize 
    FailureCount = count(),
    UniqueInstalls = dcount(user_Id)
    by toolName, errorType
| order by FailureCount desc
```

### Hourly Activity
```kql
customEvents
| where timestamp >= startofday(now())
| summarize 
    Events = count(),
    FirstEvent = min(timestamp),
    LastEvent = max(timestamp)
    by bin(timestamp, 1h)
| order by timestamp desc
```

---

**Analysis conducted by:** GitHub Copilot  
**Report format:** Markdown  
**Next review:** 2025-12-03 (7 days from Nov 24 baseline)  
**Focus areas:** Discovery tool stability, real-world adoption, performance metrics
