# BC Telemetry Buddy - MCP Server

Model Context Protocol (MCP) backend server for querying Business Central telemetry from Application Insights/Kusto.

## Overview

This is the backend server component that provides telemetry access to the VSCode extension and GitHub Copilot. It implements the Model Context Protocol (MCP) specification for language model integration.

## Features

- **Authentication**: Azure CLI, Device Code, and Client Credentials flows via MSAL
- **Query Execution**: Execute KQL queries against Application Insights/Kusto
- **Event Discovery**: Browse available telemetry event catalog and schemas
- **Query Management**: Save/load queries with metadata and automatic organization
- **Pattern Matching**: Generate KQL from natural language using saved query patterns
- **Caching**: File-based result caching with configurable TTL
- **Tenant Mapping**: Resolve company names to Azure tenant IDs
- **External References**: Fetch KQL examples from GitHub repositories
- **PII Sanitization**: Optional privacy-focused data sanitization

## MCP Tools

The server exposes these tools to language models (GitHub Copilot):

### Query Execution
- **`bctb_query_telemetry`**: Execute KQL or natural language queries
  - Supports direct KQL execution
  - Translates natural language to KQL using pattern matching from saved queries
  - Automatic context injection from workspace and external references

### Discovery
- **`bctb_get_event_catalog`**: List available BC telemetry events (RT0001, RT0005, etc.)
- **`bctb_get_event_schema`**: Get detailed schema for specific event including customDimensions fields
- **`bctb_get_tenant_mapping`**: Resolve company names to Azure tenant IDs

### Query Library
- **`bctb_get_saved_queries`**: List all saved queries with optional tag filtering
- **`bctb_search_queries`**: Search saved queries by keyword/purpose
- **`bctb_save_query`**: Save query with metadata and automatic organization
  - Generic queries: `queries/[Category]/[QueryName].kql`
  - Customer queries: `queries/Companies/[CompanyName]/[Category]/[QueryName].kql`

### Cache Management
- **`bctb_get_cache_stats`**: Get cache statistics (size, entry count, expirations)
- **`bctb_clear_cache`**: Clear all cached results
- **`bctb_cleanup_cache`**: Remove expired cache entries

## Server Modes

### STDIO Mode (Default for Copilot)
VSCode automatically manages the server in STDIO mode for GitHub Copilot integration:
```json
{
  "mcpServers": {
    "bc-telemetry-buddy": {
      "command": "node",
      "args": ["path/to/server.js"],
      "env": {
        "BCTB_TENANT_ID": "...",
        "BCTB_APP_INSIGHTS_APP_ID": "...",
        "BCTB_KUSTO_CLUSTER_URL": "..."
      }
    }
  }
}
```

### HTTP Mode (For Command Palette)
Manually start for direct API access:
```bash
npm start
```

Server runs on `http://localhost:52345` (configurable via `bctb.mcp.port`).

## Configuration

Configuration is provided via:
1. **VSCode Settings**: Extension reads `.vscode/settings.json` and passes to MCP server
2. **Environment Variables**: For sensitive values like client secrets

### Required Configuration
```json
{
  "bctb.mcp.tenantId": "azure-tenant-id",
  "bctb.mcp.applicationInsights.appId": "app-insights-app-id",
  "bctb.mcp.kusto.clusterUrl": "https://ade.applicationinsights.io/subscriptions/<id>",
  "bctb.mcp.authFlow": "azure_cli"
}
```

### Authentication Flows

**Azure CLI** (recommended):
- Uses cached credentials from `az login`
- No additional configuration needed
- Works for interactive development

**Device Code**:
- Browser-based authentication
- Requires `bctb.mcp.tenantId` and `bctb.mcp.clientId`
- Interactive prompt each time MCP starts

**Client Credentials**:
- Service principal for automation
- Requires `bctb.mcp.tenantId`, `bctb.mcp.clientId`
- Secret provided via `BCTB_CLIENT_SECRET` environment variable (never in settings.json)

### Optional Configuration
```json
{
  "bctb.queries.folder": "queries",
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 3600,
  "bctb.mcp.sanitize.removePII": false
}
```

## Development

### Prerequisites
- Node.js 18+
- npm 9+
- Azure CLI (for `azure_cli` auth flow)

### Build
```bash
npm install
npm run build
```

### Test
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage
```

### Watch Mode
```bash
npm run dev
```

### Manual Testing
```bash
# Start HTTP server
npm start

# Query with curl
curl -X POST http://localhost:52345/query \
  -H "Content-Type: application/json" \
  -d '{"kql": "traces | take 10"}'
```

## Architecture

### Core Modules

**`server.ts`** - Main entry point, handles STDIO/HTTP mode selection, request routing

**`auth/`** - Authentication handling
- `auth.ts` - MSAL integration, supports Azure CLI, Device Code, Client Credentials
- Token caching and refresh

**`kusto/`** - Query execution
- `kusto.ts` - Kusto client wrapper, query execution, error handling
- Application Insights API integration

**`queries/`** - Query library management
- `queries.ts` - Save/load/search queries from workspace
- Pattern matching for NL-to-KQL translation
- Customer-specific folder organization

**`cache/`** - Result caching
- `cache.ts` - File-based caching with TTL
- Automatic cleanup of expired entries

**`config/`** - Configuration management
- `config.ts` - Load settings from VSCode or environment variables
- Validation and defaults

**`sanitize/`** - PII protection
- `sanitize.ts` - Optional PII removal from query results

**`references/`** - External resources
- `references.ts` - Fetch KQL examples from GitHub repos

### Data Flow

1. **Request**: Language model (Copilot) or VSCode extension calls MCP tool
2. **Authentication**: Server acquires Azure token via configured auth flow
3. **Discovery** (if needed): Browse event catalog/schemas
4. **Query Generation**: If natural language provided, match patterns from saved queries to generate KQL
5. **Execution**: Execute KQL against Application Insights via Kusto API
6. **Caching**: Store results with TTL
7. **Response**: Return formatted results to caller

## Testing

Test coverage requirements: 70% minimum (enforced by CI)

Current coverage (excluding server.ts entry point):
- Statements: 83%+
- Branches: 75%+
- Functions: 95%+
- Lines: 83%+

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## License

MIT
