import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class SetupWizardProvider {
    public static readonly viewType = 'bcTelemetryBuddy.setupWizard';
    private _panel: vscode.WebviewPanel | undefined;
    private _disposables: vscode.Disposable[] = [];

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public async show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            SetupWizardProvider.viewType,
            'BC Telemetry Buddy - Setup Wizard',
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
                    case 'validateWorkspace':
                        await this._validateWorkspace();
                        break;
                    case 'loadConfig':
                        await this._loadConfig();
                        break;
                    case 'validateAuth':
                        await this._validateAuth();
                        break;
                    case 'testConnection':
                        await this._testConnection(message.config);
                        break;
                    case 'saveConfig':
                        await this._saveConfig(message.config);
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

    private async _validateWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
        const isMultiRoot = workspaceFolders && workspaceFolders.length > 1;

        this._panel?.webview.postMessage({
            type: 'workspaceValidation',
            hasWorkspace,
            isMultiRoot,
            workspacePath: hasWorkspace ? workspaceFolders[0].uri.fsPath : null
        });
    }

    private async _loadConfig(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            console.log('No workspace folders found');
            return;
        }

        const folderUri = workspaceFolders[0].uri;

        // First try to load from .bctb-config.json file
        const configFilePath = vscode.Uri.joinPath(folderUri, '.bctb-config.json');
        let currentConfig: any = null;

        try {
            const configFileContent = await vscode.workspace.fs.readFile(configFilePath);
            const configJson = Buffer.from(configFileContent).toString('utf8');
            currentConfig = JSON.parse(configJson);
            console.log('Loaded config from .bctb-config.json:', currentConfig);
        } catch (error) {
            // File doesn't exist or is invalid, fall back to workspace settings
            console.log('.bctb-config.json not found, loading from workspace settings');
            const config = vscode.workspace.getConfiguration('bctb.mcp', folderUri);

            currentConfig = {
                "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
                "connectionName": config.get<string>('connectionName') || 'My BC Environment',
                "authFlow": config.get<string>('authFlow') || 'azure_cli',
                "tenantId": config.get<string>('tenantId') || '00000000-0000-0000-0000-000000000000',
                "applicationInsightsAppId": config.get<string>('applicationInsightsAppId') || '00000000-0000-0000-0000-000000000000',
                "kustoClusterUrl": config.get<string>('kustoClusterUrl') || 'https://ade.applicationinsights.io/subscriptions/YOUR-SUBSCRIPTION-ID',
                "cacheEnabled": config.get<boolean>('cacheEnabled') !== undefined ? config.get<boolean>('cacheEnabled') : true,
                "cacheTTLSeconds": config.get<number>('cacheTTLSeconds') || 3600,
                "removePII": config.get<boolean>('removePII') || false,
                "workspacePath": config.get<string>('workspacePath') || '${workspaceFolder}',
                "queriesFolder": config.get<string>('queriesFolder') || 'queries',
                "references": config.get<any[]>('references') || []
            };
        }

        console.log('Sending config to webview:', currentConfig);

        this._panel?.webview.postMessage({
            type: 'currentConfig',
            config: currentConfig
        });
    }

    private async _validateAuth(): Promise<void> {
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execAsync = promisify(exec);

        try {
            // Check if Azure CLI is installed
            await execAsync('az --version');

            // Check if user is logged in
            const result = await execAsync('az account show');
            const account = JSON.parse(result.stdout);

            this._panel?.webview.postMessage({
                type: 'authValidation',
                success: true,
                accountName: account.name,
                userName: account.user?.name || 'Unknown',
                tenantId: account.tenantId
            });
        } catch (error: any) {
            let errorMessage = 'Azure CLI validation failed';

            if (error.message?.includes('az: command not found') || error.message?.includes('is not recognized')) {
                errorMessage = 'Azure CLI is not installed. Please install it from: https://learn.microsoft.com/en-us/cli/azure/install-azure-cli';
            } else if (error.message?.includes('az login')) {
                errorMessage = 'Azure CLI is installed but you are not logged in. Please run: az login';
            }

            this._panel?.webview.postMessage({
                type: 'authValidation',
                success: false,
                error: errorMessage
            });
        }
    }

    private async _testConnection(config: { tenantId: string; appInsightsId: string; clusterUrl: string }): Promise<void> {
        const { promisify } = await import('util');
        const { exec } = await import('child_process');
        const execAsync = promisify(exec);

        try {
            // Get access token from Azure CLI
            const tokenResult = await execAsync('az account get-access-token --resource https://api.applicationinsights.io');
            const tokenData = JSON.parse(tokenResult.stdout);
            const accessToken = tokenData.accessToken;

            if (!accessToken) {
                throw new Error('Failed to get access token from Azure CLI');
            }

            // Execute test KQL query
            const axios = (await import('axios')).default;
            const url = `https://api.applicationinsights.io/v1/apps/${config.appInsightsId}/query`;
            const kql = 'traces | take 1';

            const response = await axios.post(
                url,
                { query: kql },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 30000
                }
            );

            this._panel?.webview.postMessage({
                type: 'connectionTest',
                success: true,
                data: response.data
            });
        } catch (error: any) {
            let errorMessage = 'Connection test failed';

            if (error.response) {
                const status = error.response.status;
                const message = error.response.data?.error?.message || error.message;

                if (status === 401 || status === 403) {
                    errorMessage = `Authentication failed: ${message}. Check your App ID and permissions.`;
                } else if (status === 400) {
                    errorMessage = `Invalid request: ${message}`;
                } else if (status === 404) {
                    errorMessage = `Application Insights App ID not found. Check your App ID.`;
                } else {
                    errorMessage = `HTTP ${status}: ${message}`;
                }
            } else if (error.message) {
                errorMessage = error.message;
            }

            this._panel?.webview.postMessage({
                type: 'connectionTest',
                success: false,
                error: errorMessage
            });
        }
    }

    private async _saveConfig(config: any): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder found');
            }

            const folderUri = workspaceFolders[0].uri;
            const configFilePath = vscode.Uri.joinPath(folderUri, '.bctb-config.json');

            // Format JSON with proper indentation
            const configJson = JSON.stringify(config, null, 2);
            const configBuffer = Buffer.from(configJson, 'utf8');

            // Write to .bctb-config.json
            await vscode.workspace.fs.writeFile(configFilePath, configBuffer);

            console.log('Saved config to .bctb-config.json:', config);

            this._panel?.webview.postMessage({
                type: 'configSaved',
                success: true,
                filePath: configFilePath.fsPath
            });
        } catch (error: any) {
            const errorMessage = error.message || String(error);
            console.error('Failed to save config:', errorMessage);
            this._panel?.webview.postMessage({
                type: 'configSaved',
                success: false,
                error: errorMessage
            });
        }
    }

    private _getHtmlForWebview(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BC Telemetry Buddy Setup</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            margin: 0;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        .logo-header {
            display: flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 20px;
            gap: 20px;
        }
        .logo-header img {
            width: 80px;
            height: 80px;
            object-fit: contain;
        }
        h1 {
            margin: 0;
            font-size: 24px;
        }
        .wizard-steps {
            display: flex;
            list-style: none;
            padding: 0;
            margin: 30px 0;
            justify-content: space-between;
        }
        .wizard-step {
            flex: 1;
            text-align: center;
            padding: 10px;
            position: relative;
            opacity: 0.5;
        }
        .wizard-step.active {
            opacity: 1;
            font-weight: bold;
        }
        .wizard-step.completed {
            opacity: 1;
            color: var(--vscode-charts-green);
        }
        .step-number {
            width: 40px;
            height: 40px;
            border-radius: 50%;
            background: var(--vscode-input-background);
            border: 2px solid var(--vscode-input-border);
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 10px;
        }
        .wizard-step.active .step-number {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .wizard-step.completed .step-number {
            background: var(--vscode-charts-green);
            color: white;
            border-color: var(--vscode-charts-green);
        }
        .step-content {
            display: none;
            margin: 30px 0;
            padding: 30px;
            background: var(--vscode-input-background);
            border-radius: 4px;
            min-height: 300px;
        }
        .step-content.active {
            display: block;
        }
        .button-group {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
            gap: 10px;
        }
        .button-group.top {
            margin-top: 0;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 1px solid var(--vscode-input-border);
        }
        button {
            padding: 10px 20px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        textarea {
            width: 100%;
            min-height: 400px;
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 13px;
            padding: 15px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 2px solid var(--vscode-input-border);
            border-radius: 4px;
            box-shadow: inset 0 1px 3px rgba(0,0,0,0.2);
            resize: vertical;
        }
        textarea:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .examples-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin: 20px 0;
        }
        .example-column {
            background: var(--vscode-editor-background);
            padding: 15px;
            border-radius: 4px;
            border: 1px solid var(--vscode-input-border);
            max-width: 100%;
            overflow-x: auto;
        }
        .example-column pre {
            font-family: 'Consolas', 'Courier New', monospace;
            font-size: 12px;
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: 3px;
            overflow-x: auto;
            margin: 10px 0 0 0;
            white-space: pre;
            max-width: 500px;
        }
        .json-comment {
            color: #6A9955;
        }
        .json-key {
            color: #9CDCFE;
        }
        .json-string {
            color: #CE9178;
        }
        .json-number {
            color: #B5CEA8;
        }
        .json-boolean {
            color: #569CD6;
        }
        .validation-status {
            display: inline-block;
            margin-left: 10px;
            padding: 5px 10px;
            border-radius: 3px;
            font-weight: bold;
        }
        .validation-status.success {
            background: var(--vscode-testing-iconPassed);
            color: white;
        }
        .validation-status.error {
            background: var(--vscode-inputValidation-errorBackground);
            color: var(--vscode-errorForeground);
        }
        .links {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 4px solid var(--vscode-textLink-foreground);
            border-radius: 4px;
        }
        .links h4 {
            margin-top: 0;
        }
        .links a {
            display: block;
            margin: 8px 0;
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
        }
        .links a:hover {
            text-decoration: underline;
        }
        .form-group {
            margin: 20px 0;
        }
        .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: bold;
        }
        .form-group input,
        .form-group select {
            width: 100%;
            padding: 8px 12px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 4px;
            font-family: var(--vscode-font-family);
            font-size: 13px;
        }
        .form-group input:focus,
        .form-group select:focus {
            outline: none;
            border-color: var(--vscode-focusBorder);
        }
        .help-text {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="logo-header">
            <img src="${this._panel!.webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'images', 'waldo.png'))}" alt="BC Telemetry Buddy Logo" />
            <h1>BC Telemetry Buddy Setup Wizard</h1>
        </div>
        
        <ul class="wizard-steps">
            <li class="wizard-step active" id="step-1-nav">
                <div class="step-number">1</div>
                <div>Welcome</div>
            </li>
            <li class="wizard-step" id="step-2-nav">
                <div class="step-number">2</div>
                <div>Configuration</div>
            </li>
            <li class="wizard-step" id="step-3-nav">
                <div class="step-number">3</div>
                <div>Authentication</div>
            </li>
            <li class="wizard-step" id="step-4-nav">
                <div class="step-number">4</div>
                <div>Test</div>
            </li>
            <li class="wizard-step" id="step-5-nav">
                <div class="step-number">5</div>
                <div>Complete</div>
            </li>
        </ul>

        <!-- Step 1: Welcome -->
        <div class="step-content active" id="step-1">
            <div class="button-group top">
                <div></div>
                <button id="btn-next-1-top">Next →</button>
            </div>

            <h2>Welcome to BC Telemetry Buddy! 👋</h2>
            <p>This setup wizard will guide you through configuring your connection to Azure Data Explorer (Kusto) and Application Insights for analyzing Business Central telemetry.</p>
            
            <div id="multirootError" style="display: none; background-color: var(--vscode-inputValidation-errorBackground); border: 1px solid var(--vscode-inputValidation-errorBorder); color: var(--vscode-errorForeground); padding: 15px; margin: 20px 0; border-radius: 4px;">
                <h3 style="margin-top: 0;">⚠️ Multi-Root Workspaces Not Supported</h3>
                <p><strong>BC Telemetry Buddy does not support multi-root workspaces.</strong></p>
                <p>You currently have multiple folders open in this workspace. Settings must be saved to a single folder's <code>.vscode/settings.json</code> file, which is not possible with multi-root workspaces.</p>
                <p><strong>To proceed:</strong></p>
                <ol>
                    <li>Close this workspace</li>
                    <li>Open a single folder (File → Open Folder)</li>
                    <li>Run the Setup Wizard again</li>
                </ol>
                <p>If you need different BC Telemetry configurations for different projects, open each project as a separate single-folder workspace.</p>
            </div>

            <div id="welcomeContent">
                <h3>What you'll need:</h3>
                <ul>
                    <li>✅ <strong>Node.js</strong> installed on your system (<a href="https://nodejs.org/" target="_blank">Download Node.js</a>)</li>
                    <li>✅ Azure subscription with access to Application Insights</li>
                    <li>✅ Application Insights resource with BC telemetry data</li>
                    <li>✅ Azure Data Explorer (Kusto) cluster URL and database</li>
                    <li>✅ Authentication credentials (Azure CLI recommended)</li>
                </ul>

                <div style="margin: 30px 0; padding: 15px; background: var(--vscode-textBlockQuote-background); border-left: 4px solid var(--vscode-textLink-foreground); border-radius: 4px;">
                    <h4 style="margin-top: 0;">📚 Helpful Resources:</h4>
                    <ul style="margin-bottom: 0;">
                        <li><a href="https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview" target="_blank">Business Central Telemetry Overview</a></li>
                        <li><a href="https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview" target="_blank">Application Insights Documentation</a></li>
                        <li><a href="https://learn.microsoft.com/en-us/azure/data-explorer/" target="_blank">Azure Data Explorer Documentation</a></li>
                    </ul>
                </div>
            </div>

            <div class="button-group">
                <div></div>
                <button id="btn-next-1">Next →</button>
            </div>
        </div>

        <!-- Step 2: Configuration -->
        <div class="step-content" id="step-2">
            <div class="button-group top">
                <button class="secondary" id="btn-prev-2-top">← Back</button>
                <button id="btn-next-2-top">Next →</button>
            </div>

            <h2>Azure Configuration</h2>
            <p>Configure your connection to Business Central telemetry using JSON format.</p>

            <div style="margin: 20px 0;">
                <h4>📖 Configuration Examples:</h4>
                <div class="examples-grid">
                    <div class="example-column">
                        <p><strong>Single Profile</strong> <em>(simple setup for one environment)</em></p>
                        <pre>{
  <span class="json-comment">// JSON schema for IntelliSense support in VS Code</span>
  <span class="json-key">"$schema"</span>: <span class="json-string">"https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json"</span>,
  
  <span class="json-comment">// Friendly name for this connection</span>
  <span class="json-key">"connectionName"</span>: <span class="json-string">"My BC Environment"</span>,
  
  <span class="json-comment">// Authentication method: azure_cli (recommended), device_code, or client_credentials</span>
  <span class="json-key">"authFlow"</span>: <span class="json-string">"azure_cli"</span>,
  
  <span class="json-comment">// Azure AD Tenant ID - Find in Azure Portal > Azure Active Directory > Overview > Tenant ID</span>
  <span class="json-key">"tenantId"</span>: <span class="json-string">"00000000-0000-0000-0000-000000000000"</span>,
  
  <span class="json-comment">// Application Insights App ID - Find in Azure Portal > Application Insights > API Access > Application ID</span>
  <span class="json-key">"applicationInsightsAppId"</span>: <span class="json-string">"00000000-0000-0000-0000-000000000000"</span>,
  
  <span class="json-comment">// Kusto cluster URL - Find in Azure Portal > Application Insights > API Access > API endpoint</span>
  <span class="json-key">"kustoClusterUrl"</span>: <span class="json-string">"https://ade.applicationinsights.io/subscriptions/YOUR-SUBSCRIPTION-ID"</span>,
  
  <span class="json-comment">// Enable local caching of query results</span>
  <span class="json-key">"cacheEnabled"</span>: <span class="json-boolean">true</span>,
  
  <span class="json-comment">// Cache time-to-live in seconds (3600 = 1 hour)</span>
  <span class="json-key">"cacheTTLSeconds"</span>: <span class="json-number">3600</span>,
  
  <span class="json-comment">// Remove personally identifiable information from results</span>
  <span class="json-key">"removePII"</span>: <span class="json-boolean">false</span>,
  
  <span class="json-comment">// Workspace path (use \$\{workspaceFolder\} for current workspace)</span>
  <span class="json-key">"workspacePath"</span>: <span class="json-string">"\${workspaceFolder}"</span>,
  
  <span class="json-comment">// Folder name for saved queries</span>
  <span class="json-key">"queriesFolder"</span>: <span class="json-string">"queries"</span>,
  
  <span class="json-comment">// External query references (leave empty initially)</span>
  <span class="json-key">"references"</span>: []
}</pre>
                    </div>
                    <div class="example-column">
                        <p><strong>Multiple Profiles</strong> <em>(for managing multiple customers/environments)</em></p>
                        <pre>{
  <span class="json-comment">// Which profile to use by default</span>
  <span class="json-key">"defaultProfile"</span>: <span class="json-string">"customer-a-prod"</span>,
  
  <span class="json-comment">// Named profiles - switch between them in Step 4</span>
  <span class="json-key">"profiles"</span>: {
    <span class="json-key">"customer-a-prod"</span>: {
      <span class="json-comment">// Friendly name for this profile</span>
      <span class="json-key">"connectionName"</span>: <span class="json-string">"Customer A Production"</span>,
      
      <span class="json-comment">// Authentication method: azure_cli (recommended), device_code, or client_credentials</span>
      <span class="json-key">"authFlow"</span>: <span class="json-string">"azure_cli"</span>,
      
      <span class="json-comment">// Azure AD Tenant ID - Azure Portal > Azure Active Directory > Overview > Tenant ID</span>
      <span class="json-key">"tenantId"</span>: <span class="json-string">"00000000-0000-0000-0000-000000000000"</span>,
      
      <span class="json-comment">// App Insights App ID - Azure Portal > Application Insights > API Access > Application ID</span>
      <span class="json-key">"applicationInsightsAppId"</span>: <span class="json-string">"00000000-0000-0000-0000-000000000000"</span>,
      
      <span class="json-comment">// Kusto URL - Azure Portal > Application Insights > API Access > API endpoint</span>
      <span class="json-key">"kustoClusterUrl"</span>: <span class="json-string">"https://ade.applicationinsights.io/subscriptions/YOUR-SUBSCRIPTION-ID"</span>,
      
      <span class="json-comment">// Enable local caching of query results</span>
      <span class="json-key">"cacheEnabled"</span>: <span class="json-boolean">true</span>,
      
      <span class="json-comment">// Cache time-to-live in seconds (3600 = 1 hour)</span>
      <span class="json-key">"cacheTTLSeconds"</span>: <span class="json-number">3600</span>,
      
      <span class="json-comment">// Remove personally identifiable information from results</span>
      <span class="json-key">"removePII"</span>: <span class="json-boolean">false</span>,
      
      <span class="json-comment">// Workspace path (use \$\{workspaceFolder\} for current workspace)</span>
      <span class="json-key">"workspacePath"</span>: <span class="json-string">"\${workspaceFolder}"</span>,
      
      <span class="json-comment">// Folder name for saved queries</span>
      <span class="json-key">"queriesFolder"</span>: <span class="json-string">"queries"</span>,
      
      <span class="json-comment">// External query references (leave empty initially)</span>
      <span class="json-key">"references"</span>: []
    },
    <span class="json-key">"customer-b-prod"</span>: {
      <span class="json-key">"connectionName"</span>: <span class="json-string">"Customer B Production"</span>,
      
      <span class="json-comment">// device_code: Browser-based authentication (no Azure CLI required)</span>
      <span class="json-key">"authFlow"</span>: <span class="json-string">"device_code"</span>,
      
      <span class="json-key">"tenantId"</span>: <span class="json-string">"11111111-1111-1111-1111-111111111111"</span>,
      <span class="json-key">"applicationInsightsAppId"</span>: <span class="json-string">"11111111-1111-1111-1111-111111111111"</span>,
      <span class="json-key">"kustoClusterUrl"</span>: <span class="json-string">"https://ade.applicationinsights.io/subscriptions/ANOTHER-SUBSCRIPTION-ID"</span>,
      
      <span class="json-comment">// For client_credentials auth: Azure Portal > App Registrations > Your App > Overview > Application ID</span>
      <span class="json-key">"clientId"</span>: <span class="json-string">"22222222-2222-2222-2222-222222222222"</span>,
      
      <span class="json-key">"cacheEnabled"</span>: <span class="json-boolean">true</span>,
      <span class="json-key">"cacheTTLSeconds"</span>: <span class="json-number">3600</span>,
      <span class="json-key">"removePII"</span>: <span class="json-boolean">false</span>,
      <span class="json-key">"workspacePath"</span>: <span class="json-string">"\${workspaceFolder}"</span>,
      <span class="json-key">"queriesFolder"</span>: <span class="json-string">"queries"</span>,
      <span class="json-key">"references"</span>: []
    }
  }
}</pre>
                    </div>
                </div>
            </div>

            <div style="margin: 20px 0;">
                <label for="configEditor" style="display: block; margin-bottom: 10px; font-weight: bold;">Configuration JSON:</label>
                <div style="margin-bottom: 8px; padding: 10px; background: var(--vscode-textBlockQuote-background); border-left: 4px solid var(--vscode-textLink-foreground); border-radius: 4px; font-size: 12px;">
                    💡 <strong>Tip:</strong> For easier editing with IntelliSense and auto-formatting, copy/paste this to a <code>.json</code> file in your workspace, edit there, then copy back.
                </div>
                <textarea id="configEditor" spellcheck="false" placeholder="Loading default configuration..."></textarea>
                <div style="margin-top: 10px;">
                    <button class="secondary" id="btn-validate-json">✓ Validate JSON</button>
                    <button class="secondary" id="btn-format-json">🎨 Format JSON</button>
                    <span id="jsonValidation" class="validation-status"></span>
                </div>
            </div>

            <div class="links">
                <h4>📚 Need Help?</h4>
                <ul style="margin: 0; padding-left: 20px;">
                    <li><a href="https://portal.azure.com" target="_blank">Open Azure Portal</a></li>
                    <li><a href="https://learn.microsoft.com/en-us/azure/azure-monitor/app/create-workspace-resource" target="_blank">Create Application Insights</a></li>
                    <li><a href="https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview" target="_blank">BC Telemetry Setup Guide</a></li>
                </ul>
            </div>

            <div class="button-group">
                <button class="secondary" id="btn-prev-2">← Back</button>
                <button id="btn-next-2">Next →</button>
            </div>
        </div>

        <!-- Step 3: Authentication -->
        <div class="step-content" id="step-3">
            <div class="button-group top">
                <button class="secondary" id="btn-prev-3-top">← Back</button>
                <button id="btn-next-3-top">Next →</button>
            </div>

            <h2>Authentication Setup</h2>
            <p>Choose how you want to authenticate with Azure.</p>

            <div class="form-group">
                <label for="authFlow">Authentication Method *</label>
                <select id="authFlow">
                    <option value="azure_cli">Azure CLI (Recommended)</option>
                    <option value="device_code">Device Code Flow</option>
                    <option value="client_credentials">Client Credentials (Service Principal)</option>
                </select>
            </div>

            <div id="azureCliInfo" class="links">
                <h4>✅ Azure CLI (Recommended)</h4>
                <p>Uses your existing Azure CLI login. Simplest and most secure option.</p>
                <ul>
                    <li>No need to manage credentials in settings</li>
                    <li>Uses your personal Azure account</li>
                    <li>Best for individual developers</li>
                </ul>
                <p><strong>Prerequisites:</strong></p>
                <ul>
                    <li>Install Azure CLI: <a href="https://learn.microsoft.com/en-us/cli/azure/install-azure-cli" target="_blank">Download here</a></li>
                    <li>Run: <code>az login</code> in terminal</li>
                </ul>
                <button id="btn-validate-auth">Validate Azure CLI</button>
                <span id="authValidation" class="validation-status"></span>
                <div id="accountDetails" style="display: none; margin-top: 15px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                    <strong>Current Account:</strong><br>
                    <span id="accountName" style="margin-left: 10px;"></span><br>
                    <strong>Username:</strong><br>
                    <span id="userName" style="margin-left: 10px;"></span><br>
                    <strong>Tenant ID:</strong><br>
                    <span id="tenantId" style="margin-left: 10px; font-family: monospace;"></span>
                </div>
            </div>

            <div id="deviceCodeInfo" class="links" style="display: none;">
                <h4>📱 Device Code Flow</h4>
                <p>Interactive authentication using a browser. Good for shared environments.</p>
                <div class="form-group">
                    <label for="deviceCodeClientId">Client ID *</label>
                    <input type="text" id="deviceCodeClientId" placeholder="Application (client) ID">
                    <div class="help-text">Register an app in Azure AD to get this ID</div>
                </div>
                <a href="https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app" target="_blank">How to register an Azure AD app</a>
            </div>

            <div id="clientCredentialsInfo" class="links" style="display: none;">
                <h4>🔐 Client Credentials (Service Principal)</h4>
                <p>Automated authentication using a service principal. Best for CI/CD or shared scenarios.</p>
                <div class="form-group">
                    <label for="spClientId">Client ID *</label>
                    <input type="text" id="spClientId" placeholder="Application (client) ID">
                </div>
                <div class="form-group">
                    <label for="clientSecret">Client Secret *</label>
                    <input type="password" id="clientSecret" placeholder="Client secret value">
                    <div class="help-text">⚠️ Note: Stored in workspace settings (consider using environment variables for production)</div>
                </div>
                <a href="https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal" target="_blank">Create a Service Principal</a>
            </div>

            <div class="button-group">
                <button class="secondary" id="btn-prev-3">← Back</button>
                <button id="btn-next-3">Next →</button>
            </div>
        </div>

        <!-- Step 4: Test Connection -->
        <div class="step-content" id="step-4">
            <div class="button-group top">
                <button class="secondary" id="btn-prev-4-top">← Back</button>
                <button id="btn-next-4-top">Next →</button>
            </div>

            <h2>Test Connection</h2>
            <p>Review your configuration and test the connection with a simple query.</p>

            <div id="profileSelectorContainer" style="display: none; margin: 20px 0;">
                <label for="profileSelector" style="display: block; margin-bottom: 10px; font-weight: bold;">Select Profile to Test:</label>
                <select id="profileSelector" style="width: 100%; padding: 8px; background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); border-radius: 4px;">
                    <!-- Options populated dynamically -->
                </select>
            </div>

            <div style="margin: 20px 0; padding: 15px; background: var(--vscode-textBlockQuote-background); border-left: 4px solid var(--vscode-textLink-foreground); border-radius: 4px;">
                <h4 style="margin-top: 0;">📋 Configuration Summary</h4>
                <div id="configSummary" style="font-family: monospace; font-size: 12px; line-height: 1.8;">
                    <div><strong>Connection Name:</strong> <span id="sum-connectionName">-</span></div>
                    <div><strong>Auth Flow:</strong> <span id="sum-authFlow">-</span></div>
                    <div><strong>Tenant ID:</strong> <span id="sum-tenantId">-</span></div>
                    <div><strong>App Insights App ID:</strong> <span id="sum-appInsightsId">-</span></div>
                    <div><strong>Cluster URL:</strong> <span id="sum-clusterUrl" style="word-break: break-all;">-</span></div>
                    <div><strong>Cache Enabled:</strong> <span id="sum-cacheEnabled">-</span></div>
                </div>
            </div>

            <div style="margin: 20px 0; padding: 15px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                <h4 style="margin-top: 0;">🔍 Test Query</h4>
                <p>This will execute: <code style="background: var(--vscode-editor-background); padding: 2px 6px; border-radius: 3px;">traces | take 1</code></p>
                <p style="font-size: 12px; color: var(--vscode-descriptionForeground); margin-top: 10px;">The test verifies authentication and confirms your Application Insights instance is accessible and contains data.</p>
            </div>

            <button id="btn-test-connection">🔍 Test Connection</button>
            <span id="testStatus" class="validation-status"></span>

            <div id="testResults" style="display: none; margin-top: 15px; padding: 10px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                <strong>Test Results:</strong><br>
                <pre id="testResultsContent" style="margin-top: 10px; padding: 10px; background: var(--vscode-editor-background); border-radius: 4px; overflow-x: auto; max-height: 300px; overflow-y: auto;"></pre>
            </div>

            <div class="button-group">
                <button class="secondary" id="btn-prev-4">← Back</button>
                <button id="btn-next-4">Next →</button>
            </div>
        </div>

        <!-- Step 5: Complete -->
        <div class="step-content" id="step-5">
            <div class="button-group top">
                <button class="secondary" id="btn-prev-5-top">← Back</button>
                <div></div>
            </div>

            <h2>Save Configuration</h2>
            <p>Review your configuration and save it to start using BC Telemetry Buddy.</p>

            <div style="margin: 20px 0; padding: 15px; background: var(--vscode-editor-inactiveSelectionBackground); border-radius: 4px;">
                <h4 style="margin-top: 0;">📋 Configuration Summary</h4>
                <div style="line-height: 2;">
                    <div><strong>Connection Name:</strong> <span id="final-connectionName">-</span></div>
                    <div><strong>Auth Flow:</strong> <span id="final-authFlow">-</span></div>
                    <div><strong>Tenant ID:</strong> <span id="final-tenantId" style="font-family: monospace; font-size: 12px;">-</span></div>
                    <div><strong>Application Insights ID:</strong> <span id="final-appInsightsId" style="font-family: monospace; font-size: 12px;">-</span></div>
                    <div><strong>Cluster URL:</strong> <span id="final-clusterUrl" style="word-break: break-all;">-</span></div>
                    <div><strong>Cache Enabled:</strong> <span id="final-cacheEnabled">-</span></div>
                </div>
            </div>

            <div id="saveStatusContainer" style="display: none; margin: 20px 0; padding: 15px; border-radius: 4px;">
                <div id="saveStatusContent"></div>
            </div>

            <div class="button-group">
                <button class="secondary" id="btn-prev-5">← Back</button>
                <button id="btn-save-config">💾 Save Configuration</button>
            </div>

            <div class="button-group" id="finishButtonGroup" style="display: none; justify-content: flex-end;">
                <button id="btn-finish">Finish ✓</button>
            </div>
        </div>
    </div>

    <script>
        (function() {
            const vscode = acquireVsCodeApi();
            let currentStep = 1;
            const totalSteps = 5;

            // Request workspace validation on load
            window.addEventListener('load', function() {
                vscode.postMessage({ type: 'validateWorkspace' });
                vscode.postMessage({ type: 'loadConfig' });
                updateAuthFields();
            });

            // Handle messages from extension
            window.addEventListener('message', function(event) {
                const message = event.data;
                switch (message.type) {
                    case 'workspaceValidation':
                        handleWorkspaceValidation(message);
                        break;
                    case 'currentConfig':
                        populateCurrentConfig(message.config);
                        break;
                    case 'authValidation':
                        showAuthValidation(message);
                        break;
                    case 'connectionTest':
                        showConnectionTest(message);
                        break;
                    case 'configSaved':
                        handleConfigSaved(message);
                        break;
                }
            });

            function handleWorkspaceValidation(message) {
                const isMultiRoot = message.isMultiRoot || false;
                const errorDiv = document.getElementById('multirootError');
                const welcomeContent = document.getElementById('welcomeContent');
                const nextButton = document.getElementById('btn-next-1');

                if (isMultiRoot) {
                    if (errorDiv) errorDiv.style.display = 'block';
                    if (welcomeContent) welcomeContent.style.display = 'none';
                    if (nextButton) nextButton.disabled = true;
                } else {
                    if (errorDiv) errorDiv.style.display = 'none';
                    if (welcomeContent) welcomeContent.style.display = 'block';
                    if (nextButton) nextButton.disabled = false;
                }
            }

            function showStep(stepNumber) {
                console.log('showStep called:', stepNumber);
                
                // Hide all steps
                for (let i = 1; i <= totalSteps; i++) {
                    const content = document.getElementById('step-' + i);
                    const nav = document.getElementById('step-' + i + '-nav');
                    
                    if (content) {
                        content.classList.remove('active');
                    }
                    if (nav) {
                        nav.classList.remove('active');
                        if (i < stepNumber) {
                            nav.classList.add('completed');
                        } else {
                            nav.classList.remove('completed');
                        }
                    }
                }

                // Show current step
                const currentContent = document.getElementById('step-' + stepNumber);
                const currentNav = document.getElementById('step-' + stepNumber + '-nav');
                
                if (currentContent) {
                    currentContent.classList.add('active');
                }
                if (currentNav) {
                    currentNav.classList.add('active');
                }

                // Populate config summary when showing step 4
                if (stepNumber === 4) {
                    populateProfileSelector();
                    populateConfigSummary();
                }

                // Populate final summary when showing step 5
                if (stepNumber === 5) {
                    populateFinalSummary();
                }

                currentStep = stepNumber;
            }

            function goNext() {
                console.log('goNext called, currentStep:', currentStep);
                if (currentStep < totalSteps) {
                    showStep(currentStep + 1);
                }
            }

            function goPrev() {
                console.log('goPrev called, currentStep:', currentStep);
                if (currentStep > 1) {
                    showStep(currentStep - 1);
                }
            }

            function finish() {
                vscode.postMessage({ type: 'closeWizard' });
            }

            function updateAuthFields() {
                const authFlow = document.getElementById('authFlow').value;
                const azureCliDiv = document.getElementById('azureCliInfo');
                const deviceCodeDiv = document.getElementById('deviceCodeInfo');
                const clientCredsDiv = document.getElementById('clientCredentialsInfo');

                // Show only the selected auth method
                azureCliDiv.style.display = authFlow === 'azure_cli' ? 'block' : 'none';
                deviceCodeDiv.style.display = authFlow === 'device_code' ? 'block' : 'none';
                clientCredsDiv.style.display = authFlow === 'client_credentials' ? 'block' : 'none';
            }

            function validateAuth() {
                const authValidation = document.getElementById('authValidation');
                authValidation.className = 'validation-status';
                authValidation.textContent = '⏳ Validating Azure CLI...';
                vscode.postMessage({ type: 'validateAuth' });
            }

            function showAuthValidation(message) {
                const authValidation = document.getElementById('authValidation');
                const accountDetails = document.getElementById('accountDetails');
                const accountName = document.getElementById('accountName');
                const userName = document.getElementById('userName');
                const tenantId = document.getElementById('tenantId');
                
                if (message.success) {
                    authValidation.className = 'validation-status success';
                    authValidation.textContent = '\u2713 Azure CLI is configured correctly';
                    
                    // Show account details
                    if (accountDetails && accountName && userName && tenantId) {
                        accountName.textContent = message.accountName || 'Unknown';
                        userName.textContent = message.userName || 'Unknown';
                        tenantId.textContent = message.tenantId || 'Unknown';
                        accountDetails.style.display = 'block';
                    }
                } else {
                    authValidation.className = 'validation-status error';
                    authValidation.textContent = '\u2717 ' + (message.error || 'Azure CLI validation failed');
                    
                    // Hide account details on error
                    if (accountDetails) {
                        accountDetails.style.display = 'none';
                    }
                }
            }

            function populateProfileSelector() {
                const configEditor = document.getElementById('configEditor');
                const profileSelectorContainer = document.getElementById('profileSelectorContainer');
                const profileSelector = document.getElementById('profileSelector');
                
                let config;
                try {
                    config = JSON.parse(configEditor.value);
                } catch (error) {
                    // Invalid JSON - hide profile selector
                    console.log('populateProfileSelector: Invalid JSON, hiding selector');
                    profileSelectorContainer.style.display = 'none';
                    return;
                }
                
                console.log('populateProfileSelector: Config parsed', config);
                
                let profileNames = [];
                
                // Handle both array and object formats for profiles
                if (config.profiles) {
                    if (Array.isArray(config.profiles)) {
                        // Array format: [{ name: "X", ... }, { name: "Y", ... }]
                        profileNames = config.profiles.map(p => p.name);
                    } else if (typeof config.profiles === 'object') {
                        // Object format: { "X": { ... }, "Y": { ... } }
                        profileNames = Object.keys(config.profiles);
                    }
                }
                
                console.log('populateProfileSelector: Found profile names:', profileNames);
                
                // Show selector if multiple profiles exist
                if (profileNames.length >= 2) {
                    console.log('populateProfileSelector: Found', profileNames.length, 'profiles, showing selector');
                    profileSelectorContainer.style.display = 'block';
                    
                    // Populate dropdown
                    profileSelector.innerHTML = '';
                    profileNames.forEach(profileName => {
                        const option = document.createElement('option');
                        option.value = profileName;
                        option.textContent = profileName;
                        profileSelector.appendChild(option);
                        console.log('populateProfileSelector: Added profile option:', profileName);
                    });
                    
                    // Select default profile if specified
                    if (config.defaultProfile && profileNames.includes(config.defaultProfile)) {
                        profileSelector.value = config.defaultProfile;
                        console.log('populateProfileSelector: Set default profile to:', config.defaultProfile);
                    }
                    
                    // Add change event to update config summary
                    profileSelector.onchange = () => populateConfigSummary();
                } else {
                    // Hide profile selector for single profile
                    console.log('populateProfileSelector: Single profile or no profiles, hiding selector');
                    profileSelectorContainer.style.display = 'none';
                }
            }
            
            function formatJSON() {
                const configEditor = document.getElementById('configEditor');
                const jsonValidation = document.getElementById('jsonValidation');
                
                try {
                    const config = JSON.parse(configEditor.value);
                    configEditor.value = JSON.stringify(config, null, 2);
                    jsonValidation.className = 'validation-status success';
                    jsonValidation.textContent = '\u2713 JSON formatted successfully';
                } catch (error) {
                    jsonValidation.className = 'validation-status error';
                    jsonValidation.textContent = '\u2717 Invalid JSON: ' + error.message;
                }
            }

            function populateConfigSummary() {
                try {
                    const configEditor = document.getElementById('configEditor');
                    const fullConfig = JSON.parse(configEditor.value);
                    
                    // Handle multi-profile scenario
                    let config;
                    if (fullConfig.profiles) {
                        if (Array.isArray(fullConfig.profiles)) {
                            // Array format: [{ name: "X", ... }]
                            const profileSelector = document.getElementById('profileSelector');
                            const selectedProfileName = profileSelector ? profileSelector.value : fullConfig.profiles[0].name;
                            config = fullConfig.profiles.find(p => p.name === selectedProfileName) || fullConfig.profiles[0];
                        } else if (typeof fullConfig.profiles === 'object') {
                            // Object format: { "X": { ... } }
                            const profileSelector = document.getElementById('profileSelector');
                            const selectedProfileName = profileSelector ? profileSelector.value : fullConfig.defaultProfile || Object.keys(fullConfig.profiles)[0];
                            config = fullConfig.profiles[selectedProfileName] || fullConfig.profiles[Object.keys(fullConfig.profiles)[0]];
                        } else {
                            config = fullConfig;
                        }
                    } else {
                        // Single profile (legacy format)
                        config = fullConfig;
                    }
                    
                    document.getElementById('sum-connectionName').textContent = config.connectionName || config.name || '-';
                    document.getElementById('sum-authFlow').textContent = config.authFlow || '-';
                    document.getElementById('sum-tenantId').textContent = config.tenantId || '-';
                    document.getElementById('sum-appInsightsId').textContent = config.applicationInsightsAppId || '-';
                    document.getElementById('sum-clusterUrl').textContent = config.kustoClusterUrl || '-';
                    document.getElementById('sum-cacheEnabled').textContent = config.cacheEnabled ? 'Yes' : 'No';
                } catch (error) {
                    console.error('Failed to parse config:', error);
                }
            }

            function testConnection() {
                const testStatus = document.getElementById('testStatus');
                const testResults = document.getElementById('testResults');
                
                // Read config from Step 2 editor
                const configEditor = document.getElementById('configEditor');
                let fullConfig;
                
                try {
                    fullConfig = JSON.parse(configEditor.value);
                } catch (error) {
                    testStatus.className = 'validation-status error';
                    testStatus.textContent = '\u2717 Invalid JSON configuration. Please fix Step 2.';
                    testResults.style.display = 'none';
                    return;
                }
                
                // Handle multi-profile scenario
                let profileToTest;
                if (fullConfig.profiles) {
                    if (Array.isArray(fullConfig.profiles)) {
                        // Array format: [{ name: "X", ... }]
                        const profileSelector = document.getElementById('profileSelector');
                        const selectedProfileName = profileSelector.value;
                        profileToTest = fullConfig.profiles.find(p => p.name === selectedProfileName);
                        
                        if (!profileToTest) {
                            testStatus.className = 'validation-status error';
                            testStatus.textContent = '\u2717 Selected profile not found';
                            testResults.style.display = 'none';
                            return;
                        }
                    } else if (typeof fullConfig.profiles === 'object') {
                        // Object format: { "X": { ... } }
                        const profileSelector = document.getElementById('profileSelector');
                        const selectedProfileName = profileSelector ? profileSelector.value : fullConfig.defaultProfile || Object.keys(fullConfig.profiles)[0];
                        profileToTest = fullConfig.profiles[selectedProfileName];
                        
                        if (!profileToTest) {
                            testStatus.className = 'validation-status error';
                            testStatus.textContent = '\u2717 Selected profile not found';
                            testResults.style.display = 'none';
                            return;
                        }
                    } else {
                        profileToTest = fullConfig;
                    }
                } else {
                    // Single profile (legacy format)
                    profileToTest = fullConfig;
                }
                
                if (!profileToTest.tenantId || !profileToTest.applicationInsightsAppId) {
                    testStatus.className = 'validation-status error';
                    testStatus.textContent = '\u2717 Missing required fields: tenantId and applicationInsightsAppId';
                    testResults.style.display = 'none';
                    return;
                }
                
                testStatus.className = 'validation-status';
                testStatus.textContent = '\u23f3 Testing connection...';
                testResults.style.display = 'none';
                
                vscode.postMessage({ 
                    type: 'testConnection', 
                    config: {
                        tenantId: profileToTest.tenantId,
                        appInsightsId: profileToTest.applicationInsightsAppId,
                        clusterUrl: profileToTest.kustoClusterUrl || ''
                    }
                });
            }

            function showConnectionTest(message) {
                const testStatus = document.getElementById('testStatus');
                const testResults = document.getElementById('testResults');
                const testResultsContent = document.getElementById('testResultsContent');
                
                if (message.success) {
                    testStatus.className = 'validation-status success';
                    testStatus.textContent = '\u2713 Connection successful! Query returned results.';
                    
                    if (testResults && testResultsContent) {
                        testResultsContent.textContent = JSON.stringify(message.data, null, 2);
                        testResults.style.display = 'block';
                    }
                } else {
                    testStatus.className = 'validation-status error';
                    testStatus.textContent = '\u2717 Connection failed: ' + (message.error || 'Unknown error');
                    testResults.style.display = 'none';
                }
            }

            function populateCurrentConfig(config) {
                const configEditor = document.getElementById('configEditor');
                console.log('populateCurrentConfig called', { config, editorExists: !!configEditor });
                if (configEditor && config) {
                    configEditor.value = JSON.stringify(config, null, 2);
                    console.log('Config populated in editor');
                }
            }

            function validateConfigJson() {
                const configEditor = document.getElementById('configEditor');
                const validationSpan = document.getElementById('jsonValidation');
                const configJson = configEditor.value.trim();

                try {
                    JSON.parse(configJson);
                    validationSpan.className = 'validation-status success';
                    validationSpan.textContent = '✓ JSON is valid';
                } catch (error) {
                    validationSpan.className = 'validation-status error';
                    validationSpan.textContent = '✗ Invalid JSON: ' + error.message;
                }
            }

            function populateFinalSummary() {
                const editor = document.getElementById('configEditor');
                if (!editor) return;

                try {
                    const config = JSON.parse(editor.value);
                    document.getElementById('final-connectionName').textContent = config.connectionName || '-';
                    document.getElementById('final-authFlow').textContent = config.authFlow || '-';
                    document.getElementById('final-tenantId').textContent = config.tenantId || '-';
                    document.getElementById('final-appInsightsId').textContent = config.applicationInsightsAppId || '-';
                    document.getElementById('final-clusterUrl').textContent = config.kustoClusterUrl || '-';
                    document.getElementById('final-cacheEnabled').textContent = config.cacheEnabled ? 'Yes' : 'No';

                    // Reset save status when entering Step 5
                    const saveStatusContainer = document.getElementById('saveStatusContainer');
                    const finishButtonGroup = document.getElementById('finishButtonGroup');
                    const saveButton = document.getElementById('btn-save-config');
                    if (saveStatusContainer) saveStatusContainer.style.display = 'none';
                    if (finishButtonGroup) finishButtonGroup.style.display = 'none';
                    if (saveButton) saveButton.style.display = 'inline-block';
                } catch (error) {
                    console.error('Failed to parse config for final summary:', error);
                }
            }

            function saveConfiguration() {
                const editor = document.getElementById('configEditor');
                if (!editor) return;

                try {
                    const config = JSON.parse(editor.value);
                    vscode.postMessage({ type: 'saveConfig', config: config });
                } catch (error) {
                    const saveStatusContainer = document.getElementById('saveStatusContainer');
                    const saveStatusContent = document.getElementById('saveStatusContent');
                    if (saveStatusContainer && saveStatusContent) {
                        saveStatusContainer.style.display = 'block';
                        saveStatusContainer.style.background = 'var(--vscode-inputValidation-errorBackground)';
                        saveStatusContainer.style.border = '1px solid var(--vscode-inputValidation-errorBorder)';
                        saveStatusContent.innerHTML = '<strong>❌ Error:</strong> Invalid JSON configuration. Please go back and fix the configuration.';
                    }
                }
            }

            function handleConfigSaved(message) {
                const saveStatusContainer = document.getElementById('saveStatusContainer');
                const saveStatusContent = document.getElementById('saveStatusContent');
                const saveButton = document.getElementById('btn-save-config');
                const finishButtonGroup = document.getElementById('finishButtonGroup');

                if (!saveStatusContainer || !saveStatusContent) return;

                saveStatusContainer.style.display = 'block';

                if (message.success) {
                    saveStatusContainer.style.background = 'var(--vscode-inputValidation-infoBackground)';
                    saveStatusContainer.style.border = '1px solid var(--vscode-inputValidation-infoBorder)';
                    saveStatusContent.innerHTML = '<strong>✅ Configuration Saved!</strong><br>' +
                        '<div style="margin-top: 10px; font-size: 12px;">File: <code>' + message.filePath + '</code></div>' +
                        '<p style="margin-top: 15px;">Your BC Telemetry Buddy is now configured and ready to use!</p>';
                    
                    // Hide save button, show finish button
                    if (saveButton) saveButton.style.display = 'none';
                    if (finishButtonGroup) finishButtonGroup.style.display = 'flex';
                } else {
                    saveStatusContainer.style.background = 'var(--vscode-inputValidation-errorBackground)';
                    saveStatusContainer.style.border = '1px solid var(--vscode-inputValidation-errorBorder)';
                    saveStatusContent.innerHTML = '<strong>❌ Failed to Save Configuration</strong><br>' +
                        '<div style="margin-top: 10px; color: var(--vscode-errorForeground);">' + message.error + '</div>';
                }
            }

            // Set up event listeners
            // Step 1 - bottom and top buttons
            document.getElementById('btn-next-1').addEventListener('click', goNext);
            document.getElementById('btn-next-1-top').addEventListener('click', goNext);
            
            // Step 2 - bottom and top buttons
            document.getElementById('btn-prev-2').addEventListener('click', goPrev);
            document.getElementById('btn-next-2').addEventListener('click', goNext);
            document.getElementById('btn-prev-2-top').addEventListener('click', goPrev);
            document.getElementById('btn-next-2-top').addEventListener('click', goNext);
            document.getElementById('btn-validate-json').addEventListener('click', validateConfigJson);
            document.getElementById('btn-format-json').addEventListener('click', formatJSON);
            
            // Step 3 - bottom and top buttons
            document.getElementById('btn-prev-3').addEventListener('click', goPrev);
            document.getElementById('btn-next-3').addEventListener('click', goNext);
            document.getElementById('btn-prev-3-top').addEventListener('click', goPrev);
            document.getElementById('btn-next-3-top').addEventListener('click', goNext);
            document.getElementById('authFlow').addEventListener('change', updateAuthFields);
            document.getElementById('btn-validate-auth').addEventListener('click', validateAuth);
            
            // Step 4 - bottom and top buttons
            document.getElementById('btn-prev-4').addEventListener('click', goPrev);
            document.getElementById('btn-next-4').addEventListener('click', goNext);
            document.getElementById('btn-prev-4-top').addEventListener('click', goPrev);
            document.getElementById('btn-next-4-top').addEventListener('click', goNext);
            document.getElementById('btn-test-connection').addEventListener('click', testConnection);
            
            // Step 5 - bottom and top buttons
            document.getElementById('btn-prev-5').addEventListener('click', goPrev);
            document.getElementById('btn-prev-5-top').addEventListener('click', goPrev);
            document.getElementById('btn-save-config').addEventListener('click', saveConfiguration);
            document.getElementById('btn-finish').addEventListener('click', finish);

            console.log('Wizard initialized, currentStep:', currentStep);
        })();
    </script>
</body>
</html>`;
    }
}
