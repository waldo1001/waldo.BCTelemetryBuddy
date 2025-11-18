# End-to-End Test Script — GitHub Copilot Integration

**Purpose:** Validate BC Telemetry Buddy extension with **published MCP from npm** and **dev extension from source**.

**Test Scenario:** This simulates the real-world deployment where:
- MCP server is installed globally from npm (`npm install -g bc-telemetry-buddy-mcp`)
- Extension is loaded from VSCode Extension Development Host (your development build)
- User interacts via GitHub Copilot Chat with multi-profile Business Central telemetry

**⚠️ CRITICAL:** This is the **primary use case** for BC Telemetry Buddy. The entire project exists to enable GitHub Copilot to query Business Central telemetry via natural language with multi-profile support.

**Estimated Time:** 30-45 minutes

---

## Part 0: Pre-Requisites & Setup (10 min)

### Step 1: Publish MCP to NPM (First Time Only)

**⚠️ IMPORTANT:** You need a published MCP package for E2E testing. You have three options:

**Option A: Publish to NPM (Recommended for final testing)**
```powershell
# From repository root
cd packages/mcp

# Ensure version is updated in package.json
# Build the package
npm run build

# Publish to npm (requires npm account and authentication)
npm publish

# Verify publication
npm view bc-telemetry-buddy-mcp version
```

**Option B: Use Local NPM Package (For pre-release testing)**
```powershell
# Build and pack locally
cd packages/mcp
npm run build
npm pack
# This creates bc-telemetry-buddy-mcp-1.0.0.tgz

# Install globally from local package
npm install -g bc-telemetry-buddy-mcp-1.0.0.tgz

# Verify installation
bctb-mcp --version
which bctb-mcp  # On Windows: where.exe bctb-mcp
```

**Option C: Link Local Package (For rapid iteration)**
```powershell
# From packages/mcp directory
cd packages/mcp
npm run build
npm link

# Verify link
bctb-mcp --version
npm list -g bc-telemetry-buddy-mcp
```

**For this E2E test, we recommend Option B** (local pack/install) to avoid polluting npm with test versions.

### Step 2: Install MCP Globally

```powershell
# If using Option A (published)
npm install -g bc-telemetry-buddy-mcp

# If using Option B (local pack)
npm install -g ./packages/mcp/bc-telemetry-buddy-mcp-1.0.0.tgz

# If using Option C (link)
cd packages/mcp && npm link

# Verify installation
bctb-mcp --version
# Should show: 1.0.0 (or your current version)

# Verify global installation path
npm root -g
# Should show something like: C:\Users\<user>\AppData\Roaming\npm\node_modules
```

### Step 3: Prepare Test Workspace

```powershell
# Create fresh test workspace
$testWorkspace = "C:\_Source\_E2E-Test\bctb-e2e-test-workspace"
New-Item -ItemType Directory -Path $testWorkspace -Force

# Navigate to test workspace
cd $testWorkspace

# Create .bctb-config.json for multi-profile setup
@'
{
  "defaultProfile": "CustomerA",
  "profiles": {
    "CustomerA": {
      "workspacePath": "${workspaceFolder}",
      "queriesFolder": "queries/CustomerA",
      "connectionName": "Customer A - Production",
      "authFlow": "azure_cli",
      "tenantId": "YOUR_TENANT_ID_HERE",
      "applicationInsightsAppId": "YOUR_APP_INSIGHTS_APP_ID_HERE",
      "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/YOUR_SUBSCRIPTION_ID/resourcegroups/YOUR_RESOURCE_GROUP/providers/microsoft.insights/components/YOUR_APP_INSIGHTS_NAME",
      "cacheEnabled": true,
      "cacheTTLSeconds": 300,
      "references": [
        {
          "name": "BC Telemetry Samples",
          "type": "github",
          "url": "https://github.com/microsoft/BCTech/tree/master/samples/AppInsights",
          "enabled": true
        }
      ]
    },
    "CustomerB": {
      "workspacePath": "${workspaceFolder}",
      "queriesFolder": "queries/CustomerB",
      "connectionName": "Customer B - Test",
      "authFlow": "azure_cli",
      "tenantId": "YOUR_SECOND_TENANT_ID_HERE",
      "applicationInsightsAppId": "YOUR_SECOND_APP_INSIGHTS_APP_ID_HERE",
      "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/YOUR_SUBSCRIPTION_ID/resourcegroups/YOUR_RESOURCE_GROUP/providers/microsoft.insights/components/YOUR_SECOND_APP_INSIGHTS_NAME",
      "cacheEnabled": true,
      "cacheTTLSeconds": 300
    }
  }
}
'@ | Out-File -FilePath ".bctb-config.json" -Encoding UTF8

Write-Host "✓ Created .bctb-config.json"
Write-Host "⚠️  EDIT .bctb-config.json and replace YOUR_* placeholders with actual values"
```

**⚠️ STOP:** Edit `.bctb-config.json` and replace all `YOUR_*` placeholders with real values before continuing.

### Step 4: Verify Azure Authentication

```powershell
# Login to Azure CLI (required for authFlow: "azure_cli")
az login

# Verify login
az account show

# Ensure correct subscription is active
az account list --output table
az account set --subscription "YOUR_SUBSCRIPTION_NAME_OR_ID"
```

### Step 5: Build Extension (Dev Version)

```powershell
# From repository root
cd C:\_Source\Community\waldo.BCTelemetryBuddy

# Build extension ONLY (not MCP - that's already installed globally)
cd packages/extension
npm run build

# Verify build succeeded
Test-Path dist/extension.js
# Should return: True
```

### Step 6: Launch Extension Development Host

**In VSCode (at repository root):**

1. Open the repository: `File → Open Folder → C:\_Source\Community\waldo.BCTelemetryBuddy`
2. Open Run and Debug panel (`Ctrl+Shift+D`)
3. Select configuration: **"E2E: Extension (Dev) + MCP (NPM)"**
4. Press `F5` or click green play button

**Expected:**
- Extension Development Host window opens
- Extension builds successfully
- New VSCode window appears

**In Extension Development Host:**

1. `File → Open Folder → C:\_Source\_E2E-Test\bctb-e2e-test-workspace`
2. Wait for extension to activate (check status bar for "BC Telemetry Buddy" indicators)

### Step 7: Verify MCP Installation Detection

**In Extension Development Host, open Output panel:**

`View → Output → Select "BC Telemetry Buddy" from dropdown`

**Look for:**
```
[Extension] Checking for MCP installation...
[Extension] ✓ Found globally-installed MCP: C:\Users\<user>\AppData\Roaming\npm\node_modules\bc-telemetry-buddy-mcp
[Extension] MCP version: 1.0.0
[Extension] MCP server starting...
[Extension] MCP server ready on port 52345
```

**If you see:**
```
[Extension] ✗ MCP not found - install via: npm install -g bc-telemetry-buddy-mcp
```

Then go back to Step 2 and verify global installation.

---

## Part 1: Profile Management Verification (5 min)

---

## Part 1: Profile Management Verification (5 min)

### 1.1 Check Status Bar

**In Extension Development Host:**

Look at the bottom-right status bar for profile indicator.

**Expected:**
- ✅ Status bar shows: `$(database) CustomerA` (or your defaultProfile name)
- ✅ Clicking it shows dropdown with all profiles: CustomerA, CustomerB
- ✅ Can switch between profiles

### 1.2 Test Profile Switching

**Click status bar profile indicator → Select "CustomerB"**

**Expected:**
- ✅ Status bar updates to: `$(database) CustomerB`
- ✅ Output panel shows: `[Extension] Switched to profile: CustomerB`
- ✅ Output panel shows: `[Extension] Reloading configuration...`

**Switch back to CustomerA**

### 1.3 Verify Profile Manager

**Open Command Palette (`Ctrl+Shift+P`):**

Type: `BC Telemetry Buddy: Manage Profiles`

**Expected:**
- ✅ Profile Manager webview opens in main editor area
- ✅ Shows both profiles: CustomerA, CustomerB
- ✅ CustomerA marked as default (star icon or badge)
- ✅ Can view profile details (connection name, App Insights ID, etc.)

**Close Profile Manager**

---

## Part 2: GitHub Copilot Chat Integration (5 min)

### 2.1 Open GitHub Copilot Chat

**In Extension Development Host:**

- Press `Ctrl+Alt+I` (or `View → Open View... → GitHub Copilot Chat`)
- GitHub Copilot Chat panel opens

**Expected:**
- ✅ Chat panel visible on right side
- ✅ Can type messages
- ✅ No errors in Output panel

### 2.2 Verify MCP Tools Available

**In Copilot Chat, type:**
```
@workspace What BC telemetry tools do you have?
```

**Watch Output Panel (`BC Telemetry Buddy` channel) FIRST:**

**Expected output panel logs:**
```
[MCP Client] Listing available MCP tools...
[MCP Client] ✓ Found 5 tools: mcp_bc_telemetry__query, mcp_bc_telemetry__list_profiles, mcp_bc_telemetry__get_profile, mcp_bc_telemetry__save_query, mcp_bc_telemetry__list_queries
```

**Expected Copilot response:**
- ✅ Lists MCP tools (query telemetry, list profiles, save queries, etc.)
- ✅ Mentions multi-profile support
- ✅ No errors or "I don't have access to BC telemetry tools"

**🚨 CRITICAL CHECKPOINT:** If Copilot says it doesn't have BC telemetry tools or only mentions workspace files, MCP integration has failed. Debug before continuing:
1. Check Output panel for MCP connection errors
2. Verify `bctb-mcp --version` works in terminal
3. Restart Extension Development Host

---

## Part 3: Multi-Profile Query Tests (10 min)

### 3.1 List Available Profiles

**In Copilot Chat:**
```
@workspace What BC telemetry profiles do I have configured?
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__list_profiles -> ...
[MCP] Listing profiles from .bctb-config.json
[MCP] Found 2 profiles: CustomerA (default), CustomerB
```

**Expected Copilot Response:**
- ✅ Lists both profiles: CustomerA, CustomerB
- ✅ Indicates CustomerA is default
- ✅ Shows connection names or App Insights IDs

### 3.2 Query Specific Profile (Explicit)

**In Copilot Chat:**
```
@workspace Show me errors from CustomerA in the last 24 hours
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__query -> profile: CustomerA, query: <generated KQL>
[MCP] Using profile: CustomerA
[MCP] Executing KQL against App Insights: <CustomerA App ID>
[MCP] ✓ Query successful, returned X rows
```

**Expected Copilot Response:**
- ✅ Shows errors from CustomerA's Application Insights
- ✅ Displays formatted results (table or list)
- ✅ Mentions how many errors found
- ✅ Timestamps within last 24 hours

### 3.3 Query Different Profile (Explicit)

**In Copilot Chat:**
```
@workspace Now show me errors from CustomerB in the last 24 hours
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__query -> profile: CustomerB, query: <generated KQL>
[MCP] Using profile: CustomerB
[MCP] Executing KQL against App Insights: <CustomerB App ID>
```

**Expected Copilot Response:**
- ✅ Shows errors from CustomerB's Application Insights (different data than CustomerA)
- ✅ Copilot understood profile context switch
- ✅ Results clearly from different environment

### 3.4 Query Without Profile (Uses Default)

**Ensure default profile is CustomerA (check status bar)**

**In Copilot Chat:**
```
@workspace Show me page views from yesterday
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__query -> profile: CustomerA (default), query: <generated KQL>
[MCP] No profile specified, using default: CustomerA
```

**Expected Copilot Response:**
- ✅ Queries CustomerA (default profile)
- ✅ Shows page view data
- ✅ No errors

### 3.5 Switch Default Profile via Extension

**Click status bar → Select CustomerB**

**In Copilot Chat:**
```
@workspace Show me page views from yesterday
```

**Expected Output Panel:**
```
[MCP] No profile specified, using current profile: CustomerB
```

**Expected:**
- ✅ Now queries CustomerB (because extension profile switched)
- ✅ Chat respects extension's current profile when no profile specified

**Switch back to CustomerA via status bar**

---

## Part 4: Save Queries with Multi-Profile (10 min)

### 4.1 Save Query for Specific Customer

**In Copilot Chat:**
```
@workspace Save this query for CustomerA:

Name: Customer A Errors
Purpose: Monitor errors for Customer A production environment
KQL: traces | where severityLevel >= 3 | where timestamp > ago(1d) | project timestamp, message, severityLevel
Profile: CustomerA
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__save_query -> profile: CustomerA, name: Customer A Errors
[MCP] Saving query to: queries/CustomerA/Customer A Errors.kql
[MCP] ✓ Query saved successfully
```

**Expected Copilot Response:**
- ✅ Confirms query saved
- ✅ Shows file path: `queries/CustomerA/Customer A Errors.kql`

**Verify in Explorer:**
- ✅ File exists: `queries/CustomerA/Customer A Errors.kql`
- ✅ Contains proper KQL and metadata

### 4.2 Save Query for Different Customer

**In Copilot Chat:**
```
@workspace Save this query for CustomerB:

Name: Customer B Performance
Purpose: Track slow operations in test environment
KQL: dependencies | where duration > 5000 | project timestamp, target, duration
Profile: CustomerB
```

**Expected:**
- ✅ Saved to: `queries/CustomerB/Customer B Performance.kql`
- ✅ File created in separate customer folder

### 4.3 List Queries by Profile

**In Copilot Chat:**
```
@workspace List saved queries for CustomerA
```

**Expected Output Panel:**
```
[MCP Client] mcp_bc_telemetry__list_queries -> profile: CustomerA
[MCP] Found 1 query for CustomerA
```

**Expected Copilot Response:**
- ✅ Shows only "Customer A Errors" query
- ✅ Does NOT show CustomerB queries

**Repeat for CustomerB:**
```
@workspace List saved queries for CustomerB
```

**Expected:**
- ✅ Shows only "Customer B Performance" query

### 4.4 List All Queries

**In Copilot Chat:**
```
@workspace List all my saved BC telemetry queries
```

**Expected:**
- ✅ Shows both profiles' queries
- ✅ Grouped by profile or clearly labeled
- ✅ Total: 2 queries

---

## Part 5: Complex Multi-Profile Workflows (10 min)

### 5.1 Cross-Profile Comparison

**In Copilot Chat:**
```
@workspace Compare error counts between CustomerA and CustomerB for the last 7 days
```

**Expected Copilot Behavior:**
- ✅ Queries CustomerA first (Output: `mcp_bc_telemetry__query -> profile: CustomerA`)
- ✅ Queries CustomerB second (Output: `mcp_bc_telemetry__query -> profile: CustomerB`)
- ✅ Compares results
- ✅ Provides summary (e.g., "CustomerA has 42 errors, CustomerB has 18 errors")

### 5.2 Profile-Specific Analysis

**In Copilot Chat:**
```
@workspace Analyze CustomerA's performance:
1. Show page views with duration > 5 seconds
2. Find which pages are slowest
3. Save the query as "CustomerA Slow Pages"
```

**Expected:**
- ✅ Queries CustomerA only
- ✅ Shows slow page views
- ✅ Identifies slowest pages
- ✅ Saves query to `queries/CustomerA/CustomerA Slow Pages.kql`
- ✅ All operations scoped to CustomerA profile

### 5.3 Conversational Profile Switching

**In Copilot Chat:**
```
@workspace Show me errors from CustomerA yesterday
```

**Then:**
```
Now show me the same for CustomerB
```

**Expected:**
- ✅ First query targets CustomerA
- ✅ Second query targets CustomerB (Copilot infers from "same for CustomerB")
- ✅ Same query pattern, different profiles
- ✅ Copilot maintains conversation context

---

## Part 6: Error Handling & Edge Cases (10 min)

### 6.1 Invalid Profile Name

**In Copilot Chat:**
```
@workspace Show me errors from NonExistentCustomer
```

**Expected:**
- ✅ Copilot recognizes profile doesn't exist
- ✅ Suggests available profiles: CustomerA, CustomerB
- ✅ Asks for clarification or uses default profile

### 6.2 Profile with No Data

**If CustomerB has no telemetry data:**

```
@workspace Show me errors from CustomerB in the last 30 days
```

**Expected:**
- ✅ Query executes successfully
- ✅ Returns 0 results
- ✅ Copilot reports: "No errors found for CustomerB in the last 30 days"
- ✅ No crash or authentication errors

### 6.3 Authentication Failure Test

**Manual steps:**

1. Logout from Azure CLI:
   ```powershell
   az logout
   ```

2. In Copilot Chat:
   ```
   @workspace Show me errors from CustomerA
   ```

**Expected:**
- ✅ MCP attempts authentication
- ✅ Fails (no Azure CLI session)
- ✅ Output panel shows: `[MCP] ✗ Authentication failed: azure_cli requires active 'az login' session`
- ✅ Copilot explains error: "Authentication failed. Please run 'az login' and try again."
- ✅ No crash

**Restore:**
```powershell
az login
```

Retry query, should work now.

### 6.4 Invalid KQL Syntax

**In Copilot Chat:**
```
@workspace Run this KQL for CustomerA: invalid_table | where fake_column == "test"
```

**Expected:**
- ✅ Query sent to Application Insights
- ✅ Returns error: "Semantic error: 'invalid_table' is not a declared table"
- ✅ Copilot explains error
- ✅ May suggest correct table names (traces, pageViews, dependencies)

### 6.5 MCP Server Disconnection Recovery

**Manual steps:**

1. In terminal, kill MCP server process:
   ```powershell
   # Find MCP process
   Get-Process -Name node | Where-Object {$_.CommandLine -like "*bctb-mcp*"}
   
   # Kill it
   Stop-Process -Name node -Force
   ```

2. In Copilot Chat:
   ```
   @workspace Show me errors from CustomerA
   ```

**Expected:**
- ✅ Extension detects MCP server down
- ✅ Attempts to restart MCP server
- ✅ Output panel shows: `[Extension] MCP server disconnected, restarting...`
- ✅ Query eventually succeeds after restart
- ✅ Or: Copilot reports temporary connection issue and suggests retrying

---

## Part 7: Extension Commands with Profiles (5 min)

### 7.1 Run KQL Query Command

**In Extension Development Host:**

1. Open Command Palette (`Ctrl+Shift+P`)
2. Type: `BC Telemetry Buddy: Run KQL Query`
3. Enter KQL: `traces | where severityLevel >= 3 | where timestamp > ago(1h) | take 10`

**Expected:**
- ✅ Query executes against **current profile** (check status bar - should be CustomerA)
- ✅ Results webview opens
- ✅ Shows data from CustomerA's Application Insights

### 7.2 Switch Profile and Run Same Command

1. Click status bar → Switch to **CustomerB**
2. Run Command Palette: `BC Telemetry Buddy: Run KQL Query`
3. Enter same KQL: `traces | where severityLevel >= 3 | where timestamp > ago(1h) | take 10`

**Expected:**
- ✅ Query executes against **CustomerB** (different profile)
- ✅ Results may differ (different Application Insights data)
- ✅ Confirms extension commands respect current profile

### 7.3 Create New Profile via Profile Manager

1. Open Command Palette: `BC Telemetry Buddy: Create Profile`
2. Or: `BC Telemetry Buddy: Manage Profiles` → Click "Add New Profile"

**Follow prompts:**
- Profile Name: `CustomerC`
- Connection Name: `Customer C - Staging`
- Auth Flow: `azure_cli`
- Tenant ID: (can reuse CustomerA's for test)
- App Insights ID: (can reuse CustomerA's for test)
- Kusto URL: (can reuse CustomerA's for test)

**Expected:**
- ✅ Profile created
- ✅ `.bctb-config.json` updated with CustomerC
- ✅ Profile appears in status bar dropdown
- ✅ Profile appears in Profile Manager

---

## Part 8: Final Integration Tests (5 min)

### 8.1 Full Workflow Test

**In Copilot Chat:**
```
@workspace I need a weekly error report for CustomerA:
1. Show me errors from the last 7 days
2. Group by error type
3. Show top 5 most common errors
4. Save the query as "CustomerA Weekly Error Report" for future use
```

**Expected:**
- ✅ Copilot breaks down task
- ✅ Queries CustomerA profile
- ✅ Groups errors appropriately
- ✅ Shows top 5 with counts
- ✅ Saves query to `queries/CustomerA/CustomerA Weekly Error Report.kql`
- ✅ Confirms completion

### 8.2 Run Saved Query

**In Copilot Chat:**
```
@workspace Run my "CustomerA Weekly Error Report" query
```

**Expected:**
- ✅ Retrieves saved query from `queries/CustomerA/`
- ✅ Executes KQL
- ✅ Shows current results
- ✅ Mentions query source

### 8.3 Modify and Re-save

**In Copilot Chat:**
```
@workspace Update my "CustomerA Weekly Error Report" query to show last 14 days instead of 7
```

**Expected:**
- ✅ Retrieves saved query
- ✅ Modifies time filter: `ago(7d)` → `ago(14d)`
- ✅ Executes modified query
- ✅ Asks if you want to save the updated version
- ✅ If yes: Overwrites existing `.kql` file

---

## Success Criteria Summary

### 🎯 CRITICAL (Must Pass for E2E Success)

- [ ] **MCP from npm detected and loaded** by extension
- [ ] **Extension builds and runs** from source code (not bundled with MCP)
- [ ] **Multi-profile config** (.bctb-config.json) loaded correctly
- [ ] **Profile switcher** in status bar works
- [ ] **Copilot sees MCP tools** (output panel shows tool invocations)
- [ ] **Query CustomerA** explicitly works
- [ ] **Query CustomerB** explicitly works
- [ ] **Query without profile** uses default/current profile
- [ ] **Save query for specific profile** creates file in correct folder
- [ ] **List queries by profile** shows only that profile's queries
- [ ] **Cross-profile comparison** queries both profiles
- [ ] **Extension commands** (Run KQL Query) respect current profile
- [ ] **Error handling** graceful (auth failures, invalid queries, etc.)

### ✅ Important (Should Pass)

- [ ] Profile Manager UI opens and shows all profiles
- [ ] Create new profile works
- [ ] Switch profile updates MCP queries correctly
- [ ] Saved queries can be executed via chat
- [ ] Complex multi-step workflows complete
- [ ] Conversational profile switching works

### 💡 Nice to Have

- [ ] MCP server auto-restart on disconnect
- [ ] Query optimization suggestions
- [ ] External references (BCTech samples) used in recommendations

---

## Troubleshooting

### Issue: "MCP not found" in Output Panel

**Check:**
```powershell
# Verify global installation
npm list -g bc-telemetry-buddy-mcp

# Check executable
where.exe bctb-mcp
bctb-mcp --version

# Reinstall if needed
npm uninstall -g bc-telemetry-buddy-mcp
npm install -g bc-telemetry-buddy-mcp
```

### Issue: Copilot doesn't see MCP tools

**Check:**
1. Output panel for MCP registration errors
2. Restart Extension Development Host (`Ctrl+Shift+F5`)
3. Verify `bctb-mcp` starts manually: `bctb-mcp --help`

### Issue: Profile not found errors

**Check:**
1. `.bctb-config.json` in workspace root
2. Profile names match exactly (case-sensitive)
3. JSON is valid (no syntax errors)

### Issue: Queries fail with auth errors

**Check:**
```powershell
# Verify Azure CLI login
az account show

# Check correct subscription
az account list
az account set --subscription "<your-subscription>"

# Verify Application Insights access
az monitor app-insights component show --app <app-name> --resource-group <rg-name>
```

---

## Cleanup After Testing

```powershell
# Remove test workspace
Remove-Item -Recurse -Force "C:\_Source\_E2E-Test\bctb-e2e-test-workspace"

# Optionally uninstall global MCP (if using local pack)
npm uninstall -g bc-telemetry-buddy-mcp

# Or unlink (if using npm link)
cd packages/mcp
npm unlink -g
```

---

## Test Results Template

**Date:** `_______________`  
**Tester:** `_______________`  
**Extension Version:** `_______________`  
**MCP Version:** `_______________` (from `bctb-mcp --version`)  
**Install Method:** ⬜ npm publish ⬜ local pack ⬜ npm link

### Results

| Test Section | Pass | Fail | Notes |
|-------------|------|------|-------|
| Part 0: Setup | ⬜ | ⬜ | |
| Part 1: Profile Management | ⬜ | ⬜ | |
| Part 2: Copilot Integration | ⬜ | ⬜ | |
| Part 3: Multi-Profile Queries | ⬜ | ⬜ | |
| Part 4: Save Queries | ⬜ | ⬜ | |
| Part 5: Complex Workflows | ⬜ | ⬜ | |
| Part 6: Error Handling | ⬜ | ⬜ | |
| Part 7: Extension Commands | ⬜ | ⬜ | |
| Part 8: Final Integration | ⬜ | ⬜ | |

**Overall:** ⬜ PASS ⬜ FAIL

**Critical Issues:**
```
(List any blocking issues here)
```

**Recommendations:**
```
(Next steps or improvements)
```

---

## Next Steps After Successful E2E

✅ **If all tests pass:**

1. **Publish MCP to npm** (if not already done):
   ```powershell
   cd packages/mcp
   npm version patch  # or minor/major
   npm run build
   npm publish
   ```

2. **Package extension for marketplace**:
   ```powershell
   cd packages/extension
   npm run build
   vsce package
   # Creates bc-telemetry-buddy-X.Y.Z.vsix
   ```

3. **Update documentation** with tested examples

4. **Create demo video** showing multi-profile workflow

5. **Publish to VS Code Marketplace**

---

**🎯 Remember:** This E2E test validates the **real-world deployment scenario**:
- Users install MCP globally: `npm install -g bc-telemetry-buddy-mcp`
- Users install extension from marketplace
- Extension detects and uses globally-installed MCP
- GitHub Copilot queries multi-profile Business Central telemetry seamlessly

If this workflow works perfectly, you're ready to ship! 🚀
