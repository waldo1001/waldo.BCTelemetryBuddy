/**
 * Agent Monitoring Setup Wizard — 8-step webview wizard for setting up
 * autonomous agent monitoring (LLM config, agent templates, actions, pipeline).
 *
 * Follows the same architecture as SetupWizardProvider:
 *   - WebviewPanel with bidirectional postMessage
 *   - Reads/writes .bctb-config.json directly
 *   - Shells out to bctb-mcp CLI for agent creation / test run
 */
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getMCPStatus, MCPStatus } from '../services/mcpInstaller';

const execAsync = promisify(exec);

// ═══ Bundled agent templates ═══
// These are bundled as fallback in case we can't read from the installed MCP package.

interface AgentTemplate {
    id: string;
    name: string;
    description: string;
    events: string;
    escalation: string;
    instruction: string;
}

const AGENT_TEMPLATES: AgentTemplate[] = [
    {
        id: 'appsource-validation',
        name: 'AppSource Validation Monitor',
        description: 'Monitors AppSource extension validation failures. Tracks recurring errors by extension name, escalates persistent issues.',
        events: 'RT0005, LC0010, LC0011, LC0020',
        escalation: '3 checks → Teams, 6 checks → Email',
        instruction: `Monitor AppSource validation telemetry for my extensions.

Check for validation failures (RT0005 events with error status),
categorize by extension name and failure type.

If failures persist across 3 consecutive checks, post to the Teams channel.
If failures persist across 6 consecutive checks, send an email to the dev lead.

Focus on the last 2 hours of data each run.
Ignore test tenants (any tenant with "test" or "sandbox" in the company name).`
    },
    {
        id: 'performance-monitoring',
        name: 'Performance Monitor',
        description: 'Tracks page load times, report execution, and AL method performance. Detects degradation trends across runs.',
        events: 'RT0006, RT0007, RT0018, AL0000D3',
        escalation: '2 checks → Teams, 5 checks → Email',
        instruction: `Monitor Business Central performance across all tenants.

Track these metrics:
- Page load times (RT0006 events) — alert if p95 exceeds 5 seconds
- Report execution times (RT0006, RT0007) — alert if p95 exceeds 30 seconds
- AL method execution times — alert if any single method consistently exceeds 10 seconds

Compare current hour against previous runs to detect degradation.
If performance degrades for 2+ consecutive checks, post to Teams.
If degradation persists for 5+ checks, send an email to the dev lead.

Group findings by tenant and identify which tenants are most affected.`
    },
    {
        id: 'error-rate-monitoring',
        name: 'Error Rate Monitor',
        description: 'Catch-all monitor for error rates across all BC telemetry events. Detects spikes and trend-based anomalies.',
        events: 'All error events (dynamic discovery)',
        escalation: '1st: log, 2nd: Teams, 3rd: Email',
        instruction: `Monitor overall error rates across Business Central environments.

Check all events with error status. Group by event ID and tenant.

Flag any event type where:
- Error count in the last hour exceeds 100, OR
- Error rate increased by more than 200% compared to the typical rate you've seen in previous runs

For flagged issues:
- First detection: Log the finding (no action)
- Second consecutive detection: Post to Teams with affected tenants and error details
- Third consecutive detection: Send an email to the dev lead

Summarize overall health: percentage of events in error vs success state.`
    },
    {
        id: 'post-deployment-check',
        name: 'Post-Deployment Watch',
        description: 'Short-lived monitor activated after a deployment. Compares metrics against pre-deployment baseline.',
        events: 'All errors + RT0006, RT0007, LC0010, LC0020',
        escalation: 'Immediate Teams + Email on regression',
        instruction: `Post-deployment monitoring mode.

Compare error rates and performance in the last 2 hours against
the baseline from your previous runs (before deployment).

Flag any metric that has worsened by more than 50% compared to pre-deployment baseline.

If any regression is detected:
- Immediately post to Teams with specific metrics and comparison
- Send an email to the dev lead with "deployment-regression" in the subject

This agent should be started manually after a deployment and paused after 24 hours
of stable operation.`
    }
];

// ═══ Pipeline templates (bundled) ═══

interface PipelineOptions {
    llmProvider: 'azure-openai' | 'anthropic';
    branchName: string;
    variableGroupName: string;
}

function generateGitHubActionsYaml(opts: PipelineOptions): string {
    const llmKeyLine = opts.llmProvider === 'anthropic'
        ? `          ANTHROPIC_API_KEY: \${{ secrets.ANTHROPIC_API_KEY }}`
        : `          AZURE_OPENAI_KEY: \${{ secrets.AZURE_OPENAI_KEY }}`;

    return `name: Telemetry Monitoring Agents

on:
  schedule:
    - cron: "0 * * * *"
  workflow_dispatch:
    inputs:
      agent:
        description: "Agent to run (blank = all)"
        required: false
        type: string

permissions:
  contents: write

jobs:
  run-agents:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout workspace (includes agent state and .bctb-config.json)
        uses: actions/checkout@v4
        with:
          token: \${{ secrets.GITHUB_TOKEN }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: "20"

      - name: Install BC Telemetry Buddy MCP
        run: npm install -g bc-telemetry-buddy-mcp@latest

      - name: Run agent(s)
        run: |
          if [ -n "\${{ inputs.agent }}" ]; then
            bctb-mcp agent run "\${{ inputs.agent }}" --once
          else
            bctb-mcp agent run-all --once
          fi
        env:
          # Auth — always required for CI/CD (client_credentials flow)
          BCTB_AUTH_FLOW: client_credentials
          BCTB_CLIENT_ID: \${{ secrets.BCTB_CLIENT_ID }}
          BCTB_CLIENT_SECRET: \${{ secrets.BCTB_CLIENT_SECRET }}
          # LLM API key — required (the endpoint/deployment are in .bctb-config.json)
${llmKeyLine}
          # Action secrets — only add the ones you configured in Step 4
          # TEAMS_WEBHOOK_URL: \${{ secrets.TEAMS_WEBHOOK_URL }}
          # SMTP_PASSWORD: \${{ secrets.SMTP_PASSWORD }}
          # GRAPH_CLIENT_SECRET: \${{ secrets.GRAPH_CLIENT_SECRET }}
          # DEVOPS_PAT: \${{ secrets.DEVOPS_PAT }}

      - name: Commit updated agent state
        run: |
          git config user.name "bctb-agent"
          git config user.email "bctb-agent@noreply.github.com"
          git add agents/
          if git diff --cached --quiet; then
            echo "No state changes"
          else
            git commit -m "agent: run $(date -u +%Y-%m-%dT%H:%M)Z"
            git push
          fi
`;
}

function generateAzureDevOpsYaml(opts: PipelineOptions): string {
    const llmKeyLine = opts.llmProvider === 'anthropic'
        ? `      ANTHROPIC_API_KEY: $(ANTHROPIC_API_KEY)`
        : `      AZURE_OPENAI_KEY: $(AZURE_OPENAI_KEY)`;
    const branch = opts.branchName || 'main';
    const varGroup = opts.variableGroupName || 'bctb-secrets';

    // Build LLM key variable — set unused provider to empty
    const llmVarLines = opts.llmProvider === 'anthropic'
        ? `  - name: AZURE_OPENAI_KEY\n    value: ''\n  - name: ANTHROPIC_API_KEY\n    value: $(ANTHROPIC_API_KEY)`
        : `  - name: AZURE_OPENAI_KEY\n    value: $(AZURE_OPENAI_KEY)`;

    return `trigger:
  branches:
    include:
      - ${branch}

schedules:
  - cron: "0 * * * *"
    displayName: "Hourly agent run"
    branches:
      include: [${branch}]
    always: true

pool:
  vmImage: "ubuntu-latest"

variables:
  - group: ${varGroup}
  - name: BCTB_WORKSPACE_PATH
    value: "$(Build.SourcesDirectory)"
${llmVarLines}

steps:
  - checkout: self
    persistCredentials: true

  - task: NodeTool@0
    inputs:
      versionSpec: "20.x"

  - script: |
      export npm_config_prefix=$HOME/.npm-global
      export PATH=$HOME/.npm-global/bin:$PATH
      npm install -g bc-telemetry-buddy-mcp@latest
    displayName: "Install BCTB MCP"

  - script: |
      export PATH=$HOME/.npm-global/bin:$PATH
      bctb-mcp agent run-all --once
    displayName: "Run all agents"
    env:
      # Auth — always required for CI/CD (client_credentials flow)
      BCTB_AUTH_FLOW: client_credentials
      BCTB_CLIENT_ID: $(BCTB_CLIENT_ID)
      BCTB_CLIENT_SECRET: $(BCTB_CLIENT_SECRET)
      # LLM API key — required (endpoint/deployment are in .bctb-config.json)
${llmKeyLine}
      # Action secrets — only add the ones you configured in Step 4
      # TEAMS_WEBHOOK_URL: $(TEAMS_WEBHOOK_URL)
      # SMTP_PASSWORD: $(SMTP_PASSWORD)
      # GRAPH_CLIENT_SECRET: $(GRAPH_CLIENT_SECRET)
      # DEVOPS_PAT: $(DEVOPS_PAT)

  - script: |
      git config user.name "bctb-agent"
      git config user.email "bctb-agent@noreply.github.com"
      git add agents/
      git diff --cached --quiet || git commit -m "agent: run $(date -u +%Y-%m-%dT%H:%M)Z"
      git push origin HEAD:${branch}
    displayName: "Commit agent state"
`;
}

// ═══ Provider class ═══

export class AgentMonitoringSetupProvider {
    public static readonly viewType = 'bcTelemetryBuddy.agentMonitoringSetup';
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _outputChannel?: vscode.OutputChannel
    ) { }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
    }

    public async show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            AgentMonitoringSetupProvider.viewType,
            'BC Telemetry Buddy - Agent Monitoring Setup (Preview)',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        this._panel.webview.html = this._getHtmlForWebview();

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                switch (message.type) {
                    case 'checkPrerequisites':
                        await this._checkPrerequisites();
                        break;
                    case 'loadConfig':
                        await this._loadConfig();
                        break;
                    case 'saveLLMConfig':
                        await this._saveLLMConfig(message.llmConfig);
                        break;
                    case 'testLLMConnection':
                        await this._testLLMConnection(message.llmConfig);
                        break;
                    case 'createAgent':
                        await this._createAgent(message.agentName, message.instruction);
                        break;
                    case 'saveActionsConfig':
                        await this._saveActionsConfig(message.actionsConfig);
                        break;
                    case 'testTeamsWebhook':
                        await this._testTeamsWebhook(message.url);
                        break;
                    case 'saveDefaultsConfig':
                        await this._saveDefaultsConfig(message.defaultsConfig);
                        break;
                    case 'copyPipeline':
                        await this._copyPipeline(message.pipelineType, message.pipelineOptions);
                        break;
                    case 'runTestAgent':
                        await this._runTestAgent(message.agentName);
                        break;
                    case 'openFile':
                        await this._openFile(message.filePath);
                        break;
                    case 'openSetupWizard':
                        await vscode.commands.executeCommand('bctb.setupWizard');
                        break;
                    case 'closeWizard':
                        this._panel?.dispose();
                        break;
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidDispose(() => this._onDispose(), null, this._disposables);
    }

    private _onDispose() {
        this._panel = undefined;
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // ═══ Message handlers ═══

    private _getWorkspacePath(): string | null {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) { return null; }
        return workspaceFolders[0].uri.fsPath;
    }

    private async _checkPrerequisites(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        const hasWorkspace = !!workspacePath;

        let hasConfig = false;
        if (workspacePath) {
            const configPath = path.join(workspacePath, '.bctb-config.json');
            hasConfig = fs.existsSync(configPath);
        }

        let mcpStatus: MCPStatus = { installed: false, version: null, inPath: false, globalPath: null };
        try {
            mcpStatus = await getMCPStatus();
        } catch { /* ignored */ }

        // Check if agents section already exists
        let hasAgentsConfig = false;
        if (hasConfig && workspacePath) {
            try {
                const configPath = path.join(workspacePath, '.bctb-config.json');
                const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                hasAgentsConfig = !!raw.agents?.llm;
            } catch { /* ignored */ }
        }

        this._panel?.webview.postMessage({
            type: 'prerequisites',
            hasWorkspace,
            hasConfig,
            mcpInstalled: mcpStatus.installed,
            mcpVersion: mcpStatus.version,
            hasAgentsConfig,
            workspacePath
        });
    }

    private async _loadConfig(): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) { return; }

        const configPath = path.join(workspacePath, '.bctb-config.json');
        try {
            const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            this._panel?.webview.postMessage({
                type: 'currentConfig',
                config: raw
            });
        } catch {
            this._panel?.webview.postMessage({
                type: 'currentConfig',
                config: {}
            });
        }
    }

    private async _saveLLMConfig(llmConfig: any): Promise<void> {
        try {
            const config = await this._readConfig();
            if (!config.agents) { config.agents = {}; }
            config.agents.llm = llmConfig;
            await this._writeConfig(config);
            this._panel?.webview.postMessage({ type: 'llmConfigSaved', success: true });
        } catch (error: any) {
            this._panel?.webview.postMessage({ type: 'llmConfigSaved', success: false, error: error.message });
        }
    }

    private async _testLLMConnection(llmConfig: any): Promise<void> {
        try {
            const provider = llmConfig.provider || 'azure-openai';
            if (provider === 'azure-openai') {
                const endpoint = llmConfig.endpoint;
                const deployment = llmConfig.deployment || llmConfig.model;
                const apiVersion = llmConfig.apiVersion || '2024-10-21';
                const apiKey = process.env.AZURE_OPENAI_KEY;

                if (!apiKey) {
                    throw new Error('AZURE_OPENAI_KEY environment variable is not set. Set it in your shell before launching VS Code.');
                }
                if (!endpoint) {
                    throw new Error('Azure OpenAI endpoint is required');
                }
                if (!deployment) {
                    throw new Error('Azure OpenAI deployment name is required');
                }

                const url = `${endpoint.replace(/\/+$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
                const response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'api-key': apiKey,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        messages: [{ role: 'user', content: 'Reply with OK' }],
                        max_tokens: 5
                    })
                });

                if (!response.ok) {
                    const body = await response.text();
                    throw new Error(`Azure OpenAI returned ${response.status}: ${body.substring(0, 200)}`);
                }

                this._panel?.webview.postMessage({ type: 'llmTestResult', success: true, provider: 'Azure OpenAI' });
            } else if (provider === 'anthropic') {
                const apiKey = process.env.ANTHROPIC_API_KEY;
                if (!apiKey) {
                    throw new Error('ANTHROPIC_API_KEY environment variable is not set.');
                }

                const model = llmConfig.model || 'claude-sonnet-4-20250514';
                const response = await fetch('https://api.anthropic.com/v1/messages', {
                    method: 'POST',
                    headers: {
                        'x-api-key': apiKey,
                        'content-type': 'application/json',
                        'anthropic-version': '2023-06-01'
                    },
                    body: JSON.stringify({
                        model,
                        max_tokens: 5,
                        messages: [{ role: 'user', content: 'Reply with OK' }]
                    })
                });

                if (!response.ok) {
                    const body = await response.text();
                    throw new Error(`Anthropic returned ${response.status}: ${body.substring(0, 200)}`);
                }

                this._panel?.webview.postMessage({ type: 'llmTestResult', success: true, provider: 'Anthropic' });
            } else {
                throw new Error(`Unknown LLM provider: ${provider}`);
            }
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'llmTestResult',
                success: false,
                error: error.message || String(error)
            });
        }
    }

    private async _createAgent(agentName: string, instruction: string): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            this._panel?.webview.postMessage({ type: 'agentCreated', success: false, error: 'No workspace open' });
            return;
        }

        try {
            // Create agents/<name>/ directory structure directly
            const agentDir = path.join(workspacePath, 'agents', agentName);
            const runsDir = path.join(agentDir, 'runs');

            if (!fs.existsSync(agentDir)) {
                fs.mkdirSync(agentDir, { recursive: true });
            }
            if (!fs.existsSync(runsDir)) {
                fs.mkdirSync(runsDir, { recursive: true });
            }

            // Write instruction.md
            const instructionPath = path.join(agentDir, 'instruction.md');
            fs.writeFileSync(instructionPath, instruction, 'utf-8');

            // Write initial state.json
            const initialState = {
                agentName,
                status: 'active',
                runCount: 0,
                lastRun: null,
                summary: '',
                activeIssues: [],
                resolvedIssues: [],
                recentRuns: []
            };
            const statePath = path.join(agentDir, 'state.json');
            fs.writeFileSync(statePath, JSON.stringify(initialState, null, 2), 'utf-8');

            this._outputChannel?.appendLine(`✓ Created agent: ${agentName} → agents/${agentName}/`);

            this._panel?.webview.postMessage({
                type: 'agentCreated',
                success: true,
                agentName,
                agentDir,
                instructionPath,
                statePath
            });
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'agentCreated',
                success: false,
                error: error.message || String(error)
            });
        }
    }

    private async _saveActionsConfig(actionsConfig: any): Promise<void> {
        try {
            const config = await this._readConfig();
            if (!config.agents) { config.agents = {}; }
            config.agents.actions = actionsConfig;
            await this._writeConfig(config);
            this._panel?.webview.postMessage({ type: 'actionsConfigSaved', success: true });
        } catch (error: any) {
            this._panel?.webview.postMessage({ type: 'actionsConfigSaved', success: false, error: error.message });
        }
    }

    private async _testTeamsWebhook(url: string): Promise<void> {
        try {
            if (!url) { throw new Error('Teams webhook URL is required'); }

            const card = {
                type: 'message',
                attachments: [{
                    contentType: 'application/vnd.microsoft.card.adaptive',
                    content: {
                        $schema: 'http://adaptivecards.io/schemas/adaptive-card.json',
                        type: 'AdaptiveCard',
                        version: '1.4',
                        body: [
                            {
                                type: 'TextBlock',
                                text: '✅ BC Telemetry Buddy — Test Notification',
                                weight: 'Bolder',
                                size: 'Medium'
                            },
                            {
                                type: 'TextBlock',
                                text: 'This is a test message from the Agent Monitoring Setup wizard. If you see this, your Teams webhook is configured correctly!',
                                wrap: true
                            },
                            {
                                type: 'TextBlock',
                                text: `Sent at: ${new Date().toISOString()}`,
                                isSubtle: true,
                                size: 'Small'
                            }
                        ]
                    }
                }]
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(card)
            });

            if (!response.ok) {
                const body = await response.text();
                throw new Error(`Teams webhook returned ${response.status}: ${body.substring(0, 200)}`);
            }

            this._panel?.webview.postMessage({ type: 'teamsWebhookResult', success: true });
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'teamsWebhookResult',
                success: false,
                error: error.message || String(error)
            });
        }
    }

    private async _saveDefaultsConfig(defaultsConfig: any): Promise<void> {
        try {
            const config = await this._readConfig();
            if (!config.agents) { config.agents = {}; }
            config.agents.defaults = defaultsConfig;
            await this._writeConfig(config);
            this._panel?.webview.postMessage({ type: 'defaultsConfigSaved', success: true });
        } catch (error: any) {
            this._panel?.webview.postMessage({ type: 'defaultsConfigSaved', success: false, error: error.message });
        }
    }

    private async _copyPipeline(pipelineType: string, pipelineOptions?: Partial<PipelineOptions>): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            this._panel?.webview.postMessage({ type: 'pipelineCopied', success: false, error: 'No workspace open' });
            return;
        }

        try {
            let destPath: string;
            let content: string;

            const opts: PipelineOptions = {
                llmProvider: (pipelineOptions?.llmProvider as PipelineOptions['llmProvider']) || 'azure-openai',
                branchName: pipelineOptions?.branchName || 'main',
                variableGroupName: pipelineOptions?.variableGroupName || 'bctb-secrets',
            };

            if (pipelineType === 'github-actions') {
                const dir = path.join(workspacePath, '.github', 'workflows');
                if (!fs.existsSync(dir)) { fs.mkdirSync(dir, { recursive: true }); }
                destPath = path.join(dir, 'telemetry-agent.yml');
                content = generateGitHubActionsYaml(opts);
            } else if (pipelineType === 'azure-devops') {
                destPath = path.join(workspacePath, 'azure-pipelines-agents.yml');
                content = generateAzureDevOpsYaml(opts);
            } else {
                this._panel?.webview.postMessage({ type: 'pipelineCopied', success: true, skipped: true });
                return;
            }

            // Check if file already exists
            if (fs.existsSync(destPath)) {
                const overwrite = await vscode.window.showWarningMessage(
                    `Pipeline file already exists: ${path.basename(destPath)}. Overwrite?`,
                    'Overwrite', 'Cancel'
                );
                if (overwrite !== 'Overwrite') {
                    this._panel?.webview.postMessage({ type: 'pipelineCopied', success: true, skipped: true });
                    return;
                }
            }

            fs.writeFileSync(destPath, content, 'utf-8');
            this._outputChannel?.appendLine(`✓ Copied pipeline template: ${destPath}`);

            this._panel?.webview.postMessage({
                type: 'pipelineCopied',
                success: true,
                pipelineType,
                destPath
            });
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'pipelineCopied',
                success: false,
                error: error.message || String(error)
            });
        }
    }

    private async _runTestAgent(agentName: string): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            this._panel?.webview.postMessage({ type: 'testRunResult', success: false, error: 'No workspace open' });
            return;
        }

        try {
            const configPath = path.join(workspacePath, '.bctb-config.json');
            if (!fs.existsSync(configPath)) {
                throw new Error('.bctb-config.json not found');
            }

            this._panel?.webview.postMessage({ type: 'testRunProgress', status: 'running', message: 'Starting agent run...' });
            this._outputChannel?.appendLine(`▶ Running test: bctb-mcp agent run ${agentName} --once`);

            const { stdout, stderr } = await execAsync(
                `bctb-mcp agent run "${agentName}" --once --config "${configPath}"`,
                {
                    timeout: 120000, // 2 minutes
                    cwd: workspacePath,
                    env: { ...process.env, BCTB_WORKSPACE_PATH: workspacePath }
                }
            );

            const output = stdout + (stderr ? '\n' + stderr : '');
            this._outputChannel?.appendLine(output);
            this._outputChannel?.appendLine(`✓ Agent test run completed`);

            // Check if state.json was updated
            const statePath = path.join(workspacePath, 'agents', agentName, 'state.json');
            let stateUpdated = false;
            if (fs.existsSync(statePath)) {
                try {
                    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
                    stateUpdated = state.runCount > 0;
                } catch { /* ignored */ }
            }

            // Find latest run log
            const runsDir = path.join(workspacePath, 'agents', agentName, 'runs');
            let latestRunLog: string | null = null;
            if (fs.existsSync(runsDir)) {
                const runFiles = fs.readdirSync(runsDir).filter(f => f.endsWith('.json')).sort();
                if (runFiles.length > 0) {
                    latestRunLog = path.join(runsDir, runFiles[runFiles.length - 1]);
                }
            }

            this._panel?.webview.postMessage({
                type: 'testRunResult',
                success: true,
                output: output.substring(0, 5000), // Limit for webview
                stateUpdated,
                statePath,
                latestRunLog
            });
        } catch (error: any) {
            const errorMsg = error.stderr || error.message || String(error);
            this._outputChannel?.appendLine(`✗ Agent test run failed: ${errorMsg}`);
            this._panel?.webview.postMessage({
                type: 'testRunResult',
                success: false,
                error: errorMsg.substring(0, 2000)
            });
        }
    }

    private async _openFile(filePath: string): Promise<void> {
        try {
            const uri = vscode.Uri.file(filePath);
            await vscode.window.showTextDocument(uri);
        } catch (error: any) {
            vscode.window.showErrorMessage(`Failed to open file: ${error.message}`);
        }
    }

    // ═══ Config file helpers ═══

    private async _readConfig(): Promise<any> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) { throw new Error('No workspace open'); }

        const configPath = path.join(workspacePath, '.bctb-config.json');
        if (!fs.existsSync(configPath)) {
            throw new Error('.bctb-config.json not found. Run the Setup Wizard first.');
        }

        return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }

    private async _writeConfig(config: any): Promise<void> {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) { throw new Error('No workspace open'); }

        const configPath = path.join(workspacePath, '.bctb-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');
    }

    // ═══ HTML ═══

    private _getHtmlForWebview(): string {
        // Serialize templates for the webview
        const templatesJson = JSON.stringify(AGENT_TEMPLATES);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Agent Monitoring Setup (Preview)</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .container { max-width: 850px; margin: 0 auto; }
        h1 { font-size: 24px; margin: 0 0 8px 0; }
        h2 { font-size: 18px; margin: 24px 0 12px 0; }
        h3 { font-size: 14px; margin: 16px 0 8px 0; }

        /* Wizard step navigation */
        .wizard-nav {
            display: flex;
            list-style: none;
            padding: 0;
            margin: 20px 0 30px 0;
            gap: 4px;
            flex-wrap: wrap;
        }
        .wizard-nav li {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 6px 10px;
            font-size: 12px;
            opacity: 0.4;
            border-radius: 4px;
            cursor: default;
            white-space: nowrap;
        }
        .wizard-nav li.active {
            opacity: 1;
            font-weight: bold;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }
        .wizard-nav li.completed {
            opacity: 0.8;
            cursor: pointer;
        }
        .wizard-nav li.completed:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .step-dot {
            width: 20px; height: 20px;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            font-size: 11px; font-weight: bold;
            background: var(--vscode-input-background);
            border: 1px solid var(--vscode-input-border, transparent);
            flex-shrink: 0;
        }
        .wizard-nav li.active .step-dot {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .wizard-nav li.completed .step-dot {
            background: var(--vscode-testing-iconPassed, #4caf50);
            color: white;
            border-color: transparent;
        }

        /* Steps content */
        .step-content { display: none; }
        .step-content.active { display: block; }

        /* Form elements */
        label {
            display: block;
            margin: 12px 0 4px 0;
            font-weight: 600;
            font-size: 13px;
        }
        input[type="text"], input[type="number"], input[type="url"], select, textarea {
            width: 100%;
            padding: 6px 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, transparent);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
            box-sizing: border-box;
        }
        textarea {
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            resize: vertical;
            min-height: 120px;
        }
        select { cursor: pointer; }
        input:focus, select:focus, textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }

        /* Buttons */
        .btn {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            font-family: var(--vscode-font-family);
        }
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-primary:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .btn-row {
            display: flex;
            gap: 8px;
            margin-top: 20px;
            justify-content: flex-end;
        }

        /* Cards (for template selection) */
        .template-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin: 12px 0;
        }
        .template-card {
            border: 2px solid var(--vscode-input-border, var(--vscode-panel-border, #444));
            border-radius: 8px;
            padding: 14px;
            cursor: pointer;
            transition: border-color 0.15s;
        }
        .template-card:hover {
            border-color: var(--vscode-focusBorder);
        }
        .template-card.selected {
            border-color: var(--vscode-button-background);
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .template-card h4 { margin: 0 0 6px 0; font-size: 14px; }
        .template-card p { margin: 0 0 6px 0; font-size: 12px; opacity: 0.85; }
        .template-card .meta {
            font-size: 11px;
            opacity: 0.65;
            display: flex;
            flex-direction: column;
            gap: 2px;
        }

        /* Field help descriptions */
        .field-help {
            font-size: 12px;
            opacity: 0.75;
            margin: 2px 0 8px 0;
            line-height: 1.5;
        }

        /* Info/warning boxes */
        .info-box {
            background: var(--vscode-inputValidation-infoBackground, rgba(0,120,212,0.1));
            border: 1px solid var(--vscode-inputValidation-infoBorder, #007acc);
            border-radius: 4px;
            padding: 10px 14px;
            margin: 12px 0;
            font-size: 12px;
        }
        .warning-box {
            background: var(--vscode-inputValidation-warningBackground, rgba(255,204,0,0.1));
            border: 1px solid var(--vscode-inputValidation-warningBorder, #ffcc00);
            border-radius: 4px;
            padding: 10px 14px;
            margin: 12px 0;
            font-size: 12px;
        }
        .success-box {
            background: rgba(76,175,80,0.1);
            border: 1px solid #4caf50;
            border-radius: 4px;
            padding: 10px 14px;
            margin: 12px 0;
            font-size: 12px;
        }
        .error-box {
            background: var(--vscode-inputValidation-errorBackground, rgba(255,0,0,0.1));
            border: 1px solid var(--vscode-inputValidation-errorBorder, #f44336);
            border-radius: 4px;
            padding: 10px 14px;
            margin: 12px 0;
            font-size: 12px;
        }

        /* Checklist */
        .checklist { list-style: none; padding: 0; margin: 12px 0; }
        .checklist li {
            padding: 6px 0;
            font-size: 13px;
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .check-ok::before { content: '✅'; }
        .check-fail::before { content: '❌'; }
        .check-warn::before { content: '⚠️'; }
        .check-info::before { content: 'ℹ️'; }

        /* Collapsible sections */
        .collapsible-header {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            padding: 8px 0;
            user-select: none;
            font-weight: 600;
            font-size: 13px;
        }
        .collapsible-header::before {
            content: '▸';
            transition: transform 0.15s;
        }
        .collapsible-header.open::before {
            transform: rotate(90deg);
        }
        .collapsible-body {
            display: none;
            padding: 0 0 0 16px;
            border-left: 2px solid var(--vscode-input-border, #444);
            margin-left: 6px;
        }
        .collapsible-body.open { display: block; }

        /* Output log */
        .output-log {
            background: var(--vscode-terminal-background, #1e1e1e);
            color: var(--vscode-terminal-foreground, #ccc);
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 12px;
            padding: 12px;
            border-radius: 4px;
            max-height: 300px;
            overflow-y: auto;
            white-space: pre-wrap;
            word-break: break-all;
            margin: 12px 0;
        }

        /* Secrets table */
        .secrets-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 12px;
            margin: 12px 0;
        }
        .secrets-table th, .secrets-table td {
            padding: 6px 10px;
            text-align: left;
            border-bottom: 1px solid var(--vscode-panel-border, #444);
        }
        .secrets-table th {
            font-weight: 600;
            background: var(--vscode-editor-inactiveSelectionBackground);
        }

        /* Hidden helper */
        .hidden { display: none !important; }

        /* Slider row */
        .slider-row {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .slider-row input[type="range"] {
            flex: 1;
            accent-color: var(--vscode-button-background);
        }
        .slider-value {
            min-width: 40px;
            text-align: right;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 13px;
        }

        /* Summary list */
        .summary-list {
            list-style: none;
            padding: 0;
        }
        .summary-list li {
            padding: 4px 0;
            font-size: 13px;
        }
        .summary-list li strong { margin-right: 4px; }

        /* Spinner */
        .spinner {
            display: inline-block;
            width: 16px;
            height: 16px;
            border: 2px solid var(--vscode-foreground);
            border-right-color: transparent;
            border-radius: 50%;
            animation: spin 0.8s linear infinite;
            vertical-align: middle;
            margin-right: 6px;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
    </style>
</head>
<body>
    <div class="container">
        <h1>🤖 Agent Monitoring Setup <span style="font-size:0.5em; color:var(--vscode-charts-orange); border:1px solid var(--vscode-charts-orange); border-radius:4px; padding:2px 8px; vertical-align:middle;">(Preview)</span></h1>
        <p style="opacity:0.7; margin-top:2px;">Set up autonomous telemetry monitoring agents for Business Central</p>

        <!-- Step Navigation -->
        <ul class="wizard-nav" id="nav">
            <li class="active" data-step="1"><span class="step-dot">1</span> Prerequisites</li>
            <li data-step="2"><span class="step-dot">2</span> LLM Config</li>
            <li data-step="3"><span class="step-dot">3</span> Create Agent</li>
            <li data-step="4"><span class="step-dot">4</span> Actions</li>
            <li data-step="5"><span class="step-dot">5</span> Defaults</li>
            <li data-step="6"><span class="step-dot">6</span> Pipeline</li>
            <li data-step="7"><span class="step-dot">7</span> Test Run</li>
            <li data-step="8"><span class="step-dot">8</span> Done</li>
        </ul>

        <!-- ═══ Step 1: Prerequisites ═══ -->
        <div class="step-content active" id="step-1">
            <h2>Prerequisites</h2>
            <p>Before setting up agent monitoring, you need the following:</p>
            <ul class="checklist" id="prereq-list">
                <li id="prereq-workspace">Checking workspace...</li>
                <li id="prereq-config">Checking .bctb-config.json...</li>
                <li id="prereq-mcp">Checking bctb-mcp installation...</li>
            </ul>

            <div class="info-box">
                <strong>What you'll also need:</strong>
                <ul style="margin:6px 0 0 0; padding-left: 18px;">
                    <li>Azure OpenAI deployment (GPT-4o recommended) <em>or</em> Anthropic API key</li>
                    <li>(Optional) Microsoft Teams Incoming Webhook URL for notifications</li>
                    <li>(Optional) SMTP relay or Microsoft Graph app for email notifications</li>
                </ul>
            </div>

            <div id="prereq-blocker" class="warning-box hidden">
                <strong>⚠️ Missing prerequisites</strong> — resolve the issues above before continuing.
                <br><button class="btn btn-secondary" style="margin-top:8px;" onclick="vscode.postMessage({type:'openSetupWizard'})">Open Setup Wizard</button>
            </div>

            <div class="btn-row">
                <button class="btn btn-primary" id="btn-prereq-next" disabled onclick="goToStep(2)">Next →</button>
            </div>
        </div>

        <!-- ═══ Step 2: LLM Configuration ═══ -->
        <div class="step-content" id="step-2">
            <h2>LLM Configuration</h2>
            <p>Configure the AI model that will power your monitoring agents.</p>

            <label for="llm-provider">Provider</label>
            <select id="llm-provider" onchange="onProviderChange()">
                <option value="azure-openai" selected>Azure OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
            </select>

            <div id="azure-fields">
                <label for="llm-endpoint">Endpoint URL</label>
                <input type="text" id="llm-endpoint" placeholder="https://your-resource.openai.azure.com/">

                <label for="llm-deployment">Deployment Name</label>
                <input type="text" id="llm-deployment" placeholder="gpt-4o" value="gpt-4o">

                <label for="llm-api-version">API Version</label>
                <input type="text" id="llm-api-version" placeholder="2024-10-21" value="2024-10-21">

                <div class="info-box">
                    🔑 Set your API key as the <code>AZURE_OPENAI_KEY</code> environment variable before launching VS Code. It is <strong>not</strong> stored in the config file.
                </div>
            </div>

            <div id="anthropic-fields" class="hidden">
                <label for="llm-model">Model</label>
                <input type="text" id="llm-model" placeholder="claude-sonnet-4-20250514" value="claude-sonnet-4-20250514">

                <div class="info-box">
                    🔑 Set your API key as the <code>ANTHROPIC_API_KEY</code> environment variable before launching VS Code. It is <strong>not</strong> stored in the config file.
                </div>
            </div>

            <div class="btn-row" style="justify-content: space-between;">
                <button class="btn btn-secondary" onclick="testLLMConnection()">🔌 Test Connection</button>
                <div id="llm-test-status" style="display:flex;align-items:center;"></div>
            </div>
            <div id="llm-test-result" class="hidden" style="margin-top:8px;"></div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(1)">← Back</button>
                <button class="btn btn-primary" onclick="saveLLMAndNext()">Save & Next →</button>
            </div>
        </div>

        <!-- ═══ Step 3: Create Agent ═══ -->
        <div class="step-content" id="step-3">
            <h2>Create Your First Agent</h2>
            <p>Choose a template or start from scratch. You can create more agents later.</p>

            <div class="template-grid" id="template-grid"></div>

            <label for="agent-name">Agent Name <span style="font-weight:normal;opacity:0.65;">(lowercase, no spaces)</span></label>
            <input type="text" id="agent-name" placeholder="my-monitor" oninput="validateAgentName()">
            <div id="agent-name-error" class="error-box hidden" style="margin-top:4px;"></div>

            <label for="agent-instruction">Instruction <span style="font-weight:normal;opacity:0.65;">(edit to customize)</span></label>
            <textarea id="agent-instruction" rows="10" placeholder="Describe what this agent should monitor..."></textarea>

            <div id="agent-create-result" class="hidden" style="margin-top:8px;"></div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(2)">← Back</button>
                <button class="btn btn-primary" id="btn-create-agent" onclick="createAgent()">Create Agent & Next →</button>
            </div>
        </div>

        <!-- ═══ Step 4: Actions Configuration ═══ -->
        <div class="step-content" id="step-4">
            <h2>Notification Actions</h2>
            <p>Configure where agents send alerts. All actions are optional — expand a section to configure it.
            See <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#action-types" style="color:var(--vscode-textLink-foreground);">Action Types</a> in the User Guide for step-by-step setup instructions for each action.</p>

            <!-- Teams Webhook -->
            <div class="collapsible-header" onclick="toggleCollapsible(this)">
                📢 Teams Webhook
            </div>
            <div class="collapsible-body">
                <p class="field-help">Post alert cards to a Microsoft Teams channel. To get a webhook URL: open Teams → pick a channel → <strong>Manage channel</strong> → <strong>Connectors</strong> (or <strong>Workflows</strong> in new Teams) → add <strong>Incoming Webhook</strong> → copy the URL.
                <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#teams-webhook" style="color:var(--vscode-textLink-foreground);">Detailed setup guide →</a></p>
                <label for="teams-url">Webhook URL</label>
                <input type="url" id="teams-url" placeholder="https://your-org.webhook.office.com/...">
                <div class="btn-row" style="justify-content:flex-start; margin-top:8px;">
                    <button class="btn btn-secondary" onclick="testTeamsWebhook()">Send Test Message</button>
                    <span id="teams-test-status"></span>
                </div>
            </div>

            <!-- Email SMTP -->
            <div class="collapsible-header" onclick="toggleCollapsible(this)">
                ✉️ Email (SMTP)
            </div>
            <div class="collapsible-body">
                <p class="field-help">Send email alerts via any SMTP relay (SendGrid, Mailgun, Brevo, etc.). Free tiers available — e.g. Brevo offers 300 emails/day, SendGrid 100/day. Your provider gives you the host, port, and credentials.
                <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#email-via-smtp" style="color:var(--vscode-textLink-foreground);">Setup examples for SendGrid & Brevo →</a></p>
                <label for="smtp-host">SMTP Host</label>
                <input type="text" id="smtp-host" placeholder="smtp.sendgrid.net">
                <div style="display:flex;gap:12px;">
                    <div style="flex:1"><label for="smtp-port">Port</label><input type="number" id="smtp-port" value="587"></div>
                    <div style="flex:1"><label for="smtp-secure">Secure</label><select id="smtp-secure"><option value="true">Yes (TLS)</option><option value="false" selected>No (STARTTLS)</option></select></div>
                </div>
                <label for="smtp-user">Username</label>
                <input type="text" id="smtp-user" placeholder="apikey">
                <label for="smtp-from">From Address</label>
                <input type="text" id="smtp-from" placeholder="telemetry@yourdomain.com">
                <label for="smtp-to">Default Recipients <span style="font-weight:normal;opacity:0.65;">(comma separated)</span></label>
                <input type="text" id="smtp-to" placeholder="devlead@yourdomain.com, team@yourdomain.com">
                <div class="info-box">🔑 Set <code>SMTP_PASSWORD</code> environment variable for the SMTP password / API key.</div>
            </div>

            <!-- Email Graph -->
            <div class="collapsible-header" onclick="toggleCollapsible(this)">
                ✉️ Email (Microsoft Graph)
            </div>
            <div class="collapsible-body">
                <p class="field-help">Send email using Microsoft Graph API — ideal if your org uses Microsoft 365. Requires an Azure AD App Registration with <strong>Mail.Send</strong> permission. The <em>from</em> address must be a valid mailbox in your tenant.
                <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#email-via-microsoft-graph" style="color:var(--vscode-textLink-foreground);">Step-by-step App Registration guide →</a></p>
                <label for="graph-tenant-id">Tenant ID</label>
                <input type="text" id="graph-tenant-id" placeholder="00000000-0000-0000-0000-000000000000">
                <label for="graph-client-id">Client ID</label>
                <input type="text" id="graph-client-id" placeholder="00000000-0000-0000-0000-000000000000">
                <label for="graph-from">From Address</label>
                <input type="text" id="graph-from" placeholder="telemetry@yourdomain.com">
                <label for="graph-to">Default Recipients <span style="font-weight:normal;opacity:0.65;">(comma separated)</span></label>
                <input type="text" id="graph-to" placeholder="devlead@yourdomain.com">
                <div class="info-box">🔑 Set <code>GRAPH_CLIENT_SECRET</code> environment variable. App must have <code>Mail.Send</code> permission.</div>
            </div>

            <!-- Generic Webhook -->
            <div class="collapsible-header" onclick="toggleCollapsible(this)">
                🔗 Generic Webhook
            </div>
            <div class="collapsible-body">
                <p class="field-help">Send a JSON payload to any HTTP endpoint — Slack, Discord, PagerDuty, Zapier, Power Automate, or your own API. The agent posts alert details as JSON.
                <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#generic-webhook-slack-pagerduty-etc" style="color:var(--vscode-textLink-foreground);">Examples for Slack, Discord & custom APIs →</a></p>
                <label for="webhook-url">URL</label>
                <input type="url" id="webhook-url" placeholder="https://your-endpoint.com/webhook">
                <label for="webhook-method">Method</label>
                <select id="webhook-method"><option value="POST" selected>POST</option><option value="PUT">PUT</option></select>
                <label for="webhook-headers">Custom Headers <span style="font-weight:normal;opacity:0.65;">(JSON object)</span></label>
                <input type="text" id="webhook-headers" placeholder='{"Authorization": "Bearer ..."}'>
            </div>

            <!-- Pipeline Trigger -->
            <div class="collapsible-header" onclick="toggleCollapsible(this)">
                🚀 Azure DevOps Pipeline Trigger
            </div>
            <div class="collapsible-body">
                <p class="field-help">Trigger an Azure DevOps pipeline when the agent detects an issue — for automated remediation or rollback workflows. The PAT needs <strong>Build: Read & execute</strong> scope.
                <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#azure-devops-pipeline-trigger" style="color:var(--vscode-textLink-foreground);">How to find Pipeline ID & create a PAT →</a></p>
                <label for="pipeline-org">Organization URL</label>
                <input type="url" id="pipeline-org" placeholder="https://dev.azure.com/your-org">
                <label for="pipeline-project">Project</label>
                <input type="text" id="pipeline-project" placeholder="MyProject">
                <label for="pipeline-id">Pipeline ID</label>
                <input type="number" id="pipeline-id" placeholder="42">
                <div class="info-box">🔑 Set <code>DEVOPS_PAT</code> environment variable for the Azure DevOps Personal Access Token.</div>
            </div>

            <div id="actions-save-result" class="hidden" style="margin-top:12px;"></div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(3)">← Back</button>
                <button class="btn btn-secondary" onclick="goToStep(5)">Skip →</button>
                <button class="btn btn-primary" onclick="saveActionsAndNext()">Save & Next →</button>
            </div>
        </div>

        <!-- ═══ Step 5: Agent Defaults ═══ -->
        <div class="step-content" id="step-5">
            <h2>Agent Defaults</h2>
            <p>These settings apply to all agents unless overridden per-agent. Defaults work well for most setups.
            See <a href="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#advanced-agent-configuration" style="color:var(--vscode-textLink-foreground);">Advanced Agent Configuration</a> in the User Guide for full reference.</p>

            <label>Max Tool Calls per Run</label>
            <p class="field-help">How many MCP tool calls (queries, analyses) the LLM may invoke in a single agent run before the run is aborted. Increase if your agent needs to query many tenants or event types; decrease to limit cost. Default: <strong>20</strong>.</p>
            <div class="slider-row">
                <input type="range" id="def-max-tools" min="5" max="50" value="20" oninput="updateSliderValue('def-max-tools')">
                <span class="slider-value" id="def-max-tools-val">20</span>
            </div>

            <label>Max Tokens (LLM response)</label>
            <p class="field-help">Maximum number of tokens the LLM may generate per response. Higher values allow more detailed analysis but cost more. 4096 works well for most agents. Default: <strong>4096</strong>.</p>
            <div class="slider-row">
                <input type="range" id="def-max-tokens" min="1024" max="8192" step="256" value="4096" oninput="updateSliderValue('def-max-tokens')">
                <span class="slider-value" id="def-max-tokens-val">4096</span>
            </div>

            <label>Context Window (recent runs kept)</label>
            <p class="field-help">Number of recent run results kept in the agent's state file. The agent uses these to detect trends across runs (e.g., "error rate rising for 3 consecutive checks"). Older runs are compacted into a summary. Default: <strong>5</strong>.</p>
            <div class="slider-row">
                <input type="range" id="def-context-window" min="3" max="20" value="5" oninput="updateSliderValue('def-context-window')">
                <span class="slider-value" id="def-context-window-val">5</span>
            </div>

            <label for="def-resolved-ttl">Resolved Issue TTL (days)</label>
            <p class="field-help">How long resolved issues stay in the agent's memory before being pruned. This prevents the agent from re-alerting on issues it already tracked and closed. Default: <strong>30 days</strong>.</p>
            <input type="number" id="def-resolved-ttl" value="30" min="1" max="365" style="width:100px;">

            <label>Tool Scope</label>
            <p class="field-help">Controls which MCP tools the agent is allowed to call. <strong>Read-only</strong> means the agent can only query and analyze telemetry data — it cannot write files. <strong>Full</strong> additionally allows <code>save_query</code> to persist queries to your workspace. Use Read-only unless you specifically want agents to save queries.</p>
            <div style="display:flex;gap:16px;margin-top:4px;">
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer;">
                    <input type="radio" name="def-tool-scope" value="read-only" checked> Read-only <span style="opacity:0.6;">(recommended)</span>
                </label>
                <label style="display:flex;align-items:center;gap:6px;font-weight:normal;cursor:pointer;">
                    <input type="radio" name="def-tool-scope" value="full"> Full <span style="opacity:0.6;">(allows save_query)</span>
                </label>
            </div>

            <div id="defaults-save-result" class="hidden" style="margin-top:12px;"></div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(4)">← Back</button>
                <button class="btn btn-primary" onclick="saveDefaultsAndNext()">Save & Next →</button>
            </div>
        </div>

        <!-- ═══ Step 6: Pipeline Template ═══ -->
        <div class="step-content" id="step-6">
            <h2>CI/CD Pipeline</h2>
            <p>Copy a pipeline template to run your agents on a schedule. You can skip this if you prefer to run agents manually.</p>
            <p class="field-help">The pipeline checks out your repo (which includes <code>.bctb-config.json</code> with all non-sensitive settings), installs the MCP, and runs your agents. You only need to add <strong>actual secrets</strong> (API keys, passwords) to your CI/CD platform — everything else is already in the config file.</p>

            <div class="template-grid">
                <div class="template-card" id="pl-github" onclick="selectPipeline('github-actions')">
                    <h4>GitHub Actions</h4>
                    <p>Cron-based workflow that runs hourly, commits agent state back to the repo.</p>
                    <div class="meta">
                        <span>→ .github/workflows/telemetry-agent.yml</span>
                    </div>
                </div>
                <div class="template-card" id="pl-azdo" onclick="selectPipeline('azure-devops')">
                    <h4>Azure DevOps</h4>
                    <p>Scheduled pipeline that runs hourly, commits state via persistent credentials.</p>
                    <div class="meta">
                        <span>→ azure-pipelines-agents.yml</span>
                    </div>
                </div>
            </div>

            <div id="pipeline-settings" class="hidden" style="margin-top:16px;">
                <h3>Pipeline Settings</h3>
                <div class="field-group">
                    <label>Default branch</label>
                    <input type="text" id="pipeline-branch" value="main" placeholder="main" />
                    <p class="field-help">Branch used for scheduled triggers and git push (e.g. <code>main</code> or <code>master</code>).</p>
                </div>
                <div class="field-group" id="pipeline-vargroup-group">
                    <label>Variable group name</label>
                    <input type="text" id="pipeline-vargroup" value="bctb-secrets" placeholder="bctb-secrets" />
                    <p class="field-help">Azure DevOps variable group containing your secrets. You can use an existing group.</p>
                </div>
            </div>

            <div id="pipeline-secrets" class="hidden">
                <h3>Required Secrets</h3>
                <div class="info-box">
                    <strong>Why so few secrets?</strong> Your <code>.bctb-config.json</code> is checked into the repo and already contains non-sensitive settings (tenant ID, App Insights ID, Kusto URL, LLM endpoint, deployment name, etc.). The pipeline reads those from the config file automatically. You only need to add <em>actual secrets</em> — keys and passwords that must not be in source control.
                </div>
                <p>Add these secrets to your <span id="secrets-platform">CI/CD</span> platform:</p>

                <h4 style="margin-top:16px;">Always Required</h4>
                <table class="secrets-table">
                    <thead><tr><th>Secret</th><th>Description</th></tr></thead>
                    <tbody>
                        <tr><td><code>BCTB_CLIENT_ID</code></td><td>App Registration client ID (for <code>client_credentials</code> auth in CI/CD)</td></tr>
                        <tr><td><code>BCTB_CLIENT_SECRET</code></td><td>App Registration client secret</td></tr>
                        <tr id="secret-aoai-key"><td><code>AZURE_OPENAI_KEY</code></td><td>Azure OpenAI API key</td></tr>
                        <tr id="secret-anthropic-key" class="hidden"><td><code>ANTHROPIC_API_KEY</code></td><td>Anthropic API key</td></tr>
                    </tbody>
                </table>

                <div id="action-secrets-section" class="hidden">
                    <h4 style="margin-top:16px;">Based on Your Actions (Step 4)</h4>
                    <table class="secrets-table">
                        <thead><tr><th>Secret</th><th>Description</th></tr></thead>
                        <tbody id="action-secrets-tbody">
                        </tbody>
                    </table>
                </div>

                <div class="info-box" style="margin-top:12px;">
                    <strong>Not listed here:</strong> <code>BCTB_TENANT_ID</code>, <code>BCTB_APP_INSIGHTS_ID</code>, <code>BCTB_KUSTO_CLUSTER_URL</code>, <code>AZURE_OPENAI_ENDPOINT</code>, <code>AZURE_OPENAI_DEPLOYMENT</code> — these are already in your <code>.bctb-config.json</code> and don't need to be secrets.
                </div>
            </div>

            <div id="pipeline-result" class="hidden" style="margin-top:12px;"></div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(5)">← Back</button>
                <button class="btn btn-secondary" onclick="goToStep(7)">Skip →</button>
                <button class="btn btn-primary" id="btn-copy-pipeline" disabled onclick="copyPipeline()">Copy & Next →</button>
            </div>
        </div>

        <!-- ═══ Step 7: Test Run ═══ -->
        <div class="step-content" id="step-7">
            <h2>Test Run</h2>
            <p>Run your agent once to verify everything works. This will call Azure OpenAI and query your Application Insights.</p>

            <div class="info-box">
                <strong>This may take 30-60 seconds.</strong> The agent will connect to your LLM and telemetry source, discover events, and produce its first findings.
            </div>

            <div id="test-agent-name" style="margin:12px 0;font-size:13px;"></div>

            <button class="btn btn-primary" id="btn-test-run" onclick="runTestAgent()">▶ Run Agent Now</button>

            <div id="test-run-status" class="hidden" style="margin-top:12px;">
                <div id="test-run-progress"></div>
                <div id="test-run-output" class="output-log hidden"></div>
            </div>

            <div class="btn-row">
                <button class="btn btn-secondary" onclick="goToStep(6)">← Back</button>
                <button class="btn btn-secondary" onclick="goToStep(8)">Skip →</button>
                <button class="btn btn-primary hidden" id="btn-test-next" onclick="goToStep(8)">Next →</button>
            </div>
        </div>

        <!-- ═══ Step 8: Done ═══ -->
        <div class="step-content" id="step-8">
            <h2>✅ Setup Complete</h2>
            <p>Your agent monitoring (preview) is configured and ready to go!</p>

            <h3>Summary</h3>
            <ul class="summary-list" id="final-summary"></ul>

            <h3>Next Steps</h3>
            <ul style="font-size:13px; padding-left:18px;">
                <li>Edit the agent's <code>instruction.md</code> to customize monitoring behavior</li>
                <li>Add the required secrets to your CI/CD platform (if you chose a pipeline)</li>
                <li>Push your changes to trigger the pipeline</li>
                <li>Create additional agents with <code>bctb-mcp agent start "..." --name ...</code></li>
                <li>View agent status with <code>bctb-mcp agent list</code></li>
            </ul>

            <div class="btn-row" style="justify-content:flex-start;">
                <button class="btn btn-primary" id="btn-open-instruction" onclick="openAgentInstruction()">Open Instruction</button>
                <button class="btn btn-secondary" id="btn-open-config" onclick="openConfig()">Open Config</button>
                <button class="btn btn-secondary" onclick="vscode.postMessage({type:'closeWizard'})">Close</button>
            </div>
        </div>

    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const templates = ${templatesJson};

        // ═══ State ═══
        let currentStep = 1;
        let completedSteps = new Set();
        let selectedTemplate = null;
        let selectedPipeline = null;
        let createdAgentName = null;
        let workspacePath = null;

        // ═══ Initialize ═══
        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'prerequisites': handlePrerequisites(msg); break;
                case 'currentConfig': handleConfig(msg.config); break;
                case 'llmConfigSaved': handleLLMSaved(msg); break;
                case 'llmTestResult': handleLLMTest(msg); break;
                case 'agentCreated': handleAgentCreated(msg); break;
                case 'actionsConfigSaved': handleActionsSaved(msg); break;
                case 'teamsWebhookResult': handleTeamsTest(msg); break;
                case 'defaultsConfigSaved': handleDefaultsSaved(msg); break;
                case 'pipelineCopied': handlePipelineCopied(msg); break;
                case 'testRunProgress': handleTestProgress(msg); break;
                case 'testRunResult': handleTestResult(msg); break;
            }
        });

        // Kick off prerequisite check
        vscode.postMessage({ type: 'checkPrerequisites' });
        vscode.postMessage({ type: 'loadConfig' });

        // Build template cards
        (function buildTemplateGrid() {
            const grid = document.getElementById('template-grid');
            // Custom (blank) option
            const customCard = document.createElement('div');
            customCard.className = 'template-card';
            customCard.onclick = () => selectTemplate(null);
            customCard.id = 'tpl-custom';
            customCard.innerHTML = '<h4>✏️ Custom (Blank)</h4><p>Start with an empty instruction — write your own monitoring rules.</p><div class="meta"><span>No predefined events</span></div>';
            grid.appendChild(customCard);

            templates.forEach(t => {
                const card = document.createElement('div');
                card.className = 'template-card';
                card.id = 'tpl-' + t.id;
                card.onclick = () => selectTemplate(t.id);
                card.innerHTML =
                    '<h4>' + escapeHtml(t.name) + '</h4>' +
                    '<p>' + escapeHtml(t.description) + '</p>' +
                    '<div class="meta"><span>Events: ' + escapeHtml(t.events) + '</span>' +
                    '<span>Escalation: ' + escapeHtml(t.escalation) + '</span></div>';
                grid.appendChild(card);
            });
        })();

        // ═══ Navigation ═══
        function goToStep(step) {
            if (step < 1 || step > 8) return;

            // Mark current as completed if moving forward
            if (step > currentStep) {
                completedSteps.add(currentStep);
            }

            currentStep = step;

            // Update nav
            document.querySelectorAll('.wizard-nav li').forEach(li => {
                const s = parseInt(li.dataset.step);
                li.classList.remove('active', 'completed');
                if (s === currentStep) li.classList.add('active');
                else if (completedSteps.has(s)) li.classList.add('completed');
            });

            // Update content
            document.querySelectorAll('.step-content').forEach(div => div.classList.remove('active'));
            document.getElementById('step-' + step).classList.add('active');

            // Step-specific init
            if (step === 7) initTestRunStep();
            if (step === 8) buildSummary();
        }

        // Allow clicking completed steps in nav
        document.querySelectorAll('.wizard-nav li').forEach(li => {
            li.addEventListener('click', () => {
                const s = parseInt(li.dataset.step);
                if (completedSteps.has(s) || s === currentStep) goToStep(s);
            });
        });

        // ═══ Step 1: Prerequisites ═══
        function handlePrerequisites(msg) {
            workspacePath = msg.workspacePath;
            const wsEl = document.getElementById('prereq-workspace');
            const cfgEl = document.getElementById('prereq-config');
            const mcpEl = document.getElementById('prereq-mcp');

            wsEl.className = msg.hasWorkspace ? 'check-ok' : 'check-fail';
            wsEl.textContent = msg.hasWorkspace ? 'Workspace folder is open' : 'No workspace folder open — open a folder first';

            cfgEl.className = msg.hasConfig ? 'check-ok' : 'check-fail';
            cfgEl.textContent = msg.hasConfig ? '.bctb-config.json found' : '.bctb-config.json not found — run the Setup Wizard first';

            mcpEl.className = msg.mcpInstalled ? 'check-ok' : 'check-fail';
            mcpEl.textContent = msg.mcpInstalled
                ? 'bctb-mcp installed (v' + msg.mcpVersion + ')'
                : 'bctb-mcp not installed — run "npm install -g bc-telemetry-buddy-mcp"';

            const canProceed = msg.hasWorkspace && msg.hasConfig && msg.mcpInstalled;
            document.getElementById('btn-prereq-next').disabled = !canProceed;
            document.getElementById('prereq-blocker').classList.toggle('hidden', canProceed);
        }

        // ═══ Step 2: LLM Config ═══
        function handleConfig(config) {
            if (config?.agents?.llm) {
                const llm = config.agents.llm;
                if (llm.provider) document.getElementById('llm-provider').value = llm.provider;
                if (llm.endpoint) document.getElementById('llm-endpoint').value = llm.endpoint;
                if (llm.deployment) document.getElementById('llm-deployment').value = llm.deployment;
                if (llm.model) {
                    document.getElementById('llm-model').value = llm.model;
                    if (!llm.deployment) document.getElementById('llm-deployment').value = llm.model;
                }
                if (llm.apiVersion) document.getElementById('llm-api-version').value = llm.apiVersion;
                onProviderChange();
            }
            if (config?.agents?.actions) {
                const a = config.agents.actions;
                if (a['teams-webhook']?.url) document.getElementById('teams-url').value = a['teams-webhook'].url;
                if (a['email-smtp']) {
                    const s = a['email-smtp'];
                    if (s.host) document.getElementById('smtp-host').value = s.host;
                    if (s.port) document.getElementById('smtp-port').value = s.port;
                    if (s.secure !== undefined) document.getElementById('smtp-secure').value = String(s.secure);
                    if (s.auth?.user) document.getElementById('smtp-user').value = s.auth.user;
                    if (s.from) document.getElementById('smtp-from').value = s.from;
                    if (s.defaultTo) document.getElementById('smtp-to').value = s.defaultTo.join(', ');
                }
                if (a['email-graph']) {
                    const g = a['email-graph'];
                    if (g.tenantId) document.getElementById('graph-tenant-id').value = g.tenantId;
                    if (g.clientId) document.getElementById('graph-client-id').value = g.clientId;
                    if (g.from) document.getElementById('graph-from').value = g.from;
                    if (g.defaultTo) document.getElementById('graph-to').value = g.defaultTo.join(', ');
                }
                if (a['generic-webhook']) {
                    const w = a['generic-webhook'];
                    if (w.url) document.getElementById('webhook-url').value = w.url;
                    if (w.method) document.getElementById('webhook-method').value = w.method;
                    if (w.headers) document.getElementById('webhook-headers').value = JSON.stringify(w.headers);
                }
                if (a['pipeline-trigger']) {
                    const p = a['pipeline-trigger'];
                    if (p.orgUrl) document.getElementById('pipeline-org').value = p.orgUrl;
                    if (p.project) document.getElementById('pipeline-project').value = p.project;
                    if (p.pipelineId) document.getElementById('pipeline-id').value = p.pipelineId;
                }
            }
            if (config?.agents?.defaults) {
                const d = config.agents.defaults;
                if (d.maxToolCalls) { document.getElementById('def-max-tools').value = d.maxToolCalls; updateSliderValue('def-max-tools'); }
                if (d.maxTokens) { document.getElementById('def-max-tokens').value = d.maxTokens; updateSliderValue('def-max-tokens'); }
                if (d.contextWindowRuns) { document.getElementById('def-context-window').value = d.contextWindowRuns; updateSliderValue('def-context-window'); }
                if (d.resolvedIssueTTLDays) document.getElementById('def-resolved-ttl').value = d.resolvedIssueTTLDays;
                if (d.toolScope) document.querySelector('input[name="def-tool-scope"][value="' + d.toolScope + '"]').checked = true;
            }
        }

        function onProviderChange() {
            const provider = document.getElementById('llm-provider').value;
            document.getElementById('azure-fields').classList.toggle('hidden', provider !== 'azure-openai');
            document.getElementById('anthropic-fields').classList.toggle('hidden', provider !== 'anthropic');
        }

        function getLLMConfig() {
            const provider = document.getElementById('llm-provider').value;
            if (provider === 'azure-openai') {
                return {
                    provider,
                    endpoint: document.getElementById('llm-endpoint').value.trim(),
                    deployment: document.getElementById('llm-deployment').value.trim(),
                    apiVersion: document.getElementById('llm-api-version').value.trim() || '2024-10-21'
                };
            } else {
                return {
                    provider,
                    model: document.getElementById('llm-model').value.trim()
                };
            }
        }

        function testLLMConnection() {
            const statusEl = document.getElementById('llm-test-status');
            statusEl.innerHTML = '<span class="spinner"></span> Testing...';
            document.getElementById('llm-test-result').classList.add('hidden');
            vscode.postMessage({ type: 'testLLMConnection', llmConfig: getLLMConfig() });
        }

        function handleLLMTest(msg) {
            const statusEl = document.getElementById('llm-test-status');
            const resultEl = document.getElementById('llm-test-result');
            resultEl.classList.remove('hidden');
            if (msg.success) {
                statusEl.innerHTML = '✅';
                resultEl.className = 'success-box';
                resultEl.textContent = 'Connected successfully to ' + msg.provider + '!';
            } else {
                statusEl.innerHTML = '❌';
                resultEl.className = 'error-box';
                resultEl.textContent = msg.error;
            }
        }

        function saveLLMAndNext() {
            const config = getLLMConfig();
            if (config.provider === 'azure-openai' && !config.endpoint) {
                alert('Please enter the Azure OpenAI endpoint URL.');
                return;
            }
            vscode.postMessage({ type: 'saveLLMConfig', llmConfig: config });
        }

        function handleLLMSaved(msg) {
            if (msg.success) {
                goToStep(3);
            } else {
                alert('Failed to save LLM config: ' + msg.error);
            }
        }

        // ═══ Step 3: Create Agent ═══
        function selectTemplate(templateId) {
            selectedTemplate = templateId;
            // Update card selection
            document.querySelectorAll('#template-grid .template-card').forEach(c => c.classList.remove('selected'));
            if (templateId) {
                document.getElementById('tpl-' + templateId).classList.add('selected');
                const t = templates.find(t => t.id === templateId);
                document.getElementById('agent-name').value = templateId;
                document.getElementById('agent-instruction').value = t.instruction;
            } else {
                document.getElementById('tpl-custom').classList.add('selected');
                document.getElementById('agent-name').value = '';
                document.getElementById('agent-instruction').value = '';
            }
            document.getElementById('agent-name').focus();
            validateAgentName();
        }

        function validateAgentName() {
            const name = document.getElementById('agent-name').value.trim();
            const errorEl = document.getElementById('agent-name-error');
            const btn = document.getElementById('btn-create-agent');
            if (!name) {
                errorEl.classList.add('hidden');
                btn.disabled = true;
                return;
            }
            if (/[^a-z0-9-]/.test(name)) {
                errorEl.classList.remove('hidden');
                errorEl.textContent = 'Agent name must be lowercase letters, numbers, and hyphens only.';
                btn.disabled = true;
                return;
            }
            if (name.startsWith('-') || name.endsWith('-')) {
                errorEl.classList.remove('hidden');
                errorEl.textContent = 'Agent name cannot start or end with a hyphen.';
                btn.disabled = true;
                return;
            }
            errorEl.classList.add('hidden');
            btn.disabled = false;
        }

        function createAgent() {
            const name = document.getElementById('agent-name').value.trim();
            const instruction = document.getElementById('agent-instruction').value.trim();
            if (!name) { alert('Please enter an agent name.'); return; }
            if (!instruction) { alert('Please enter an instruction for the agent.'); return; }
            vscode.postMessage({ type: 'createAgent', agentName: name, instruction: instruction });
        }

        function handleAgentCreated(msg) {
            const resultEl = document.getElementById('agent-create-result');
            resultEl.classList.remove('hidden');
            if (msg.success) {
                createdAgentName = msg.agentName;
                resultEl.className = 'success-box';
                resultEl.innerHTML = '✅ Agent <strong>' + escapeHtml(msg.agentName) + '</strong> created at <code>agents/' + escapeHtml(msg.agentName) + '/</code>';
                setTimeout(() => goToStep(4), 600);
            } else {
                resultEl.className = 'error-box';
                resultEl.textContent = 'Failed: ' + msg.error;
            }
        }

        // ═══ Step 4: Actions ═══
        function toggleCollapsible(header) {
            header.classList.toggle('open');
            const body = header.nextElementSibling;
            body.classList.toggle('open');
        }

        function testTeamsWebhook() {
            const url = document.getElementById('teams-url').value.trim();
            if (!url) { alert('Enter a Teams webhook URL first.'); return; }
            document.getElementById('teams-test-status').innerHTML = '<span class="spinner"></span>';
            vscode.postMessage({ type: 'testTeamsWebhook', url });
        }

        function handleTeamsTest(msg) {
            const el = document.getElementById('teams-test-status');
            el.innerHTML = msg.success ? '✅ Message sent!' : '❌ ' + escapeHtml(msg.error);
        }

        function buildActionsConfig() {
            const config = {};
            const teamsUrl = document.getElementById('teams-url').value.trim();
            if (teamsUrl) config['teams-webhook'] = { url: teamsUrl };

            const smtpHost = document.getElementById('smtp-host').value.trim();
            if (smtpHost) {
                config['email-smtp'] = {
                    host: smtpHost,
                    port: parseInt(document.getElementById('smtp-port').value) || 587,
                    secure: document.getElementById('smtp-secure').value === 'true',
                    auth: { user: document.getElementById('smtp-user').value.trim() },
                    from: document.getElementById('smtp-from').value.trim(),
                    defaultTo: document.getElementById('smtp-to').value.split(',').map(s => s.trim()).filter(Boolean)
                };
            }

            const graphTenantId = document.getElementById('graph-tenant-id').value.trim();
            if (graphTenantId) {
                config['email-graph'] = {
                    tenantId: graphTenantId,
                    clientId: document.getElementById('graph-client-id').value.trim(),
                    from: document.getElementById('graph-from').value.trim(),
                    defaultTo: document.getElementById('graph-to').value.split(',').map(s => s.trim()).filter(Boolean)
                };
            }

            const webhookUrl = document.getElementById('webhook-url').value.trim();
            if (webhookUrl) {
                const w = { url: webhookUrl, method: document.getElementById('webhook-method').value };
                const headersStr = document.getElementById('webhook-headers').value.trim();
                if (headersStr) { try { w.headers = JSON.parse(headersStr); } catch {} }
                config['generic-webhook'] = w;
            }

            const pipelineOrg = document.getElementById('pipeline-org').value.trim();
            if (pipelineOrg) {
                config['pipeline-trigger'] = {
                    orgUrl: pipelineOrg,
                    project: document.getElementById('pipeline-project').value.trim(),
                    pipelineId: parseInt(document.getElementById('pipeline-id').value) || 0
                };
            }

            return config;
        }

        function saveActionsAndNext() {
            const config = buildActionsConfig();
            vscode.postMessage({ type: 'saveActionsConfig', actionsConfig: config });
        }

        function handleActionsSaved(msg) {
            if (msg.success) {
                goToStep(5);
            } else {
                const el = document.getElementById('actions-save-result');
                el.classList.remove('hidden');
                el.className = 'error-box';
                el.textContent = 'Failed: ' + msg.error;
            }
        }

        // ═══ Step 5: Defaults ═══
        function updateSliderValue(id) {
            document.getElementById(id + '-val').textContent = document.getElementById(id).value;
        }

        function saveDefaultsAndNext() {
            const config = {
                maxToolCalls: parseInt(document.getElementById('def-max-tools').value),
                maxTokens: parseInt(document.getElementById('def-max-tokens').value),
                contextWindowRuns: parseInt(document.getElementById('def-context-window').value),
                resolvedIssueTTLDays: parseInt(document.getElementById('def-resolved-ttl').value),
                toolScope: document.querySelector('input[name="def-tool-scope"]:checked').value
            };
            vscode.postMessage({ type: 'saveDefaultsConfig', defaultsConfig: config });
        }

        function handleDefaultsSaved(msg) {
            if (msg.success) {
                goToStep(6);
            } else {
                const el = document.getElementById('defaults-save-result');
                el.classList.remove('hidden');
                el.className = 'error-box';
                el.textContent = 'Failed: ' + msg.error;
            }
        }

        // ═══ Step 6: Pipeline ═══
        function selectPipeline(type) {
            selectedPipeline = type;
            document.querySelectorAll('#step-6 .template-card').forEach(c => c.classList.remove('selected'));
            document.getElementById(type === 'github-actions' ? 'pl-github' : 'pl-azdo').classList.add('selected');
            document.getElementById('btn-copy-pipeline').disabled = false;

            // Show pipeline settings
            const settingsEl = document.getElementById('pipeline-settings');
            settingsEl.classList.remove('hidden');

            // Variable group is Azure DevOps only
            document.getElementById('pipeline-vargroup-group').classList.toggle('hidden', type === 'github-actions');

            // Update secrets platform text (use current variable group name for Azure DevOps)
            const varGroupName = document.getElementById('pipeline-vargroup')?.value || 'bctb-secrets';
            const secretsEl = document.getElementById('pipeline-secrets');
            secretsEl.classList.remove('hidden');
            document.getElementById('secrets-platform').textContent =
                type === 'github-actions' ? 'GitHub repository settings (Settings → Secrets and variables → Actions)' : 'Azure DevOps variable group (' + varGroupName + ')';

            // Show correct LLM key based on provider selection in Step 2
            const provider = document.getElementById('llm-provider').value;
            document.getElementById('secret-aoai-key').classList.toggle('hidden', provider === 'anthropic');
            document.getElementById('secret-anthropic-key').classList.toggle('hidden', provider !== 'anthropic');

            // Build action secrets based on what was configured in Step 4
            const actionSecrets = [];
            if (document.getElementById('teams-url').value.trim()) {
                actionSecrets.push({ name: 'TEAMS_WEBHOOK_URL', desc: 'Teams Incoming Webhook URL' });
            }
            if (document.getElementById('smtp-host').value.trim()) {
                actionSecrets.push({ name: 'SMTP_PASSWORD', desc: 'SMTP password or API key' });
            }
            if (document.getElementById('graph-client-id').value.trim()) {
                actionSecrets.push({ name: 'GRAPH_CLIENT_SECRET', desc: 'Azure AD client secret for Graph email' });
            }
            if (document.getElementById('pipeline-id').value.trim()) {
                actionSecrets.push({ name: 'DEVOPS_PAT', desc: 'Azure DevOps Personal Access Token (Build: Read & execute)' });
            }

            const actionSection = document.getElementById('action-secrets-section');
            const tbody = document.getElementById('action-secrets-tbody');
            if (actionSecrets.length > 0) {
                tbody.innerHTML = actionSecrets.map(s =>
                    '<tr><td><code>' + s.name + '</code></td><td>' + s.desc + '</td></tr>'
                ).join('');
                actionSection.classList.remove('hidden');
            } else {
                actionSection.classList.add('hidden');
            }
        }

        function copyPipeline() {
            if (!selectedPipeline) return;
            const provider = document.getElementById('llm-provider').value;
            const branchName = document.getElementById('pipeline-branch')?.value || 'main';
            const variableGroupName = document.getElementById('pipeline-vargroup')?.value || 'bctb-secrets';
            vscode.postMessage({
                type: 'copyPipeline',
                pipelineType: selectedPipeline,
                pipelineOptions: {
                    llmProvider: provider,
                    branchName: branchName,
                    variableGroupName: variableGroupName
                }
            });
        }

        function handlePipelineCopied(msg) {
            const el = document.getElementById('pipeline-result');
            el.classList.remove('hidden');
            if (msg.success && !msg.skipped) {
                el.className = 'success-box';
                el.textContent = '✅ Pipeline template copied to ' + msg.destPath;
                setTimeout(() => goToStep(7), 600);
            } else if (msg.skipped) {
                goToStep(7);
            } else {
                el.className = 'error-box';
                el.textContent = 'Failed: ' + msg.error;
            }
        }

        // ═══ Step 7: Test Run ═══
        function initTestRunStep() {
            const name = createdAgentName || document.getElementById('agent-name').value.trim();
            document.getElementById('test-agent-name').innerHTML = name
                ? 'Agent: <strong>' + escapeHtml(name) + '</strong>'
                : '<em>No agent created yet. Go back to Step 3.</em>';
            document.getElementById('btn-test-run').disabled = !name;
        }

        function runTestAgent() {
            const name = createdAgentName || document.getElementById('agent-name').value.trim();
            if (!name) return;
            document.getElementById('btn-test-run').disabled = true;
            document.getElementById('test-run-status').classList.remove('hidden');
            document.getElementById('test-run-output').classList.add('hidden');
            document.getElementById('btn-test-next').classList.add('hidden');
            vscode.postMessage({ type: 'runTestAgent', agentName: name });
        }

        function handleTestProgress(msg) {
            document.getElementById('test-run-progress').innerHTML = '<span class="spinner"></span> ' + escapeHtml(msg.message);
        }

        function handleTestResult(msg) {
            const progressEl = document.getElementById('test-run-progress');
            const outputEl = document.getElementById('test-run-output');
            const nextBtn = document.getElementById('btn-test-next');
            document.getElementById('btn-test-run').disabled = false;

            if (msg.success) {
                progressEl.innerHTML = '✅ Agent run completed successfully!';
                if (msg.stateUpdated) {
                    progressEl.innerHTML += ' State updated.';
                }
                if (msg.output) {
                    outputEl.classList.remove('hidden');
                    outputEl.textContent = msg.output;
                }
                nextBtn.classList.remove('hidden');
            } else {
                progressEl.innerHTML = '❌ Agent run failed';
                outputEl.classList.remove('hidden');
                outputEl.textContent = msg.error;
                nextBtn.classList.remove('hidden');
            }
        }

        // ═══ Step 8: Summary ═══
        function buildSummary() {
            const list = document.getElementById('final-summary');
            const items = [];

            const provider = document.getElementById('llm-provider').value;
            items.push('<li><strong>LLM Provider:</strong> ' + (provider === 'azure-openai' ? 'Azure OpenAI' : 'Anthropic') + '</li>');

            if (createdAgentName) {
                items.push('<li><strong>Agent:</strong> ' + escapeHtml(createdAgentName) + ' (agents/' + escapeHtml(createdAgentName) + '/)</li>');
            }

            const actions = [];
            if (document.getElementById('teams-url').value.trim()) actions.push('Teams Webhook');
            if (document.getElementById('smtp-host').value.trim()) actions.push('Email (SMTP)');
            if (document.getElementById('graph-tenant-id').value.trim()) actions.push('Email (Graph)');
            if (document.getElementById('webhook-url').value.trim()) actions.push('Generic Webhook');
            if (document.getElementById('pipeline-org').value.trim()) actions.push('Pipeline Trigger');
            items.push('<li><strong>Actions:</strong> ' + (actions.length ? actions.join(', ') : 'None configured') + '</li>');

            if (selectedPipeline) {
                items.push('<li><strong>Pipeline:</strong> ' + (selectedPipeline === 'github-actions' ? 'GitHub Actions' : 'Azure DevOps') + '</li>');
            }

            list.innerHTML = items.join('');
        }

        function openAgentInstruction() {
            if (createdAgentName && workspacePath) {
                const p = workspacePath + (workspacePath.includes('/') ? '/' : '\\\\') + 'agents' + (workspacePath.includes('/') ? '/' : '\\\\') + createdAgentName + (workspacePath.includes('/') ? '/' : '\\\\') + 'instruction.md';
                vscode.postMessage({ type: 'openFile', filePath: p });
            }
        }

        function openConfig() {
            if (workspacePath) {
                const sep = workspacePath.includes('/') ? '/' : '\\\\';
                vscode.postMessage({ type: 'openFile', filePath: workspacePath + sep + '.bctb-config.json' });
            }
        }

        // ═══ Utilities ═══
        function escapeHtml(str) {
            const d = document.createElement('div');
            d.textContent = str || '';
            return d.innerHTML;
        }
    </script>
</body>
</html>`;
    }
}
