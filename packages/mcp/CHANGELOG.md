# MCP Backend Changelog

All notable changes to the BC Telemetry Buddy MCP backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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