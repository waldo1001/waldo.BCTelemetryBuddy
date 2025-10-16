# BC Telemetry Buddy - VSCode Extension

VSCode extension for querying Business Central telemetry with natural language support and GitHub Copilot integration.

## 🚀 Quick Start

1. **Install** from VSCode Marketplace (search for "BC Telemetry Buddy")
2. **Run Setup Wizard**: Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `BC Telemetry Buddy: Setup Wizard`
3. **Configure** your Azure resources (the wizard guides you through everything)
4. **Query**: Ask Copilot questions like "Show me all errors from BC in the last 24 hours"

The setup wizard automatically appears on first run and helps you configure:
- ✅ Azure tenant and Application Insights connection
- ✅ Authentication (Azure CLI recommended)
- ✅ Kusto cluster settings
- ✅ Optional features (query folders, caching, CodeLens)

## Features

- **🧙 Setup Wizard**: Step-by-step guided configuration with validation
- **Natural Language Queries**: Ask questions about your telemetry in plain English
- **KQL Support**: Write and execute KQL queries directly
- **GitHub Copilot Integration**: MCP tools available to Copilot for telemetry analysis
- **Query Management**: Save and reuse queries across your team
- **Rich Results**: View results in formatted tables with recommendations
- **Auto-Context**: Automatically includes saved queries and external references for better accuracy

## Commands

- `BC Telemetry Buddy: Setup Wizard` - **⭐ Start here!** Guided configuration wizard
- `BC Telemetry Buddy: Start MCP Server` - Manually start the MCP backend
- `BC Telemetry Buddy: Run Natural Language Query` - Query telemetry using natural language
- `BC Telemetry Buddy: Save Query` - Save a query for future use
- `BC Telemetry Buddy: Open Queries Folder` - Browse saved queries

## Configuration

The **Setup Wizard** (recommended) handles all configuration automatically.

For manual configuration, add to your workspace `.vscode/settings.json`:

```json
{
  "bcTelemetryBuddy.tenant.id": "your-azure-tenant-id",
  "bcTelemetryBuddy.appInsights.id": "your-app-insights-app-id",
  "bcTelemetryBuddy.kusto.url": "https://your-cluster.kusto.windows.net",
  "bcTelemetryBuddy.auth.flow": "azure_cli"
}
```

See [UserGuide.md](https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md) for complete configuration options.

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Package extension
npm run package
```

## Architecture

This extension spawns and manages an MCP (Model Context Protocol) backend that:
- Authenticates to Azure using MSAL
- Executes KQL queries against Application Insights/Kusto
- Caches results locally
- Provides context from saved queries and external references
- Exposes tools to GitHub Copilot

## License

MIT
