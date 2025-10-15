# BC Telemetry Buddy

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
npm test
```

### Development

```powershell
# Run MCP backend in watch mode
npm run dev:mcp

# Run extension in debug mode
npm run dev:extension
```

## Documentation

- [User Guide](docs/UserGuide.md) - Installation and usage
- [Design Walkthrough](docs/DesignWalkthrough.md) - Architecture and design decisions
- [Instructions](Instructions/Instructions.md) - Technical implementation details
- [MCP Changelog](packages/mcp/CHANGELOG.md) - MCP backend version history
- [Extension Changelog](packages/extension/CHANGELOG.md) - Extension version history

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development guidelines.

## License

MIT
