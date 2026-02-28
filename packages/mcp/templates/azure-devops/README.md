# Azure DevOps — BC Telemetry Monitoring Agents

## What This Does
Runs your BC Telemetry Buddy monitoring agents on an hourly schedule using Azure DevOps Pipelines. Each run queries your Application Insights telemetry, compares against previous findings, and takes configured actions (Teams notifications, emails, pipeline triggers). Agent state is committed back to the repository so findings persist across runs.

## Prerequisites
1. BC Telemetry Buddy MCP installed (`npm install -g bc-telemetry-buddy-mcp`)
2. Azure AD App Registration with Application Insights Reader role
3. Azure OpenAI deployment (GPT-4o recommended)
4. (Optional) Teams Incoming Webhook URL for notifications
5. (Optional) SMTP relay or Azure AD app for email notifications
6. (Optional) Azure DevOps PAT for pipeline triggers

## Setup Guide

### Step 1: Create Your Workspace Repository
- Create a new Azure DevOps repo (or use an existing one)
- Add `.bctb-config.json` with your telemetry connection details
- Create at least one agent: `bctb-mcp agent start "your instruction" --name my-agent`

### Step 2: Configure Variable Group
Create a variable group named `bctb-secrets` in Azure DevOps (Pipelines → Library → Variable groups):

> **Note:** Non-sensitive values like `BCTB_TENANT_ID`, `BCTB_APP_INSIGHTS_ID`, `BCTB_KUSTO_CLUSTER_URL`, `AZURE_OPENAI_ENDPOINT`, and `AZURE_OPENAI_DEPLOYMENT` are already stored in your `.bctb-config.json` file (which is checked into the repo). You only need to add **actual secrets** to the variable group.

**Always Required:**

| Variable Name | Description | How to Obtain |
|---------------|-------------|---------------|
| `BCTB_CLIENT_ID` | App Registration client ID | Azure Portal → App Registrations → your app → Overview |
| `BCTB_CLIENT_SECRET` | App Registration client secret | Azure Portal → App Registrations → Certificates & secrets |
| `AZURE_OPENAI_KEY` | Azure OpenAI API key (or use `ANTHROPIC_API_KEY` for Claude) | Azure Portal → Azure OpenAI → Keys and Endpoint |

**Only If You Configured These Actions:**

| Variable Name | When Needed | How to Obtain |
|---------------|------------|---------------|
| `TEAMS_WEBHOOK_URL` | Teams webhook action | Teams → Channel → Manage channel → Connectors → Incoming Webhook |
| `SMTP_PASSWORD` | Email (SMTP) action | Your SMTP provider (SendGrid, Brevo, etc.) |
| `GRAPH_CLIENT_SECRET` | Email (Graph) action | Azure Portal → App Registrations → Certificates & secrets (app needs Mail.Send) |
| `DEVOPS_PAT` | Pipeline trigger action | Azure DevOps → User Settings → Personal Access Tokens |

> **Tip:** Mark sensitive variables as secret (lock icon) so they won't be displayed in logs.

### Step 3: Copy the Pipeline File
- Copy `azure-pipelines.yml` to your repository root
- Customize the schedule (default: hourly)
- Push to `main`

### Step 4: Create the Pipeline
- Go to Pipelines → New Pipeline → Azure Repos Git → select your repo
- Choose "Existing Azure Pipelines YAML file" → select `azure-pipelines.yml`
- Run the pipeline

### Step 5: Verify
- Trigger the pipeline manually
- Check the agent output in the pipeline logs
- Verify `agents/<name>/state.json` was committed

## Customization

### Change the Schedule
```yaml
schedules:
  - cron: '0 */2 * * *'  # every 2 hours
    displayName: 'Every 2 hours'
    branches:
      include: [main]
    always: true
```

### Run a Specific Agent
Modify the script step to target a single agent:
```yaml
- script: bctb-mcp agent run "my-agent" --once
```

### Add a New Agent
1. `bctb-mcp agent start "your instruction" --name new-agent`
2. Commit the new `agents/new-agent/` folder
3. The pipeline will pick it up automatically on next run

## Troubleshooting

| Problem | Cause | Fix |
|---------|-------|-----|
| "No config file found" | `.bctb-config.json` missing or not at repo root | Ensure config is committed and at workspace root |
| "Authentication failed" | Wrong credentials or expired secret | Refresh secrets in the variable group |
| "Agent exceeded max tool calls" | LLM got stuck in a loop | Check instruction clarity; increase `maxToolCalls` in config |
| "No state changes" (every run) | Agent finding nothing | Check `BCTB_APP_INSIGHTS_ID` points to correct resource |
| Git push fails | Branch policies or permissions | Ensure the build service has Contribute permission on the repo |
