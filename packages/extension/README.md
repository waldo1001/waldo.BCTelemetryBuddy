# BC Telemetry Buddy - VSCode Extension

VSCode extension for querying Business Central telemetry with natural language support and GitHub Copilot integration.

## Features

- **Natural Language Queries**: Ask questions about your telemetry in plain English
- **KQL Support**: Write and execute KQL queries directly
- **GitHub Copilot Integration**: MCP tools available to Copilot for telemetry analysis
- **Query Management**: Save and reuse queries across your team
- **Rich Results**: View results in formatted tables with recommendations
- **Auto-Context**: Automatically includes saved queries and external references for better accuracy

## Commands

- `BC Telemetry Buddy: Start MCP Server` - Manually start the MCP backend
- `BC Telemetry Buddy: Run Natural Language Query` - Query telemetry using natural language
- `BC Telemetry Buddy: Save Query` - Save a query for future use
- `BC Telemetry Buddy: Open Queries Folder` - Browse saved queries

## Configuration

Add to your workspace `.vscode/settings.json`:

```json
{
  "bctb.mcp.tenantId": "your-azure-tenant-id",
  "bctb.mcp.applicationInsights.appId": "your-app-insights-app-id",
  "bctb.mcp.kusto.clusterUrl": "https://your-cluster.kusto.windows.net",
  "bctb.mcp.authFlow": "device_code"
}
```

See [UserGuide.md](../../docs/UserGuide.md) for complete configuration options.

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
