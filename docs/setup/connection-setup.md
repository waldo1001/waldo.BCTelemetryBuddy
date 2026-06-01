# Connection Setup

How to connect BC Telemetry Buddy to your Business Central telemetry (Azure Application Insights). This works from **any** client connected to the MCP server — Claude Code, GitHub Copilot agent mode, Cursor, or the VS Code extension.

There are three ways to run it; they all produce the same `.bctb-config.json`:

| You're using… | Do this |
|---|---|
| **Claude Code** | Run the slash command `/mcp__bc-telemetry-buddy-mcp__setup-connection`, or just ask: *"help me set up a connection with my BC telemetry"*. |
| **GitHub Copilot agent mode / Cursor / other MCP clients** | Ask the agent to call the **`get_setup_guide`** tool (or invoke the `setup-connection` prompt if your client supports prompts), then follow the steps. |
| **VS Code extension (point-and-click)** | Run **BC Telemetry Buddy: Setup Wizard** from the Command Palette. |

> The MCP server serves the setup workflow even when it is **not yet configured**, so you can always reach it. The agent executes the steps with its own shell + file tools. The `@bc-telemetry-buddy` chat participant **cannot write files** — from there, switch to an agent (Claude Code / Copilot agent mode) or use the wizard.

---

## The workflow

### 1. Choose an authentication method
Written into the config; the running MCP uses it at query time.

- **`azure_cli`** *(recommended for terminal agents)* — reuses an existing `az login` session.
- **`vscode_auth`** — VS Code's built-in Microsoft sign-in (only meaningful inside VS Code).
- **`device_code`** — browser sign-in, no Azure CLI; needs a `tenantId`.
- **`client_credentials`** — service principal (`clientId` + `clientSecret`); for unattended/CI.

### 2. Authenticate
For `azure_cli`, confirm a session with `az account show`; if it fails, run `az login`.

### 3. Discover Application Insights endpoints
```bash
npx -p bc-telemetry-buddy-mcp bctb-setup-endpoints
```
Prints a JSON array of `{ name, appId, resourceGroup, subscriptionId, tenantId, location }` across your subscriptions (uses Azure CLI under the hood, so it works in any shell).

**Manual fallback** — if Azure CLI is missing/unauthenticated or the list is empty: open the Azure Portal → your Application Insights resource → **Configure → API Access**, and use the **Application ID** + **Tenant ID**.

### 4. Pick the endpoint
Choose by **name** (not raw GUIDs); capture its `appId` and `tenantId`.

### 5. Choose the target workspace folder
In a **multi-root workspace, pick which folder/project** to configure — `.bctb-config.json` is written there.

### 6. Write the configuration
```bash
npx -p bc-telemetry-buddy-mcp bctb-setup-write-config \
  --folder "<absolute-path-to-folder>" \
  --connectionName "<friendly name>" \
  --authFlow "<azure_cli|vscode_auth|device_code|client_credentials>" \
  --appId "<application-insights-app-id>" \
  [--tenantId "<tenant-id>"] \
  [--clientId "<client-id, client_credentials only>"] \
  [--profile "<name, to add as a named profile>"]
```
- No existing config → writes a single-profile `.bctb-config.json`.
- With `--profile` (or when a config already exists) → **merges** a named profile in without clobbering other profiles or `defaultProfile`.
- Injects `$schema` and derives a valid `kustoClusterUrl` automatically.

### 7. Reload
- **VS Code:** *Developer: Reload Window* (or restart the MCP server).
- **Claude Code / other clients:** restart the MCP server.

Then try a first query, e.g. *"show me the event catalog for the last 7 days"*.

---

*See also: the `setup-connection` MCP prompt and `get_setup_guide` MCP tool both return this workflow for an agent to execute.*
