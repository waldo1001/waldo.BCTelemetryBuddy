Business Central Telemetry Buddy — Full Solution Instructions
==============================================================

Purpose
-------
This document describes a complete, developer-friendly solution to query Business Central telemetry (Application Insights / Kusto) from VSCode, provide natural-language interaction, and expose telemetry context to Microsoft Copilot Agents via a lightweight MCP (Model Context Protocol) backend.

What you’ll get
---------------
- A small TypeScript MCP backend (Node + Express) that: authenticates to Azure, runs KQL, caches results, sanitizes data, computes short summaries and recommendations, and exposes a compact JSON API.  
- A minimal VSCode extension (TypeScript) that: manages per-workspace connection settings, starts/points to the MCP, runs NL queries, saves queries locally, and can register or surface MCP results to Copilot Chat where supported.

High-level architecture
-----------------------
- VSCode workspace contains per-workspace settings with the Application Insights connection. Each workspace represents a single telemetry connection.  
- VSCode extension reads/writes the workspace settings, can start a local MCP process, and provides a simple UI/commands to interact with telemetry.  
- MCP exposes endpoints (/auth/status, /query, /saved, /recommend) and returns small, structured JSON payloads the Copilot Agent or the extension can consume.

Workspace settings (per-workspace)
---------------------------------
Add the following keys to your workspace `.vscode/settings.json`. Each workspace maps to one connection. Keep secrets out of version control.

```json
{
	"bctb.mcp.connectionName": "MyTenant-AI",
	"bctb.mcp.tenantId": "<azure-tenant-guid>",
	"bctb.mcp.clientId": "<app-client-id-or-empty-for-device-flow>",
	"bctb.mcp.clientSecret": "<optional-client-secret-if-using-client-credentials>",
	"bctb.mcp.authFlow": "device_code",
	"bctb.mcp.applicationInsights.appId": "<app-insights-appid>",
	"bctb.mcp.kusto.clusterUrl": "https://<cluster>.kusto.windows.net",
	"bctb.mcp.cache.enabled": true,
	"bctb.mcp.cache.ttlSeconds": 3600,
	"bctb.mcp.sanitize.removePII": false,
	"bctb.mcp.port": 52345,
	"bctb.mcp.url": "http://localhost:52345",
	"bctb.agent.maxRetries": 3,
	"bctb.mcp.references": [
		{
			"name": "BC Telemetry Samples",
			"type": "github",
			"url": "https://github.com/microsoft/BCTech/tree/master/samples/AppInsights",
			"enabled": true
		},
		{
			"name": "Waldo's Blog",
			"type": "web",
			"url": "https://www.waldo.be/category/dynamics-nav-business-central/",
			"enabled": true
		}
	]
}
```

**Key settings:**
- `bctb.mcp.authFlow`: `"device_code"` (recommended, no Azure setup) or `"client_credentials"` (for service accounts)
- `bctb.mcp.cache.enabled`: Enable file-based caching of query results
- `bctb.mcp.sanitize.removePII`: Opt-in PII redaction (default: `false`)
- `bctb.agent.maxRetries`: How many times Copilot agent should retry failed queries
- `bctb.mcp.references`: External KQL sources for context (GitHub repos, blogs)

Authentication flows
--------------------
- device_code — recommended for development and per-user access. The MCP triggers MSAL device code and user completes sign-in in a browser. No client secret stored in settings.  
- client_credentials — recommended for unattended or server scenarios; use environment variables or OS secret stores for secrets.

MCP JSON contract
-----------------
The MCP returns small, structured JSON payloads optimized for agent consumption.

**Success response:**
```json
{
	"type": "table",
	"kql": "traces | summarize count() by severityLevel",
	"summary": "Top severities in last 24h: Error: 12, Warning: 48",
	"columns": ["severityLevel", "count_"],
	"rows": [[3, 12], [2, 48]],
	"chart": { "kind": "bar", "x": "severityLevel", "y": "count_" },
	"recommendations": ["Investigate repeated errors in Service X"],
	"cached": false
}
```

**Error response:**
```json
{
	"type": "error",
	"message": "Authentication required",
	"code": "auth_required"
}
```

**Saved queries list (GET /saved):**
```json
{
	"type": "saved_queries",
	"queries": [
		{
			"id": "slow-dependencies",
			"name": "Slow Database Dependencies",
			"filePath": ".vscode/bctb/queries/slow-dependencies.kql",
			"description": "Find all database calls taking longer than 2 seconds",
			"tags": ["performance", "database", "dependencies"],
			"createdBy": "user",
			"createdAt": "2025-10-15T12:34:56Z"
		}
	]
}
```

Core MCP endpoints
------------------
- GET /auth/status — returns { authenticated: true|false, user?: "user@org" }
- POST /query — body: { kql?: string, nl?: string, maxRows?: number, useContext?: true, includeExternal?: true } — returns success/error payload. If `nl` is provided and `useContext` is true, the MCP loads all saved `.kql` files and includes them as examples when translating NL to KQL. If `includeExternal` is true, the MCP also fetches and includes KQL examples from configured external references.
- GET /saved — scans `.vscode/bctb/queries/` folder and returns list of saved queries with metadata extracted from comments
- POST /saved — body: { name: string, kql: string, description?: string, tags?: string[] } — saves query as a `.kql` file in `.vscode/bctb/queries/<sanitized-name>.kql` with formatted comments
- POST /recommend — body: { kql? rows? } — returns recommendations[]

Caching options
---------------
- Prototype: file-based cache under workspace `.vscode/.bctb/cache/` for simplicity.
- Production: optional Redis (configure via env var `BCTB_REDIS_URL`). Cache TTL configured by `bctb.mcp.cache.ttlSeconds`.

Security & privacy
------------------
- Never commit secrets or telemetry to git. Add to `.gitignore`:
  ```
  .vscode/bctb/cache/
  .vscode/bctb/embeddings/
  .vscode/bctb/references-cache/
  .vscode/bctb.settings.json
  ```
- Users CAN commit `.vscode/bctb/queries/*.kql` files to share knowledge across the team (ensure no PII in saved queries).
- Users CAN commit workspace settings with `bctb.mcp.references` array to share external reference sources.
- Prefer `device_code` for dev. For `client_credentials`, load secrets from process env or a secure vault.
- If `bctb.mcp.sanitize.removePII` is true, MCP will redact common PII (emails, IP-like strings, GUIDs) before caching or returning results.
- For LLM-assisted NL-to-KQL translation, require explicit opt-in and show the user what data will be sent.
- External reference fetching: implement rate limiting (e.g., max 10 requests per minute per source) and respect robots.txt for web sources.

Developer quickstart — MCP prototype (TypeScript)
------------------------------------------------
Follow these steps to scaffold a minimal MCP server locally.

Prerequisites
- Node.js (18+), npm or yarn

Scaffold and install dependencies

```powershell
mkdir bctb-mcp
cd bctb-mcp
npm init -y
npm install express axios lru-cache msal @azure/appinsights typescript ts-node-dev
npx tsc --init
```

Create the files below under `src/`:
- `src/server.ts` — Express server startup and route registration; implements MCP server protocol for VSCode
- `src/auth.ts` — MSAL client wrapper (device code & client creds)
- `src/kusto.ts` — small wrapper to call Application Insights/Kusto REST API
- `src/cache.ts` — file-based cache implementation
- `src/sanitize.ts` — redaction and summary helpers
- `src/queries.ts` — scans `.vscode/bctb/queries/` folder, parses `.kql` files, extracts metadata from comments, and loads queries as context for NL-to-KQL translation
- `src/references.ts` — fetches and caches content from external references (GitHub repos, web pages), extracts KQL queries, and provides them as additional context for NL-to-KQL translation

Run locally (dev)

```powershell
# from bctb-mcp
npx ts-node-dev src/server.ts
```

Test the server
- POST `http://localhost:52345/query` with body `{ "kql": "requests | take 5" }` and examine the JSON response.

VSCode extension — skeleton
---------------------------
The extension provides basic UX and workspace settings management.

Scaffold
- Use `yo code` to create a TypeScript extension, or scaffold manually.

Key commands to implement in `extension.ts`:
- `bctb.startMCP` — spawn local MCP (use `child_process.spawn`) or verify `bctb.mcp.url`.
- `bctb.runNLQuery` — prompt user for NL query, POST to MCP `/query` with `useContext: true`, render result in a webview or output channel.
- `bctb.saveQuery` — prompt user for query name, description, and tags; POST to MCP `/saved` which creates a `.kql` file in `.vscode/bctb/queries/` with formatted comments and the KQL query.
- `bctb.openQueriesFolder` — open `.vscode/bctb/queries/` folder in VSCode explorer so users can browse/edit saved queries.

Copilot Agent integration
-------------------------
The extension registers the MCP server following the standard MCP protocol for VSCode (similar to community MCP servers). GitHub Copilot can then discover and call the MCP tools directly.

MCP Tools exposed to Copilot:
- `query_telemetry` — Query Business Central telemetry using KQL or natural language
  - Parameters: `query` (string, required), `queryType` ("kql" | "natural", required), `maxRows` (number, optional), `useContext` (boolean, optional, default: true), `includeExternal` (boolean, optional, default: true)
  - Returns: Query results with summary, recommendations, and chart suggestions
  - Context: When `useContext` is true and `queryType` is "natural", the MCP automatically loads all saved `.kql` files from the workspace as examples. When `includeExternal` is true, the MCP also fetches KQL examples from configured external references (GitHub repos, blogs) to maximize context and improve translation accuracy

- `get_saved_queries` — List all saved queries in the current workspace
  - Parameters: `tags` (string[], optional) — filter by tags
  - Returns: List of saved query metadata (name, description, tags, file path)

- `save_query` — Save a successful query for future reference
  - Parameters: `name` (string), `kql` (string), `description` (string, optional), `tags` (string[], optional)
  - Returns: Confirmation and file path where query was saved

- `get_recommendations` — Analyze telemetry results and provide actionable recommendations
  - Parameters: `kql` (string, optional), `rows` (array, optional)
  - Returns: List of recommendations based on patterns, thresholds, and best practices

Installation:
- Users install the extension from the VSCode marketplace
- Extension auto-starts the MCP server on workspace open (if workspace settings are configured)
- MCP is automatically registered with VSCode's MCP registry, making tools available to Copilot
- No manual MCP registration required — follows standard community MCP pattern

Recommendations engine
----------------------
- Start with deterministic heuristics (thresholds, pattern detection) that analyze rows/metrics and return actionable recommendations.
- Optionally augment with LLM summarization (user opt-in).
- Link recommendations to relevant external references configured in workspace settings (e.g., "See similar issue in BCTech samples: [link]").
- External references serve dual purpose: provide context for query generation AND provide links for recommendations.

Self-learning & context sources
-------------------------------
The MCP gathers context from multiple sources to improve NL-to-KQL translation accuracy:

### 1. Workspace saved queries (primary context)
- Save queries as `.kql` files in `.vscode/bctb/queries/`
- Each `.kql` file contains the KQL query with explanatory comments at the top describing the purpose, use case, and context
- The MCP automatically discovers all `.kql` files in the queries folder at startup and when the `/saved` endpoint is called
- When translating natural language to KQL via the `/query` endpoint, the MCP includes saved `.kql` files as context/examples

### 2. External references (online context)
- Configure external sources in workspace settings: `bctb.mcp.references` (array)
- Supported types: `github` (GitHub repos with KQL samples), `web` (blogs, documentation)
- The MCP fetches and caches content from enabled references (with rate limiting and TTL)
- External KQL examples are parsed and included as additional context for NL-to-KQL translation
- Fetched content is cached locally in `.vscode/bctb/references-cache/` to minimize API calls
- Examples of useful references:
  - Microsoft BCTech GitHub repo (official BC telemetry samples)
  - Community blogs with KQL queries (e.g., Waldo's blog, Freddys blog)
  - Internal company documentation repositories

### 3. Embeddings (optional)
- Optionally compute embeddings (local or hosted) and store metadata in `.vscode/bctb/embeddings/`
- Supports similarity-based retrieval for NL translation (finds most relevant saved queries and external examples)

Example saved query file (`.vscode/bctb/queries/slow-dependencies.kql`):

```kql
// Query: Slow Database Dependencies
// Purpose: Find all database calls taking longer than 2 seconds
// Use case: Performance troubleshooting for slow pages
// Created: 2025-10-15 by @username
// Tags: performance, database, dependencies

dependencies
| where type == "SQL"
| where duration > 2000
| summarize count(), avg(duration), max(duration) by target, operation
| order by avg_duration desc
```

Testing and packaging
---------------------
- Add unit tests for the MCP endpoints (Jest/Mocha) using mocked Kusto responses.
- Add a README with configuration and security notes.
- Use `vsce` to package the VSCode extension for publishing.

Next steps (implementation roadmap)
----------------------------------
1) I will scaffold the MCP prototype (Express + MSAL device_code + file cache) with `/auth/status` and `/query` endpoints.
2) I will scaffold the VSCode extension skeleton: commands to write workspace settings, start MCP, and run NL queries.

Implementation decisions (finalized)
-----------------------------------
Based on requirements discussion, the following implementation choices have been made:

### Core architecture decisions
1. **Cache backend**: File-based cache (`.vscode/.bctb/cache/`) — simple, no external dependencies, suitable for local development and production.
2. **Initial auth flow**: `device_code` (primary) — no Azure app registration required, "just works" for developers. Client credentials flow fully documented for unattended scenarios.
3. **NL-to-KQL translation architecture**: 
   - **LLM** (GitHub Copilot in VSCode) analyzes user's natural language query and generates search terms
   - **MCP backend** searches local `.kql` files and external references by content/filename using search terms
   - **MCP backend** returns matching query examples to LLM (does NOT translate NL to KQL itself)
   - **LLM** decides which examples are similar and generates final KQL based on most relevant examples
   - This keeps MCP simple: it's a search engine, not a translator
4. **External references**: GitHub API first (unauthenticated, 60 req/hour) — web scraping for blogs/docs deferred to v2.
5. **Embeddings**: Not implemented — use content/filename search instead.
6. **Extension distribution**: VSCode Marketplace (free extension).
   - Display name: "BC Telemetry Buddy"
   - Package name: `bc-telemetry-buddy`
   - Publisher: `waldo`
7. **MCP lifecycle**: One MCP process per workspace — auto-start when needed, extension passes workspace path via environment variable.
8. **Query result UI**: Webview with rich HTML/CSS for tables, charts (better UX than output channel).
9. **MCP protocol**: Formal MCP JSON-RPC protocol (Model Context Protocol from Anthropic) — extension registers MCP with VSCode on activation.
10. **Query failure handling**: Expose errors to agent (agent retries) — make retry count configurable via setting `bctb.agent.maxRetries`.
11. **PII sanitization**: Opt-in setting `bctb.mcp.sanitize.removePII` (default: false) — applies to both cached results and data sent to LLM. Business Central telemetry should not contain PII, but this provides safety net.
12. **Saved query format**: Strict `.kql` file format with standardized comment headers (query name, purpose, use case, created date, tags).

### Additional settings
Add these to workspace `.vscode/settings.json`:

```json
{
	"bctb.agent.maxRetries": 3,  // How many times agent should retry failed queries
	"bctb.mcp.sanitize.removePII": false  // Opt-in PII redaction (cache + LLM)
}
```

### Saved query file format (strict)
Each `.kql` file in `.vscode/bctb/queries/` must follow this format:

```kql
// Query: <Query Name>
// Purpose: <One-line description of what this query does>
// Use case: <When/why to use this query>
// Created: <YYYY-MM-DD> by <username>
// Tags: <comma-separated tags>

<KQL query here>
```

Example:

```kql
// Query: Slow Database Dependencies
// Purpose: Find all database calls taking longer than 2 seconds
// Use case: Performance troubleshooting for slow pages
// Created: 2025-10-15 by @waldo
// Tags: performance, database, dependencies

dependencies
| where type == "SQL"
| where duration > 2000
| summarize count(), avg(duration), max(duration) by target, operation
| order by avg_duration desc
```

The MCP's `queries.ts` module will parse these comments to extract metadata and provide context for few-shot prompting.

---

## Technical implementation specifications

These implementation-specific decisions clarify how the architecture is built:

1. **NL-to-KQL flow**: MCP backend does NOT translate natural language to KQL. The LLM (GitHub Copilot) provides search terms, MCP searches local `.kql` files and external references by content/filename, MCP returns matching examples, then the LLM decides which are similar and generates final KQL.

2. **MCP protocol**: Use formal **MCP JSON-RPC protocol** (Model Context Protocol specification from Anthropic) — not a custom REST API. This ensures compatibility with VSCode's MCP integration.

3. **Project structure**: **Monorepo** with separate folders for MCP backend and VSCode extension:
   - `packages/mcp/` — MCP backend server
   - `packages/extension/` — VSCode extension
   - Single build command builds both packages
   - Single GitHub repository

4. **Extension naming**:
   - Display name: **"BC Telemetry Buddy"**
   - Package name: **`bc-telemetry-buddy`**
   - Publisher: **`waldo`**

5. **GitHub API authentication**: Unauthenticated API access (60 requests/hour rate limit) — sufficient for fetching reference KQL from known repositories. Client can configure personal access token later if needed.

6. **Web scraping**: Deferred to v2 — focus on GitHub API for external references first.

7. **Logging**:
   - MCP backend: Console output (for debugging)
   - VSCode extension: VSCode Output Channel (standard extension logging)

8. **Workspace discovery**: Extension passes workspace path to MCP backend via **environment variable** when spawning the MCP process.

9. **MCP process lifecycle**: One MCP process per workspace — extension spawns MCP on-demand (when workspace settings exist and user triggers query).

10. **TypeScript configuration**: **ES2022** with **ESM modules** (modern JavaScript, better for MCP protocol compatibility).

---

## Change Log

- **2025-10-15** — Full solution instructions created and scaffold plan defined
- **2025-10-15** — Finalized implementation decisions based on requirements discussion
- **2025-10-15** — Cleaned up and finalized instructions document
- **2025-10-15** — Added technical implementation specifications (NL-to-KQL flow, JSON-RPC protocol, monorepo structure, naming, etc.)