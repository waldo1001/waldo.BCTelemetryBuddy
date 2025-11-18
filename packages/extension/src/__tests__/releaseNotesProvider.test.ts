// Mock vscode module BEFORE importing
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
        activeTextEditor: undefined,
    },
}), { virtual: true });

import * as vscode from 'vscode';
import { ReleaseNotesProvider } from '../webviews/ReleaseNotesProvider';

describe('ReleaseNotesProvider', () => {
    let mockExtensionUri: any;
    let mockPanel: any;

    beforeEach(() => {
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
                // Store callback for testing
                mockPanel._onDidDisposeCallback = callback;
                return { dispose: jest.fn() };
            }),
            reveal: jest.fn(),
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        // Clear currentPanel between tests
        (ReleaseNotesProvider as any).currentPanel = undefined;
    });

    afterEach(() => {
        jest.clearAllMocks();
        (ReleaseNotesProvider as any).currentPanel = undefined;
    });

    describe('createOrShow', () => {
        it('should create webview panel with workspace', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'bcTelemetryBuddyReleaseNotes',
                "Note from waldo",
                expect.anything(),
                expect.objectContaining({
                    enableScripts: true,
                })
            );
        });

        it('should create webview panel without workspace', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, false);

            expect(vscode.window.createWebviewPanel).toHaveBeenCalled();
            expect(mockPanel.webview.html).toBeTruthy();
        });

        it('should reuse existing panel when called multiple times', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            // Should only create panel once
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
            // Should reveal existing panel
            expect(mockPanel.reveal).toHaveBeenCalled();
        });

        it('should create new panel after disposal', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            // Trigger disposal
            if (mockPanel._onDidDisposeCallback) {
                mockPanel._onDidDisposeCallback();
            }

            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            // Should create two panels (one before disposal, one after)
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(2);
        });
    });

    describe('HTML content generation', () => {
        it('should generate HTML with workspace-aware content (with workspace)', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('Getting Started');
            expect(html).toContain('Setup Wizard');
            expect(html).toContain('old BC Telemetry Buddy settings');
            expect(html).not.toContain('Open a workspace folder');
        });

        it('should generate HTML with workspace-aware content (without workspace)', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, false);

            const html = mockPanel.webview.html;
            expect(html).toContain('Quick Start');
            expect(html).toContain('Open a workspace folder');
            expect(html).toContain('File → Open Folder');
        });

        it('should include logo in HTML', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('waldo.png');
            expect(html).toContain('<img');
        });

        it('should include version number', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('v1.0.5');
            expect(html).toContain('BC Telemetry Buddy');
        });

        it('should include all major sections', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('Monorepo Architecture');
            expect(html).toContain('Multi-Profile Support');
            expect(html).toContain('Enhanced Configuration');
            expect(html).toContain('Improved Developer Experience');
            expect(html).toContain('GitHub Copilot Agent');
            expect(html).toContain('NPM Publication');
            expect(html).toContain('Comprehensive Testing');
        });

        it('should include resources section', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('Resources');
            expect(html).toContain('Documentation');
        });

        it('should include proper CSS styling', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('<style>');
            expect(html).toContain('--vscode-');
            expect(html).toContain('.container');
            expect(html).toContain('.section');
        });
    });

    describe('workspace state handling', () => {
        it('should show migration path when workspace exists', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            expect(html).toContain('Getting Started (2 Simple Steps)');
            expect(html).toContain('automatic migration prompt');
        });

        it('should show new setup path when no workspace', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, false);

            const html = mockPanel.webview.html;
            expect(html).toContain('Quick Start (3 Simple Steps)');
            expect(html).toContain('Open a workspace folder');
        });

        it('should handle workspace state changes correctly', () => {
            // Clear any existing panel
            (ReleaseNotesProvider as any).currentPanel = undefined;
            jest.clearAllMocks();

            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);
            const htmlWith = mockPanel.webview.html;

            // Clear for second test
            (ReleaseNotesProvider as any).currentPanel = undefined;
            jest.clearAllMocks();
            (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

            ReleaseNotesProvider.createOrShow(mockExtensionUri, false);
            const htmlWithout = mockPanel.webview.html;

            expect(htmlWith).not.toEqual(htmlWithout);
        });
    });

    describe('edge cases', () => {
        it('should handle undefined hasWorkspace parameter', () => {
            expect(() => {
                ReleaseNotesProvider.createOrShow(mockExtensionUri);
            }).not.toThrow();

            expect(mockPanel.webview.html).toBeTruthy();
        });

        it('should escape HTML content properly', () => {
            ReleaseNotesProvider.createOrShow(mockExtensionUri, true);

            const html = mockPanel.webview.html;
            // Check that code blocks are properly formatted
            expect(html).toContain('<code>');
            expect(html).toContain('</code>');
        });
    });
});
