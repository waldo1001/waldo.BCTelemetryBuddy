# BC Telemetry Buddy - User Guide

Welcome to **BC Telemetry Buddy**, your intelligent companion for querying Business Central telemetry data directly from Visual Studio Code using natural language and GitHub Copilot.

## Table of Contents

1. [What is BC Telemetry Buddy?](#what-is-bc-telemetry-buddy)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [First-Time Setup](#first-time-setup)
5. [Authentication](#authentication)
6. [Using the Extension](#using-the-extension)
7. [Querying Telemetry](#querying-telemetry)
8. [Saving Queries](#saving-queries)
9. [External References](#external-references)
10. [GitHub Copilot Integration](#github-copilot-integration)
11. [Advanced Configuration](#advanced-configuration)
12. [Troubleshooting](#troubleshooting)
13. [FAQ](#faq)

---

## What is BC Telemetry Buddy?

BC Telemetry Buddy enables you to:

- 🔍 **Query Business Central telemetry** from Application Insights/Kusto using KQL or natural language
- 🤖 **Use GitHub Copilot** to generate KQL queries from your questions
- 💾 **Save and reuse queries** as `.kql` files in your workspace
- 🧠 **Build context** from saved queries and external sources for better query generation
- 📊 **Visualize results** in rich tables and charts
- 💡 **Get recommendations** based on telemetry patterns and best practices

The extension runs a lightweight MCP (Model Context Protocol) backend that handles authentication, query execution, caching, and context management, making it easy to integrate with GitHub Copilot.

---

## Prerequisites

Before installing BC Telemetry Buddy, ensure you have:

### Required
- **Visual Studio Code** 1.85.0 or later
- **Node.js** 18.0.0 or later
- **npm** 9.0.0 or later
- **Azure Application Insights** access for your Business Central environment
- **Azure tenant** with permissions to authenticate

### Optional
- **GitHub Copilot** subscription (for natural language queries)
- **Azure service principal** (for unattended/automated scenarios)

---

## Installation

### From VSCode Marketplace

1. Open Visual Studio Code
2. Go to **Extensions** (Ctrl+Shift+X / Cmd+Shift+X)
3. Search for **"BC Telemetry Buddy"**
4. Click **Install**
5. Reload VSCode when prompted

### From VSIX File

1. Download the `.vsix` file from the releases page
2. Open VSCode
3. Go to **Extensions** (Ctrl+Shift+X / Cmd+Shift+X)
4. Click the `...` menu → **Install from VSIX...**
5. Select the downloaded file
6. Reload VSCode

---

## First-Time Setup

After installation, configure BC Telemetry Buddy for your workspace:

### 1. Open Workspace Settings

Open your workspace's `.vscode/settings.json` file (or create it if it doesn't exist).

### 2. Add Required Settings

Add the following configuration (replace placeholders with your actual values):

```json
{
  "bctb.mcp.connectionName": "MyBC-Production",
  "bctb.mcp.tenantId": "your-azure-tenant-id",
  "bctb.mcp.authFlow": "device_code",
  "bctb.mcp.applicationInsights.appId": "your-app-insights-id",
  "bctb.mcp.kusto.clusterUrl": "https://your-cluster.kusto.windows.net",
  "bctb.mcp.port": 52345,
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 3600
}
```

### 3. Get Your Application Insights Details

To find your Application Insights details:

1. Go to the **Azure Portal** (https://portal.azure.com)
2. Navigate to your **Application Insights** resource
3. Copy the **Application ID** from the Overview page
4. Note the **Kusto cluster URL** (usually in the format `https://ade.applicationinsights.io/subscriptions/...`)

### 4. Start the MCP Server

Open the **Command Palette** (Ctrl+Shift+P / Cmd+Shift+P) and run:

```
BC Telemetry Buddy: Start MCP Server
```

The extension will:
- Validate your settings
- Start the MCP backend server
- Show a confirmation message when ready

---

## Authentication

BC Telemetry Buddy supports two authentication methods:

### Device Code Flow (Recommended)

**Best for:** Individual developers, interactive use

**How it works:**
1. The MCP server initiates device code authentication
2. You'll see a notification with a code and URL
3. Open the URL in your browser
4. Enter the code and sign in with your Azure account
5. Grant permissions when prompted
6. Return to VSCode — you're authenticated!

**No Azure app registration required!** This is the easiest way to get started.

**To configure:**
```json
{
  "bctb.mcp.authFlow": "device_code",
  "bctb.mcp.tenantId": "your-azure-tenant-id"
}
```

### Client Credentials Flow

**Best for:** Service accounts, CI/CD pipelines, unattended scenarios

**How it works:**
1. Create an Azure service principal with Application Insights read permissions
2. Configure the client ID and secret
3. The MCP server authenticates automatically on startup

**To configure:**
```json
{
  "bctb.mcp.authFlow": "client_credentials",
  "bctb.mcp.tenantId": "your-azure-tenant-id",
  "bctb.mcp.clientId": "your-service-principal-client-id",
  "bctb.mcp.clientSecret": "your-client-secret"
}
```

⚠️ **Security Note:** For client credentials, consider using environment variables instead of storing secrets in settings:

```json
{
  "bctb.mcp.clientId": "${env:BCTB_CLIENT_ID}",
  "bctb.mcp.clientSecret": "${env:BCTB_CLIENT_SECRET}"
}
```

---

## Using the Extension

BC Telemetry Buddy provides several commands accessible from the **Command Palette** (Ctrl+Shift+P / Cmd+Shift+P):

### Available Commands

| Command | Description |
|---------|-------------|
| `BC Telemetry Buddy: Start MCP Server` | Start the MCP backend server |
| `BC Telemetry Buddy: Run Natural Language Query` | Query telemetry using plain English |
| `BC Telemetry Buddy: Save Query` | Save a query as a `.kql` file |
| `BC Telemetry Buddy: Open Queries Folder` | Open saved queries folder in explorer |

---

## Querying Telemetry

### Using Natural Language (with GitHub Copilot)

1. Open **GitHub Copilot Chat** (Ctrl+Alt+I / Cmd+Alt+I)
2. Type your question in plain English:
   ```
   @workspace Show me all errors in the last 24 hours
   ```
3. Copilot will:
   - Search your saved `.kql` queries for similar examples
   - Fetch relevant KQL from configured external references
   - Generate an appropriate KQL query
   - Execute it via the MCP backend
   - Display results in a formatted view

**Example queries:**
- "What are the slowest database operations today?"
- "Show me failed web service calls in the last hour"
- "How many sessions started in the past week?"
- "Which reports are causing the most timeouts?"

### Using the Command

1. Run `BC Telemetry Buddy: Run Natural Language Query`
2. Enter your question in the input box
3. View results in a webview with tables and charts

### Using KQL Directly

If you know KQL, you can query directly via GitHub Copilot:

```
@workspace Run this KQL: requests | where success == false | take 10
```

---

## Saving Queries

When you find a useful query, save it for future reference and context building:

### Via Command

1. Run `BC Telemetry Buddy: Save Query`
2. Enter a **query name** (e.g., "Slow Dependencies")
3. Enter the **KQL query**
4. Optionally add a **description**
5. Optionally add **tags** (comma-separated)

The query is saved to `.vscode/bctb/queries/` as a `.kql` file.

### Via GitHub Copilot

After executing a query via Copilot Chat:

```
@workspace Save this query as "Slow Dependencies" with tags: performance, database
```

### Query File Format

Saved queries follow this format:

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

### Managing Saved Queries

- **Browse queries:** Run `BC Telemetry Buddy: Open Queries Folder`
- **Edit queries:** Open `.kql` files in VSCode and edit them directly
- **Delete queries:** Delete the `.kql` file
- **Share queries:** Commit `.kql` files to your team repository (ensure no PII!)

---

## External References

Improve query generation by configuring external KQL sources:

### Adding References

In your `.vscode/settings.json`:

```json
{
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

### Reference Types

- **`github`**: Fetches KQL examples from GitHub repositories
- **`web`**: Fetches KQL from blog posts and documentation (v2 feature)

### How It Works

When you query with natural language:
1. Copilot generates search terms
2. MCP searches your saved `.kql` files
3. MCP fetches and searches configured external references
4. All matching examples are returned to Copilot
5. Copilot generates the final KQL using the most relevant examples

**Benefits:**
- Better query accuracy with more context
- Learn from community examples
- Leverage official Microsoft samples
- Share knowledge across your team

---

## GitHub Copilot Integration

BC Telemetry Buddy integrates seamlessly with GitHub Copilot through MCP tools.

### Available Tools

When you have Copilot and BC Telemetry Buddy installed, Copilot can:

| Tool | Description |
|------|-------------|
| `query_telemetry` | Execute KQL or natural language queries |
| `get_saved_queries` | List saved queries with optional tag filtering |
| `save_query` | Save a query for future reference |
| `get_recommendations` | Analyze results and provide actionable insights |

### Usage Examples

**Query telemetry:**
```
@workspace Show me all page view events from the last hour
```

**List saved queries:**
```
@workspace What saved queries do I have for performance analysis?
```

**Save a query:**
```
@workspace Save this query as "Error Summary" with tags: errors, monitoring
```

**Get recommendations:**
```
@workspace Analyze these errors and recommend fixes
```

### Context Awareness

Copilot automatically uses:
- ✅ Your saved `.kql` queries
- ✅ Configured external references (GitHub, docs)
- ✅ Query execution history (cached results)
- ✅ Workspace-specific settings

This context helps Copilot generate more accurate, relevant KQL queries.

---

## Advanced Configuration

### Caching

Control query result caching:

```json
{
  "bctb.mcp.cache.enabled": true,
  "bctb.mcp.cache.ttlSeconds": 3600  // 1 hour
}
```

Cache is stored in `.vscode/.bctb/cache/` (automatically excluded from git).

### PII Sanitization

Enable optional PII redaction (opt-in):

```json
{
  "bctb.mcp.sanitize.removePII": true
}
```

When enabled, the MCP will redact:
- Email addresses
- IP addresses (partial)
- GUIDs (partial)
- Common PII patterns

⚠️ **Note:** Business Central telemetry should not contain PII, but this provides an extra safety layer.

### Retry Configuration

Configure how many times Copilot retries failed queries:

```json
{
  "bctb.agent.maxRetries": 3
}
```

### Multiple Workspaces

Each workspace can have its own configuration:

- **Workspace A** (Production): Points to production Application Insights
- **Workspace B** (Test): Points to test environment
- **Workspace C** (Customer): Points to customer's tenant

Just configure different settings in each workspace's `.vscode/settings.json`.

### Custom Port

If port 52345 is already in use:

```json
{
  "bctb.mcp.port": 52346,
  "bctb.mcp.url": "http://localhost:52346"
}
```

---

## Troubleshooting

### MCP Server Won't Start

**Symptoms:** Error when running "Start MCP Server" command

**Solutions:**
1. Check that Node.js 18+ is installed: `node --version`
2. Verify workspace settings are configured correctly
3. Check if port 52345 is available (or configure a different port)
4. Check the **Output** panel (View → Output → "BC Telemetry Buddy")

### Authentication Failed

**Symptoms:** "Authentication required" error when querying

**Solutions:**

For **device_code flow:**
1. Run `BC Telemetry Buddy: Start MCP Server` again
2. Complete the device code authentication in your browser
3. Ensure you have permissions to access Application Insights

For **client_credentials flow:**
1. Verify client ID and secret are correct
2. Check service principal has "Reader" role on Application Insights
3. Confirm tenant ID is correct

### No Results Returned

**Symptoms:** Query executes but returns empty results

**Solutions:**
1. Check if your Application Insights has data for the time range
2. Verify the KQL query syntax is correct
3. Try a simpler query first: `requests | take 10`
4. Check if you have permissions to read telemetry data

### Copilot Doesn't Use Saved Queries

**Symptoms:** Generated queries ignore saved examples

**Solutions:**
1. Ensure queries are saved in `.vscode/bctb/queries/` folder
2. Check query files follow the correct format (with comment headers)
3. Verify MCP server is running
4. Try including more context in your natural language query

### External References Not Working

**Symptoms:** GitHub references not being fetched

**Solutions:**
1. Check internet connectivity
2. Verify GitHub URLs are correct and public
3. Check rate limiting (60 requests/hour for unauthenticated)
4. Look for errors in Output panel

---

## FAQ

### Do I need GitHub Copilot to use this extension?

No! You can use the extension without Copilot by:
- Running `BC Telemetry Buddy: Run Natural Language Query` command
- Writing KQL queries directly in saved `.kql` files
- Using the extension's commands to query and save queries

However, **Copilot integration provides the best experience** for natural language queries and contextual assistance.

### Will this work with GitHub Copilot Free?

Yes! BC Telemetry Buddy uses your existing GitHub Copilot license (Free, Pro, or Enterprise). No additional costs.

### Can I use this with multiple Business Central environments?

Yes! Each VSCode workspace can connect to a different Application Insights instance. Create separate workspace folders for each environment.

### Are my queries and telemetry data sent to OpenAI?

When using natural language queries with GitHub Copilot:
- Your **natural language question** is sent to Copilot's LLM
- **Saved query metadata** (comments, descriptions) is sent as context
- **External reference content** (KQL examples) is sent as context
- **Raw telemetry data** is NOT sent to the LLM (only query results summary if you ask for analysis)

The MCP backend runs locally and only sends what's necessary for query generation.

### Can I commit my `.kql` files to git?

**Yes!** Saved queries (`.kql` files) are designed to be committed and shared with your team. They:
- Should NOT contain PII or sensitive data
- Provide valuable knowledge base for your team
- Help everyone generate better queries

**Do NOT commit:**
- `.vscode/.bctb/cache/` (cached results)
- `.vscode/.bctb/references-cache/` (external references cache)
- Workspace settings with secrets

### How do I update the extension?

VSCode will automatically notify you when updates are available. You can also:
1. Go to Extensions
2. Find "BC Telemetry Buddy"
3. Click **Update** if available

### How do I uninstall?

1. Go to Extensions
2. Find "BC Telemetry Buddy"
3. Click **Uninstall**
4. Optionally delete `.vscode/bctb/` folder from your workspace

### Where can I get help?

- 📖 **Documentation:** [GitHub Repository](https://github.com/waldo1001/waldo.BCTelemetryBuddy)
- 🐛 **Report Issues:** [GitHub Issues](https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues)
- 💬 **Discussions:** [GitHub Discussions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/discussions)

---

## Next Steps

Now that you're set up:

1. ✅ **Save your first query** - Run a simple KQL query and save it
2. ✅ **Add external references** - Configure the BCTech GitHub samples
3. ✅ **Try natural language** - Ask Copilot a question about your telemetry
4. ✅ **Build your query library** - Save queries as you discover useful patterns
5. ✅ **Share with your team** - Commit `.kql` files to your repository

Happy querying! 🚀
