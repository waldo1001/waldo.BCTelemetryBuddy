# BC Telemetry Buddy - VSCode Extension

VSCode extension for querying Business Central telemetry with natural language support and GitHub Copilot integration.

## 🚀 Quick Start

1. **Install** from [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=waldoBC.bctb) (search for "BC Telemetry Buddy")
2. **Run Setup Wizard**: Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `BC Telemetry Buddy: Setup Wizard`
3. **Configure** your Azure resources through the guided wizard:
   - Azure tenant and Application Insights connection
   - Authentication method (Azure CLI recommended, Device Code, or Client Credentials)
   - Kusto cluster URL (pre-filled with BC telemetry endpoint)
   - Connection testing to validate configuration
4. **Query with Copilot**: 
   ```
   @workspace Show me all errors from BC in the last 24 hours
   @workspace What are the slowest operations this week?
   ```
5. **Or use Command Palette**: `BC Telemetry Buddy: Run KQL Query`

The setup wizard automatically appears on first activation and guides you through complete configuration with validation and testing.

## ✨ Features

### Getting Started
- **🧙 Setup Wizard**: Step-by-step 5-step guided configuration with connection testing, validation, and automatic settings save
- **🔐 Flexible Authentication**: Azure CLI (recommended - uses existing `az login`), Device Code, or Client Credentials

### Discovery & Exploration
- **📊 Event Catalog**: Browse available BC telemetry event IDs (RT0001, RT0005, etc.) with descriptions, frequency, and Learn URLs
- **🔍 Schema Discovery**: Understand customDimensions fields for each event type by sampling recent occurrences
- **🗺️ Tenant Mapping**: Automatically discover company names and map them to Azure tenant IDs for customer queries

### Query Execution
- **🤖 GitHub Copilot Integration**: 10 MCP tools enable Copilot to systematically discover → understand → search → execute queries
- **💬 Natural Language Queries**: Ask questions in plain English - Copilot follows structured workflow for accurate results
- **📝 KQL Support**: Write and execute KQL queries directly; create `.kql` files with syntax highlighting
- **👁️ CodeLens**: "▶ Run Query" links appear above queries in `.kql` files for one-click execution
- **📋 Rich Results**: View query results in formatted tables with row counts, execution timing, and recommendations

### Query Management
- **📚 Query Library**: Save queries organized by category; customer-specific queries auto-filed in `Companies/[CompanyName]/[Category]/` folders
- **� Query Search**: Search saved queries by keywords to find existing patterns before writing new KQL
- **💾 Smart Caching**: File-based caching with configurable TTL (default 1 hour); manual cache management commands
- **🧠 Context-Aware**: Automatically includes saved workspace queries and external GitHub references for better KQL generation

## 📋 Commands

| Command | Description |
|---------|-------------|
| **BC Telemetry Buddy: Setup Wizard** ⭐ | **Start here!** Guided 5-step configuration wizard with validation |
| BC Telemetry Buddy: Start MCP Server | Manually start the MCP backend (HTTP mode for Command Palette) |
| BC Telemetry Buddy: Run KQL Query | Execute KQL or natural language query with results display |
| BC Telemetry Buddy: Run KQL From Document | Execute query from current `.kql` file |
| BC Telemetry Buddy: Save Query | Save current query to workspace library with category/metadata |
| BC Telemetry Buddy: Open Queries Folder | Open saved queries folder in file explorer |
| BC Telemetry Buddy: Clear Cache | Delete all cached query results for fresh data |
| BC Telemetry Buddy: Show Cache Statistics | Display cache size, entry count, and expiration info |

## ⚙️ Configuration

### Setup Wizard (Recommended)
The **Setup Wizard** handles all configuration automatically with validation and testing. Run it from Command Palette:
```
BC Telemetry Buddy: Setup Wizard
```

### Manual Configuration
For manual configuration or to review settings, add to your workspace `.vscode/settings.json`:

#### Required Settings
```json
{
  "bctb.mcp.connectionName": "Production BC Telemetry",
  "bctb.mcp.tenantId": "12345678-1234-1234-1234-123456789abc",
  "bctb.mcp.applicationInsights.appId": "your-app-insights-app-id",
  "bctb.mcp.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/<subscription-id>",
  "bctb.mcp.authFlow": "azure_cli"
}
```

**Authentication Flows:**
- `azure_cli` (recommended): Uses existing `az login` session - no additional credentials needed
- `device_code`: Browser-based authentication - prompts each time MCP starts
- `client_credentials`: Service principal with client ID + secret (secret stored in environment variable, not settings.json)

#### Optional Settings
```json
{
  "bctb.queries.folder": "queries",
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 3600,
  "bctb.mcp.sanitize.removePII": false,
  "bctb.mcp.port": 52345
}
```

#### Tenant Mapping (Customer Queries)
Define friendly company names for customer-specific queries:
```json
{
  "bctb.mcp.references": [
    {
      "name": "Contoso Corp",
      "type": "tenant-mapping",
      "tenantId": "contoso-tenant-id"
    }
  ]
}
```

When saving queries that filter on tenant/company, they're automatically organized:
```
queries/Companies/Contoso Corp/Errors/login-failures.kql
```

#### External References (KQL Examples)
Pull example queries from GitHub repos:
```json
{
  "bctb.mcp.references": [
    {
      "name": "BC Samples",
      "type": "github",
      "url": "https://github.com/microsoft/BCTech/tree/master/samples/AppInsights",
      "enabled": true
    }
  ]
}
```

See complete configuration documentation in the [repository README](https://github.com/waldo1001/waldo.BCTelemetryBuddy).

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

## 🔧 How It Works

This extension manages an MCP (Model Context Protocol) backend server that:

### MCP Server Modes
1. **STDIO Mode (Copilot Integration)**: Automatically managed by VSCode for GitHub Copilot integration. The MCP server exposes tools that Copilot can call to query telemetry, discover events, and generate KQL.

2. **HTTP Mode (Command Palette)**: Manually started via "Start MCP Server" command for direct queries through Command Palette commands.

### Telemetry Workflow
1. **Discovery First**: Use Event Catalog to see what telemetry events exist (RT0001, RT0005, etc.)
2. **Understand Schema**: Check Event Schema to see available customDimensions fields for each event
3. **Reuse Patterns**: Search saved queries for proven patterns before writing new KQL
4. **Execute Query**: Run queries via Copilot, Command Palette, or CodeLens links in `.kql` files
5. **Save for Team**: Save useful queries to workspace library for team reuse

### Authentication
- Authenticates to Azure using MSAL (Microsoft Authentication Library)
- **Azure CLI**: Uses cached credentials from `az login` (no additional auth required)
- **Device Code**: Interactive browser-based login (prompts each time)
- **Client Credentials**: Service principal for automation (requires client ID + secret)

### Caching & Performance
- Query results cached locally in `.vscode/.bctb/cache/` as JSON files
- Default TTL: 1 hour (configurable via `bctb.mcp.cache.ttlSeconds`)
- Manual cache management: Clear all caches or view statistics via Command Palette

### Context & Auto-Generation
- Scans workspace `queries/` folder for saved KQL patterns
- Optionally fetches external reference queries from GitHub repos
- When you ask natural language questions, backend matches patterns from saved queries to generate accurate KQL
- Copilot automatically uses MCP tools for systematic discovery → understanding → execution workflow

## License

MIT
