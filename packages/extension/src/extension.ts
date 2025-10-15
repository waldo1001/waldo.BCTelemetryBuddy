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
        vscode.commands.registerCommand('bctb.runNLQuery', () => runNLQueryCommand(context)),
        vscode.commands.registerCommand('bctb.saveQuery', () => saveQueryCommand()),
        vscode.commands.registerCommand('bctb.openQueriesFolder', () => openQueriesFolderCommand())
    );

    // Auto-start MCP if workspace has settings configured
    if (hasWorkspaceSettings()) {
        outputChannel.appendLine('Workspace settings detected, auto-starting MCP...');
        startMCP().catch(err => {
            outputChannel.appendLine(`Failed to auto-start MCP: ${err.message}`);
        });
    }

    outputChannel.appendLine('Extension ready');
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
        outputChannel.appendLine(`[MCP] ${data.toString().trim()}`);
    });

    proc.stderr?.on('data', (data) => {
        outputChannel.appendLine(`[MCP ERROR] ${data.toString().trim()}`);
    });

    proc.on('close', (code) => {
        outputChannel.appendLine(`MCP process exited with code ${code}`);
        mcpProcess = null;
    });

    mcpProcess = { process: proc, port, workspacePath };

    // Wait for MCP to be ready
    await waitForMCPReady(port);

    outputChannel.appendLine('✓ MCP server started successfully');
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
        BCTB_APP_INSIGHTS_APP_ID: config.get<string>('mcp.applicationInsights.appId', ''),
        BCTB_KUSTO_CLUSTER_URL: config.get<string>('mcp.kusto.clusterUrl', ''),
        BCTB_CACHE_ENABLED: config.get<boolean>('mcp.cache.enabled', true) ? 'true' : 'false',
        BCTB_CACHE_TTL_SECONDS: config.get<number>('mcp.cache.ttlSeconds', 3600).toString(),
        BCTB_REMOVE_PII: config.get<boolean>('mcp.sanitize.removePII', false) ? 'true' : 'false',
        BCTB_PORT: config.get<number>('mcp.port', 52345).toString()
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
async function runNLQueryCommand(context: vscode.ExtensionContext): Promise<void> {
    try {
        // Ensure MCP is running
        if (!mcpProcess) {
            await startMCP();
        }

        if (!mcpClient) {
            throw new Error('MCP client not initialized');
        }

        // Prompt for natural language query
        const query = await vscode.window.showInputBox({
            prompt: 'Enter your telemetry query in natural language',
            placeHolder: 'e.g., Show me all errors in the last 24 hours',
            ignoreFocusOut: true
        });

        if (!query) {
            return;
        }

        outputChannel.appendLine(`Executing query: ${query}`);

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
                            query,
                            queryType: 'natural',
                            useContext: true,
                            includeExternal: true
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

        // Save query via MCP
        const result = await mcpClient.saveQuery({ name, kql, purpose, useCase, tags });

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

        const queriesPath = path.join(workspacePath, '.vscode', '.bctb', 'queries');

        // Open folder in explorer
        const uri = vscode.Uri.file(queriesPath);
        await vscode.commands.executeCommand('revealFileInOS', uri);

        outputChannel.appendLine(`Opened queries folder: ${queriesPath}`);
    } catch (err: any) {
        vscode.window.showErrorMessage(`Failed to open queries folder: ${err.message}`);
        outputChannel.show();
    }
}
