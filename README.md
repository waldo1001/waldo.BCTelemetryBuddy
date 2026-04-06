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
- **Optional MCP Backend**: Lightweight Model Context Protocol server for Copilot chat features (v2.2.9)
- **Standalone Execution**: Run queries directly from Command Palette without MCP
- **Event Discovery**: Browse telemetry catalog and schemas before querying
- **Query Library**: Save and organize queries by category and customer
- **Smart Context**: Automatically includes saved queries for better KQL generation
- **External References**: Pull KQL examples from GitHub repos and documentation

## ✨ Features

- **🧙 Setup Wizard**: Guided first-run configuration with Azure resource validation and connection testing
- **🔐 Flexible Authentication**: VS Code (easiest, recommended), Azure CLI, Device Code, or Client Credentials
- **📊 Event Catalog & Schema Discovery**: Explore what telemetry events exist and their structure before querying
- **💾 Smart Caching**: File-based caching with configurable TTL (default 1 hour)
- **📁 Embedded Resources**: MCP resource support — agents can request query results as file references (CSV/JSON) for code interpreter processing of large datasets
- **📚 Community Knowledge Base**: Two-layer KB (community articles from GitHub + local patterns). Browse via `BC Telemetry Buddy: Manage Knowledge Base`. MCP tools `get_knowledge` / `save_knowledge` let agents find proven KQL patterns before writing from scratch; contributions create a GitHub issue — no fork required
- **� Query Library**: Save queries organized by category; customer-specific queries automatically organized in `Companies/[CompanyName]/` folders
- **👁️ CodeLens Support**: "▶ Run Query" links appear in .kql files for one-click execution
- **🧠 Context-Aware**: Uses saved queries and external references for better KQL generation
- **🗺️ Tenant Mapping**: Map friendly company names to Azure tenant IDs for customer queries
- **🔒 Privacy-Focused**: Optional PII sanitization, workspace-scoped settings
- **🤖 Chat Participant**: `@bc-telemetry-buddy` in GitHub Copilot Chat for expert BC telemetry analysis with MCP tool integration
- **💬 Agent**: `#BCTelemetryBuddy` activates expert mode in Copilot Chat with specialized BC telemetry knowledge, KQL patterns, and systematic workflow guidance
- **🔍 Show Diagnostics**: `BC Telemetry Buddy: Show Diagnostics` generates a full diagnostic report (version, config state, MCP health) with one-click copy-to-clipboard

## Quick Start

### 1. Install the Extension
Install from the [Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy) or search for "BC Telemetry Buddy" in VSCode Extensions.

### 2. Run Setup Wizard ⭐
**First-time users: Start here!** Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) and run:
```
BC Telemetry Buddy: Setup Wizard
```

The 5-step wizard guides you through:
- **Step 1 - Workspace Check**: Ensures you have a workspace folder open
- **Step 2 - Azure Configuration**: Enter your tenant ID and Application Insights details
- **Step 3 - Authentication**: Choose VS Code (easiest, recommended), Azure CLI, Device Code, or Client Credentials
- **Step 4 - Connection Testing**: Validates settings and tests your connection with a sample query
- **Step 5 - Complete**: Saves settings and provides quick-start tips, including a "📚 Knowledge Base" button to open the KB viewer

**Optional**: The wizard can also install the agent file (`.github/agents/BCTelemetryBuddy.agent.md`) for enhanced Copilot Chat integration.

**No manual configuration needed!** The wizard validates everything and saves to `.vscode/settings.json` automatically.

### 3. Start Querying

**With Chat Participant**:
Use `@bc-telemetry-buddy` in GitHub Copilot Chat for expert BC telemetry analysis:
```
@bc-telemetry-buddy show me all errors from the last 24 hours
@bc-telemetry-buddy analyze performance for customer Contoso
@bc-telemetry-buddy /patterns  # Get KQL pattern examples (no query execution)
```

Available slash commands:
- `/patterns` - Common KQL patterns and best practices
- `/events` - BC event types and categories
- `/errors` - Error analysis techniques
- `/performance` - Performance analysis guidance
- `/customer` - Customer-specific analysis workflow
- `/explain` - Explain concepts or provide examples

**With Agent** (optional enhanced mode):
Activate `#BCTelemetryBuddy` in Copilot Chat for expert mode with comprehensive BC telemetry knowledge:
```
#BCTelemetryBuddy show me all errors from last 24 hours
#BCTelemetryBuddy analyze performance issues for Contoso
```

To install agent:
- **Option 1**: Check the box in Setup Wizard Step 5 (automatic)
- **Option 2**: Run command `BC Telemetry Buddy: Install Agents` (manual)
- After installation, reload VS Code to activate

**With @workspace** (follows systematic discovery workflow):
```
@workspace Show me all errors from BC in the last 24 hours
@workspace What are the slowest operations this week?
@workspace Find login failures for customer Contoso
```

Copilot automatically follows this workflow:
1. **Discover Events**: Calls Event Catalog to find relevant telemetry event IDs
2. **Understand Schema**: Calls Event Schema to see available fields for each event
3. **Check Saved Queries**: Searches your workspace for similar existing patterns
4. **Execute Query**: Generates and runs the KQL query
5. **Display Results**: Shows formatted results with recommendations

**With Command Palette**:
- `BC Telemetry Buddy: Run KQL Query` - Execute direct KQL or natural language
- Create a `.kql` file and click "▶ Run Query" CodeLens link above queries

### 4. Save & Organize Queries
Queries are automatically organized:
- **Generic queries**: `queries/[Category]/[QueryName].kql`
- **Customer queries**: `queries/Companies/[CompanyName]/[Category]/[QueryName].kql`

See [docs/UserGuide.md](docs/UserGuide.md) for detailed configuration and advanced features.

## 📦 Packages

- **[VSCode Extension](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)** - BC Telemetry Buddy extension for Visual Studio Code ([source](./packages/extension/))
- **[MCP Server](https://www.npmjs.com/package/bc-telemetry-buddy-mcp)** - Model Context Protocol server for AI assistants ([source](./packages/mcp/))
- **Shared Library** - Core business logic (private package, bundled into extension and MCP) ([source](./packages/shared/))

## Development

This is a monorepo containing:

- `packages/mcp/` - MCP backend server (TypeScript)
- `packages/extension/` - VSCode extension (TypeScript)
- `packages/shared/` - Shared core library (TypeScript)

### Prerequisites

- Node.js 20+
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

## Usage Telemetry

BC Telemetry Buddy collects anonymous usage telemetry to help improve the extension. This is **separate from** the Business Central telemetry data you query.

**What's Collected:**
- Extension activation/deactivation events
- Command execution (e.g., "Run KQL Query", "Setup Wizard")
- Feature usage patterns (query types, authentication methods)
- Error events with stack traces (for debugging)
- Performance metrics (query execution time, MCP startup time)

**What's NOT Collected:**
- Your KQL queries or query results
- Customer names, company names, or business data
- Personally identifiable information (PII)
- Azure credentials or connection strings
- Application Insights data you're querying

**Privacy:**
- All telemetry is anonymized using hashed session IDs
- Data is stored in a separate Azure Application Insights resource (not your BC telemetry)
- Used exclusively for product improvement and debugging
- Follows Microsoft's data collection practices

**Disable Telemetry:**
Set VS Code's global telemetry setting:
```json
{
  "telemetry.telemetryLevel": "off"
}
```

BC Telemetry Buddy respects this setting - when VS Code telemetry is disabled, no usage data is collected.

## Documentation

- [User Guide](docs/UserGuide.md) - Installation and usage
- [E2E Copilot Test Script](docs/E2E-Copilot-TestScript.md) - GitHub Copilot integration testing guide
- [Design Walkthrough](docs/DesignWalkthrough.md) - Architecture and design decisions
- [Instructions](Instructions/Instructions.md) - Technical implementation details
- [Workflow Documentation](.github/workflows/README.md) - CI/CD setup and usage
- [Telemetry Design](Instructions/Telemetry-Design-and-Implementation.md) - Usage telemetry implementation
- [MCP Changelog](packages/mcp/CHANGELOG.md) - MCP backend version history
- [Extension Changelog](packages/extension/CHANGELOG.md) - Extension version history

## Contributing

We welcome contributions! Please:
1. Fork the repository
2. Create a feature branch
3. Follow our coding standards:
   - SOLID principles and clean code practices
   - Minimum 70% test coverage (enforced by CI)
   - TypeScript strict mode
   - Comprehensive JSDoc comments for public APIs
4. Write tests for all new features
5. Update documentation (UserGuide.md, component CHANGELOGs)
6. Submit a pull request with tests and documentation

See [.github/copilot-instructions.md](.github/copilot-instructions.md) for detailed development guidelines and workflow instructions.

## Supporting Development

BC Telemetry Buddy is free and open source (MIT). If you use it as part of paid work — client engagements, monitoring services, or commercial BC consulting — consider sponsoring to keep it growing.

→ **[Sponsor on GitHub](https://github.com/sponsors/waldo1001)** · See [BUDDY-PASS.md](BUDDY-PASS.md) for details.

## License

MIT
