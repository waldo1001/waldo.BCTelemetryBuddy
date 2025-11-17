# VSCode Extension Changelog

All notable changes to the BC Telemetry Buddy VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.3.0] - 2025-11-17 (IN DEVELOPMENT - NOT RELEASED)

### ⚠️ DEVELOPMENT STATUS

**This version is currently in active development and NOT ready for release.**

**What's Working:**
- ✅ Architecture redesign complete (MCP separated from extension)
- ✅ File-based configuration (`.bctb-config.json`) implemented
- ✅ Multi-profile support functional
- ✅ MCP server can run standalone

**What's In Progress (Test Failures):**
- ❌ Multi-root workspace migration (8 failing MCP tests)
- ❌ Command handler refactoring (13 failing extension tests)
- ❌ Automatic migration UI not yet implemented
- ❌ TelemetryService integration incomplete

**Test Status:** 21 of 178 tests failing (see test output for details)

### 🚨 BREAKING CHANGES (PLANNED)

**Major Architecture Redesign: Standalone MCP Server**

This release will transform BC Telemetry Buddy from a bundled architecture to a modular system where the MCP server is an optional, standalone component.

**Planned Changes:**
- **MCP Server Optional**: Extension will work standalone for direct commands (Run KQL Query, Save Query, etc.)
- **MCP Only for Chat**: MCP server only needed for chat participant features (@bc-telemetry-buddy)
- **Standalone NPM Package**: MCP server will be published as `bc-telemetry-buddy-mcp` on NPM
- **File-Based Configuration**: New `.bctb-config.json` file as single source of truth
- **Multi-Profile Support**: Manage multiple customer environments in single config file

**Migration Path (When Released):**
- ⚠️ **Automatic Migration**: Planned but not yet implemented
- ✅ **Manual Migration Guide**: See [MIGRATION.md](../../MIGRATION.md) for manual migration steps
- ❌ **Multi-Root Workspaces**: Not supported - use single-folder workspaces only
- ℹ️ **Chat Features**: Will require separate MCP server installation

### Added (Implemented)

- **File-Based Configuration**: Support for `.bctb-config.json` with config discovery order (workspace → home directory → env vars)
- **Multi-Profile Support**: Manage multiple customer endpoints in single config file with profile switching
- **Config Discovery**: Automatic search for config files in multiple locations
- **Environment Variable Substitution**: Use `${VAR_NAME}` for secrets in config files
- **Profile Inheritance**: DRY configuration with base profiles using `extends` key
- **MCP Server Definition Provider**: Registers MCP server with VS Code Language Model API
- **Development Mode Detection**: Uses extension workspace for config in dev, user workspace in production
- **Enhanced Logging**: Shows active config file path, profile name, and connection settings on startup

### Added (In Progress - Not Working Yet)

- **Dual-Path Architecture**: Extension to execute queries directly via `TelemetryService` (no MCP required) - ❌ Command handlers not yet refactored
- **Automatic Migration**: Detection and migration of old settings - ❌ Migration UI not implemented, tests failing
- **Multi-Root Workspace Support**: Configuration for multi-root workspaces - ❌ Currently blocked, tests failing

### Changed

- **Configuration Architecture**: Migrated from VSCode settings (`bcTelemetryBuddy.*`) to `.bctb-config.json` file
- **MCP Integration**: MCP is now optional, only used for chat participant (@bc-telemetry-buddy)
- **Direct Command Execution**: Commands (Run KQL, Save Query) now use built-in `TelemetryService` instead of MCP
- **Package Structure**: MCP server separated into standalone package (monorepo: `packages/mcp/` and `packages/extension/`)
- **Workspace Path Resolution**: Fixed dev mode to use extension repo path instead of user's open workspace

### Fixed

- **Config Discovery Fallback**: Changed from if-else-if to if-if-if chain to properly try all config locations
- **Home Directory Config**: Support both `~/.bctb/config.json` (subfolder) and `~/.bctb-config.json` (file) formats
- **MCP Startup Errors**: Eliminated VSCode-specific error messages from MCP server (now generic)
- **Workspace Path in Dev**: Extension correctly uses its own workspace in development, user workspace in production

### Deprecated

- **VSCode Settings**: Settings namespace `bcTelemetryBuddy.*` deprecated in favor of `.bctb-config.json`
  - Still functional for backward compatibility but will be removed in future versions
  - Migrate to `.bctb-config.json` using migration guide in [MIGRATION.md](../../MIGRATION.md)

### Documentation

- **Updated README.md**: Complete rewrite with v0.3.0 architecture, migration guide, new configuration format
- **Updated UserGuide.md**: Added "What's New in v0.3.0", architecture explanation, comprehensive migration section
- **Created MIGRATION.md**: Detailed upgrade guide with automatic/manual migration paths, troubleshooting, rollback instructions
- **Updated DesignWalkthrough.md**: Documented architecture evolution and refactoring decisions

### Migration Notes

**For Existing Users (v0.2.x → v0.3.0):**

1. **Direct Commands Work Immediately**: All commands (Run KQL Query, Save Query, etc.) continue working without changes
2. **Chat Features Require MCP**: If you use `@bc-telemetry-buddy` in chat, you'll need to install the standalone MCP server
3. **Configuration Migration**: Old VSCode settings still work but are deprecated
   - Recommended: Migrate to `.bctb-config.json` following [MIGRATION.md](../../MIGRATION.md)
   - Extension will continue supporting old settings for backward compatibility

**For New Users:**

1. Install extension from Marketplace
2. Run Setup Wizard (creates `.bctb-config.json`)
3. Configure authentication and endpoints
4. Start using direct commands immediately
5. Optional: Install MCP server for chat features

See [MIGRATION.md](../../MIGRATION.md) for complete migration instructions and troubleshooting.

### Known Issues

**Test Failures (21 of 178 tests failing):**

1. **MCP Migration Tests (8 failures)**:
   - Multi-root workspace config creation not working
   - Migration validation failing
   - Workspace setting removal tests failing

2. **Extension Command Handler Tests (13 failures)**:
   - `runKQLQueryCommand` not calling TelemetryService (expects 1 call, receives 0)
   - `runKQLFromDocumentCommand` not executing queries
   - `runKQLFromCodeLensCommand` not using TelemetryService
   - `saveQueryCommand` not calling TelemetryService
   - Error handling tests failing (no error messages shown)
   - Retry logic not implemented (maxRetries config not used)

3. **Architectural Issues**:
   - Command handlers still scaffolded but not fully integrated with TelemetryService
   - MCP client being called instead of direct TelemetryService execution
   - Configuration loading incomplete for TelemetryService initialization

**Current Limitations:**
- ❌ **Multi-Root Workspaces**: Explicitly not supported (blocked in v0.2.22, migration tests failing)
- ❌ **Automatic Migration UI**: Planned but not implemented (no notification shown to users)
- ❌ **Direct Command Execution**: Command handlers exist but don't work without MCP server yet
- ⚠️ **MCP Package Not Published**: Standalone MCP server not yet available on NPM

**Workarounds:**
- Use single-folder workspaces only (not multi-root)
- Manual migration required (follow [MIGRATION.md](../../MIGRATION.md))
- MCP server still required for all commands (direct execution not working)
- Install MCP from local build: `cd packages/mcp && npm link`

### Technical Details

**Architecture Changes:**
- Moved shared business logic to bundled code (shared at build time, not runtime)
- MCP server now standalone with CLI commands (`bctb-mcp start`, `bctb-mcp init`, `bctb-mcp validate`)
- Extension includes built-in `TelemetryService` for direct KQL execution
- MCP integration via Language Model API server definition providers

**Config Discovery Order:**
1. `--config` CLI argument (MCP only)
2. `.bctb-config.json` in current directory
3. `.bctb-config.json` in workspace root (`BCTB_WORKSPACE_PATH` env var)
4. `.bctb/config.json` OR `.bctb-config.json` in user home directory
5. Environment variables (fallback)

**Breaking Change Details:**
- Old settings namespace: `bcTelemetryBuddy.appInsights.appId`, `bcTelemetryBuddy.kusto.clusterUrl`
- New config format: `.bctb-config.json` with keys `applicationInsights.appId`, `kusto.clusterUrl`
- MCP no longer bundled with extension (separate NPM package)
- Chat features require separate MCP installation

## [0.2.24] - 2025-11-16

### Fixed
- **MCP server path resolution**: Fixed issue #56 where MCP server failed to start in installed extensions due to incorrect path resolution using `__dirname` instead of `extensionContext.extensionPath`

## [0.2.23] - 2025-11-16

### Changed
- Enhanced chatmode documentation with data visualization guidelines and preferred approaches for better query results presentation

### Fixed
- Improved resource-scoped configuration for MCP client and commands to ensure proper workspace folder context

## [0.2.22] - 2025-11-01

### Added
- **Multi-root workspace blocking**: Setup Wizard now detects and blocks multi-root workspaces with clear error message and instructions to use single-folder workspace
- **Settings pre-fill**: Setup Wizard now pre-fills existing settings when revealing the panel, improving user experience when reconfiguring
- **Reload prompt**: Added prompt to reload VS Code after saving settings to ensure MCP server picks up configuration changes

### Fixed
- **Configuration reading**: Fixed configuration reading to use resource-scoped approach for workspace folder settings, ensuring settings are read correctly when saved to `.vscode/settings.json`
- **Settings save location**: Ensured settings are always saved to `ConfigurationTarget.WorkspaceFolder` (`.vscode/settings.json`) for proper single-folder workspace support

### Changed
- **Documentation**: Updated UserGuide.md to clearly document multi-root workspace non-support with examples

## [0.2.21] - 2025-10-29

### Changed
- Cache behavior aligned with backend: the cache folder `.vscode/.bctb/cache` is now created lazily only when a cache entry is written. This prevents the folder from appearing in workspaces where caching is not used.
- No changes required for extension commands: existing "Clear Cache" and "Show Cache Statistics" commands already handle non-existent cache directories gracefully.

## [0.2.20] - 2025-10-22

### Added
- **Multiple chatmodes**: Extended chatmode installation to support multiple specialized chatmodes instead of single chatmode
- **BC Performance Analysis chatmode**: Added comprehensive chatmode for systematic performance analysis focusing on deadlocks, lock timeouts, slow queries, and missing indexes with detailed documentation structure guidelines

### Changed
- **Chatmode architecture**: Refactored chatmode system - created `chatmodeDefinitions.ts` to centralize chatmode definitions, updated `installChatmodesCommand` to install all chatmodes from array
- **Chatmode naming**: Renamed BC Performance Analysis chatmode file to `BCTelemetryBuddy.BCPerformanceAnalysis.chatmode.md` for consistent naming with main chatmode
- **Setup wizard**: Updated chatmode installation UI to show "Install chatmodes (2 specialized modes)" and corrected usage instructions to use `@workspace` selector instead of `#` prefix

## [0.2.19] - 2025-10-22

### Fixed
- **Settings validation**: Fixed config key mismatch causing "No BCTB settings found" warning after setup - validation now checks correct `bctb.mcp.*` keys that setup wizard actually creates (was incorrectly checking obsolete `bcTelemetryBuddy.*` namespace)

## [0.2.18] - 2025-10-22

### Changed
- **Queries folder**: Implemented lazy creation - queries folder only created when first query is saved, not on workspace activation

## [0.2.17] - 2025-10-20

### Changed
- **Event catalog**: Improved shortMessage logic for unique event identification - converted nested iif() to case() statement with specific handlers for RT0048, LC0169, and LC0170 events to prevent duplicate eventId entries in catalog

## [0.2.16] - 2025-10-20

### Fixed
- **Release process**: Simplified release workflow - manually update package.json version and CHANGELOG, commit, then create GitHub release

## [0.2.15] - 2025-10-20

### Fixed
- **Release process**: Corrected release workflow to ensure version bump and CHANGELOG updates are committed together in a single atomic commit

## [0.2.14] - 2025-10-20

### Fixed
- **First-run crash**: Extension now loads successfully in unconfigured workspaces instead of failing with "Process exited with code 1"
  - Root cause: MCP server validation threw exceptions when App Insights ID/Kusto URL were missing, preventing extension activation
  - Solution: MCP server gracefully handles incomplete configuration, starts in degraded mode with helpful error messages
  - Result: Setup wizard can be shown to new users, clear guidance provided when queries attempted without configuration
  - Related files: `packages/mcp/src/config.ts`, `packages/mcp/src/server.ts`

## [0.2.13] - 2025-10-20

### Fixed
- **CodeLens HTTP/stdio conflict**: Fixed "Run Query" button in .kql files throwing ECONNREFUSED errors
  - Root cause: Extension tried to use HTTP client (`http://localhost:52345`) but MCP server was running in stdio mode (for Copilot)
  - Solution: Added `BCTB_MODE=http` environment variable to force HTTP mode when `startMCP()` is called
  - Result: Two separate MCP instances now run independently - stdio for Copilot, HTTP for command palette commands
  - Related files: `packages/extension/src/extension.ts` (modified `startMCP()` function)

## [0.2.12] - 2025-10-20

### Added

#### Chat Participant Enhancements
- **Comprehensive system prompt** (4KB): Expert BC telemetry guidance with embedded KQL patterns, common schema knowledge, and BC-specific telemetry best practices
- **3-step workflow integration**: Guides users through "Identify Customer → Understand Events → Query/Analyze" methodology for structured telemetry investigation
- **Intent detection system**: Automatically distinguishes between information requests (provide knowledge/guidance) vs. data requests (execute queries), preventing unwanted tool execution for conceptual questions
- **6 slash commands**: `/patterns` (KQL templates), `/events` (event catalog), `/errors` (error analysis), `/performance` (performance patterns), `/customer` (customer-specific analysis), `/explain` (query explanations)
- **Tool awareness**: Participant automatically filters to BC Telemetry Buddy tools (mcp_bc_telemetry__*) from global tool pool, providing targeted MCP integration
- **Response style guidelines**: Professional tone with KQL code blocks, tabular data formatting, and educational explanations

#### Chatmode Installation
- **Command**: `BC Telemetry Buddy: Install Chatmode` creates `.github/chatmodes/BCTelemetryBuddy.chatmode.md` with YAML frontmatter
- **Setup wizard integration**: Added Step 5 checkbox (checked by default) with "Chatmode installed" status feedback
- **Non-destructive operations**: Installation checks for existing chatmode file and shows informational message instead of overwriting
- **File structure**: YAML frontmatter with chatmode name, description, BC Telemetry expert system instructions matching chat participant capabilities

#### Documentation
- **README.md**: Added "GitHub Copilot Integration" section comparing chat participant vs. chatmode, documented 3 usage methods (participant with @, chatmode with #, workspace agent), included slash commands reference table
- **UserGuide.md**: Comprehensive "GitHub Copilot Integration" section with detailed setup instructions for both interaction modes, chatmode installation steps (wizard vs. manual command), feature comparison table, slash commands guide with examples, customization instructions for modifying chatmode behavior

### Fixed

#### Test Suite
- **Chat participant tests**: Updated `chatParticipant.test.ts` for MCP tool naming refactor
  - Updated mock `vscode.lm.tools` array with 12 tools using `mcp_bc_telemetry__*` pattern (11 BC Telemetry tools + 1 unrelated tool)
  - Changed 6 tool name expectations: `bctb_get_event_catalog` → `mcp_bc_telemetry__get_event_catalog` (and 5 others)
  - Updated system prompt checks: `'Workflow for Analysis'` → `'Understanding User Intent'` to match intent detection system
  - Result: All 111 tests passing across 7 test suites in 4.5 seconds

#### CI/CD Pipeline
- **Integration test compilation**: Fixed Ubuntu CI "Cannot find module ./dist/test/runTest.js" error
  - Added `compile-tests` script: `"tsc -p ./ --outDir dist"` to compile test runner files
  - Updated `test:integration` workflow: `"npm run build && npm run compile-tests && node ./dist/test/runTest.js"`
  - Previously only built extension bundle (src/extension.ts), now compiles all TypeScript including test infrastructure

#### Architecture
- **MCP dual-mode conflict resolution**: Disabled manual HTTP-based tool registrations (`registerLanguageModelTools`) that conflicted with stdio MCP server, removed `bctb_*` tool definitions from package.json
- **Tool result format**: Fixed OpenAI API compliance by changing from string array to `LanguageModelToolResultPart` with matching `callId` property
- **Tool naming pattern discovery**: Identified actual MCP tool naming pattern (`mcp_bc_telemetry__<tool_name>` with double underscores) vs. expected unprefixed names, updated all references

### Changed

- **MCP tool descriptions**: Updated 11 tool descriptions to promote discovery-first workflow emphasizing `get_event_catalog`, `get_event_field_samples`, and field prevalence analysis over direct query construction
- **.gitignore**: Added `.vscode-test/` (VSCode test-electron artifacts: cache, extensions, user data) and `*.tsbuildinfo` (TypeScript incremental build cache files)
- **Git tracking**: Removed `packages/extension/tsconfig.tsbuildinfo` (1MB+ build cache) from version control via `git rm --cached`

## [0.2.11] - 2025-10-20

### Changed
- CHANGELOG: Updated documentation format (superseded by v0.2.12)

## [0.2.10] - 2025-10-17

### Fixed
- Build process: fixed launcher.js not being included in VSIX due to silent copy failure. Created launcher.js as source file (not build artifact), updated MCP build to copy it to dist/, removed silent error handling from copy-mcp script.

## [0.2.9] - 2025-10-17

### Fixed  
- Release tagging: corrected v0.2.8 tag placement and re-released as v0.2.9 (v0.2.8 was already published to marketplace with wrong code).

## [0.2.8] - 2025-10-17

### Fixed
- VSIX installation: renamed `server.cjs` launcher to `launcher.js` to work around VSCode/vsce not properly extracting `.cjs` files from VSIX packages. The `.js` extension with CommonJS code works reliably across all VSCode installations.

### Changed
- MCP launcher: renamed from `server.cjs` to `launcher.js` while preserving CommonJS semantics to ensure reliable VSIX packaging and installation.

## [0.2.7] - 2025-10-17

### Fixed
- VSIX packaging: ensured `server.cjs` launcher is included in extension package. The v0.2.6 release was missing this file because it was created after the build step, causing marketplace installations to fail with "Cannot find module server.cjs" error.

## [0.2.6] - 2025-10-17

### Fixed
- MCP server runtime error: fixed "Dynamic require of 'path' is not supported" and "Cannot use import statement outside a module" errors that prevented marketplace-installed extension from starting MCP server. Added CommonJS launcher (`server.cjs`) that forces Node to treat entrypoint as CommonJS, ensuring bundled server loads correctly in all user environments.

### Changed
- MCP package: switched from ESM to CommonJS (`"type": "commonjs"`, esbuild `--format=cjs`) to eliminate bundler dynamic-require shims and ESM/CJS mismatches at runtime.
- Extension spawn: updated to prefer `mcp/dist/server.cjs` launcher for reliable MCP process startup.
- Test configuration: converted `jest.config.js` from ESM `export default` to CommonJS `module.exports` to match package.json type.
- Documentation: migrated logging system to GUID-based EntryIds for conflict-free concurrent prompt processing.

## [0.2.5] - 2025-10-17

### Fixed
- VSIX packaging: copy MCP bundle into the extension before packaging to avoid vsce "invalid relative path" errors when including sibling package files. Ensures marketplace .vsix contains `mcp/dist/server.js` and marketplace installs work correctly.

### Changed
- Release automation: validated conversational release workflow end-to-end (release script, tests, tag/push).

## [0.2.4] - 2025-10-17

### Fixed
- Release script: corrected git add/commit behavior to use monorepo root `package-lock.json` (no workspace lockfiles) so version bump commits succeed in monorepo setups.

## [0.2.3] - 2025-10-17

### Changed
- Release and CI reliability improvements: incremental fixes to packaging and release scripts for robust artifact publishing.

## [0.1.0] - 2025-10-15

### Added
- Project structure and configuration
- TypeScript setup with CommonJS for VSCode compatibility
- Package.json with extension manifest
- Configuration contributions for all settings
- Initial extension scaffold
- Commands: startMCP, runNLQuery, saveQuery, openQueriesFolder
- Workspace settings configuration
- MCP process lifecycle management
- Webview UI for query results
- GitHub Copilot integration (MCP tools registration)
- Output channel for logging
