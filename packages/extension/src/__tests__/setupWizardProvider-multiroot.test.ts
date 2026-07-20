/**
 * Multi-root workspace tests for SetupWizardProvider
 * 
 * SetupWizardProvider is excluded from main coverage (complex webview),
 * but we need to ensure findConfigWorkspace() is used instead of workspaceFolders[0].
 */

// Mock vscode BEFORE imports
jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((...args: any[]) => {
            // Handle Uri objects in args
            const parts = args.map(arg =>
                typeof arg === 'object' && arg.fsPath ? arg.fsPath : String(arg)
            );
            return {
                fsPath: parts.join('/'),
                with: jest.fn(),
            };
        }),
        file: jest.fn((p: string) => ({ fsPath: p })),
    },
    ViewColumn: { One: 1 },
    window: {
        createWebviewPanel: jest.fn(),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    workspace: {
        workspaceFolders: [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Telemetry' }, name: 'Telemetry' },
        ],
        getConfiguration: jest.fn(() => ({
            get: jest.fn(),
            update: jest.fn(),
        })),
        fs: {
            readFile: jest.fn(),
            writeFile: jest.fn(),
        },
    },
    ConfigurationTarget: { Workspace: 1 },
}), { virtual: true });

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { SetupWizardProvider } from '../webviews/SetupWizardProvider';

describe('SetupWizardProvider - Multi-root workspace support', () => {
    let provider: SetupWizardProvider;
    let mockPanel: any;
    let messageHandler: (msg: any) => Promise<void>;
    let mockExtensionUri: any;
    let mockOutputChannel: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockExtensionUri = {
            fsPath: '/extension/path',
        };

        mockOutputChannel = {
            appendLine: jest.fn(),
        };

        mockPanel = {
            webview: {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn((handler: any) => {
                    messageHandler = handler;
                    return { dispose: jest.fn() };
                }),
                asWebviewUri: jest.fn((uri: any) => uri),
            },
            onDidDispose: jest.fn(() => ({ dispose: jest.fn() })),
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        provider = new SetupWizardProvider(mockExtensionUri, mockOutputChannel);
    });

    it('should use findConfigWorkspace() for workspace path resolution in multi-root', async () => {
        // Multi-root workspace setup
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Telemetry' }, name: 'Telemetry' },
        ];

        const telemetryConfig = '/workspace/Telemetry/.bctb-config.json';
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Telemetry') && p.includes('.bctb-config.json')
        );
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
            tenantId: 'test-tenant',
            appInsightsId: 'test-app-id',
        }));

        await provider.show();

        // Trigger validation
        await messageHandler({ type: 'validateWorkspace' });

        // Should use Telemetry folder (has config), not App
    });

    it('should use findConfigWorkspace() when saving config in multi-root', async () => {
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Telemetry' }, name: 'Telemetry' },
        ];

        // Telemetry has config
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Telemetry') && p.includes('.bctb-config.json')
        );

        await provider.show();

        const config = {
            tenantId: 'new-tenant',
            appInsightsId: 'new-app-id',
            authFlow: 'azure_cli',
        };

        await messageHandler({ type: 'saveConfig', config });

        // Should save to Telemetry folder, not App
        const writeCall = (vscode.workspace.fs.writeFile as jest.Mock).mock.calls[0];
        expect(writeCall[0].fsPath).toContain('Telemetry');
        expect(writeCall[0].fsPath).toContain('.bctb-config.json');
    });

    it('should use findConfigWorkspace() when loading existing config in multi-root', async () => {
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Telemetry' }, name: 'Telemetry' },
        ];

        const telemetryConfig = Buffer.from(JSON.stringify({
            tenantId: 'existing-tenant',
            appInsightsId: 'existing-app-id',
        }));

        // Telemetry has config
        (vscode.workspace.fs.readFile as jest.Mock).mockResolvedValue(telemetryConfig);

        await provider.show();
        await messageHandler({ type: 'loadConfig' });

        // Should load from Telemetry folder
        const readCall = (vscode.workspace.fs.readFile as jest.Mock).mock.calls[0];
        expect(readCall[0].fsPath).toContain('Telemetry');
        expect(readCall[0].fsPath).toContain('.bctb-config.json');
    });
});
