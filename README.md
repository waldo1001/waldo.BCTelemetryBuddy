# BC Telemetry Buddy

![CI](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CI/badge.svg)
![Release](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/Release/badge.svg)
![CodeQL](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CodeQL%20Security%20Analysis/badge.svg)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)

Query Business Central telemetry from VSCode using natural language with GitHub Copilot integration.

## Overview

BC Telemetry Buddy is a VSCode extension that provides an intuitive way to query Business Central telemetry data from Application Insights/Kusto. It combines:

- **🧙 Setup Wizard**: Step-by-step guided configuration with validation and testing
- **Natural Language Queries**: Ask questions in plain English using GitHub Copilot
- **MCP Backend**: Lightweight Model Context Protocol server for telemetry access
- **Event Discovery**: Browse telemetry catalog and schemas before querying
- **Query Library**: Save and organize queries by category and customer
- **Smart Context**: Automatically includes saved queries for better KQL generation
- **External References**: Pull KQL examples from GitHub repos and documentation

## ✨ Features

- **🧙 Setup Wizard**: Guided first-run configuration with Azure resource validation and connection testing
- **🔐 Flexible Authentication**: Azure CLI (recommended), Device Code, or Client Credentials
- **📊 Event Catalog & Schema Discovery**: Explore what telemetry events exist and their structure before querying
- **💾 Smart Caching**: File-based caching with configurable TTL (default 1 hour)
- **� Query Library**: Save queries organized by category; customer-specific queries automatically organized in `Companies/[CompanyName]/` folders
- **👁️ CodeLens Support**: "▶ Run Query" links appear in .kql files for one-click execution
- **🧠 Context-Aware**: Uses saved queries and external references for better KQL generation
- **�️ Tenant Mapping**: Map friendly company names to Azure tenant IDs for customer queries
- **🔒 Privacy-Focused**: Optional PII sanitization, workspace-scoped settings
- **🤖 Copilot Integration**: MCP tools available to GitHub Copilot for natural language telemetry analysis

## Quick Start

### 1. Install the Extension
Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=waldoBC.bctb) or search for "BC Telemetry Buddy" in VSCode Extensions.

### 2. Run Setup Wizard
Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
BC Telemetry Buddy: Setup Wizard
```

The wizard guides you through:
- **Azure Configuration**: Connect to your tenant and Application Insights
- **Authentication**: Choose Azure CLI (recommended), Device Code, or Client Credentials
- **Connection Testing**: Validate your configuration before saving
- **Quick Tips**: Get started with @workspace Copilot queries

### 3. Start Querying
**With Copilot** (recommended):
```
@workspace Show me all errors from BC in the last 24 hours
@workspace What are the slowest operations this week?
@workspace Find login failures for customer Contoso
```

**With Command Palette**:
- `BC Telemetry Buddy: Run KQL Query` - Execute direct KQL or natural language
- Create a `.kql` file and click "▶ Run Query" CodeLens link

### 4. Save & Organize Queries
Queries are automatically organized:
- **Generic queries**: `queries/[Category]/[QueryName].kql`
- **Customer queries**: `queries/Companies/[CompanyName]/[Category]/[QueryName].kql`

See [docs/UserGuide.md](docs/UserGuide.md) for detailed configuration and advanced features.

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
