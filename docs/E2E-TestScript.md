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

**Expected:**
- ✅ Output shows: "Starting MCP server..."
- ✅ Output shows: "MCP server started on port 52345"
- ✅ Output shows: "MCP server health check passed"
- ✅ If `device_code`: Browser opens with device code login prompt
- ✅ If `client_credentials`: Silent authentication

**Check for Errors:**
- ❌ "Failed to start MCP server" → Check port availability (52345)
- ❌ "Authentication failed" → Verify credentials in settings.json
- ❌ "Health check timeout" → Check MCP build (`npm run build` in packages/mcp)

### 3.2 Verify MCP Running
- Check Output Channel for periodic health checks
- MCP process should be visible in Task Manager (node.exe)

---

## Part 4: Test Natural Language Queries (10 min)

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

**Expected:**
- ✅ File created: `.vscode/.bctb/queries/Recent Errors.kql`
- ✅ Output Channel shows: "Query saved successfully"
- ✅ Notification: "Query 'Recent Errors' saved"

### 5.2 Verify Saved Query
- Open `.vscode/.bctb/queries/Recent Errors.kql`

**Expected Content:**
```kql
// Query: Recent Errors
// Purpose: Track recent errors for monitoring dashboard
// Use Case: Monitoring and alerting on application health
// Tags: errors, monitoring, daily
// Saved: 2025-10-15T18:30:00Z

traces 
| where severityLevel >= 3 
| where timestamp > ago(1d) 
| project timestamp, message, severityLevel
```

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
- ✅ Path: `.vscode/.bctb/queries/`
- ✅ Contains `Recent Errors.kql` from Part 5

### 6.2 Manual Query Creation
- Create new file: `.vscode/.bctb/queries/Page Views.kql`
```kql
// Query: Page Views Analysis
// Purpose: Analyze page view patterns
// Use Case: Performance optimization
// Tags: pageviews, performance

pageViews
| where timestamp > ago(7d)
| summarize count() by name, bin(timestamp, 1h)
| order by count_ desc
```

**Expected:**
- ✅ MCP picks up new query on next execution (context for NL translation)

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

## Part 10: Optional - Copilot Integration (10 min)

**Prerequisites:** GitHub Copilot license active

### 10.1 Verify MCP Registered
- Command Palette: `Developer: Show Running Extensions`
- Look for MCP server process (port 52345)

### 10.2 Test MCP Tools in Copilot Chat
Open GitHub Copilot Chat panel, try:

1. **Query Telemetry:**
   ```
   @workspace query my telemetry for errors in the last hour
   ```
   Expected: Copilot uses `query_telemetry` tool, shows results

2. **List Saved Queries:**
   ```
   @workspace list my saved telemetry queries
   ```
   Expected: Copilot uses `get_saved_queries` tool, shows query names

3. **Save Query:**
   ```
   @workspace save this telemetry query: pageViews | summarize count() by name
   ```
   Expected: Copilot uses `save_query` tool, creates .kql file

4. **Get Recommendations:**
   ```
   @workspace recommend improvements for this query: traces | where timestamp > ago(1d)
   ```
   Expected: Copilot uses `get_recommendations` tool, suggests optimizations

5. **Search Queries:**
   ```
   @workspace search my queries about performance
   ```
   Expected: Copilot uses `search_queries` tool, finds matching queries

---

## Expected Test Results

### ✅ Success Criteria (All Must Pass)
- [ ] MCP server starts successfully (auto-start + manual start)
- [ ] Authentication completes (device code or client credentials)
- [ ] Natural language queries translate to KQL and execute
- [ ] Webview displays results correctly (table, styling, badges)
- [ ] Query caching works (CACHED badge appears)
- [ ] Save query creates .kql file with proper format
- [ ] Open Queries Folder opens file explorer
- [ ] Large datasets handled (1000+ rows)
- [ ] Error handling graceful (no crashes)
- [ ] Special characters escaped (no XSS)
- [ ] MCP process terminates on shutdown
- [ ] Optional: Copilot integration works (MCP tools accessible)

### 📋 Known Limitations
- First query takes 3-5 seconds (authentication + Kusto API latency)
- Cached queries < 1 second
- Large result sets (10,000+ rows) show first 1000 only
- Device code flow requires manual browser interaction

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

If all success criteria passed, extension is ready for:
- Integration tests (extension.ts E2E)
- Asset creation (icon, screenshots)
- Documentation finalization
- Packaging and marketplace publishing
