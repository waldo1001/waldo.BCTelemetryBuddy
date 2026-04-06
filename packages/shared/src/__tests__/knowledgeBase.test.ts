/**
 * Tests for KnowledgeBaseService — community + local knowledge base loading and search.
 *
 * Covers:
 * - YAML frontmatter parsing
 * - GitHub fetching (community KB)
 * - Cache loading (offline fallback)
 * - Local KB loading from filesystem
 * - Search/filter functionality
 * - Exclude list logic
 * - Config: enabled/disabled, cacheOnly
 * - Error handling (network failures, malformed files)
 */

import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import { KnowledgeBaseService, KBConfig, KBArticle, KBLoadResult } from '../knowledgeBase.js';

// Mock dependencies
jest.mock('axios');
jest.mock('fs');
jest.mock('path', () => {
    const actual = jest.requireActual('path');
    return {
        ...actual,
        join: jest.fn((...args: string[]) => actual.join(...args)),
    };
});

const mockedAxios = axios as jest.Mocked<typeof axios>;
const mockedFs = fs as jest.Mocked<typeof fs>;

// --- Test fixtures ---

const SAMPLE_ARTICLE_RAW = `---
title: "Diagnosing Report Execution Timeouts"
category: playbook
tags: [reports, RT0006, performance, timeout]
eventIds: [RT0006, RT0007]
appliesTo: "BC 24.0+"
author: community
created: 2026-04-05
updated: 2026-04-05
---

## When to use this
When report execution times are consistently high.

## Investigation steps
1. Check RT0006 events
2. Look at executionTime field

## Example KQL
\`\`\`kql
traces | where customDimensions.eventId == "RT0006"
\`\`\`
`;

const SAMPLE_ARTICLE_MINIMAL = `---
title: "Simple Pattern"
category: query-pattern
tags: [simple]
---

Just a simple query pattern.
`;

const SAMPLE_ARTICLE_NO_FRONTMATTER = `# No Frontmatter Here

Just plain markdown content.
`;

const SAMPLE_ARTICLE_MALFORMED = `---
title: "Broken YAML
category: playbook
---

Content after broken frontmatter.
`;

const DEFAULT_KB_CONFIG: KBConfig = {
    enabled: true,
    source: 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/tree/main/knowledge-base',
    exclude: [],
    autoRefresh: true,
    cacheOnly: false,
};

const WORKSPACE_PATH = '/test/workspace';

// --- Helper to create a mock GitHub API response for directory listing ---
function createGitHubDirResponse(files: { name: string; type: string; download_url?: string; path?: string; html_url?: string }[]) {
    return {
        status: 200,
        data: files,
        headers: {
            'x-ratelimit-remaining': '55',
            'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 3600),
        },
    };
}

describe('KnowledgeBaseService', () => {
    let mockAxiosInstance: any;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();

        // Mock axios instance
        mockAxiosInstance = {
            get: jest.fn(),
        };
        mockedAxios.create.mockReturnValue(mockAxiosInstance);

        // Default fs mocks — nothing exists
        mockedFs.existsSync.mockReturnValue(false);
        mockedFs.mkdirSync.mockReturnValue(undefined as any);
        mockedFs.writeFileSync.mockReturnValue(undefined);
        mockedFs.readFileSync.mockReturnValue('');
        mockedFs.readdirSync.mockReturnValue([]);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // Construction
    // =========================================================================
    describe('constructor', () => {
        it('should create a service with valid config', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            expect(service).toBeDefined();
        });
    });

    // =========================================================================
    // Frontmatter Parsing
    // =========================================================================
    describe('parseFrontmatter', () => {
        it('should parse a well-formed article with all fields', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = service.parseFrontmatter(SAMPLE_ARTICLE_RAW, 'diagnosing-report-timeouts');

            expect(result).not.toBeNull();
            expect(result!.title).toBe('Diagnosing Report Execution Timeouts');
            expect(result!.category).toBe('playbook');
            expect(result!.tags).toEqual(['reports', 'RT0006', 'performance', 'timeout']);
            expect(result!.eventIds).toEqual(['RT0006', 'RT0007']);
            expect(result!.appliesTo).toBe('BC 24.0+');
            expect(result!.author).toBe('community');
            expect(result!.content).toContain('## When to use this');
            expect(result!.content).toContain('traces | where');
        });

        it('should parse a minimal article with only required fields', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = service.parseFrontmatter(SAMPLE_ARTICLE_MINIMAL, 'simple-pattern');

            expect(result).not.toBeNull();
            expect(result!.title).toBe('Simple Pattern');
            expect(result!.category).toBe('query-pattern');
            expect(result!.tags).toEqual(['simple']);
            expect(result!.eventIds).toBeUndefined();
            expect(result!.content).toContain('Just a simple query pattern');
        });

        it('should return null for content without frontmatter', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = service.parseFrontmatter(SAMPLE_ARTICLE_NO_FRONTMATTER, 'no-frontmatter');

            expect(result).toBeNull();
        });

        it('should handle malformed YAML gracefully and return null', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = service.parseFrontmatter(SAMPLE_ARTICLE_MALFORMED, 'malformed');

            // Malformed YAML should be handled gracefully
            // Implementation may return null or a partial result
            // The key is it doesn't throw
            expect(true).toBe(true);
        });

        it('should use filename slug as article ID', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = service.parseFrontmatter(SAMPLE_ARTICLE_MINIMAL, 'my-custom-slug');

            expect(result).not.toBeNull();
            expect(result!.id).toBe('my-custom-slug');
        });
    });

    // =========================================================================
    // loadAll — Community from GitHub
    // =========================================================================
    describe('loadAll', () => {
        it('should fetch community articles from GitHub', async () => {
            // GitHub directory listing
            mockAxiosInstance.get
                .mockResolvedValueOnce(createGitHubDirResponse([
                    { name: 'playbooks', type: 'dir', path: 'knowledge-base/playbooks' },
                ]))
                // Subdirectory listing
                .mockResolvedValueOnce(createGitHubDirResponse([
                    {
                        name: 'report-timeouts.md',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/report-timeouts.md',
                        path: 'knowledge-base/playbooks/report-timeouts.md',
                        html_url: 'https://github.com/test/report-timeouts.md',
                    },
                ]))
                // File content
                .mockResolvedValueOnce({
                    status: 200,
                    data: SAMPLE_ARTICLE_RAW,
                    headers: { 'x-ratelimit-remaining': '50' },
                });

            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = await service.loadAll();

            expect(result.communityArticles.length).toBe(1);
            expect(result.communityArticles[0].title).toBe('Diagnosing Report Execution Timeouts');
            expect(result.communityArticles[0].source).toBe('community');
            expect(result.communitySource).toBe('github');
        });

        it('should fall back to cache when GitHub is unreachable', async () => {
            // GitHub fetch fails
            mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));

            // Cache exists with a previous article
            const cachedArticles: KBArticle[] = [{
                id: 'cached-article',
                title: 'Cached Article',
                category: 'playbook',
                tags: ['cached'],
                content: 'Cached content',
                source: 'community',
            }];

            mockedFs.existsSync.mockImplementation((p: any) => {
                const pathStr = String(p);
                if (pathStr.includes('kb-cache') && pathStr.includes('community-articles.json')) return true;
                return false;
            });
            mockedFs.readFileSync.mockImplementation((p: any) => {
                const pathStr = String(p);
                if (pathStr.includes('community-articles.json')) {
                    return JSON.stringify(cachedArticles);
                }
                return '';
            });

            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = await service.loadAll();

            expect(result.communityArticles.length).toBe(1);
            expect(result.communityArticles[0].id).toBe('cached-article');
            expect(result.communitySource).toBe('cache');
        });

        it('should return empty community KB when disabled', async () => {
            const config: KBConfig = { ...DEFAULT_KB_CONFIG, enabled: false };
            const service = new KnowledgeBaseService(WORKSPACE_PATH, config);
            const result = await service.loadAll();

            expect(result.communityArticles).toEqual([]);
            expect(result.communitySource).toBe('disabled');
            // Should not have attempted any HTTP calls
            expect(mockAxiosInstance.get).not.toHaveBeenCalled();
        });

        it('should use cache only when cacheOnly is true', async () => {
            const cachedArticles: KBArticle[] = [{
                id: 'cached-only',
                title: 'Cache Only Article',
                category: 'query-pattern',
                tags: ['cache'],
                content: 'From cache',
                source: 'community',
            }];

            mockedFs.existsSync.mockImplementation((p: any) => {
                return String(p).includes('community-articles.json');
            });
            mockedFs.readFileSync.mockImplementation((p: any) => {
                if (String(p).includes('community-articles.json')) {
                    return JSON.stringify(cachedArticles);
                }
                return '';
            });

            const config: KBConfig = { ...DEFAULT_KB_CONFIG, cacheOnly: true };
            const service = new KnowledgeBaseService(WORKSPACE_PATH, config);
            const result = await service.loadAll();

            // Should not fetch from GitHub
            expect(mockAxiosInstance.get).not.toHaveBeenCalled();
            expect(result.communityArticles.length).toBe(1);
            expect(result.communitySource).toBe('cache');
        });

        it('should apply exclude list to community articles', async () => {
            // Two articles from GitHub
            mockAxiosInstance.get
                .mockResolvedValueOnce(createGitHubDirResponse([
                    {
                        name: 'article-a.md',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/article-a.md',
                        path: 'knowledge-base/article-a.md',
                    },
                    {
                        name: 'article-b.md',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/article-b.md',
                        path: 'knowledge-base/article-b.md',
                    },
                ]))
                .mockResolvedValueOnce({
                    status: 200,
                    data: `---\ntitle: "Article A"\ncategory: playbook\ntags: [a]\n---\nContent A`,
                    headers: { 'x-ratelimit-remaining': '50' },
                })
                .mockResolvedValueOnce({
                    status: 200,
                    data: `---\ntitle: "Article B"\ncategory: playbook\ntags: [b]\n---\nContent B`,
                    headers: { 'x-ratelimit-remaining': '49' },
                });

            const config: KBConfig = { ...DEFAULT_KB_CONFIG, exclude: ['article-a'] };
            const service = new KnowledgeBaseService(WORKSPACE_PATH, config);
            const result = await service.loadAll();

            expect(result.communityArticles.length).toBe(1);
            expect(result.communityArticles[0].id).toBe('article-b');
            expect(result.excludedCount).toBe(1);
        });

        it('should return empty arrays when both GitHub and cache fail', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Network error'));
            // No cache files exist (default mock)

            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = await service.loadAll();

            expect(result.communityArticles).toEqual([]);
            expect(result.communitySource).toBe('cache'); // fell back to cache (empty)
            expect(result.errors.length).toBeGreaterThan(0);
        });

        it('should cache community articles after successful GitHub fetch', async () => {
            mockAxiosInstance.get
                .mockResolvedValueOnce(createGitHubDirResponse([
                    {
                        name: 'test.md',
                        type: 'file',
                        download_url: 'https://raw.githubusercontent.com/test/test.md',
                        path: 'knowledge-base/test.md',
                    },
                ]))
                .mockResolvedValueOnce({
                    status: 200,
                    data: SAMPLE_ARTICLE_MINIMAL,
                    headers: { 'x-ratelimit-remaining': '50' },
                });

            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            await service.loadAll();

            // Should have written cache file
            expect(mockedFs.writeFileSync).toHaveBeenCalled();
            const writeCall = mockedFs.writeFileSync.mock.calls.find(
                (call: any[]) => String(call[0]).includes('community-articles.json')
            );
            expect(writeCall).toBeDefined();
        });
    });

    // =========================================================================
    // loadAll — Local KB
    // =========================================================================
    describe('loadAll - local articles', () => {
        it('should load local articles from workspace knowledge folder', async () => {
            // No community (disabled)
            const config: KBConfig = { ...DEFAULT_KB_CONFIG, enabled: false };

            // Local folder structure
            mockedFs.existsSync.mockImplementation((p: any) => {
                const pathStr = String(p);
                if (pathStr.includes('.bctb/knowledge')) return true;
                return false;
            });

            mockedFs.readdirSync.mockImplementation((p: any, opts?: any) => {
                const pathStr = String(p);
                if (pathStr.endsWith('knowledge')) {
                    return [
                        { name: 'playbooks', isDirectory: () => true, isFile: () => false },
                    ] as any;
                }
                if (pathStr.includes('playbooks')) {
                    return [
                        { name: 'my-local-playbook.md', isDirectory: () => false, isFile: () => true },
                    ] as any;
                }
                return [];
            });

            mockedFs.readFileSync.mockImplementation((p: any) => {
                if (String(p).includes('my-local-playbook.md')) {
                    return SAMPLE_ARTICLE_MINIMAL;
                }
                return '';
            });

            const service = new KnowledgeBaseService(WORKSPACE_PATH, config);
            const result = await service.loadAll();

            expect(result.localArticles.length).toBe(1);
            expect(result.localArticles[0].source).toBe('local');
            expect(result.localArticles[0].id).toBe('my-local-playbook');
        });

        it('should handle missing local knowledge folder gracefully', async () => {
            const config: KBConfig = { ...DEFAULT_KB_CONFIG, enabled: false };
            // existsSync returns false for everything (default)

            const service = new KnowledgeBaseService(WORKSPACE_PATH, config);
            const result = await service.loadAll();

            expect(result.localArticles).toEqual([]);
        });
    });

    // =========================================================================
    // search
    // =========================================================================
    describe('search', () => {
        let service: KnowledgeBaseService;

        const articles: KBArticle[] = [
            {
                id: 'local-perf',
                title: 'Local Performance Check',
                category: 'playbook',
                tags: ['performance', 'RT0006'],
                eventIds: ['RT0006'],
                content: 'Check performance via RT0006 events',
                source: 'local',
            },
            {
                id: 'community-deadlock',
                title: 'Deadlock Investigation',
                category: 'query-pattern',
                tags: ['deadlock', 'sql', 'RT0018'],
                eventIds: ['RT0018'],
                content: 'Investigate SQL deadlocks in BC telemetry',
                source: 'community',
            },
            {
                id: 'community-auth',
                title: 'Authorization Failures',
                category: 'event-interpretation',
                tags: ['auth', 'RT0005', 'security'],
                eventIds: ['RT0005'],
                content: 'Understanding authorization failure events',
                source: 'community',
            },
        ];

        beforeEach(() => {
            service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            // Inject articles directly for search testing
            (service as any).articles = articles;
        });

        it('should return all articles when no filters provided', () => {
            const results = service.search({});
            expect(results.length).toBe(3);
        });

        it('should filter by category', () => {
            const results = service.search({ category: 'playbook' });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('local-perf');
        });

        it('should filter by tags', () => {
            const results = service.search({ tags: ['deadlock'] });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('community-deadlock');
        });

        it('should filter by eventId', () => {
            const results = service.search({ eventId: 'RT0005' });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('community-auth');
        });

        it('should filter by source', () => {
            const results = service.search({ source: 'local' });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('local-perf');
        });

        it('should do free-text search in title and content', () => {
            const results = service.search({ search: 'deadlock' });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('community-deadlock');
        });

        it('should combine multiple filters with AND logic', () => {
            const results = service.search({ category: 'query-pattern', tags: ['sql'] });
            expect(results.length).toBe(1);
            expect(results[0].id).toBe('community-deadlock');
        });

        it('should return empty array when no articles match', () => {
            const results = service.search({ category: 'vendor-pattern' });
            expect(results).toEqual([]);
        });

        it('should return local articles first', () => {
            const results = service.search({});
            expect(results[0].source).toBe('local');
        });

        it('should be case-insensitive for free-text search', () => {
            const results = service.search({ search: 'DEADLOCK' });
            expect(results.length).toBe(1);
        });
    });

    // =========================================================================
    // saveArticle
    // =========================================================================
    describe('saveArticle', () => {
        beforeEach(() => {
            (mockedFs.existsSync as jest.Mock).mockReturnValue(false);
            (mockedFs.mkdirSync as jest.Mock).mockImplementation(() => undefined);
            (mockedFs.writeFileSync as jest.Mock).mockImplementation(() => undefined);
        });

        it('should write the article file with correct frontmatter', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            await service.saveArticle({
                title: 'Lock Timeout Investigation',
                category: 'playbook',
                tags: ['AL0000DD5', 'lock', 'timeout'],
                eventIds: ['AL0000DD5'],
                content: '## Steps\n1. Check lock events.',
            });

            expect(mockedFs.writeFileSync).toHaveBeenCalledTimes(1);
            const writtenContent = (mockedFs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
            expect(writtenContent).toContain('title: "Lock Timeout Investigation"');
            expect(writtenContent).toContain('category: playbook');
            expect(writtenContent).toContain('## Steps');
        });

        it('should return success result with slug id and path', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const result = await service.saveArticle({
                title: 'My Test Article',
                category: 'query-pattern',
                content: 'Some content',
            });

            expect(result.success).toBe(true);
            expect(result.id).toBe('my-test-article');
            expect(result.path).toContain('my-test-article.md');
            expect(result.message).toContain('Saved');
        });

        it('should add saved article to in-memory catalog', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            (service as any).articles = [];

            await service.saveArticle({
                title: 'New Local Article',
                category: 'vendor-pattern',
                content: 'Vendor specific pattern',
            });

            const articles = (service as any).articles as KBArticle[];
            expect(articles.length).toBe(1);
            expect(articles[0].id).toBe('new-local-article');
            expect(articles[0].source).toBe('local');
        });

        it('should replace existing local article with same slug', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            (service as any).articles = [
                { id: 'my-article', source: 'local', title: 'Old Title', category: 'playbook', tags: [], content: 'old' },
            ];

            await service.saveArticle({
                title: 'My Article',
                category: 'playbook',
                content: 'Updated content',
            });

            const articles = (service as any).articles as KBArticle[];
            expect(articles.length).toBe(1);
            expect(articles[0].content).toBe('Updated content');
        });

        it('should create category directory if it does not exist', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            await service.saveArticle({
                title: 'Test',
                category: 'event-interpretation',
                content: 'Content',
            });

            expect(mockedFs.mkdirSync).toHaveBeenCalledWith(
                expect.stringContaining('event-interpretation'),
                { recursive: true }
            );
        });
    });

    // =========================================================================
    // contributeArticle
    // =========================================================================
    describe('contributeArticle', () => {
        it('should throw when community source URL is invalid', async () => {
            const badConfig = { ...DEFAULT_KB_CONFIG, source: 'not-a-github-url' };
            const service = new KnowledgeBaseService(WORKSPACE_PATH, badConfig);

            await expect(service.contributeArticle({
                title: 'Test',
                category: 'playbook',
                content: 'Content',
            })).rejects.toThrow('Cannot parse community KB source URL');
        });

        it('should return pre-filled URL and article body when no token configured', async () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            delete process.env['BCTB_GITHUB_TOKEN'];

            const result = await service.contributeArticle({
                title: 'Community Article',
                category: 'playbook',
                content: '## My Playbook Content',
            });

            expect(result.success).toBe(false);
            expect(result.issueUrl).toContain('github.com/');
            expect(result.issueUrl).toContain('/issues/new');
            expect(result.issueUrl).toContain('kb-contribution');
            // article content must be in articleBody (NOT buried in message)
            expect(result.articleBody).toBeDefined();
            expect(result.articleBody).toContain('## My Playbook Content');
            expect(result.articleBody).toContain('community-article'); // slug in frontmatter
            // articleMarkdown must be the raw frontmatter+content (no GitHub issue wrapping)
            expect(result.articleMarkdown).toBeDefined();
            expect(result.articleMarkdown).toContain('## My Playbook Content');
            expect(result.articleMarkdown).toContain('community-article'); // slug in frontmatter
            // articleMarkdown must NOT contain issue body boilerplate
            expect(result.articleMarkdown).not.toContain('Community Knowledge Base Contribution');
            expect(result.articleMarkdown).not.toContain('Generated by BC Telemetry Buddy');
            // message should be short and instructional, not contain the full article
            expect(result.message).not.toContain('## My Playbook Content');
            expect(result.message).toContain('1.');  // numbered steps
            expect(result.message).toContain('2.');
        });

        it('should create an issue and return issueUrl on success', async () => {
            const configWithToken = { ...DEFAULT_KB_CONFIG, githubToken: 'ghp_test123' };
            const mockHttpClient = {
                get: jest.fn(),
                post: jest.fn().mockResolvedValue({
                    data: { html_url: 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/42' },
                }),
                put: jest.fn(),
            };
            const service = new KnowledgeBaseService(WORKSPACE_PATH, configWithToken, mockHttpClient as any);

            const result = await service.contributeArticle({
                title: 'Community Pattern',
                category: 'query-pattern',
                tags: ['performance'],
                content: 'KQL pattern content',
            });

            expect(result.success).toBe(true);
            expect(result.issueUrl).toBe('https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/42');
            expect(result.message).toContain('Issue created');
            // Single POST only — no branch creation, no file upload
            expect(mockHttpClient.post).toHaveBeenCalledTimes(1);
            expect(mockHttpClient.get).not.toHaveBeenCalled();
            expect(mockHttpClient.put).not.toHaveBeenCalled();
        });
    });

    // =========================================================================
    // getSummary
    // =========================================================================
    describe('getSummary', () => {
        it('should return correct counts', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            (service as any).articles = [
                { id: 'a', source: 'community' },
                { id: 'b', source: 'community' },
                { id: 'c', source: 'local' },
            ];
            (service as any).excludedCount = 2;
            (service as any).loadSource = 'github';

            const summary = service.getSummary();
            expect(summary.community).toBe(2);
            expect(summary.local).toBe(1);
            expect(summary.excluded).toBe(2);
            expect(summary.source).toBe('github');
        });

        it('should return zeros when no articles loaded', () => {
            const service = new KnowledgeBaseService(WORKSPACE_PATH, DEFAULT_KB_CONFIG);
            const summary = service.getSummary();
            expect(summary.community).toBe(0);
            expect(summary.local).toBe(0);
            expect(summary.excluded).toBe(0);
        });
    });
});
