# BC Telemetry Buddy - Usage Analysis Overview

**Date:** November 24, 2025  
**Analysis Period:** Last 30 days  
**Data Source:** Application Insights (Usage Telemetry)

---

## 📊 Executive Summary

- **34 unique installations** across 13 countries
- **128 total events** recorded
- **48 server sessions** started
- **95% tool success rate** (76 completed, 4 failed)
- **Strong European adoption** - Belgium and Germany leading

---

## 🎯 Overall Activity Metrics

| Metric | Value |
|--------|-------|
| Total Events | 128 |
| Unique Installations | 34 |
| Server Sessions | 48 |
| Tool Completions | 76 |
| Tool Failures | 4 |
| Success Rate | 95% |
| Active Days | 1 (Nov 24 only) |

---

## 🌍 Geographic Distribution

### Top 10 Countries by Installation Count

| Rank | Country | Installations | Events | Events per Install |
|------|---------|---------------|--------|-------------------|
| 1 | 🇧🇪 Belgium | 7 | 73 | 10.4 |
| 2 | 🇩🇪 Germany | 6 | 22 | 3.7 |
| 3 | 🇮🇹 Italy | 3 | 3 | 1.0 |
| 3 | 🇵🇱 Poland | 3 | 3 | 1.0 |
| 3 | 🇺🇸 United States | 3 | 3 | 1.0 |
| 3 | 🇨🇭 Switzerland | 3 | 13 | 4.3 |
| 7 | 🇩🇰 Denmark | 2 | 2 | 1.0 |
| 7 | 🇸🇪 Sweden | 2 | 4 | 2.0 |
| 9 | 🇨🇿 Czechia | 1 | 1 | 1.0 |
| 9 | 🇳🇴 Norway | 1 | 1 | 1.0 |

**Key Insight:** Belgium and Germany are power users, generating 74% of all events (95 out of 128).

---

## 🔧 Tool Usage Breakdown

### Overall Event Distribution

| Event Type | Count | Percentage | Unique Installations |
|------------|-------|-----------|---------------------|
| Mcp.ToolCompleted | 76 | 59% | 8 |
| Mcp.ServerStarted | 48 | 38% | 34 |
| Mcp.ToolFailed | 4 | 3% | 3 |

### Specific Tool Usage (Completed Tools Only)

| Tool Name | Usage Count | % of Tools | Unique Installations |
|-----------|-------------|-----------|---------------------|
| `query_telemetry` | 63 | 83% | 7 |
| `list_profiles` | 7 | 9% | 4 |
| `get_event_catalog` | 2 | 3% | 1 |
| `get_tenant_mapping` | 2 | 3% | 1 |
| `get_event_field_samples` | 2 | 3% | 1 |

**Key Insight:** `query_telemetry` is the dominant feature, representing 83% of all tool usage. This shows clear product-market fit for the core functionality.

---

## 📦 Version Distribution

### Version Adoption (Last 7 Days)

| Version | Installations | % Share | Events |
|---------|---------------|---------|--------|
| 2.2.0 | 21 | 57% | 63 |
| 2.2.4 | 9 | 24% | 20 |
| 2.2.2 | 6 | 16% | 44 |
| 2.2.3 | 1 | 3% | 1 |

**Key Insight:** Version fragmentation exists with 57% of users on v2.2.0 (not the latest). v2.2.4 is the current version but only adopted by 24% of installations.

---

## 🔐 Authentication Methods

| Auth Method | Installations | % Share | Sessions |
|-------------|---------------|---------|----------|
| Azure CLI | 33 | 97% | 47 |
| Client Credentials | 1 | 3% | 1 |

**Key Insight:** Azure CLI authentication is overwhelmingly preferred (97%), likely due to simpler setup and developer-friendly workflow.

---

## 📈 Activity Trend

### Daily Active Installations

| Date | Active Installations | Events |
|------|---------------------|--------|
| 2025-11-24 | 34 | 128 |

**⚠️ Data Gap Alert:** All telemetry data is concentrated on a single day (November 24, 2025). This suggests either:
- Telemetry was recently enabled
- There's a configuration issue preventing historical data collection
- Data retention policy needs review

---

## 🎯 Key Findings

### ✅ Strengths

1. **Strong European Market** - Belgium and Germany account for 13 installations (38% of total)
2. **Core Feature Success** - 83% of tool usage is `query_telemetry`, showing the main value proposition works
3. **High Reliability** - 95% tool success rate (only 4 failures out of 80 attempts)
4. **Developer-Friendly Auth** - 97% prefer Azure CLI over client credentials
5. **International Reach** - 13 countries represented shows good geographic spread

### ⚠️ Areas of Concern

1. **Version Fragmentation** - 57% of users on older v2.2.0, not latest v2.2.4
2. **Low Feature Discovery** - Advanced tools (event catalog, tenant mapping, field samples) barely used
3. **Historical Data Gap** - Only single day of telemetry visible
4. **Tool Failures** - 4 failures need investigation for root cause analysis
5. **Single Day Activity** - Cannot assess retention, churn, or growth trends

---

## 🚀 Recommendations

### Immediate Actions

1. **Investigate Telemetry Configuration**
   - Verify Application Insights is collecting historical data
   - Check data retention policies
   - Ensure telemetry timestamps are correct

2. **Analyze Tool Failures**
   - Query the 4 `Mcp.ToolFailed` events for error details
   - Identify common failure patterns
   - Implement fixes or better error handling

### Short-Term (1-2 weeks)

3. **Promote Version 2.2.4**
   - Communicate update benefits to users on v2.2.0
   - Consider auto-update notifications
   - Document what's new in v2.2.4

4. **Improve Feature Discovery**
   - Add in-app guidance for underutilized tools
   - Create tutorials for `get_event_catalog`, `get_tenant_mapping`, etc.
   - Show tool suggestions based on user context

### Long-Term (1-3 months)

5. **Establish Baseline Metrics**
   - Once historical data available, track DAU/MAU
   - Monitor retention cohorts
   - Measure feature adoption rates over time

6. **Geographic Expansion**
   - Leverage Belgium/Germany success stories
   - Create localized content for key markets
   - Build community in active regions

---

## 📋 Next Steps

1. **Wait 7 days** for more telemetry data to accumulate
2. **Re-run analysis** to identify trends and patterns
3. **Query tool failures** for detailed error information
4. **Monitor version adoption** rate for v2.2.4
5. **Track cache effectiveness** once query performance data available

---

## 📝 Query Repository

All queries used in this analysis are saved in: `UsageTelemetryAnalysis/first-overview.kql`

---

**Analysis conducted by:** GitHub Copilot  
**Report format:** Markdown  
**Next review:** 2025-12-01 (7 days)
