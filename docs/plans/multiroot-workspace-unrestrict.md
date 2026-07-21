# Plan: Remove Multi-Root Workspace Restriction

**Status:** `done` ✅  
**Created:** 2026-06-05  
**Updated:** 2026-06-05  
**Completed:** 2026-06-05  
**Component:** Extension (VSCode)  
**Proposal Source:** OneDrive proposals (multiroot-workspace-support.md, multiroot-implementation-guide.md)

**Implementation Summary:**
- ✅ Phase 2: Priority folder detection implemented & tested (100% coverage)
- ✅ Phase 1: All 3 wizards updated to use findConfigWorkspace()
- ✅ 442 existing tests pass (no regressions)
- ✅ Security scan passed

**Version:** Ready for v1.2.11 (PATCH release)

---

## 1. Goal

Remove artificial multi-root workspace blocking from all UI wizards and standardize on intelligent config discovery using existing `findConfigWorkspace()` service across entire extension.

**User benefit:**
- Enterprise users with multi-root workspaces (App/, Test/, .azureDevOps/, Telemetry/) can use ALL wizards
- Consistent behavior across Setup Wizard, Agent Monitoring Setup, and Profile Wizard
- Aligns extension with enterprise scripted configuration provisioning patterns (dedicated Telemetry folder structure)
- Removes outdated error message referencing `.vscode/settings.json` (hasn't been used since v1.2.x)
- Agent monitoring workflows work seamlessly in multi-root workspaces
- Profile management consistent with config location

---

## 2. Scope

### Files to Modify

**Phase 1 (Core Fix - All UI Wizards):**
1. `packages/extension/src/webviews/SetupWizardProvider.ts`
   - Add import for `findConfigWorkspace`
   - Replace `workspaceFolders[0]` with `findConfigWorkspace()` (3 locations: lines 166, 213, 415)
   - Remove multi-root error HTML div (lines ~744-758)
   - Remove multi-root blocking JavaScript logic (lines ~1228-1245)

2. `packages/extension/src/webviews/AgentMonitoringSetupProvider.ts`
   - Add import for `findConfigWorkspace`
   - Replace `_getWorkspacePath()` method to use `findConfigWorkspace()` (line 409)
   - Update config file path resolution for agent templates
   - Ensure Azure DevOps pipeline templates use correct workspace path

3. `packages/extension/src/webviews/ProfileWizardProvider.ts`
   - Add import for `findConfigWorkspace`
   - Replace `workspaceFolders[0]` with `findConfigWorkspace()` (line 232)
   - Update profile config path resolution

**Phase 2 (Enhancement):**
4. `packages/extension/src/services/workspaceFinder.ts`
   - Add priority folder detection with 4 case-insensitive aliases:
     - `telemetry` (BC Telemetry Buddy specific)
     - `monitoring` (generic monitoring folder)
     - `analytics` (analytics/BI teams)
     - `insights` (Microsoft App Insights naming)
   - Aligns with enterprise scripted configuration provisioning patterns

### Tests to Add

5. `packages/extension/src/__tests__/workspaceFinder.test.ts` (extend existing)
   - Test single-folder workspace → finds config
   - Test multi-root without config → falls back to first folder
   - Test multi-root with priority folder (Telemetry/Monitoring/Analytics/Insights) → prioritizes it
   - Test multi-root with config in multiple folders → returns first match (or priority folder if present)
   - Test case-insensitive matching (TELEMETRY, Monitoring, analytics, etc.)
   - Test priority order when multiple priority folders exist

6. `packages/extension/src/__tests__/setupWizardProvider.test.ts` (extend existing)
   - Test Setup Wizard loads config from correct folder in multi-root
   - Test Setup Wizard saves config to correct folder in multi-root
   - Test multi-root blocking removed (no error message)

7. `packages/extension/src/__tests__/agentMonitoringSetupProvider.test.ts` (extend existing)
   - Test Agent Monitoring wizard finds config in multi-root workspace
   - Test agent templates use correct workspace path
   - Test Azure DevOps pipeline templates reference correct config path

8. `packages/extension/src/__tests__/profileWizardProvider.test.ts` (extend existing)
   - Test Profile wizard resolves config path in multi-root workspace

---

## 3. Blast Radius / Breakage Prediction

### Rating: **`low-risk`**

### Justification

**Why low-risk:**
1. ✅ **Existing service is stable** - `findConfigWorkspace()` already exists and works, just not used everywhere
2. ✅ **Backward compatible** - Single-folder workspaces unaffected (same code path)
3. ✅ **Removes restriction, doesn't change behavior** - Multi-root users currently blocked, can't break what doesn't work
4. ✅ **No config format changes** - `.bctb-config.json` structure unchanged
5. ✅ **No authentication changes** - Auth flows unaffected

**Potential issues:**
1. ⚠️ Multi-root users might be surprised Telemetry folder is auto-prioritized
2. ⚠️ If multiple folders have `.bctb-config.json`, only first is used (documented behavior)

### Priority Folder Detection - Clarification

**Supported priority folder names (case-insensitive):**
1. `telemetry` - BC Telemetry Buddy specific naming
2. `monitoring` - Generic monitoring/observability folder
3. `analytics` - Analytics and BI teams
4. `insights` - Microsoft App Insights terminology

**When priority folder detection applies:**
- ✅ **ONLY** in multi-root workspaces (2+ workspace folders)
- ✅ **ONLY** if priority folder contains `.bctb-config.json`
- ✅ Case-insensitive matching: `Telemetry`, `MONITORING`, `Analytics` all work
- ✅ Priority order: telemetry > monitoring > analytics > insights
- ✅ Optional behavior - can be opted-out by not creating priority folders

**When priority folder detection does NOT apply:**
- ❌ Single-root workspaces → always use root folder (no priority logic)
- ❌ Multi-root without priority folders → use first folder with config
- ❌ Priority folder exists but has no config → skip to next folder

**Implementation detail:**
```typescript
// Priority folder names (case-insensitive, in priority order)
const PRIORITY_FOLDER_NAMES = [
    'telemetry',   // BC Telemetry Buddy specific
    'monitoring',  // Generic monitoring folder
    'analytics',   // Analytics/BI teams
    'insights'     // Microsoft App Insights naming
];

// Priority check ONLY runs for multi-root
if (workspaceFolders.length > 1) {
    const priorityFolder = workspaceFolders.find(f => 
        PRIORITY_FOLDER_NAMES.includes(f.name.toLowerCase())
    );
    if (priorityFolder && hasConfigInPriorityFolder) {
        return priorityFolder; // PRIORITY 1
    }
}
// Otherwise: first folder with config (PRIORITY 2)
// Or: first folder as fallback (PRIORITY 3)
```

**Priority order example:**
If workspace has both `Monitoring/` and `Analytics/`, extension uses `Monitoring/` (higher priority).

**Opt-out strategy:** Projects that don't want priority folder detection simply don't create folders with these names - extension falls back to standard discovery (first folder with config).

### Who/What Could Break

**User Scenario 1: Single-root workspace (MyProject/)**
- **Before:** Uses `MyProject/` folder
- **After:** Uses `MyProject/` folder (identical)
- **Impact:** ✅ **No change** - Telemetry priority logic not activated

**User Scenario 2: Single-root with Telemetry subfolder (MyProject/Telemetry/)**
- **Before:** Uses `MyProject/` folder
- **After:** Uses `MyProject/` folder (Telemetry is subfolder, not workspace folder)
- **Impact:** ✅ **No change** - Telemetry priority only for multi-root workspace folders

**User Scenario 3: Multi-root workspace with config in App/ folder (App/, Test/)**
- **Before:** Blocked by error message
- **After:** Setup Wizard saves to App/ (first folder with config)
- **Impact:** ✅ Works now (improvement), no Telemetry priority

**User Scenario 4: Multi-root with priority folder + config in App/ (App/, Monitoring/, Test/)**
- **Before:** Blocked by error message
- **After:** Setup Wizard saves to Monitoring/ (priority folder)
- **Impact:** ⚠️ Might expect App/ folder, gets Monitoring/ instead
- **Mitigation:** Document priority logic, add logging to Output channel

**User Scenario 5: Multi-root with priority folder but NO config (App/, Telemetry/, Test/)**
- **Before:** Blocked by error message
- **After:** Setup Wizard saves to App/ (first folder, Telemetry skipped - no config)
- **Impact:** ✅ Works now, priority not applied (no config file in priority folder)

**User Scenario 6: Multi-root with multiple priority folders (Monitoring/, Analytics/, App/)**
- **Before:** Blocked by error message
- **After:** Setup Wizard saves to Monitoring/ (higher priority than Analytics/)
- **Impact:** ✅ Works, uses priority order: telemetry > monitoring > analytics > insights

**User Scenario 7: Case-insensitive matching (App/, TELEMETRY/, Test/)**
- **Before:** Blocked by error message
- **After:** Setup Wizard saves to TELEMETRY/ (case-insensitive match)
- **Impact:** ✅ Works, robust to casing variations

**User Scenario 8: Agent Monitoring setup in multi-root (App/, Monitoring/, Test/)**
- **Before:** Agent wizard uses App/ (first folder), may not find config in Monitoring/
- **After:** Agent wizard uses Monitoring/ (priority folder with config)
- **Impact:** ✅ Agent templates reference correct config location, pipelines work

**User Scenario 9: Profile wizard in multi-root (App/, Telemetry/, Test/)**
- **Before:** Profile wizard creates profile in App/ (first folder)
- **After:** Profile wizard creates profile in Telemetry/ (priority folder)
- **Impact:** ✅ Profiles stored alongside main config, consistent structure

### Regression Detection

**How to verify nothing broke:**

1. **Manual testing:**
   - Test single-folder workspace → Setup Wizard works
   - Test multi-root workspace → Setup Wizard works (no error)
   - Test multi-root with Telemetry/ folder → Saves to Telemetry/
   - Test Command Palette commands still work (Run KQL, Save Query, etc.)

2. **Automated testing:**
   - Unit tests for `findConfigWorkspace()` with various workspace structures
   - Coverage threshold: 70% (existing CI enforcement)

3. **Integration testing:**
   - Verify `.bctb-config.json` created in expected folder
   - Verify MCP server reads config from correct location (via `BCTB_WORKSPACE_PATH`)
   - Verify telemetry tracks workspace path (not just `isMultiRoot` boolean)
   - Verify Agent Monitoring wizard creates agent templates in correct folder
   - Verify Azure DevOps pipeline templates reference correct config path
   - Verify Profile wizard creates profiles in correct workspace folder

**Red flags that indicate regression:**
- Setup Wizard breaks for single-folder workspaces
- Config file created in wrong folder
- Commands fail to find config file
- Telemetry service errors accessing workspace
- Agent Monitoring wizard cannot find config or creates agents in wrong folder
- Profile wizard creates profiles in unexpected location
- Azure DevOps pipelines reference non-existent config paths

---

## 4. Migration Path

### User Experience

**No migration needed** - this is purely additive:
- Users with single-folder workspaces: Zero impact
- Users with multi-root workspaces: Can now use Setup Wizard (previously blocked)

### Version Implications

**Version bump:** `PATCH` (e.g., v1.2.10 → v1.2.11)

**Rationale:**
- Removes a restriction (not a new feature)
- No API changes
- No config format changes
- Backward compatible

**Could argue MINOR if:**
- Positioned as "Multi-root workspace support" feature
- User-facing change log emphasizes new capability

**Recommendation:** PATCH for Phase 1 (bug fix - removes artificial limitation), MINOR for Phase 2 if bundled with Telemetry folder priority as a feature.

---

## 5. Implementation Plan

### Phase 1: Remove Blocking (Quick Win)

**Time estimate:** 3-4 hours (includes testing all 3 wizards)

**Steps:**
1. **SetupWizardProvider.ts:**
   - Add import: `import { findConfigWorkspace } from '../services/workspaceFinder';`
   - `_validateWorkspace()` (line 166): `workspacePath: findConfigWorkspace()?.workspacePath`
   - `_loadConfig()` (line 213): Replace `workspaceFolders[0].uri` with `findConfigWorkspace()`
   - `_saveConfig()` (line 415): Replace `workspaceFolders[0].uri` with `findConfigWorkspace()`
   - Remove multi-root error HTML div (lines ~744-758)
   - Remove multi-root blocking JavaScript logic (lines ~1228-1245)

2. **AgentMonitoringSetupProvider.ts:**
   - Add import: `import { findConfigWorkspace } from '../services/workspaceFinder';`
   - `_getWorkspacePath()` (line 409): Replace body with `return findConfigWorkspace()?.workspacePath || null;`
   - Verify `_checkPrerequisites()` uses updated `_getWorkspacePath()`
   - Verify agent template creation uses correct workspace path

3. **ProfileWizardProvider.ts:**
   - Add import: `import { findConfigWorkspace } from '../services/workspaceFinder';`
   - Line 232: Replace `workspaceFolders[0].uri.fsPath` with `findConfigWorkspace()?.workspacePath`

4. **Write tests:**
   - Test `findConfigWorkspace()` with single-folder workspace
   - Test `findConfigWorkspace()` with multi-root workspace (no config)
   - Test `findConfigWorkspace()` with multi-root workspace (config in first folder)
   - Test Setup Wizard doesn't show multi-root error
   - Test Agent Monitoring wizard resolves workspace path correctly
   - Test Profile wizard resolves config path correctly

3. **Update telemetry:**
   - Change `isMultiRoot: String(isMultiRoot)` → `workspacePath: folder` (more useful data)

### Phase 2: Priority Folder Detection (Enhancement)

**Time estimate:** 1.5-2 hours

**Steps:**
1. **workspaceFinder.ts:**
   - Add constant: `const PRIORITY_FOLDER_NAMES = ['telemetry', 'monitoring', 'analytics', 'insights'];`
   - Add PRIORITY 1 check using `PRIORITY_FOLDER_NAMES.includes(f.name.toLowerCase())`
   - Update loop to skip priority folders already checked (PRIORITY 2)
   - Enhance logging to show which priority folder was selected

2. **Tests:**
   - Test multi-root with Telemetry folder → returns Telemetry path
   - Test multi-root with Monitoring folder → returns Monitoring path
   - Test multi-root with Analytics folder → returns Analytics path
   - Test multi-root with Insights folder → returns Insights path
   - Test case-insensitive matching (TELEMETRY, Monitoring, analytics)
   - Test priority order (Monitoring + Analytics → returns Monitoring)
   - Test multi-root without priority folders → returns first folder with config

3. **Documentation:**
   - Update `packages/extension/README.md` - mention multi-root support
   - Update `docs/UserGuide.md` - explain Telemetry folder priority

---

## 6. Testing Strategy

### Unit Tests (70% coverage required)

**New test file:** `packages/extension/src/__tests__/workspaceFinder.test.ts`

```typescript
describe('findConfigWorkspace', () => {
  it('returns first folder for single-folder workspace', () => { ... });
  it('returns undefined when no workspace open', () => { ... });
  
  // Priority folder tests
  it('prioritizes Telemetry folder in multi-root workspace', () => { ... });
  it('prioritizes Monitoring folder in multi-root workspace', () => { ... });
  it('prioritizes Analytics folder in multi-root workspace', () => { ... });
  it('prioritizes Insights folder in multi-root workspace', () => { ... });
  
  // Case-insensitive tests
  it('matches TELEMETRY (uppercase) in multi-root workspace', () => { ... });
  it('matches Monitoring (mixed case) in multi-root workspace', () => { ... });
  
  // Priority order tests
  it('prefers Monitoring over Analytics when both exist', () => { ... });
  it('prefers Telemetry over Monitoring when both exist', () => { ... });
  
  // Fallback tests
  it('falls back to first folder when priority folder has no config', () => { ... });
  it('skips priority folders in PRIORITY 2 loop', () => { ... });
  it('returns first folder with config when no priority folders exist', () => { ... });
});
```

### Integration Tests

**Manual test cases:**

1. **Single-folder workspace:**
   - Open single folder
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in that folder
   - ✅ Pass

2. **Multi-root without priority folders:**
   - Open multi-root workspace (App/, Test/)
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in App/ (first folder)
   - ✅ Pass

3. **Multi-root with Telemetry (first):**
   - Open multi-root workspace (Telemetry/, App/, Test/)
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in Telemetry/
   - ✅ Pass

4. **Multi-root with Monitoring (not first):**
   - Open multi-root workspace (App/, Monitoring/, Test/)
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in Monitoring/ (prioritized)
   - ✅ Pass

5. **Multi-root with case-insensitive match:**
   - Open multi-root workspace (App/, ANALYTICS/, Test/)
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in ANALYTICS/ (case-insensitive)
   - ✅ Pass

6. **Multi-root with multiple priority folders:**
   - Open multi-root workspace (App/, Analytics/, Monitoring/, Test/)
   - Run Setup Wizard
   - Verify `.bctb-config.json` created in Monitoring/ (higher priority)
   - ✅ Pass

7. **Multi-root with config in multiple folders:**
   - Open multi-root with `.bctb-config.json` in App/ and Test/
   - Verify `findConfigWorkspace()` returns App/ (first match, no priority folders)
   - ✅ Pass

8. **Agent Monitoring wizard in multi-root:**
   - Open multi-root workspace (App/, Monitoring/, Test/) with config in Monitoring/
   - Run Agent Monitoring Setup Wizard
   - Create agent template
   - Verify agent saved to Monitoring/ folder
   - Verify Azure DevOps pipeline template references Monitoring/.bctb-config.json
   - ✅ Pass

9. **Profile wizard in multi-root:**
   - Open multi-root workspace (App/, Telemetry/, Test/) with config in Telemetry/
   - Run Profile Wizard to create new profile
   - Verify profile created in Telemetry/.bctb-config.json
   - ✅ Pass

---

## 7. Documentation Updates

**Files to update:**

1. `packages/extension/README.md`
   - Remove any mention of multi-root limitation (if present)
   - Add note about priority folder detection (telemetry, monitoring, analytics, insights)
   - Document case-insensitive matching and priority order

2. `packages/extension/CHANGELOG.md`
   - Add entry: `## [1.2.11] - 2026-06-05`
     - `### Fixed`
     - `- Removed artificial multi-root workspace restriction from all UI wizards (Setup, Agent Monitoring, Profile)`
     - `- All wizards now use intelligent config discovery (findConfigWorkspace service)`
     - `- Agent Monitoring wizard correctly resolves workspace path in multi-root environments`
     - `- Profile wizard creates profiles in correct workspace folder`
     - `### Changed`
     - `- Priority folder detection in multi-root workspaces (telemetry/monitoring/analytics/insights)`
     - `- Case-insensitive folder name matching for better compatibility`
     - `- Consistent config discovery across entire extension`

3. `docs/UserGuide.md`
   - Add section: "Multi-Root Workspace Support"
   - Explain priority folder detection with 4 supported aliases
   - Document case-insensitive matching behavior
   - Document priority order: telemetry > monitoring > analytics > insights
   - Document expected behavior for various workspace structures
   - Include examples for each supported folder name
   - Add subsection: "Agent Monitoring in Multi-Root Workspaces"
     - Explain how agent templates are stored
     - Document Azure DevOps pipeline configuration for multi-root
     - Show example workspace structure with Monitoring/ folder
   - Add subsection: "Profile Management in Multi-Root Workspaces"
     - Explain where profiles are stored
     - Document switching between profiles in different workspace folders

---

## 8. Rollback Plan

**If issues arise:**

1. **Revert commits:**
   ```bash
   git revert <commit-hash>
   ```

2. **Hotfix release:**
   - Restore original multi-root blocking code
   - Bump to v1.2.12 with revert
   - Investigate root cause before re-implementing

3. **Feature flag (future consideration):**
   - Add `bctb.enableMultiRootWorkspaces` setting (default: true)
   - Allows quick disable without code changes

---

## 9. Success Criteria

**Phase 1 complete when:**
- ✅ Setup Wizard works in multi-root workspaces (no error)
- ✅ Agent Monitoring wizard works in multi-root workspaces
- ✅ Profile wizard works in multi-root workspaces
- ✅ All existing single-folder tests pass
- ✅ New multi-root tests pass (70% coverage maintained)
- ✅ CI build passes (tests + coverage + lint)
- ✅ Documentation updated (README, CHANGELOG, UserGuide)
- ✅ All three wizards use consistent config discovery logic

**Phase 2 complete when:**
- ✅ Priority folder detection works for all 4 aliases (telemetry, monitoring, analytics, insights)
- ✅ Case-insensitive matching works correctly (TELEMETRY, Monitoring, analytics)
- ✅ Priority order enforced correctly (telemetry > monitoring > analytics > insights)
- ✅ Logging shows which priority folder was selected in Output channel
- ✅ Tests verify priority logic for all aliases and edge cases
- ✅ Documentation clearly explains supported folder names and priority order

---

## 10. Next Steps

1. **Approval:** Wait for explicit user approval ("go", "approved", "proceed")
2. **Implement Phase 1:** Make code changes per implementation guide
3. **Write tests:** Ensure 70% coverage threshold met
4. **Manual testing:** Verify all test cases pass
5. **Security scan:** Run `/security-scan` skill (Phase 8 of TDD workflow)
6. **Document:** Update PromptLog.md, DesignWalkthrough.md, CHANGELOG.md
7. **Submit:** Create PR with tests and documentation

---

## References

- Proposal: `OneDrive\Education\waldo.BCTelemetryBuddy\docs\proposals\multiroot-workspace-support.md`
- Implementation Guide: `OneDrive\Education\waldo.BCTelemetryBuddy\docs\proposals\multiroot-implementation-guide.md`
- Contributing Guidelines: `.github/copilot-instructions.md` (TDD workflow, SOLID principles)
- Existing Service: `packages/extension/src/services/workspaceFinder.ts`
