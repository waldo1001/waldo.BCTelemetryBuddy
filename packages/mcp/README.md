# BC Telemetry Buddy - MCP Server

**Standalone Model Context Protocol (MCP) server for querying Business Central telemetry from Application Insights/Kusto.**

[![npm version](https://img.shields.io/npm/v/bc-telemetry-buddy-mcp)](https://www.npmjs.com/package/bc-telemetry-buddy-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

BC Telemetry Buddy MCP Server is a **standalone NPM package** that enables AI assistants (GitHub Copilot, Claude Desktop, Claude Code, Copilot Studio, Cursor) to query Business Central telemetry data. It implements the [Model Context Protocol](https://modelcontextprotocol.io/) specification (protocol version **2025-06-18**) using the official `@modelcontextprotocol/sdk` for seamless language model integration.

**Key Features:**
- 🚀 **Standalone Package**: Install globally with `npm install -g bc-telemetry-buddy-mcp` - no dependencies on VSCode extension
- 🤖 **AI Assistant Ready**: Works with GitHub Copilot, Claude Desktop, Claude Code, Copilot Studio, and Cursor via the official MCP SDK over stdio
- 🔧 **CLI Interface**: `bctb-mcp` command with init, validate, test-auth, start, and **agent** subcommands
- 📁 **File-Based Config**: Simple `.bctb-config.json` with schema validation and environment variable substitution
- 👥 **Multi-Profile Support**: Manage multiple customers/environments in single config file with profile switching
- 🤖 **Agentic Monitoring (Preview)**: Autonomous scheduled telemetry monitoring via CI/CD pipelines — LLM-powered reasoning, issue tracking, Teams/email alerts
- 🔌 **Optional for VSCode**: VSCode extension works standalone; MCP only required for chat participant features
- 🔄 **Automatic Updates**: Update notifications on startup when newer versions are available on NPM
- 🧪 **Comprehensive Testing**: 70%+ test coverage with dedicated test suites for Claude Desktop workflows
- 🔐 **Flexible Authentication**: Azure CLI (recommended), Device Code, and Client Credentials flows via MSAL
- 🐛 **Debug Logging**: Diagnostic output for config loading and workspace path troubleshooting
- 📊 **Usage Telemetry**: Anonymous telemetry collection (tool invocations, performance, errors) - respects privacy with no PII or query content

## Installation

### Global Installation (Recommended)

```bash
npm install -g bc-telemetry-buddy-mcp
```

### Verify Installation

```bash
bctb-mcp --version
# Should show: 2.2.9 (or later)
```

## Quick Start

### Prerequisites

- **Node.js 18+** installed
- **Application Insights** set up for Business Central telemetry
- **Azure authentication** configured (see Authentication section below)

### 1. Create a Workspace Directory

Choose a directory where you'll store your telemetry configuration and saved queries:

```bash
# Example: Create a dedicated workspace
mkdir C:\MyWorkspace\BCTelemetry
cd C:\MyWorkspace\BCTelemetry
```

### 2. Create Configuration File

Create a `.bctb-config.json` file in your workspace directory. You can use the template:

```json
{
  "profiles": {
    "default": {
      "connectionName": "My BC Production",
      "authFlow": "azure_cli",
      "tenantId": "YOUR-AZURE-TENANT-ID",
      "applicationInsightsAppId": "YOUR-APP-INSIGHTS-APP-ID",
      "kustoClusterUrl": "https://ade.applicationinsights.io/subscriptions/YOUR-SUBSCRIPTION-ID",
      "workspacePath": "${workspaceFolder}",
      "queriesFolder": "queries"
    }
  },
  "defaultProfile": "default",
  "cache": {
    "enabled": true,
    "ttlSeconds": 3600
  },
  "sanitize": {
    "removePII": false
  },
  "references": [
    {
      "name": "Microsoft BC Telemetry Samples",
      "type": "github",
      "url": "https://github.com/microsoft/BCTech",
      "enabled": true
    }
  ]
}
```

**Finding Your Configuration Values:**

- **tenantId**: Your Azure AD tenant ID (found in Azure Portal → Azure Active Directory → Properties)
- **applicationInsightsAppId**: Found in Azure Portal → Application Insights → API Access → Application ID
- **kustoClusterUrl**: `https://ade.applicationinsights.io/subscriptions/YOUR-SUBSCRIPTION-ID`
  - Get subscription ID from Azure Portal → Subscriptions
- **workspacePath**: Use `${workspaceFolder}` (auto-replaced) or absolute path to your workspace directory

**Note:** The `.bctb-config.json` file contains credentials and should NOT be committed to source control. Add it to `.gitignore` if using version control.

### 3. Set Up Authentication

The MCP server supports three authentication methods:

#### Option A: Azure CLI (Recommended - Easiest)

```bash
# Install Azure CLI if not already installed
# https://docs.microsoft.com/cli/azure/install-azure-cli

# Login to Azure
az login

# Set the correct subscription
az account set --subscription YOUR-SUBSCRIPTION-ID
```

Set `"authFlow": "azure_cli"` in your config.

#### Option B: Device Code Flow

Set `"authFlow": "device_code"` in your config. You'll be prompted to authenticate via browser on first use.

#### Option C: Client Credentials (Service Principal)

1. Create an App Registration in Azure AD
2. Grant it "Reader" role on your Application Insights resource
3. Create a client secret
4. Set in config:
```json
{
  "authFlow": "client_credentials",
  "tenantId": "YOUR-TENANT-ID",
  "clientId": "YOUR-CLIENT-ID",
  "clientSecret": "YOUR-CLIENT-SECRET"
}
```

**Security Note:** Never commit client secrets to source control.

### 4. Test Your Configuration

You can test the MCP server locally before configuring Claude Desktop:

```bash
# Navigate to your workspace directory
cd C:\MyWorkspace\BCTelemetry

# Test with node directly (assuming you built from source)
node path/to/mcp/dist/launcher.js
# Or if installed globally:
# bctb-mcp start
```

The server should start and show:
```
=== BC Telemetry Buddy MCP Server ===
Connection: My BC Production
Workspace: C:\MyWorkspace\BCTelemetry
App Insights ID: d60a4fe7-...
✅ Configuration valid
=====================================
```

Press Ctrl+C to stop.

## Usage Scenarios

### With VSCode Extension

The [BC Telemetry Buddy VSCode extension](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy) offers automatic installation:

1. Install extension from marketplace
2. Extension detects MCP not installed
3. Click "Install MCP Server" notification
4. Extension installs and configures MCP automatically

**Note:** VSCode extension works fully standalone for direct commands (Run KQL Query, Save Query, etc.). MCP is only needed for chat participant features (`@bc-telemetry-buddy`).

### With Claude Desktop

Add to Claude Desktop config:

**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Mac:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "bc-telemetry-buddy": {
      "command": "node",
      "args": [
        "C:\\path\\to\\waldo.BCTelemetryBuddy\\packages\\mcp\\dist\\launcher.js"
      ],
      "env": {
        "BCTB_WORKSPACE_PATH": "C:\\MyWorkspace\\BCTelemetry"
      }
    }
  }
}
```

**Important Configuration Notes:**

1. **`command`**: Points to the launcher.js file in the built MCP package
   - If built from source: Path to your cloned repo's `packages/mcp/dist/launcher.js`
   - If installed globally: Use `"command": "bctb-mcp"` with `"args": ["start"]`

2. **`BCTB_WORKSPACE_PATH`**: Must point to the directory containing your `.bctb-config.json` file
   - Use absolute paths (no `~` or relative paths)
   - Use double backslashes on Windows: `C:\\MyWorkspace\\BCTelemetry`

3. The MCP server will:
   - Look for `.bctb-config.json` in the workspace path
   - Create a `queries/` subfolder for saved queries
   - Cache results in `.bctb/cache/` subfolder

**After Configuration:**

1. Restart Claude Desktop
2. Start a new conversation
3. Try: "List available BC telemetry profiles"
4. The MCP server should respond with your configured profile

**Troubleshooting:**

If Claude Desktop shows connection errors:

1. Check Claude logs: `%APPDATA%\Claude\logs\mcp*.log` (Windows) or `~/Library/Logs/Claude/mcp*.log` (Mac)
2. Verify `.bctb-config.json` exists in workspace path
3. Test authentication: Run `az account show` to verify Azure CLI login
4. Ensure paths use absolute paths with proper escaping

### With Copilot Studio

Register as Custom Action:
- **Command:** `bctb-mcp start`
- **Transport:** stdio
- **Config:** Use `BCTB_CONFIG` environment variable or place `.bctb-config.json` in working directory

## CLI Commands

```bash
# Initialize configuration
bctb-mcp init [--output <path>]

# Validate configuration
bctb-mcp validate [--config <path>] [--profile <name>]

# Test authentication
bctb-mcp test-auth [--config <path>] [--profile <name>]

# Start MCP server (stdio mode, default)
bctb-mcp start [--config <path>] [--profile <name>]

# Show version
bctb-mcp --version

# Show help
bctb-mcp --help
```

## Agentic Monitoring (Preview)

> **Note:** Agentic Monitoring is currently a preview feature. APIs and behavior may change in future releases.

BC Telemetry Buddy MCP includes a built-in **autonomous agent runtime** for scheduled telemetry monitoring. Agents use an LLM (Azure OpenAI or Anthropic) to query telemetry, reason about findings, track issues across runs, and take action — all without manual intervention.

### Agent CLI Commands

```bash
# Create a new monitoring agent
bctb-mcp agent start "<instruction>" --name <agent-name>

# Run one monitoring pass
bctb-mcp agent run <agent-name> --once

# Run all active agents
bctb-mcp agent run-all --once

# List agents with status
bctb-mcp agent list

# View run history
bctb-mcp agent history <agent-name> [--limit 10]

# Pause / resume an agent
bctb-mcp agent pause <agent-name>
bctb-mcp agent resume <agent-name>
```

### Minimal Config for Agents

Add an `agents` section to `.bctb-config.json`:

```json
{
  "profiles": { ... },
  "defaultProfile": "default",
  "agents": {
    "llm": {
      "provider": "azure-openai",
      "endpoint": "https://your-resource.openai.azure.com",
      "deployment": "gpt-4o",
      "apiVersion": "2024-10-21"
    },
    "actions": {
      "teams-webhook": { "url": "${TEAMS_WEBHOOK_URL}" }
    }
  }
}
```

Set `AZURE_OPENAI_KEY` environment variable (or `ANTHROPIC_API_KEY` for Anthropic).

### CI/CD Pipeline Integration

Copy a ready-made pipeline template from the npm package:

```bash
# GitHub Actions
cp node_modules/bc-telemetry-buddy-mcp/templates/github-actions/telemetry-agent.yml .github/workflows/

# Azure DevOps
cp node_modules/bc-telemetry-buddy-mcp/templates/azure-devops/azure-pipelines.yml ./
```

### Pre-Built Agent Templates

| Template | Use Case |
|----------|----------|
| `appsource-validation` | Monitor extension install/update failures |
| `performance-monitoring` | Track p95 latencies and slow operations |
| `error-rate-monitoring` | Catch-all error rate monitoring |
| `post-deployment-check` | Short-lived regression detection after deployments |

```bash
# Copy a template to your workspace
cp -r node_modules/bc-telemetry-buddy-mcp/templates/agents/performance-monitoring agents/
bctb-mcp agent run performance-monitoring --once
```

### CI/CD Pipeline Output

Agent runs produce structured, CI-friendly output:

- **Top-level visibility**: Iteration numbers, tool names, LLM reasoning, and result summaries (row/column counts, durations) are always visible
- **Collapsible detail groups**: Internal execution logs (Kusto authentication, cache operations, query URLs) are wrapped in collapsible sections — `##[group]`/`##[endgroup]` in Azure DevOps, `::group::`/`::endgroup::` in GitHub Actions
- **Retry visibility**: LLM API retries (429/529/503) are shown inline with backoff timing
- **Teams notifications**: Markdown tables in alert messages are automatically converted to native Adaptive Card `Table` elements for proper rendering in Teams

See the [User Guide](https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#agentic-monitoring) for full docs including action types, state management, and troubleshooting.

## Features

- **Authentication**: Azure CLI, Device Code, and Client Credentials flows via MSAL
- **Query Execution**: Execute KQL queries against Application Insights/Kusto
- **Event Discovery**: Browse available telemetry event catalog with field prevalence analysis and schemas
- **Field Analysis**: Analyze customDimensions structure with types, occurrence rates, and sample values
- **Query Management**: Save/load queries with metadata and automatic organization
- **Caching**: File-based result caching with configurable TTL
- **Tenant Mapping**: Resolve company names to Azure tenant IDs
- **External References**: Fetch KQL examples from GitHub repositories
- **PII Sanitization**: Optional privacy-focused data sanitization

## MCP Tools

The server exposes **11 tools** to language models (GitHub Copilot, Claude Desktop) for systematic telemetry analysis:

### Discovery Tools (Step 1 & 2 of workflow)
- **`get_event_catalog`**: List available BC telemetry events with descriptions, frequency, status, and Learn URLs
  - Parameters: `daysBack` (default: 10), `status` filter, `minCount` threshold, `maxResults` (default: 50), `includeCommonFields` (optional boolean)
  - Returns: Event IDs sorted by frequency with occurrence counts and documentation links
  - When `includeCommonFields=true`: Includes field prevalence analysis (Universal 80%+, Common 50-79%, Occasional 20-49%, Rare <20%)
  - **When to use**: Start of any exploratory query - discover what events are firing and understand cross-event field patterns

- **`get_event_field_samples`**: Analyze customDimensions structure for a specific event ID with field-level detail
  - Parameters: `eventId` (required), `sampleCount` (default: 10), `daysBack` (default: 30)
  - Returns: Field names, data types, occurrence rates, sample values, and ready-to-use KQL template
  - **When to use**: Before writing queries for a specific event - discover exact field structure from real data

- **`get_event_schema`**: Get detailed schema (customDimensions fields) for a specific event ID
  - Parameters: `eventId` (required), `sampleSize` (default: 100)
  - Returns: Available fields with data types and example values, plus sample query
  - **When to use**: After discovering relevant event IDs - understand available data fields

- **`get_tenant_mapping`**: Discover company names and map to Azure tenant IDs
  - Parameters: `daysBack` (default: 10), `companyNameFilter` (optional)
  - Returns: Company name to tenant ID mapping table
  - **When to use**: For customer-specific queries - map friendly names to tenant IDs

### Query Execution (Step 4 of workflow)
- **`query_telemetry`**: Execute KQL queries against Application Insights
  - Parameters: `kql` (required KQL query string), `useContext` (boolean, default: true), `includeExternal` (boolean, default: true)
  - Returns: Query results with summary, recommendations, and chart suggestions
  - **When to use**: After discovery and understanding phases - execute the actual query with precise KQL

### Query Library (Step 3 of workflow)
- **`get_saved_queries`**: List all saved queries with optional tag filtering
  - Parameters: `tags` (optional array)
  - Returns: Saved query metadata (name, purpose, use case, tags, file path)
  - **When to use**: Check for existing patterns before writing new queries

- **`search_queries`**: Search saved queries by keywords
  - Parameters: `searchTerms` (required array)
  - Returns: Matching queries with relevance scores
  - **When to use**: More targeted search when you know what you're looking for

- **`save_query`**: Save query with metadata and automatic organization
  - Parameters: `name`, `kql`, `purpose`, `useCase`, `tags`, `category`
  - Auto-organizes: Generic → `queries/[Category]/`, Customer → `queries/Companies/[CompanyName]/[Category]/`
  - **When to use**: After finding a useful query pattern

- **`get_categories`**: List all query categories/folders
  - Returns: Available categories for organizing queries
  - **When to use**: Understanding workspace organization

### Analysis & Recommendations (Step 5 of workflow)
- **`get_recommendations`**: Analyze query results and provide actionable insights
  - Parameters: `kql` (optional), `results` (optional)
  - Returns: Recommendations based on patterns, thresholds, and best practices
  - **When to use**: After query execution - get next steps and optimizations

- **`get_external_queries`**: Fetch KQL examples from configured references
  - Returns: External query examples from GitHub repos and documentation
  - **When to use**: Additional context for query generation

## Systematic Workflow

The MCP tools are designed to be used in a systematic workflow by Copilot:

### 1. Discover Events (`bctb_get_event_catalog`)
- **Purpose**: Find relevant telemetry event IDs
- **When**: Start of any exploratory/generic BC telemetry question
- **Example**: "Show me errors" → Discover RT0010 (AL runtime errors), RT0020 (web service errors), etc.

### 2. Analyze Field Structure (`bctb_get_event_field_samples` or `bctb_get_event_schema`)
- **Purpose**: Learn what customDimensions fields are available for each event with detailed analysis
- **When**: After discovering relevant event IDs
- **Example**: Get field samples for RT0010 → See fields like `alObjectType`, `alObjectName`, `alStackTrace` with types, occurrence rates, and sample values
- **Alternative**: Use `bctb_get_event_schema` for quicker schema overview

### 3. Check Saved Queries (`bctb_search_queries` or `bctb_get_saved_queries`)
- **Purpose**: Find existing proven patterns before writing new KQL
- **When**: After understanding schema, before generating query
- **Example**: Search for "error" → Find team's existing error analysis queries

### 4. Execute Query (`bctb_query_telemetry`)
- **Purpose**: Run the KQL query against Application Insights
- **When**: After discovery, understanding, and pattern checking
- **Note**: Requires explicit KQL (v1.0.0 removed NL translation - use discovery tools to build accurate queries)

### 5. Analyze Results (`bctb_get_recommendations`)
- **Purpose**: Get actionable insights and next steps
- **When**: After query execution
- **Example**: "High error rate detected → Check recent deployments"

**For Customer-Specific Queries**, add this step:
- **Before Step 4**: Call `get_tenant_mapping` to map company name to tenant ID
- **Example**: "Contoso" → "12345678-1234-..." → Filter KQL by aadTenantId

## Configuration

The MCP server uses `.bctb-config.json` for all configuration. This file can be created automatically with `bctb-mcp init` or manually.

### Config File Discovery Order

1. `--config <path>` CLI argument (highest priority)
2. `.bctb-config.json` in current directory
3. `.bctb-config.json` in workspace root (if `BCTB_WORKSPACE` env var set)
4. `~/.bctb/config.json` (user home directory)
5. Environment variables (fallback)

### Single Profile Configuration

```json
{
  "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
  "authFlow": "azure_cli",
  "applicationInsights": {
    "appId": "your-app-insights-app-id"
  },
  "kusto": {
    "clusterUrl": "https://ade.applicationinsights.io/subscriptions/your-subscription-id",
    "database": "your-app-insights-app-id"
  },
  "workspacePath": ".",
  "cache": {
    "enabled": true,
    "ttlSeconds": 3600
  }
}
```

### Multi-Profile Configuration

Manage multiple customers/environments in one file:

```json
{
  "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
  "defaultProfile": "customer-a-prod",
  "profiles": {
    "customer-a-prod": {
      "authFlow": "azure_cli",
      "applicationInsights": {
        "appId": "app-id-customer-a"
      },
      "kusto": {
        "clusterUrl": "https://ade.applicationinsights.io/subscriptions/sub-id",
        "database": "app-id-customer-a"
      }
    },
    "customer-b-prod": {
      "authFlow": "client_credentials",
      "tenantId": "${CUSTOMER_B_TENANT_ID}",
      "clientId": "${CUSTOMER_B_CLIENT_ID}",
      "applicationInsights": {
        "appId": "app-id-customer-b"
      },
      "kusto": {
        "clusterUrl": "https://ade.applicationinsights.io/subscriptions/sub-id",
        "database": "app-id-customer-b"
      }
    }
  }
}
```

**Profile Selection:**
```bash
# Use specific profile
bctb-mcp start --profile customer-b-prod

# Or set environment variable
export BCTB_PROFILE=customer-b-prod
bctb-mcp start
```

### Authentication Flows

**Azure CLI** (recommended, default):
- Uses cached credentials from existing `az login` session
- **No additional configuration needed** - just set `"authFlow": "azure_cli"`
- No tenant ID, client ID, or secrets required
- Works for interactive development
- Supports all Azure resources you have access to

**Device Code**:
- Browser-based authentication with device code flow
- Requires `tenantId` in config (no client ID needed)
- Interactive prompt when server starts
- No Azure app registration required
- Good fallback when Azure CLI is not available

**Client Credentials**:
- Service principal for automation and unattended scenarios
- Requires `tenantId` and `clientId` in config
- Secret provided via environment variable: `${CLIENT_SECRET_VAR_NAME}`
- Best for CI/CD pipelines, scheduled jobs, production automation

**Environment Variable Substitution:**

Use `${VAR_NAME}` in config for secrets:

```json
{
  "authFlow": "client_credentials",
  "tenantId": "${AZURE_TENANT_ID}",
  "clientId": "${AZURE_CLIENT_ID}"
}
```

Then set environment variables before starting:
```bash
export AZURE_TENANT_ID="your-tenant-id"
export AZURE_CLIENT_ID="your-client-id"
export AZURE_CLIENT_SECRET="your-secret"
bctb-mcp start
```

## Development

### Prerequisites
- Node.js 18+
- npm 9+
- Azure CLI (for `azure_cli` auth flow)

### Build from Source

```bash
# Clone repository
git clone https://github.com/waldo1001/waldo.BCTelemetryBuddy.git
cd waldo.BCTelemetryBuddy

# Install dependencies (monorepo)
npm install

# Build MCP package
cd packages/mcp
npm run build
```

### Local Testing

```bash
# Link globally for testing
npm link

# Test CLI commands
bctb-mcp --version
bctb-mcp init --output /tmp/test-config.json
bctb-mcp validate --config /tmp/test-config.json

# Start server with test config
bctb-mcp start --config /tmp/test-config.json
```

### Run Tests

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Watch mode
npm run test:watch
```

### Watch Mode (Development)

```bash
npm run dev
# TypeScript compiler watches for changes
```

## Architecture

### Package Structure

This is part of the BC Telemetry Buddy monorepo:

```
packages/
├── shared/     - Core business logic (bundled at build time)
├── mcp/        - This package (standalone MCP server)
└── extension/  - VSCode extension (works independently)
```

The MCP server uses `@bctb/shared` for core functionality (auth, kusto, cache, queries), which gets bundled during build. This ensures the MCP server is completely standalone with no runtime dependencies on other packages.

### Core Modules

**`cli.ts`** - CLI entry point with Commander.js
- Commands: `start`, `init`, `validate`, `test-auth`
- Config file management and validation

**`mcpSdkServer.ts`** - MCP SDK server for stdio mode (primary)
- Uses official `@modelcontextprotocol/sdk` (protocol 2025-06-18)
- `StdioServerTransport` for JSON-RPC 2.0 over stdin/stdout
- Capabilities: `tools` (with `listChanged`), `logging`
- Automatic Zod schema conversion from JSON Schema tool definitions

**`tools/toolDefinitions.ts`** - Single source of truth for all tool metadata
- 13 tool definitions with descriptions, input schemas, and annotations
- Tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`, `openWorldHint`)

**`tools/toolHandlers.ts`** - Business logic for all tools
- `ToolHandlers` class with extracted business logic
- `initializeServices()` for dependency setup
- Shared between SDK stdio server and Express HTTP server

**`server.ts`** - Express HTTP server (legacy, for VS Code extension)
- HTTP JSON-RPC for VS Code Command Palette features
- Routes stdio mode → `mcpSdkServer.ts`, HTTP mode → Express
- Error handling and logging

**`config.ts`** - Configuration management
- File-based config with discovery
- Multi-profile support with inheritance
- Environment variable substitution
- Schema validation

**From `@bctb/shared` (bundled):**
- **`auth.ts`** - MSAL authentication (Azure CLI, Device Code, Client Credentials)
- **`kusto.ts`** - KQL execution against Application Insights
- **`cache.ts`** - File-based result caching with TTL
- **`queries.ts`** - Saved query management (.kql files)
- **`sanitize.ts`** - PII removal and data sanitization
- **`eventLookup.ts`** - Telemetry event catalog and schema discovery
- **`references.ts`** - External KQL example fetching

### Data Flow

**Stdio mode (MCP clients — Claude Desktop, Claude Code, Copilot, Cursor):**
1. **Startup**: CLI → `startSdkStdioServer()` → loads config → validates → creates `ToolHandlers`
2. **SDK Server**: `McpServer` registers all tools with Zod schemas via `TOOL_DEFINITIONS`
3. **Transport**: `StdioServerTransport` handles JSON-RPC 2.0 framing over stdin/stdout
4. **Tool Request**: MCP client calls tool → SDK dispatches → `ToolHandlers.executeToolCall()`
5. **Execution**: Authentication → KQL query → cache → response

**HTTP mode (VS Code extension Command Palette):**
1. **Startup**: CLI → `new MCPServer(config, 'http')` → Express server on configured port
2. **Tool Request**: Extension sends JSON-RPC via HTTP POST to `/rpc`
3. **Execution**: Same business logic methods on MCPServer class
4. **Response**: JSON-RPC response over HTTP

## Publishing

### Publish to NPM

```bash
# Ensure you're logged into NPM
npm login

# Build package
npm run build

# Publish (first time or major version)
npm publish --access public

# Publish patch/minor updates
npm version patch  # or minor, major
npm publish
```

### What Gets Published

- `dist/` - Compiled JavaScript and sourcemaps
- `config-schema.json` - JSON schema for config validation
- `package.json` - Package metadata
- `README.md` - This file
- `LICENSE` - MIT license
- `CHANGELOG.md` - Version history

**Excluded from publish:**
- `src/` - TypeScript source (compiled to dist/)
- `__tests__/` - Test files
- `node_modules/` - Dependencies (bundled into dist/)
- Development files (.gitignore, tsconfig.json, jest.config.js)

## Testing

Test coverage requirements: **70% minimum** (enforced by CI)

Current coverage:
- Statements: 83%+
- Branches: 75%+
- Functions: 95%+  
- Lines: 83%+

Run tests locally:
```bash
npm test                 # Run all tests
npm run test:coverage    # With coverage report
npm run test:watch       # Watch mode for development
```

## Related Projects

- **[VSCode Extension](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)** - BC Telemetry Buddy VSCode extension (works standalone, MCP optional) ([source](../extension/))
- **[Shared Library](../shared/)** - Core business logic (private package, bundled into MCP)
- **[Model Context Protocol](https://modelcontextprotocol.io/)** - MCP specification and documentation

## Support & Contributing

- **Issues**: [GitHub Issues](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/discussions)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## Usage Telemetry

The MCP server **collects anonymous usage telemetry** to help improve the tool. This section explains what data is collected and how to control it.

### What Data is Collected?

**Collected:**
- MCP server version and installation ID (pseudonymous, workspace-specific)
- Tool invocations (e.g., query_telemetry, get_event_catalog)
- Performance metrics (query execution time, tool duration)
- Error information (sanitized error messages, exception types)
- Authentication flow used (azure_cli, device_code, client_credentials)
- Profile usage (hashed profile names for privacy)

**Never Collected:**
- Your Business Central telemetry data or query results
- KQL queries you execute
- Personal information (names, emails, IP addresses)
- Azure credentials, connection strings, or secrets
- Customer names or company identifiers
- File paths or workspace details

### Privacy & Anonymization

All telemetry data is automatically sanitized:
- **Installation IDs**: Random UUIDs stored per user in `~/.bctb/installation-id` (not in workspace)
- **Profile names**: Hashed (first 16 chars of SHA-256) before transmission
- **No query content**: KQL queries and results are never sent
- **Error messages**: Sanitized to remove paths, credentials, PII
- **Rate limited**: Max 2000 events/session, 200 events/minute to prevent spam

### How to Disable Telemetry

**VSCode Extension Users:**
- Telemetry respects VS Code's `telemetry.telemetryLevel` setting
- Set to `"off"` to disable all telemetry (extension + MCP)

**Standalone MCP Users (Claude Desktop, etc.):**
- Remove the `BCTB_TELEMETRY_CONNECTION_STRING` environment variable from your MCP client configuration
- The MCP server will gracefully fall back to no-op telemetry when connection string is missing

### Where is Data Sent?

Telemetry data is sent to **Azure Application Insights** (West Europe region), operated by the extension author:
- Stored for 90 days maximum
- Used only for improving BC Telemetry Buddy
- Not shared with third parties
- GDPR compliant with pseudonymous identifiers

### Open Source Transparency

All telemetry code is open source and auditable:
- MCP telemetry: `packages/mcp/src/mcpTelemetry.ts`
- Shared telemetry logic: `packages/shared/src/usageTelemetry.ts`
- Sanitization: `packages/shared/src/usageTelemetryUtils.ts`

**View the code:** [GitHub Repository](https://github.com/waldo1001/waldo.BCTelemetryBuddy)

## License

MIT - See [LICENSE](../../LICENSE) for details.
