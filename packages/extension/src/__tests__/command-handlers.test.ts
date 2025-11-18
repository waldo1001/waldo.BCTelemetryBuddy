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
