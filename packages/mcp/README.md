# BC Telemetry Buddy - MCP Server

**Standalone Model Context Protocol (MCP) server for querying Business Central telemetry from Application Insights/Kusto.**

[![npm version](https://img.shields.io/npm/v/bc-telemetry-buddy-mcp)](https://www.npmjs.com/package/bc-telemetry-buddy-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Overview

BC Telemetry Buddy MCP Server is a **standalone NPM package** that enables AI assistants (GitHub Copilot, Claude Desktop, Copilot Studio) to query Business Central telemetry data. It implements the [Model Context Protocol](https://modelcontextprotocol.io/) specification for seamless language model integration.

**Key Features:**
- 🚀 **Standalone Package**: Install globally with `npm install -g bc-telemetry-buddy-mcp`
- 🤖 **AI Assistant Ready**: Works with GitHub Copilot, Claude Desktop, and Copilot Studio
- 🔧 **CLI Interface**: `bctb-mcp` CLI with commands for initialization, validation, and server management
- 📁 **File-Based Config**: Simple `.bctb-config.json` for all settings
- 👥 **Multi-Profile Support**: Manage multiple customers/environments in single config file
- 🔌 **Optional for VSCode**: VSCode extension works standalone; MCP only needed for chat features

## Installation

### Global Installation (Recommended)

```bash
npm install -g bc-telemetry-buddy-mcp
```

### Verify Installation

```bash
bctb-mcp --version
# Should show: 1.0.0
```

## Quick Start

### 1. Initialize Configuration

```bash
bctb-mcp init
# Creates .bctb-config.json with template
```

### 2. Edit Configuration

Edit `.bctb-config.json` with your Application Insights details:

```json
{
  "authFlow": "azure_cli",
  "applicationInsights": {
    "appId": "your-app-insights-app-id"
  },
  "kusto": {
    "clusterUrl": "https://ade.applicationinsights.io/subscriptions/your-subscription-id",
    "database": "your-app-insights-app-id"
  }
}
```

### 3. Test Configuration

```bash
bctb-mcp validate
# Validates config file and tests connection

bctb-mcp test-auth
# Tests authentication flow
```

### 4. Start Server

```bash
bctb-mcp start
# Starts MCP server in stdio mode (for AI assistants)
```

## Usage Scenarios

### With VSCode Extension

The [BC Telemetry Buddy VSCode extension](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy) offers automatic installation:

1. Install extension from marketplace
2. Extension detects MCP not installed
3. Click "Install MCP Server" notification
4. Extension installs and configures MCP automatically

**Note:** VSCode extension works fully standalone for direct commands (Run KQL Query, Save Query, etc.). MCP is only needed for chat participant features (`@bc-telemetry-buddy`).

### With Claude Desktop

Add to Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on Mac):

```json
{
  "mcpServers": {
    "bc-telemetry-buddy": {
      "command": "bctb-mcp",
      "args": ["start"],
      "env": {
        "BCTB_CONFIG": "/path/to/.bctb-config.json"
      }
    }
  }
}
```

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

The server exposes **11 tools** to language models (GitHub Copilot) for systematic telemetry analysis:

### Discovery Tools (Step 1 & 2 of workflow)
- **`bctb_get_event_catalog`**: List available BC telemetry events with descriptions, frequency, status, and Learn URLs
  - Parameters: `daysBack` (default: 10), `status` filter, `minCount` threshold, `includeCommonFields` (optional boolean)
  - Returns: Event IDs sorted by frequency with occurrence counts and documentation links
  - When `includeCommonFields=true`: Includes field prevalence analysis (Universal 80%+, Common 50-79%, Occasional 20-49%, Rare <20%)
  - **When to use**: Start of any exploratory query - discover what events are firing and understand cross-event field patterns

- **`bctb_get_event_field_samples`**: Analyze customDimensions structure for a specific event ID with field-level detail
  - Parameters: `eventId` (required), `maxEvents` (default: 50), `daysBack` (default: 10)
  - Returns: Field names, data types, occurrence rates, sample values, and ready-to-use KQL template
  - **When to use**: Before writing queries for a specific event - discover exact field structure from real data

- **`bctb_get_event_schema`**: Get detailed schema (customDimensions fields) for a specific event ID
  - Parameters: `eventId` (required), `sampleSize` (default: 100)
  - Returns: Available fields with data types and example values, plus sample query
  - **When to use**: After discovering relevant event IDs - understand available data fields

- **`bctb_get_tenant_mapping`**: Discover company names and map to Azure tenant IDs
  - Parameters: `daysBack` (default: 10), `companyNameFilter` (optional)
  - Returns: Company name to tenant ID mapping table
  - **When to use**: For customer-specific queries - map friendly names to tenant IDs

### Query Execution (Step 4 of workflow)
- **`bctb_query_telemetry`**: Execute KQL queries (NL translation removed in v1.0.0 - use discovery tools first)
  - Parameters: `kql` (required KQL query string)
  - Returns: Query results with summary, recommendations, and chart suggestions
  - **When to use**: After discovery and understanding phases - execute the actual query with precise KQL

### Query Library (Step 3 of workflow)
- **`bctb_get_saved_queries`**: List all saved queries with optional tag filtering
  - Parameters: `tags` (optional array)
  - Returns: Saved query metadata (name, purpose, use case, tags, file path)
  - **When to use**: Check for existing patterns before writing new queries

- **`bctb_search_queries`**: Search saved queries by keywords
  - Parameters: `searchTerms` (required array)
  - Returns: Matching queries with relevance scores
  - **When to use**: More targeted search when you know what you're looking for

- **`bctb_save_query`**: Save query with metadata and automatic organization
  - Parameters: `name`, `kql`, `purpose`, `useCase`, `tags`, `category`, `companyName`
  - Auto-organizes: Generic → `queries/[Category]/`, Customer → `queries/Companies/[CompanyName]/[Category]/`
  - **When to use**: After finding a useful query pattern

- **`bctb_get_categories`**: List all query categories/folders
  - Returns: Available categories for organizing queries
  - **When to use**: Understanding workspace organization

### Analysis & Recommendations (Step 5 of workflow)
- **`bctb_get_recommendations`**: Analyze query results and provide actionable insights
  - Parameters: `kql` (optional), `results` (optional)
  - Returns: Recommendations based on patterns, thresholds, and best practices
  - **When to use**: After query execution - get next steps and optimizations

- **`bctb_get_external_queries`**: Fetch KQL examples from configured references
  - Returns: External query examples from GitHub repos and documentation
  - **When to use**: Additional context for query generation

### Cache Management
- **`bctb_get_cache_stats`**: Get cache statistics (size, entry count, expirations)
- **`bctb_clear_cache`**: Clear all cached results
- **`bctb_cleanup_cache`**: Remove only expired cache entries

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
- **Before Step 4**: Call `bctb_get_tenant_mapping` to map company name to tenant ID
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

**`server.ts`** - MCP server implementation  
- JSON-RPC 2.0 protocol over stdio
- Tool registration and request handling
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

1. **Startup**: CLI parses arguments → loads config → validates → starts server
2. **Tool Request**: AI assistant calls MCP tool via JSON-RPC
3. **Authentication**: Server acquires Azure token via configured auth flow
4. **Discovery** (optional): Browse event catalog/schemas to understand available data
5. **Execution**: Execute KQL query against Application Insights
6. **Caching**: Store results with TTL for performance
7. **Response**: Return formatted results to AI assistant

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

- **[VSCode Extension](../extension/README.md)** - BC Telemetry Buddy VSCode extension (works standalone, MCP optional)
- **[Shared Library](../shared/README.md)** - Core business logic (private package, bundled into MCP)
- **[MCP Specification](https://modelcontextprotocol.io/)** - Model Context Protocol documentation

## Support & Contributing

- **Issues**: [GitHub Issues](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)
- **Discussions**: [GitHub Discussions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/discussions)
- **Contributing**: See [CONTRIBUTING.md](../../CONTRIBUTING.md) (if available)

## Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

## License

MIT - See [LICENSE](./LICENSE) for details.
