# BC Telemetry Buddy - VSCode Extension

VSCode extension for querying Business Central telemetry with natural language support and GitHub Copilot integration.

## ⚡ What's New in v0.3.0

**Major Architecture Change:** The extension now works **independently** without requiring the MCP server for direct commands!

**What This Means for You:**
- ✅ **Direct Commands Work Without MCP**: Run KQL queries, save queries, manage cache - all work immediately after installation
- ✅ **MCP Optional for Chat**: Only needed if you want to use the GitHub Copilot chat participant (`@bc-telemetry-buddy`)
- ✅ **Faster Setup**: Extension is fully functional after running Setup Wizard - no additional installation needed
- ✅ **Simpler Configuration**: Single `.bctb-config.json` file for all settings (replaces scattered VSCode settings)

**Migrating from v0.2.x?** See [Migration Guide](#-migrating-from-v02x) below.

## 🚀 Quick Start

### For New Users

1. **Install** from [VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=waldoBC.bctb) (search for "BC Telemetry Buddy")
2. **Run Setup Wizard**: Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → `BC Telemetry Buddy: Setup Wizard`
3. **Configure** your Azure resources through the guided wizard:
   - Azure tenant and Application Insights connection
   - Authentication method (Azure CLI recommended, Device Code, or Client Credentials)
   - Kusto cluster URL (pre-filled with BC telemetry endpoint)
   - Connection testing to validate configuration
4. **Start Using Commands**: 
   - `BC Telemetry Buddy: Run KQL Query` - Execute queries directly
   - `BC Telemetry Buddy: Save Query` - Save to workspace library
   - CodeLens in `.kql` files - Click "▶ Run Query" above queries
5. **(Optional) Install MCP for Chat**: If you want to use GitHub Copilot chat features:
   - Extension will prompt: "Install MCP Server for Chat?"
   - Click "Install" to enable `@bc-telemetry-buddy` chat participant
   - Or run manually: `npm install -g bc-telemetry-buddy-mcp`

The setup wizard automatically appears on first activation and guides you through complete configuration with validation and testing.

### For Existing Users (Upgrading from v0.2.x)

**Your settings will migrate automatically!** On first launch after upgrade:

1. Extension detects old `bcTelemetryBuddy.*` settings
2. Shows notification: "Migrate to new configuration format?"
3. Click "Migrate Settings" → creates `.bctb-config.json` from old settings
4. Extension works immediately with direct commands
5. (Optional) Install MCP separately if you want chat features

**Nothing breaks** - your existing setup continues to work during migration. See [Migration Guide](#-migrating-from-v02x) for details.

## ✨ Features

### Getting Started
- **🧙 Setup Wizard**: Step-by-step 5-step guided configuration with connection testing, validation, and automatic settings save
- **🔐 Flexible Authentication**: Azure CLI (recommended - uses existing `az login`), Device Code, or Client Credentials

### Discovery & Exploration
- **📊 Event Catalog**: Browse available BC telemetry event IDs (RT0001, RT0005, etc.) with descriptions, frequency, and Learn URLs
- **🔍 Schema Discovery**: Understand customDimensions fields for each event type by sampling recent occurrences
- **🗺️ Tenant Mapping**: Automatically discover company names and map them to Azure tenant IDs for customer queries

### Query Execution
- **🤖 GitHub Copilot Integration**: 11 MCP tools enable Copilot to systematically discover → understand → search → execute queries
- **💬 Intelligent Query Generation**: Ask questions in plain English - Copilot uses discovery tools to build accurate KQL
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

Wizard creates `.bctb-config.json` in your workspace root with all necessary settings.

### Configuration File (`.bctb-config.json`)

The extension reads configuration from `.bctb-config.json` in your workspace root. This file is created automatically by the Setup Wizard.

#### Basic Configuration
```json
{
  "connectionName": "Production BC Telemetry",
  "tenantId": "12345678-1234-1234-1234-123456789abc",
  "authFlow": "azure_cli",
  "applicationInsightsAppId": "your-app-insights-app-id",
  "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/<subscription-id>",
  "workspacePath": "${workspaceFolder}",
  "queriesFolder": "queries",
  "cacheEnabled": true,
  "cacheTTLSeconds": 3600,
  "removePII": false
}
```

**Authentication Flows:**
- `azure_cli` (recommended): Uses existing `az login` session - no additional credentials needed
- `device_code`: Browser-based authentication - prompts when needed
- `client_credentials`: Service principal with client ID + secret (use environment variables for secrets)

#### Client Credentials Authentication
For automation scenarios, use service principal with secrets in environment variables:
```json
{
  "authFlow": "client_credentials",
  "tenantId": "your-tenant-id",
  "clientId": "${BCTB_CLIENT_ID}",
  "clientSecret": "${BCTB_CLIENT_SECRET}",
  "applicationInsightsAppId": "your-app-insights-app-id",
  "kustoClusterUrl": "https://ade.applicationinsights.io/..."
}
```

Set environment variables:
```powershell
# Windows PowerShell
$env:BCTB_CLIENT_ID = "your-client-id"
$env:BCTB_CLIENT_SECRET = "your-client-secret"

# Linux/Mac
export BCTB_CLIENT_ID="your-client-id"
export BCTB_CLIENT_SECRET="your-client-secret"
```

#### External References (KQL Examples)
Pull example queries from GitHub repos for Copilot context:
```json
{
  "connectionName": "Production",
  "authFlow": "azure_cli",
  "applicationInsightsAppId": "...",
  "kustoClusterUrl": "...",
  "references": [
    {
      "name": "BC Samples",
      "type": "github",
      "url": "https://github.com/microsoft/BCTech/tree/master/samples/AppInsights",
      "enabled": true
    }
  ]
}
```

#### Multi-Profile Configuration (Multiple Customers)

If you work with multiple customers, use profiles to switch between them easily:

```json
{
  "profiles": {
    "customer-a-prod": {
      "connectionName": "Customer A Production",
      "authFlow": "azure_cli",
      "applicationInsightsAppId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
      "kustoClusterUrl": "https://ade.applicationinsights.io/...",
      "workspacePath": "${workspaceFolder}/customers/customer-a",
      "queriesFolder": "queries"
    },
    "customer-b-prod": {
      "connectionName": "Customer B Production",
      "authFlow": "device_code",
      "applicationInsightsAppId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy",
      "kustoClusterUrl": "https://ade.applicationinsights.io/...",
      "workspacePath": "${workspaceFolder}/customers/customer-b",
      "queriesFolder": "queries"
    }
  },
  "defaultProfile": "customer-a-prod",
  "cacheEnabled": true,
  "cacheTTLSeconds": 3600
}
```

Switch profiles via status bar dropdown or Command Palette: `BC Telemetry Buddy: Switch Profile`

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

### Architecture (v0.3.0+)

The extension uses a **dual-path architecture** for maximum flexibility:

#### Path 1: Direct Execution (No MCP)
For all Command Palette commands and CodeLens actions:

```
VSCode Command → TelemetryService → Azure/Kusto → Results Display
```

- **TelemetryService**: Built-in service using shared business logic
- **Authentication**: MSAL library (azure_cli, device_code, or client_credentials)
- **KQL Execution**: Direct Kusto API calls
- **No Dependencies**: Works immediately after Setup Wizard
- **Faster**: No HTTP/JSON-RPC overhead

#### Path 2: Chat Integration (Requires MCP)
For GitHub Copilot chat participant (`@bc-telemetry-buddy`):

```
GitHub Copilot Chat → MCP Server → Tools (11 specialized) → Azure/Kusto → Chat Response
```

- **MCP Server**: Separate process (`bc-telemetry-buddy-mcp` NPM package)
- **Tools**: Event catalog, schema discovery, query search, execution, etc.
- **Optional**: Only install if you want chat features
- **Installation**: `npm install -g bc-telemetry-buddy-mcp`

### Configuration Discovery

Extension reads `.bctb-config.json` with this discovery order:

1. `.bctb-config.json` in current directory
2. `.bctb-config.json` in workspace root (most common)
3. `~/.bctb/config.json` in user home directory
4. Environment variables (fallback)

MCP server (if installed) uses the same config file, ensuring consistency.

### Telemetry Workflow
1. **Discovery**: Browse event catalog (RT0001, RT0005, etc.) to see available telemetry
2. **Field Analysis**: Understand customDimensions structure with sample values
3. **Reuse Patterns**: Search saved queries for proven patterns
4. **Execute Query**: Run via commands, CodeLens, or chat
5. **Save for Team**: Save useful queries to workspace library

### Authentication
- **Azure CLI** (recommended): Uses cached credentials from `az login` - no re-auth needed
- **Device Code**: Browser-based interactive login - prompts when token expires
- **Client Credentials**: Service principal for automation - requires client ID + secret in env vars

### Caching & Performance
- Query results cached locally in workspace (`.vscode/.bctb/cache/`)
- Default TTL: 1 hour (configurable in `.bctb-config.json`)
- Manual cache management via Command Palette
- Cache key = hash(KQL query + parameters)

### Context & Intelligent Generation (Chat Only)
- Scans workspace `queries/` folder for saved KQL patterns
- Optionally fetches external reference queries from GitHub repos
- Copilot uses discovery tools to understand event structure
- Systematic workflow: discover events → analyze fields → search patterns → generate KQL

## 🔄 Migrating from v0.2.x

### What Changed?

**v0.2.x (Old - Bundled MCP):**
- MCP server bundled inside extension
- Extension required MCP for all features
- Settings scattered across `bcTelemetryBuddy.*` namespace in VSCode settings
- HTTP mode required for all commands

**v0.3.0 (New - Independent Architecture):**
- Extension works standalone (no MCP needed for direct commands)
- MCP is a separate optional package (`bc-telemetry-buddy-mcp`)
- Single `.bctb-config.json` file for configuration
- Direct execution via TelemetryService (faster, simpler)
- MCP only needed for chat participant

### Migration Steps

**Automatic Migration (Recommended):**

1. Update extension from Marketplace (v0.3.0+)
2. Reload VSCode
3. Extension detects old settings automatically
4. Click "Migrate Settings" when prompted
5. Extension creates `.bctb-config.json` from your old settings
6. **Done!** Extension works immediately

**Manual Migration:**

If you prefer to migrate manually or automatic migration didn't work:

1. Note your current settings from `.vscode/settings.json`:
   ```json
   {
     "bcTelemetryBuddy.connectionName": "...",
     "bcTelemetryBuddy.appInsights.appId": "...",
     "bcTelemetryBuddy.kusto.clusterUrl": "...",
     "bcTelemetryBuddy.authFlow": "..."
   }
   ```

2. Run Setup Wizard: `BC Telemetry Buddy: Setup Wizard`

3. Enter your settings when prompted (wizard validates everything)

4. Wizard creates `.bctb-config.json` in workspace root

5. Delete old `bcTelemetryBuddy.*` settings from `.vscode/settings.json` (optional - they're ignored now)

### Installing MCP for Chat (Optional)

If you want to use the chat participant (`@bc-telemetry-buddy`):

**Option 1: Extension Prompt**
- Extension will ask: "Install MCP Server for Chat?"
- Click "Install" → extension runs `npm install -g bc-telemetry-buddy-mcp`

**Option 2: Manual Install**
```bash
npm install -g bc-telemetry-buddy-mcp
```

**Verify Installation:**
```bash
bctb-mcp --version
```

The extension will automatically detect the globally-installed MCP and use it for chat features.

### Troubleshooting Migration

**Q: My queries don't work after upgrading!**
- Run Setup Wizard to validate configuration
- Check `.bctb-config.json` exists in workspace root
- Verify App Insights ID and Kusto URL are correct

**Q: Chat participant not working?**
- MCP server required for chat (install: `npm install -g bc-telemetry-buddy-mcp`)
- Direct commands (Run KQL, Save Query) work without MCP

**Q: "Configuration incomplete" errors?**
- `.bctb-config.json` missing or invalid
- Run Setup Wizard to regenerate configuration
- Check file exists and has correct JSON format

**Q: Authentication fails?**
- For `azure_cli`: Run `az login` first
- For `device_code`: Follow browser prompts
- For `client_credentials`: Check client ID/secret env vars

**Q: Where did my old settings go?**
- Old settings are ignored (not deleted)
- New settings in `.bctb-config.json` take precedence
- Safe to delete old `bcTelemetryBuddy.*` settings

**Q: Can I use both old and new versions?**
- No - v0.3.0 only reads `.bctb-config.json`
- Downgrading requires restoring old VSCode settings
- Recommend staying on v0.3.0 (more stable, faster)

## License

MIT
