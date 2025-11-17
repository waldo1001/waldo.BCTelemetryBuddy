# @bctb/shared

Shared core library for BC Telemetry Buddy.

## Purpose

This package contains the core business logic shared between the MCP server and VSCode extension:

- **Authentication** (`auth.ts`) - Azure AD authentication flows
- **Kusto Query** (`kusto.ts`) - KQL execution and result parsing
- **Caching** (`cache.ts`) - LRU cache for query results
- **Query Management** (`queries.ts`) - Saved query storage and retrieval
- **Sanitization** (`sanitize.ts`) - PII removal and data sanitization
- **Event Lookup** (`eventLookup.ts`) - Telemetry event catalog

## Usage

This is a **private package** and is not published to NPM. It gets bundled into both the MCP server and VSCode extension during their build processes.

### In MCP Server

```typescript
import { AuthService, KustoService } from '@bctb/shared';
```

### In VSCode Extension

```typescript
import { AuthService, KustoService } from '@bctb/shared';
```

## Development

```bash
# Install dependencies
npm install

# Build
npm run build

# Watch mode
npm run dev

# Run tests
npm test

# Test with coverage
npm run test:coverage
```

## Architecture

This package is part of the BC Telemetry Buddy monorepo and uses TypeScript project references for efficient builds.

```
packages/
├── shared/     (this package - core logic)
├── mcp/        (uses @bctb/shared)
└── extension/  (uses @bctb/shared)
```

## Not Published

This package is marked as `"private": true` and will never be published to NPM. It exists solely to share code between the MCP server and extension at build time.
