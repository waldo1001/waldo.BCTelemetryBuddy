/**
 * Multi-root workspace tests for ProfileWizardProvider
 * 
 * ProfileWizardProvider is excluded from main coverage (webview component),
 * but we need to ensure findConfigWorkspace() is used instead of workspaceFolders[0].
 * 
 * Tests AC2 from issue #130: Profile wizard reads/writes the .bctb-config.json from 
 * the folder resolved by findConfigWorkspace() in multi-root scenarios.
 */

// Mock vscode BEFORE imports  
jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((...args: any[]) => ({
            fsPath: args.join('/'),
        })),
        file: jest.fn((p: string) => ({ fsPath: p })),
    },
    ViewColumn: { One: 1 },
    window: {
        createWebviewPanel: jest.fn(),
        showInformationMessage: jest.fn(),
    },
    workspace: {
        workspaceFolders: [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Monitoring' }, name: 'Monitoring' },
        ],
    },
    commands: {
        executeCommand: jest.fn(),
    },
}), { virtual: true });

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ProfileWizardProvider } from '../webviews/ProfileWizardProvider';

describe('ProfileWizardProvider - Multi-root workspace support (AC2)', () => {
    let provider: ProfileWizardProvider;
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

        provider = new ProfileWizardProvider(mockExtensionUri, mockOutputChannel);
    });

    it('should write to the config in the folder resolved by findConfigWorkspace() in multi-root', async () => {
        // Multi-root workspace: App (first), Monitoring (second, has config)
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Monitoring' }, name: 'Monitoring' },
        ];

        // Only Monitoring has config (not the first folder)
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Monitoring') && p.includes('.bctb-config.json')
        );

        // No existing config yet (create new)
        (fs.readFileSync as jest.Mock).mockImplementation(() => {
            const error: any = new Error('ENOENT');
            error.code = 'ENOENT';
            throw error;
        });

        await provider.show();

        const newProfile = {
            profileName: 'customer-a',
            tenantId: 'tenant-a',
            appInsightsId: 'app-a',
            authFlow: 'azure_cli',
        };

        await messageHandler({ type: 'save', profile: newProfile });

        // Should save to Monitoring folder (findConfigWorkspace result), not App
        const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
        expect(writeCall[0]).toContain('Monitoring');
        expect(writeCall[0]).toContain('.bctb-config.json');
    });

    it('should read from the config in the folder resolved by findConfigWorkspace() in multi-root', async () => {
        // Multi-root workspace: App (first), Monitoring (second, has config)
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Monitoring' }, name: 'Monitoring' },
        ];

        // Only Monitoring has config
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Monitoring') && p.includes('.bctb-config.json')
        );

        const existingConfig = {
            profiles: {
                'existing-profile': {
                    tenantId: 'existing-tenant',
                    appInsightsId: 'existing-app',
                },
            },
            defaultProfile: 'existing-profile',
        };

        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existingConfig));

        await provider.show();

        // Add new profile to existing config
        const newProfile = {
            profileName: 'customer-b',
            tenantId: 'tenant-b',
            appInsightsId: 'app-b',
            authFlow: 'azure_cli',
        };

        await messageHandler({ type: 'save', profile: newProfile });

        // Should read from Monitoring folder first (findConfigWorkspace result)
        const readCall = (fs.readFileSync as jest.Mock).mock.calls[0];
        expect(readCall[0]).toContain('Monitoring');
        expect(readCall[0]).toContain('.bctb-config.json');

        // Should write back to same location
        const writeCall = (fs.writeFileSync as jest.Mock).mock.calls[0];
        expect(writeCall[0]).toContain('Monitoring');
        expect(writeCall[0]).toContain('.bctb-config.json');
    });
});
