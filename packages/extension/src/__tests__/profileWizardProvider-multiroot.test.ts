/**
 * Multi-root workspace tests for ProfileWizardProvider
 * 
 * ProfileWizardProvider is excluded from main coverage (webview component),
 * but we need to ensure findConfigWorkspace() is used instead of workspaceFolders[0].
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
}), { virtual: true });

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
}));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { ProfileWizardProvider } from '../webviews/ProfileWizardProvider';

describe('ProfileWizardProvider - Multi-root workspace support', () => {
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

    it('should use findConfigWorkspace() for config path resolution in multi-root', async () => {
        // Multi-root workspace with Monitoring priority folder
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Monitoring' }, name: 'Monitoring' },
        ];

        const monitoringConfig = '/workspace/Monitoring/.bctb-config.json';
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Monitoring') && p.includes('.bctb-config.json')
        );
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
            profiles: {
                'customer-a': {
                    tenantId: 'tenant-a',
                    appInsightsId: 'app-a',
                },
            },
        }));

        await provider.show();
        await messageHandler({ type: 'loadProfiles' });

        // Should use Monitoring folder, not App
        expect(fs.readFileSync).toHaveBeenCalledWith(monitoringConfig, 'utf-8');
    });

    it('should save profile to correct workspace path in multi-root', async () => {
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Monitoring' }, name: 'Monitoring' },
        ];

        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('Monitoring') && p.includes('.bctb-config.json')
        );
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
            profiles: {},
        }));

        await provider.show();

        const newProfile = {
            profileName: 'customer-b',
            tenantId: 'tenant-b',
            appInsightsId: 'app-b',
        };

        await messageHandler({ type: 'saveProfile', profile: newProfile });

        expect(fs.writeFileSync).toHaveBeenCalledWith(
            expect.stringContaining('/workspace/Monitoring/.bctb-config.json'),
            expect.any(String)
        );
    });

    it('should handle multi-root workspace without priority folder', async () => {
        (vscode.workspace as any).workspaceFolders = [
            { uri: { fsPath: '/workspace/App' }, name: 'App' },
            { uri: { fsPath: '/workspace/Test' }, name: 'Test' },
        ];

        // No priority folder, should use first with config (App)
        const appConfig = '/workspace/App/.bctb-config.json';
        (fs.existsSync as jest.Mock).mockImplementation((p: string) =>
            p.includes('App') && p.includes('.bctb-config.json')
        );
        (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ profiles: {} }));

        await provider.show();
        await messageHandler({ type: 'loadProfiles' });

        expect(fs.readFileSync).toHaveBeenCalledWith(appConfig, 'utf-8');
    });
});
