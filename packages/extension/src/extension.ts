import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import { MCPClient } from './mcpClient';
import { ResultsWebview } from './resultsWebview';

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
let outputChannel: vscode.OutputChannel;

/**
 * Register MCP server definition provider with VSCode
 * This makes the MCP server discoverable globally in VSCode's MCP settings
 */
function registerMCPServerDefinitionProvider(context: vscode.ExtensionContext): void {
    outputChannel.appendLine('Registering MCP server definition provider...');

    const provider: vscode.McpServerDefinitionProvider<vscode.McpStdioServerDefinition> = {
        provideMcpServerDefinitions(token: vscode.CancellationToken): vscode.ProviderResult<vscode.McpStdioServerDefinition[]> {
            const workspacePath = getWorkspacePath();
            if (!workspacePath) {
                outputChannel.appendLine('⚠ No workspace folder - MCP server not available');
                return [];
            }

            const config = vscode.workspace.getConfiguration('bctb');
            const mcpScriptPath = path.join(context.extensionPath, '..', 'mcp', 'dist', 'server.js');

            // Build environment variables from workspace settings
            const env = buildMCPEnvironment(config, workspacePath);

            const serverDefinition = new vscode.McpStdioServerDefinition(
                'BC Telemetry Buddy',
                'node',
                [mcpScriptPath],
                env,
                '0.1.0'
            );

            outputChannel.appendLine(`✓ Providing MCP server definition: node ${mcpScriptPath}`);
            return [serverDefinition];
        },

        resolveMcpServerDefinition(
            server: vscode.McpStdioServerDefinition,
            token: vscode.CancellationToken
        ): vscode.ProviderResult<vscode.McpStdioServerDefinition> {
            outputChannel.appendLine(`Resolving MCP server definition: ${server.label}`);
            // Can add authentication or validation here if needed
            return server;
        }
    };

    const disposable = vscode.lm.registerMcpServerDefinitionProvider(
        'bc-telemetry-buddy.mcp-server',
        provider
    );

    context.subscriptions.push(disposable);
    outputChannel.appendLine('✓ MCP server definition provider registered');
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
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    outputChannel = vscode.window.createOutputChannel('BC Telemetry Buddy');
    outputChannel.appendLine('BC Telemetry Buddy extension activated');

    // Initialize MCP client
    const config = vscode.workspace.getConfiguration('bctb');
    const mcpUrl = config.get<string>('mcp.url', 'http://localhost:52345');
    mcpClient = new MCPClient(mcpUrl, outputChannel);

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('bctb.startMCP', () => startMCPCommand()),
        vscode.commands.registerCommand('bctb.runKQLQuery', () => runKQLQueryCommand(context)),
        vscode.commands.registerCommand('bctb.runKQLFromDocument', () => runKQLFromDocumentCommand(context)),
        vscode.commands.registerCommand('bctb.runKQLFromCodeLens', (uri: vscode.Uri, startLine: number, endLine: number, queryText: string) =>
            runKQLFromCodeLensCommand(context, uri, startLine, endLine, queryText)
        ),
        vscode.commands.registerCommand('bctb.saveQuery', () => saveQueryCommand()),
        vscode.commands.registerCommand('bctb.openQueriesFolder', () => openQueriesFolderCommand()),
        vscode.commands.registerCommand('bctb.clearCache', () => clearCacheCommand()),
        vscode.commands.registerCommand('bctb.cleanupCache', () => cleanupCacheCommand()),
        vscode.commands.registerCommand('bctb.showCacheStats', () => showCacheStatsCommand())
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

    // Register MCP server definition provider (makes server globally available in VSCode)
    registerMCPServerDefinitionProvider(context);

    // Register MCP tools with VSCode's language model API (for direct tool invocation)
    registerLanguageModelTools(context);

    // Don't auto-start HTTP server - VSCode MCP infrastructure (stdio mode) handles Copilot integration
    // Command palette commands will show error if HTTP server not manually started via "Start MCP Server" command

    outputChannel.appendLine('Extension ready');
    outputChannel.appendLine('');
    outputChannel.appendLine('ℹ️  For Copilot integration: MCP server automatically managed by VSCode');
    outputChannel.appendLine('ℹ️  For Command Palette commands: Run "BC Telemetry Buddy: Start MCP Server" if needed');
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
    const config = vscode.workspace.getConfiguration('bctb');
    const tenantId = config.get<string>('mcp.tenantId');
    const appId = config.get<string>('mcp.applicationInsights.appId');

    return !!(tenantId && appId);
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
    if (mcpProcess) {
        outputChannel.appendLine('MCP already running');
        return;
    }

    const workspacePath = getWorkspacePath();
    if (!workspacePath) {
        throw new Error('No workspace folder open');
    }

    const config = vscode.workspace.getConfiguration('bctb');
    const port = config.get<number>('mcp.port', 52345);

    // Build environment variables from workspace settings
    const env = buildMCPEnvironment(config, workspacePath);

    outputChannel.appendLine(`Starting MCP server on port ${port}...`);
    outputChannel.appendLine(`Workspace: ${workspacePath}`);

    // Find MCP server executable
    const mcpServerPath = path.join(__dirname, '..', '..', 'mcp', 'dist', 'server.js');

    // Spawn MCP process
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
        // MCP server already prefixes stderr output with [MCP] or [MCP] ERROR:
        // so just pass it through without adding another prefix
        outputChannel.appendLine(data.toString().trim());
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
    const env: Record<string, string> = {
        BCTB_WORKSPACE_PATH: workspacePath,
        BCTB_CONNECTION_NAME: config.get<string>('mcp.connectionName', 'default'),
        BCTB_TENANT_ID: config.get<string>('mcp.tenantId', ''),
        BCTB_CLIENT_ID: config.get<string>('mcp.clientId', ''),
        BCTB_CLIENT_SECRET: config.get<string>('mcp.clientSecret', ''),
        BCTB_AUTH_FLOW: config.get<string>('mcp.authFlow', 'device_code'),
        // MCP expects BCTB_APP_INSIGHTS_ID (no extra "_APP_")
        BCTB_APP_INSIGHTS_ID: config.get<string>('mcp.applicationInsights.appId', ''),
        // MCP expects BCTB_KUSTO_URL
        BCTB_KUSTO_URL: config.get<string>('mcp.kusto.clusterUrl', ''),
        BCTB_CACHE_ENABLED: config.get<boolean>('mcp.cache.enabled', true) ? 'true' : 'false',
        // MCP expects BCTB_CACHE_TTL (seconds)
        BCTB_CACHE_TTL: config.get<number>('mcp.cache.ttlSeconds', 3600).toString(),
        BCTB_REMOVE_PII: config.get<boolean>('mcp.sanitize.removePII', false) ? 'true' : 'false',
        BCTB_PORT: config.get<number>('mcp.port', 52345).toString(),
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
 * Command: Run natural language query
 */
async function runKQLQueryCommand(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Ensure MCP is running
        if (!mcpProcess) {
            await startMCP();
        }

        if (!mcpClient) {
            throw new Error('MCP client not initialized');
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
                const config = vscode.workspace.getConfiguration('bctb');
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await mcpClient!.queryTelemetry({
                            query: kqlQuery,
                            queryType: 'kql',
                            useContext: false,
                            includeExternal: false
                        });

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
        // Ensure MCP is running
        if (!mcpProcess) {
            await startMCP();
        }

        if (!mcpClient) {
            throw new Error('MCP client not initialized');
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
                const config = vscode.workspace.getConfiguration('bctb');
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await mcpClient!.queryTelemetry({
                            query: kqlQuery,
                            queryType: 'kql',
                            useContext: false,
                            includeExternal: false
                        });

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
        // Ensure MCP is running
        if (!mcpProcess) {
            await startMCP();
        }

        if (!mcpClient) {
            throw new Error('MCP client not initialized');
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
                const config = vscode.workspace.getConfiguration('bctb');
                const maxRetries = config.get<number>('agent.maxRetries', 3);

                let lastError: Error | null = null;

                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        outputChannel.appendLine(`Attempt ${attempt}/${maxRetries}...`);

                        const result = await mcpClient!.queryTelemetry({
                            query: queryText,
                            queryType: 'kql',
                            useContext: false,
                            includeExternal: false
                        });

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
        if (!mcpClient) {
            throw new Error('MCP client not initialized');
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
            const response = await mcpClient.request('get_categories', {});
            categories = response?.result || [];
        } catch (err) {
            // Categories endpoint may not be available in older versions
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

        // Save query via MCP
        const result = await mcpClient.saveQuery({ name, kql, purpose, useCase, tags, category, companyName });

        vscode.window.showInformationMessage(`Query saved: ${result.filePath}`);
        outputChannel.appendLine(`✓ Query saved to ${result.filePath}`);
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

        const config = vscode.workspace.getConfiguration('bctb');
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
 */
async function clearCacheCommand(): Promise<void> {
    try {
        if (!mcpClient) {
            vscode.window.showErrorMessage('MCP server is not running. Please start it first using "BC Telemetry Buddy: Start MCP Server"');
            return;
        }

        const response = await mcpClient.request('clear_cache', {});

        if (response?.result?.success) {
            vscode.window.showInformationMessage(`Cache cleared successfully`);
            outputChannel.appendLine('✓ Cache cleared');
        } else {
            throw new Error(response?.result?.message || response?.error || 'Failed to clear cache');
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to clear cache: ${err.message}`);
        outputChannel.appendLine(`✗ Clear cache error: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Cleanup expired cache entries
 */
async function cleanupCacheCommand(): Promise<void> {
    try {
        if (!mcpClient) {
            vscode.window.showErrorMessage('MCP server is not running. Please start it first using "BC Telemetry Buddy: Start MCP Server"');
            return;
        }

        const response = await mcpClient.request('cleanup_cache', {});

        if (response?.result?.success) {
            const stats = response.result.stats || {};
            const remainingEntries = stats.remainingEntries || 0;
            vscode.window.showInformationMessage(`Expired cache entries cleaned up. ${remainingEntries} entries remaining.`);
            outputChannel.appendLine(`✓ Cache cleanup complete: ${remainingEntries} entries remaining`);
        } else {
            throw new Error(response?.result?.message || response?.error || 'Failed to cleanup cache');
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to cleanup cache: ${err.message}`);
        outputChannel.appendLine(`✗ Cache cleanup error: ${err.message}`);
        outputChannel.show();
    }
}

/**
 * Command: Show cache statistics
 */
async function showCacheStatsCommand(): Promise<void> {
    try {
        if (!mcpClient) {
            vscode.window.showErrorMessage('MCP server is not running. Please start it first using "BC Telemetry Buddy: Start MCP Server"');
            return;
        }

        const response = await mcpClient.request('get_cache_stats', {});

        if (response?.result) {
            const result = response.result;
            const totalEntries = result.totalEntries || 0;
            const expiredEntries = result.expiredEntries || 0;
            const totalSizeBytes = result.totalSizeBytes || 0;
            const cachePath = result.cachePath || 'unknown';

            const sizeInKB = (totalSizeBytes / 1024).toFixed(2);
            const sizeInMB = (totalSizeBytes / (1024 * 1024)).toFixed(2);

            const message = `Cache Statistics:\n` +
                `Total Entries: ${totalEntries}\n` +
                `Expired Entries: ${expiredEntries}\n` +
                `Total Size: ${sizeInKB} KB (${sizeInMB} MB)\n` +
                `Cache Path: ${cachePath}`;

            vscode.window.showInformationMessage(message, { modal: true });
            outputChannel.appendLine(`Cache stats: ${totalEntries} entries, ${expiredEntries} expired, ${sizeInKB} KB`);
        } else {
            throw new Error(response?.error || 'No cache statistics returned');
        }
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to get cache statistics: ${err.message}`);
        outputChannel.appendLine(`✗ Cache stats error: ${err.message}`);
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
        // Only provide CodeLenses for .kql files
        if (document.languageId !== 'kql' && !document.fileName.endsWith('.kql')) {
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

        return codeLenses;
    }
}
