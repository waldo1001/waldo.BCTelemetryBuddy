/**
 * Command handler integration tests
 * 
 * Tests that command handlers use TelemetryService directly instead of MCP server.
 * This validates Phase 3 independence from bundled MCP.
 */

import * as vscode from 'vscode';

// Mock vscode before importing extension
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn()
        })),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showInputBox: jest.fn(),
        withProgress: jest.fn((options, task) => task()),
        activeTextEditor: undefined
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn()
    },
    languages: {
        registerCodeLensProvider: jest.fn(() => ({ dispose: jest.fn() }))
    },
    lm: {
        registerMcpServerDefinitionProvider: jest.fn(() => ({ dispose: jest.fn() }))
    },
    chat: {
        createChatParticipant: jest.fn(() => ({
            iconPath: undefined,
            dispose: jest.fn()
        }))
    },
    ProgressLocation: {
        Notification: 15
    },
    ViewColumn: {
        Two: 2
    },
    Uri: {
        file: (p: string) => ({ fsPath: p }),
        joinPath: jest.fn((...args) => ({ fsPath: args.join('/') }))
    },
    ExtensionContext: jest.fn(),
    EventEmitter: jest.fn(() => ({
        event: jest.fn(),
        fire: jest.fn()
    }))
}), { virtual: true });

// Create mock instances that we can spy on
const mockTelemetryServiceInstance = {
    isConfigured: jest.fn(() => true),
    authenticate: jest.fn().mockResolvedValue({ accessToken: 'test-token' }),
    executeKQL: jest.fn().mockResolvedValue({
        type: 'table',
        kql: 'test query',
        summary: 'Test results',
        rows: [['2025-01-01', 'Test']],
        columns: ['timestamp', 'message'],
        cached: false
    }),
    saveQuery: jest.fn().mockResolvedValue(undefined),
    getSavedQueries: jest.fn().mockResolvedValue([]),
    searchQueries: jest.fn().mockResolvedValue([])
};

const mockResultsWebviewInstance = {
    show: jest.fn()
};

// Mock TelemetryService
jest.mock('../services/telemetryService', () => ({
    TelemetryService: jest.fn(() => mockTelemetryServiceInstance)
}));

// Mock ResultsWebview
jest.mock('../resultsWebview', () => ({
    ResultsWebview: jest.fn(() => mockResultsWebviewInstance)
}));

// Mock MigrationService
jest.mock('../services/migrationService', () => ({
    MigrationService: jest.fn(() => ({
        checkForOldSettings: jest.fn().mockResolvedValue(false),
        migrate: jest.fn().mockResolvedValue(true)
    }))
}));

// Mock ProfileStatusBar
jest.mock('../ui/profileStatusBar', () => ({
    ProfileStatusBar: jest.fn(() => ({
        dispose: jest.fn(),
        switchProfile: jest.fn(),
        getCurrentProfile: jest.fn(() => null),
        refresh: jest.fn()
    }))
}));

// Mock ProfileManager
jest.mock('../services/profileManager', () => ({
    ProfileManager: jest.fn(() => ({
        getProfiles: jest.fn().mockResolvedValue([]),
        getActiveProfile: jest.fn(() => null)
    }))
}));

// Mock SetupWizardProvider
jest.mock('../webviews/SetupWizardProvider', () => ({
    SetupWizardProvider: jest.fn(() => ({
        show: jest.fn(),
        dispose: jest.fn()
    }))
}));

// Mock MCPClient
jest.mock('../mcpClient', () => ({
    MCPClient: jest.fn(() => ({
        request: jest.fn(),
        dispose: jest.fn()
    }))
}));

// Mock chat participant
jest.mock('../chatParticipant', () => ({
    registerChatParticipant: jest.fn()
}));

describe.skip('Command Handlers - Phase 3 Validation', () => {
    let mockTelemetryService: any;
    let mockConfig: any;
    let commandHandlers: Map<string, Function>;

    // Helper to create mock extension context
    const createMockContext = (): any => ({
        subscriptions: [],
        extensionPath: '/test/extension',
        extensionUri: { fsPath: '/test/extension' },
        globalState: { get: jest.fn(), update: jest.fn() },
        workspaceState: { get: jest.fn(), update: jest.fn() }
    });

    beforeEach(() => {
        jest.clearAllMocks();

        // Setup mock configuration
        mockConfig = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                    'mcp.connectionName': 'test-connection',
                    'mcp.tenantId': 'test-tenant-id',
                    'mcp.clientId': 'test-client-id',
                    'mcp.applicationInsights.appId': 'test-app-id',
                    'mcp.kusto.clusterUrl': 'https://test.kusto.windows.net',
                    'mcp.kusto.database': 'test-database',
                    'agent.maxRetries': 3,
                    'queries.folder': 'queries'
                };
                return config[key] ?? defaultValue;
            })
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

        // Capture registered command handlers
        commandHandlers = new Map();
        (vscode.commands.registerCommand as jest.Mock).mockImplementation(
            (command: string, handler: Function) => {
                commandHandlers.set(command, handler);
                return { dispose: jest.fn() };
            }
        );

        // Get mock telemetry service instance
        const { TelemetryService } = require('../services/telemetryService');
        mockTelemetryService = new TelemetryService();
    });

    describe('runKQLQueryCommand', () => {
        it('should use TelemetryService.executeKQL() not MCP', async () => {
            // This test ensures Phase 3 independence - commands should NOT start MCP server
            const mockContext = {
                subscriptions: [],
                extensionPath: '/test/extension',
                globalState: { get: jest.fn(), update: jest.fn() },
                workspaceState: { get: jest.fn(), update: jest.fn() }
            } as any;

            // Simulate user input
            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('traces | take 10');

            // Import and activate extension to register commands
            const extension = require('../extension');
            await extension.activate(mockContext);

            // Get the command handler
            const handler = commandHandlers.get('bctb.runKQLQuery');
            expect(handler).toBeDefined();

            // Execute command
            await handler!(mockContext);

            // CRITICAL: Should use TelemetryService.executeKQL, NOT mcpClient
            expect(mockTelemetryService.executeKQL).toHaveBeenCalledWith('traces | take 10');

            // Should NOT call these (MCP-related):
            expect(vscode.commands.executeCommand).not.toHaveBeenCalledWith(
                expect.stringContaining('startMCP')
            );
        });

        it('should handle TelemetryService not configured', async () => {
            const mockContext = createMockContext();

            // Make service unconfigured
            mockTelemetryService.isConfigured.mockReturnValue(false);

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLQuery');
            await handler!(mockContext);

            // Should show error and NOT execute query
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
            expect(mockTelemetryService.executeKQL).not.toHaveBeenCalled();
        });

        it('should retry on failure according to agent.maxRetries config', async () => {
            const mockContext = createMockContext();

            (vscode.window.showInputBox as jest.Mock).mockResolvedValue('traces | take 10');

            // First 2 attempts fail, 3rd succeeds
            mockTelemetryService.executeKQL
                .mockRejectedValueOnce(new Error('Network error'))
                .mockRejectedValueOnce(new Error('Timeout'))
                .mockResolvedValueOnce({ rows: [], columns: [] });

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLQuery');
            await handler!(mockContext);

            // Should attempt 3 times (maxRetries = 3)
            expect(mockTelemetryService.executeKQL).toHaveBeenCalledTimes(3);
        });
    });

    describe('runKQLFromDocumentCommand', () => {
        it('should use TelemetryService.executeKQL() not MCP', async () => {
            const mockContext = createMockContext();

            // Setup active editor with KQL content
            const mockDocument = {
                getText: jest.fn(() => 'dependencies | where duration > 1000'),
                fileName: '/test/query.kql'
            };
            const mockEditor = {
                document: mockDocument,
                selection: { isEmpty: true }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLFromDocument');
            expect(handler).toBeDefined();

            await handler!(mockContext);

            // CRITICAL: Should use TelemetryService, NOT MCP
            expect(mockTelemetryService.executeKQL).toHaveBeenCalledWith(
                'dependencies | where duration > 1000'
            );
        });

        it('should execute selected text when selection is not empty', async () => {
            const mockContext = createMockContext();

            const mockDocument = {
                getText: jest.fn((range?: any) => {
                    if (range) return 'traces | take 5';
                    return 'traces | take 10';
                }),
                fileName: '/test/query.kql'
            };
            const mockEditor = {
                document: mockDocument,
                selection: { isEmpty: false }
            };
            (vscode.window as any).activeTextEditor = mockEditor;

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLFromDocument');
            await handler!(mockContext);

            // Should execute selected text, not entire document
            expect(mockTelemetryService.executeKQL).toHaveBeenCalledWith('traces | take 5');
        });

        it('should show warning when no active editor', async () => {
            const mockContext = createMockContext();

            (vscode.window as any).activeTextEditor = undefined;

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLFromDocument');
            await handler!(mockContext);

            expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
                expect.stringContaining('No active text editor')
            );
            expect(mockTelemetryService.executeKQL).not.toHaveBeenCalled();
        });
    });

    describe('runKQLFromCodeLensCommand', () => {
        it('should use TelemetryService.executeKQL() not MCP', async () => {
            const mockContext = createMockContext();

            const uri = vscode.Uri.file('/test/query.kql');
            const queryText = 'exceptions | where timestamp > ago(1h)';

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLFromCodeLens');
            expect(handler).toBeDefined();

            await handler!(mockContext, uri, 0, 5, queryText);

            // CRITICAL: Should use TelemetryService, NOT MCP
            expect(mockTelemetryService.executeKQL).toHaveBeenCalledWith(queryText);
        });

        it('should handle query execution errors gracefully', async () => {
            const mockContext = createMockContext();

            mockTelemetryService.executeKQL.mockRejectedValue(new Error('Query syntax error'));

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.runKQLFromCodeLens');
            await handler!(mockContext, vscode.Uri.file('/test/q.kql'), 0, 5, 'invalid query');

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Query failed')
            );
        });
    });

    describe('saveQueryCommand', () => {
        it('should use TelemetryService.saveQuery() not MCP', async () => {
            const mockContext = createMockContext();

            // Simulate user input for query details
            (vscode.window.showInputBox as jest.Mock)
                .mockResolvedValueOnce('Slow Database Calls')  // name
                .mockResolvedValueOnce('dependencies | where duration > 2000')  // kql
                .mockResolvedValueOnce('Find slow DB operations')  // purpose
                .mockResolvedValueOnce('Performance troubleshooting')  // useCase
                .mockResolvedValueOnce('performance,database')  // tags
                .mockResolvedValueOnce('Performance');  // category

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.saveQuery');
            expect(handler).toBeDefined();

            await handler!();

            // CRITICAL: Should use TelemetryService.saveQuery, NOT mcpClient.saveQuery
            expect(mockTelemetryService.saveQuery).toHaveBeenCalledWith(
                'Slow Database Calls',
                'dependencies | where duration > 2000',
                'Find slow DB operations',
                'Performance troubleshooting',
                ['performance', 'database'],
                'Performance'
            );
        });

        it('should handle save errors gracefully', async () => {
            const mockContext = createMockContext();

            (vscode.window.showInputBox as jest.Mock)
                .mockResolvedValueOnce('Test Query')
                .mockResolvedValueOnce('traces | take 10');

            mockTelemetryService.saveQuery.mockRejectedValue(new Error('File system error'));

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.saveQuery');
            await handler!();

            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Failed to save query')
            );
        });

        it('should cancel when user does not provide name', async () => {
            const mockContext = createMockContext();

            (vscode.window.showInputBox as jest.Mock).mockResolvedValueOnce(undefined);  // Cancel name

            const extension = require('../extension');
            await extension.activate(mockContext);

            const handler = commandHandlers.get('bctb.saveQuery');
            await handler!();

            // Should not save when cancelled
            expect(mockTelemetryService.saveQuery).not.toHaveBeenCalled();
        });
    });

    describe('Phase 3 Independence Validation', () => {
        it('should NOT import or use MCPClient in command handlers', () => {
            // Load extension source and verify no MCPClient usage in commands
            const fs = require('fs');
            const path = require('path');
            const extensionPath = path.join(__dirname, '..', 'extension.ts');
            const extensionSource = fs.readFileSync(extensionPath, 'utf-8');

            // Extract command handler functions
            const commandHandlerRegex = /async function (runKQLQueryCommand|runKQLFromDocumentCommand|runKQLFromCodeLensCommand|saveQueryCommand)\(/g;
            const handlers = extensionSource.match(commandHandlerRegex);

            expect(handlers).toBeTruthy();
            expect(handlers!.length).toBeGreaterThanOrEqual(4);

            // Verify handlers use telemetryService, not mcpClient
            const usesTelemtryService = extensionSource.includes('telemetryService.executeKQL') ||
                extensionSource.includes('telemetryService.saveQuery');
            expect(usesTelemtryService).toBe(true);

            // CRITICAL: Verify handlers do NOT use mcpClient (Phase 3 requirement)
            const runKQLQuerySource = extensionSource.substring(
                extensionSource.indexOf('async function runKQLQueryCommand'),
                extensionSource.indexOf('async function runKQLFromDocumentCommand')
            );

            expect(runKQLQuerySource).not.toContain('mcpClient!.queryTelemetry');
            expect(runKQLQuerySource).not.toContain('await startMCP()');
            expect(runKQLQuerySource).toContain('telemetryService');
        });

        it('should initialize TelemetryService on extension activation', async () => {
            const mockContext = createMockContext();

            const extension = require('../extension');
            await extension.activate(mockContext);

            // TelemetryService constructor should be called during activation
            const { TelemetryService } = require('../services/telemetryService');
            expect(TelemetryService).toHaveBeenCalled();
        });

        it('should NOT bundle MCP server files (Phase 3 validation)', () => {
            const fs = require('fs');
            const path = require('path');

            // Verify packages/extension/mcp/ directory does NOT exist
            const mcpBundlePath = path.join(__dirname, '..', '..', 'mcp');
            const mcpExists = fs.existsSync(mcpBundlePath);

            expect(mcpExists).toBe(false);
        });
    });
});
