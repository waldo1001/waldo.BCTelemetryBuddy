# MCP Backend Changelog

All notable changes to the BC Telemetry Buddy MCP backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Timespan Detection for Duration Fields**: Enhanced field analysis to detect and guide agents about Business Central telemetry duration fields
  - Added `isTimespanValue()` helper that detects timespan format (`dd.hh:mm:ss.fffffff` or `hh:mm:ss.fffffff`)
  - Automatically flags duration fields (executionTime, totalTime, serverTime, etc.) as probable timespans
  - Excludes fields with explicit millisecond indicators (Ms, InMs, Milliseconds, _ms) from timespan warnings
  - Provides KQL conversion formula for timespans to milliseconds: `toreal(totimespan(fieldName))/10000`
  - Updated tool descriptions to emphasize verification using sample data rather than assumptions
  - Recommendations now distinguish between "VERIFIED TIMESPAN" (format confirmed) and "VERIFY FORMAT" (needs checking)
  - Added comprehensive tests for timespan detection and millisecond indicator exclusion

## [2.2.9] - 2025-12-08

### Fixed
- **Telemetry Initialization Errors**: Fixed "Failed to create URL" errors appearing in MCP stderr logs
  - Added validation to reject empty or whitespace-only telemetry connection strings before Application Insights SDK initialization
  - Prevents URL parsing errors when `TELEMETRY_CONNECTION_STRING` is empty in development mode
  - Added comprehensive tests for telemetry initialization with invalid connection strings
  - Resolves stderr pollution that could interfere with MCP tool availability detection

## [2.2.8] - 2025-12-04

### Changed
- **Discovery Tool Descriptions**: Enhanced tool descriptions with mandatory workflow steps and clearer guidance
  - Added 🚨 MANDATORY FIRST STEP markers to `get_event_catalog()` - must be called before writing KQL
  - Added 🚨 MANDATORY SECOND STEP markers to `get_event_field_samples()` - required for accurate field names
  - Added ⚠️ IMPORTANT markers to `get_tenant_mapping()` - emphasizes tenant ID vs company name filtering
  - Added ⚠️ EXECUTE KQL QUERY marker to `query_telemetry()` - only use after discovery tools
  - Improved parameter descriptions with clearer defaults and examples
  - Helps prevent common errors like guessing event IDs or using wrong field names

## [2.2.7] - 2025-11-26

### Fixed
- **Stdout Pollution in stdio Mode**: Fixed remaining console.log calls in config.ts and auth.ts that polluted stdout during stdio initialization, causing "Tool is currently disabled by the user" errors
  - Added `silent` parameter to `loadConfigFromFile()` to suppress logs during stdio mode startup
  - Changed diagnostic logs in auth.ts from `console.log()` to `console.error()` for stderr output
  - Fixes frequent "tools disabled" errors reported in [#63](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/63)
  - All stdio communication now strictly JSON-RPC on stdout, diagnostics on stderr
- **Config Discovery Tests**: Fixed Claude Desktop workflow tests by clearing BCTB_WORKSPACE_PATH env var in tests that validate config file discovery
- **MCP Inspector Testing**: Added documentation in copilot-instructions.md for testing MCP server with MCP Inspector including required environment variables

## [2.2.6] - 2025-11-25

### Fixed
- **stdio Mode Logging**: Fixed MCP server writing diagnostic logs to stdout, which broke JSON-RPC protocol in stdio mode ([#63](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/63))
  - All server diagnostic logs now use `console.error()` to write to stderr
  - stdout is reserved exclusively for JSON-RPC messages (parseable JSON)
  - Fixes `SyntaxError: Unexpected token...` errors in Claude Desktop and other MCP clients
  - Impact: Server now complies with MCP stdio transport specification
  - Files changed: `config.ts` (4 calls), `server.ts` (~30 calls)
  - CLI commands unchanged (still use stdout appropriately for user output)

### Added
- **Logging Tests**: Added comprehensive test suite for stdio mode logging behavior
  - `stdio-logging.test.ts`: 5 tests verifying source code uses correct logging methods
  - `console-redirection.test.ts`: 7 unit tests for console redirection mechanism
  - All tests pass, code coverage: 92.85% (exceeds 80% target)

## [2.2.5] - 2025-11-25

### Changed
- **Installation ID Storage**: Installation IDs now stored in user profile (`~/.bctb/installation-id`) instead of workspace
  - Matches VS Code extension behavior (uses user storage, not workspace)
  - Migration: Automatically moves existing `.bctb-installation-id` files from workspace to user profile
  - Cleanup: Always removes workspace `.bctb-installation-id` files on startup
  - Why: Prevents installation ID files from appearing in customer workspaces/repos

## [2.2.4] - 2025-11-24

### Changed
- **Debug Logging**: Added debug output to config loading to help diagnose workspace path issues
  - Shows which config file is loaded and BCTB_WORKSPACE_PATH value
  - Logs ${workspaceFolder} placeholder expansion for troubleshooting

## [2.2.3] - 2025-11-24

### Fixed
- **Config Loading**: Fixed config file loading regression introduced in v2.2.1 (commit 8fe2926)
  - `workspacePath` now correctly falls back to `BCTB_WORKSPACE_PATH` environment variable when not specified in config file
  - `${workspaceFolder}` placeholder in config files now properly expands to `BCTB_WORKSPACE_PATH`
  - Issue: Config validation became stricter but config loading didn't respect env vars properly
  - Config files work again when used with VS Code extension

## [2.2.2] - 2025-11-24

### Fixed
- **CI Tests**: No functional changes, version bump to match extension release

### Fixed
- **Config Validation**: Fixed `bctb-mcp validate` requiring `BCTB_WORKSPACE_PATH` environment variable even when config file contains `workspacePath`
  - Validation now checks actual config value instead of environment variable
  - Allows standalone usage with config file only (no env vars needed)

### Added
- **Claude Desktop Tests**: Added comprehensive test suite for Claude Desktop integration workflows
  - 23 new tests covering setup, config discovery, multi-profile, auth flows, and error handling
  - Validates all Claude Desktop usage scenarios and edge cases
  - Test file: `src/__tests__/claude-workflows.test.ts`

## [2.2.0] - 2025-11-24

### Changed
- **Telemetry Clarification**: Updated documentation to clarify MCP server telemetry behavior
  - MCP server collects anonymous usage telemetry (tool invocations, performance metrics, errors)
  - Uses same privacy-focused approach as extension (hashed IDs, no PII, no query content)
  - Telemetry sent to BC Telemetry Buddy Application Insights (not customer telemetry databases)
  - Helps improve tool reliability and identify common issues
  - Standalone MCP users (Claude Desktop, etc.) can disable by removing connection string from environment
  - Added telemetry disclosure section to README matching extension documentation

## [2.1.2] - 2025-11-22

### Fixed

- **Bundled Server Startup**: Fixed bundled server.js being executed twice causing startup failures
  - Removed auto-execution code (`require.main === module` check) from server.ts
  - Server now only starts when explicitly called via `startServer()` function
  - Prevents CLI error messages when launched from VSCode extension
  - Resolves issue where bundled server would exit with code 1 in VSCode

## [2.1.1] - 2025-11-22

### Added

- **Automatic Update Notifications**: MCP server checks for updates on startup
  - Queries npm registry for latest version asynchronously
  - Logs prominent warning banner when updates are available
  - Shows current version → latest version
  - Provides update instructions (npm install and VSCode command)
  - Non-blocking with 5-second timeout to avoid delaying startup
  - Silently fails on network errors (won't break offline usage)

### Fixed

- **Graceful Config Loading**: Server now handles missing config files gracefully
  - `loadConfigFromFile()` returns `null` instead of throwing when no config is found
  - Server falls back to environment variables when no config file exists
  - Removed problematic catch block that caused infinite loop on startup
  - Server shows clear configuration warnings in logs but continues running
- **CI Build**: Fixed GitHub Actions build error
  - Added version generation script to `build:server` npm script
  - Both server and CLI builds now generate version file before bundling

## [2.1.0] - 2025-11-21

### Added

- New features and improvements (minor release)

### Changed

- **Graceful startup with incomplete configuration**: MCP server now starts successfully even when configuration is incomplete, instead of failing with exit code 1
- Configuration validation moved from startup (throwing errors) to runtime (returning helpful error messages through MCP interface)
- Error messages are now MCP-client agnostic, providing guidance for both VSCode extension users and standalone MCP client users (Claude Desktop, etc.)

### Fixed

- Server no longer fails to start in workspaces without BC Telemetry Buddy configuration
- Missing `BCTB_WORKSPACE_PATH` now uses `process.cwd()` as fallback instead of throwing error

## [2.0.5] - 2025-11-19

### Fixed

- **Build Process**: Added pretest script to generate version.ts before running tests
- **CI Pipeline**: Fixed test compilation errors in CI environment

## [2.0.4] - 2025-11-19

### Fixed

- **CLI Version Display**: `bctb-mcp --version` now shows correct package version instead of hardcoded v1.0.0
  - Added build script to auto-generate version.ts from package.json
  - CLI now reads version from generated file that's bundled at build time

## [2.0.3] - 2025-11-18

### Changed

- No MCP backend changes in this release (extension-only fixes for update command and release notes)

## [2.0.2] - 2025-11-18

### 🚨 BREAKING CHANGES

**First standalone release of BC Telemetry Buddy MCP Server**

This is the first release of the MCP server as a standalone NPM package, separated from the VSCode extension.

**Major Changes:**
- **Standalone Package**: Published as `bc-telemetry-buddy-mcp` on NPM
- **CLI Interface**: New `bctb-mcp` CLI with commands: `start`, `init`, `validate`, `test-auth`
- **File-Based Configuration**: Uses `.bctb-config.json` instead of environment variables
- **Multi-Profile Support**: Manage multiple customer environments in single config file
- **Shared Core**: Uses `@bctb/shared` library for business logic (bundled at build time)

### Added

- **CLI Commands**: `bctb-mcp start`, `bctb-mcp init`, `bctb-mcp validate`, `bctb-mcp test-auth`
- **File-Based Configuration**: Support for `.bctb-config.json` with config discovery
- **Multi-Profile Support**: Named profiles with inheritance and environment variable substitution
- **Profile Switching**: Support for `--profile` flag and `BCTB_PROFILE` environment variable
- **Config Schema**: JSON schema for `.bctb-config.json` validation
- **Standalone Mode**: Can run independently without VSCode extension

### Changed

- **Architecture**: Refactored to use `@bctb/shared` library for core functionality
- **Configuration**: Migrated from environment variables to file-based config
- **Distribution**: Published to NPM for global installation (`npm install -g bc-telemetry-buddy-mcp`)

### Migration Notes

- See [MIGRATION.md](../../MIGRATION.md) for upgrade guide from bundled v0.2.x
- Extension v1.0.0+ offers automatic MCP installation and configuration
- Old environment variable config still supported as fallback

## [0.2.22] - 2025-11-01

### Changed
- No MCP backend changes in this release (extension-only changes for workspace validation and configuration handling)

## [0.2.21] - 2025-10-29

### Changed
- Cache folder creation made lazy: `.vscode/.bctb/cache` is no longer created at server startup. It's created only on first cache write.
- `clear()` and `cleanupExpired()` now return early if the cache directory does not exist, avoiding unnecessary filesystem operations.

## [0.2.20] - 2025-10-22

### Changed
- No MCP backend changes in this release (extension-only feature for multiple chatmodes)

## [0.2.19] - 2025-10-22

### Fixed
- No MCP backend changes in this release (extension-only fix for settings validation)

## [0.2.18] - 2025-10-22

### Changed
- **Queries folder**: Implemented lazy creation - queries folder only created when first query is saved, not on QueriesService initialization

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

### Added
- `get_event_field_samples` tool: Analyzes customDimensions structure for specific event IDs with field types, occurrence rates, sample values, and ready-to-use KQL templates
- `get_event_catalog` enhancement: Added `includeCommonFields` parameter that analyzes field prevalence across events, categorizing fields into Universal (80%+), Common (50-79%), Occasional (20-49%), and Rare (<20%) with type detection and actionable recommendations
- Dynamic event category lookup: Analyzes event messages and metadata to determine appropriate categorization (Lifecycle, Performance, Security, Error, Integration, Configuration, Custom)
- Message field priority in event analysis: Enhanced custom event categorization by analyzing actual telemetry message content

### Changed
- **BREAKING**: Removed natural language translation from `query_telemetry` tool - removed `nl` parameter and all pattern-matching logic. Users should use discovery tools (`get_event_catalog`, `get_event_field_samples`) to understand telemetry structure before writing KQL queries
- `query_telemetry` now only accepts explicit KQL queries (no NL translation)
- Tool descriptions updated to guide users toward data-driven discovery workflow

### Fixed
- **First-run experience**: MCP server now starts gracefully with incomplete configuration instead of exiting with code 1, allowing setup wizard to guide new users through configuration. `validateConfig()` returns errors array instead of throwing exceptions, enabling degraded mode with helpful error messages directing users to setup wizard.

### Removed
- `translateNLToKQL` method and supporting pattern-matching code (unreliable keyword-based translation that misled GitHub Copilot)

## [0.2.1] - 2025-10-17

### Changed
- Launcher: renamed from `server.cjs` to `launcher.js` to ensure reliable VSIX packaging and installation across all VSCode versions. Preserves CommonJS semantics while using `.js` extension that VSCode handles correctly.

## [0.2.0] - 2025-10-17

### Fixed
- Marketplace bundling: bundle MCP server into a single `dist/server.js` (esbuild) and ensure the extension copies the bundle into `packages/extension/mcp/dist/server.js` before packaging. Fixes runtime errors in marketplace installs where MCP couldn't be found and ensures the MCP server runs without requiring separate node_modules in the published extension.

## [0.1.0] - 2025-10-15

### Added
- Project structure and configuration
- TypeScript setup with ES2022 + ESM
- Jest testing framework
- Package.json with dependencies
- Initial MCP backend scaffold
- Express server with JSON-RPC protocol support
- MSAL authentication (device_code and client_credentials flows)
- File-based caching with TTL
- Kusto/Application Insights query execution
- Saved queries management (.kql files)
- External references fetching (GitHub API)
- PII sanitization (opt-in)
- Recommendations engine (heuristics-based)