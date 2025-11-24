# MCP Backend Changelog

All notable changes to the BC Telemetry Buddy MCP backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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