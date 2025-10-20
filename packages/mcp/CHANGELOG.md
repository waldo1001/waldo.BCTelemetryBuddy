# MCP Backend Changelog

All notable changes to the BC Telemetry Buddy MCP backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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