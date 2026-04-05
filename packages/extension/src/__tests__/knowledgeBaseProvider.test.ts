/**
 * Tests for KnowledgeBaseProvider — covers the business logic added for
 * config loading, GitHub URL construction, and refresh behaviour.
 * The HTML generation and webview lifecycle are excluded (integration-only).
 */

import * as fs from 'fs';
import * as path from 'path';

// --- vscode mock -----------------------------------------------------------
const mockPostMessage = jest.fn();
const mockOpenExternal = jest.fn().mockResolvedValue(undefined);
const mockExecuteCommand = jest.fn().mockResolvedValue(undefined);
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
    workspace: { workspaceFolders: [{ uri: { fsPath: '/workspace' } }] },
}), { virtual: true });

// --- fs mock ---------------------------------------------------------------
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// --- @bctb/shared mock -----------------------------------------------------
const mockLoadAll = jest.fn().mockResolvedValue({
    communityArticles: [],
    localArticles: [],
    communitySource: 'github',
    excludedCount: 0,
    errors: [],
});
jest.mock('@bctb/shared', () => ({
    KnowledgeBaseService: jest.fn().mockImplementation(() => ({ loadAll: mockLoadAll })),
}));

import * as vscode from 'vscode';
import { KnowledgeBaseProvider } from '../webviews/KnowledgeBaseProvider.js';

// ---------------------------------------------------------------------------

const DEFAULT_SOURCE = 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/tree/main/knowledge-base';
const WORKSPACE = '/workspace';

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

function makeProvider() {
    return new KnowledgeBaseProvider({ fsPath: '/extension' } as any, mockOutputChannel as any);
}

// Helper to reach private methods
function priv(provider: KnowledgeBaseProvider): any {
    return provider as any;
}

// ---------------------------------------------------------------------------

beforeEach(() => {
    jest.clearAllMocks();
    (vscode.env.openExternal as jest.Mock).mockResolvedValue(undefined);
    (vscode.commands.executeCommand as jest.Mock).mockResolvedValue(undefined);
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readFileSync.mockReturnValue('{}');
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.mkdirSync.mockImplementation(() => undefined);
    mockFs.writeFileSync.mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// _loadKbConfig
// ---------------------------------------------------------------------------

describe('_loadKbConfig', () => {
    it('returns defaults when config file does not exist', () => {
        mockFs.existsSync.mockReturnValue(false);
        const cfg = priv(makeProvider())._loadKbConfig(WORKSPACE);
        expect(cfg.enabled).toBe(true);
        expect(cfg.source).toBe(DEFAULT_SOURCE);
        expect(cfg.exclude).toEqual([]);
        expect(cfg.cacheOnly).toBe(false);
    });

    it('reads source, exclude and enabled from config file', () => {
        const customSource = 'https://github.com/acme/kb/tree/main/kb';
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            knowledgeBase: {
                enabled: false,
                source: customSource,
                exclude: ['article-a', 'article-b'],
                autoRefresh: false,
                githubToken: 'tok',
            },
        }));

        const cfg = priv(makeProvider())._loadKbConfig(WORKSPACE);
        expect(cfg.enabled).toBe(false);
        expect(cfg.source).toBe(customSource);
        expect(cfg.exclude).toEqual(['article-a', 'article-b']);
        expect(cfg.githubToken).toBe('tok');
    });

    it('always sets cacheOnly to false (explicit refresh should hit GitHub)', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            knowledgeBase: { cacheOnly: true },
        }));
        const cfg = priv(makeProvider())._loadKbConfig(WORKSPACE);
        expect(cfg.cacheOnly).toBe(false);
    });

    it('falls back to defaults when config file is malformed JSON', () => {
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue('NOT JSON{{{');
        const cfg = priv(makeProvider())._loadKbConfig(WORKSPACE);
        expect(cfg.source).toBe(DEFAULT_SOURCE);
    });
});

// ---------------------------------------------------------------------------
// _handleOpenArticle — community articles
// ---------------------------------------------------------------------------

describe('_handleOpenArticle (community)', () => {
    const cases: Array<[string, string]> = [
        ['query-pattern',        'query-patterns'],
        ['event-interpretation', 'event-interpretations'],
        ['playbook',             'playbooks'],
        ['vendor-pattern',       'vendor-patterns'],
    ];

    test.each(cases)('maps category "%s" to directory "%s"', async (category, dir) => {
        const provider = makeProvider();
        await priv(provider)._handleOpenArticle('my-article', 'community', category);

        expect(vscode.env.openExternal).toHaveBeenCalledTimes(1);
        const uri = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
        expect(uri._raw).toContain(`/blob/main/knowledge-base/${dir}/my-article.md`);
    });

    it('converts /tree/ to /blob/ in the GitHub URL', async () => {
        const provider = makeProvider();
        await priv(provider)._handleOpenArticle('lock-timeout-investigation', 'community', 'query-pattern');

        const uri = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
        expect(uri._raw).toContain('/blob/');
        expect(uri._raw).not.toContain('/tree/');
    });

    it('uses a custom source URL from config', async () => {
        const customSource = 'https://github.com/acme/mykb/tree/main/articles';
        mockFs.existsSync.mockReturnValue(true);
        mockFs.readFileSync.mockReturnValue(JSON.stringify({
            knowledgeBase: { source: customSource },
        }));

        const provider = makeProvider();
        await priv(provider)._handleOpenArticle('my-article', 'community', 'playbook');

        const uri = (vscode.env.openExternal as jest.Mock).mock.calls[0][0];
        expect(uri._raw).toBe('https://github.com/acme/mykb/blob/main/articles/playbooks/my-article.md');
    });
});

// ---------------------------------------------------------------------------
// _handleOpenArticle — local articles
// ---------------------------------------------------------------------------

describe('_handleOpenArticle (local)', () => {
    it('opens the file in VSCode when found in the category directory', async () => {
        const filePath = path.join(WORKSPACE, '.vscode', '.bctb', 'knowledge', 'query-pattern', 'my-query.md');
        mockFs.existsSync.mockImplementation((p: any) => String(p) === filePath);

        const provider = makeProvider();
        await priv(provider)._handleOpenArticle('my-query', 'local', 'query-pattern');

        expect(vscode.commands.executeCommand).toHaveBeenCalledWith('vscode.open', expect.objectContaining({ fsPath: filePath }));
    });

    it('does nothing when the file is not found', async () => {
        mockFs.existsSync.mockReturnValue(false);
        const provider = makeProvider();
        await priv(provider)._handleOpenArticle('missing', 'local');
        expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// _refreshFromGitHub
// ---------------------------------------------------------------------------

describe('_refreshFromGitHub', () => {
    async function openPanel(provider: KnowledgeBaseProvider) {
        // Stub out the HTML generation so show() doesn't error
        priv(provider)._loadArticleData = jest.fn().mockReturnValue({
            community: [], local: [], excludeCount: 0, kbEnabled: true, noWorkspace: false,
        });
        priv(provider)._getHtml = jest.fn().mockReturnValue('<html></html>');
        await provider.show();
    }

    it('posts "downloading" message before fetching', async () => {
        const provider = makeProvider();
        await openPanel(provider);
        mockPostMessage.mockClear();

        await priv(provider)._refreshFromGitHub();

        expect(mockPostMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'downloading' }));
    });

    it('calls KnowledgeBaseService.loadAll() to fetch from GitHub', async () => {
        const provider = makeProvider();
        await openPanel(provider);

        await priv(provider)._refreshFromGitHub();

        expect(mockLoadAll).toHaveBeenCalledTimes(1);
    });

    it('sends updated articles to webview after fetch completes', async () => {
        const provider = makeProvider();
        await openPanel(provider);
        mockPostMessage.mockClear();

        await priv(provider)._refreshFromGitHub();

        const calls = mockPostMessage.mock.calls.map((c: any[]) => c[0].type);
        expect(calls).toContain('downloading');
        expect(calls).toContain('articles');
        expect(calls.indexOf('downloading')).toBeLessThan(calls.indexOf('articles'));
    });

    it('still sends articles even when GitHub fetch throws', async () => {
        mockLoadAll.mockRejectedValueOnce(new Error('network error'));
        const provider = makeProvider();
        await openPanel(provider);
        mockPostMessage.mockClear();

        await priv(provider)._refreshFromGitHub();

        const types = mockPostMessage.mock.calls.map((c: any[]) => c[0].type);
        expect(types).toContain('articles');
    });

    it('does nothing when there is no workspace', async () => {
        (vscode.workspace as any).workspaceFolders = undefined;
        const provider = makeProvider();
        await priv(provider)._refreshFromGitHub();
        expect(mockLoadAll).not.toHaveBeenCalled();
        (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: WORKSPACE } }];
    });
});
