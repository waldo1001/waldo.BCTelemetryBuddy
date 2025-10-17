# VSCode Extension Changelog

All notable changes to the BC Telemetry Buddy VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
