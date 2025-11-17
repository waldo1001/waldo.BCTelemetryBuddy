# Testing Guide for BC Telemetry Buddy

This guide provides comprehensive testing instructions for ensuring code quality and preventing regressions across all components of BC Telemetry Buddy.

## 📋 Testing Philosophy

**Lessons Learned from Refactoring**: During Phases 1-3 refactoring, several critical issues were discovered only during manual testing:
- TypeScript module resolution issues (Phase 1)
- Command handlers still using MCP client instead of TelemetryService (Phase 3)
- Missing test coverage for integration points

**New Standards**: To prevent similar issues in future releases, we now enforce:
1. **Minimum Test Coverage**: 80% statement coverage for all new code
2. **Integration Tests Required**: Test cross-package imports and runtime behavior
3. **Phase Validation Tests**: Each refactoring phase must have dedicated tests
4. **Pre-Release Validation**: Comprehensive manual test checklist before releases

---

## 🎯 Test Coverage Requirements

### Package-Level Requirements

| Package | Minimum Coverage | Test Types Required |
|---------|-----------------|-------------------|
| `@bctb/shared` | 85% | Unit tests for all services |
| `bc-telemetry-buddy-mcp` | 80% | Unit + Integration + Standalone tests |
| `bc-telemetry-buddy` (extension) | 80% | Unit + Integration + Command handler tests |

### Critical Test Areas

**Phase 1: Shared Package (`@bctb/shared`)**
- ✅ Service exports accessible from both MCP and extension
- ✅ TypeScript types compile correctly
- ✅ Module resolution works with npm workspaces symlinks
- ✅ Services instantiate correctly with mock configs

**Phase 2: Standalone MCP Server**
- ✅ MCP runs independently without extension
- ✅ CLI commands work (query-telemetry, save-query, list-queries)
- ✅ Uses @bctb/shared services (not local copies)
- ✅ Environment variable configuration works
- ✅ stdio and HTTP modes both functional

**Phase 3: Extension Independence**
- ✅ Extension commands use TelemetryService NOT MCP client
- ✅ No bundled MCP files in extension/mcp/
- ✅ @bctb/shared imports work at runtime
- ✅ Commands execute queries without starting MCP server
- ✅ Setup wizard configures TelemetryService correctly

---

## 🧪 Automated Test Suites

### Running All Tests

```powershell
# From repository root
npm test

# Or run packages individually
cd packages/shared && npm test
cd packages/mcp && npm test
cd packages/extension && npm test
```

### New Test Files (Added for Phase Validation)

**Extension Package**:
- `telemetryService.test.ts` - Tests TelemetryService initialization and methods
- `command-handlers.test.ts` - Validates commands use TelemetryService not MCP
- `shared-package-integration.test.ts` - Tests @bctb/shared imports work

**MCP Package**:
- `mcp-standalone.test.ts` - Validates MCP runs independently

### Test Execution Targets

```json
{
  "scripts": {
    "test": "jest --coverage",
    "test:watch": "jest --watch",
    "test:integration": "jest --testPathPattern=integration",
    "test:phase-validation": "jest --testNamePattern='Phase [1-3]'"
  }
}
```

---

## Summary of v1.0.0 Changes

1. **Phase 1**: Removed `nl` parameter from `query_telemetry` (breaking change)
2. **Phase 2.1**: Added `get_event_field_samples` tool for field discovery
3. **Phase 2.2**: Dynamic event category lookup (message-based, not hardcoded)
4. **Phase 2.3**: Added `includeCommonFields` parameter to `get_event_catalog`
5. **Phase 3**: Updated all documentation (Instructions.md, UserGuide.md, READMEs, CHANGELOGs)
6. **Bug Fix**: Fixed JSON parsing for customDimensions in field samples
7. **Bug Fix**: Fixed launcher.js copy issue in build process

---

## 🔍 Refactoring Phase Validation Tests

### Phase 1 Validation: Shared Package

**Test Goal**: Ensure @bctb/shared package works for both MCP and extension

**Automated Tests** (`shared-package-integration.test.ts`):
```typescript
describe('Phase 1: Package Structure', () => {
  it('should have correct package.json exports')
  it('should export all required services')
  it('should have compiled TypeScript output')
});

describe('Phase 1: Service Instantiation from Extension', () => {
  it('should instantiate AuthService from @bctb/shared')
  it('should instantiate KustoService from @bctb/shared')
  it('should instantiate CacheService from @bctb/shared')
});
```

**Manual Validation**:
```powershell
# Build shared package
cd packages/shared
npm run build

# Verify dist/ exists with index.js and index.d.ts
ls dist/

# Test import from extension context
node -e "const shared = require('./dist/index.js'); console.log(Object.keys(shared));"
```

**Success Criteria**:
- ✅ All services export correctly
- ✅ TypeScript types available
- ✅ Both MCP and extension can import @bctb/shared
- ✅ No "Cannot find module" errors

### Phase 2 Validation: Standalone MCP

**Test Goal**: Ensure MCP server runs independently without extension

**Automated Tests** (`mcp-standalone.test.ts`):
```typescript
describe('Phase 2: Package Structure', () => {
  it('should have standalone MCP package')
  it('should NOT be bundled in extension package')
  it('should have @bctb/shared as dependency')
});

describe('Phase 2: CLI Functionality', () => {
  it('should support query-telemetry command')
  it('should support save-query command')
  it('should support list-queries command')
});
```

**Manual Validation**:
```powershell
# Build MCP standalone
cd packages/mcp
npm run build

# Test CLI works
node dist/cli.js query-telemetry --help

# Test server starts without extension
BCTB_WORKSPACE_PATH=/test node dist/launcher.js
```

**Success Criteria**:
- ✅ MCP builds independently
- ✅ CLI commands respond
- ✅ Server starts in stdio mode
- ✅ No imports from extension package
- ✅ Uses @bctb/shared services

### Phase 3 Validation: Extension Independence

**Test Goal**: Ensure extension works without bundled MCP

**Automated Tests** (`command-handlers.test.ts`, `telemetryService.test.ts`):
```typescript
describe('Phase 3: Extension Independence', () => {
  it('should NOT bundle MCP server files')
  it('should use TelemetryService for commands')
  it('should import services directly from @bctb/shared')
});

describe('Command Handlers', () => {
  it('runKQLQueryCommand should use TelemetryService.executeKQL()')
  it('saveQueryCommand should use TelemetryService.saveQuery()')
});
```

**Manual Validation**:
```powershell
# Verify no bundled MCP
ls packages/extension/mcp/  # Should NOT exist or be empty

# Build extension
cd packages/extension
npm run build

# Verify externalized @bctb/shared
grep -n "external:@bctb/shared" package.json  # Should find in build script
```

**Success Criteria**:
- ✅ No packages/extension/mcp/ directory
- ✅ Commands use telemetryService not mcpClient
- ✅ Extension builds successfully
- ✅ F5 debug works without MCP bundling
- ✅ All 4 command handlers updated

---

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

### Test 4: Event Category Discovery (Dynamic)

```
@workspace Show me all events grouped by category
```

**Expected behavior**:
- ✅ Copilot calls `get_event_catalog` (may fall back to using earlier catalog data)
- ✅ Shows standard categories from telemetry events: Error, Performance, Lifecycle, Integration, etc.
- ✅ If you have custom events, they're categorized based on message content
- ✅ No hardcoded mapping errors

**Note**: If Copilot calls `get_categories` and returns empty, that's expected - `get_categories` lists saved query folders (e.g., queries/Performance/), not telemetry event categories. Copilot should analyze the event catalog to extract categories.

**Verification checklist**:
- [ ] Standard BC events show correct categories (RT0005=Performance, RT0010=Error, etc.)
- [ ] Custom events are categorized (not all "Unknown")
- [ ] Category sources are identified (microsoft-learn, custom-analysis, cache)
- [ ] Events are logically grouped (Performance events together, Error events together, etc.)

---

### Test 5: Query Execution (No NL Parameter)

```
@workspace Query RT0005 events where executionTimeInMs > 1000 in the last 24 hours
```

**Verification** (GitHub Copilot):

**Note**: When using GitHub Copilot, MCP tools run in STDIO mode and communicate directly with Copilot. You won't see tool calls in the Output panel. Instead, verify the breaking change this way:

1. **In Copilot Chat**, look for the tool usage indicators:
   - Copilot will show "Used bctb_query_telemetry" or similar indicators
   - The response should include query results without mentioning "natural language translation"

2. **Verify the workflow**: Copilot should:
   - First call `get_event_catalog` or `get_event_field_samples` to discover RT0005 structure
   - Then call `query_telemetry` with generated KQL
   - Show you the query results

3. **Check query accuracy**: The generated KQL should use correct field names:
   - `tostring(customDimensions.eventId) == "RT0005"` ✅
   - `toreal(customDimensions.executionTimeInMs) > 1000` ✅
   - Field names match the discovered structure

**Verification checklist**:
- [ ] Copilot discovers event structure before querying (shows it's using discovery tools)
- [ ] Generated KQL uses correct field names from discovery
- [ ] Query executes successfully
- [ ] Results are displayed
- [ ] No errors about "natural language translation failed"

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

**How to verify with GitHub Copilot**:

Since GitHub Copilot uses STDIO mode (direct communication with MCP), you won't see tool calls in the Output panel. Instead, verify the breaking change indirectly:

1. **Ask questions in natural language** - Copilot should still work:
   ```
   @workspace Show me slow operations from yesterday
   @workspace What errors happened in the last hour?
   @workspace Find database locks that lasted more than 5 seconds
   ```

2. **Verify Copilot uses discovery-first workflow**:
   - Look for Copilot mentioning "discovering events" or "analyzing field structure"
   - Copilot should show event catalog results before querying
   - Generated KQL should use correct field names (not guessed)

3. **Check for error messages that would indicate NL translation**:
   - ❌ Should NOT see: "translating natural language to KQL"
   - ❌ Should NOT see: "pattern matching failed"
   - ✅ Should see: Copilot using discovery tools, then executing KQL

**Verification checklist**:
- [ ] Natural language questions still work (Copilot converts them internally)
- [ ] Copilot uses `get_event_catalog` or `get_event_field_samples` before querying
- [ ] Generated KQL is accurate (correct field names from discovery)
- [ ] No error messages about NL translation or pattern matching

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
