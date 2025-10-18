# VSCode Extension Changelog

All notable changes to the BC Telemetry Buddy VSCode extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- MCP tool registration: Updated tool descriptions to reflect removal of natural language translation and promote discovery-first workflow with `get_event_catalog`, `get_event_field_samples`, and field prevalence analysis

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
