import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as child_process from 'child_process';
import { MCPClient } from './mcpClient';
import { ResultsWebview } from './resultsWebview';
import { SetupWizardProvider } from './webviews/SetupWizardProvider';
import { ProfileWizardProvider } from './webviews/ProfileWizardProvider';
import { ReleaseNotesProvider } from './webviews/ReleaseNotesProvider';
import { registerChatParticipant } from './chatParticipant';
import { CHATMODE_DEFINITIONS } from './chatmodeDefinitions';
import { TelemetryService } from './services/telemetryService';
import { MigrationService } from './services/migrationService';
import { ProfileStatusBar } from './ui/profileStatusBar';
import { ProfileManager } from './services/profileManager';
import { showFirstRunNotification, startPeriodicUpdateChecks, checkForMCPUpdates } from './services/mcpInstaller';
import { VSCodeAuthService } from './services/vscodeAuthService';
import {
    VSCodeUsageTelemetry,
    TelemetryLevelFilter,
    getVSCodeTelemetryLevel,
    getInstallationId,
    resetInstallationId
} from './services/extensionTelemetry';
import { IUsageTelemetry, NoOpUsageTelemetry, RateLimitedUsageTelemetry, TELEMETRY_CONNECTION_STRING, TELEMETRY_EVENTS, createCommonProperties, cleanTelemetryProperties, hashValue } from '@bctb/shared';

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
let usageTelemetry: IUsageTelemetry | null = null; // Usage telemetry (tracks extension usage)
let migrationService: MigrationService | null = null;
let profileStatusBar: ProfileStatusBar | null = null;
let profileManager: ProfileManager | null = null;
let profileWizard: ProfileWizardProvider | null = null;
let outputChannel: vscode.OutputChannel;
let setupWizard: SetupWizardProvider | null = null;
let extensionContext: vscode.ExtensionContext;
let vscodeAuthService: VSCodeAuthService | null = null;

// Common telemetry properties (set once during activation)
let sessionId: string;
let installationId: string;
let extensionVersion: string;
let currentProfileHash: string = 'default'; // Hash of current profile name

/**
 * Get current profile hash for telemetry
 */
function getCurrentProfileHash(): string {
    try {
        const profileName = profileManager?.getCurrentProfile() || 'default';
        return hashValue(String(profileName)).substring(0, 16);
    } catch {
        return 'default';
    }
}

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
 * Check if extension was updated and show release notes
 * Only shows release notes when MAJOR version changes (X.0.0)
 */
async function checkAndShowReleaseNotes(context: vscode.ExtensionContext): Promise<void> {
    try {
        const currentVersion = context.extension.packageJSON.version;
        const lastVersion = context.globalState.get<string>('bctb.lastVersion');

        if (lastVersion && lastVersion !== currentVersion) {
            // Version changed - check if MAJOR version changed
            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion.split('.')[0], 10);

            if (currentMajor > lastMajor) {
                // MAJOR version changed - show release notes
                outputChannel.appendLine(`MAJOR version updated from ${lastVersion} to ${currentVersion} - showing release notes`);
                const workspaceFolders = vscode.workspace.workspaceFolders;
                const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
                ReleaseNotesProvider.createOrShow(context.extensionUri, hasWorkspace);
            } else {
                // Minor or patch update - just log
                outputChannel.appendLine(`Version updated from ${lastVersion} to ${currentVersion} (no release notes for non-major updates)`);
            }
        }

        // Update stored version
        await context.globalState.update('bctb.lastVersion', currentVersion);
    } catch (error: any) {
        outputChannel.appendLine(`Failed to check version: ${error.message}`);
    }
}

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel('BC Telemetry Buddy');
    outputChannel.appendLine('BC Telemetry Buddy extension activated');

    // Get installation ID early (also triggers migration cleanup of legacy workspace files)
    installationId = getInstallationId(context);

    // Initialize Usage Telemetry (tracks extension usage, respects VS Code telemetry settings)
    sessionId = require('crypto').randomUUID(); // Generate session ID once per activation
    try {
        // Use VS Code API to get package.json (works in both dev and bundled scenarios)
        const packageJson = context.extension.packageJSON;
        const extensionId = packageJson.publisher + '.' + packageJson.name;
        extensionVersion = packageJson.version;
        const connectionString = TELEMETRY_CONNECTION_STRING;

        if (connectionString && getVSCodeTelemetryLevel() !== 'off') {
            // Create telemetry stack: VSCode wrapper -> Rate limiter -> Level filter
            const vscodeReporter = new VSCodeUsageTelemetry(extensionId, extensionVersion, connectionString);
            const rateLimited = new RateLimitedUsageTelemetry(vscodeReporter, {
                maxIdenticalErrors: 10,
                maxEventsPerSession: 1000,
                maxEventsPerMinute: 100
            });
            const levelFiltered = new TelemetryLevelFilter(rateLimited, getVSCodeTelemetryLevel);
            usageTelemetry = levelFiltered;

            // Track extension activation with common properties
            currentProfileHash = getCurrentProfileHash();
            const activationProps = createCommonProperties(
                TELEMETRY_EVENTS.EXTENSION.ACTIVATED,
                'extension',
                sessionId,
                installationId,
                extensionVersion,
                { profileHash: currentProfileHash }
            );
            usageTelemetry.trackEvent('Extension.Activated', {
                ...activationProps,
                vscodeVersion: vscode.version,
                os: process.platform,
                nodeVersion: process.version
            }); outputChannel.appendLine('✓ Usage Telemetry initialized (respects VS Code telemetry level)');
        } else {
            usageTelemetry = new NoOpUsageTelemetry();
            outputChannel.appendLine('ℹ️  Usage Telemetry disabled (no connection string or telemetry off)');
        }
    } catch (error: any) {
        outputChannel.appendLine(`⚠️  Usage Telemetry initialization failed: ${error.message}`);
        usageTelemetry = new NoOpUsageTelemetry();
    }

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

    // Initialize VS Code authentication service
    try {
        vscodeAuthService = new VSCodeAuthService(outputChannel);
        outputChannel.appendLine('✓ VSCodeAuthService initialized');
    } catch (error: any) {
        outputChannel.appendLine(`⚠️  VSCodeAuthService initialization failed: ${error.message}`);
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
    setupWizard = new SetupWizardProvider(context.extensionUri, outputChannel);

    // Initialize profile wizard
    profileWizard = new ProfileWizardProvider(context.extensionUri, outputChannel);
    outputChannel.appendLine('✓ ProfileWizardProvider initialized');

    // Initialize migration service
    migrationService = new MigrationService(outputChannel);

    // Check for version update and show release notes
    setTimeout(async () => {
        await checkAndShowReleaseNotes(context);
    }, 1000);

    // Check for migration on first launch (after short delay to let activation complete)
    setTimeout(async () => {
        await migrationService?.showMigrationNotification(context);
    }, 3000);

    // Show MCP first-run notification if not installed (after migration check)
    setTimeout(async () => {
        await showFirstRunNotification(context);
    }, 5000);

    // Start periodic MCP update checks
    context.subscriptions.push(
        startPeriodicUpdateChecks(context)
    );

    /**
     * Telemetry wrapper for commands - tracks invocation, duration, success/failure
     */
    function withCommandTelemetry<T extends any[]>(
        commandName: string,
        handler: (...args: T) => Promise<void> | void
    ): (...args: T) => Promise<void> {
        return async (...args: T) => {
            const startTime = Date.now();

            try {
                await handler(...args);

                // Track successful completion
                const durationMs = Date.now() - startTime;
                const completedProps = createCommonProperties(
                    TELEMETRY_EVENTS.EXTENSION.COMMAND_COMPLETED,
                    'extension',
                    sessionId,
                    installationId,
                    extensionVersion,
                    {
                        commandName,
                        profileHash: getCurrentProfileHash()
                    }
                );
                usageTelemetry?.trackEvent('Extension.CommandCompleted', cleanTelemetryProperties(completedProps), { duration: durationMs });
            } catch (error: any) {
                // Track failed completion
                const durationMs = Date.now() - startTime;
                const errorType = error?.constructor?.name || 'UnknownError';
                const failedProps = createCommonProperties(
                    TELEMETRY_EVENTS.EXTENSION.COMMAND_FAILED,
                    'extension',
                    sessionId,
                    installationId,
                    extensionVersion,
                    {
                        commandName,
                        profileHash: getCurrentProfileHash(),
                        errorType
                    }
                );
                usageTelemetry?.trackEvent('Extension.CommandFailed', cleanTelemetryProperties(failedProps), { duration: durationMs });

                // Also track exception with full context
                const exceptionProps = createCommonProperties(
                    TELEMETRY_EVENTS.EXTENSION.ERROR,
                    'extension',
                    sessionId,
                    installationId,
                    extensionVersion,
                    {
                        commandName,
                        profileHash: getCurrentProfileHash(),
                        errorType,
                        operation: 'command'
                    }
                );
                if (error instanceof Error) {
                    usageTelemetry?.trackException(error, cleanTelemetryProperties(exceptionProps) as Record<string, string>);
                }

                throw error;
            }
        };
    }

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bctb.setupWizard', withCommandTelemetry('setupWizard', async () => {
            await setupWizard?.show();
        })),
        vscode.commands.registerCommand('bctb.migrateSettings', withCommandTelemetry('migrateSettings', async () => {
            if (!migrationService) {
                vscode.window.showErrorMessage('Migration service not initialized');
                return;
            }

            // Just migrate directly
            await migrationService.migrate(context);
        })),
        vscode.commands.registerCommand('bctb.resetMigrationState', withCommandTelemetry('resetMigrationState', async () => {
            await context.globalState.update('bctb.migrationCompleted', undefined);
            await context.globalState.update('bctb.migrationDismissed', undefined);
            vscode.window.showInformationMessage('Migration state reset. Reload window to see notification again.');
        })),
        vscode.commands.registerCommand('bctb.showReleaseNotes', withCommandTelemetry('showReleaseNotes', () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            const hasWorkspace = workspaceFolders && workspaceFolders.length > 0;
            ReleaseNotesProvider.createOrShow(context.extensionUri, hasWorkspace);
        })),
        vscode.commands.registerCommand('bctb.startMCP', withCommandTelemetry('startMCP', () => startMCPCommand())),
        vscode.commands.registerCommand('bctb.runKQLQuery', withCommandTelemetry('runKQLQuery', () => runKQLQueryCommand(context))),
        vscode.commands.registerCommand('bctb.runKQLFromDocument', withCommandTelemetry('runKQLFromDocument', () => runKQLFromDocumentCommand(context))),
        vscode.commands.registerCommand('bctb.runKQLFromCodeLens', withCommandTelemetry('runKQLFromCodeLens', (uri: vscode.Uri, startLine: number, endLine: number, queryText: string) =>
            runKQLFromCodeLensCommand(context, uri, startLine, endLine, queryText)
        )),
        vscode.commands.registerCommand('bctb.clearCache', withCommandTelemetry('clearCache', () => clearCacheCommand())),
        vscode.commands.registerCommand('bctb.showCacheStats', withCommandTelemetry('showCacheStats', () => showCacheStatsCommand())),
        vscode.commands.registerCommand('bctb.installChatmodes', withCommandTelemetry('installChatmodes', () => installChatmodesCommand())),
        vscode.commands.registerCommand('bctb.switchProfile', withCommandTelemetry('switchProfile', () => switchProfileCommand())),
        vscode.commands.registerCommand('bctb.refreshProfileStatusBar', withCommandTelemetry('refreshProfileStatusBar', () => refreshProfileStatusBarCommand())),
        vscode.commands.registerCommand('bctb.createProfile', withCommandTelemetry('createProfile', () => createProfileCommand())),
        vscode.commands.registerCommand('bctb.setDefaultProfile', withCommandTelemetry('setDefaultProfile', () => setDefaultProfileCommand())),
        vscode.commands.registerCommand('bctb.manageProfiles', withCommandTelemetry('manageProfiles', () => manageProfilesCommand())),
        vscode.commands.registerCommand('bctb.checkForMCPUpdates', withCommandTelemetry('checkForMCPUpdates', () => checkForMCPUpdates(context, false))),
        vscode.commands.registerCommand('bctb.resetTelemetryId', withCommandTelemetry('resetTelemetryId', () => resetTelemetryIdCommand(context)))
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
            const preferGlobal = mcpConfig.get<boolean>('preferGlobal', false); // Default to bundled in development
            // Bundled MCP: Use the MCP server bundled with the extension (mcp/dist/launcher.js)
            // Global MCP: Use globally installed bctb-mcp command from npm (DEFAULT)
            //
            // The extension can optionally bundle MCP files as fallback (vscode:prepublish runs copy-mcp)
            // But we prefer the globally installed version to stay independent
            const mcpBundledPath = path.join(context.extensionPath, 'mcp', 'dist', 'launcher.js');
            const useBundled = !preferGlobal && fs.existsSync(mcpBundledPath);

            // Prepare environment variables for MCP server
            // Pass workspace path so MCP can find .bctb-config.json
            // Always use the active workspace (where user is working)
            const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';

            const mcpEnv: Record<string, string> = {};
            if (workspacePath) {
                mcpEnv.BCTB_WORKSPACE_PATH = workspacePath;
            }

            if (useBundled) {
                // Bundled: Use MCP server bundled with the extension (fallback mode)
                outputChannel.appendLine(`📦 Using bundled MCP server at ${mcpBundledPath}`);
                return [{
                    id: 'bctb',
                    label: 'BC Telemetry Buddy',
                    description: 'Query Business Central telemetry data using KQL',
                    command: 'node',
                    args: [mcpBundledPath],
                    env: mcpEnv
                }];
            } else {
                // Global: Use globally installed bctb-mcp command (DEFAULT)
                outputChannel.appendLine(preferGlobal
                    ? '🌍 Using globally installed bctb-mcp (default)'
                    : '🌍 PreferGlobal enabled: Using globally installed bctb-mcp');
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
    // Flush usage telemetry before shutdown
    if (usageTelemetry) {
        outputChannel.appendLine('Flushing usage telemetry...');
        usageTelemetry.flush().catch((err: any) => {
            outputChannel.appendLine(`⚠️  Failed to flush usage telemetry: ${err.message}`);
        });
    }

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
    const env = await buildMCPEnvironment(config, workspacePath);

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
async function buildMCPEnvironment(config: vscode.WorkspaceConfiguration, workspacePath: string): Promise<Record<string, string>> {
    const tenantId = config.get<string>('mcp.tenantId', '');
    const appInsightsId = config.get<string>('mcp.applicationInsights.appId', '');
    const kustoUrl = config.get<string>('mcp.kusto.clusterUrl', '');
    const authFlow = config.get<string>('mcp.authFlow', 'device_code');

    outputChannel.appendLine(`[Config Debug] Reading from config:`);
    outputChannel.appendLine(`  - mcp.tenantId: ${tenantId || '(empty)'}`);
    outputChannel.appendLine(`  - mcp.applicationInsights.appId: ${appInsightsId || '(empty)'}`);
    outputChannel.appendLine(`  - mcp.kusto.clusterUrl: ${kustoUrl || '(empty)'}`);
    outputChannel.appendLine(`  - mcp.authFlow: ${authFlow}`);

    const env: Record<string, string> = {
        BCTB_WORKSPACE_PATH: workspacePath,
        BCTB_CONNECTION_NAME: config.get<string>('mcp.connectionName', 'default'),
        BCTB_TENANT_ID: tenantId,
        BCTB_CLIENT_ID: config.get<string>('mcp.clientId', ''),
        BCTB_CLIENT_SECRET: config.get<string>('mcp.clientSecret', ''),
        BCTB_AUTH_FLOW: authFlow,
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

    // If using VS Code authentication, get and pass access token
    if (authFlow === 'vscode_auth') {
        if (!vscodeAuthService) {
            const error = 'VS Code authentication service not initialized. Please reload VS Code.';
            outputChannel.appendLine(`[VSCodeAuth] ❌ ${error}`);
            throw new Error(error);
        }

        try {
            outputChannel.appendLine('[VSCodeAuth] Getting access token for MCP...');
            const accessToken = await vscodeAuthService.getAccessToken(true);
            if (accessToken) {
                env.BCTB_ACCESS_TOKEN = accessToken;
                outputChannel.appendLine('[VSCodeAuth] ✓ Access token provided to MCP');
            } else {
                const error = 'Failed to get VS Code authentication token. Please sign in to VS Code (check Accounts menu in bottom-left).';
                outputChannel.appendLine(`[VSCodeAuth] ❌ ${error}`);
                throw new Error(error);
            }
        } catch (error: any) {
            outputChannel.appendLine(`[VSCodeAuth] ❌ Failed to get access token: ${error.message}`);
            throw error;
        }
    }

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
 * Command: Open queries folder
 */

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
 * Command: Reset Telemetry ID (GDPR right to reset pseudonymous identifier)
 * Generates a new installation ID to disassociate future telemetry from past sessions
 */
async function resetTelemetryIdCommand(context: vscode.ExtensionContext): Promise<void> {
    try {
        const result = await vscode.window.showWarningMessage(
            'Reset Telemetry ID?\n\nThis will generate a new anonymous identifier for telemetry tracking. ' +
            'Your past usage data will not be deleted but future data will not be linked to your previous sessions.',
            { modal: true },
            'Reset ID',
            'Cancel'
        );

        if (result !== 'Reset ID') {
            return;
        }

        resetInstallationId(context);

        // Update module-level installationId variable to pick up new ID
        installationId = getInstallationId(context);

        if (usageTelemetry) {
            const resetProps = createCommonProperties(
                TELEMETRY_EVENTS.EXTENSION.TELEMETRY_ID_RESET,
                'extension',
                sessionId,
                installationId,
                extensionVersion,
                {
                    profileHash: getCurrentProfileHash(),
                    newInstallationId: installationId
                }
            );
            usageTelemetry.trackEvent('Telemetry.IdReset', cleanTelemetryProperties(resetProps));
        }

        vscode.window.showInformationMessage('Telemetry ID reset successfully. New anonymous ID generated.');
        outputChannel.appendLine('✓ Telemetry ID reset - new installation ID generated');
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to reset telemetry ID: ${err.message}`);
        outputChannel.appendLine(`✗ Reset telemetry ID error: ${err.message}`);
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
            { label: '$(arrow-swap) Switch Profile', command: 'bctb.switchProfile' },
            { label: '$(star) Set Default Profile', command: 'bctb.setDefaultProfile' }
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
