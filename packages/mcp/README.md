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

The server exposes **10 tools** to language models (GitHub Copilot) for systematic telemetry analysis:

### Discovery Tools (Step 1 & 2 of workflow)
- **`bctb_get_event_catalog`**: List available BC telemetry events with descriptions, frequency, status, and Learn URLs
  - Parameters: `daysBack` (default: 10), `status` filter, `minCount` threshold
  - Returns: Event IDs sorted by frequency with occurrence counts and documentation links
  - **When to use**: Start of any exploratory query - discover what events are firing

- **`bctb_get_event_schema`**: Get detailed schema (customDimensions fields) for a specific event ID
  - Parameters: `eventId` (required), `sampleSize` (default: 100)
  - Returns: Available fields with data types and example values, plus sample query
  - **When to use**: After discovering relevant event IDs - understand available data fields

- **`bctb_get_tenant_mapping`**: Discover company names and map to Azure tenant IDs
  - Parameters: `daysBack` (default: 10), `companyNameFilter` (optional)
  - Returns: Company name to tenant ID mapping table
  - **When to use**: For customer-specific queries - map friendly names to tenant IDs

### Query Execution (Step 4 of workflow)
- **`bctb_query_telemetry`**: Execute KQL or natural language queries
  - Parameters: `kql` (direct query) OR `nl` (natural language), `useContext`, `includeExternal`
  - Returns: Query results with summary, recommendations, and chart suggestions
  - **When to use**: After discovery and understanding phases - execute the actual query

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

### 2. Understand Schema (`bctb_get_event_schema`)
- **Purpose**: Learn what customDimensions fields are available for each event
- **When**: After discovering relevant event IDs
- **Example**: Get schema for RT0010 → See fields like `alObjectType`, `alObjectName`, `alStackTrace`, etc.

### 3. Check Saved Queries (`bctb_search_queries` or `bctb_get_saved_queries`)
- **Purpose**: Find existing proven patterns before writing new KQL
- **When**: After understanding schema, before generating query
- **Example**: Search for "error" → Find team's existing error analysis queries

### 4. Execute Query (`bctb_query_telemetry`)
- **Purpose**: Run the KQL query against Application Insights
- **When**: After discovery, understanding, and pattern checking
- **Context**: Backend includes saved queries and external references for NL-to-KQL translation

### 5. Analyze Results (`bctb_get_recommendations`)
- **Purpose**: Get actionable insights and next steps
- **When**: After query execution
- **Example**: "High error rate detected → Check recent deployments"

**For Customer-Specific Queries**, add this step:
- **Before Step 4**: Call `bctb_get_tenant_mapping` to map company name to tenant ID
- **Example**: "Contoso" → "12345678-1234-..." → Filter KQL by aadTenantId

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

**Azure CLI** (recommended, default):
- Uses cached credentials from existing `az login` session
- **No additional configuration needed** - just set `authFlow: "azure_cli"`
- No tenant ID, client ID, or secrets required
- Works for interactive development
- Supports all Azure resources you have access to

**Device Code**:
- Browser-based authentication with device code flow
- Requires `bctb.mcp.tenantId` (no client ID needed)
- Interactive prompt each time MCP starts
- No Azure app registration required
- Good fallback when Azure CLI is not available

**Client Credentials**:
- Service principal for automation and unattended scenarios
- Requires `bctb.mcp.tenantId`, `bctb.mcp.clientId`
- Secret provided via `BCTB_CLIENT_SECRET` environment variable (never in settings.json)
- Best for CI/CD pipelines, scheduled jobs, production automation

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
