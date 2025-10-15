# MCP Backend Changelog

All notable changes to the BC Telemetry Buddy MCP backend will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Initial MCP backend scaffold
- Express server with JSON-RPC protocol support
- MSAL authentication (device_code and client_credentials flows)
- File-based caching with TTL
- Kusto/Application Insights query execution
- Saved queries management (.kql files)
- External references fetching (GitHub API)
- PII sanitization (opt-in)
- Recommendations engine (heuristics-based)

## [0.1.0] - 2025-10-15

### Added
- Project structure and configuration
- TypeScript setup with ES2022 + ESM
- Jest testing framework
- Package.json with dependencies
