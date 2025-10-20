# VSCode Extension Changelog

All notable changes to the BC Telemetry Buddy VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
