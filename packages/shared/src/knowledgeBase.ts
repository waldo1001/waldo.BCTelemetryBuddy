/**
 * Knowledge Base Service — loads and searches community + local KB articles.
 * 
 * Two-layer architecture:
 * 1. Community KB: fetched from GitHub (cached for offline fallback)
 * 2. Local KB: read from workspace filesystem
 * 
 * Both use identical .md format with YAML frontmatter.
 * Eagerly loaded at MCP startup, served from memory during session.
 */

import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

// --- Types ---

export type KBCategory = 'query-pattern' | 'event-interpretation' | 'playbook' | 'vendor-pattern';

export interface KBArticle {
    id: string;
    title: string;
    category: KBCategory;
    tags: string[];
    eventIds?: string[];
    appliesTo?: string;
    author?: string;
    created?: string;
    updated?: string;
    content: string;
    source: 'community' | 'local';
}

export interface KBConfig {
    enabled: boolean;
    source: string;
    exclude: string[];
    autoRefresh: boolean;
    cacheOnly: boolean;
    githubToken?: string;
}

export interface KBSaveParams {
    title: string;
    category: KBCategory;
    tags?: string[];
    eventIds?: string[];
    appliesTo?: string;
    content: string;
    author?: string;
}

export interface KBSaveResult {
    success: boolean;
    id: string;
    path: string;
    message: string;
}

export interface KBContributeResult {
    success: boolean;
    id: string;
    prUrl: string;
    message: string;
}

export interface KBLoadResult {
    communityArticles: KBArticle[];
    localArticles: KBArticle[];
    communitySource: 'github' | 'cache' | 'disabled';
    excludedCount: number;
    errors: string[];
}

export interface KBSearchParams {
    category?: string;
    tags?: string[];
    eventId?: string;
    search?: string;
    source?: 'community' | 'local' | 'all';
}

export interface KBSummary {
    community: number;
    local: number;
    excluded: number;
    source: string;
}

// --- Service ---

export class KnowledgeBaseService {
    private workspacePath: string;
    private config: KBConfig;
    private client: AxiosInstance;
    private articles: KBArticle[] = [];
    private excludedCount: number = 0;
    private loadSource: string = 'disabled';

    constructor(workspacePath: string, kbConfig: KBConfig, httpClient?: AxiosInstance) {
        this.workspacePath = workspacePath;
        this.config = kbConfig;
        this.client = httpClient || axios.create({
            timeout: 30000,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'BC-Telemetry-Buddy-KB',
            },
        });
    }

    /**
     * Parse YAML frontmatter from a raw .md string.
     * Returns null if frontmatter is missing or unparseable.
     * Uses simple regex parsing to avoid adding gray-matter dependency.
     */
    parseFrontmatter(raw: string, slug: string): KBArticle | null {
        const fmMatch = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (!fmMatch) {
            return null;
        }

        const yamlBlock = fmMatch[1];
        const content = fmMatch[2].trim();

        try {
            const meta = this.parseSimpleYaml(yamlBlock);

            if (!meta.title || !meta.category) {
                return null;
            }

            return {
                id: slug,
                title: String(meta.title).replace(/^["']|["']$/g, ''),
                category: String(meta.category) as KBCategory,
                tags: this.parseYamlArray(meta.tags),
                eventIds: meta.eventIds ? this.parseYamlArray(meta.eventIds) : undefined,
                appliesTo: meta.appliesTo ? String(meta.appliesTo).replace(/^["']|["']$/g, '') : undefined,
                author: meta.author ? String(meta.author) : undefined,
                created: meta.created ? String(meta.created) : undefined,
                updated: meta.updated ? String(meta.updated) : undefined,
                content,
                source: 'community', // default, overridden by caller
            };
        } catch {
            return null;
        }
    }

    /**
     * Eagerly load both community and local KB layers.
     * Called once at MCP startup.
     */
    async loadAll(): Promise<KBLoadResult> {
        const errors: string[] = [];
        let communityArticles: KBArticle[] = [];
        let communitySource: 'github' | 'cache' | 'disabled' = 'disabled';
        let excludedCount = 0;

        // --- Community KB ---
        if (this.config.enabled) {
            if (this.config.cacheOnly) {
                communityArticles = this.loadCommunityFromCache();
                communitySource = 'cache';
            } else {
                try {
                    communityArticles = await this.fetchCommunityFromGitHub();
                    communitySource = 'github';
                    this.saveCommunityToCache(communityArticles);
                } catch (err: any) {
                    errors.push(`GitHub fetch failed: ${err.message}`);
                    communityArticles = this.loadCommunityFromCache();
                    communitySource = 'cache';
                    if (communityArticles.length === 0) {
                        errors.push('No cached community KB available');
                    }
                }
            }

            // Apply excludes
            const beforeExclude = communityArticles.length;
            communityArticles = communityArticles.filter(
                a => !this.config.exclude.includes(a.id)
            );
            excludedCount = beforeExclude - communityArticles.length;
        }

        // --- Local KB ---
        const localArticles = this.loadLocalArticles();

        // Merge into in-memory catalog (local first for priority)
        this.articles = [...localArticles, ...communityArticles];
        this.excludedCount = excludedCount;
        this.loadSource = communitySource;

        const sourceLabel = communitySource === 'github' ? 'GitHub [fresh]'
            : communitySource === 'cache' ? 'cache [offline]'
                : 'disabled';
        const total = communityArticles.length + localArticles.length;
        console.log(
            `KB loaded: ${communityArticles.length} community articles (${excludedCount} excluded), ` +
            `${localArticles.length} local articles. Source: ${sourceLabel} + local`
        );

        return {
            communityArticles,
            localArticles,
            communitySource,
            excludedCount,
            errors,
        };
    }

    /**
     * Search in-memory articles (instant after loadAll).
     */
    search(params: KBSearchParams): KBArticle[] {
        let results = [...this.articles];

        if (params.source && params.source !== 'all') {
            results = results.filter(a => a.source === params.source);
        }

        if (params.category) {
            results = results.filter(a => a.category === params.category);
        }

        if (params.tags && params.tags.length > 0) {
            const searchTags = params.tags.map(t => t.toLowerCase());
            results = results.filter(a =>
                a.tags.some(tag => searchTags.includes(tag.toLowerCase()))
            );
        }

        if (params.eventId) {
            const eid = params.eventId.toUpperCase();
            results = results.filter(a =>
                a.eventIds?.some(e => e.toUpperCase() === eid)
            );
        }

        if (params.search) {
            const needle = params.search.toLowerCase();
            results = results.filter(a =>
                a.title.toLowerCase().includes(needle) ||
                a.content.toLowerCase().includes(needle)
            );
        }

        return results;
    }

    /**
     * Get summary counts for the loaded KB.
     */
    getSummary(): KBSummary {
        return {
            community: this.articles.filter(a => a.source === 'community').length,
            local: this.articles.filter(a => a.source === 'local').length,
            excluded: this.excludedCount,
            source: this.loadSource,
        };
    }

    /**
     * Save an article to the local workspace KB.
     * Writes to {workspace}/.vscode/.bctb/knowledge/{category}/{slug}.md
     * and adds it to the in-memory catalog immediately.
     */
    async saveArticle(params: KBSaveParams): Promise<KBSaveResult> {
        const slug = this.titleToSlug(params.title);
        const today = new Date().toISOString().slice(0, 10);
        const frontmatter = this.buildFrontmatter({ ...params, slug, created: today, updated: today });
        const fileContent = `${frontmatter}\n${params.content.trim()}\n`;

        const categoryDir = path.join(
            this.workspacePath, '.vscode', '.bctb', 'knowledge', params.category
        );
        if (!fs.existsSync(categoryDir)) {
            fs.mkdirSync(categoryDir, { recursive: true });
        }

        const filePath = path.join(categoryDir, `${slug}.md`);
        fs.writeFileSync(filePath, fileContent, 'utf-8');

        // Add to in-memory catalog (or replace existing local article with same slug)
        const article: KBArticle = {
            id: slug,
            title: params.title,
            category: params.category,
            tags: params.tags ?? [],
            eventIds: params.eventIds,
            appliesTo: params.appliesTo,
            author: params.author ?? 'local',
            created: today,
            updated: today,
            content: params.content.trim(),
            source: 'local',
        };
        const existing = this.articles.findIndex(a => a.id === slug && a.source === 'local');
        if (existing >= 0) {
            this.articles[existing] = article;
        } else {
            this.articles.unshift(article); // local first
        }

        const relPath = path.relative(this.workspacePath, filePath);
        return {
            success: true,
            id: slug,
            path: relPath,
            message: `Saved to ${relPath}. Available immediately in this session.`,
        };
    }

    /**
     * Contribute an article to the community KB by creating a GitHub PR.
     * Requires a GitHub token (knowledgeBase.githubToken or BCTB_GITHUB_TOKEN env var).
     */
    async contributeArticle(params: KBSaveParams): Promise<KBContributeResult> {
        const token = this.config.githubToken || process.env['BCTB_GITHUB_TOKEN'];
        if (!token) {
            throw new Error(
                'A GitHub token is required to contribute to the community KB. ' +
                'Set knowledgeBase.githubToken in .bctb-config.json or BCTB_GITHUB_TOKEN env var.'
            );
        }

        const repoInfo = this.parseGitHubURL(this.config.source);
        if (!repoInfo) {
            throw new Error(`Cannot parse community KB source URL: ${this.config.source}`);
        }

        const slug = this.titleToSlug(params.title);
        const today = new Date().toISOString().slice(0, 10);
        const frontmatter = this.buildFrontmatter({ ...params, slug, created: today, updated: today });
        const fileContent = `${frontmatter}\n${params.content.trim()}\n`;

        const authClient = axios.create({
            timeout: 30000,
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'User-Agent': 'BC-Telemetry-Buddy-KB',
                'Authorization': `token ${token}`,
            },
        });

        // 1. Get default branch SHA
        const repoResp = await authClient.get(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}`
        );
        const defaultBranch: string = repoResp.data.default_branch;
        const branchResp = await authClient.get(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/ref/heads/${defaultBranch}`
        );
        const baseSha: string = branchResp.data.object.sha;

        // 2. Create a new branch
        const branchName = `kb-contribution-${slug}-${Date.now()}`;
        await authClient.post(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/git/refs`,
            { ref: `refs/heads/${branchName}`, sha: baseSha }
        );

        // 3. Create the file on the branch
        const filePath = `${repoInfo.path}/${params.category}/${slug}.md`;
        await authClient.put(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/contents/${filePath}`,
            {
                message: `feat(kb): add ${params.category} article "${params.title}"`,
                content: Buffer.from(fileContent).toString('base64'),
                branch: branchName,
            }
        );

        // 4. Create PR
        const prResp = await authClient.post(
            `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/pulls`,
            {
                title: `KB: ${params.title}`,
                body: `Community Knowledge Base contribution\n\n**Category:** ${params.category}\n**Tags:** ${(params.tags ?? []).join(', ')}\n\nGenerated by BC Telemetry Buddy.`,
                head: branchName,
                base: defaultBranch,
            }
        );

        const prUrl: string = prResp.data.html_url;
        return {
            success: true,
            id: slug,
            prUrl,
            message: `Community PR created: ${prUrl}. Review and merge to publish.`,
        };
    }

    // --- Private helpers ---

    /**
     * Convert a title string to a URL-safe slug.
     */
    private titleToSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .trim()
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .slice(0, 64);
    }

    /**
     * Build YAML frontmatter block from save params.
     */
    private buildFrontmatter(p: KBSaveParams & { slug: string; created: string; updated: string }): string {
        const tags = (p.tags && p.tags.length > 0) ? `[${p.tags.join(', ')}]` : '[]';
        const eventIds = (p.eventIds && p.eventIds.length > 0) ? `[${p.eventIds.join(', ')}]` : undefined;
        const lines = [
            '---',
            `id: ${p.slug}`,
            `title: "${p.title.replace(/"/g, '\\"')}"`,
            `category: ${p.category}`,
            `tags: ${tags}`,
        ];
        if (eventIds) lines.push(`eventIds: ${eventIds}`);
        if (p.appliesTo) lines.push(`appliesTo: "${p.appliesTo}"`);
        lines.push(`author: ${p.author ?? 'local'}`);
        lines.push(`created: ${p.created}`);
        lines.push(`updated: ${p.updated}`);
        lines.push('---');
        return lines.join('\n') + '\n';
    }

    /**
     * Simple YAML key-value parser for frontmatter.
     * Handles: string values, quoted strings, bracket arrays.
     */
    private parseSimpleYaml(yaml: string): Record<string, any> {
        const result: Record<string, any> = {};
        const lines = yaml.split('\n');

        for (const line of lines) {
            const match = line.match(/^(\w+)\s*:\s*(.*)$/);
            if (match) {
                const key = match[1];
                let value: any = match[2].trim();

                // Bracket array: [a, b, c]
                if (value.startsWith('[') && value.endsWith(']')) {
                    result[key] = value; // store raw, parseYamlArray handles it
                } else {
                    result[key] = value;
                }
            }
        }

        return result;
    }

    /**
     * Parse a YAML-style bracket array string into string[].
     */
    private parseYamlArray(value: any): string[] {
        if (Array.isArray(value)) return value.map(String);
        const str = String(value);
        if (str.startsWith('[') && str.endsWith(']')) {
            return str.slice(1, -1)
                .split(',')
                .map(s => s.trim().replace(/^["']|["']$/g, ''))
                .filter(s => s.length > 0);
        }
        return [str];
    }

    /**
     * Parse a GitHub URL into owner/repo/path components.
     */
    private parseGitHubURL(url: string): { owner: string; repo: string; path: string } | null {
        const match = url.match(/github\.com\/([^\/]+)\/([^\/]+)(?:\/tree\/[^\/]+\/(.+))?/);
        if (!match) return null;
        return { owner: match[1], repo: match[2], path: match[3] || '' };
    }

    /**
     * Fetch community KB articles from GitHub Contents API.
     */
    private async fetchCommunityFromGitHub(): Promise<KBArticle[]> {
        const repoInfo = this.parseGitHubURL(this.config.source);
        if (!repoInfo) {
            throw new Error(`Invalid GitHub URL: ${this.config.source}`);
        }

        return this.fetchGitHubDirectory(repoInfo.owner, repoInfo.repo, repoInfo.path);
    }

    /**
     * Recursively fetch .md files from a GitHub directory.
     */
    private async fetchGitHubDirectory(
        owner: string,
        repo: string,
        dirPath: string
    ): Promise<KBArticle[]> {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}`;
        const response = await this.client.get(url);
        const items = response.data;

        if (!Array.isArray(items)) return [];

        const articles: KBArticle[] = [];

        for (const item of items) {
            if (item.type === 'file' && item.name.endsWith('.md') && item.name !== 'README.md') {
                const fileResponse = await this.client.get(item.download_url);
                const raw = typeof fileResponse.data === 'string'
                    ? fileResponse.data
                    : String(fileResponse.data);
                const slug = item.name.replace(/\.md$/, '');
                const article = this.parseFrontmatter(raw, slug);
                if (article) {
                    article.source = 'community';
                    articles.push(article);
                }
            } else if (item.type === 'dir') {
                const subArticles = await this.fetchGitHubDirectory(owner, repo, item.path);
                articles.push(...subArticles);
            }
        }

        return articles;
    }

    /**
     * Cache community articles to JSON file for offline fallback.
     */
    private saveCommunityToCache(articles: KBArticle[]): void {
        try {
            const cacheDir = path.join(this.workspacePath, '.vscode', '.bctb', 'kb-cache');
            if (!fs.existsSync(cacheDir)) {
                fs.mkdirSync(cacheDir, { recursive: true });
            }
            const cachePath = path.join(cacheDir, 'community-articles.json');
            fs.writeFileSync(cachePath, JSON.stringify(articles, null, 2), 'utf-8');
        } catch (err: any) {
            console.error(`Failed to cache KB articles: ${err.message}`);
        }
    }

    /**
     * Load community articles from cache file.
     */
    private loadCommunityFromCache(): KBArticle[] {
        try {
            const cachePath = path.join(
                this.workspacePath, '.vscode', '.bctb', 'kb-cache', 'community-articles.json'
            );
            if (!fs.existsSync(cachePath)) {
                return [];
            }
            const raw = fs.readFileSync(cachePath, 'utf-8');
            return JSON.parse(raw) as KBArticle[];
        } catch {
            return [];
        }
    }

    /**
     * Load local KB articles from workspace knowledge folder.
     * Scans {workspace}/.vscode/.bctb/knowledge/ recursively for .md files.
     */
    private loadLocalArticles(): KBArticle[] {
        const kbDir = path.join(this.workspacePath, '.vscode', '.bctb', 'knowledge');
        if (!fs.existsSync(kbDir)) {
            return [];
        }

        return this.scanDirectoryForArticles(kbDir, 'local');
    }

    /**
     * Recursively scan a directory for .md files and parse them.
     */
    private scanDirectoryForArticles(dirPath: string, source: 'community' | 'local'): KBArticle[] {
        const articles: KBArticle[] = [];

        try {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });

            for (const entry of entries) {
                const fullPath = path.join(dirPath, entry.name);

                if (entry.isDirectory()) {
                    articles.push(...this.scanDirectoryForArticles(fullPath, source));
                } else if (entry.isFile() && entry.name.endsWith('.md') && entry.name !== 'README.md') {
                    const raw = fs.readFileSync(fullPath, 'utf-8');
                    const slug = entry.name.replace(/\.md$/, '');
                    const article = this.parseFrontmatter(raw, slug);
                    if (article) {
                        article.source = source;
                        articles.push(article);
                    }
                }
            }
        } catch (err: any) {
            console.error(`Failed to scan KB directory ${dirPath}: ${err.message}`);
        }

        return articles;
    }
}
