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

Example:

{
	"bctb.mcp.connectionName": "MyTenant-AI",
	"bctb.mcp.tenantId": "<azure-tenant-guid>",
	"bctb.mcp.clientId": "<app-client-id-or-empty-for-device-flow>",
	"bctb.mcp.clientSecret": "<optional-client-secret-if-using-client-credentials>",
	"bctb.mcp.authFlow": "device_code",        // device_code | client_credentials
	"bctb.mcp.applicationInsights.appId": "<app-insights-appid>",
	"bctb.mcp.kusto.clusterUrl": "https://<cluster>.kusto.windows.net",
	"bctb.mcp.cache.enabled": true,
	"bctb.mcp.cache.ttlSeconds": 3600,
	"bctb.mcp.sanitize.removePII": true,
	"bctb.mcp.port": 52345,
	"bctb.mcp.url": "http://localhost:52345", // optional: point to remote MCP
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

Authentication flows
--------------------
- device_code — recommended for development and per-user access. The MCP triggers MSAL device code and user completes sign-in in a browser. No client secret stored in settings.  
- client_credentials — recommended for unattended or server scenarios; use environment variables or OS secret stores for secrets.

Minimal MCP JSON contract
-------------------------
Keep responses concise. The MCP focuses on returning small, actionable context.

Success example:

{
	"type": "table",
	"kql": "traces | summarize count() by severityLevel",
	"summary": "Top severities in last 24h: Error: 12, Warning: 48",
	"columns": ["severityLevel","count_"],
	"rows": [[3,12],[2,48]],
	"chart": { "kind": "bar", "x":"severityLevel", "y":"count_" },
	"recommendations": ["Investigate repeated errors in Service X"],
	"cached": false
}

Error example:

{
	"type": "error",
	"message": "Authentication required",
	"code": "auth_required"
}

Saved-query list example (GET /saved response):

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
3. **NL-to-KQL translation**: Few-shot prompting using GitHub Copilot's LLM
   - Filter local `.kql` files by folder/filename (non-LLM filtering)
   - Filter external references (GitHub repos) by folder/filename
   - LLM analyzes filtered examples for similarity to user's natural language query
   - LLM generates KQL based on most similar examples
4. **External references**: GitHub API first (repos with KQL samples) — web scraping for blogs/docs is lower priority, may be added later.
5. **Embeddings**: Not implemented — use folder/filename filtering + LLM similarity instead.
6. **Extension distribution**: VSCode Marketplace (free extension).
7. **MCP lifecycle**: Auto-start when needed (when workspace settings exist and user triggers query).
8. **Query result UI**: Webview with rich HTML/CSS for tables, charts (better UX than output channel).
9. **MCP registration**: Automatic — extension writes to VSCode MCP registry on activation (similar to community MCP pattern).
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

Change log
----------
2025-10-15 — Full solution instructions created and scaffold plan defined.
2025-10-15 16:25 — Finalized implementation decisions based on requirements discussion (Entry #16, #17).

---
If you'd like, I can now scaffold the MCP TypeScript project and the minimal VSCode extension in this workspace. Tell me your choices for cache backend and auth flow and I will start coding.
I want to create a tool in VSCode (a VSCode Extension) that is a mix of "Azure Data Explorer" and "ChatGPT".  And all that focused on Business Central Telemetry.

Here, you can find more information on Business Central Telemetry: https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview

The tool should be able to query Application Insights data using Kusto Query Language (KQL) and provide insights and recommendations based on the telemetry data.  All from VSCode.

But I see it as an assistant.  So the user should be able to ask questions in natural language, and the tool should basically translate that into KQL queries, execute them, and then present the results in a user-friendly way.  

To make the tool self-learning, whenever it comes with good queries, it should be able to store them in a local form, so that next queries can have context of similar queries to be able to have a better understanding of what the user wants.  I see it as whenever the user is happy with a query, he can "save" it, and then the tool can use that as context for future queries.

The tool should also be able to provide recommendations based on the telemetry data.  For example, if the telemetry data shows that a system is slow because of a specific issue, the tool should be able to recommend a solution to that issue.

To have a set of references, the tool should be able to reference (in settings) to external sources (like GitHub repos, blogs, etc) to be able to learn from them and provide better recommendations.

If all this would be available in the VSCode Chat, that would be awesome.  If that is not possible, a custom UI would be fine as well - just make it a similar user experience.

The tool should have the following features:
1. **Natural Language Processing (NLP)**: The tool should be able to understand natural language queries and translate them into KQL queries.
2. **KQL Execution**: The tool should be able to execute KQL queries against Application Insights and retrieve the results.
3. **Result Presentation**: The tool should present the results in a user-friendly way, such as tables, charts, or graphs.
4. **Self-Learning**: The tool should be able to learn from previous queries and improve its understanding of user intent over time.
5. **Recommendations**: The tool should be able to provide recommendations based on the telemetry data.
6. **User Interface**: The tool should have a user-friendly interface within VSCode, allowing users to easily input queries and view results.
7. **Local Storage**: The tool should be able to store successful queries locally for future reference and context.

MCP (Model Context Protocol) plan — Copilot Agent integration
-----------------------------------------------------------

Goal
----
Provide a lightweight, easy-to-install MCP backend service written in TypeScript (Node + Express) that the Microsoft Copilot Agent (or any other agent that supports MCP) can call. The MCP will centralize authentication to Azure, run Kusto/Application Insights queries, cache results, compute small summaries and recommendations, and expose a compact JSON data contract that agents and the local VSCode extension can consume.

High-level architecture
-----------------------
- MCP backend: TypeScript (Node.js + Express) with these responsibilities:
	- Load workspace-specific connection and auth settings at startup from the VSCode workspace `settings.json` file (see settings section below).
	- Perform MSAL-based authentication (device code / client credentials as configured) to request tokens for Kusto/Application Insights.
	- Expose endpoints: `/auth/status`, `/query`, `/saved`, `/recommend`.
	- Cache query results locally (file-based JSON cache or optional Redis) and optionally compute embeddings for saved queries.
	- Sanitize and summarize results before returning to callers (truncate long textual fields, remove PII if configured).
- VSCode extension (lightweight): discovers/starts MCP locally (or points to provided URL), provides UI to run queries and save them, and can register the MCP for Copilot Agent use if Copilot supports external MCP endpoints.

Workspace settings (example keys)
--------------------------------
Add the following keys to your workspace `settings.json` to configure a connection for the MCP. Each VSCode workspace maps to a single Application Insights connection.

{
	"bctb.mcp.connectionName": "MyTenant-AI",
	"bctb.mcp.tenantId": "<azure-tenant-guid>",
	"bctb.mcp.clientId": "<app-client-id-or-empty-for-device-flow>",
	"bctb.mcp.clientSecret": "<optional-client-secret-if-using-client-credentials>",
	"bctb.mcp.authFlow": "device_code" | "client_credentials",
	"bctb.mcp.applicationInsights.appId": "<app-insights-appid>",
	"bctb.mcp.kusto.clusterUrl": "https://<cluster>.kusto.windows.net",
	"bctb.mcp.cache.enabled": true,
	"bctb.mcp.cache.ttlSeconds": 3600,
	"bctb.mcp.sanitize.removePII": true,
	"bctb.mcp.port": 52345
}

Data contract (compact)
-----------------------
The MCP returns compact JSON payloads optimized for agent consumption. Examples:

Query response (success):

{
	"type": "table",
	"kql": "traces | summarize count() by severityLevel",
	"summary": "Top severities in last 24h: Error: 12, Warning: 48",
	"columns": ["severityLevel","count_"],
	"rows": [[3,12],[2,48]],
	"chart": { "kind": "bar", "x":"severityLevel", "y":"count_" },
	"recommendations": ["Investigate frequent warnings from Service X"],
	"cached": false
}

Error response:

{
	"type": "error",
	"message": "Authentication required",
	"code": "auth_required"
}

Saved query object:

{
	"id": "guid",
	"name": "Slow Database Calls",
	"kql": "dependencies | where duration > 2000 | summarize count() by target",
	"createdBy": "user",
	"createdAt": "2025-10-15T12:34:56Z",
	"embeddingId": "embedding-guid"
}

Install & run (developer-friendly)
----------------------------------
1) Prerequisites: Node 18+, npm/yarn, optional Redis if you want an external cache.
2) Scaffold the MCP directory and install:

	 - Create a workspace folder (e.g., `mcp-server`).
	 - npm init -y && npm install express msal @azure/appinsights axios lru-cache

3) Create a small `server.ts` that reads workspace settings (the VSCode extension will write them to a `.vscode/bctb.settings.json` file or you can supply env vars), implements the routes (see data contract above), and starts the server on `bctb.mcp.port`.

4) Start the server locally:

```powershell
# from project root
node dist/server.js
```

VSCode integration notes
------------------------
- The VSCode extension will: detect and start a local MCP, or use `bctb.mcp.url` if the MCP is remote; load `bctb.*` workspace settings and write a local copy to `.vscode/bctb.settings.json` for the MCP to consume at startup.  
- Provide UI commands: "Run NL query (MCP)", "Save query", "Open MCP status".
- If Copilot Agent supports registering external MCPs, the extension can register the MCP endpoint so Copilot Chat can call it. If not, the extension can still open Copilot Chat with a prefilled prompt and include the MCP response in a local note.

Security and compliance
-----------------------
- Treat `clientSecret` carefully — prefer `device_code` or client credentials with certificate-based auth for production. Do not commit secrets to source control. Use workspace-level `settings.json` and advise users to store secrets in environment variables or use a secure secret store.
- Encrypt cache files at rest if storing telemetry results locally. Add explicit consent text in the extension before caching telemetry.

Next steps
----------
- I will scaffold a minimal TypeScript MCP server (Express) with `/auth/status` and `/query` endpoints, MSAL device code flow, and a simple file-based cache, plus a minimal VSCode extension that writes workspace settings for the MCP and can start the local server.  
- Tell me if you prefer Redis for caching or the default file-based cache, and whether you want to use `device_code` or `client_credentials` as the initial auth flow for the prototype.