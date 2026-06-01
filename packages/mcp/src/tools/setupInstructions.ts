/**
 * Connection-setup workflow content.
 *
 * Single source of truth for the guided "set up a connection to my BC telemetry"
 * workflow. Delivered to ANY connected MCP client two ways:
 *   - as the `setup-connection` MCP prompt (best UX where prompts are supported), and
 *   - as the `get_setup_guide` MCP tool (universal fallback — every client supports tools).
 *
 * The agent reading this executes the steps with its OWN tools (shell + file write).
 * Claude Code and Copilot agent mode have those; the VS Code chat participant does not
 * (it cannot create files) — from there, relay the steps and point to agent mode.
 *
 * This is authored content, kept separate from tool definitions (SRP) so it can be
 * iterated independently, mirroring serverInstructions.ts.
 */

export const SETUP_PROMPT_CONTENT = `# BC Telemetry Buddy — Connection Setup

You are helping the user set up a connection to their Microsoft Dynamics 365 Business Central telemetry (Azure Application Insights). Follow these steps **in order**. After each step, briefly tell the user what you did and what is next.

> You will run shell commands and write a file. If you cannot run a shell or write files in this environment (for example the VS Code \`@bc-telemetry-buddy\` chat participant), STOP and tell the user to run this from an agent that can — e.g. Claude Code, or GitHub Copilot **agent mode** — or to walk through the manual steps below themselves.

The two helper commands referenced below ship with the MCP package. Run them with:
\`\`\`
npx -p bc-telemetry-buddy-mcp bctb-setup-endpoints [...]
npx -p bc-telemetry-buddy-mcp bctb-setup-write-config [...]
\`\`\`
(If the package is installed locally, you can also call \`node <path-to-package>/dist/scripts/list-endpoints.js\` / \`write-config.js\` directly.)

---

## Step 1 — Choose the authentication method

Ask the user which auth method to write into the config (the running MCP will use it):

- **azure_cli** *(recommended for Claude Code / terminal agents)* — reuses an existing \`az login\` session. No secrets stored.
- **vscode_auth** — VS Code's built-in Microsoft sign-in. Only meaningful when running inside VS Code.
- **device_code** — browser-based sign-in, no Azure CLI required. Needs a \`tenantId\`.
- **client_credentials** — service principal (\`clientId\` + \`clientSecret\`). For unattended/CI use.

Default to **azure_cli** unless the user indicates otherwise.

## Step 2 — Authenticate

For **azure_cli**: verify a session exists by running \`az account show\`. If it fails, tell the user to run \`az login\` and wait for them to confirm.

For the other flows the running MCP handles auth at query time; you only need the identifiers (tenantId, and for client_credentials the clientId — never ask the user to paste a clientSecret into chat; have them add it to the config file themselves afterwards).

## Step 3 — Discover Application Insights endpoints

Run the discovery helper (it uses Azure CLI under the hood, so it works in any shell):
\`\`\`
npx -p bc-telemetry-buddy-mcp bctb-setup-endpoints
\`\`\`
It prints a JSON array of \`{ name, appId, resourceGroup, subscriptionId, tenantId, location }\` for every Application Insights resource you can see across your subscriptions.

**Manual fallback** — if Azure CLI is not installed, the user is not logged in, or the list is empty: ask the user to open the Azure Portal → their Application Insights resource → **Configure → API Access**, and paste the **Application ID** (a GUID) and their **Tenant ID**. Proceed with those values.

## Step 4 — Pick the endpoint

Present the discovered resources by **name** (not raw GUIDs) and let the user choose one. Capture its \`appId\`, \`tenantId\`, and \`subscriptionId\`.

## Step 5 — Choose the target workspace folder

Determine where \`.bctb-config.json\` should be written. **If this is a multi-root workspace (more than one folder open), you MUST ask the user which folder/project to configure** — do not guess. Use the absolute path of the chosen folder.

## Step 6 — Write the configuration

Run the writer helper:
\`\`\`
npx -p bc-telemetry-buddy-mcp bctb-setup-write-config \\
  --folder "<absolute-path-to-chosen-folder>" \\
  --connectionName "<friendly name, e.g. Contoso Prod>" \\
  --authFlow "<azure_cli|vscode_auth|device_code|client_credentials>" \\
  --appId "<application-insights-app-id>" \\
  [--tenantId "<tenant-id>"] \\
  [--clientId "<client-id, client_credentials only>"] \\
  [--profile "<name, to add as a named profile instead of single-profile>"]
\`\`\`
- With no existing config it writes a single-profile \`.bctb-config.json\`.
- With \`--profile\`, or when a config already exists, it **merges** a named profile in **without clobbering** other profiles or \`defaultProfile\`.
- It injects the \`$schema\` reference and derives a valid \`kustoClusterUrl\` automatically.

**Manual fallback** — if you cannot run the helper, write \`.bctb-config.json\` in the chosen folder with this shape (single profile):
\`\`\`json
{
  "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
  "connectionName": "<friendly name>",
  "authFlow": "azure_cli",
  "tenantId": "<tenant-id, or 00000000-0000-0000-0000-000000000000 for azure_cli/vscode_auth>",
  "applicationInsightsAppId": "<application-insights-app-id>",
  "kustoClusterUrl": "https://api.applicationinsights.io",
  "cacheEnabled": true,
  "cacheTTLSeconds": 3600,
  "removePII": false,
  "workspacePath": "\${workspaceFolder}",
  "queriesFolder": "queries",
  "references": []
}
\`\`\`
If a config already exists, preserve it and add your entry under a \`profiles\` key rather than overwriting.

## Step 7 — Reload

Tell the user the connection is configured and that they must **reload** for the MCP server to pick it up:
- VS Code: run **Developer: Reload Window** (or restart the MCP server).
- Claude Code / other clients: restart the MCP server (e.g. restart the client or re-run the MCP command).

Then suggest a first query, e.g. *"show me the event catalog for the last 7 days"*.
`;
