/**
 * Multi-root workspace tests for KnowledgeBaseProvider.
 *
 * Validates that the webview reads its KB cache + local KB from the
 * workspace folder containing .bctb-config.json, not blindly folders[0].
 *
 * See plan: docs/plans/kb-webview-multiroot-path.md
 */

import * as fs from 'fs';
import * as path from 'path';

// --- telemetry mock --------------------------------------------------------
const mockTrackEvent = jest.fn();
const mockTelemetry = { trackEvent: mockTrackEvent };

// --- vscode mock -----------------------------------------------------------
const mockPostMessage = jest.fn();
const mockWebviewPanel = {
    webview: { html: '', postMessage: mockPostMessage, onDidReceiveMessage: jest.fn().mockReturnValue({ dispose: jest.fn() }) },
    onDidDispose: jest.fn().mockReturnValue({ dispose: jest.fn() }),
    dispose: jest.fn(),
    reveal: jest.fn(),
};

jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn().mockReturnValue(mockWebviewPanel),
        activeTextEditor: undefined,
        showErrorMessage: jest.fn(),
    },
    ViewColumn: { One: 1 },
    Uri: {
        parse: (s: string) => ({ toString: () => s, _raw: s }),
        file: (p: string) => ({ fsPath: p }),
    },
    env: { openExternal: jest.fn() },
    commands: { executeCommand: jest.fn() },
    workspace: { workspaceFolders: undefined },
}), { virtual: true });

// --- fs mock ---------------------------------------------------------------
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// --- @bctb/shared mock -----------------------------------------------------
const mockLoadAll = jest.fn().mockResolvedValue({
    communityArticles: [], localArticles: [], communitySource: 'github', excludedCount: 0, errors: [],
});
const mockKBServiceCtor = jest.fn().mockImplementation(() => ({ loadAll: mockLoadAll }));
jest.mock('@bctb/shared', () => ({
    KnowledgeBaseService: mockKBServiceCtor,
    TELEMETRY_EVENTS: {
        EXTENSION: {
            KB_PANEL_OPENED: 'TB-EXT-013',
            KB_ARTICLE_OPENED: 'TB-EXT-014',
            KB_ARTICLE_EXCLUDED: 'TB-EXT-015',
            KB_COMMUNITY_TOGGLED: 'TB-EXT-016',
            KB_REFRESH_COMPLETED: 'TB-EXT-017',
            KB_REFRESH_FAILED: 'TB-EXT-018',
        },
    },
}));

import * as vscode from 'vscode';
import { KnowledgeBaseProvider } from '../webviews/KnowledgeBaseProvider.js';

const FOLDER_A = '/folderA';
const FOLDER_B = '/folderB';
const FOLDER_C = '/folderC';
const CONFIG_NAME = '.bctb-config.json';

const mockOutputChannel = {
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
    name: 'Test',
    hide: jest.fn(),
    clear: jest.fn(),
    replace: jest.fn(),
};

function setFolders(paths: string[] | undefined) {
    if (paths === undefined) {
        (vscode.workspace as any).workspaceFolders = undefined;
        return;
    }
    (vscode.workspace as any).workspaceFolders = paths.map((p, i) => ({
        uri: { fsPath: p },
        name: p.split(/[\\/]/).pop(),
        index: i,
    }));
}

function makeProvider() {
    return new KnowledgeBaseProvider({ fsPath: '/extension' } as any, mockOutputChannel as any, mockTelemetry as any);
}

function priv(p: KnowledgeBaseProvider): any { return p as any; }

beforeEach(() => {
    jest.clearAllMocks();
    setFolders(undefined);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.writeFileSync.mockImplementation(() => undefined);
    mockFs.mkdirSync.mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// AC1: multi-root, config in folders[2] → load from folders[2]
// ---------------------------------------------------------------------------
describe('_loadArticleData (multi-root)', () => {
    it('loads articles from the workspace folder containing .bctb-config.json (multi-root)', () => {
        setFolders([FOLDER_A, FOLDER_B, FOLDER_C]);

        const cachePathC = path.join(FOLDER_C, '.vscode', '.bctb', 'kb-cache', 'community-articles.json');
        const configPathC = path.join(FOLDER_C, CONFIG_NAME);

        // Only folderC has the config
        mockFs.existsSync.mockImplementation((p: any) => String(p) === configPathC);

        // readFileSync: serve cache for folderC; serve config too
        mockFs.readFileSync.mockImplementation((p: any) => {
            const s = String(p);
            if (s === cachePathC) {
                return JSON.stringify([
                    { id: 'art-1', title: 'A1', category: 'playbook', tags: [], eventIds: [] },
                    { id: 'art-2', title: 'A2', category: 'playbook', tags: [], eventIds: [] },
                    { id: 'art-3', title: 'A3', category: 'playbook', tags: [], eventIds: [] },
                    { id: 'art-4', title: 'A4', category: 'playbook', tags: [], eventIds: [] },
                ]);
            }
            if (s === configPathC) {
                return JSON.stringify({ knowledgeBase: { exclude: [] } });
            }
            // If we ever read folderA's cache, fail loudly — that's the bug.
            if (s.startsWith(FOLDER_A)) {
                throw new Error(`Should not read folderA: ${s}`);
            }
            return '{}';
        });

        const data = priv(makeProvider())._loadArticleData();

        expect(data.noWorkspace).toBe(false);
        expect(data.community).toHaveLength(4);
        expect(data.community[0].id).toBe('art-1');
    });

    // AC2: single-root regression
    it('loads articles from the single workspace folder when only one is open', () => {
        setFolders([FOLDER_A]);

        const cachePathA = path.join(FOLDER_A, '.vscode', '.bctb', 'kb-cache', 'community-articles.json');
        const configPathA = path.join(FOLDER_A, CONFIG_NAME);

        mockFs.existsSync.mockImplementation((p: any) => String(p) === configPathA);
        mockFs.readFileSync.mockImplementation((p: any) => {
            const s = String(p);
            if (s === cachePathA) return JSON.stringify([{ id: 'one', title: 'Solo', category: 'playbook', tags: [] }]);
            if (s === configPathA) return JSON.stringify({ knowledgeBase: { exclude: [] } });
            return '{}';
        });

        const data = priv(makeProvider())._loadArticleData();
        expect(data.community).toHaveLength(1);
        expect(data.community[0].id).toBe('one');
    });

    // AC3: no folder has config → fallback to folders[0]
    it('falls back to first folder when no .bctb-config.json is present in any folder', () => {
        setFolders([FOLDER_A, FOLDER_B]);
        mockFs.existsSync.mockReturnValue(false); // no config anywhere

        const cachePathA = path.join(FOLDER_A, '.vscode', '.bctb', 'kb-cache', 'community-articles.json');
        mockFs.readFileSync.mockImplementation((p: any) => {
            if (String(p) === cachePathA) return JSON.stringify([{ id: 'fallback', title: 'F', category: 'playbook', tags: [] }]);
            return '{}';
        });

        const data = priv(makeProvider())._loadArticleData();
        expect(data.noWorkspace).toBe(false);
        // Still loads (or attempts to load) from folders[0]
        // Whether community is populated depends on whether the cache happens to exist there;
        // the key invariant is that it does NOT throw and does NOT use a different folder.
        expect(data.community).toHaveLength(1);
        expect(data.community[0].id).toBe('fallback');
    });

    // AC4: no workspace open
    it('returns noWorkspace when no folders are open', () => {
        setFolders(undefined);
        const data = priv(makeProvider())._loadArticleData();
        expect(data.noWorkspace).toBe(true);
        expect(data.community).toEqual([]);
        expect(data.local).toEqual([]);
    });
});

// ---------------------------------------------------------------------------
// AC5: refresh writes cache into config-bearing folder
// ---------------------------------------------------------------------------
describe('_refreshFromGitHub (multi-root)', () => {
    it('refresh writes cache into the workspace folder containing .bctb-config.json', async () => {
        setFolders([FOLDER_A, FOLDER_B, FOLDER_C]);

        const configPathC = path.join(FOLDER_C, CONFIG_NAME);
        mockFs.existsSync.mockImplementation((p: any) => String(p) === configPathC);
        mockFs.readFileSync.mockImplementation((p: any) => {
            if (String(p) === configPathC) {
                return JSON.stringify({ knowledgeBase: { enabled: true, exclude: [] } });
            }
            return '{}';
        });

        const provider = makeProvider();
        // Stub HTML so show() doesn't error
        priv(provider)._loadArticleData = jest.fn().mockReturnValue({
            community: [], local: [], excludeCount: 0, kbEnabled: true, noWorkspace: false,
        });
        priv(provider)._getHtml = jest.fn().mockReturnValue('<html></html>');
        await provider.show();

        mockKBServiceCtor.mockClear();
        await priv(provider)._refreshFromGitHub();

        expect(mockKBServiceCtor).toHaveBeenCalledTimes(1);
        const ctorArgs = mockKBServiceCtor.mock.calls[0];
        expect(ctorArgs[0]).toBe(FOLDER_C); // config-bearing folder, not folderA
    });
});

// ---------------------------------------------------------------------------
// Telemetry: multiRootResolved property on KB_PANEL_OPENED
// ---------------------------------------------------------------------------
describe('KB.PanelOpened.multiRootResolved telemetry', () => {
    function stubProviderUiAndOpen(provider: KnowledgeBaseProvider) {
        priv(provider)._loadArticleData = jest.fn().mockReturnValue({
            community: [], local: [], excludeCount: 0, kbEnabled: true, noWorkspace: false,
        });
        priv(provider)._getHtml = jest.fn().mockReturnValue('<html></html>');
        return provider.show();
    }

    it("sets multiRootResolved='true' when config lives outside folders[0]", async () => {
        setFolders([FOLDER_A, FOLDER_B, FOLDER_C]);
        const configPathC = path.join(FOLDER_C, CONFIG_NAME);
        mockFs.existsSync.mockImplementation((p: any) => String(p) === configPathC);

        const provider = makeProvider();
        await stubProviderUiAndOpen(provider);

        const call = mockTrackEvent.mock.calls.find(c => c[0] === 'KB.PanelOpened');
        expect(call).toBeDefined();
        expect(call![1]).toEqual(expect.objectContaining({ multiRootResolved: 'true' }));
    });

    it("sets multiRootResolved='false' when config lives in folders[0] of a multi-root workspace", async () => {
        setFolders([FOLDER_A, FOLDER_B, FOLDER_C]);
        const configPathA = path.join(FOLDER_A, CONFIG_NAME);
        mockFs.existsSync.mockImplementation((p: any) => String(p) === configPathA);

        const provider = makeProvider();
        await stubProviderUiAndOpen(provider);

        const call = mockTrackEvent.mock.calls.find(c => c[0] === 'KB.PanelOpened');
        expect(call!![1]).toEqual(expect.objectContaining({ multiRootResolved: 'false' }));
    });

    it("sets multiRootResolved='singleRoot' when only one folder is open", async () => {
        setFolders([FOLDER_A]);
        const provider = makeProvider();
        await stubProviderUiAndOpen(provider);

        const call = mockTrackEvent.mock.calls.find(c => c[0] === 'KB.PanelOpened');
        expect(call!![1]).toEqual(expect.objectContaining({ multiRootResolved: 'singleRoot' }));
    });
});
