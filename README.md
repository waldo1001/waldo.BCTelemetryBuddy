# BC Telemetry Buddy

![CI](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CI/badge.svg)
![Release](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/Release/badge.svg)
![CodeQL](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CodeQL%20Security%20Analysis/badge.svg)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)

Query Business Central telemetry from VSCode using natural language with GitHub Copilot integration.

## Overview

BC Telemetry Buddy is a VSCode extension that provides an intuitive way to query Business Central telemetry data from Application Insights/Kusto. It combines:

- **Natural Language Queries**: Ask questions in plain English using GitHub Copilot
- **MCP Backend**: Lightweight Model Context Protocol server for telemetry access
- **Self-Learning**: Save and reuse queries with automatic context building
- **External References**: Pull KQL examples from GitHub repos and documentation
- **Recommendations**: Get actionable insights from your telemetry data

## Features

- 🔐 **Easy Authentication**: Device code flow (no Azure setup) or client credentials
- 💾 **Smart Caching**: File-based caching with configurable TTL
- 📊 **Rich Visualization**: Tables and charts in webview UI
- 🧠 **Context-Aware**: Uses saved queries and external references for better KQL generation
- 🔒 **Privacy-Focused**: Optional PII sanitization, workspace-scoped settings
- 🤖 **Copilot Integration**: Query telemetry directly from GitHub Copilot Chat

## Quick Start

See [docs/UserGuide.md](docs/UserGuide.md) for installation and setup instructions.

## Development

This is a monorepo containing:

- `packages/mcp/` - MCP backend server (TypeScript + Express)
- `packages/extension/` - VSCode extension (TypeScript)

### Prerequisites

- Node.js 18+
- npm 9+

### Build

```powershell
npm install
npm run build
```

### Run Tests

```powershell
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage --workspace=packages/mcp
npm run test:coverage --workspace=packages/extension
```

### Development

```powershell
# Run MCP backend in watch mode
npm run dev --workspace=packages/mcp

# Run extension in debug mode (or press F5 in VSCode)
npm run dev --workspace=packages/extension
```

## CI/CD

This project uses GitHub Actions for continuous integration and deployment:

- **CI**: Automated testing on Node.js 18.x/20.x across Ubuntu/Windows/macOS
- **Security**: CodeQL analysis and dependency scanning
- **Release**: Automated publishing to VS Code Marketplace and GitHub Releases

See [.github/workflows/README.md](.github/workflows/README.md) for workflow documentation.

## Documentation

- [User Guide](docs/UserGuide.md) - Installation and usage
- [E2E Test Script](docs/E2E-TestScript.md) - Manual testing guide
- [Design Walkthrough](docs/DesignWalkthrough.md) - Architecture and design decisions
- [Instructions](Instructions/Instructions.md) - Technical implementation details
- [Workflow Documentation](.github/workflows/README.md) - CI/CD setup and usage
- [MCP Changelog](packages/mcp/CHANGELOG.md) - MCP backend version history
- [Extension Changelog](packages/extension/CHANGELOG.md) - Extension version history

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Follow our coding standards (SOLID principles, 70% test coverage)
4. Submit a pull request with tests and documentation

## License

MIT
