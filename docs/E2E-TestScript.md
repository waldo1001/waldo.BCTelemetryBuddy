# End-to-End Test Script — BC Telemetry Buddy

**Purpose:** Validate the complete extension lifecycle, from installation to query execution, in VSCode Extension Development Host.

**Estimated Time:** 30-45 minutes

---

## Prerequisites

✅ **Azure Environment Ready:**
- Business Central SaaS environment with telemetry enabled
- Application Insights instance with telemetry data
- Azure AD app registration (if using client credentials)

✅ **Credentials Ready:**
- Tenant ID
- Application Insights App ID
- Kusto Cluster URL (e.g., `https://ade.applicationinsights.io/subscriptions/{subscription-id}`)
- Optional: Client ID + Client Secret (for `client_credentials` flow)

✅ **Extension Built:**
```powershell
cd c:\_Source\Community\waldo.BCTelemetryBuddy\packages\extension
npm run build
```

---

## Part 1: Workspace Setup (5 min)

### 1.1 Create Test Workspace
```powershell
# Create test workspace folder
mkdir C:\temp\bctb-test-workspace
cd C:\temp\bctb-test-workspace
mkdir .vscode
```

### 1.2 Configure Extension Settings
Create `.vscode/settings.json`:
```json
{
  "bctb.mcp.connectionName": "Test Environment",
  "bctb.mcp.tenantId": "YOUR_TENANT_ID",
  "bctb.mcp.applicationInsights.appId": "YOUR_APP_INSIGHTS_APP_ID",
  "bctb.mcp.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/YOUR_SUBSCRIPTION_ID",
  "bctb.mcp.authFlow": "device_code",
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 300,
  "bctb.mcp.sanitize.removePII": false
}
```

**Alternative:** For automated testing, use `client_credentials`:
```json
{
  "bctb.mcp.authFlow": "client_credentials",
  "bctb.mcp.clientId": "YOUR_CLIENT_ID",
  "bctb.mcp.clientSecret": "YOUR_CLIENT_SECRET"
}
```

---

## Part 2: Launch Extension (2 min)

### 2.1 Open Extension Project
- Open `c:\_Source\Community\waldo.BCTelemetryBuddy` in VSCode
- Ensure `packages/extension` compiled successfully

### 2.2 Start Extension Development Host
- Press **F5** (or Run → Start Debugging)
- New VSCode window opens: **[Extension Development Host]**

### 2.3 Open Test Workspace
- In Extension Development Host: File → Open Folder...
- Select `C:\temp\bctb-test-workspace`

**Expected Behavior:**
- Output Channel "BC Telemetry Buddy" shows logs
- If settings present, MCP server auto-starts
- Check logs for "MCP server started on port 52345" (or your configured port)

---

## Part 3: Test MCP Lifecycle (5 min)

### 3.1 Manual MCP Start
- Command Palette (Ctrl+Shift+P): `BC Telemetry Buddy: Start MCP Server`

**Expected (if MCP not already running):**
- ✅ Output shows: "Starting MCP server..."
- ✅ Output shows: "MCP server started on port 52345"
- ✅ Output shows: "MCP server health check passed"
- ✅ If `device_code`: Browser opens with device code login prompt
- ✅ If `client_credentials`: Silent authentication
- ✅ Notification: "MCP server started successfully"

**Expected (if MCP already running - common with auto-start):**
- ✅ Output shows: "MCP already running"
- ✅ Notification: "MCP server started successfully"
- ✅ No new MCP process spawned
- ✅ Existing MCP continues running

**Check for Errors:**
- ❌ "Failed to start MCP server" → Check port availability (52345)
- ❌ "Authentication failed" → Verify credentials in settings.json
- ❌ "Health check timeout" → Check MCP build (`npm run build` in packages/mcp)

### 3.2 Verify MCP Running
- Check Output Channel for periodic health checks
- MCP process should be visible in Task Manager (node.exe)

---

## Part 4: Test Natural Language Queries (10 min)

**Note:** Command Palette queries are for **testing/debugging only**. The primary use case is GitHub Copilot integration (Part 10). These tests verify the underlying MCP infrastructure works before testing Copilot integration.

### 4.1 Simple Query
- Command Palette: `BC Telemetry Buddy: Run Natural Language Query`
- Enter: `show me all errors from the last 24 hours`

**Expected:**
- ✅ Webview panel opens with title "Telemetry Results"
- ✅ Table displays with columns: timestamp, message, customDimensions, etc.
- ✅ Row count displayed at top (e.g., "Showing 50 results")
- ✅ KQL query shown below title
- ✅ No "CACHED" badge (first run)

**Verify:**
- Data matches expected telemetry (errors from your BC environment)
- Timestamps within last 24 hours
- HTML escaping works (no script injection if data contains HTML)

### 4.2 Test Query Cache
- Run same query again: `show me all errors from the last 24 hours`

**Expected:**
- ✅ Results return faster (< 1 second)
- ✅ **"CACHED"** badge appears in webview (green background)
- ✅ Output Channel shows: "Using cached result"

### 4.3 Complex Query with Context
- Create a saved query first (see Part 5)
- Run: `show me performance counters similar to the saved query about page views`

**Expected:**
- ✅ MCP uses saved queries as context for KQL generation
- ✅ Recommendations section appears with 💡 (if external references configured)
- ✅ Query executes successfully

### 4.4 Error Handling
- Run: `show me invalid nonsense query that won't work`

**Expected:**
- ✅ Webview shows "Query Error" heading (red)
- ✅ Error message displayed (e.g., "Semantic error: Invalid column name")
- ✅ Suggestions shown (e.g., "Check column names in your Application Insights schema")
- ✅ No crash, extension remains responsive

---

## Part 5: Test Save Query (5 min)

### 5.1 Save New Query
- Command Palette: `BC Telemetry Buddy: Save Query`
- Enter details:
  - **Name:** `Recent Errors`
  - **KQL:** `traces | where severityLevel >= 3 | where timestamp > ago(1d) | project timestamp, message, severityLevel`
  - **Purpose:** `Track recent errors for monitoring dashboard`
  - **Use Case:** `Monitoring and alerting on application health`
  - **Tags:** `errors, monitoring, daily`
  - **Category:** `Monitoring` (when prompted for category)

**Expected:**
- ✅ Category prompt appears with suggestions of existing categories (if any)
- ✅ File created: `queries/Monitoring/Recent Errors.kql`
- ✅ Output Channel shows: "Query saved successfully"
- ✅ Notification: "Query saved to queries/Monitoring/Recent Errors.kql"

### 5.2 Verify Saved Query
- Open `queries/Monitoring/Recent Errors.kql`

**Expected Content:**
```kql
// Query: Recent Errors
// Category: Monitoring
// Purpose: Track recent errors for monitoring dashboard
// Use Case: Monitoring and alerting on application health
// Created: 2025-10-16
// Tags: errors, monitoring, daily

traces 
| where severityLevel >= 3 
| where timestamp > ago(1d) 
| project timestamp, message, severityLevel
```

**Note:** Queries are now saved to the workspace root `queries/` folder (not `.vscode/.bctb/queries/`) with category subfolders for organization. This allows queries to be version-controlled and shared with the team.

### 5.3 Test Context Pickup
- Run query: `show me errors similar to my saved queries`
- MCP should use saved query as context

**Expected:**
- ✅ Generated KQL similar to saved query structure
- ✅ Uses same column names and filters

---

## Part 6: Test Queries Folder (2 min)

### 6.1 Open Queries Folder
- Command Palette: `BC Telemetry Buddy: Open Queries Folder`

**Expected:**
- ✅ Windows Explorer opens (or Finder on macOS)
- ✅ Path: `queries/` (in workspace root, not `.vscode`)
- ✅ Contains `Monitoring/` subfolder with `Recent Errors.kql` from Part 5
- ✅ Folder structure visible: organized by categories

### 6.2 Manual Query Creation
- Create new folder: `queries/Performance/`
- Create new file: `queries/Performance/Page Views.kql`
```kql
// Query: Page Views Analysis
// Category: Performance
// Purpose: Analyze page view patterns
// Use Case: Performance optimization
// Tags: pageviews, performance
// Created: 2025-10-16

pageViews
| where timestamp > ago(7d)
| summarize count() by name, bin(timestamp, 1h)
| order by count_ desc
```

**Expected:**
- ✅ MCP picks up new query on next execution (context for NL translation)
- ✅ Category automatically extracted from folder path
- ✅ Queries organized in namespace/category structure

**Note:** The `queries/` folder should be added to version control (git) so team members can share query libraries. The `.vscode/.bctb/cache/` folder should remain gitignored.

---

## Part 7: Test Large Datasets (3 min)

### 7.1 Query Large Result Set
- Run: `show me all traces from the last 7 days`

**Expected:**
- ✅ Webview shows first 1000 rows
- ✅ Message: "Showing first 1000 of X rows" (if > 1000)
- ✅ Performance acceptable (< 5 seconds to render)
- ✅ No browser hang or crash

---

## Part 8: Test Edge Cases (5 min)

### 8.1 Empty Results
- Run: `show me errors with message containing 'NONEXISTENT_ERROR_12345'`

**Expected:**
- ✅ Webview shows: "No results returned"
- ✅ Query execution successful (no crash)

### 8.2 Special Characters
- Run: `show me events where message contains "< > & ' \""`

**Expected:**
- ✅ HTML escaping works: `<` → `&lt;`, `>` → `&gt;`, etc.
- ✅ No XSS vulnerabilities (check browser console for errors)

### 8.3 Invalid Authentication
- Edit `.vscode/settings.json`: Change `tenantId` to invalid value
- Restart MCP: Command Palette → `BC Telemetry Buddy: Start MCP Server`

**Expected:**
- ✅ Output shows: "Authentication failed"
- ✅ Error message user-friendly (not raw stack trace)
- ✅ Extension doesn't crash

**Restore:** Change `tenantId` back to correct value, restart MCP

---

## Part 9: Test Graceful Shutdown (2 min)

### 9.1 Close Extension Development Host
- Close **[Extension Development Host]** window

**Expected:**
- ✅ MCP process terminated (check Task Manager, no orphaned node.exe)
- ✅ No errors in main VSCode window Output Channel
- ✅ Clean shutdown logs

### 9.2 Verify Cleanup
- Re-open Extension Development Host (F5)
- Re-open test workspace
- MCP auto-starts successfully

---

## Part 10: GitHub Copilot Integration (15 min) — **PRIMARY USE CASE**

**⚠️ CRITICAL:** This is the **core purpose** of BC Telemetry Buddy. The extension exists to provide MCP tools to GitHub Copilot Chat. Command Palette queries (Parts 4-6) are for testing/debugging only. **If Copilot integration doesn't work, the project has failed its primary objective.**

**Prerequisites:** 
- ✅ GitHub Copilot license active
- ✅ MCP server running (verified in Part 3)
- ✅ At least one saved query exists (created in Part 5)

### 10.1 Verify MCP Tools Registered
- Open GitHub Copilot Chat panel (Ctrl+Alt+I or View → Chat)
- In chat, type `@workspace /` to see available tools
- **Expected:** MCP tools should be listed (query_telemetry, get_saved_queries, save_query, etc.)
- If tools not visible, check Output Channel for MCP registration errors

### 10.2 Test Natural Language Query (Primary Workflow)
Open GitHub Copilot Chat, enter:
```
@workspace Show me all errors from my Business Central telemetry in the last 24 hours
```

**Expected:**
- ✅ Copilot invokes `query_telemetry` tool with NL query
- ✅ MCP translates NL to KQL
- ✅ Query executes against Application Insights
- ✅ Results displayed in chat with formatted table
- ✅ Copilot provides natural language summary of results
- ✅ Follow-up questions work (e.g., "filter these to only show SQL errors")

**This is the PRIMARY use case. If this fails, stop and debug before continuing.**

### 10.3 Test Saved Queries Context
```
@workspace What saved telemetry queries do I have?
```

**Expected:**
- ✅ Copilot uses `get_saved_queries` tool
- ✅ Lists queries with names, purposes, categories
- ✅ Shows "Recent Errors" from Part 5

Follow-up:
```
@workspace Run my "Recent Errors" query
```

**Expected:**
- ✅ Copilot retrieves saved query KQL
- ✅ Executes via `query_telemetry` tool
- ✅ Shows results

### 10.4 Test Query Saving via Copilot
```
@workspace Save this query as "Slow Page Views" in Performance category: 
pageViews | where duration > 2000 | project timestamp, name, duration
Purpose: Track slow page load times
```

**Expected:**
- ✅ Copilot uses `save_query` tool
- ✅ File created: `queries/Performance/Slow Page Views.kql`
- ✅ Copilot confirms: "Query saved successfully"
- ✅ Verify file exists in workspace

### 10.5 Test Query Search
```
@workspace Search my saved queries for anything related to performance
```

**Expected:**
- ✅ Copilot uses `search_queries` tool
- ✅ Returns queries with "performance" in name/purpose/tags
- ✅ Shows "Slow Page Views" from 10.4

### 10.6 Test Query Recommendations
```
@workspace Suggest improvements for this query:
traces | where timestamp > ago(1d)
```

**Expected:**
- ✅ Copilot uses `get_recommendations` tool with query and context
- ✅ Returns suggestions (e.g., "Add specific severityLevel filter", "Use summarize for better performance")
- ✅ Recommendations include external reference examples (if configured)

### 10.7 Test Complex Multi-Step Workflow
```
@workspace I need to analyze BC telemetry:
1. Show me errors from the last 7 days
2. Group them by error type
3. Save the query as "Weekly Error Analysis" in Monitoring category
4. Then show me a summary of the top 5 error types
```

**Expected:**
- ✅ Copilot breaks down into multiple tool calls
- ✅ Uses `query_telemetry` for initial query
- ✅ Refines KQL to add grouping
- ✅ Uses `save_query` to store result
- ✅ Uses `query_telemetry` again for summary
- ✅ Provides natural language analysis of findings

### 10.8 Test Error Handling in Copilot
```
@workspace Query my telemetry for invalid_table_name_xyz
```

**Expected:**
- ✅ MCP returns error message
- ✅ Copilot explains error in natural language
- ✅ Copilot suggests corrections (e.g., "Did you mean 'traces' or 'dependencies'?")
- ✅ No crash, conversation continues

---

## Expected Test Results

### ✅ Success Criteria (All Must Pass)

**CRITICAL (Project Purpose - Must Work):**
- [ ] **GitHub Copilot integration functional (Part 10)** — MCP tools registered and accessible via `@workspace`
- [ ] **Copilot can query telemetry via natural language** — Primary workflow works end-to-end
- [ ] **Copilot can list/search/save queries** — Complete MCP tool suite functional

**Infrastructure (Supporting Components):**
- [ ] MCP server starts successfully (auto-start + manual start)
- [ ] Authentication completes (azure_cli, device_code, or client_credentials)
- [ ] Natural language queries translate to KQL and execute
- [ ] Query caching works (CACHED badge appears)
- [ ] Save query creates .kql file with proper format in queries/ folder
- [ ] Queries organized by category (subfolder structure)
- [ ] Large datasets handled (1000+ rows)
- [ ] Error handling graceful (no crashes)
- [ ] MCP process terminates on shutdown

**Testing Only (Not Primary Workflow):**
- [ ] Command Palette queries work (Parts 4-6) — for debugging/testing only
- [ ] Webview displays results correctly (table, styling, badges)
- [ ] Open Queries Folder opens file explorer
- [ ] Special characters escaped (no XSS)

**⚠️ If Copilot integration (Part 10) fails, the project has failed its core objective. Command Palette functionality is for testing purposes only.**

### 📋 Known Limitations
- First query takes 3-5 seconds (authentication + Kusto API latency)
- Cached queries < 1 second
- Large result sets (10,000+ rows) show first 1000 only
- Device code flow requires manual browser interaction (azure_cli recommended for seamless auth)

---

## Troubleshooting Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| MCP won't start | Port 52345 in use | Change `bctb.mcp.port` in settings.json |
| Authentication fails | Invalid credentials | Verify tenantId, appId, clusterUrl in settings |
| No telemetry data | Empty Application Insights | Generate test telemetry in BC environment |
| Webview blank | JavaScript error | Check browser DevTools (Ctrl+Shift+I in webview) |
| Query timeout | Complex query | Simplify query or increase timeout in MCP |
| Cached results stale | TTL expired | Set `bctb.mcp.cache.ttlSeconds` to higher value |

---

## Reporting Issues

If any test fails, capture:
1. **Output Channel logs** ("BC Telemetry Buddy")
2. **Browser DevTools console** (if webview issue)
3. **Steps to reproduce**
4. **Expected vs actual behavior**
5. **Screenshots** (if UI issue)

Add to GitHub Issues with label `testing` and `bug`.

---

**Test Complete!** 🎉

### Next Steps Based on Results:

**If Part 10 (Copilot Integration) PASSED ✅:**
Extension has achieved its primary objective! Ready for:
- Integration tests (extension.ts E2E)
- Asset creation (icon, screenshots)
- Documentation finalization (UserGuide.md, README.md)
- Packaging and marketplace publishing

**If Part 10 (Copilot Integration) FAILED ❌:**
**STOP. This is a critical failure.** Debug before proceeding:
1. Check MCP server logs for tool registration errors
2. Verify MCP JSON-RPC endpoints responding (curl http://localhost:52345/rpc)
3. Check GitHub Copilot can see MCP tools (`@workspace /` in chat)
4. Review Instructions.md for proper MCP tool definitions
5. Verify VSCode settings for MCP integration
6. Test with simple MCP tool (e.g., `get_saved_queries`) first

Command Palette functionality (Parts 4-6) is nice to have for testing, but **Copilot integration is the entire reason this project exists.**
