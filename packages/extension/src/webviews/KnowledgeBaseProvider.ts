/**
 * Knowledge Base Webview Provider
 *
 * Displays community and local KB articles, lets the user toggle excludes,
 * and open article content in a read-only preview.
 *
 * Architecture note: the KB is loaded by the MCP server at startup.
 * The extension reads the community cache and local articles directly from
 * disk so the webview works even when MCP is not running.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { KnowledgeBaseService, KBConfig } from '@bctb/shared';

const DEFAULT_KB_SOURCE = 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/tree/main/knowledge-base';

// Frontmatter category values (singular) → GitHub/local directory names (plural)
const KB_CATEGORY_DIRS: Record<string, string> = {
    'query-pattern':        'query-patterns',
    'event-interpretation': 'event-interpretations',
    'playbook':             'playbooks',
    'vendor-pattern':       'vendor-patterns',
};

interface KBArticleInfo {
    id: string;
    title: string;
    category: string;
    tags: string[];
    eventIds?: string[];
    source: 'community' | 'local';
    excluded: boolean;
}

export class KnowledgeBaseProvider {
    public static readonly viewType = 'bctb.knowledgeBase';
    private _panel?: vscode.WebviewPanel;
    private _disposables: vscode.Disposable[] = [];
    private _outputChannel: vscode.OutputChannel;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        outputChannel: vscode.OutputChannel
    ) {
        this._outputChannel = outputChannel;
    }

    public dispose() {
        this._disposables.forEach(d => d.dispose());
        this._disposables = [];
        if (this._panel) {
            this._panel.dispose();
            this._panel = undefined;
        }
    }

    public async show() {
        const column = vscode.window.activeTextEditor?.viewColumn ?? vscode.ViewColumn.One;

        if (this._panel) {
            this._panel.reveal(column);
            await this._sendArticles();
            return;
        }

        this._panel = vscode.window.createWebviewPanel(
            KnowledgeBaseProvider.viewType,
            'BC Telemetry Buddy — Knowledge Base',
            column,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
            }
        );

        // Load data up-front and embed in HTML so the page renders immediately
        // without depending on a message-passing handshake.
        const initialData = this._loadArticleData();
        this._panel.webview.html = this._getHtml(initialData);

        this._panel.webview.onDidReceiveMessage(
            async (message) => {
                try {
                    switch (message.type) {
                        case 'toggleExclude':
                            await this._handleToggleExclude(message.id, message.excluded);
                            break;
                        case 'excludeAll':
                            await this._handleExcludeAll(message.exclude);
                            break;
                        case 'openArticle':
                            await this._handleOpenArticle(message.id, message.source, message.category);
                            break;
                        case 'refresh':
                            await this._refreshFromGitHub();
                            break;
                    }
                } catch (err: any) {
                    this._outputChannel.appendLine(`[KB] Error handling message '${message.type}': ${err.message}`);
                }
            },
            null,
            this._disposables
        );

        this._panel.onDidDispose(
            () => {
                this._panel = undefined;
            },
            null,
            this._disposables
        );
    }

    // --- Private helpers ---

    private _getWorkspacePath(): string | undefined {
        const folders = vscode.workspace.workspaceFolders;
        return folders && folders.length > 0 ? folders[0].uri.fsPath : undefined;
    }

    private _getConfigPath(workspacePath: string): string {
        return path.join(workspacePath, '.bctb-config.json');
    }

    private _loadExcludeList(workspacePath: string): string[] {
        try {
            const config = JSON.parse(fs.readFileSync(this._getConfigPath(workspacePath), 'utf-8'));
            return config?.knowledgeBase?.exclude ?? [];
        } catch {
            return [];
        }
    }

    private _loadKbEnabled(workspacePath: string): boolean {
        try {
            const config = JSON.parse(fs.readFileSync(this._getConfigPath(workspacePath), 'utf-8'));
            return config?.knowledgeBase?.enabled !== false;
        } catch {
            return true;
        }
    }

    private _saveExcludeList(workspacePath: string, excludes: string[]): void {
        const configPath = this._getConfigPath(workspacePath);
        let config: any = {};
        try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* start fresh */ }

        if (!config.knowledgeBase) config.knowledgeBase = {};
        config.knowledgeBase.exclude = excludes;
        fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
    }

    private _loadCommunityArticles(workspacePath: string): KBArticleInfo[] {
        try {
            const cachePath = path.join(workspacePath, '.vscode', '.bctb', 'kb-cache', 'community-articles.json');
            const raw = fs.readFileSync(cachePath, 'utf-8');
            const articles = JSON.parse(raw) as any[];
            return articles.map(a => ({
                id: a.id,
                title: a.title,
                category: a.category,
                tags: a.tags ?? [],
                eventIds: a.eventIds ?? [],
                source: 'community' as const,
                excluded: false,
            }));
        } catch {
            return [];
        }
    }

    private _loadLocalArticles(workspacePath: string): KBArticleInfo[] {
        return this._scanDir(path.join(workspacePath, '.vscode', '.bctb', 'knowledge'));
    }

    private _scanDir(dirPath: string): KBArticleInfo[] {
        const results: KBArticleInfo[] = [];
        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                const full = path.join(dirPath, entry.name);
                if (entry.isDirectory()) {
                    results.push(...this._scanDir(full));
                } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
                    const slug = entry.name.replace(/\.md$/, '');
                    const info = this._parseArticleInfo(full, slug);
                    if (info) results.push(info);
                }
            }
        } catch { /* skip unreadable dirs */ }
        return results;
    }

    private _parseArticleInfo(filePath: string, slug: string): KBArticleInfo | null {
        try {
            const raw = fs.readFileSync(filePath, 'utf-8');
            const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/);
            if (!fmMatch) return null;
            const fm = fmMatch[1];
            const title = fm.match(/title:\s*["']?(.+?)["']?\s*$/m)?.[1] ?? slug;
            const category = fm.match(/category:\s*(\S+)/m)?.[1] ?? 'query-pattern';
            const tagsRaw = fm.match(/tags:\s*\[([^\]]*)\]/m)?.[1] ?? '';
            const tags = tagsRaw.split(',').map(t => t.trim().replace(/^["']|["']$/g, '')).filter(Boolean);
            return { id: slug, title, category, tags, source: 'local', excluded: false };
        } catch {
            return null;
        }
    }

    private _loadArticleData(): { community: KBArticleInfo[]; local: KBArticleInfo[]; excludeCount: number; kbEnabled: boolean; noWorkspace: boolean } {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) {
            return { community: [], local: [], excludeCount: 0, kbEnabled: true, noWorkspace: true };
        }
        const excludes = this._loadExcludeList(workspacePath);
        const kbEnabled = this._loadKbEnabled(workspacePath);
        const community = this._loadCommunityArticles(workspacePath).map(a => ({ ...a, excluded: excludes.includes(a.id) }));
        const local = this._loadLocalArticles(workspacePath);
        return { community, local, excludeCount: excludes.length, kbEnabled, noWorkspace: false };
    }

    private async _sendArticles() {
        const data = this._loadArticleData();
        if (data.noWorkspace) {
            this._outputChannel.appendLine('[KB] No workspace path, cannot load articles');
            this._panel?.webview.postMessage({ type: 'noWorkspace' });
            return;
        }
        this._outputChannel.appendLine(`[KB] Sending ${data.community.length} community, ${data.local.length} local articles to webview`);
        this._panel?.webview.postMessage({
            type: 'articles',
            community: data.community,
            local: data.local,
            excludeCount: data.excludeCount,
            kbEnabled: data.kbEnabled,
        });
    }

    private _loadKbConfig(workspacePath: string): KBConfig {
        try {
            const config = JSON.parse(fs.readFileSync(this._getConfigPath(workspacePath), 'utf-8'));
            if (config?.knowledgeBase) {
                return {
                    enabled: config.knowledgeBase.enabled !== false,
                    source: config.knowledgeBase.source ?? DEFAULT_KB_SOURCE,
                    exclude: config.knowledgeBase.exclude ?? [],
                    autoRefresh: config.knowledgeBase.autoRefresh ?? true,
                    cacheOnly: false,
                    githubToken: config.knowledgeBase.githubToken,
                };
            }
        } catch { /* use defaults */ }
        return { enabled: true, source: DEFAULT_KB_SOURCE, exclude: [], autoRefresh: true, cacheOnly: false };
    }

    private async _refreshFromGitHub() {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) return;

        this._panel?.webview.postMessage({ type: 'downloading' });
        this._outputChannel.appendLine('[KB] Refreshing community articles from GitHub…');

        try {
            const kbConfig = this._loadKbConfig(workspacePath);
            const service = new KnowledgeBaseService(workspacePath, kbConfig);
            await service.loadAll(); // fetches from GitHub and writes cache
            this._outputChannel.appendLine('[KB] Community articles refreshed from GitHub');
        } catch (err: any) {
            this._outputChannel.appendLine(`[KB] GitHub refresh failed: ${err.message}`);
        }

        await this._sendArticles();
    }

    private async _handleToggleExclude(id: string, excluded: boolean) {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) return;

        const excludes = this._loadExcludeList(workspacePath);
        const next = excluded
            ? [...excludes.filter(e => e !== id), id]
            : excludes.filter(e => e !== id);

        try {
            this._saveExcludeList(workspacePath, next);
            this._outputChannel.appendLine(`[KB] ${excluded ? 'Excluded' : 'Included'} article: ${id}`);
            // Reflect change in UI immediately
            this._panel?.webview.postMessage({ type: 'excludeUpdated', id, excluded, total: next.length });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to update KB exclude list: ${err.message}`);
        }
    }

    private async _handleExcludeAll(exclude: boolean) {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) return;

        try {
            const configPath = this._getConfigPath(workspacePath);
            let config: any = {};
            try { config = JSON.parse(fs.readFileSync(configPath, 'utf-8')); } catch { /* start fresh */ }

            if (!config.knowledgeBase) config.knowledgeBase = {};
            config.knowledgeBase.enabled = !exclude;
            fs.writeFileSync(configPath, JSON.stringify(config, null, 4), 'utf-8');
            this._outputChannel.appendLine(`[KB] Community KB ${exclude ? 'disabled' : 'enabled'} (enabled: ${!exclude})`);
            await this._sendArticles();
            this._panel?.webview.postMessage({ type: 'kbEnabledChanged', enabled: !exclude });
        } catch (err: any) {
            vscode.window.showErrorMessage(`Failed to update KB enabled state: ${err.message}`);
        }
    }

    private async _handleOpenArticle(id: string, source: 'community' | 'local', category?: string) {
        const workspacePath = this._getWorkspacePath();
        if (!workspacePath) return;

        // For local articles, open the file directly
        if (source === 'local') {
            for (const cat of Object.keys(KB_CATEGORY_DIRS)) {
                const filePath = path.join(workspacePath, '.vscode', '.bctb', 'knowledge', cat, `${id}.md`);
                if (fs.existsSync(filePath)) {
                    await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(filePath));
                    return;
                }
            }
        }

        // For community articles, open in browser at the GitHub source URL
        if (source === 'community') {
            try {
                const kbConfig = this._loadKbConfig(workspacePath);
                const blobBase = kbConfig.source.replace('/tree/', '/blob/');
                const dirName = KB_CATEGORY_DIRS[category ?? ''] ?? category ?? '';
                const url = `${blobBase}/${dirName}/${id}.md`;
                await vscode.env.openExternal(vscode.Uri.parse(url));
            } catch (err: any) {
                this._outputChannel.appendLine(`[KB] Failed to open article in browser: ${err.message}`);
            }
        }
    }

    private _getHtml(initialData: ReturnType<KnowledgeBaseProvider['_loadArticleData']>): string {
        const safeJson = (v: unknown) => JSON.stringify(v).replace(/<\//g, '<\\/');
        const nonce = [...Array(32)].map(() => Math.floor(Math.random() * 36).toString(36)).join('');
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Knowledge Base</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background: var(--vscode-editor-background);
            margin: 0;
            padding: 16px;
        }
        h1 { font-size: 1.2em; margin-bottom: 4px; }
        .subtitle { color: var(--vscode-descriptionForeground); font-size: 0.9em; margin-bottom: 16px; }
        .toolbar {
            display: flex; align-items: center; gap: 12px;
            margin-bottom: 16px;
            flex-wrap: wrap;
        }
        input[type="text"] {
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border, #555);
            padding: 4px 8px;
            border-radius: 3px;
            font-size: inherit;
            flex: 1;
            min-width: 160px;
        }
        select {
            background: var(--vscode-dropdown-background);
            color: var(--vscode-dropdown-foreground);
            border: 1px solid var(--vscode-dropdown-border, #555);
            padding: 4px 6px;
            border-radius: 3px;
            font-size: inherit;
        }
        button {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 4px 12px;
            border-radius: 3px;
            cursor: pointer;
            font-size: inherit;
        }
        button:hover { background: var(--vscode-button-hoverBackground); }
        .section-header {
            font-weight: 600;
            font-size: 0.95em;
            color: var(--vscode-descriptionForeground);
            text-transform: uppercase;
            letter-spacing: 0.05em;
            margin: 12px 0 6px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--vscode-panel-border, #444);
        }
        .article-row {
            display: flex;
            align-items: flex-start;
            gap: 10px;
            padding: 8px 6px;
            border-radius: 4px;
            cursor: pointer;
        }
        .article-row:hover { background: var(--vscode-list-hoverBackground); }
        .article-row.excluded { opacity: 0.45; }
        .article-info { flex: 1; min-width: 0; }
        .article-title {
            font-weight: 500;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .article-title.link:hover { text-decoration: underline; color: var(--vscode-textLink-foreground); }
        .article-meta { font-size: 0.82em; color: var(--vscode-descriptionForeground); margin-top: 2px; }
        .badge {
            display: inline-block;
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 0.78em;
            font-weight: 500;
            flex-shrink: 0;
            margin-top: 2px;
        }
        .badge-community { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
        .badge-local { background: #2d5a27; color: #aaffaa; }
        .badge-excluded { background: #5a2727; color: #ffaaaa; }
        .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 8px 6px; }
        .stats-bar {
            font-size: 0.85em;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
        }
        .modal-overlay {
            display: none;
            position: fixed; inset: 0;
            background: rgba(0,0,0,0.5);
            z-index: 100;
            overflow-y: auto;
            padding: 32px 16px;
        }
        .modal {
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border, #444);
            border-radius: 6px;
            max-width: 720px;
            margin: 0 auto;
            padding: 24px;
        }
        .modal h2 { margin-top: 0; font-size: 1.1em; }
        .modal pre {
            white-space: pre-wrap;
            word-break: break-word;
            background: var(--vscode-textCodeBlock-background, #1e1e1e);
            padding: 12px;
            border-radius: 4px;
            font-family: var(--vscode-editor-font-family);
            font-size: 0.9em;
            overflow-x: auto;
        }
        .close-btn { float: right; background: transparent; color: var(--vscode-foreground); font-size: 1.2em; padding: 0 6px; }
    </style>
</head>
<body>
    <h1>Knowledge Base</h1>
    <p class="subtitle">Community and local KB articles loaded by the MCP server at startup.</p>

    <div class="toolbar">
        <input type="text" id="searchInput" placeholder="Search title / tag / event ID...">
        <select id="categoryFilter">
            <option value="">All categories</option>
            <option value="query-pattern">Query Patterns</option>
            <option value="event-interpretation">Event Interpretations</option>
            <option value="playbook">Playbooks</option>
            <option value="vendor-pattern">Vendor Patterns</option>
        </select>
        <select id="sourceFilter">
            <option value="">All sources</option>
            <option value="community">Community</option>
            <option value="local">Local</option>
        </select>
        <button id="refreshBtn">↻ Refresh</button>
        <button id="excludeAllBtn" title="Disable entire community KB (sets enabled: false in config)">Disable Community KB</button>
    </div>

    <div id="stats" class="stats-bar">Loading…</div>
    <div id="content"></div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let allCommunity = ${safeJson(initialData.community)};
        let allLocal = ${safeJson(initialData.local)};
        let kbEnabled = ${safeJson(initialData.kbEnabled)};

        // Wire up static controls via addEventListener (inline onclick blocked by CSP nonce policy)
        document.getElementById('searchInput').addEventListener('input', filterArticles);
        document.getElementById('categoryFilter').addEventListener('change', filterArticles);
        document.getElementById('sourceFilter').addEventListener('change', filterArticles);
        document.getElementById('refreshBtn').addEventListener('click', function() {
            vscode.postMessage({ type: 'refresh' });
        });
        document.getElementById('excludeAllBtn').addEventListener('click', function() {
            vscode.postMessage({ type: 'excludeAll', exclude: kbEnabled });
        });

        // Event delegation for dynamically rendered article rows
        document.getElementById('content').addEventListener('click', function(event) {
            const target = event.target;
            const toggleEl = target.closest('[data-action="toggleExclude"]');
            if (toggleEl) {
                event.stopPropagation();
                vscode.postMessage({
                    type: 'toggleExclude',
                    id: toggleEl.dataset.id,
                    excluded: toggleEl.dataset.excluded !== 'true',
                });
                return;
            }
            const openEl = target.closest('[data-action="openArticle"]');
            if (openEl) {
                vscode.postMessage({
                    type: 'openArticle',
                    id: openEl.dataset.id,
                    source: openEl.dataset.source,
                    category: openEl.dataset.category,
                });
            }
        });

        // Render initial data immediately — no message handshake needed
        if (${initialData.noWorkspace}) {
            document.getElementById('content').innerHTML = '<p class="empty">No workspace open. Open a folder to use the Knowledge Base.</p>';
            document.getElementById('stats').textContent = '';
        } else {
            renderStats(allCommunity.length, allLocal.length, ${safeJson(initialData.excludeCount)});
            updateExcludeAllBtn();
            filterArticles();
        }

        window.addEventListener('message', event => {
            const msg = event.data;
            switch (msg.type) {
                case 'downloading':
                    document.getElementById('stats').textContent = 'Downloading community articles from GitHub…';
                    document.getElementById('refreshBtn').disabled = true;
                    break;
                case 'articles':
                    allCommunity = msg.community;
                    allLocal = msg.local;
                    kbEnabled = msg.kbEnabled !== false;
                    renderStats(msg.community.length, msg.local.length, msg.excludeCount);
                    updateExcludeAllBtn();
                    filterArticles();
                    document.getElementById('refreshBtn').disabled = false;
                    break;
                case 'noWorkspace':
                    document.getElementById('content').innerHTML = '<p class="empty">No workspace open. Open a folder to use the Knowledge Base.</p>';
                    document.getElementById('stats').textContent = '';
                    break;
                case 'excludeUpdated': {
                    const a = allCommunity.find(x => x.id === msg.id);
                    if (a) { a.excluded = msg.excluded; }
                    filterArticles();
                    renderStats(allCommunity.length, allLocal.length, msg.total);
                    break;
                }
                case 'kbEnabledChanged':
                    kbEnabled = msg.enabled;
                    updateExcludeAllBtn();
                    break;
            }
        });

        function renderStats(community, local, excluded) {
            document.getElementById('stats').textContent =
                community + ' community articles (' + excluded + ' excluded)  ·  ' + local + ' local articles';
        }

        function updateExcludeAllBtn() {
            const btn = document.getElementById('excludeAllBtn');
            if (btn) {
                btn.textContent = kbEnabled ? 'Disable Community KB' : 'Enable Community KB';
                btn.title = kbEnabled
                    ? 'Disable entire community KB (sets enabled: false in config)'
                    : 'Re-enable community KB (sets enabled: true in config)';
            }
        }

        function filterArticles() {
            const q = document.getElementById('searchInput').value.toLowerCase();
            const cat = document.getElementById('categoryFilter').value;
            const src = document.getElementById('sourceFilter').value;

            const filterFn = a => {
                if (cat && a.category !== cat) return false;
                if (src && a.source !== src) return false;
                if (q) {
                    const inTitle = a.title.toLowerCase().includes(q);
                    const inTags = a.tags.some(t => t.toLowerCase().includes(q));
                    const inEventIds = (a.eventIds ?? []).some(e => e.toLowerCase().includes(q));
                    if (!inTitle && !inTags && !inEventIds) return false;
                }
                return true;
            };

            renderArticles(allCommunity.filter(filterFn), allLocal.filter(filterFn));
        }

        function renderArticles(community, local) {
            if (community.length === 0 && local.length === 0) {
                document.getElementById('content').innerHTML = '<p class="empty">No articles match your filter.</p>';
                return;
            }
            let html = '';
            if (community.length > 0) {
                html += '<div class="section-header">Community (' + community.length + ')</div>';
                for (const a of community) { html += renderRow(a); }
            }
            if (local.length > 0) {
                html += '<div class="section-header">Local (' + local.length + ')</div>';
                for (const a of local) { html += renderRow(a); }
            }
            document.getElementById('content').innerHTML = html;
        }

        function renderRow(a) {
            const excluded = a.excluded;
            const tagsHtml = a.tags.slice(0, 4).map(t => '<span style="margin-right:4px;opacity:0.8">' + escHtml(t) + '</span>').join('');
            const badgeClass = a.source === 'local' ? 'badge-local' : 'badge-community';
            const checkIcon = a.source === 'community' ? (excluded ? '☐' : '☑') : '';
            const checkTitle = a.source === 'community' ? (excluded ? 'Click to include' : 'Click to exclude') : '';
            // data-action attributes used by delegated click handler (inline onclick blocked by CSP)
            return '<div class="article-row' + (excluded ? ' excluded' : '') + '">' +
                (a.source === 'community'
                    ? '<span title="' + escHtml(checkTitle) + '" style="font-size:1.2em;cursor:pointer;flex-shrink:0;margin-top:1px"' +
                      ' data-action="toggleExclude" data-id="' + escAttr(a.id) + '" data-excluded="' + excluded + '">' + checkIcon + '</span>'
                    : '<span style="width:1.2em;flex-shrink:0"></span>') +
                '<div class="article-info">' +
                '<div class="article-title link"' +
                ' data-action="openArticle" data-id="' + escAttr(a.id) + '" data-source="' + a.source + '" data-category="' + escAttr(a.category) + '">' +
                escHtml(a.title) + '</div>' +
                '<div class="article-meta">' + escHtml(a.category) + (tagsHtml ? '&nbsp;· ' + tagsHtml : '') + '</div>' +
                '</div>' +
                '<span class="badge ' + badgeClass + '">' + a.source + '</span>' +
                (excluded ? '<span class="badge badge-excluded">excluded</span>' : '') +
                '</div>';
        }

        function escHtml(str) {
            return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
        }
        function escAttr(str) {
            return String(str).replace(/'/g,'&#39;').replace(/"/g,'&quot;');
        }
    </script>
</body>
</html>`;
    }
}
