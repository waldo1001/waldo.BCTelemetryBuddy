import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { ProfiledConfig, MCPConfig, validateConfig } from '@bctb/shared';
import { AuthService } from '@bctb/shared';

/**
 * Webview provider for the profile creation/editing wizard
 */
export class ProfileWizardProvider {
    public static readonly viewType = 'bctb.profileWizard';
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private outputChannel: vscode.OutputChannel;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        outputChannel: vscode.OutputChannel
    ) {
        this.outputChannel = outputChannel;
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
    }

    /**
     * Show the wizard with optional profile data for editing
     */
    public async show(profileName?: string) {
        const column = vscode.window.activeTextEditor
            ? vscode.window.activeTextEditor.viewColumn
            : undefined;

        if (this._panel) {
            this._panel.reveal(column);
        } else {
            this._panel = vscode.window.createWebviewPanel(
                ProfileWizardProvider.viewType,
                profileName ? `Edit Profile: ${profileName}` : 'Create New Profile',
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
                        case 'validate':
                            await this.handleValidate(message.profile);
                            break;
                        case 'testAuth':
                            await this.handleTestAuth(message.profile);
                            break;
                        case 'save':
                            await this.handleSave(message.profile);
                            break;
                    }
                },
                null,
                this._disposables
            );

            this._panel.onDidDispose(
                () => {
                    this._panel = undefined;
                },
                null,
                this._disposables
            );
        }

        // Load existing profile for editing
        if (profileName && this._panel) {
            const config = this.loadConfig();
            if (config.profiles && config.profiles[profileName]) {
                this._panel.webview.postMessage({
                    type: 'loadProfile',
                    profileName,
                    profile: config.profiles[profileName]
                });
            }
        }
    }

    private async handleValidate(profile: any) {
        try {
            const errors = validateConfig(profile as MCPConfig);

            this._panel?.webview.postMessage({
                type: 'validationResult',
                success: errors.length === 0,
                errors: errors
            });
        } catch (error: any) {
            this._panel?.webview.postMessage({
                type: 'validationResult',
                success: false,
                errors: [error.message]
            });
        }
    }

    private async handleTestAuth(profile: any) {
        try {
            this.outputChannel.appendLine('[ProfileWizard] Testing authentication...');

            const auth = new AuthService(profile as MCPConfig);
            const result = await auth.authenticate();

            this._panel?.webview.postMessage({
                type: 'authTestResult',
                success: result.authenticated,
                message: result.authenticated
                    ? `✓ Authentication successful as ${result.user}`
                    : '✗ Authentication failed'
            });

            if (result.authenticated) {
                vscode.window.showInformationMessage(`Authentication successful as ${result.user}`);
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[ProfileWizard] Auth test failed: ${error.message}`);

            this._panel?.webview.postMessage({
                type: 'authTestResult',
                success: false,
                message: `✗ ${error.message}`
            });

            vscode.window.showErrorMessage(`Authentication failed: ${error.message}`);
        }
    }

    private async handleSave(profile: any) {
        try {
            const profileName = profile.profileName;
            delete profile.profileName; // Remove the profile name from the config object

            if (!profileName || !profileName.match(/^[a-z0-9-]+$/)) {
                throw new Error('Profile name must be lowercase letters, numbers, and dashes only');
            }

            const configPath = this.getConfigPath();
            let config: ProfiledConfig;

            // Load or create config
            if (fs.existsSync(configPath)) {
                const fileContent = fs.readFileSync(configPath, 'utf-8');
                config = JSON.parse(fileContent);
            } else {
                config = {
                    profiles: {},
                    defaultProfile: profileName
                };
            }

            // Initialize profiles object if needed
            if (!config.profiles) {
                config.profiles = {};
            }

            // Add or update profile
            config.profiles[profileName] = profile;

            // Set as default if it's the first profile
            if (Object.keys(config.profiles).length === 1) {
                config.defaultProfile = profileName;
            }

            // Save config
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

            this.outputChannel.appendLine(`[ProfileWizard] Saved profile: ${profileName}`);

            this._panel?.webview.postMessage({
                type: 'saveResult',
                success: true,
                message: `Profile "${profileName}" saved successfully!`
            });

            vscode.window.showInformationMessage(`Profile "${profileName}" saved successfully!`);

            // Refresh profile status bar
            await vscode.commands.executeCommand('bctb.refreshProfileStatusBar');

        } catch (error: any) {
            this.outputChannel.appendLine(`[ProfileWizard] Save failed: ${error.message}`);

            this._panel?.webview.postMessage({
                type: 'saveResult',
                success: false,
                message: error.message
            });

            vscode.window.showErrorMessage(`Failed to save profile: ${error.message}`);
        }
    }

    private loadConfig(): ProfiledConfig {
        const configPath = this.getConfigPath();
        if (!fs.existsSync(configPath)) {
            return { profiles: {} };
        }
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        return JSON.parse(fileContent);
    }

    private getConfigPath(): string {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }
        return path.join(workspaceFolders[0].uri.fsPath, '.bctb-config.json');
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Profile Wizard</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 20px;
            max-width: 800px;
            margin: 0 auto;
        }
        h1 {
            color: var(--vscode-foreground);
            font-size: 24px;
            margin-bottom: 10px;
        }
        .subtitle {
            color: var(--vscode-descriptionForeground);
            margin-bottom: 20px;
        }
        .form-group {
            margin-bottom: 20px;
        }
        label {
            display: block;
            margin-bottom: 5px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .help-text {
            display: block;
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 5px;
            font-style: italic;
        }
        input, select {
            width: 100%;
            padding: 6px 8px;
            background-color: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: 2px;
            box-sizing: border-box;
        }
        input:focus, select:focus {
            outline: 1px solid var(--vscode-focusBorder);
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .checkbox-group input[type="checkbox"] {
            width: auto;
        }
        button {
            padding: 8px 16px;
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            border-radius: 2px;
            cursor: pointer;
            font-size: 13px;
            margin-right: 8px;
            margin-top: 10px;
        }
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        button.secondary {
            background-color: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        button.secondary:hover {
            background-color: var(--vscode-button-secondaryHoverBackground);
        }
        .button-group {
            display: flex;
            gap: 8px;
            margin-top: 20px;
        }
        .message {
            padding: 10px;
            margin: 10px 0;
            border-radius: 2px;
        }
        .message.success {
            background-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-editor-background);
        }
        .message.error {
            background-color: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        .message.info {
            background-color: var(--vscode-editorInfo-foreground);
            color: var(--vscode-editor-background);
        }
        .section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 4px;
            padding: 15px;
            margin-bottom: 20px;
        }
        .section-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 15px;
            color: var(--vscode-foreground);
        }
        .conditional {
            display: none;
        }
        .conditional.visible {
            display: block;
        }
    </style>
</head>
<body>
    <h1>🔌 Profile Wizard</h1>
    <p class="subtitle">Create a new telemetry profile for a customer or environment</p>

    <div id="messageContainer"></div>

    <form id="profileForm">
        <!-- Profile Identity -->
        <div class="section">
            <div class="section-title">Profile Identity</div>
            
            <div class="form-group">
                <label for="profileName">Profile Name *</label>
                <span class="help-text">Unique identifier (lowercase-with-dashes, e.g., "customer-a-prod")</span>
                <input type="text" id="profileName" name="profileName" pattern="[a-z0-9-]+" required 
                    placeholder="customer-a-prod" />
            </div>

            <div class="form-group">
                <label for="connectionName">Display Name *</label>
                <span class="help-text">Friendly name shown in UI (e.g., "Customer A Production")</span>
                <input type="text" id="connectionName" name="connectionName" required 
                    placeholder="Customer A Production" />
            </div>
        </div>

        <!-- Authentication -->
        <div class="section">
            <div class="section-title">Authentication</div>
            
            <div class="form-group">
                <label for="authFlow">Authentication Method *</label>
                <span class="help-text">How to authenticate with Azure</span>
                <select id="authFlow" name="authFlow" required>
                    <option value="azure_cli">Azure CLI (recommended - uses 'az login')</option>
                    <option value="device_code">Device Code (browser login)</option>
                    <option value="client_credentials">Service Principal (automated)</option>
                </select>
            </div>

            <div class="form-group">
                <label for="tenantId">Tenant ID</label>
                <span class="help-text">Azure AD tenant ID (optional for Azure CLI)</span>
                <input type="text" id="tenantId" name="tenantId" 
                    placeholder="00000000-0000-0000-0000-000000000000" />
            </div>

            <div class="form-group conditional" id="clientIdGroup">
                <label for="clientId">Client ID *</label>
                <span class="help-text">Service principal application ID (required for client_credentials)</span>
                <input type="text" id="clientId" name="clientId" 
                    placeholder="00000000-0000-0000-0000-000000000000" />
            </div>

            <div class="form-group conditional" id="clientSecretGroup">
                <label for="clientSecret">Client Secret *</label>
                <span class="help-text">Use environment variable: \${CLIENT_SECRET} (never commit secrets!)</span>
                <input type="password" id="clientSecret" name="clientSecret" 
                    placeholder="\${CUSTOMER_A_SECRET}" />
            </div>
        </div>

        <!-- Application Insights -->
        <div class="section">
            <div class="section-title">Application Insights</div>
            
            <div class="form-group">
                <label for="applicationInsightsAppId">Application Insights ID *</label>
                <span class="help-text">Find this in Azure Portal → Application Insights → API Access</span>
                <input type="text" id="applicationInsightsAppId" name="applicationInsightsAppId" required 
                    placeholder="00000000-0000-0000-0000-000000000000" />
            </div>
        </div>

        <!-- Kusto -->
        <div class="section">
            <div class="section-title">Kusto / Data Access</div>
            
            <div class="form-group">
                <label for="kustoClusterUrl">Kusto Cluster URL *</label>
                <span class="help-text">Default: https://ade.applicationinsights.io</span>
                <input type="url" id="kustoClusterUrl" name="kustoClusterUrl" required 
                    value="https://ade.applicationinsights.io" />
            </div>
        </div>

        <!-- Workspace -->
        <div class="section">
            <div class="section-title">Workspace Settings</div>
            
            <div class="form-group">
                <label for="workspacePath">Workspace Path</label>
                <span class="help-text">Use \${workspaceFolder} for current workspace, or specify customer-specific path</span>
                <input type="text" id="workspacePath" name="workspacePath" 
                    value="\${workspaceFolder}" />
            </div>

            <div class="form-group">
                <label for="queriesFolder">Queries Folder</label>
                <span class="help-text">Relative folder for saved queries</span>
                <input type="text" id="queriesFolder" name="queriesFolder" 
                    value="queries" />
            </div>
        </div>

        <!-- Cache & Sanitization -->
        <div class="section">
            <div class="section-title">Cache & Privacy</div>
            
            <div class="form-group checkbox-group">
                <input type="checkbox" id="cacheEnabled" name="cacheEnabled" checked />
                <label for="cacheEnabled" style="margin-bottom: 0;">Enable query caching</label>
            </div>

            <div class="form-group">
                <label for="cacheTTLSeconds">Cache TTL (seconds)</label>
                <input type="number" id="cacheTTLSeconds" name="cacheTTLSeconds" 
                    value="3600" min="0" />
            </div>

            <div class="form-group checkbox-group">
                <input type="checkbox" id="removePII" name="removePII" />
                <label for="removePII" style="margin-bottom: 0;">Remove PII (Personally Identifiable Information)</label>
            </div>
        </div>

        <!-- Advanced -->
        <div class="section">
            <div class="section-title">Advanced (Optional)</div>
            
            <div class="form-group">
                <label for="extends">Inherit from Base Profile</label>
                <span class="help-text">Profile name to inherit settings from (e.g., "_base_azure_cli")</span>
                <input type="text" id="extends" name="extends" 
                    placeholder="Leave empty or enter base profile name" />
            </div>
        </div>

        <!-- Actions -->
        <div class="button-group">
            <button type="button" id="validateBtn">🔍 Validate</button>
            <button type="button" id="testAuthBtn" class="secondary">🔐 Test Authentication</button>
            <button type="submit" id="saveBtn">💾 Save Profile</button>
        </div>
    </form>

    <script>
        const vscode = acquireVsCodeApi();
        
        // Handle auth flow changes
        document.getElementById('authFlow').addEventListener('change', (e) => {
            const clientIdGroup = document.getElementById('clientIdGroup');
            const clientSecretGroup = document.getElementById('clientSecretGroup');
            const clientIdInput = document.getElementById('clientId');
            const clientSecretInput = document.getElementById('clientSecret');
            
            if (e.target.value === 'client_credentials') {
                clientIdGroup.classList.add('visible');
                clientSecretGroup.classList.add('visible');
                clientIdInput.required = true;
                clientSecretInput.required = true;
            } else {
                clientIdGroup.classList.remove('visible');
                clientSecretGroup.classList.remove('visible');
                clientIdInput.required = false;
                clientSecretInput.required = false;
            }
        });

        // Get form data as profile object
        function getProfileData() {
            const formData = new FormData(document.getElementById('profileForm'));
            const profile = {
                profileName: formData.get('profileName'),
                connectionName: formData.get('connectionName'),
                authFlow: formData.get('authFlow'),
                tenantId: formData.get('tenantId') || '',
                applicationInsightsAppId: formData.get('applicationInsightsAppId'),
                kustoClusterUrl: formData.get('kustoClusterUrl'),
                workspacePath: formData.get('workspacePath'),
                queriesFolder: formData.get('queriesFolder'),
                cacheEnabled: document.getElementById('cacheEnabled').checked,
                cacheTTLSeconds: parseInt(formData.get('cacheTTLSeconds')),
                removePII: document.getElementById('removePII').checked,
                references: []
            };

            // Add optional fields
            if (formData.get('clientId')) {
                profile.clientId = formData.get('clientId');
            }
            if (formData.get('clientSecret')) {
                profile.clientSecret = formData.get('clientSecret');
            }
            if (formData.get('extends')) {
                profile.extends = formData.get('extends');
            }

            return profile;
        }

        // Show message
        function showMessage(message, type = 'info') {
            const container = document.getElementById('messageContainer');
            container.innerHTML = \`<div class="message \${type}">\${message}</div>\`;
            setTimeout(() => {
                container.innerHTML = '';
            }, 5000);
        }

        // Validate button
        document.getElementById('validateBtn').addEventListener('click', () => {
            const profile = getProfileData();
            vscode.postMessage({ type: 'validate', profile });
            showMessage('Validating configuration...', 'info');
        });

        // Test auth button
        document.getElementById('testAuthBtn').addEventListener('click', () => {
            const profile = getProfileData();
            vscode.postMessage({ type: 'testAuth', profile });
            showMessage('Testing authentication...', 'info');
        });

        // Save button
        document.getElementById('profileForm').addEventListener('submit', (e) => {
            e.preventDefault();
            const profile = getProfileData();
            vscode.postMessage({ type: 'save', profile });
            showMessage('Saving profile...', 'info');
        });

        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.type) {
                case 'validationResult':
                    if (message.success) {
                        showMessage('✓ Configuration is valid!', 'success');
                    } else {
                        showMessage('✗ Validation errors: ' + message.errors.join(', '), 'error');
                    }
                    break;
                    
                case 'authTestResult':
                    if (message.success) {
                        showMessage(message.message, 'success');
                    } else {
                        showMessage(message.message, 'error');
                    }
                    break;
                    
                case 'saveResult':
                    if (message.success) {
                        showMessage(message.message, 'success');
                        // Optionally reset form
                        // document.getElementById('profileForm').reset();
                    } else {
                        showMessage('✗ ' + message.message, 'error');
                    }
                    break;

                case 'loadProfile':
                    // Load existing profile for editing
                    const profile = message.profile;
                    document.getElementById('profileName').value = message.profileName;
                    document.getElementById('connectionName').value = profile.connectionName || '';
                    document.getElementById('authFlow').value = profile.authFlow || 'azure_cli';
                    document.getElementById('tenantId').value = profile.tenantId || '';
                    document.getElementById('applicationInsightsAppId').value = profile.applicationInsightsAppId || '';
                    document.getElementById('kustoClusterUrl').value = profile.kustoClusterUrl || 'https://ade.applicationinsights.io';
                    
                    // Support both flat (workspacePath) and nested (workspace.path) formats
                    const workspacePath = profile.workspacePath || profile.workspace?.path || '\${workspaceFolder}';
                    const queriesFolder = profile.queriesFolder || profile.workspace?.queriesFolder || 'queries';
                    document.getElementById('workspacePath').value = workspacePath;
                    document.getElementById('queriesFolder').value = queriesFolder;
                    
                    document.getElementById('cacheEnabled').checked = profile.cacheEnabled !== false;
                    document.getElementById('cacheTTLSeconds').value = profile.cacheTTLSeconds || 3600;
                    document.getElementById('removePII').checked = profile.removePII === true;
                    
                    if (profile.clientId) document.getElementById('clientId').value = profile.clientId;
                    if (profile.clientSecret) document.getElementById('clientSecret').value = profile.clientSecret;
                    if (profile.extends) document.getElementById('extends').value = profile.extends;
                    
                    // Trigger auth flow change to show/hide fields
                    document.getElementById('authFlow').dispatchEvent(new Event('change'));
                    break;
            }
        });

        // Initialize auth flow visibility
        document.getElementById('authFlow').dispatchEvent(new Event('change'));
    </script>
</body>
</html>`;
    }
}
