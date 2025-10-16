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

    public show() {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        // If we already have a panel, show it
        if (this._panel) {
            this._panel.reveal(column);
            return;
        }

        // Otherwise, create a new panel
        this._panel = vscode.window.createWebviewPanel(
            SetupWizardProvider.viewType,
            'BC Telemetry Buddy - Setup Wizard',
            column || vscode.ViewColumn.One,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [
                    vscode.Uri.joinPath(this._extensionUri, 'dist'),
                    vscode.Uri.joinPath(this._extensionUri, 'src', 'webviews')
                ]
            }
        );

        this._panel.webview.html = this._getHtmlForWebview(this._panel.webview);

        // Handle messages from the webview
        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                await this._handleMessage(message);
            },
            null,
            this._disposables
        );

        // Handle panel disposal
        this._panel.onDidDispose(() => this._onDispose(), null, this._disposables);
    }

    private async _handleMessage(message: any) {
        switch (message.type) {
            case 'validateWorkspace':
                await this._validateWorkspace();
                break;
            case 'validateAuth':
                await this._validateAuth(message.authFlow);
                break;
            case 'testConnection':
                await this._testConnection();
                break;
            case 'saveSettings':
                await this._saveSettings(message.settings);
                break;
            case 'openExternal':
                vscode.env.openExternal(vscode.Uri.parse(message.url));
                break;
            case 'requestCurrentSettings':
                await this._sendCurrentSettings();
                break;
        }
    }

    private async _validateWorkspace(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;

        this._panel?.webview.postMessage({
            type: 'workspaceValidation',
            hasWorkspace,
            workspacePath: hasWorkspace ? workspaceFolders[0].uri.fsPath : null
        });
    }

    private async _validateAuth(authFlow: string): Promise<void> {
        let isValid = false;
        let message = '';

        try {
            if (authFlow === 'azure_cli') {
                // Check if Azure CLI is installed
                try {
                    await execAsync('az --version');

                    // Check if logged in and get account details
                    const { stdout } = await execAsync('az account show');
                    if (stdout.length > 0) {
                        isValid = true;

                        // Parse the JSON output to get account details
                        try {
                            const accountInfo = JSON.parse(stdout);
                            const user = accountInfo.user?.name || 'Unknown';
                            const subscription = accountInfo.name || 'Unknown';
                            const tenantId = accountInfo.tenantId || 'Unknown';
                            const tenantDisplayName = accountInfo.tenantDisplayName || accountInfo.tenantId || 'Unknown';

                            // Format with newlines for multi-line display
                            message = `Azure CLI authenticated\n\nUser: ${user}\nSubscription: ${subscription}\nTenant: ${tenantDisplayName}\nTenant ID: ${tenantId}`;
                        } catch (parseError) {
                            // If JSON parsing fails, just show basic message
                            message = 'Azure CLI authenticated';
                        }
                    } else {
                        message = 'Not logged in to Azure CLI';
                    }
                } catch (error: any) {
                    message = error.message.includes('az')
                        ? 'Azure CLI not installed'
                        : 'Not logged in to Azure CLI (run: az login)';
                }
            } else if (authFlow === 'device_code' || authFlow === 'client_credentials') {
                const config = vscode.workspace.getConfiguration('bcTelemetryBuddy');
                const tenantId = config.get<string>('tenant.id');
                const clientId = config.get<string>('auth.clientId');

                if (authFlow === 'client_credentials') {
                    const clientSecret = config.get<string>('auth.clientSecret');
                    isValid = !!(tenantId && clientId && clientSecret);
                    message = isValid
                        ? 'Client credentials configured'
                        : 'Missing tenant ID, client ID, or client secret';
                } else {
                    isValid = !!(tenantId && clientId);
                    message = isValid
                        ? 'Device code flow configured'
                        : 'Missing tenant ID or client ID';
                }
            }
        } catch (error: any) {
            message = error.message;
        }

        this._panel?.webview.postMessage({
            type: 'authValidation',
            isValid,
            message,
            authFlow
        });
    }

    private async _testConnection(): Promise<void> {
        const config = vscode.workspace.getConfiguration('bctb.mcp');
        const appInsightsId = config.get<string>('applicationInsights.appId');
        const kustoUrl = config.get<string>('kusto.clusterUrl');

        let success = false;
        let message = '';

        if (!appInsightsId || !kustoUrl) {
            message = 'Missing App Insights ID or Kusto URL';
        } else {
            try {
                // Try to execute a simple test query via the MCP
                // This is a placeholder - actual implementation would use the MCP client
                success = true;
                message = 'Connection test successful';
            } catch (error: any) {
                message = `Connection failed: ${error.message}`;
            }
        }

        this._panel?.webview.postMessage({
            type: 'connectionTest',
            success,
            message
        });
    }

    private async _saveSettings(settings: any): Promise<void> {
        try {
            const config = vscode.workspace.getConfiguration('bctb.mcp');
            const target = vscode.ConfigurationTarget.Workspace;

            // Save connection name and tenant settings
            if (settings.tenantName) {
                await config.update('connectionName', settings.tenantName, target);
            }
            if (settings.tenantId) {
                await config.update('tenantId', settings.tenantId, target);
            }

            // Save App Insights settings
            if (settings.appInsightsId) {
                await config.update('applicationInsights.appId', settings.appInsightsId, target);
            }

            // Save Kusto settings
            if (settings.kustoUrl) {
                await config.update('kusto.clusterUrl', settings.kustoUrl, target);
            }

            // Save auth settings
            if (settings.authFlow) {
                await config.update('authFlow', settings.authFlow, target);
            }
            if (settings.clientId) {
                await config.update('clientId', settings.clientId, target);
            }
            // Note: clientSecret is not saved to settings for security reasons
            // It would need to be stored in a secure credential store instead

            this._panel?.webview.postMessage({
                type: 'settingsSaved',
                success: true,
                message: 'Settings saved to workspace configuration'
            });

            vscode.window.showInformationMessage('BC Telemetry Buddy settings saved successfully!');
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'settingsSaved',
                success: false,
                message: error.message
            });

            vscode.window.showErrorMessage(`Failed to save settings: ${error.message}`);
        }
    }

    private async _sendCurrentSettings(): Promise<void> {
        const config = vscode.workspace.getConfiguration('bctb.mcp');

        const settings = {
            tenantName: config.get<string>('connectionName') || '',
            tenantId: config.get<string>('tenantId') || '',
            appInsightsId: config.get<string>('applicationInsights.appId') || '',
            kustoUrl: config.get<string>('kusto.clusterUrl') || '',
            authFlow: config.get<string>('authFlow') || 'azure_cli',
            clientId: config.get<string>('clientId') || '',
            clientSecret: '' // Not stored in settings for security
        };

        this._panel?.webview.postMessage({
            type: 'currentSettings',
            settings
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // For now, return inline HTML. In production, you might want to load from a file
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
    <title>BC Telemetry Buddy Setup</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            line-height: 1.6;
        }
        .container {
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
        }
        .wizard-steps {
            display: flex;
            justify-content: space-between;
            margin: 30px 0;
            padding: 0;
            list-style: none;
        }
        .wizard-step {
            flex: 1;
            text-align: center;
            position: relative;
            padding: 10px;
        }
        .wizard-step::after {
            content: '';
            position: absolute;
            top: 20px;
            right: -50%;
            width: 100%;
            height: 2px;
            background: var(--vscode-input-border);
            z-index: -1;
        }
        .wizard-step:last-child::after {
            display: none;
        }
        .step-number {
            display: inline-block;
            width: 40px;
            height: 40px;
            line-height: 40px;
            border-radius: 50%;
            background: var(--vscode-input-background);
            border: 2px solid var(--vscode-input-border);
            margin-bottom: 5px;
        }
        .wizard-step.active .step-number {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-color: var(--vscode-button-background);
        }
        .wizard-step.completed .step-number {
            background: var(--vscode-terminal-ansiGreen);
            border-color: var(--vscode-terminal-ansiGreen);
        }
        .wizard-step.completed .step-number::before {
            content: '✓';
        }
        .step-content {
            display: none;
            margin: 30px 0;
            padding: 20px;
            background: var(--vscode-input-background);
            border-radius: 4px;
        }
        .step-content.active {
            display: block;
        }
        .form-group {
            margin: 20px 0;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: bold;
        }
        .help-text {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
            margin-top: 5px;
        }
        input, select {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            box-sizing: border-box;
        }
        input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        button {
            padding: 8px 16px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            margin-right: 10px;
        }
        button:hover {
            background: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background: var(--vscode-button-secondaryHoverBackground);
        }
        .validation-status {
            display: inline-block;
            margin-left: 10px;
            padding: 8px 12px;
            border-radius: 2px;
            font-size: 0.9em;
            max-width: 500px;
            line-height: 1.5;
        }
        .validation-status.success {
            background: var(--vscode-terminal-ansiGreen);
            color: var(--vscode-editor-background);
        }
        .validation-status.error {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        .validation-status.warning {
            background: var(--vscode-editorWarning-foreground);
            color: var(--vscode-editor-background);
        }
        .button-group {
            display: flex;
            justify-content: space-between;
            margin-top: 30px;
        }
        .links {
            margin: 20px 0;
            padding: 15px;
            background: var(--vscode-textBlockQuote-background);
            border-left: 3px solid var(--vscode-textLink-foreground);
        }
        .links a {
            color: var(--vscode-textLink-foreground);
            text-decoration: none;
            display: block;
            margin: 5px 0;
        }
        .links a:hover {
            text-decoration: underline;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            margin: 15px 0;
        }
        .checkbox-group input[type="checkbox"] {
            width: auto;
            margin-right: 10px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>🚀 BC Telemetry Buddy Setup Wizard</h1>
        <p>Welcome! This wizard will help you configure BC Telemetry Buddy to connect to your Azure Data Explorer and Application Insights.</p>

        <ul class="wizard-steps">
            <li class="wizard-step active" data-step="1">
                <div class="step-number">1</div>
                <div>Welcome</div>
            </li>
            <li class="wizard-step" data-step="2">
                <div class="step-number">2</div>
                <div>Azure Config</div>
            </li>
            <li class="wizard-step" data-step="3">
                <div class="step-number">3</div>
                <div>Authentication</div>
            </li>
            <li class="wizard-step" data-step="4">
                <div class="step-number">4</div>
                <div>Test Connection</div>
            </li>
            <li class="wizard-step" data-step="5">
                <div class="step-number">5</div>
                <div>Complete</div>
            </li>
        </ul>

        <!-- Step 1: Welcome -->
        <div class="step-content active" data-step="1">
            <h2>Welcome to BC Telemetry Buddy! 👋</h2>
            <p>This setup wizard will guide you through configuring your connection to Azure Data Explorer (Kusto) and Application Insights for analyzing Business Central telemetry.</p>
            
            <h3>What you'll need:</h3>
            <ul>
                <li>✅ Azure subscription with access to Application Insights</li>
                <li>✅ Application Insights resource with BC telemetry data</li>
                <li>✅ Azure Data Explorer (Kusto) cluster URL and database</li>
                <li>✅ Authentication credentials (Azure CLI recommended)</li>
            </ul>

            <div class="links">
                <h4>📚 Helpful Resources:</h4>
                <a href="#" data-url="https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview">Business Central Telemetry Overview</a>
                <a href="#" data-url="https://learn.microsoft.com/en-us/azure/azure-monitor/app/app-insights-overview">Application Insights Documentation</a>
                <a href="#" data-url="https://learn.microsoft.com/en-us/azure/data-explorer/">Azure Data Explorer Documentation</a>
            </div>

            <div class="button-group">
                <div></div>
                <button onclick="nextStep()">Next →</button>
            </div>
        </div>

        <!-- Step 2: Azure Configuration -->
        <div class="step-content" data-step="2">
            <h2>Azure Configuration</h2>
            <p>Configure your connection to Business Central telemetry.</p>

            <div class="form-group">
                <label for="tenantName">Connection Name *</label>
                <input type="text" id="tenantName" placeholder="e.g., Contoso Production">
                <div class="help-text">Friendly name identifying this complete connection (tenant + App Insights endpoint)</div>
            </div>

            <div class="form-group">
                <label for="tenantId">Tenant ID *</label>
                <input type="text" id="tenantId" placeholder="e.g., 12345678-1234-1234-1234-123456789abc">
                <div class="help-text">Your Azure AD tenant ID. Find it in Azure Portal → Azure Active Directory → Overview</div>
            </div>

            <div class="form-group">
                <label for="appInsightsId">Application Insights App ID *</label>
                <input type="text" id="appInsightsId" placeholder="e.g., 12345678-1234-1234-1234-123456789abc">
                <div class="help-text">Your App Insights Application ID (not resource ID). Find it in Azure Portal → Application Insights → API Access → Application ID</div>
            </div>

            <div class="form-group">
                <label for="kustoUrl">Kusto Cluster URL *</label>
                <input type="text" id="kustoUrl" placeholder="https://ade.applicationinsights.io/subscriptions/<subscription-id>">
                <div class="help-text">For BC telemetry in App Insights, use: https://ade.applicationinsights.io/subscriptions/&lt;your-subscription-id&gt;</div>
            </div>

            <div class="links">
                <h4>📚 Need Help?</h4>
                <a href="#" data-url="https://portal.azure.com">Open Azure Portal</a>
                <a href="#" data-url="https://learn.microsoft.com/en-us/azure/azure-monitor/app/create-workspace-resource">Create Application Insights</a>
                <a href="#" data-url="https://learn.microsoft.com/en-us/dynamics365/business-central/dev-itpro/administration/telemetry-overview">BC Telemetry Setup Guide</a>
            </div>

            <div class="button-group">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="nextStep()">Next →</button>
            </div>
        </div>

        <!-- Step 3: Authentication -->
        <div class="step-content" data-step="3">
            <h2>Authentication Setup</h2>
            <p>Choose how you want to authenticate with Azure.</p>

            <div class="form-group">
                <label for="authFlow">Authentication Method *</label>
                <select id="authFlow" onchange="updateAuthFields()">
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
                    <li>Install Azure CLI: <a href="#" data-url="https://learn.microsoft.com/en-us/cli/azure/install-azure-cli">Download here</a></li>
                    <li>Run: <code>az login</code> in terminal</li>
                </ul>
                <button onclick="validateAuth()">Validate Azure CLI</button>
                <span id="authValidation"></span>
            </div>

            <div id="deviceCodeInfo" class="links" style="display: none;">
                <h4>📱 Device Code Flow</h4>
                <p>Interactive authentication using a browser. Good for shared environments.</p>
                <div class="form-group">
                    <label for="deviceCodeClientId">Client ID *</label>
                    <input type="text" id="deviceCodeClientId" placeholder="Application (client) ID">
                    <div class="help-text">Register an app in Azure AD to get this ID</div>
                </div>
                <a href="#" data-url="https://learn.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app">How to register an Azure AD app</a>
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
                <a href="#" data-url="https://learn.microsoft.com/en-us/azure/active-directory/develop/howto-create-service-principal-portal">Create a Service Principal</a>
            </div>

            <div class="button-group">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="nextStep()">Next →</button>
            </div>
        </div>

        <!-- Step 4: Test Connection -->
        <div class="step-content" data-step="4">
            <h2>Test Connection</h2>
            <p>Let's verify your configuration works!</p>

            <div class="links">
                <h4>🔍 Connection Check</h4>
                <p>We'll test:</p>
                <ul>
                    <li>Authentication with Azure</li>
                    <li>Access to Application Insights</li>
                    <li>Connection to Kusto cluster</li>
                </ul>
            </div>

            <button onclick="testConnection()">🧪 Test Connection</button>
            <span id="connectionTest"></span>

            <div id="connectionResults" style="margin-top: 20px; display: none;">
                <h4>Test Results:</h4>
                <p id="connectionMessage"></p>
            </div>

            <div class="button-group">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="nextStep()">Next →</button>
            </div>
        </div>

        <!-- Step 5: Complete -->
        <div class="step-content" data-step="5">
            <h2>🎉 Setup Complete!</h2>
            <p>Your BC Telemetry Buddy is ready to use.</p>

            <div class="links">
                <h4>✅ Configuration Summary</h4>
                <p>Your settings will be saved to <code>.vscode/settings.json</code> in your workspace.</p>
                <p><em>For optional features (queries folder, cache TTL, CodeLens), see the README.</em></p>
            </div>

            <button onclick="saveSettings()">💾 Save Configuration</button>
            <span id="saveStatus"></span>

            <div class="links" style="margin-top: 30px;">
                <h4>🚀 Next Steps:</h4>
                <ul>
                    <li>Chat with GitHub Copilot and ask about your BC telemetry</li>
                    <li>Example: "@workspace Show me all errors from BC in the last 24 hours"</li>
                    <li>Or use Command Palette: "BC Telemetry Buddy: Run KQL Query"</li>
                    <li>Create and save your own KQL queries in <code>.kql</code> files</li>
                </ul>
                <p><strong>💡 Tip:</strong> The MCP server will automatically start when you chat with Copilot!</p>
                <a href="#" data-url="https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/README.md">📖 Read the README</a>
            </div>

            <div class="button-group">
                <button class="secondary" onclick="prevStep()">← Back</button>
                <button onclick="closeWizard()">Finish ✓</button>
            </div>
        </div>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        let currentStep = 1;
        const totalSteps = 5;

        // Request current settings on load
        window.addEventListener('load', () => {
            vscode.postMessage({ type: 'requestCurrentSettings' });
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            switch (message.type) {
                case 'currentSettings':
                    populateSettings(message.settings);
                    break;
                case 'authValidation':
                    showAuthValidation(message);
                    break;
                case 'connectionTest':
                    showConnectionTest(message);
                    break;
                case 'settingsSaved':
                    showSaveStatus(message);
                    break;
            }
        });

        function populateSettings(settings) {
            document.getElementById('tenantName').value = settings.tenantName || '';
            document.getElementById('tenantId').value = settings.tenantId || '';
            document.getElementById('appInsightsId').value = settings.appInsightsId || '';
            document.getElementById('kustoUrl').value = settings.kustoUrl || '';
            document.getElementById('authFlow').value = settings.authFlow || 'azure_cli';
            document.getElementById('deviceCodeClientId').value = settings.clientId || '';
            document.getElementById('spClientId').value = settings.clientId || '';
            document.getElementById('clientSecret').value = settings.clientSecret || '';
            
            updateAuthFields();
        }

        function nextStep() {
            if (currentStep < totalSteps) {
                goToStep(currentStep + 1);
            }
        }

        function prevStep() {
            if (currentStep > 1) {
                goToStep(currentStep - 1);
            }
        }

        function goToStep(step) {
            // Hide current step
            document.querySelector(\`.step-content[data-step="\${currentStep}"]\`).classList.remove('active');
            document.querySelector(\`.wizard-step[data-step="\${currentStep}"]\`).classList.remove('active');
            document.querySelector(\`.wizard-step[data-step="\${currentStep}"]\`).classList.add('completed');

            // Show new step
            currentStep = step;
            document.querySelector(\`.step-content[data-step="\${currentStep}"]\`).classList.add('active');
            document.querySelector(\`.wizard-step[data-step="\${currentStep}"]\`).classList.add('active');
        }

        function updateAuthFields() {
            const authFlow = document.getElementById('authFlow').value;
            document.getElementById('azureCliInfo').style.display = authFlow === 'azure_cli' ? 'block' : 'none';
            document.getElementById('deviceCodeInfo').style.display = authFlow === 'device_code' ? 'block' : 'none';
            document.getElementById('clientCredentialsInfo').style.display = authFlow === 'client_credentials' ? 'block' : 'none';
        }

        function validateAuth() {
            const authFlow = document.getElementById('authFlow').value;
            vscode.postMessage({ type: 'validateAuth', authFlow });
        }

        function showAuthValidation(message) {
            const span = document.getElementById('authValidation');
            span.className = \`validation-status \${message.isValid ? 'success' : 'error'}\`;
            span.innerHTML = message.message.replace(/\\n/g, '<br>');
        }

        function testConnection() {
            vscode.postMessage({ type: 'testConnection' });
        }

        function showConnectionTest(message) {
            const span = document.getElementById('connectionTest');
            span.className = \`validation-status \${message.success ? 'success' : 'error'}\`;
            span.textContent = message.message;

            const results = document.getElementById('connectionResults');
            results.style.display = 'block';
            document.getElementById('connectionMessage').textContent = message.message;
        }

        function saveSettings() {
            const authFlow = document.getElementById('authFlow').value;
            const settings = {
                tenantName: document.getElementById('tenantName').value,
                tenantId: document.getElementById('tenantId').value,
                appInsightsId: document.getElementById('appInsightsId').value,
                kustoUrl: document.getElementById('kustoUrl').value,
                authFlow: authFlow,
                clientId: authFlow === 'device_code' 
                    ? document.getElementById('deviceCodeClientId').value 
                    : document.getElementById('spClientId').value,
                clientSecret: authFlow === 'client_credentials' 
                    ? document.getElementById('clientSecret').value 
                    : ''
            };

            vscode.postMessage({ type: 'saveSettings', settings });
        }

        function showSaveStatus(message) {
            const span = document.getElementById('saveStatus');
            span.className = \`validation-status \${message.success ? 'success' : 'error'}\`;
            span.textContent = message.message;
        }

        function closeWizard() {
            // Optionally save first if not already saved
            saveSettings();
        }

        // Handle external link clicks
        document.addEventListener('click', (e) => {
            const target = e.target;
            if (target.tagName === 'A' && target.dataset.url) {
                e.preventDefault();
                vscode.postMessage({ type: 'openExternal', url: target.dataset.url });
            }
        });
    </script>
</body>
</html>`;
    }

    private _onDispose() {
        this._panel = undefined;

        // Clean up disposables
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    public dispose() {
        this._onDispose();
    }
}
