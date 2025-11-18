import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { MCPClient } from './mcpClient';
import { ResultsWebview } from './resultsWebview';
import { SetupWizardProvider } from './webviews/SetupWizardProvider';
import { ProfileWizardProvider } from './webviews/ProfileWizardProvider';
import { registerChatParticipant } from './chatParticipant';
import { CHATMODE_DEFINITIONS } from './chatmodeDefinitions';
import { TelemetryService } from './services/telemetryService';
import { MigrationService } from './services/migrationService';
import { ProfileStatusBar } from './ui/profileStatusBar';
import { ProfileManager } from './services/profileManager';
import { showFirstRunNotification } from './services/mcpInstaller';

/**
 * MCP process handle
 */
interface MCPProcess {
    process: child_process.ChildProcess;
    port: number;
    workspacePath: string;
}

let mcpProcess: MCPProcess | null = null;
let mcpClient: MCPClient | null = null;
let telemetryService: TelemetryService | null = null;
let migrationService: MigrationService | null = null;
let profileStatusBar: ProfileStatusBar | null = null;
let profileManager: ProfileManager | null = null;
let profileWizard: ProfileWizardProvider | null = null;
let outputChannel: vscode.OutputChannel;
let setupWizard: SetupWizardProvider | null = null;
let extensionContext: vscode.ExtensionContext;

/**
 * Register MCP tools with VSCode's language model API
 * NOTE: This is now redundant - tools should come from MCP server itself
 */
function registerLanguageModelTools(context: vscode.ExtensionContext): void {
    outputChannel.appendLine('Registering MCP tools with VSCode language model API...');

    // Tool 1: query_telemetry
    const queryTelemetryTool = vscode.lm.registerTool('bctb_query_telemetry', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            kql?: string;
            nl?: string;
            useContext?: boolean;
            includeExternal?: boolean;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const params = options.input;

            // Call MCP server via JSON-RPC
            const response = await mcpClient.request('query_telemetry', {
                kql: params.kql,
                nl: params.nl,
                useContext: params.useContext ?? true,
                includeExternal: params.includeExternal ?? true
            });

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 2: get_saved_queries
    const getSavedQueriesTool = vscode.lm.registerTool('bctb_get_saved_queries', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            tags?: string[];
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_saved_queries', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 3: search_queries
    const searchQueriesTool = vscode.lm.registerTool('bctb_search_queries', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            searchTerms: string[];
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('search_queries', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 4: save_query
    const saveQueryTool = vscode.lm.registerTool('bctb_save_query', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            name: string;
            kql: string;
            purpose?: string;
            useCase?: string;
            tags?: string[];
            category?: string;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('save_query', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 5: get_categories
    const getCategoriesTool = vscode.lm.registerTool('bctb_get_categories', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{}>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_categories', {});

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 6: get_recommendations
    const getRecommendationsTool = vscode.lm.registerTool('bctb_get_recommendations', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            kql?: string;
            results?: any;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_recommendations', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 7: get_external_queries
    const getExternalQueriesTool = vscode.lm.registerTool('bctb_get_external_queries', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{}>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_external_queries', {});

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 8: get_event_catalog
    const getEventCatalogTool = vscode.lm.registerTool('bctb_get_event_catalog', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            daysBack?: number;
            status?: string;
            minCount?: number;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_event_catalog', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Tool 9: get_event_schema
    const getEventSchemaTool = vscode.lm.registerTool('bctb_get_event_schema', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            eventId: string;
            sampleSize?: number;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_event_schema', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    const getTenantMappingTool = vscode.lm.registerTool('bctb_get_tenant_mapping', {
        async invoke(options: vscode.LanguageModelToolInvocationOptions<{
            daysBack?: number;
            companyNameFilter?: string;
        }>, token: vscode.CancellationToken) {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.request('get_tenant_mapping', options.input);

            if (response.error) {
                throw new Error(response.error.message);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(response.result, null, 2))
            ]);
        }
    });

    // Add all tool disposables to context
    context.subscriptions.push(
        queryTelemetryTool,
        getSavedQueriesTool,
        searchQueriesTool,
        saveQueryTool,
        getCategoriesTool,
        getRecommendationsTool,
        getExternalQueriesTool,
        getEventCatalogTool,
        getEventSchemaTool,
        getTenantMappingTool
    );

    outputChannel.appendLine('✓ Registered 10 MCP tools with language model API');
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel('BC Telemetry Buddy');
    outputChannel.appendLine('BC Telemetry Buddy extension activated');

    // Initialize ProfileManager (handles multi-profile configurations)
    try {
        profileManager = new ProfileManager(outputChannel);
        outputChannel.appendLine('✓ ProfileManager initialized');
    } catch (error: any) {
        outputChannel.appendLine(`⚠️  ProfileManager initialization failed: ${error.message}`);
    }

    // Initialize ProfileStatusBar (shows current profile in status bar)
    try {
        profileStatusBar = new ProfileStatusBar(outputChannel);
        context.subscriptions.push(profileStatusBar);
        outputChannel.appendLine('✓ ProfileStatusBar initialized');
    } catch (error: any) {
        outputChannel.appendLine(`⚠️  ProfileStatusBar initialization failed: ${error.message}`);
    }

    // Initialize TelemetryService for direct commands (no MCP required)
    try {
        telemetryService = new TelemetryService(outputChannel);
        outputChannel.appendLine('✓ TelemetryService initialized');
    } catch (error: any) {
        outputChannel.appendLine(`⚠️  TelemetryService initialization failed: ${error.message}`);
        outputChannel.appendLine('   Extension commands will not work until workspace is configured');
    }

    // Initialize MCP client for HTTP mode (legacy)
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
    const config = vscode.workspace.getConfiguration('bctb', folderUri);
    const mcpUrl = config.get<string>('mcp.url', 'http://localhost:52345');
    mcpClient = new MCPClient(mcpUrl, outputChannel);

    // Initialize setup wizard
    setupWizard = new SetupWizardProvider(context.extensionUri);

    // Initialize profile wizard
    profileWizard = new ProfileWizardProvider(context.extensionUri, outputChannel);
    outputChannel.appendLine('✓ ProfileWizardProvider initialized');

    // Initialize migration service
    migrationService = new MigrationService(outputChannel);

    // Check for migration on first launch (after short delay to let activation complete)
    setTimeout(async () => {
        await migrationService?.showMigrationNotification(context);
    }, 2000);

    // Show MCP first-run notification if not installed (after migration check)
    setTimeout(async () => {
        await showFirstRunNotification(context);
    }, 4000);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bctb.setupWizard', async () => {
            await setupWizard?.show();
        }),
        vscode.commands.registerCommand('bctb.migrateSettings', async () => {
            if (!migrationService) {
                vscode.window.showErrorMessage('Migration service not initialized');
                return;
            }

            // Just migrate directly
            await migrationService.migrate(context);
        }),
        vscode.commands.registerCommand('bctb.resetMigrationState', async () => {
            await context.globalState.update('bctb.migrationCompleted', undefined);
            await context.globalState.update('bctb.migrationDismissed', undefined);
            vscode.window.showInformationMessage('Migration state reset. Reload window to see notification again.');
        }),
        vscode.commands.registerCommand('bctb.startMCP', () => startMCPCommand()),
        vscode.commands.registerCommand('bctb.runKQLQuery', () => runKQLQueryCommand(context)),
        vscode.commands.registerCommand('bctb.runKQLFromDocument', () => runKQLFromDocumentCommand(context)),
        vscode.commands.registerCommand('bctb.runKQLFromCodeLens', (uri: vscode.Uri, startLine: number, endLine: number, queryText: string) =>
            runKQLFromCodeLensCommand(context, uri, startLine, endLine, queryText)
        ),
        vscode.commands.registerCommand('bctb.saveQuery', () => saveQueryCommand()),
        vscode.commands.registerCommand('bctb.openQueriesFolder', () => openQueriesFolderCommand()),
        vscode.commands.registerCommand('bctb.clearCache', () => clearCacheCommand()),
        vscode.commands.registerCommand('bctb.showCacheStats', () => showCacheStatsCommand()),
        vscode.commands.registerCommand('bctb.installChatmodes', () => installChatmodesCommand()),
        vscode.commands.registerCommand('bctb.switchProfile', () => switchProfileCommand()),
        vscode.commands.registerCommand('bctb.refreshProfileStatusBar', () => refreshProfileStatusBarCommand()),
        vscode.commands.registerCommand('bctb.createProfile', () => createProfileCommand()),
        vscode.commands.registerCommand('bctb.editProfile', () => editProfileCommand()),
        vscode.commands.registerCommand('bctb.deleteProfile', () => deleteProfileCommand()),
        vscode.commands.registerCommand('bctb.setDefaultProfile', () => setDefaultProfileCommand()),
        vscode.commands.registerCommand('bctb.manageProfiles', () => manageProfilesCommand())
    );

    // Register CodeLens provider for .kql files
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(
            { language: 'kql' },
            new KQLCodeLensProvider(context)
        )
    );
    outputChannel.appendLine('✓ Registered CodeLens provider for .kql files');

    // Check if CodeLens is enabled
    const editorConfig = vscode.workspace.getConfiguration('editor');
    const codeLensEnabled = editorConfig.get<boolean>('codeLens', true);
    if (!codeLensEnabled) {
        outputChannel.appendLine('⚠️  WARNING: editor.codeLens is disabled in settings. CodeLens will not appear.');
        outputChannel.appendLine('   To enable: File → Preferences → Settings → search "codeLens" → check "Editor: Code Lens"');
    } else {
        outputChannel.appendLine('✓ CodeLens is enabled in settings');
    }

    // Register MCP Server Definition Provider for development
    const mcpProvider: vscode.McpServerDefinitionProvider<vscode.McpServerDefinition> = {
        provideMcpServerDefinitions() {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
            const mcpConfig = vscode.workspace.getConfiguration('bctb.mcp', folderUri);
            const preferGlobal = mcpConfig.get<boolean>('preferGlobal', false);
            // Development: Use local monorepo MCP server (packages/mcp/dist/launcher.js)
            // Production: Users install MCP globally with npm (bctb-mcp command)
            //
            // Check if we're in development (monorepo structure with ../mcp/ sibling package)
            // In monorepo, MCP lives at packages/mcp relative to packages/extension
            const mcpDevPath = path.join(context.extensionPath, '..', 'mcp', 'dist', 'launcher.js');
            const isDevelopment = fs.existsSync(mcpDevPath) && !preferGlobal;

            // Prepare environment variables for MCP server
            // Pass workspace path so MCP can find .bctb-config.json
            // Always use the active workspace (where user is working)
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

            const mcpEnv: Record<string, string> = {};
            if (workspacePath) {
                mcpEnv.BCTB_WORKSPACE_PATH = workspacePath;
            }

            if (isDevelopment) {
                // Development: Use local MCP server from monorepo
                outputChannel.appendLine(`🔧 Development mode: Using local MCP server at ${mcpDevPath}`);
                return [{
                    id: 'bctb',
                    label: 'BC Telemetry Buddy (Dev)',
                    description: 'Query Business Central telemetry data using KQL',
                    command: 'node',
                    args: [mcpDevPath],
                    env: mcpEnv
                }];
            } else {
                // Production: Use globally installed bctb-mcp command
                outputChannel.appendLine(preferGlobal
                    ? '📦 PreferGlobal enabled: Using globally installed bctb-mcp'
                    : '📦 Production mode: Using globally installed bctb-mcp');
                return [{
                    id: 'bctb',
                    label: 'BC Telemetry Buddy',
                    description: 'Query Business Central telemetry data using KQL',
                    command: 'bctb-mcp',
                    args: ['start', '--stdio'],
                    env: mcpEnv
                }];
            }
        }
    };
    context.subscriptions.push(
        vscode.lm.registerMcpServerDefinitionProvider('bctb', mcpProvider)
    );
    outputChannel.appendLine('✓ Registered MCP Server Definition Provider');

    // Register chat participant for @bc-telemetry-buddy
    registerChatParticipant(context, outputChannel);

    // Auto-show setup wizard on first activation if not configured
    checkAndShowSetupWizard(context);

    outputChannel.appendLine('Extension ready');
    outputChannel.appendLine('');
    outputChannel.appendLine('ℹ️  Direct commands: Use TelemetryService (no MCP required)');
    outputChannel.appendLine('ℹ️  Chat participant: Install MCP globally with "npm install -g bc-telemetry-buddy-mcp"');
    outputChannel.appendLine('ℹ️  Chat participant: Use @bc-telemetry-buddy in GitHub Copilot Chat');
}

/**
 * Extension deactivation
 */
export function deactivate() {
    if (mcpProcess) {
        outputChannel.appendLine('Stopping MCP process...');
        mcpProcess.process.kill();
        mcpProcess = null;
    }

    if (outputChannel) {
        outputChannel.dispose();
    }
}

/**
 * Check if workspace has BCTB settings configured
 */
function hasWorkspaceSettings(): boolean {
    // CRITICAL: Use resource-scoped configuration for the workspace folder
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
    const config = vscode.workspace.getConfiguration('bctb.mcp', folderUri);
    const tenantId = config.get<string>('tenantId');
    const appInsightsId = config.get<string>('applicationInsights.appId');
    const kustoUrl = config.get<string>('kusto.clusterUrl');

    return !!(tenantId && appInsightsId && kustoUrl);
}

/**
 * Check if this is first run and show setup wizard if needed
 */
async function checkAndShowSetupWizard(context: vscode.ExtensionContext): Promise<void> {
    // Check if user has dismissed the wizard before
    const hasSeenWizard = context.globalState.get<boolean>('bctb.hasSeenSetupWizard', false);

    // Check if workspace is configured
    const isConfigured = hasWorkspaceSettings();

    // If not configured and haven't seen wizard, show it
    if (!isConfigured && !hasSeenWizard) {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (workspaceFolders && workspaceFolders.length > 0) {
            outputChannel.appendLine('📋 First run detected - showing setup wizard...');

            // Mark as seen so we don't show it again
            await context.globalState.update('bctb.hasSeenSetupWizard', true);

            // Show wizard after a short delay to let activation complete
            setTimeout(async () => {
                await setupWizard?.show();
            }, 1000);
        }
    } else if (isConfigured) {
        outputChannel.appendLine('✓ Workspace configured');
    } else {
        outputChannel.appendLine('ℹ️  Setup wizard available via Command Palette');
    }
}


/**
 * Get workspace root path
 */
function getWorkspacePath(): string | undefined {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
    return workspaceFolder?.uri.fsPath;
}

/**
 * Handle device code authentication message from MCP
 */
function handleDeviceCodeMessage(message: string): void {
    // Detect device code authentication message pattern
    // Example: "To sign in, use a web browser to open the page https://microsoft.com/devicelogin and enter the code D2YH6WEA3 to authenticate."
    const urlMatch = message.match(/https:\/\/microsoft\.com\/devicelogin/i);
    const codeMatch = message.match(/code\s+([A-Z0-9]{9})/i);

    if (urlMatch && codeMatch) {
        const deviceCode = codeMatch[1];
        const url = 'https://microsoft.com/devicelogin';

        // Copy code to clipboard
        vscode.env.clipboard.writeText(deviceCode).then(() => {
            outputChannel.appendLine(`✓ Device code ${deviceCode} copied to clipboard`);
        });

        // Show notification with button to open browser
        vscode.window.showInformationMessage(
            `Azure Authentication Required: Code ${deviceCode} (copied to clipboard)`,
            'Open Browser'
        ).then(selection => {
            if (selection === 'Open Browser') {
                vscode.env.openExternal(vscode.Uri.parse(url));
            }
        });
    }
}

/**
 * Start MCP server process
 */
async function startMCP(): Promise<void> {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
    const config = vscode.workspace.getConfiguration('bctb', folderUri);

    // IMPORTANT: Use different port for command palette queries vs Copilot Chat
    // - Copilot Chat uses stdio mode (managed by VSCode, port doesn't matter)
    // - Debug MCP Server launch config uses port 52345
    // - Command palette HTTP server uses port 52346 to avoid conflicts
    const configPort = config.get<number>('mcp.port', 52345);
    const port = configPort === 52345 ? 52346 : configPort; // Shift to 52346 for commands

    // Check if MCP is already running (only trust our own tracked process)
    if (mcpProcess && mcpProcess.port === port) {
        outputChannel.appendLine('MCP process already tracked - checking health...');
        const isHealthy = await mcpClient?.healthCheck();
        if (isHealthy) {
            outputChannel.appendLine('✓ MCP server is healthy and running');
            return;
        } else {
            outputChannel.appendLine('⚠️ MCP process exists but health check failed - will restart');
            mcpProcess = null;
        }
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        throw new Error('No workspace folder open');
    }

    outputChannel.appendLine(`Reading configuration from workspace: ${folderUri?.fsPath || 'none'}`);

    // Build environment variables from workspace settings
    const env = buildMCPEnvironment(config, workspacePath);

    // CRITICAL: Force HTTP mode for command palette queries
    // The stdio server (for Copilot) is managed separately by VSCode
    env.BCTB_MODE = 'http';

    // Override port to use the shifted port (52346 instead of 52345)
    env.BCTB_PORT = port.toString();

    outputChannel.appendLine(`Starting MCP server on port ${port} (command palette mode)...`);
    outputChannel.appendLine(`Workspace: ${workspacePath}`);
    outputChannel.appendLine(`Note: Debug MCP Server uses port 52345, command palette uses ${port}`);

    // Find MCP server executable
    // Use launcher.js to force CommonJS module semantics (avoids VSIX .cjs installation issues)
    const mcpServerPath = path.join(extensionContext.extensionPath, 'mcp', 'dist', 'launcher.js');

    // Spawn MCP process
    outputChannel.appendLine(`Spawning: node ${mcpServerPath}`);
    const proc = child_process.spawn('node', [mcpServerPath], {
        env: { ...process.env, ...env },
        cwd: workspacePath
    });

    proc.stdout?.on('data', (data) => {
        const message = data.toString().trim();
        outputChannel.appendLine(`[MCP] ${message}`);

        // Detect device code authentication message
        handleDeviceCodeMessage(message);
    });

    proc.stderr?.on('data', (data) => {
        const errorMsg = data.toString().trim();
        outputChannel.appendLine(errorMsg);

        // Detect EADDRINUSE error
        if (errorMsg.includes('EADDRINUSE') || errorMsg.includes('address already in use')) {
            outputChannel.appendLine('⚠️ Port already in use - server may already be running');
            // Try to connect to existing server
            setTimeout(async () => {
                try {
                    const isHealthy = await mcpClient?.healthCheck();
                    if (isHealthy) {
                        outputChannel.appendLine('✓ Connected to existing MCP server');
                    }
                } catch (err) {
                    outputChannel.appendLine('❌ Could not connect to server on port - may need to restart VSCode');
                }
            }, 1000);
        }
    });

    proc.on('error', (err) => {
        outputChannel.appendLine(`❌ MCP process error: ${err.message}`);
        mcpProcess = null;
    });

    proc.on('close', (code) => {
        outputChannel.appendLine(`MCP process exited with code ${code}`);
        mcpProcess = null;
    });

    mcpProcess = { process: proc, port, workspacePath };

    // Wait for MCP to be ready
    await waitForMCPReady(port);

    // Initialize HTTP client for command palette commands
    mcpClient = new MCPClient(`http://localhost:${port}`, outputChannel);

    outputChannel.appendLine('✓ MCP server started successfully');
    outputChannel.appendLine('✓ Command palette commands now available');
}

/**
 * Build environment variables for MCP from workspace settings
 */
function buildMCPEnvironment(config: vscode.WorkspaceConfiguration, workspacePath: string): Record<string, string> {
    const tenantId = config.get<string>('mcp.tenantId', '');
    const appInsightsId = config.get<string>('mcp.applicationInsights.appId', '');
    const kustoUrl = config.get<string>('mcp.kusto.clusterUrl', '');

    outputChannel.appendLine(`[Config Debug] Reading from config:`);
    outputChannel.appendLine(`  - mcp.tenantId: ${tenantId || '(empty)'}`);
    outputChannel.appendLine(`  - mcp.applicationInsights.appId: ${appInsightsId || '(empty)'}`);
    outputChannel.appendLine(`  - mcp.kusto.clusterUrl: ${kustoUrl || '(empty)'}`);

    const env: Record<string, string> = {
        BCTB_WORKSPACE_PATH: workspacePath,
        BCTB_CONNECTION_NAME: config.get<string>('mcp.connectionName', 'default'),
        BCTB_TENANT_ID: tenantId,
        BCTB_CLIENT_ID: config.get<string>('mcp.clientId', ''),
        BCTB_CLIENT_SECRET: config.get<string>('mcp.clientSecret', ''),
        BCTB_AUTH_FLOW: config.get<string>('mcp.authFlow', 'device_code'),
        // MCP expects BCTB_APP_INSIGHTS_ID (no extra "_APP_")
        BCTB_APP_INSIGHTS_ID: appInsightsId,
        // MCP expects BCTB_KUSTO_URL
        BCTB_KUSTO_URL: kustoUrl,
        BCTB_CACHE_ENABLED: config.get<boolean>('mcp.cache.enabled', true) ? 'true' : 'false',
        // MCP expects BCTB_CACHE_TTL (seconds)
        BCTB_CACHE_TTL: config.get<number>('mcp.cache.ttlSeconds', 3600).toString(),
        BCTB_REMOVE_PII: config.get<boolean>('mcp.sanitize.removePII', false) ? 'true' : 'false',
        BCTB_QUERIES_FOLDER: config.get<string>('queries.folder', 'queries')
    };

    // Add references if configured
    const references = config.get<any[]>('mcp.references', []);
    if (references.length > 0) {
        env.BCTB_REFERENCES = JSON.stringify(references);
    }

    return env;
}

/**
 * Wait for MCP server to be ready
 */
async function waitForMCPReady(port: number, maxAttempts: number = 30): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            if (!mcpClient) {
                throw new Error('MCP client not initialized');
            }

            const response = await mcpClient.healthCheck();
            if (response) {
                return;
            }
        } catch (err) {
            // Not ready yet, wait
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
    }

    throw new Error('MCP server failed to start within timeout period');
}

/**
 * Command: Start MCP
 */
async function startMCPCommand(): Promise<void> {
    try {
        if (!hasWorkspaceSettings()) {
            const result = await vscode.window.showWarningMessage(
                'No BCTB settings found in workspace. Configure settings first?',
                'Open Settings',
                'Cancel'
            );

            if (result === 'Open Settings') {
                await vscode.commands.executeCommand('workbench.action.openWorkspaceSettingsFile');
            }
            return;
        }

        await startMCP();
        vscode.window.showInformationMessage('MCP server started successfully');
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to start MCP: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Run KQL query
 */
async function runKQLQueryCommand(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Check if TelemetryService is initialized
        if (!telemetryService || !telemetryService.isConfigured()) {
            const action = await vscode.window.showErrorMessage(
                'BC Telemetry Buddy is not configured for this workspace.',
                'Run Setup Wizard',
                'Cancel'
            );

            if (action === 'Run Setup Wizard') {
                await vscode.commands.executeCommand('bctb.setupWizard');
            }
            return;
        }

        // Prompt for KQL query
        const kqlQuery = await vscode.window.showInputBox({
            prompt: 'Enter your KQL query',
            placeHolder: 'e.g., traces | where timestamp >= ago(1d) | where customDimensions.eventId == "RT0005" | take 100',
            ignoreFocusOut: true,
            value: '' // Empty default so users can paste
        });

        if (!kqlQuery) {
            return;
        }

        outputChannel.appendLine(`Executing KQL query: ${kqlQuery}`);

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Querying telemetry...',
                cancellable: false
            },
            async () => {
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
                const config = vscode.workspace.getConfiguration('bctb', folderUri);
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await telemetryService!.executeKQL(kqlQuery);

                        // Show results in webview
                        const webview = new ResultsWebview(context, outputChannel);
                        webview.show(result);

                        outputChannel.appendLine('✓ Query executed successfully');
                        return;
                    } catch (err: any) {
                        lastError = err;
                        outputChannel.appendLine(`Attempt ${attempt} failed: ${err.message}`);

                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        }
                    }
                }

                throw lastError || new Error('Query failed after retries');
            }
        );
    } catch (err: any) {
        vscode.window.showErrorMessage(`Query failed: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Run KQL from active document
 */
async function runKQLFromDocumentCommand(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Check if TelemetryService is configured
        if (!telemetryService || !telemetryService.isConfigured()) {
            const action = await vscode.window.showErrorMessage(
                'BC Telemetry Buddy is not configured for this workspace. Please run setup wizard.',
                'Run Setup Wizard'
            );

            if (action === 'Run Setup Wizard') {
                await vscode.commands.executeCommand('bctb.setupWizard');
            }
            return;
        }

        // Get active editor
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('No active text editor. Please open a file containing KQL query.');
            return;
        }

        // Get selection or entire document
        const selection = editor.selection;
        const kqlQuery = selection.isEmpty
            ? editor.document.getText()
            : editor.document.getText(selection);

        if (!kqlQuery.trim()) {
            vscode.window.showWarningMessage('Document or selection is empty. Please select KQL text to execute.');
            return;
        }

        outputChannel.appendLine(`Executing KQL from document: ${editor.document.fileName}`);
        outputChannel.appendLine(`Query: ${kqlQuery.substring(0, 100)}${kqlQuery.length > 100 ? '...' : ''}`);

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Querying telemetry...',
                cancellable: false
            },
            async () => {
                // Use resource-scoped configuration
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
                const config = vscode.workspace.getConfiguration('bctb', folderUri);
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await telemetryService!.executeKQL(kqlQuery);

                        // Show results in webview
                        const webview = new ResultsWebview(context, outputChannel);
                        webview.show(result);

                        outputChannel.appendLine('✓ Query executed successfully');
                        return;
                    } catch (err: any) {
                        lastError = err;
                        outputChannel.appendLine(`Attempt ${attempt} failed: ${err.message}`);

                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        }
                    }
                }

                throw lastError || new Error('Query failed after retries');
            }
        );
    } catch (err: any) {
        vscode.window.showErrorMessage(`Query failed: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Run KQL from CodeLens click
 */
async function runKQLFromCodeLensCommand(
    context: vscode.ExtensionContext,
    uri: vscode.Uri,
    startLine: number,
    endLine: number,
    queryText: string
): Promise<void> {
    try {
        // Check if TelemetryService is configured
        if (!telemetryService || !telemetryService.isConfigured()) {
            const action = await vscode.window.showErrorMessage(
                'BC Telemetry Buddy is not configured for this workspace. Please run setup wizard.',
                'Run Setup Wizard'
            );

            if (action === 'Run Setup Wizard') {
                await vscode.commands.executeCommand('bctb.setupWizard');
            }
            return;
        }

        outputChannel.appendLine(`Executing KQL query from line ${startLine + 1}-${endLine + 1}`);
        outputChannel.appendLine(`Query: ${queryText.substring(0, 100)}${queryText.length > 100 ? '...' : ''}`);

        // Show progress
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Querying telemetry...',
                cancellable: false
            },
            async () => {
                // Use resource-scoped configuration
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
                const config = vscode.workspace.getConfiguration('bctb', folderUri);
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await telemetryService!.executeKQL(queryText);

                        // Show results in webview
                        const webview = new ResultsWebview(context, outputChannel);
                        webview.show(result);

                        outputChannel.appendLine('✓ Query executed successfully');
                        return;
                    } catch (err: any) {
                        lastError = err;
                        outputChannel.appendLine(`Attempt ${attempt} failed: ${err.message}`);

                        if (attempt < maxRetries) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
                        }
                    }
                }

                throw lastError || new Error('Query failed after retries');
            }
        );
    } catch (err: any) {
        vscode.window.showErrorMessage(`Query failed: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Save query
 */
async function saveQueryCommand(): Promise<void> {
    try {
        if (!telemetryService) {
            throw new Error('TelemetryService not initialized');
        }

        // Prompt for query details
        const name = await vscode.window.showInputBox({
            prompt: 'Query name',
            placeHolder: 'e.g., Slow Database Dependencies',
            ignoreFocusOut: true
        });

        if (!name) {
            return;
        }

        const kql = await vscode.window.showInputBox({
            prompt: 'KQL query',
            placeHolder: 'e.g., dependencies | where duration > 2000',
            ignoreFocusOut: true
        });

        if (!kql) {
            return;
        }

        const purpose = await vscode.window.showInputBox({
            prompt: 'Purpose (optional)',
            placeHolder: 'e.g., Find slow database calls',
            ignoreFocusOut: true
        });

        const useCase = await vscode.window.showInputBox({
            prompt: 'Use case (optional)',
            placeHolder: 'e.g., Performance troubleshooting',
            ignoreFocusOut: true
        });

        const tagsInput = await vscode.window.showInputBox({
            prompt: 'Tags (optional, comma-separated)',
            placeHolder: 'e.g., performance, database',
            ignoreFocusOut: true
        });

        const tags = tagsInput ? tagsInput.split(',').map(t => t.trim()) : [];

        // Get existing categories for suggestions
        let categories: string[] = [];
        try {
            const queriesData = await telemetryService.getSavedQueries();
            if (queriesData && Array.isArray(queriesData)) {
                // Extract unique categories from existing queries
                categories = Array.from(new Set(
                    queriesData
                        .map((q: any) => q.category)
                        .filter((c: any) => c)
                ));
            }
        } catch (err) {
            // Categories extraction may fail if no queries exist yet
            console.warn('Failed to fetch categories:', err);
        }

        // Detect if query is customer-specific (filters on tenant or company)
        const lowerKql = kql.toLowerCase();
        const isCustomerQuery = lowerKql.includes('aadtenantid') ||
            lowerKql.includes('companyname') ||
            lowerKql.includes('company_name');

        let companyName: string | undefined;
        if (isCustomerQuery) {
            // Prompt for company name
            companyName = await vscode.window.showInputBox({
                prompt: 'Company name (query filters on customer/tenant)',
                placeHolder: 'e.g., Contoso Ltd, Fabrikam Inc',
                ignoreFocusOut: true
            });

            if (!companyName) {
                return; // Cancel if no company name provided for customer query
            }
        }

        // Prompt for category with suggestions
        const category = await vscode.window.showInputBox({
            prompt: isCustomerQuery ? 'Category (optional, subfolder within company)' : 'Category (optional, subfolder name)',
            placeHolder: categories.length > 0 ? `e.g., ${categories.join(', ')}` : 'e.g., Monitoring, Analysis, Performance',
            ignoreFocusOut: true
        });

        // Save query via TelemetryService
        await telemetryService.saveQuery(name, kql, purpose, useCase, tags, category);

        // Build file path for display (mimic original behavior)
        const workspacePath = getWorkspacePath();
        const queriesFolder = vscode.workspace.getConfiguration('bctb').get<string>('queries.folder', 'queries');
        const categoryPath = category ? category : '';
        const fileName = `${name.replace(/[^a-zA-Z0-9]/g, '_')}.kql`;
        const displayPath = path.join(workspacePath || '', queriesFolder, categoryPath, fileName);

        vscode.window.showInformationMessage(`Query saved: ${displayPath}`);
        outputChannel.appendLine(`✓ Query saved to ${displayPath}`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to save query: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Open queries folder
 */
async function openQueriesFolderCommand(): Promise<void> {
    try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            throw new Error('No workspace folder open');
        }

        // Use resource-scoped configuration
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
        const config = vscode.workspace.getConfiguration('bctb', folderUri);
        const queriesFolder = config.get<string>('queries.folder', 'queries');
        const queriesPath = path.join(workspacePath, queriesFolder);

        // Open folder in explorer
        const uri = vscode.Uri.file(queriesPath);
        await vscode.commands.executeCommand('revealFileInOS', uri);

        outputChannel.appendLine(`Opened queries folder: ${queriesPath}`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open queries folder: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Clear cache
 * Works directly with file system - no server communication needed
 */
async function clearCacheCommand(): Promise<void> {
    try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            throw new Error('No workspace folder open');
        }

        const cachePath = path.join(workspacePath, '.vscode', '.bctb', 'cache');

        // Check if cache directory exists
        if (!fs.existsSync(cachePath)) {
            vscode.window.showInformationMessage('Cache is already empty (cache directory does not exist)');
            outputChannel.appendLine('ℹ️ Cache directory does not exist - nothing to clear');
            return;
        }

        // Delete all .json files in cache directory
        const files = fs.readdirSync(cachePath);
        const cacheFiles = files.filter(f => f.endsWith('.json'));

        if (cacheFiles.length === 0) {
            vscode.window.showInformationMessage('Cache is already empty');
            outputChannel.appendLine('ℹ️ No cache files found');
            return;
        }

        let deletedCount = 0;
        for (const file of cacheFiles) {
            try {
                fs.unlinkSync(path.join(cachePath, file));
                deletedCount++;
            } catch (err) {
                outputChannel.appendLine(`⚠️ Failed to delete ${file}: ${err}`);
            }
        }

        vscode.window.showInformationMessage(`Cache cleared successfully (${deletedCount} entries removed)`);
        outputChannel.appendLine(`✓ Cache cleared: ${deletedCount} entries removed`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to clear cache: ${err.message}`);
        outputChannel.appendLine(`✗ Clear cache error: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Show cache statistics
 * Works directly with file system - no server communication needed
 */
async function showCacheStatsCommand(): Promise<void> {
    try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            throw new Error('No workspace folder open');
        }

        // Use resource-scoped configuration
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const folderUri = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri : undefined;
        const config = vscode.workspace.getConfiguration('bctb', folderUri);
        const ttlSeconds = config.get<number>('mcp.cache.ttl', 3600);
        const cachePath = path.join(workspacePath, '.vscode', '.bctb', 'cache');

        // Check if cache directory exists
        if (!fs.existsSync(cachePath)) {
            const message = `Cache Statistics:\n` +
                `Total Entries: 0\n` +
                `Expired Entries: 0\n` +
                `Total Size: 0.00 KB (0.00 MB)\n` +
                `Cache Path: ${cachePath} (not created yet)`;

            vscode.window.showInformationMessage(message, { modal: true });
            outputChannel.appendLine('ℹ️ Cache directory does not exist yet');
            return;
        }

        // Calculate statistics
        const files = fs.readdirSync(cachePath);
        const cacheFiles = files.filter((f: string) => f.endsWith('.json'));

        let totalEntries = 0;
        let expiredEntries = 0;
        let totalSizeBytes = 0;
        const now = Date.now();

        for (const file of cacheFiles) {
            try {
                const filePath = path.join(cachePath, file);
                const stats = fs.statSync(filePath);
                totalSizeBytes += stats.size;
                totalEntries++;

                // Check if expired
                const fileContent = fs.readFileSync(filePath, 'utf-8');
                const entry = JSON.parse(fileContent);
                const age = (now - entry.timestamp) / 1000; // seconds
                if (age > (entry.ttl || ttlSeconds)) {
                    expiredEntries++;
                }
            } catch (err) {
                outputChannel.appendLine(`⚠️ Failed to process ${file}: ${err}`);
                totalEntries++; // Count it anyway
            }
        }

        const sizeInKB = (totalSizeBytes / 1024).toFixed(2);
        const sizeInMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

        const message = `Cache Statistics:\n` +
            `Total Entries: ${totalEntries}\n` +
            `Expired Entries: ${expiredEntries}\n` +
            `Total Size: ${sizeInKB} KB (${sizeInMB} MB)\n` +
            `Cache Path: ${cachePath}`;

        vscode.window.showInformationMessage(message, { modal: true });
        outputChannel.appendLine(`Cache stats: ${totalEntries} entries, ${expiredEntries} expired, ${sizeInKB} KB`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to get cache statistics: ${err.message}`);
        outputChannel.appendLine(`✗ Cache stats error: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Install BC Telemetry Buddy chatmode
 * Creates .github/chatmodes/BCTelemetryBuddy.chatmode.md in workspace
 */
/**
 * Install multiple chatmodes command
 * Creates .github/chatmodes directory with all available chatmode files
 */
async function installChatmodesCommand(): Promise<void> {
    try {
        const workspacePath = getWorkspacePath();
        if (!workspacePath) {
            throw new Error('No workspace folder open');
        }

        const chatmodeDir = path.join(workspacePath, '.github', 'chatmodes');

        // Create .github/chatmodes directory if it doesn't exist
        if (!fs.existsSync(chatmodeDir)) {
            fs.mkdirSync(chatmodeDir, { recursive: true });
        }

        // Check which chatmodes already exist
        const existingChatmodes: string[] = [];
        const newChatmodes: string[] = [];

        for (const chatmode of CHATMODE_DEFINITIONS) {
            const chatmodePath = path.join(chatmodeDir, chatmode.filename);
            if (fs.existsSync(chatmodePath)) {
                existingChatmodes.push(chatmode.title);
            } else {
                newChatmodes.push(chatmode.title);
            }
        }

        // If all chatmodes already exist, show info message
        if (existingChatmodes.length === CHATMODE_DEFINITIONS.length) {
            const answer = await vscode.window.showInformationMessage(
                `✅ All BC Telemetry Buddy chatmodes are already installed!\n\nLocation: .github/chatmodes/\n\n${existingChatmodes.map(t => `• ${t}`).join('\n')}`,
                'Open Folder', 'OK'
            );
            if (answer === 'Open Folder') {
                const uri = vscode.Uri.file(chatmodeDir);
                await vscode.commands.executeCommand('revealFileInOS', uri);
            }
            return;
        }

        // Install new chatmodes
        let installedCount = 0;
        for (const chatmode of CHATMODE_DEFINITIONS) {
            const chatmodePath = path.join(chatmodeDir, chatmode.filename);
            if (!fs.existsSync(chatmodePath)) {
                fs.writeFileSync(chatmodePath, chatmode.content, 'utf-8');
                installedCount++;
                outputChannel.appendLine(`✓ Installed: ${chatmode.title} → ${chatmode.filename}`);
            }
        }

        // Show summary message
        const summaryLines: string[] = [];
        if (installedCount > 0) {
            summaryLines.push(`✅ Installed ${installedCount} chatmode(s):`);
            newChatmodes.forEach(title => summaryLines.push(`  • ${title}`));
        }
        if (existingChatmodes.length > 0) {
            summaryLines.push(`\n⏭️  Already installed (${existingChatmodes.length}):`);
            existingChatmodes.forEach(title => summaryLines.push(`  • ${title}`));
        }
        summaryLines.push(`\nLocation: .github/chatmodes/`);
        summaryLines.push(`\n💡 Reload VS Code to activate the chatmodes.`);

        const openFolder = await vscode.window.showInformationMessage(
            summaryLines.join('\n'),
            'Open Folder', 'Reload Window', 'OK'
        );

        if (openFolder === 'Open Folder') {
            const uri = vscode.Uri.file(chatmodeDir);
            await vscode.commands.executeCommand('revealFileInOS', uri);
        } else if (openFolder === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }

        outputChannel.appendLine(`✓ Chatmodes installation complete (${installedCount} new, ${existingChatmodes.length} existing)`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to install chatmodes: ${err.message}`);
        outputChannel.appendLine(`✗ Install chatmodes error: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Switch profile
 */
async function switchProfileCommand(): Promise<void> {
    try {
        if (!profileStatusBar) {
            vscode.window.showErrorMessage('Profile manager not initialized');
            return;
        }

        const switched = await profileStatusBar.switchProfile();
        if (switched && telemetryService) {
            // Reload TelemetryService with new profile
            const currentProfile = profileStatusBar.getCurrentProfile();
            if (currentProfile) {
                telemetryService.switchProfile(currentProfile);
                outputChannel.appendLine(`✓ Switched to profile: ${currentProfile}`);
            }
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to switch profile: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Refresh profile status bar
 */
async function refreshProfileStatusBarCommand(): Promise<void> {
    try {
        if (!profileStatusBar) {
            vscode.window.showErrorMessage('Profile status bar not initialized');
            return;
        }

        await profileStatusBar.refresh();
        outputChannel.appendLine('✓ Profile status bar refreshed');
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to refresh profile status bar: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Create new profile
 */
async function createProfileCommand(): Promise<void> {
    try {
        if (!profileWizard) {
            vscode.window.showErrorMessage('Profile wizard not initialized');
            return;
        }

        // Show the wizard panel
        await profileWizard.show();

        outputChannel.appendLine('✓ Profile wizard opened for creating new profile');
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open profile wizard: ${err.message}`);
        outputChannel.show();
    }
}/**
 * Command: Edit existing profile
 */
async function editProfileCommand(): Promise<void> {
    try {
        if (!profileManager || !profileManager.hasConfigFile()) {
            vscode.window.showErrorMessage('No profiles found. Create one first.');
            return;
        }

        const profiles = profileManager.listProfiles();
        const profileNames = profiles.map(p => p.name);

        const selected = await vscode.window.showQuickPick(profileNames, {
            placeHolder: 'Select profile to edit'
        });

        if (!selected) {
            return;
        }

        if (!profileWizard) {
            vscode.window.showErrorMessage('Profile wizard not initialized');
            return;
        }

        // Show wizard with existing profile data
        await profileWizard.show(selected);

        outputChannel.appendLine(`✓ Profile wizard opened for editing profile: ${selected}`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to edit profile: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Delete profile
 */
async function deleteProfileCommand(): Promise<void> {
    try {
        if (!profileManager || !profileManager.hasConfigFile()) {
            vscode.window.showErrorMessage('No profiles found.');
            return;
        }

        const profiles = profileManager.listProfiles();
        const profileNames = profiles.map(p => p.name);

        const selected = await vscode.window.showQuickPick(profileNames, {
            placeHolder: 'Select profile to delete'
        });

        if (!selected) {
            return;
        }

        const confirm = await vscode.window.showWarningMessage(
            `Delete profile "${selected}"? This cannot be undone.`,
            { modal: true },
            'Delete'
        );

        if (confirm !== 'Delete') {
            return;
        }

        await profileManager.deleteProfile(selected);

        vscode.window.showInformationMessage(`Profile "${selected}" deleted successfully`);
        outputChannel.appendLine(`✓ Profile deleted: ${selected}`);

        // Refresh status bar
        await refreshProfileStatusBarCommand();
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to delete profile: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Set default profile
 */
async function setDefaultProfileCommand(): Promise<void> {
    try {
        if (!profileManager || !profileManager.hasConfigFile()) {
            vscode.window.showErrorMessage('No profiles found.');
            return;
        }

        const profiles = profileManager.listProfiles();
        const profileNames = profiles.map(p => p.name);
        const currentDefault = profileManager.getDefaultProfile();

        const items = profileNames.map(name => ({
            label: name,
            description: name === currentDefault ? '(current default)' : undefined
        }));

        const selected = await vscode.window.showQuickPick(items, {
            placeHolder: 'Select default profile'
        });

        if (!selected) {
            return;
        }

        await profileManager.setDefaultProfile(selected.label);

        vscode.window.showInformationMessage(`Default profile set to "${selected.label}"`);
        outputChannel.appendLine(`✓ Default profile set to: ${selected.label}`);

        // Refresh status bar
        await refreshProfileStatusBarCommand();
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to set default profile: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Manage profiles (show quick pick with all profile operations)
 */
async function manageProfilesCommand(): Promise<void> {
    try {
        const actions = [
            { label: '$(add) Create New Profile', command: 'bctb.createProfile' },
            { label: '$(edit) Edit Profile', command: 'bctb.editProfile' },
            { label: '$(arrow-swap) Switch Profile', command: 'bctb.switchProfile' },
            { label: '$(star) Set Default Profile', command: 'bctb.setDefaultProfile' },
            { label: '$(trash) Delete Profile', command: 'bctb.deleteProfile' }
        ];

        const selected = await vscode.window.showQuickPick(actions, {
            placeHolder: 'Select profile management action'
        });

        if (selected) {
            await vscode.commands.executeCommand(selected.command);
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Profile management failed: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * CodeLens provider for KQL files
 * Shows "▶ Run Query" link above each query
 */
class KQLCodeLensProvider implements vscode.CodeLensProvider {
    private context: vscode.ExtensionContext;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        outputChannel.appendLine(`[CodeLens] provideCodeLenses called for: ${document.fileName}`);
        outputChannel.appendLine(`[CodeLens] Language ID: ${document.languageId}`);

        // Only provide CodeLenses for .kql files
        if (document.languageId !== 'kql' && !document.fileName.endsWith('.kql')) {
            outputChannel.appendLine(`[CodeLens] Skipping - not a KQL file (languageId: ${document.languageId})`);
            return [];
        }

        const codeLenses: vscode.CodeLens[] = [];
        const text = document.getText();
        const lines = text.split('\n'); let queryStartLine = -1;
        let inQuery = false;

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines and comments
            if (line.length === 0 || line.startsWith('//')) {
                continue;
            }

            // If we're not in a query and this line has content, it's the start of a query
            if (!inQuery && line.length > 0) {
                queryStartLine = i;
                inQuery = true;
            }

            // Check if this line ends a query (contains semicolon or is the last line with content)
            const isQueryEnd = line.includes(';') || (i === lines.length - 1 && inQuery);

            if (inQuery && isQueryEnd) {
                // Create a CodeLens at the start of the query
                const range = new vscode.Range(queryStartLine, 0, queryStartLine, 0);

                // Extract the query text from queryStartLine to current line
                const queryText = lines.slice(queryStartLine, i + 1).join('\n').trim();

                const codeLens = new vscode.CodeLens(range, {
                    title: '▶ Run Query',
                    command: 'bctb.runKQLFromCodeLens',
                    arguments: [document.uri, queryStartLine, i, queryText]
                });

                codeLenses.push(codeLens);

                // Reset for next query
                inQuery = false;
                queryStartLine = -1;
            }
        }

        // If still in a query at the end (no semicolon), add CodeLens for the whole remaining query
        if (inQuery && queryStartLine >= 0) {
            const range = new vscode.Range(queryStartLine, 0, queryStartLine, 0);
            const queryText = lines.slice(queryStartLine).join('\n').trim();

            const codeLens = new vscode.CodeLens(range, {
                title: '▶ Run Query',
                command: 'bctb.runKQLFromCodeLens',
                arguments: [document.uri, queryStartLine, lines.length - 1, queryText]
            });

            codeLenses.push(codeLens);
        }

        outputChannel.appendLine(`[CodeLens] Returning ${codeLenses.length} CodeLens items`);
        return codeLenses;
    }
}
