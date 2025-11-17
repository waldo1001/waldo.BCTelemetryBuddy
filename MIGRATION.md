# Migration Guide: v0.2.x → v0.3.0

⚠️ **IMPORTANT: v0.3.0 is currently in development and not yet released. This guide is for testing purposes only.**

## Current Status

**What Works:**
- ✅ File-based configuration (`.bctb-config.json`) created via Setup Wizard
- ✅ Multi-profile support for managing multiple environments
- ✅ MCP server can run standalone

**What Doesn't Work Yet:**
- ❌ Automatic migration UI (not implemented - tests failing)
- ❌ Multi-root workspace migration (explicitly not supported)
- ❌ Direct command execution without MCP (command handlers not integrated)
- ❌ TelemetryService integration (13 failing tests)

**Current Test Status:** 21 of 178 tests failing

---

## ⚠️ Multi-Root Workspace Warning

**BC Telemetry Buddy does NOT support multi-root workspaces.** 

If you're using a multi-root workspace (workspace with multiple folders), you must:
1. Close the multi-root workspace
2. Open a single folder workspace
3. Run Setup Wizard in the single-folder workspace

**Why?** Configuration is workspace-scoped and cannot be shared across multiple root folders. Attempting to use multi-root workspaces will result in:
- Setup Wizard errors
- Migration failures
- Commands not working

---

## TL;DR

⚠️ **Manual migration required** - Automatic migration not yet implemented  
✅ **Setup Wizard works** - Creates new `.bctb-config.json` from scratch  
❌ **Extension still needs MCP** - Direct commands don't work without MCP yet  
❌ **Multi-root blocked** - Use single-folder workspaces only  

**Recommended Action:** Wait for v0.3.0 official release or use Setup Wizard to manually create new configuration.

---

## What Changed?

### Architecture Evolution

**Before (v0.2.x - Bundled MCP):**
```
VSCode Extension
  ├── MCP Server (bundled inside)
  ├── All commands require MCP
  └── Settings in .vscode/settings.json
```

**After (v0.3.0 - Independent):**
```
VSCode Extension (standalone)
  ├── TelemetryService (built-in for direct commands)
  └── Optional: MCP Server (separate package for chat)
  
Configuration: .bctb-config.json (single file)
```

### Key Differences

| Feature | v0.2.x | v0.3.0 |
|---------|--------|--------|
| **Installation** | Extension only | Extension + optional MCP package |
| **Direct Commands** | Requires MCP running | Built-in (no MCP needed) |
| **Chat Features** | Bundled automatically | Requires `npm install -g bc-telemetry-buddy-mcp` |
| **Configuration** | `.vscode/settings.json` (`bcTelemetryBuddy.*` namespace) | `.bctb-config.json` (workspace root) |
| **Startup** | MCP auto-starts on commands | Extension ready immediately |
| **Performance** | HTTP mode overhead | Direct execution (faster) |
| **Dependencies** | Bundled with extension | Shared core, bundled at build time |

---

## Migration Process

### Automatic Migration (Not Yet Implemented) ⚠️

**Status:** Planned for future release, not currently working.

The automatic migration feature described below is **not yet implemented**. Test failures show:
- Migration detection not triggering
- No notification shown to users
- Config file creation failing in multi-root scenarios

**Current Reality:**
1. Update extension
2. Old settings may continue to work (deprecated)
3. **Recommended:** Use Setup Wizard to create new config manually
4. Do NOT expect automatic migration notification

---

### Manual Migration (Recommended) ✅

If automatic migration doesn't work or you prefer manual setup:

#### Prerequisite: Single-Folder Workspace Required

⚠️ **CRITICAL:** BC Telemetry Buddy does NOT support multi-root workspaces.

**Before proceeding:**
1. Check if you have a multi-root workspace:
   - Look for "WORKSPACE" in VSCode title bar
   - Check if you have `.code-workspace` file open
   - Look for multiple root folders in Explorer sidebar

2. If multi-root: **Close it and open a single folder instead**:
   - File → Close Workspace
   - File → Open Folder → Select ONE project folder
   - Run Setup Wizard in the single folder

**Why?** Configuration is workspace-scoped. Multi-root workspaces cause migration and command failures.

#### Step 1: Note Your Current Settings

Open `.vscode/settings.json` and copy your configuration:

```json
{
  "bcTelemetryBuddy.connectionName": "Production BC Telemetry",
  "bcTelemetryBuddy.tenantId": "12345678-1234-1234-1234-123456789abc",
  "bcTelemetryBuddy.appInsights.appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "bcTelemetryBuddy.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/<sub-id>",
  "bcTelemetryBuddy.authFlow": "azure_cli",
  "bcTelemetryBuddy.queries.folder": "queries",
  "bcTelemetryBuddy.cache.enabled": true,
  "bcTelemetryBuddy.cache.ttlSeconds": 3600,
  "bcTelemetryBuddy.sanitize.removePII": false
}
```

#### Step 2: Run Setup Wizard

1. Open Command Palette (Ctrl+Shift+P)
2. Run: `BC Telemetry Buddy: Setup Wizard`
3. Enter your settings when prompted:
   - **Connection Name**: Same as before
   - **Tenant ID**: Same as before
   - **App Insights App ID**: Same as before
   - **Kusto Cluster URL**: Same as before
   - **Auth Flow**: Same as before
4. Wizard validates and creates `.bctb-config.json`
5. Test connection succeeds

#### Step 3: Verify Configuration File

Check `.bctb-config.json` in workspace root:

```json
{
  "connectionName": "Production BC Telemetry",
  "tenantId": "12345678-1234-1234-1234-123456789abc",
  "authFlow": "azure_cli",
  "applicationInsightsAppId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
  "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/<sub-id>",
  "workspacePath": "${workspaceFolder}",
  "queriesFolder": "queries",
  "cacheEnabled": true,
  "cacheTTLSeconds": 3600,
  "removePII": false
}
```

#### Step 4: Test Direct Commands

⚠️ **KNOWN ISSUE:** Direct commands without MCP are not yet working in v0.3.0 development build.

**Current Reality:**
1. Commands still require MCP server running
2. TelemetryService integration incomplete (13 failing tests)
3. Extension will likely fail or timeout without MCP

**Workaround:**
- Keep using MCP server (HTTP mode) for now
- Wait for v0.3.0 official release with working direct execution
- Or install MCP locally: `cd packages/mcp && npm link`

---

#### Step 5: (Optional) Clean Up Old Settings

Remove old settings from `.vscode/settings.json`:

```json
{
  // DELETE these (extension no longer reads them):
  // "bcTelemetryBuddy.connectionName": "...",
  // "bcTelemetryBuddy.tenantId": "...",
  // "bcTelemetryBuddy.appInsights.appId": "...",
  // etc.
}
```

**Note:** You can leave old settings - extension ignores them. Safe to delete once migration confirmed working.

---

## Installing MCP for Chat Features

If you want to use the GitHub Copilot chat participant (`@bc-telemetry-buddy`):

### Option 1: Extension Prompt (Not Yet Available)

⚠️ **KNOWN ISSUE:** Automatic MCP installation prompt not implemented yet.

**Current Reality:**
- Extension won't prompt to install MCP
- No automatic installation available
- Must install manually

### Option 2: Manual Install (Required)

```bash
# Install from local build (MCP not on NPM yet)
cd c:\_Source\Community\waldo.BCTelemetryBuddy\packages\mcp
npm link

# Verify installation
bctb-mcp --version
# Should show version number

# Or wait for NPM package (not yet published)
# npm install -g bc-telemetry-buddy-mcp
```

### Verify Chat Integration Works

1. **Reload VSCode**: `Developer: Reload Window`

2. **Check MCP Detection**:
   - Open Output panel (Ctrl+Shift+U)
   - Select "BC Telemetry Buddy (Extension)"
   - Look for: `Using globally-installed MCP at: [path]`

3. **Test Chat Participant**:
   - Open GitHub Copilot Chat
   - Type: `@bc-telemetry-buddy show me the event catalog`
   - Should respond with BC telemetry events (RT0001, RT0005, etc.)

4. **Test Discovery Tools**:
   - Ask: `@bc-telemetry-buddy what fields are in RT0005?`
   - Copilot should analyze schema and show field structure

---

## Settings Mapping Reference

### Old VSCode Settings → New Config File

| Old Setting (v0.2.x) | New Config Key (v0.3.0) |
|----------------------|-------------------------|
| `bcTelemetryBuddy.connectionName` | `connectionName` |
| `bcTelemetryBuddy.tenantId` | `tenantId` |
| `bcTelemetryBuddy.appInsights.appId` | `applicationInsightsAppId` |
| `bcTelemetryBuddy.kusto.clusterUrl` | `kustoClusterUrl` |
| `bcTelemetryBuddy.authFlow` | `authFlow` |
| `bcTelemetryBuddy.clientId` | `clientId` |
| `bcTelemetryBuddy.clientSecret` | `clientSecret` (or `${ENV_VAR}`) |
| `bcTelemetryBuddy.queries.folder` | `queriesFolder` |
| `bcTelemetryBuddy.cache.enabled` | `cacheEnabled` |
| `bcTelemetryBuddy.cache.ttlSeconds` | `cacheTTLSeconds` |
| `bcTelemetryBuddy.sanitize.removePII` | `removePII` |
| `bcTelemetryBuddy.port` | *(removed - not needed)* |
| `bcTelemetryBuddy.references` | `references` |

### Example: Before & After

**Before (.vscode/settings.json):**
```json
{
  "bcTelemetryBuddy.connectionName": "Production",
  "bcTelemetryBuddy.appInsights.appId": "abc123",
  "bcTelemetryBuddy.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/xyz",
  "bcTelemetryBuddy.authFlow": "azure_cli"
}
```

**After (.bctb-config.json):**
```json
{
  "connectionName": "Production",
  "applicationInsightsAppId": "abc123",
  "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/xyz",
  "authFlow": "azure_cli"
}
```

---

## Troubleshooting

### Development Version Issues

**Q: Tests are failing - is v0.3.0 ready?**

**Status:** No, v0.3.0 is in active development with 21 failing tests:
- 8 MCP migration tests failing (multi-root workspace support)
- 13 extension command handler tests failing (TelemetryService integration)

**Recommendation:** Wait for official release or use v0.2.x stable version.

---

**Q: Multi-root workspace errors**

**Cause:** BC Telemetry Buddy explicitly does NOT support multi-root workspaces.

**Solution:**
1. Close your multi-root workspace
2. Open a single folder instead
3. Run Setup Wizard in single-folder workspace

**Why not supported?**
- Configuration is workspace-scoped (`.vscode/settings.json` or `.bctb-config.json`)
- Cannot share settings across multiple root folders
- Migration and validation tests fail in multi-root scenarios
- Extension was designed for single-project/single-customer workspaces

---

### Migration Issues

**Q: Migration notification doesn't appear**

**Current Status:** Migration notification is not yet implemented (known issue in v0.3.0).

**What's Happening:**
- Automatic migration detection code not triggering
- No notification shown to users
- Tests for migration validation failing

**Solution:**
1. Don't wait for automatic migration - it's not working yet
2. Run Setup Wizard manually: `BC Telemetry Buddy: Setup Wizard`
3. Or create `.bctb-config.json` manually (see UserGuide.md)

---

**Q: "Configuration incomplete" errors after migration**

**Possible Causes:**
- Migration didn't copy all required settings
- `.bctb-config.json` has syntax errors
- Missing required fields (App Insights ID, Kusto URL)

**Solutions:**
1. Open `.bctb-config.json` and check for JSON syntax errors
2. Verify required fields are present:
   - `applicationInsightsAppId`
   - `kustoClusterUrl`
   - `authFlow`
3. Run Setup Wizard to regenerate config with validation
4. Check Output panel for specific error messages

---

**Q: Commands don't work after migration**

**Current Status:** Direct command execution without MCP is not working (13 failing tests).

**What's Happening:**
- Command handlers exist but not integrated with TelemetryService
- Commands still require MCP server running
- TelemetryService initialization incomplete

**Solution:**
1. Keep MCP server running (HTTP mode): extension still needs it
2. Or wait for v0.3.0 official release with working direct execution
3. Check Output panel for specific error messages

---

**Q: Old settings still showing in autocomplete**

**Cause:**
- VSCode caches settings schema

**Solution:**
1. Reload VSCode: `Developer: Reload Window`
2. Old settings won't affect new version (ignored)
3. Safe to delete old `bcTelemetryBuddy.*` entries

---

### Chat Integration Issues

**Q: Chat participant not found after installing MCP**

**Possible Causes:**
- VSCode didn't detect MCP installation
- MCP not installed globally
- Extension cache issue

**Solutions:**
1. Reload VSCode: `Developer: Reload Window`
2. Verify MCP installed: `bctb-mcp --version` in terminal
3. Check MCP in PATH: `where bctb-mcp` (Windows) or `which bctb-mcp` (Mac/Linux)
4. Reinstall MCP: `npm uninstall -g bc-telemetry-buddy-mcp && npm install -g bc-telemetry-buddy-mcp`
5. Check Output panel for "Using globally-installed MCP" message

---

**Q: Chat gives errors but direct commands work**

**Possible Causes:**
- MCP server not running
- MCP can't find/read config file
- Configuration valid for extension but not MCP

**Solutions:**
1. Verify MCP can read config:
   ```bash
   bctb-mcp validate --config .bctb-config.json
   ```
2. Check MCP server logs in Output panel
3. Manually start MCP in terminal to see errors:
   ```bash
   cd /path/to/workspace
   bctb-mcp start --config .bctb-config.json --stdio
   ```
4. Look for authentication or connection errors

---

**Q: MCP installed but extension doesn't detect it**

**Possible Causes:**
- MCP installed in different Node.js version
- PATH issue (MCP not in extension's PATH)
- Global npm folder not in system PATH

**Solutions:**
1. Check where MCP installed:
   ```bash
   npm list -g bc-telemetry-buddy-mcp
   ```
2. Verify global npm bin in PATH:
   ```bash
   npm config get prefix
   # Output should be in your PATH
   ```
3. Add npm global bin to PATH if missing (Windows):
   ```powershell
   $env:PATH += ";$env:APPDATA\npm"
   ```
4. Reload VSCode after PATH changes

---

### Authentication Issues

**Q: "Unauthorized" errors after migration**

**Possible Causes:**
- Auth flow changed during migration
- Cached tokens expired
- Service principal credentials incorrect

**Solutions:**
1. Check `authFlow` in `.bctb-config.json` matches what you used before
2. For `azure_cli`: Run `az login` again
3. For `device_code`: Delete cached tokens and re-auth
4. For `client_credentials`: Verify env vars `BCTB_CLIENT_ID` and `BCTB_CLIENT_SECRET`
5. Test auth manually:
   ```bash
   bctb-mcp test-auth --config .bctb-config.json
   ```

---

**Q: Client credentials not working after migration**

**Possible Causes:**
- Client secret in config file (should be in env var)
- Environment variables not set
- Client secret expired

**Solutions:**
1. Never store client secret in `.bctb-config.json` directly
2. Use environment variable placeholder:
   ```json
   {
     "clientSecret": "${BCTB_CLIENT_SECRET}"
   }
   ```
3. Set environment variable:
   ```powershell
   # Windows PowerShell
   $env:BCTB_CLIENT_SECRET = "your-secret-here"
   
   # Linux/Mac
   export BCTB_CLIENT_SECRET="your-secret-here"
   ```
4. Reload VSCode after setting env vars

---

## Rollback Instructions

If you need to rollback to v0.2.x:

### Step 1: Uninstall v0.3.0

1. Open Extensions (Ctrl+Shift+X)
2. Find "BC Telemetry Buddy"
3. Click "Uninstall"

### Step 2: Install v0.2.x

**Option A: From Marketplace (if available)**
1. Search for "BC Telemetry Buddy" in Extensions
2. Click "Install" (may install latest v0.2.x)

**Option B: From VSIX File**
1. Download v0.2.x VSIX from GitHub releases
2. Extensions → `...` menu → "Install from VSIX..."
3. Select downloaded file

### Step 3: Restore Old Settings

1. Open `.vscode/settings.json`
2. Ensure old `bcTelemetryBuddy.*` settings are present
3. If deleted, re-enter them manually
4. Delete `.bctb-config.json` (optional - v0.2.x ignores it)

### Step 4: Reload VSCode

1. Run: `Developer: Reload Window`
2. Verify v0.2.x working: Check extension version in Extensions panel

---

## FAQs

### General

**Q: Is v0.3.0 released?**

A: No, v0.3.0 is in active development with 21 failing tests. Use v0.2.x for stable experience.

**Q: Should I migrate now?**

A: Not recommended unless you're testing the development build. Wait for official v0.3.0 release.

**Q: Do I need to migrate?**

A: Eventually yes, when v0.3.0 is officially released. The old settings format will be deprecated. For now, v0.2.x settings still work.

**Q: Will my saved queries be affected?**

A: No! Saved queries remain in the same location. Only configuration format changes.

**Q: Can I use v0.3.0 without MCP at all?**

A: Not yet. Direct command execution is planned but not working (13 failing tests). MCP still required for all commands.

**Q: Does v0.3.0 support multi-root workspaces?**

A: No, explicitly not supported. Extension blocks multi-root workspaces and migration tests fail. Use single-folder workspaces only.

**Q: Can I share my config file with my team?**

A: Yes! `.bctb-config.json` is designed to be committed to git. Use environment variables for secrets.

### Configuration

**Q: Where should I store client secrets?**

A: Use environment variables, not config file:
```json
{
  "clientSecret": "${BCTB_CLIENT_SECRET}"
}
```

**Q: Can I have multiple config files?**

A: Yes! Use profiles in a single file or `--config` CLI arg for MCP.

**Q: Do I need .vscode/settings.json anymore?**

A: No for BC Telemetry Buddy settings. Extension reads `.bctb-config.json` only. But keep `.vscode/settings.json` for other VSCode/extension settings.

### MCP Server

**Q: Do I need to install MCP?**

A: Yes, currently MCP is still required for all commands (not just chat). Direct command execution is in development but not working yet.

**Q: Can I use the old bundled MCP?**

A: Only in v0.2.x. v0.3.0 development build requires standalone MCP (not yet on NPM, must build locally).

**Q: How do I update MCP?**

A: For local build: `cd packages/mcp && git pull && npm install && npm link`. For NPM package (when released): `npm update -g bc-telemetry-buddy-mcp`

---

## Getting Help

If you encounter issues during migration:

1. **Check Output Panel**:
   - View → Output
   - Select "BC Telemetry Buddy (Extension)"
   - Look for error messages

2. **Validate Configuration**:
   - Run: `BC Telemetry Buddy: Validate Configuration`
   - Fix any reported issues

3. **GitHub Issues**:
   - [Report a bug](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)
   - Include:
     - Extension version
     - MCP version (if installed)
     - Error messages from Output panel
     - Anonymized `.bctb-config.json` (remove secrets)

4. **Discussions**:
   - [Ask questions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/discussions)
   - Share migration experiences
   - Get community help

---

## Summary

⚠️ **v0.3.0 Development Status**: In active development, not ready for release (21 failing tests)

**Current Reality:**
- ❌ Automatic migration doesn't work  
- ❌ Direct command execution incomplete  
- ❌ Multi-root workspaces not supported  
- ❌ MCP still required for all commands  
- ✅ Setup Wizard can create new config  
- ✅ File-based configuration works  

**Recommended Action:** 
- **For Production:** Stay on v0.2.x until v0.3.0 is officially released
- **For Testing:** Use Setup Wizard to create `.bctb-config.json` manually
- **For Development:** Fix failing tests before claiming features work

When v0.3.0 is officially released, this guide will be updated with working migration instructions.
