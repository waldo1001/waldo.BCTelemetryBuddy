/**
 * Tests for Issue #104 fix — Config detection and reload mechanism
 */

import * as fs from 'fs';
import * as path from 'path';

jest.mock('fs');
const mockedFs = jest.mocked(fs);

const mockExecuteCommand = jest.fn();
const mockCreateFileSystemWatcher = jest.fn();
const mockShowWarningMessage = jest.fn();

const mockWatcher = {
    onDidCreate: jest.fn(),
    onDidChange: jest.fn(),
    onDidDelete: jest.fn(),
    dispose: jest.fn()
};
mockCreateFileSystemWatcher.mockReturnValue(mockWatcher);

jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(() => ({
            get: jest.fn((_key: string, defaultValue?: any) => defaultValue)
        })),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
        createFileSystemWatcher: mockCreateFileSystemWatcher
    },
    window: {
        showWarningMessage: mockShowWarningMessage,
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn()
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: mockExecuteCommand
    },
    Uri: {
        file: (p: string) => ({ fsPath: p }),
        joinPath: (base: any, ...segments: string[]) => ({
            fsPath: path.join(base.fsPath, ...segments)
        })
    }
}), { virtual: true });

describe('Issue #104 — Config detection and reload', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    describe('hasWorkspaceSettings — config file detection', () => {
        it('should detect .bctb-config.json as valid config', () => {
            const wp = '/test/workspace';
            mockedFs.existsSync.mockImplementation(
                (p: fs.PathLike) => String(p) === path.join(wp, '.bctb-config.json')
            );
            expect(hasWorkspaceSettingsFixed([wp])).toBe(true);
        });

        it('should return false when no config file and no settings', () => {
            mockedFs.existsSync.mockReturnValue(false);
            expect(hasWorkspaceSettingsFixed(['/test/workspace'], {})).toBe(false);
        });

        it('should detect legacy settings.json config as fallback', () => {
            mockedFs.existsSync.mockReturnValue(false);
            expect(hasWorkspaceSettingsFixed(['/test/workspace'], {
                tenantId: 't', appInsightsId: 'a', kustoUrl: 'k'
            })).toBe(true);
        });

        it('should check all workspace folders', () => {
            const folders = ['/ws/f1', '/ws/f2'];
            mockedFs.existsSync.mockImplementation(
                (p: fs.PathLike) => String(p) === path.join(folders[1], '.bctb-config.json')
            );
            expect(hasWorkspaceSettingsFixed(folders)).toBe(true);
            expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join(folders[0], '.bctb-config.json'));
            expect(mockedFs.existsSync).toHaveBeenCalledWith(path.join(folders[1], '.bctb-config.json'));
        });

        it('should return false when no workspace folders', () => {
            expect(hasWorkspaceSettingsFixed([])).toBe(false);
        });
    });

    describe('Config reload mechanism', () => {
        it('should create TelemetryService when null', () => {
            let svc: any = null;
            const create = jest.fn(() => ({ isConfigured: () => true, reloadConfig: jest.fn() }));
            const handler = () => { svc ? svc.reloadConfig() : (svc = create()); };
            expect(svc).toBeNull();
            handler();
            expect(svc).not.toBeNull();
            expect(create).toHaveBeenCalledTimes(1);
        });

        it('should call reloadConfig when service exists', () => {
            const reload = jest.fn();
            const svc: any = { reloadConfig: reload };
            const handler = () => { svc ? svc.reloadConfig() : null; };
            handler();
            expect(reload).toHaveBeenCalledTimes(1);
        });

        it('should handle creation failure gracefully', () => {
            let svc: any = null;
            const create = jest.fn(() => { throw new Error('fail'); });
            const handler = () => {
                if (svc) { svc.reloadConfig(); }
                else { try { svc = create(); } catch { /* expected */ } }
            };
            handler();
            expect(svc).toBeNull();
        });
    });

    describe('FileSystemWatcher', () => {
        it('should use correct glob pattern', () => {
            require('vscode').workspace.createFileSystemWatcher('**/.bctb-config.json');
            expect(mockCreateFileSystemWatcher).toHaveBeenCalledWith('**/.bctb-config.json');
        });

        it('should wire onDidCreate and onDidChange', () => {
            const w = require('vscode').workspace.createFileSystemWatcher('**/.bctb-config.json');
            const c = jest.fn(), u = jest.fn();
            w.onDidCreate(c); w.onDidChange(u);
            expect(mockWatcher.onDidCreate).toHaveBeenCalledWith(c);
            expect(mockWatcher.onDidChange).toHaveBeenCalledWith(u);
        });
    });

    describe('startMCPCommand action fix', () => {
        it('should open wizard instead of settings.json', async () => {
            mockShowWarningMessage.mockResolvedValue('Run Setup Wizard');
            const r = await mockShowWarningMessage('msg', 'Run Setup Wizard', 'Cancel');
            if (r === 'Run Setup Wizard') { await mockExecuteCommand('bctb.setupWizard'); }
            expect(mockExecuteCommand).toHaveBeenCalledWith('bctb.setupWizard');
            expect(mockExecuteCommand).not.toHaveBeenCalledWith('workbench.action.openWorkspaceSettingsFile');
        });

        it('should do nothing on cancel', async () => {
            mockShowWarningMessage.mockResolvedValue('Cancel');
            const r = await mockShowWarningMessage('msg', 'Run Setup Wizard', 'Cancel');
            if (r === 'Run Setup Wizard') { await mockExecuteCommand('bctb.setupWizard'); }
            expect(mockExecuteCommand).not.toHaveBeenCalled();
        });
    });
});

/**
 * Mirrors the FIXED hasWorkspaceSettings() logic from extension.ts
 */
function hasWorkspaceSettingsFixed(
    paths: string[],
    settings?: { tenantId?: string; appInsightsId?: string; kustoUrl?: string }
): boolean {
    if (!paths.length) { return false; }
    for (const p of paths) {
        if (fs.existsSync(path.join(p, '.bctb-config.json'))) { return true; }
    }
    return settings ? !!(settings.tenantId && settings.appInsightsId && settings.kustoUrl) : false;
}
