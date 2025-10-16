# End-to-End Test Script — GitHub Copilot Integration

**Purpose:** Validate BC Telemetry Buddy MCP integration with GitHub Copilot Chat for natural language telemetry queries.

**⚠️ CRITICAL:** This is the **primary use case** for BC Telemetry Buddy. The entire project exists to enable GitHub Copilot to query Business Central telemetry via natural language. If these tests fail, the project has failed its core objective.

**Estimated Time:** 45-60 minutes

---

## Prerequisites

### ✅ Environment Setup

**Azure/BC Environment:**
- Business Central SaaS environment with telemetry enabled
- Application Insights instance with telemetry data (ideally with errors, page views, dependencies)
- Azure CLI installed and authenticated (`az login` completed)

**VSCode Environment:**
- GitHub Copilot license active and working
- VSCode Extension Development Host running
- Test workspace open: `C:\temp\bctb-test-workspace`

**Extension Configuration:**
Create/verify `.vscode/settings.json`:
```json
{
  "bctb.mcp.connectionName": "Test Environment",
  "bctb.mcp.tenantId": "YOUR_TENANT_ID",
  "bctb.mcp.applicationInsights.appId": "YOUR_APP_INSIGHTS_APP_ID",
  "bctb.mcp.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/YOUR_SUBSCRIPTION_ID",
  "bctb.mcp.authFlow": "azure_cli",
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 300,
  "bctb.mcp.sanitize.removePII": false,
  "bctb.queries.folder": "queries"
}
```

**Pre-Test Setup:**
```powershell
# 1. Build extension
cd c:\_Source\Community\waldo.BCTelemetryBuddy
cd packages/mcp && npm run build
cd ../extension && npm run build

# 2. Launch Extension Development Host
# Press F5 in VSCode or Run → Start Debugging

# 3. Open test workspace in Extension Development Host
# File → Open Folder → C:\temp\bctb-test-workspace

# 4. Verify MCP server started
# Check Output Channel "BC Telemetry Buddy" for "MCP server started on port 52345"
```

---

## Part 1: Initial Setup Verification (5 min)

### 1.1 Verify MCP Server Running
- Open Output Channel: View → Output → "BC Telemetry Buddy"
- Look for: `[Extension] MCP server started on port 52345`
- Look for: `[Extension] MCP server health check passed`

**Expected:**
- ✅ MCP process running (check Task Manager for node.exe)
- ✅ No authentication errors (azure_cli should be seamless)
- ✅ Health check passes every 30 seconds

**If Failed:**
- Check `az login` completed successfully
- Verify Application Insights App ID correct
- Run Command Palette: `BC Telemetry Buddy: Start MCP Server` manually

### 1.2 Open GitHub Copilot Chat
- Press `Ctrl+Alt+I` (or View → Chat → Focus on Chat View)
- GitHub Copilot Chat panel opens on the right side

**Expected:**
- ✅ Chat panel visible
- ✅ Can type messages
- ✅ Copilot responds to basic queries (test: "what is typescript?")

---

## Part 2: Verify MCP Tools Registration (5 min)

### 2.1 Test MCP Server Tool List (Direct Method)
The `@workspace /` dropdown is **unreliable** for showing MCP tools. Instead, test the MCP server directly:

**In PowerShell:**
```powershell
$body = @{
    jsonrpc = "2.0"
    method = "tools/list"
    params = @{}
    id = 1
} | ConvertTo-Json

Invoke-RestMethod -Uri 'http://localhost:52345/rpc' -Method Post -ContentType 'application/json' -Body $body
```

**Expected:**
- ✅ Returns JSON with `tools` array
- ✅ Shows 11 tools: query_telemetry, get_saved_queries, search_queries, save_query, get_categories, get_recommendations, get_external_queries, get_event_catalog, get_event_schema, get_tenant_mapping, and cache management tools
- ✅ Each tool has name, description, inputSchema

**If Failed:**
- Check MCP server is running (Output Channel should show "MCP server started")
- Verify port 52345 is accessible
- Restart Extension Development Host

### 2.2 Test Tool Discovery via Copilot
In Copilot Chat, type:
```
@workspace What telemetry tools or capabilities do you have for Business Central?
```

**Expected (CORRECTED):**
- ✅ Copilot describes **MCP tools** (query_telemetry, get_saved_queries, save_query, etc.)
- ✅ Explains tool capabilities (not just workspace settings)
- ✅ No errors in Output Channel

**If Copilot only describes workspace settings:**
This means MCP tools are NOT registered. Copilot is reading settings.json but not seeing the MCP server's tools.

**Debug Steps:**
1. Verify `tools/list` works (see 2.1 above)
2. Check Output Channel for MCP registration errors
3. Restart Extension Development Host (Ctrl+Shift+F5)
4. Verify `Instructions/Instructions.md` exists

**⚠️ CRITICAL CHECKPOINT:** If Copilot can't see MCP tools after debugging, the integration has failed. Do NOT continue to Part 3 until this is resolved.

---

## Part 3: Basic Telemetry Queries (10 min)

### 3.1 Simple Error Query (PRIMARY TEST)
**This is the core test that proves the entire project works.**

In Copilot Chat, type:
```
@workspace Show me all errors from my Business Central telemetry in the last 24 hours
```

**WATCH OUTPUT CHANNEL FIRST** (View → Output → "BC Telemetry Buddy"):
- ✅ **CRITICAL**: Look for `[MCP Client] query_telemetry -> ...` — this proves Copilot invoked your MCP tool
- ✅ Look for `[MCP] Translating NL to KQL: "Show me all errors..."`
- ✅ Look for `[MCP] ✓ Query executed successfully`

**If you don't see `[MCP Client] query_telemetry` in the Output Channel:**
- MCP integration has failed
- Copilot is not calling your tools
- STOP and debug Part 2 before continuing

**Then check Copilot Chat Response:**
- ✅ Natural language translated to KQL (e.g., `traces | where severityLevel >= 3 | where timestamp > ago(1d)`)
- ✅ Query executes successfully
- ✅ Results displayed in chat (formatted table or structured text)
- ✅ Copilot provides natural language summary (e.g., "Found 42 errors in the last 24 hours")
- ✅ Row count mentioned

**Verify Data:**
- Timestamps within 24 hours
- Error messages from your BC environment visible
- No authentication errors

**If Failed (but MCP Client log appeared):**
- MCP integration works! Issue is with query/auth/data
- Check Output Channel for detailed error
- Verify Application Insights has data
- Try simpler query: "Show me any telemetry from the last hour"

### 3.2 Follow-Up Filtering
Continue the conversation:
```
Filter those errors to only show SQL-related errors
```

**Expected:**
- ✅ Copilot refines the previous query
- ✅ Uses context from previous result
- ✅ Adds filter (e.g., `| where message contains "SQL"` or `| where customDimensions.category == "Database"`)
- ✅ New results show only SQL errors
- ✅ Copilot explains what was filtered

**This tests conversational context and query refinement.**

### 3.3 Different Telemetry Types
```
@workspace Show me page views from the last 7 days grouped by page name
```

**Expected:**
- ✅ Copilot generates appropriate KQL (e.g., `pageViews | where timestamp > ago(7d) | summarize count() by name`)
- ✅ Results grouped/aggregated
- ✅ Copilot summarizes top pages

### 3.4 Time-Based Analysis
```
@workspace Show me the trend of errors over the last week, grouped by day
```

**Expected:**
- ✅ Uses `bin(timestamp, 1d)` for daily grouping
- ✅ Results show time series data
- ✅ Copilot identifies patterns (e.g., "Errors peaked on Monday")

---

## Part 4: Saved Queries Management (10 min)

### 4.1 List Existing Queries
```
@workspace What saved telemetry queries do I have?
```

**Expected:**
- ✅ Copilot uses `get_saved_queries` tool
- ✅ Lists queries (may be empty if first run)
- ✅ Shows query names, purposes, categories
- ✅ Output Channel shows tool invocation

**If Empty:**
This is expected for first run. Continue to 4.2.

### 4.2 Save Query via Copilot
```
@workspace Save this telemetry query for me:

Name: Recent Errors
Category: Monitoring
Purpose: Track errors in the last 24 hours for daily review
Use Case: Morning health check
Tags: errors, monitoring, daily
KQL: traces | where severityLevel >= 3 | where timestamp > ago(1d) | project timestamp, message, severityLevel
```

**Expected:**
- ✅ Copilot uses `save_query` tool
- ✅ Output Channel shows: `[MCP Client] save_query -> ...`
- ✅ File created: `queries/Monitoring/Recent Errors.kql`
- ✅ Copilot confirms: "Query saved successfully to queries/Monitoring/Recent Errors.kql"
- ✅ File visible in VSCode Explorer

**Verify File Content:**
Open `queries/Monitoring/Recent Errors.kql`:
```kql
// Query: Recent Errors
// Category: Monitoring
// Purpose: Track errors in the last 24 hours for daily review
// Use Case: Morning health check
// Created: 2025-10-16
// Tags: errors, monitoring, daily

traces | where severityLevel >= 3 | where timestamp > ago(1d) | project timestamp, message, severityLevel
```

### 4.3 Save Another Query (Different Category)
```
@workspace Save this query as "Slow Page Views" in the Performance category:

pageViews | where duration > 2000 | project timestamp, name, duration, url
Purpose: Identify pages loading slowly
Tags: performance, pageviews
```

**Expected:**
- ✅ File created: `queries/Performance/Slow Page Views.kql`
- ✅ Category folder created automatically
- ✅ Copilot confirms save location

### 4.4 List Queries Again
```
@workspace List my saved telemetry queries
```

**Expected:**
- ✅ Shows both queries: "Recent Errors" and "Slow Page Views"
- ✅ Categories displayed: Monitoring, Performance
- ✅ Purposes shown

### 4.5 Run Saved Query
```
@workspace Run my "Recent Errors" saved query
```

**Expected:**
- ✅ Copilot retrieves KQL from saved query
- ✅ Executes via `query_telemetry`
- ✅ Shows results
- ✅ Mentions query was from saved library

---

## Part 5: Query Search and Discovery (5 min)

### 5.1 Search by Keyword
```
@workspace Search my saved queries for anything about performance
```

**Expected:**
- ✅ Copilot uses `search_queries` tool
- ✅ Returns "Slow Page Views" (matches "performance" in category/purpose)
- ✅ Shows full query details

### 5.2 Search by Multiple Terms
```
@workspace Find queries related to errors or monitoring
```

**Expected:**
- ✅ Returns "Recent Errors" (matches both "errors" and "monitoring")
- ✅ Ranked by relevance

### 5.3 Search with No Results
```
@workspace Search for queries about invoices
```

**Expected:**
- ✅ Copilot reports no matching queries found
- ✅ Suggests creating a new query
- ✅ No crash or error

---

## Part 6: Query Recommendations (5 min)

### 6.1 Basic Recommendation
```
@workspace Suggest improvements for this query:
traces | where timestamp > ago(1d)
```

**Expected:**
- ✅ Copilot uses `get_recommendations` tool
- ✅ Suggestions provided (e.g., "Add severityLevel filter", "Use specific columns in project", "Add summarize for better performance")
- ✅ Recommendations include examples
- ✅ May reference external KQL examples if configured

### 6.2 Recommendation with Context
```
@workspace How can I optimize this query?
pageViews | where name contains "Customer" | where timestamp > ago(30d)
```

**Expected:**
- ✅ Analyzes query structure
- ✅ Suggests optimizations (index hints, query reordering, aggregation)
- ✅ Provides optimized version

---

## Part 7: Complex Multi-Step Workflows (10 min)

### 7.1 Analysis Workflow
```
@workspace Help me analyze BC telemetry errors:
1. Show me all errors from the last 7 days
2. Group them by error type or message pattern
3. Identify the top 5 most common errors
4. Save the query as "Weekly Error Analysis" in Monitoring category
5. Then show me the time distribution of the most common error
```

**Expected:**
- ✅ Copilot breaks task into steps
- ✅ Executes initial query (all errors, 7 days)
- ✅ Refines with grouping/aggregation
- ✅ Shows top 5 errors with counts
- ✅ Saves query using `save_query` tool
- ✅ Filters to most common error and shows time distribution
- ✅ Provides natural language summary throughout

**This tests:**
- Multi-step reasoning
- Query refinement
- Tool chaining (query → analyze → save → re-query)
- Context retention

### 7.2 Comparison Workflow
```
@workspace Compare errors between last week and this week:
- Show me error count by day for last 14 days
- Highlight if this week has more errors than last week
- If errors increased, show me what types of errors increased
```

**Expected:**
- ✅ Generates time-series query with 14-day window
- ✅ Uses `bin()` for daily grouping
- ✅ Copilot analyzes trends (may need to calculate in chat)
- ✅ If increase detected, drills down into error types
- ✅ Natural language explanation of findings

### 7.3 Investigation Workflow
```
@workspace I need to investigate slow performance:
- Find all page views with duration > 5 seconds in last 24 hours
- Show me which pages are slowest
- For the slowest page, show me all related dependencies
- Save both queries for future reference
```

**Expected:**
- ✅ Query 1: Slow page views
- ✅ Identifies slowest page(s)
- ✅ Query 2: Dependencies for that page (uses `dependencies` table, filters by page context)
- ✅ Saves both queries with appropriate names/categories
- ✅ Provides investigation summary

---

## Part 8: Error Handling and Edge Cases (10 min)

### 8.1 Invalid Query Request
```
@workspace Query my telemetry for invalid_table_that_does_not_exist
```

**Expected:**
- ✅ MCP attempts query
- ✅ Application Insights returns error (e.g., "Semantic error: 'invalid_table_that_does_not_exist' not found")
- ✅ Copilot explains error in natural language
- ✅ Copilot suggests corrections: "Did you mean 'traces', 'pageViews', or 'dependencies'?"
- ✅ Conversation continues (no crash)

### 8.2 Query with No Results
```
@workspace Show me errors with message "NONEXISTENT_ERROR_XYZ_12345"
```

**Expected:**
- ✅ Query executes successfully
- ✅ Returns 0 results
- ✅ Copilot reports: "No errors found with that message"
- ✅ May suggest broadening search

### 8.3 Ambiguous Request
```
@workspace Show me stuff from yesterday
```

**Expected:**
- ✅ Copilot asks for clarification OR makes reasonable assumption
- ✅ If executes: uses `traces` table with yesterday's date filter
- ✅ Mentions what was assumed

### 8.4 Very Large Result Set
```
@workspace Show me all telemetry from the last 30 days
```

**Expected:**
- ✅ Query executes
- ✅ Results may be truncated (Application Insights limits)
- ✅ Copilot mentions result limits
- ✅ Suggests adding filters or summarization

### 8.5 Authentication Failure Scenario
**Manual Test:**
- Stop MCP server: Command Palette → `BC Telemetry Buddy: Stop MCP Server`
- In terminal: Logout from Azure CLI: `az logout`
- Restart MCP: Command Palette → `BC Telemetry Buddy: Start MCP Server`
- Try query in Copilot: `@workspace Show me errors from last hour`

**Expected:**
- ✅ MCP fails to authenticate (azure_cli flow requires login)
- ✅ Error message visible in Output Channel
- ✅ Copilot reports authentication failure
- ✅ Suggests re-running `az login`

**Restore:**
```powershell
az login
```
Restart MCP, verify queries work again.

---

## Part 9: Integration with Saved Queries (5 min)

### 9.1 Query with Context
```
@workspace Show me performance data similar to my saved queries
```

**Expected:**
- ✅ Copilot uses saved queries as context
- ✅ Generates query inspired by "Slow Page Views"
- ✅ May combine patterns from multiple saved queries

### 9.2 Modify Saved Query
```
@workspace Take my "Recent Errors" query and modify it to show last 48 hours instead of 24
```

**Expected:**
- ✅ Retrieves saved query
- ✅ Modifies time filter: `ago(1d)` → `ago(2d)`
- ✅ Executes modified query
- ✅ Optionally asks if you want to save the new version

### 9.3 Combine Queries
```
@workspace Combine insights from my "Recent Errors" and "Slow Page Views" queries - show me if there's correlation between errors and slow pages
```

**Expected:**
- ✅ Retrieves both saved queries
- ✅ Generates combined query (joins or separate queries with analysis)
- ✅ Analyzes correlation
- ✅ Provides insights

---

## Part 10: Natural Language Flexibility (5 min)

Test how Copilot handles different phrasings for the same intent:

### 10.1 Formal Request
```
@workspace Please execute a query to retrieve all error-level traces from Application Insights for the previous 24-hour period.
```

### 10.2 Casual Request
```
@workspace hey show me errors from yesterday
```

### 10.3 Technical Request
```
@workspace Run a KQL query on traces table filtering severityLevel >= 3 with timestamp > ago(1d)
```

### 10.4 Business-Focused Request
```
@workspace I need to check if there were any issues with the application yesterday
```

**All Should Result In:**
- ✅ Similar or identical KQL queries generated
- ✅ Successful execution
- ✅ Appropriate natural language responses matching tone

---

## Success Criteria Checklist

### 🎯 Critical (Must Pass)
- [ ] MCP tools visible in Copilot Chat (`@workspace /`)
- [ ] Basic telemetry query works (Part 3.1)
- [ ] Copilot translates natural language to KQL correctly
- [ ] Query results displayed and summarized
- [ ] Follow-up questions work (conversational context)
- [ ] Save query creates file in correct location with category
- [ ] List saved queries returns correct results
- [ ] Search queries finds matches
- [ ] Multi-step workflows complete successfully
- [ ] Error handling graceful (no crashes)

### ✅ Important (Should Pass)
- [ ] Query recommendations provided
- [ ] Complex analysis workflows work
- [ ] Saved queries used as context
- [ ] Different phrasings understood
- [ ] Time-based aggregations work
- [ ] Multiple telemetry types accessible (traces, pageViews, dependencies)

### 💡 Nice to Have (Optional)
- [ ] External references used in recommendations (if configured)
- [ ] Query optimization suggestions
- [ ] Correlation analysis between queries

---

## Troubleshooting

### Issue: MCP Tools Not Visible in Copilot

**Check:**
1. Output Channel for MCP registration errors
2. `Instructions/Instructions.md` exists and has proper MCP tool definitions
3. MCP server actually running (health check messages)
4. Restart Extension Development Host

**Debug Commands:**
```powershell
# Check MCP server responding
Invoke-RestMethod -Uri 'http://localhost:52345/health' -Method Get

# Check if tools endpoint works
Invoke-RestMethod -Uri 'http://localhost:52345/rpc' -Method Post -ContentType 'application/json' -Body '{"jsonrpc":"2.0","method":"get_saved_queries","params":{},"id":1}'
```

### Issue: Queries Fail with Authentication Error

**Check:**
1. `az login` completed: Run `az account show`
2. Correct tenant/subscription active: `az account list`
3. Application Insights App ID correct in settings.json
4. Try different auth flow: Change `authFlow` to `device_code` and restart

### Issue: No Telemetry Data Returned

**Check:**
1. Application Insights has data: Open Azure Portal → Application Insights → Logs
2. Try direct KQL query: `traces | take 10`
3. Check time range (use broader range: `ago(30d)`)
4. Verify Application Insights App ID correct

### Issue: Saved Queries Not Found

**Check:**
1. `queries/` folder exists in workspace root
2. .kql files have proper format (comments at top)
3. MCP server restarted after creating files manually
4. Check Output Channel for file parsing errors

---

## Test Results Summary

After completing all tests, fill out:

**Date:** _______________  
**Tester:** _______________  
**Extension Version:** _______________

| Test Part | Status | Notes |
|-----------|--------|-------|
| Part 1: Setup Verification | ⬜ Pass ⬜ Fail | |
| Part 2: MCP Tools Registration | ⬜ Pass ⬜ Fail | |
| Part 3: Basic Queries | ⬜ Pass ⬜ Fail | |
| Part 4: Saved Queries | ⬜ Pass ⬜ Fail | |
| Part 5: Query Search | ⬜ Pass ⬜ Fail | |
| Part 6: Recommendations | ⬜ Pass ⬜ Fail | |
| Part 7: Complex Workflows | ⬜ Pass ⬜ Fail | |
| Part 8: Error Handling | ⬜ Pass ⬜ Fail | |
| Part 9: Integration | ⬜ Pass ⬜ Fail | |
| Part 10: NL Flexibility | ⬜ Pass ⬜ Fail | |

**Overall Result:** ⬜ PASS ⬜ FAIL

**Critical Issues Found:**
- [ ] None
- [ ] List issues here

**Recommended Actions:**
- [ ] Ready for release
- [ ] Needs bug fixes (list above)
- [ ] Needs performance improvements
- [ ] Needs additional testing

---

## Next Steps

**If All Tests Pass ✅:**
1. Document any interesting edge cases discovered
2. Create sample queries for documentation/demo
3. Take screenshots for README.md
4. Prepare for marketplace publishing
5. Write user guide with real examples from testing

**If Tests Fail ❌:**
1. Capture detailed logs from Output Channel
2. Note exact Copilot queries that failed
3. Check MCP server logs (stderr/stdout)
4. Review `Instructions.md` tool definitions
5. Test with simplified MCP setup
6. File GitHub issues with reproduction steps

---

**Remember:** The entire value of BC Telemetry Buddy is in the Copilot integration. If natural language telemetry queries don't work smoothly through Copilot Chat, the project hasn't achieved its goal. Command Palette functionality is just scaffolding for testing the underlying infrastructure.

🎯 **Goal:** "Show me errors from yesterday" should just work in Copilot Chat.
