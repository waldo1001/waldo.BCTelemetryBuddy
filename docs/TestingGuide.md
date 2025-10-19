# Testing Guide for BC Telemetry Buddy v1.0.0

This guide provides comprehensive testing instructions for all Phase 1-3 changes implemented for the v1.0.0 release.

## Summary of Changes

1. **Phase 1**: Removed `nl` parameter from `query_telemetry` (breaking change)
2. **Phase 2.1**: Added `get_event_field_samples` tool for field discovery
3. **Phase 2.2**: Dynamic event category lookup (message-based, not hardcoded)
4. **Phase 2.3**: Added `includeCommonFields` parameter to `get_event_catalog`
5. **Phase 3**: Updated all documentation (Instructions.md, UserGuide.md, READMEs, CHANGELOGs)
6. **Bug Fix**: Fixed JSON parsing for customDimensions in field samples
7. **Bug Fix**: Fixed launcher.js copy issue in build process

---

## 🎯 Quick End-to-End Test (5 Minutes)

**Prerequisites**: Press F5 to start debug session

### Test 1: Discovery-First Workflow ⭐

In Copilot Chat, type:
```
@workspace Show me all error events from the last 7 days
```

**Expected Copilot behavior**:
1. ✅ Call `get_event_catalog` with `status: "error"` → Shows RT0010, RT0020, etc.
2. ✅ Call `get_event_field_samples` for RT0010 → Shows field structure with types
3. ✅ Generate KQL query using discovered fields
4. ✅ Execute with `query_telemetry` (using `kql` parameter only, NOT `nl`)
5. ✅ Show results

**Verification checklist**:
- [ ] No `nl` parameter used anywhere
- [ ] Field samples show real data types (number, string, datetime)
- [ ] Categories are correct (Error, not Custom)
- [ ] Query executes successfully

---

### Test 2: Field Discovery for Standard Event

```
@workspace Show me the field structure for event RT0005
```

**Expected output**:
```json
{
  "eventId": "RT0005",
  "category": "Performance",
  "isStandardEvent": true,
  "fields": [
    {
      "fieldName": "executionTimeInMs",
      "dataType": "number",
      "occurrenceRate": 100,
      "sampleValues": [1234, 5678, 9012]
    },
    {
      "fieldName": "alObjectType",
      "dataType": "string",
      "occurrenceRate": 100,
      "sampleValues": ["Page", "Codeunit", "Report"]
    },
    ...
  ],
  "totalFields": 15+
}
```

**Verification checklist**:
- [ ] `fields` array is populated (not empty) - **this was the JSON parsing bug**
- [ ] `isStandardEvent: true` (not false)
- [ ] `category: "Performance"` (not "Custom event")
- [ ] Sample values are real data from your telemetry
- [ ] Data types are correctly detected

---

### Test 3: Common Fields Analysis

```
@workspace What fields are common across all performance events?
```

**Expected**:
- ✅ Copilot calls `get_event_catalog` with `includeCommonFields: true`
- ✅ Returns field categorization with 4 tiers:
  - **Universal** (80%+): `timestamp`, `eventId`, `component`, `aadTenantId`
  - **Common** (50-79%): `executionTimeInMs`, `alObjectType`, `alObjectName`
  - **Occasional** (20-49%): Event-specific fields
  - **Rare** (<20%): Highly specific fields

**Verification checklist**:
- [ ] Four-tier categorization is shown
- [ ] Universal fields appear in 80%+ of events
- [ ] Field counts make sense

---

### Test 4: Category Detection (Dynamic)

```
@workspace What categories of events do I have?
```

**Expected**:
- ✅ Shows standard categories: Error, Performance, Lifecycle, Integration, etc.
- ✅ If you have custom events, they're categorized based on message content
- ✅ No hardcoded mapping errors

**Verification checklist**:
- [ ] Standard BC events show correct categories
- [ ] Custom events are categorized (not all "Unknown")
- [ ] Category sources are identified (microsoft-learn, custom-analysis, cache)

---

### Test 5: Query Execution (No NL Parameter)

```
@workspace Query RT0005 events where executionTimeInMs > 1000 in the last 24 hours
```

**Verification**:
1. Open **Output** panel (View → Output)
2. Select **"BC Telemetry Buddy"** from dropdown
3. Look for tool calls - should show `query_telemetry` with ONLY `kql` parameter
4. Should NOT see `nl` parameter anywhere

**Verification checklist**:
- [ ] Tool call shows `{"kql": "traces | where ..."}`
- [ ] No `nl` parameter in tool call
- [ ] Query executes successfully
- [ ] Results are displayed

---

## 🔬 Detailed Feature Testing

### Feature 1: get_event_field_samples

Test different event IDs to verify field discovery works for all event types:

```
@workspace Show field structure for RT0001
```
Expected: Session started event fields (environmentName, clientType, etc.)

```
@workspace Show field structure for RT0006
```
Expected: Database lock event fields (alObjectType, alObjectName, lockType, etc.)

```
@workspace Show field structure for RT0010
```
Expected: AL runtime error fields (errorMessage, alStackTrace, failureReason, etc.)

```
@workspace Show field structure for RT0012
```
Expected: Web service call fields (endpoint, httpStatusCode, category, etc.)

**Verification checklist** (for each event):
- [ ] Fields array is populated
- [ ] Data types are correct (number/string/datetime/boolean)
- [ ] Occurrence rates are between 0-100%
- [ ] Sample values are realistic
- [ ] KQL template is valid and ready to use
- [ ] Event is correctly identified as standard (isStandardEvent: true)
- [ ] Category is accurate

---

### Feature 2: Dynamic Category Lookup

**Test standard events**:

```
@workspace What category is RT0005?
```
Expected: "Performance" (AL execution time)

```
@workspace What category is RT0010?
```
Expected: "Error" (AL runtime errors)

```
@workspace What category is RT0001?
```
Expected: "Lifecycle" (Session started)

```
@workspace What category is RT0012?
```
Expected: "Integration" (Web service calls)

**Test custom events** (if you have any):

```
@workspace Show me all custom events
```

**Verification checklist**:
- [ ] Standard events show correct categories
- [ ] Custom events are categorized based on message content
- [ ] Events with "error" in message → Error category
- [ ] Events with "performance"/"slow"/"duration" → Performance category
- [ ] Events with "login"/"logout"/"session" → Lifecycle category

---

### Feature 3: includeCommonFields Parameter

**Without includeCommonFields** (default):

```
@workspace List all events from the last 3 days
```

Expected:
- Returns event catalog quickly
- Shows event IDs, descriptions, counts
- No field prevalence analysis

**With includeCommonFields**:

```
@workspace Show common fields across all error events
```

Expected:
- Returns 4-tier categorization
- Universal fields (80%+) identified
- Common fields (50-79%) identified
- Occasional and rare fields shown

**Verification checklist**:
- [ ] Default catalog query is fast (no field analysis overhead)
- [ ] `includeCommonFields: true` returns field categorization
- [ ] Universal fields appear in most events
- [ ] Rare fields are truly event-specific

---

### Feature 4: NL Parameter Removal (Breaking Change)

**Check MCP Output panel** after any Copilot query:

1. Open **Output** panel (View → Output)
2. Select **"BC Telemetry Buddy"** from dropdown
3. Look for tool calls

**Verification checklist**:
- [ ] No `"nl"` parameter in any tool calls
- [ ] All queries use `"kql"` parameter
- [ ] Copilot still generates accurate KQL from natural language questions
- [ ] Discovery tools are used before query execution

---

## 🐛 Bug Fixes Verification

### Bug Fix 1: JSON Parsing for customDimensions

**Problem**: RT0005 (and other events) returned empty fields array because customDimensions was a JSON string, not an object.

**Test**:
```
@workspace Show field structure for RT0005
```

**Before the fix**:
```json
{
  "fields": [],
  "totalFields": 0,
  "isStandardEvent": false,
  "category": "Custom event (Database-related)"
}
```

**After the fix**:
```json
{
  "fields": [15+ fields with real data],
  "totalFields": 15+,
  "isStandardEvent": true,
  "category": "Performance"
}
```

**Verification checklist**:
- [ ] Fields array is populated (not empty)
- [ ] Sample values show real telemetry data
- [ ] Data types are correctly detected from JSON values

---

### Bug Fix 2: Launcher.js Copy in Build Process

**Problem**: F5 failed with "Cannot find module launcher.js" because build script didn't copy MCP files.

**Test**:
1. Press F5 to start debug session
2. Check Output panel for MCP server startup

**Before the fix**:
```
Error: Cannot find module 'c:\_Source\...\extension\mcp\dist\launcher.js'
```

**After the fix**:
```
✓ Starting server BC Telemetry Buddy
Connection state: Running
```

**Verification checklist**:
- [ ] F5 starts without errors
- [ ] MCP server shows "Running" state
- [ ] No "Cannot find module" errors
- [ ] Build script includes `npm run copy-mcp`

---

## ✅ Automated Test Verification

Run all automated tests to confirm nothing broke:

### Test MCP Backend

```powershell
cd c:\_Source\Community\waldo.BCTelemetryBuddy\packages\mcp
npm test
```

**Expected**: All tests passing (280+ total across both packages)

Key test suites to check:
- `event-field-samples.test.ts` - 28 tests for field discovery
- `event-catalog.test.ts` - Tests for catalog with includeCommonFields
- `event-lookup.test.ts` - Tests for dynamic category detection
- `queries.test.ts` - Tests for query execution

### Test Extension

```powershell
cd c:\_Source\Community\waldo.BCTelemetryBuddy\packages\extension
npm test
```

**Expected**: All tests passing

**Verification checklist**:
- [ ] All MCP tests pass (280+ tests)
- [ ] All extension tests pass
- [ ] No new warnings or errors
- [ ] Coverage remains above 70%

---

## 📊 Performance Testing

Test with larger datasets to ensure performance is acceptable:

### Large Sample Size

```
@workspace Show field structure for RT0005 with 100 samples from last 90 days
```

**Expected**:
- Completes in <10 seconds
- Shows 100 samples analyzed
- Field occurrence rates based on 100 samples

### Long Time Range

```
@workspace Show events from the last 90 days
```

**Expected**:
- Returns catalog within reasonable time
- Shows accurate counts for entire period

**Verification checklist**:
- [ ] Queries with 100 samples complete in <10 seconds
- [ ] 90-day catalog queries complete in <15 seconds
- [ ] No timeout errors
- [ ] Results are accurate

---

## 🎬 Complete User Journey Test

**Scenario**: "I want to find slow page views for a specific customer"

### Step 1: Discover Events

```
@workspace What performance events are available?
```

**Expected**:
- Shows RT0006 (page views) in catalog
- Shows RT0005 (AL execution time)
- Shows frequency counts

**Verification**: ✅ RT0006 is listed with correct category

### Step 2: Analyze Fields

```
@workspace Show field structure for RT0006
```

**Expected**:
- Shows `executionTimeInMs`, `alObjectName`, `alObjectType` fields
- Data types are correct
- Sample values from your environment

**Verification**: ✅ All page view fields are shown

### Step 3: Check Common Fields

```
@workspace What fields work across all performance events?
```

**Expected**:
- `executionTimeInMs` is universal (appears in RT0005, RT0006, etc.)
- `alObjectType` and `alObjectName` are common
- Safe to use these in cross-event queries

**Verification**: ✅ Universal fields identified correctly

### Step 4: Execute Query

```
@workspace Show RT0006 events where executionTimeInMs > 1000 in last 7 days
```

**Expected**:
- Generates accurate KQL using discovered field names
- Query executes successfully
- Results show slow page views

**Verification**: ✅ Query uses correct field name (`executionTimeInMs`)

### Step 5: Save Query

```
@workspace Save this as "Slow Page Views" with tags: performance, pages
```

**Expected**:
- Saves to `queries/Performance/Slow Page Views.kql`
- File contains KQL with comments
- Tags are included in metadata

**Verification**: ✅ File created in correct location with metadata

---

## 🚨 Known Issues & Workarounds

### Issue 1: "No events found"

**Symptom**: `get_event_field_samples` returns "No events found for eventId"

**Causes**:
- No telemetry data exists in the time range
- EventId doesn't exist in your environment
- Time range too narrow

**Workarounds**:
- Increase `daysBack`: Try 60 or 90 days
- Verify eventId exists: Check event catalog first
- Try a different event that you know exists (RT0001, RT0005)

### Issue 2: Empty fields array (if fix didn't work)

**Symptom**: Fields array is empty even after JSON parsing fix

**Debug steps**:
1. Check MCP Output panel for parsing warnings
2. Verify customDimensions is being returned by Kusto
3. Add debug logging to see raw customDimensions value

**Workaround**: File a GitHub issue with MCP Output panel logs

### Issue 3: Category shows "Unknown"

**Symptom**: Custom events show category "Unknown"

**Cause**: Message field doesn't contain categorization keywords

**Expected behavior**: This is normal for truly custom events

**Workaround**: Add keywords to custom event messages (error, performance, etc.)

### Issue 4: Slow first query

**Symptom**: First query takes 10-30 seconds

**Cause**: Authentication token acquisition on first call

**Expected behavior**: Subsequent queries use cache and are fast

**Not an issue**: This is normal behavior

---

## 📝 Pre-Release Checklist

Before releasing v1.0.0, verify all items:

### Build & Deployment
- [ ] `npm run build` succeeds in both packages
- [ ] MCP files are copied to extension/mcp/dist/
- [ ] F5 starts extension without errors
- [ ] MCP server shows "Running" state

### Core Functionality
- [ ] `get_event_field_samples` returns populated fields for RT0005
- [ ] No `nl` parameter appears in any tool calls
- [ ] `includeCommonFields` returns 4-tier categorization
- [ ] Standard events show `isStandardEvent: true`
- [ ] Categories are correct (not all "Custom")

### Testing
- [ ] All 280+ automated tests pass
- [ ] Manual tests complete successfully
- [ ] Performance is acceptable (<10s for large queries)

### Documentation
- [ ] Instructions.md reflects all 11 tools
- [ ] UserGuide.md updated with discovery-first workflow
- [ ] Component READMEs are accurate
- [ ] Component CHANGELOGs have [Unreleased] sections ready
- [ ] No references to removed "natural language" feature

### Quality
- [ ] No build warnings or errors
- [ ] No eslint/prettier issues
- [ ] Code coverage above 70%
- [ ] PromptLog.md and DesignWalkthrough.md are up-to-date

---

## 🎯 Fastest Validation Test (30 seconds)

If you only have time for ONE test, run this:

```
@workspace Show me the field structure for event RT0005
```

**Success criteria**:
- ✅ Fields array populated (15+ fields)
- ✅ Real sample values shown
- ✅ `isStandardEvent: true`
- ✅ `category: "Performance"`
- ✅ Data types correctly detected
- ✅ No errors in Output panel

If all criteria pass: **Everything works!** 🚀

---

## 📞 Support

If you encounter issues not covered in this guide:

1. Check the **Output** panel (View → Output → "BC Telemetry Buddy") for detailed logs
2. Review the [UserGuide.md](UserGuide.md) for troubleshooting steps
3. File an issue at [GitHub Issues](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)

---

## 📚 Related Documentation

- [UserGuide.md](UserGuide.md) - End-user documentation
- [Instructions.md](../Instructions/Instructions.md) - Technical implementation details
- [CHANGELOG.md](CHANGELOG.md) - Project-level changes
- [packages/mcp/CHANGELOG.md](../packages/mcp/CHANGELOG.md) - MCP backend changes
- [packages/extension/CHANGELOG.md](../packages/extension/CHANGELOG.md) - Extension changes
- [DesignWalkthrough.md](DesignWalkthrough.md) - Design decisions and evolution
