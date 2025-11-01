# BC Telemetry Buddy - User Guide

Welcome to **BC Telemetry Buddy**, your intelligent companion for querying Business Central telemetry data directly from Visual Studio Code with GitHub Copilot and data-driven discovery tools.

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

- 🔍 **Query Business Central telemetry** from Application Insights/Kusto using KQL queries
- 🤖 **Use GitHub Copilot** with discovery tools to generate accurate KQL queries from your questions
- 💾 **Save and reuse queries** as `.kql` files in your workspace
- 🧠 **Build context** from saved queries and external sources for better query generation
- 📊 **Visualize results** in rich tables and charts
- 💡 **Get recommendations** based on telemetry patterns and best practices
- 🔎 **Discover event structure** with field analysis and prevalence detection across events

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
- **GitHub Copilot** subscription (for intelligent query generation with discovery tools)
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

After installation, you have two options to configure BC Telemetry Buddy:

### Option 1: Setup Wizard (Recommended) ⭐

The **Setup Wizard** provides a guided, 5-step process with validation and testing:

1. Open Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`)
2. Run: `BC Telemetry Buddy: Setup Wizard`
3. Follow the steps:
   - **Step 1 - Workspace Check**: Wizard verifies you have a workspace folder open
   - **Step 2 - Azure Configuration**: Enter your tenant ID, Application Insights App ID, and Kusto cluster URL
   - **Step 3 - Authentication**: Choose authentication method (Azure CLI recommended)
   - **Step 4 - Connection Testing**: Wizard validates settings and runs a test query
   - **Step 5 - Complete**: Settings are saved automatically, quick-start tips displayed
   - **Optional**: Check "Install chatmode" to create `.github/chatmodes/BCTelemetryBuddy.chatmode.md` for enhanced Copilot Chat integration

**Benefits**: No manual JSON editing, validation before saving, connection testing, clear error messages.

### Option 2: Manual Configuration

If you prefer manual configuration or need to review/edit settings:

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
4. For **Kusto cluster URL**, use the BC telemetry endpoint:
   - Default: `https://ade.applicationinsights.io/subscriptions/{subscription-id}/resourcegroups/{resource-group}/providers/microsoft.insights/components/{app-insights-name}`
   - You can find this in the Application Insights resource under "API Access"

**Note**: The Setup Wizard pre-fills the Kusto cluster URL format for you.

### 4. Start the MCP Server

The MCP server starts automatically when you:
- Run a query via Command Palette
- Use Copilot to query telemetry
- Run the Setup Wizard

To manually start the server, open the **Command Palette** (Ctrl+Shift+P / Cmd+Shift+P) and run:

```
BC Telemetry Buddy: Start MCP Server
```

The extension will:
- Validate your settings
- Start the MCP backend server
- Show a confirmation message when ready
- Display the server status in the Status Bar

---

## Multi-Root Workspace Support

**⚠️ BC Telemetry Buddy does NOT support multi-root workspaces.**

### Single-Root Workspaces (Supported)

BC Telemetry Buddy works with **single-root workspaces only** (one folder open). Settings are saved to `.vscode/settings.json` in the workspace folder.

### Multi-Root Workspaces (Not Supported)

If you have multiple folders open in a multi-root workspace (`.code-workspace` file), the Setup Wizard will display an error and prevent configuration.

**Why?** 
- The MCP server requires settings to be stored in a folder's `.vscode/settings.json` file
- Multi-root workspaces use workspace files (`.code-workspace`) which are not supported
- This ensures clear, predictable configuration without ambiguity about which settings apply

**Need different telemetry connections for different projects?**

Open each project as a **separate single-root workspace**:
1. Close the multi-root workspace
2. Open each project individually (File → Open Folder)
3. Configure each workspace independently with its own telemetry connection
4. Switch between workspaces as needed

**Example - Correct Setup:**

```
❌ DON'T: Multi-root workspace
MyMultiRootWorkspace.code-workspace
├── ProjectA/
└── ProjectB/

✅ DO: Separate single-root workspaces
Workspace 1: C:\Projects\ProjectA\ (with .vscode/settings.json)
Workspace 2: C:\Projects\ProjectB\ (with .vscode/settings.json)
```

---

## Authentication

BC Telemetry Buddy supports three authentication methods:

### Azure CLI (Recommended) ⭐

**Best for:** Individual developers, interactive use, easiest setup

**How it works:**
1. Ensure you're logged in with Azure CLI: `az login`
2. The MCP server uses your existing Azure CLI credentials automatically
3. **No additional configuration needed** - just set `authFlow` to `azure_cli`

**Benefits:**
- ✅ No Azure app registration required
- ✅ No device code prompts every time
- ✅ Uses your existing Azure session
- ✅ Works for all Azure resources you have access to

**To configure:**
```json
{
  "bctb.mcp.authFlow": "azure_cli"
}
```

**Note:** You don't need to specify `tenantId`, `clientId`, or `clientSecret` when using Azure CLI auth.

### Device Code Flow

**Best for:** When Azure CLI is not available, or for explicit browser-based auth

**How it works:**
1. The MCP server initiates device code authentication
2. You'll see a notification with a code and URL
3. Open the URL in your browser
4. Enter the code and sign in with your Azure account
5. Grant permissions when prompted
6. Return to VSCode — you're authenticated!

**No Azure app registration required!** But you'll need to authenticate each time the MCP server starts.

**To configure:**
```json
{
  "bctb.mcp.authFlow": "device_code",
  "bctb.mcp.tenantId": "your-azure-tenant-id"
}
```

### Client Credentials Flow

**Best for:** Service accounts, CI/CD pipelines, unattended scenarios, automation

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
| `BC Telemetry Buddy: Run KQL Query` | Execute a KQL query directly |
| `BC Telemetry Buddy: Save Query` | Save a query as a `.kql` file |
| `BC Telemetry Buddy: Open Queries Folder` | Open saved queries folder in explorer |

---

## Querying Telemetry

### Using GitHub Copilot (Recommended) ⭐

GitHub Copilot provides the best experience with BC Telemetry Buddy through a **systematic discovery workflow**:

1. Open **GitHub Copilot Chat** (Ctrl+Alt+I / Cmd+Alt+I)
2. Type your question in plain English:
   ```
   @workspace Show me all errors in the last 24 hours
   ```
3. **Copilot automatically follows this workflow:**
   - **Step 1 - Discover Events**: Calls `bctb_get_event_catalog` to find relevant event IDs (e.g., RT0010 for errors)
   - **Step 2 - Understand Schema**: Calls `bctb_get_event_schema` to see available customDimensions fields
   - **Step 3 - Check Saved Queries**: Searches workspace queries for similar patterns
   - **Step 4 - Execute Query**: Generates KQL and calls `bctb_query_telemetry` to run it
   - **Step 5 - Display Results**: Shows formatted results with recommendations

**For customer-specific queries**, Copilot adds a step:
```
@workspace Show me errors for customer Contoso in the last 24 hours
```
- Copilot calls `bctb_get_tenant_mapping` to map "Contoso" to its Azure tenant ID
- Then proceeds with the workflow above, filtering by `aadTenantId`

**Example queries:**
- "What are the slowest database operations today?"
- "Show me failed web service calls in the last hour"
- "How many sessions started in the past week for customer Fabrikam?"
- "Which reports are causing the most timeouts?"
- "What telemetry events are firing most frequently?"

### Using KQL Directly

If you know KQL, you can query directly:

**Via GitHub Copilot:**
```
@workspace Run this KQL: requests | where success == false | take 10
```

**Via Command Palette:**
1. Run `BC Telemetry Buddy: Run KQL Query`
2. Enter your KQL query in the input box
3. View results in a rich webview with tables, charts, and recommendations

**Via CodeLens in .kql files:**
1. Create or open a `.kql` file in your workspace
2. Write your KQL query
3. Click the "▶ Run Query" CodeLens link that appears above the query
4. View results in the webview

### Discovering Available Events

Before querying, you can discover what telemetry events exist:

**Via Copilot:**
```
@workspace What telemetry events are available?
@workspace Show me the schema for event RT0005
```

**Manual Discovery:**
The extension exposes these tools to Copilot:
- **Event Catalog** (`bctb_get_event_catalog`): Lists recent BC telemetry event IDs with descriptions, frequency, and Learn URLs
- **Event Schema** (`bctb_get_event_schema`): Shows available customDimensions fields for a specific event ID

This helps you understand:
- What events are firing in your environment
- What data each event contains (customDimensions fields)
- How frequently events occur
- Microsoft Learn documentation for each event type

---

## Working with Customers (Tenant Mapping)

BC Telemetry Buddy includes powerful features for managing multi-customer environments:

### Automatic Company Discovery

When you query telemetry, the extension can discover all companies/customers in your Application Insights:

**Via Copilot:**
```
@workspace What companies do I have telemetry for?
```

Copilot calls `bctb_get_tenant_mapping` which:
- Scans recent telemetry (default: last 10 days)
- Extracts unique company names and their Azure tenant IDs
- Returns a mapping table for easy reference

### Customer-Specific Queries

When asking about a specific customer:

```
@workspace Show me errors for customer Contoso in the last week
```

**Copilot automatically:**
1. Calls `bctb_get_tenant_mapping` to find Contoso's tenant ID
2. Generates KQL with: `| where tostring(customDimensions.aadTenantId) == "{tenant-id}"`
3. Executes the query and returns customer-specific results

### Saving Customer Queries

When you save a query that filters by tenant/company, it's automatically organized:

**Generic queries** → `queries/[Category]/[QueryName].kql`  
**Customer queries** → `queries/Companies/[CompanyName]/[Category]/[QueryName].kql`

This keeps customer-specific queries isolated and easy to find.

---

## Saving Queries

When you find a useful query, save it for future reference and context building:

### Via Command

1. Run `BC Telemetry Buddy: Save Query`
2. Enter a **query name** (e.g., "Slow Dependencies")
3. Enter the **KQL query**
4. Optionally add a **description**
5. Optionally add **tags** (comma-separated)
6. Optionally specify a **company name** (for customer-specific queries)

The query is saved to `.vscode/bctb/queries/` (or `queries/Companies/{CompanyName}/` for customer queries) as a `.kql` file.

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

When Copilot generates KQL queries:
1. Copilot analyzes your question and determines which discovery tools to use
2. MCP searches your saved `.kql` files for similar patterns
3. MCP fetches and searches configured external references
4. All matching examples are returned to Copilot as context
5. Copilot generates the final KQL using the most relevant examples and discovered field structure

**Benefits:**
- Better query accuracy with more context
- Learn from community examples
- Leverage official Microsoft samples
- Share knowledge across your team

---

### GitHub Copilot Integration

BC Telemetry Buddy provides multiple ways to interact with GitHub Copilot:

#### 1. Chat Participant: `@bc-telemetry-buddy`

Use the chat participant for expert BC telemetry analysis with MCP tool integration:

```
@bc-telemetry-buddy show me all errors from the last 24 hours
@bc-telemetry-buddy analyze performance for customer Contoso
```

**Slash Commands** (informational - no tool execution):
- `/patterns` - Common KQL patterns and best practices
- `/events` - BC event types and categories
- `/errors` - Error analysis techniques
- `/performance` - Performance analysis guidance
- `/customer` - Customer-specific analysis workflow
- `/explain` - Explain concepts or provide examples

The chat participant automatically distinguishes between:
- **Information requests** (slash commands, "what is", "explain") → Provides knowledge directly
- **Data requests** ("show me", "analyze", customer queries) → Executes MCP tools immediately

#### 2. Chatmode: `#BCTelemetryBuddy` (Optional Enhanced Mode)

Activate chatmode for comprehensive BC telemetry expert guidance:

```
#BCTelemetryBuddy show me all errors from last 24 hours
#BCTelemetryBuddy analyze performance issues for Contoso
```

**Installation Options:**
- **Option 1**: Check "Install chatmode" in Setup Wizard Step 5 (automatic)
- **Option 2**: Run command `BC Telemetry Buddy: Install Chatmode` from Command Palette (manual)

After installation, reload VS Code to activate. The chatmode file is created at `.github/chatmodes/BCTelemetryBuddy.chatmode.md`.

**Chatmode vs Chat Participant:**
- **Chat Participant** (`@bc-telemetry-buddy`): Per-message expert assistance, executes MCP tools on demand
- **Chatmode** (`#BCTelemetryBuddy`): Entire conversation context with expert guidance, KQL patterns, systematic workflow

**Customization:**
You can edit `.github/chatmodes/BCTelemetryBuddy.chatmode.md` to customize:
- YAML frontmatter: description, tools array
- Markdown content: System instructions, patterns, workflows
- Reload VS Code after changes

#### 3. Workspace Agent: `@workspace`

Use `@workspace` for general queries that follow systematic discovery workflow:

```
@workspace Show me all errors from BC in the last 24 hours
@workspace What are the slowest operations this week?
```

### Available MCP Tools

BC Telemetry Buddy exposes **11 MCP tools** to GitHub Copilot (accessible via all three methods above):

### Available Tools

| Tool | Description | When Copilot Uses It |
|------|-------------|----------------------|
| **Discovery Tools** ⭐ |
| `bctb_get_event_catalog` | List BC telemetry events with descriptions, frequency, and Learn URLs. Optional `includeCommonFields` analyzes customDimensions field prevalence across events | When you ask questions like "what events are available" or "show me common fields across events" |
| `bctb_get_event_field_samples` | Analyze customDimensions structure for a specific event ID - returns field names, types, occurrence rates, sample values | Before writing queries for a specific event to discover exact field structure |
| `bctb_get_event_schema` | Get detailed schema information for a specific event ID | After discovering relevant events, to understand patterns and related events |
| `bctb_get_categories` | Get available event categories (Lifecycle, Performance, Security, Error, Integration, Configuration, Custom) | To understand event categorization and filter by category |
| `bctb_get_tenant_mapping` | Map company names to Azure tenant IDs and environment names | When you mention a specific customer/company name in your query |
| **Query Execution** |
| `bctb_query_telemetry` | Execute KQL queries against telemetry (NL translation removed in v1.0.0 - use discovery tools first) | For every telemetry query (after using discovery tools to understand structure) |
| **Query Library** |
| `bctb_get_saved_queries` | List saved queries (with optional tag filtering) | To find existing patterns before generating new queries |
| `bctb_search_queries` | Search saved queries by keywords | When your question matches common patterns (errors, slow, login, etc.) |
| `bctb_save_query` | Save a successful query for future reference | When you ask to save a query or Copilot recommends saving |
| `bctb_get_external_queries` | Fetch KQL examples from configured external references (GitHub repos, blogs) | For additional context when generating queries |
| **Analysis & Recommendations** |
| `bctb_get_recommendations` | Analyze results and provide actionable insights | After query execution, to suggest next steps or optimizations |

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

### Discovery-First Workflow (Recommended) ⭐

Version 1.0.0 introduces a **data-driven discovery approach** instead of unreliable natural language translation. Here's the recommended workflow:

**1. Discover available events:**
```
@workspace What error events are available in the last 7 days?
```
Copilot uses `get_event_catalog` with `status="error"` to show actual events in your data.

**2. Analyze field structure for a specific event:**
```
@workspace Show me the field structure for event RT0005
```
Copilot uses `get_event_field_samples` to discover:
- All customDimensions field names
- Data types (string, number, boolean, datetime, JSON)
- Occurrence rates (% of events with each field)
- Sample values for each field
- Ready-to-use KQL template

**3. Write precise KQL query:**
```
@workspace Query RT0005 events where executionTimeInMs > 1000
```
Copilot uses discovered fields to generate accurate KQL with correct field names.

**4. Analyze common fields across multiple events:**
```
@workspace Show me common fields across all error events
```
Copilot uses `get_event_catalog` with `includeCommonFields=true` to categorize fields by prevalence:
- **Universal fields** (80%+ prevalence): Safe for cross-event queries
- **Common fields** (50-79%): Frequently available
- **Occasional fields** (20-49%): Event-type specific
- **Rare fields** (<20%): Highly specific

**Benefits of this approach:**
- ✅ No guessing about field names or structure
- ✅ Accurate queries based on real telemetry data
- ✅ Discover event-specific vs. universal fields
- ✅ Works with any BC version, custom events, partner extensions
- ✅ Adapts automatically as your telemetry evolves

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
4. Try using discovery tools first (get_event_catalog, get_event_field_samples) to understand available events and fields

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
- Running `BC Telemetry Buddy: Run KQL Query` command to execute KQL directly
- Writing KQL queries directly in saved `.kql` files and using CodeLens to run them
- Using the extension's commands to query and save queries

However, **Copilot integration provides the best experience** for intelligent query generation with automatic discovery workflows and contextual assistance.

### Will this work with GitHub Copilot Free?

Yes! BC Telemetry Buddy uses your existing GitHub Copilot license (Free, Pro, or Enterprise). No additional costs.

### Can I use this with multiple Business Central environments?

Yes! Each VSCode workspace can connect to a different Application Insights instance. Create separate workspace folders for each environment.

### Are my queries and telemetry data sent to OpenAI?

When using GitHub Copilot with BC Telemetry Buddy:
- Your **questions to Copilot** are sent to Copilot's LLM
- **Saved query metadata** (comments, descriptions) is sent as context
- **External reference content** (KQL examples) is sent as context
- **Discovered event/field information** (from discovery tools) is sent as context
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

1. ✅ **Explore discovery tools** - Ask Copilot "what events are available?" to see get_event_catalog in action
2. ✅ **Analyze event structure** - Use get_event_field_samples to understand customDimensions for specific events
3. ✅ **Save your first query** - Run a KQL query and save it for future reference
4. ✅ **Add external references** - Configure the BCTech GitHub samples for additional context
5. ✅ **Build your query library** - Save queries as you discover useful patterns
6. ✅ **Share with your team** - Commit `.kql` files to your repository

Happy querying! 🚀
