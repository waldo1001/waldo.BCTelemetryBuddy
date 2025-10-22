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
                await this._testConnection(message.settings);
                break;
            case 'saveSettings':
                await this._saveSettings(message.settings);
                break;
            case 'installChatmode':
                await this._installChatmode();
                break;
            case 'closeWizard':
                this._panel?.dispose();
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
                const config = vscode.workspace.getConfiguration('bctb.mcp');
                const tenantId = config.get<string>('tenantId');
                const clientId = config.get<string>('clientId');

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

    private async _testConnection(settings: any): Promise<void> {
        // Use settings from the form, not from saved configuration
        // This allows testing before saving
        const appInsightsId = settings?.appInsightsId;
        const kustoUrl = settings?.kustoUrl;
        const authFlow = settings?.authFlow;

        let success = false;
        let message = '';
        let details = '';

        console.log('[SetupWizard] Testing connection with settings:', { appInsightsId, kustoUrl, authFlow });

        if (!appInsightsId || !kustoUrl) {
            message = '❌ Missing App Insights ID or Kusto URL';
            details = 'Please fill in all required fields before testing connection.';
        } else {
            try {
                // Validate authentication based on auth flow
                if (authFlow === 'azure_cli') {
                    const { exec } = await import('child_process');
                    const { promisify } = await import('util');
                    const execAsync = promisify(exec);

                    try {
                        const { stdout } = await execAsync('az account show');
                        const accountInfo = JSON.parse(stdout);
                        details = `✅ Authenticated as: ${accountInfo.user.name}\n`;
                        details += `✅ Subscription: ${accountInfo.name}\n`;
                        details += `✅ App Insights ID: ${appInsightsId}\n`;
                        details += `✅ Kusto Cluster: ${kustoUrl}\n`;
                        details += '\n⚠️ Note: Full query test requires MCP server to be running.';
                        success = true;
                        message = '✅ Connection configuration is valid';
                    } catch (error: any) {
                        message = '❌ Azure CLI authentication failed';
                        details = 'Please run "az login" in your terminal first.';
                    }
                } else if (authFlow === 'device_code') {
                    if (!settings.clientId) {
                        message = '❌ Missing Client ID';
                        details = 'Client ID is required for device code flow.';
                    } else {
                        details = `✅ Auth Flow: Device Code\n`;
                        details += `✅ Client ID: ${settings.clientId}\n`;
                        details += `✅ App Insights ID: ${appInsightsId}\n`;
                        details += `✅ Kusto Cluster: ${kustoUrl}\n`;
                        details += '\n⚠️ Note: Full authentication test requires MCP server to be running.';
                        success = true;
                        message = '✅ Configuration looks valid';
                    }
                } else if (authFlow === 'client_credentials') {
                    if (!settings.clientId || !settings.clientSecret) {
                        message = '❌ Missing Client ID or Client Secret';
                        details = 'Both Client ID and Client Secret are required for service principal authentication.';
                    } else {
                        details = `✅ Auth Flow: Client Credentials\n`;
                        details += `✅ Client ID: ${settings.clientId}\n`;
                        details += `✅ App Insights ID: ${appInsightsId}\n`;
                        details += `✅ Kusto Cluster: ${kustoUrl}\n`;
                        details += '\n⚠️ Note: Full authentication test requires MCP server to be running.';
                        success = true;
                        message = '✅ Configuration looks valid';
                    }
                }
            } catch (error: any) {
                message = `❌ Connection test failed: ${error.message}`;
                details = error.stack || '';
            }
        }

        console.log('[SetupWizard] Connection test result:', { success, message });

        this._panel?.webview.postMessage({
            type: 'connectionTest',
            success,
            message,
            details
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

    private async _installChatmode(): Promise<void> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                throw new Error('No workspace folder open');
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const chatmodeDir = path.join(workspacePath, '.github', 'chatmodes');
            const chatmodePath = path.join(chatmodeDir, 'BCTelemetryBuddy.chatmode.md');

            // Check if chatmode already exists
            if (fs.existsSync(chatmodePath)) {
                this._panel?.webview.postMessage({
                    type: 'chatmodeInstalled',
                    success: true,
                    alreadyExists: true,
                    message: 'Chatmode already exists'
                });
                return;
            }

            // Create .github/chatmodes directory if it doesn't exist
            if (!fs.existsSync(chatmodeDir)) {
                fs.mkdirSync(chatmodeDir, { recursive: true });
            }

            // Chatmode content
            const chatmodeContent = `---
description: 'Expert assistant for analyzing Business Central telemetry data using KQL, with deep knowledge of BC events and performance optimization.'
tools: ['edit', 'runNotebooks', 'search', 'new', 'runCommands', 'runTasks', 'BC Telemetry Buddy/*', 'usages', 'vscodeAPI', 'problems', 'changes', 'testFailure', 'openSimpleBrowser', 'fetch', 'githubRepo', 'ms-dynamics-smb.al/al_build', 'ms-dynamics-smb.al/al_download_symbols', 'ms-dynamics-smb.al/al_download_source', 'ms-dynamics-smb.al/al_clear_credentials_cache', 'ms-dynamics-smb.al/al_insert_event', 'ms-dynamics-smb.al/al_clear_profile_codelenses', 'ms-dynamics-smb.al/al_initalize_snapshot_debugging', 'ms-dynamics-smb.al/al_finish_snapshot_debugging', 'ms-dynamics-smb.al/al_go', 'ms-dynamics-smb.al/al_new_project', 'ms-dynamics-smb.al/al_incremental_publish', 'ms-dynamics-smb.al/al_debug_without_publish', 'ms-dynamics-smb.al/al_full_package', 'ms-dynamics-smb.al/al_generate_cpu_profile_file', 'ms-dynamics-smb.al/al_generate_manifest', 'ms-dynamics-smb.al/al_generate_permission_set_for_extension_objects', 'ms-dynamics-smb.al/al_generate_permission_set_for_extension_objects_as_xml', 'ms-dynamics-smb.al/al_open_event_recorder', 'ms-dynamics-smb.al/al_open_page_designer', 'ms-dynamics-smb.al/al_package', 'ms-dynamics-smb.al/al_publish', 'ms-dynamics-smb.al/al_publish_without_debug', 'ms-dynamics-smb.al/al_publish_existing_extension', 'ms-dynamics-smb.al/al_view_snapshots', 'extensions', 'todos']
---

# BC Telemetry Buddy - System Instructions

You are **BC Telemetry Buddy**, an expert assistant specialized in analyzing Microsoft Dynamics 365 Business Central telemetry data using Azure Application Insights and Kusto Query Language (KQL).

## Core Expertise

### KQL Mastery
- Expert in writing efficient KQL queries for BC telemetry
- Understanding of customDimensions schema and field extraction
- Knowledge of performance optimization patterns
- Ability to construct complex aggregations and time-series analyses

### Essential Patterns
Always use these patterns when querying BC telemetry:

\`\`\`kql
// Extract customDimensions properly
| extend eventId = tostring(customDimensions.eventId)
| extend aadTenantId = tostring(customDimensions.aadTenantId)
| extend companyName = tostring(customDimensions.companyName)

// Time filtering
| where timestamp >= ago(30d)

// Tenant filtering (CRITICAL - BC uses tenantId, not company names)
| where tostring(customDimensions.aadTenantId) == "tenant-guid-here"
\`\`\`

## Available Tools

### BC Telemetry Buddy MCP Tools
**ALWAYS use these tools first before writing custom queries:**

1. **mcp_bc_telemetry__get_tenant_mapping**
   - **CRITICAL**: Use this FIRST when user mentions a company/customer name
   - Maps company names to aadTenantId (required for all queries)
   - BC telemetry uses tenant GUIDs, not company names for filtering

2. **mcp_bc_telemetry__get_event_catalog**
   - Discover available BC event IDs with descriptions and status
   - Use before writing queries about unfamiliar events
   - Provides documentation links and occurrence counts
   - Supports filtering by status (success, error, too slow, warning, info)

3. **mcp_bc_telemetry__get_event_field_samples**
   - **RECOMMENDED**: Use this to understand event structure before querying
   - Shows actual field names, data types, and sample values from real events
   - Provides ready-to-use example queries with proper type conversions
   - Returns event category information from Microsoft Learn

4. **mcp_bc_telemetry__query_telemetry**
   - Execute KQL queries against BC telemetry data
   - Automatically includes context from saved queries
   - Returns results with recommendations

5. **mcp_bc_telemetry__save_query**
   - Save reusable queries with metadata
   - Builds knowledge base over time

6. **mcp_bc_telemetry__search_queries**
   - Find existing saved queries by keywords
   - Reuse proven query patterns

## Workflow for Analysis

### Step 1: Identify the Customer
When user mentions a company/customer name:
\`\`\`
1. Call mcp_bc_telemetry__get_tenant_mapping with company name
2. Extract aadTenantId for use in all subsequent queries
3. NEVER filter by companyName - always use aadTenantId
\`\`\`

### Step 2: Understand the Events
Before writing queries about specific events:
\`\`\`
1. Call mcp_bc_telemetry__get_event_catalog to see available events
2. Call mcp_bc_telemetry__get_event_field_samples for specific event IDs
3. Review the example query and field structure provided
\`\`\`

### Step 3: Query and Analyze
\`\`\`
1. Use mcp_bc_telemetry__query_telemetry with proper KQL
2. Interpret results in business context
3. Provide actionable insights and recommendations
4. Save useful queries with mcp_bc_telemetry__save_query
\`\`\`

## File Organization

### Generic Queries
Save general-purpose queries under:
\`\`\`
queries/
  ├── Errors/
  ├── Mapping/
  └── [descriptive-name].kql
\`\`\`

### Customer-Specific Analysis
Save customer-related work under:
\`\`\`
Customers/
  └── [CustomerName]/
      ├── [Topic]/
      │   ├── queries/
      │   └── [CustomerName]_[Topic]_Report.md
      └── README.md
\`\`\`

Examples:
- \`Customers/Thornton/Performance/Thornton_Performance_Report_2025-10-16.md\`
- \`Customers/FDenL/Commerce365/FDenL_Commerce365_Performance_Analysis.md\`

## Response Style

- **Be concise** but thorough in explanations
- **Always provide context** - explain what the data means for the business
- **Include sample queries** with comments explaining each part
- **Proactive recommendations** - suggest optimizations and investigations
- **Structure insights** using clear headers and bullet points
- **Visual aids** - suggest charts/visualizations when appropriate
- **Next steps** - always suggest what to investigate next

## Critical Reminders

1. **NEVER filter by company name** - always get tenantId first
2. **ALWAYS check event structure** before writing complex queries
3. **Use proper type casting** - tostring(), toint(), todouble() as needed
4. **Save successful queries** - build the knowledge base
5. **Provide business context** - explain technical findings in business terms
6. **Focus on actionable insights** - not just data dumps

## Error Handling

- If tenant mapping fails, ask user to verify company name or provide tenantId
- If query returns no results, suggest checking time range and filters
- If event fields are unexpected, use mcp_bc_telemetry__get_event_field_samples to verify structure
- If query fails, check syntax and provide corrected version with explanation

## Your Goal

Help users understand their Business Central system health, performance, and usage patterns through telemetry data analysis. Transform raw telemetry into actionable insights that drive business decisions and system improvements.
`;

            // Write chatmode file
            fs.writeFileSync(chatmodePath, chatmodeContent, 'utf-8');

            this._panel?.webview.postMessage({
                type: 'chatmodeInstalled',
                success: true,
                alreadyExists: false,
                message: 'Chatmode installed successfully',
                path: chatmodePath
            });
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'chatmodeInstalled',
                success: false,
                message: error.message
            });
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
        // Get logo as base64 (with fallback for tests)
        let logoDataUri = '';
        try {
            const logoPath = vscode.Uri.joinPath(this._extensionUri, 'images', 'waldo.png').fsPath;
            if (logoPath && fs.existsSync(logoPath)) {
                const logoBase64 = fs.readFileSync(logoPath).toString('base64');
                logoDataUri = `data:image/png;base64,${logoBase64}`;
            }
        } catch (error) {
            // Ignore errors (e.g., in test environment)
        }

        // For now, return inline HTML. In production, you might want to load from a file
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src ${webview.cspSource} 'unsafe-inline';">
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
        .header-logo {
            text-align: center;
            margin-bottom: 20px;
        }
        .header-logo img {
            width: 80px;
            height: 80px;
        }
        h1 {
            color: var(--vscode-foreground);
            border-bottom: 2px solid var(--vscode-textLink-foreground);
            padding-bottom: 10px;
            text-align: center;
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
        ${logoDataUri ? `<div class="header-logo">
            <img src="${logoDataUri}" alt="">
        </div>` : ''}
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

            <div class="links" style="margin-top: 20px; padding: 15px; background: #2d2d30; border-radius: 8px; border-left: 4px solid #007acc;">
                <h4>🤖 GitHub Copilot Chatmode (Recommended)</h4>
                <p>Install BC Telemetry Buddy chatmode to get expert assistance in Copilot Chat.</p>
                <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                    <input type="checkbox" id="installChatmode" checked style="width: 18px; height: 18px; cursor: pointer;">
                    <span>Install chatmode to <code>.github/chatmodes/BCTelemetryBuddy.chatmode.md</code></span>
                </label>
                <p style="margin-top: 10px; font-size: 0.9em; color: #cccccc;">
                    ℹ️ After installation, type <code>#BCTelemetryBuddy</code> in Copilot Chat to activate expert mode.
                </p>
                <span id="chatmodeStatus" style="margin-top: 10px; display: block;"></span>
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
                case 'chatmodeInstalled':
                    showChatmodeStatus(message);
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
            // Collect current form values to test connection
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
            
            vscode.postMessage({ type: 'testConnection', settings });
        }

        function showConnectionTest(message) {
            const span = document.getElementById('connectionTest');
            span.className = \`validation-status \${message.success ? 'success' : 'error'}\`;
            span.textContent = message.message;

            const results = document.getElementById('connectionResults');
            results.style.display = 'block';
            const messageEl = document.getElementById('connectionMessage');
            
            // Display message with details if available
            if (message.details) {
                messageEl.innerHTML = '<strong>' + message.message + '</strong><br><br>' + 
                                     message.details.replace(/\\n/g, '<br>');
            } else {
                messageEl.textContent = message.message;
            }
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

            // Install chatmode if checkbox is checked
            const installChatmode = document.getElementById('installChatmode').checked;
            if (installChatmode) {
                const chatmodeStatus = document.getElementById('chatmodeStatus');
                chatmodeStatus.className = 'validation-status';
                chatmodeStatus.textContent = '⏳ Installing chatmode...';
                vscode.postMessage({ type: 'installChatmode' });
            }
        }

        function showSaveStatus(message) {
            const span = document.getElementById('saveStatus');
            span.className = \`validation-status \${message.success ? 'success' : 'error'}\`;
            span.textContent = message.message;
        }

        function showChatmodeStatus(message) {
            const span = document.getElementById('chatmodeStatus');
            if (message.success) {
                if (message.alreadyExists) {
                    span.className = 'validation-status success';
                    span.textContent = '✅ Chatmode already installed';
                } else {
                    span.className = 'validation-status success';
                    span.textContent = '✅ Chatmode installed successfully! Reload VS Code to activate.';
                }
            } else {
                span.className = 'validation-status error';
                span.textContent = \`❌ Failed to install chatmode: \${message.message}\`;
            }
        }

        function closeWizard() {
            // Close the wizard panel
            vscode.postMessage({ type: 'closeWizard' });
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
