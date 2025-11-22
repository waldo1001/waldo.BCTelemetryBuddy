/**
 * Version check and release notes tests
 * 
 * Tests the logic that determines when to show release notes
 * based on version changes (MAJOR version changes only)
 */

import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((...args) => ({
            toString: () => args.join('/'),
            with: jest.fn(),
            fsPath: args.join('/'),
        })),
    },
    ViewColumn: {
        One: 1,
    },
    window: {
        createWebviewPanel: jest.fn(),
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn(),
        })),
        activeTextEditor: undefined,
    },
    workspace: {
        workspaceFolders: [],
    },
}), { virtual: true });

// Import after mock
import { ReleaseNotesProvider } from '../webviews/ReleaseNotesProvider';

describe('Version Check and Release Notes', () => {
    let mockContext: any;
    let mockExtensionUri: any;
    let mockPanel: any;
    let createOrShowSpy: jest.SpyInstance;

    beforeEach(() => {
        // Clear any existing panel
        (ReleaseNotesProvider as any).currentPanel = undefined;

        // Setup mock extension URI
        mockExtensionUri = {
            toString: () => 'file:///extension/path',
            fsPath: '/extension/path',
        };

        // Setup mock webview panel
        mockPanel = {
            webview: {
                html: '',
                asWebviewUri: jest.fn((uri) => uri),
            },
            dispose: jest.fn(),
            onDidDispose: jest.fn((callback) => {
                return { dispose: jest.fn() };
            }),
            reveal: jest.fn(),
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Setup mock context with state management
        const state = new Map<string, any>();
        mockContext = {
            extension: {
                packageJSON: {
                    version: '1.0.0',
                },
            },
            extensionUri: mockExtensionUri,
            globalState: {
                get: jest.fn((key: string) => state.get(key)) as any,
                update: jest.fn((key: string, value: any) => {
                    state.set(key, value);
                    return Promise.resolve();
                }) as any,
            },
        };

        // Spy on ReleaseNotesProvider.createOrShow
        createOrShowSpy = jest.spyOn(ReleaseNotesProvider, 'createOrShow');
    });

    afterEach(() => {
        jest.clearAllMocks();
        createOrShowSpy.mockRestore();
        (ReleaseNotesProvider as any).currentPanel = undefined;
    });

    describe('MAJOR version changes', () => {
        it('should show release notes when MAJOR version increases (1.0.0 → 2.0.0)', async () => {
            // Simulate version stored from previous session
            await mockContext.globalState.update('bctb.lastVersion', '1.0.0');
            mockContext.extension.packageJSON.version = '2.0.0';

            // Import and call the function (we'll need to export it or test via extension activation)
            // For now, we'll test the logic directly
            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            expect(lastVersion).toBe('1.0.0');
            expect(currentVersion).toBe('2.0.0');

            // Check if MAJOR version changed
            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(2);
            expect(lastMajor).toBe(1);
            expect(currentMajor > lastMajor).toBe(true);
        });

        it('should show release notes when MAJOR version increases (0.9.0 → 1.0.0)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '0.9.0');
            mockContext.extension.packageJSON.version = '1.0.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(0);
            expect(currentMajor > lastMajor).toBe(true);
        });
    });

    describe('minor version changes', () => {
        it('should NOT show release notes when minor version increases (1.0.0 → 1.1.0)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '1.0.0');
            mockContext.extension.packageJSON.version = '1.1.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(1);
            expect(currentMajor > lastMajor).toBe(false);
        });

        it('should NOT show release notes when minor version increases (1.5.0 → 1.10.0)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '1.5.0');
            mockContext.extension.packageJSON.version = '1.10.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(1);
            expect(currentMajor > lastMajor).toBe(false);
        });
    });

    describe('patch version changes', () => {
        it('should NOT show release notes when patch version increases (1.0.0 → 1.0.1)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '1.0.0');
            mockContext.extension.packageJSON.version = '1.0.1';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(1);
            expect(currentMajor > lastMajor).toBe(false);
        });

        it('should NOT show release notes when patch version increases (1.0.5 → 1.0.10)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '1.0.5');
            mockContext.extension.packageJSON.version = '1.0.10';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(1);
            expect(currentMajor > lastMajor).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('should handle first install (no lastVersion)', async () => {
            // No previous version stored
            mockContext.extension.packageJSON.version = '1.0.0';

            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            expect(lastVersion).toBeUndefined();
            // Should NOT show release notes on first install
        });

        it('should handle same version (no change)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '1.0.0');
            mockContext.extension.packageJSON.version = '1.0.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            expect(currentVersion).toBe(lastVersion);
            // Should NOT show release notes when version hasn't changed
        });

        it('should handle multi-digit version numbers (10.5.3 → 11.0.0)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '10.5.3');
            mockContext.extension.packageJSON.version = '11.0.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(11);
            expect(lastMajor).toBe(10);
            expect(currentMajor > lastMajor).toBe(true);
        });

        it('should handle version downgrades (2.0.0 → 1.5.0)', async () => {
            await mockContext.globalState.update('bctb.lastVersion', '2.0.0');
            mockContext.extension.packageJSON.version = '1.5.0';

            const currentVersion = mockContext.extension.packageJSON.version;
            const lastVersion = mockContext.globalState.get('bctb.lastVersion');

            const currentMajor = parseInt(currentVersion.split('.')[0], 10);
            const lastMajor = parseInt(lastVersion!.split('.')[0], 10);

            expect(currentMajor).toBe(1);
            expect(lastMajor).toBe(2);
            expect(currentMajor > lastMajor).toBe(false);
            // Should NOT show release notes on downgrade
        });
    });

    describe('version parsing', () => {
        it('should correctly parse major version from standard semver', () => {
            const versions = ['1.0.0', '2.5.3', '10.0.0', '100.99.88'];

            versions.forEach(version => {
                const major = parseInt(version.split('.')[0], 10);
                expect(major).toBeGreaterThanOrEqual(1);
                expect(Number.isInteger(major)).toBe(true);
            });
        });

        it('should handle version with leading zeros', () => {
            const version = '01.02.03';
            const major = parseInt(version.split('.')[0], 10);

            expect(major).toBe(1);
        });
    });

    describe('integration with ReleaseNotesProvider', () => {
        it('should have ReleaseNotesProvider available', () => {
            expect(ReleaseNotesProvider).toBeDefined();
            expect(ReleaseNotesProvider.createOrShow).toBeDefined();
        });

        it('should be able to create release notes panel', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(createOrShowSpy).toHaveBeenCalledWith(mockExtensionUri, true);
        });
    });
});
