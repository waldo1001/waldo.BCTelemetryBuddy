/**
 * Tests for Knowledge Base MCP tools — get_knowledge tool handler.
 *
 * Covers:
 * - Tool definition exists in TOOL_DEFINITIONS
 * - Tool handler dispatch for get_knowledge
 * - Parameter validation (category, tags, eventId, search, source)
 * - Integration with KnowledgeBaseService.search()
 * - Error handling when KB not loaded
 * - Summary included in response
 */

// Mock shared modules BEFORE imports
jest.mock('@bctb/shared', () => ({
    AuthService: jest.fn().mockImplementation(() => ({
        authenticate: jest.fn().mockResolvedValue(undefined),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
        getStatus: jest.fn().mockReturnValue({ authenticated: true })
    })),
    KustoService: jest.fn().mockImplementation(() => ({
        executeQuery: jest.fn(),
        parseResult: jest.fn(),
        validateQuery: jest.fn().mockReturnValue([])
    })),
    CacheService: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
        getStats: jest.fn().mockReturnValue({ totalEntries: 5, hitRate: 0.5 }),
        clear: jest.fn(),
        cleanupExpired: jest.fn()
    })),
    QueriesService: jest.fn().mockImplementation(() => ({
        getAllQueries: jest.fn().mockReturnValue([]),
        searchQueries: jest.fn().mockReturnValue([]),
        saveQuery: jest.fn().mockReturnValue('/path/to/query.kql'),
        getCategories: jest.fn().mockReturnValue(['performance', 'errors'])
    })),
    ReferencesService: jest.fn().mockImplementation(() => ({
        getAllExternalQueries: jest.fn().mockResolvedValue([])
    })),
    KnowledgeBaseService: jest.fn().mockImplementation(() => ({
        loadAll: jest.fn().mockResolvedValue({
            communityArticles: [],
            localArticles: [],
            communitySource: 'disabled',
            excludedCount: 0,
            errors: [],
        }),
        search: jest.fn().mockReturnValue([]),
        getSummary: jest.fn().mockReturnValue({
            community: 0,
            local: 0,
            excluded: 0,
            source: 'disabled',
        }),
    })),
    sanitizeObject: jest.fn((obj: any) => obj),
    lookupEventCategory: jest.fn().mockResolvedValue({
        category: 'Performance',
        subcategory: 'Reports',
        documentationUrl: 'https://learn.microsoft.com/test',
        description: 'Test event',
        isStandardEvent: true,
        source: 'builtin'
    }),
    IUsageTelemetry: jest.fn(),
    NoOpUsageTelemetry: jest.fn().mockImplementation(() => ({
        trackEvent: jest.fn(),
        trackException: jest.fn(),
        flush: jest.fn().mockResolvedValue(undefined)
    })),
    RateLimitedUsageTelemetry: jest.fn(),
    TELEMETRY_CONNECTION_STRING: '',
    TELEMETRY_EVENTS: { MCP: { SERVER_STARTED: 'TB-MCP-001', TOOL_CALLED: 'Mcp.ToolCalled', ERROR: 'TB-MCP-005' }, MCP_TOOLS: { QUERY_TELEMETRY: 'TB-MCP-101', GET_KNOWLEDGE: 'TB-MCP-111', SAVE_KNOWLEDGE: 'TB-MCP-112' } },
    createCommonProperties: jest.fn((_eventId: string, _component: string, _sessionId: string, _installationId: string, _version: string, options?: any) => ({ ...options })),
    cleanTelemetryProperties: jest.fn((p: any) => p),
    hashValue: jest.fn((v: string) => 'hash-' + v),
    categorizeError: jest.fn().mockReturnValue('UnknownError'),
    loadConfig: jest.fn(),
    validateConfig: jest.fn().mockReturnValue([]),
    loadConfigFromFile: jest.fn(),
}));

jest.mock('../version.js', () => ({ VERSION: '0.0.0-test' }));
jest.mock('../mcpTelemetry.js', () => ({
    createMCPUsageTelemetry: jest.fn(),
    getMCPInstallationId: jest.fn().mockReturnValue('test-install-id'),
}));

// Mock child_process for resolveGitAuthor
jest.mock('child_process', () => ({
    exec: jest.fn((_cmd: string, callback: Function) => {
        callback(null, { stdout: 'Test Author\n', stderr: '' });
    }),
}));
jest.mock('util', () => ({
    ...jest.requireActual('util'),
    promisify: jest.fn((fn: any) => {
        return (...args: any[]) => {
            return new Promise((resolve, reject) => {
                fn(...args, (err: any, result: any) => {
                    if (err) reject(err);
                    else resolve(result);
                });
            });
        };
    }),
}));

import { TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';
import { ToolHandlers, ServerServices } from '../tools/toolHandlers.js';
import { MCPConfig } from '../config.js';

// --- Test fixtures ---

const TEST_CONFIG: MCPConfig = {
    connectionName: 'Test',
    tenantId: 'test-tenant',
    authFlow: 'azure_cli',
    applicationInsightsAppId: 'test-app-id',
    kustoClusterUrl: 'https://test.kusto.windows.net',
    cacheEnabled: true,
    cacheTTLSeconds: 3600,
    removePII: false,
    port: 52345,
    workspacePath: '/test/workspace',
    queriesFolder: 'queries',
    references: [],
};

function createMockServices(): ServerServices {
    return {
        auth: { authenticate: jest.fn(), getAccessToken: jest.fn().mockResolvedValue('token'), getStatus: jest.fn() } as any,
        kusto: { executeQuery: jest.fn(), parseResult: jest.fn() } as any,
        cache: { get: jest.fn().mockReturnValue(null), set: jest.fn(), getStats: jest.fn().mockReturnValue({}) } as any,
        queries: { getAllQueries: jest.fn().mockReturnValue([]), searchQueries: jest.fn() } as any,
        references: { getAllExternalQueries: jest.fn().mockResolvedValue([]) } as any,
        usageTelemetry: { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() } as any,
        installationId: 'test-id',
        sessionId: 'test-session',
    };
}

const SAMPLE_ARTICLES = [
    {
        id: 'report-timeouts',
        title: 'Report Timeouts Investigation',
        category: 'playbook',
        tags: ['reports', 'RT0006', 'performance'],
        eventIds: ['RT0006'],
        content: '## Investigation\nCheck RT0006 events for slow reports.',
        source: 'community' as const,
    },
    {
        id: 'local-custom',
        title: 'Our Custom Check',
        category: 'query-pattern',
        tags: ['custom'],
        content: 'Local custom pattern',
        source: 'local' as const,
    },
];

describe('Knowledge Base MCP Tools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =========================================================================
    // Tool Definition
    // =========================================================================
    describe('Tool Definition', () => {
        it('should include get_knowledge in TOOL_DEFINITIONS', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'get_knowledge');
            expect(tool).toBeDefined();
            expect(tool!.description).toContain('Knowledge Base');
        });

        it('should have correct input schema properties', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'get_knowledge');
            expect(tool!.inputSchema.properties).toHaveProperty('category');
            expect(tool!.inputSchema.properties).toHaveProperty('tags');
            expect(tool!.inputSchema.properties).toHaveProperty('eventId');
            expect(tool!.inputSchema.properties).toHaveProperty('search');
            expect(tool!.inputSchema.properties).toHaveProperty('source');
        });

        it('should be marked as read-only and idempotent', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'get_knowledge');
            expect(tool!.annotations?.readOnlyHint).toBe(true);
            expect(tool!.annotations?.destructiveHint).toBe(false);
            expect(tool!.annotations?.idempotentHint).toBe(true);
            expect(tool!.annotations?.openWorldHint).toBe(false);
        });
    });

    // =========================================================================
    // Tool Handler Dispatch
    // =========================================================================
    describe('executeToolCall - get_knowledge', () => {
        it('should dispatch to knowledgeBase.search and return results', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            // Attach a mock KB service
            const mockKB = {
                search: jest.fn().mockReturnValue(SAMPLE_ARTICLES),
                getSummary: jest.fn().mockReturnValue({ community: 1, local: 1, excluded: 0, source: 'github' }),
            };
            (handlers as any).knowledgeBase = mockKB;

            const result = await handlers.executeToolCall('get_knowledge', {
                eventId: 'RT0006',
            });

            expect(mockKB.search).toHaveBeenCalledWith({ eventId: 'RT0006' });
            expect(result.articles).toEqual(SAMPLE_ARTICLES);
            expect(result.summary).toBeDefined();
            expect(result.summary.community).toBe(1);
        });

        it('should pass all filter parameters to search', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const mockKB = {
                search: jest.fn().mockReturnValue([]),
                getSummary: jest.fn().mockReturnValue({ community: 0, local: 0, excluded: 0, source: 'disabled' }),
            };
            (handlers as any).knowledgeBase = mockKB;

            await handlers.executeToolCall('get_knowledge', {
                category: 'playbook',
                tags: ['performance'],
                eventId: 'RT0006',
                search: 'timeout',
                source: 'community',
            });

            expect(mockKB.search).toHaveBeenCalledWith({
                category: 'playbook',
                tags: ['performance'],
                eventId: 'RT0006',
                search: 'timeout',
                source: 'community',
            });
        });

        it('should return helpful message when KB is not loaded', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            // No knowledgeBase attached

            const result = await handlers.executeToolCall('get_knowledge', {});

            expect(result.articles).toEqual([]);
            expect(result.message).toContain('not available');
        });

        it('should handle search with no results gracefully', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const mockKB = {
                search: jest.fn().mockReturnValue([]),
                getSummary: jest.fn().mockReturnValue({ community: 10, local: 2, excluded: 0, source: 'github' }),
            };
            (handlers as any).knowledgeBase = mockKB;

            const result = await handlers.executeToolCall('get_knowledge', {
                search: 'nonexistent-topic',
            });

            expect(result.articles).toEqual([]);
            expect(result.count).toBe(0);
        });

        it('should include article count in response', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const mockKB = {
                search: jest.fn().mockReturnValue(SAMPLE_ARTICLES),
                getSummary: jest.fn().mockReturnValue({ community: 1, local: 1, excluded: 0, source: 'github' }),
            };
            (handlers as any).knowledgeBase = mockKB;

            const result = await handlers.executeToolCall('get_knowledge', {});

            expect(result.count).toBe(2);
        });
    });

    // =========================================================================
    // Tool Definition — save_knowledge
    // =========================================================================
    describe('Tool Definition — save_knowledge', () => {
        it('should include save_knowledge in TOOL_DEFINITIONS', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'save_knowledge');
            expect(tool).toBeDefined();
            expect(tool!.description).toContain('Knowledge Base');
        });

        it('should require title, category, content, and target', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'save_knowledge')!;
            expect(tool.inputSchema.required).toContain('title');
            expect(tool.inputSchema.required).toContain('category');
            expect(tool.inputSchema.required).toContain('content');
            expect(tool.inputSchema.required).toContain('target');
        });

        it('should have target enum with local and community', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'save_knowledge')!;
            expect(tool.inputSchema.properties['target'].enum).toEqual(['local', 'community']);
        });

        it('should NOT be marked as read-only', () => {
            const tool = TOOL_DEFINITIONS.find(t => t.name === 'save_knowledge')!;
            expect(tool.annotations?.readOnlyHint).toBe(false);
        });
    });

    // =========================================================================
    // Tool Handler — save_knowledge (local)
    // =========================================================================
    describe('executeToolCall - save_knowledge', () => {
        const SAVE_PARAMS = {
            title: 'Report Timeout Investigation',
            category: 'playbook',
            tags: ['RT0006', 'timeout'],
            eventIds: ['RT0006'],
            content: '## Steps\n1. Check RT0006 events.',
            target: 'local',
        };

        it('should call saveArticle when target is local', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const saveResult = { success: true, id: 'report-timeout-investigation', path: '.vscode/.bctb/knowledge/playbook/report-timeout-investigation.md', message: 'Saved.' };
            const mockKB = {
                saveArticle: jest.fn().mockResolvedValue(saveResult),
                contributeArticle: jest.fn(),
            };
            (handlers as any).knowledgeBase = mockKB;

            const result = await handlers.executeToolCall('save_knowledge', SAVE_PARAMS);

            expect(mockKB.saveArticle).toHaveBeenCalledWith(expect.objectContaining({
                title: SAVE_PARAMS.title,
                category: SAVE_PARAMS.category,
                tags: SAVE_PARAMS.tags,
                content: SAVE_PARAMS.content,
                author: 'Test Author',
            }));
            expect(mockKB.contributeArticle).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.id).toBe('report-timeout-investigation');
        });

        it('should pass resolved git author to contributeArticle for community target', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const contributeResult = { success: true, id: 'report-timeout-investigation', issueUrl: 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/99', message: 'Issue created.' };
            const mockKB = {
                saveArticle: jest.fn(),
                contributeArticle: jest.fn().mockResolvedValue(contributeResult),
            };
            (handlers as any).knowledgeBase = mockKB;

            await handlers.executeToolCall('save_knowledge', { ...SAVE_PARAMS, target: 'community' });

            expect(mockKB.contributeArticle).toHaveBeenCalledWith(expect.objectContaining({
                author: 'Test Author',
            }));
        });

        it('should pass undefined author when git config fails', async () => {
            // Override mock to simulate git failure
            const { exec } = require('child_process');
            (exec as jest.Mock).mockImplementationOnce((_cmd: string, callback: Function) => {
                callback(new Error('git not found'), { stdout: '', stderr: '' });
            });

            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const saveResult = { success: true, id: 'test', path: 'path', message: 'Saved.' };
            const mockKB = {
                saveArticle: jest.fn().mockResolvedValue(saveResult),
                contributeArticle: jest.fn(),
            };
            (handlers as any).knowledgeBase = mockKB;

            await handlers.executeToolCall('save_knowledge', SAVE_PARAMS);

            expect(mockKB.saveArticle).toHaveBeenCalledWith(expect.objectContaining({
                author: undefined,
            }));
        });

        it('should call contributeArticle when target is community', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);

            const contributeResult = { success: true, id: 'report-timeout-investigation', issueUrl: 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues/99', message: 'Issue created.' };
            const mockKB = {
                saveArticle: jest.fn(),
                contributeArticle: jest.fn().mockResolvedValue(contributeResult),
            };
            (handlers as any).knowledgeBase = mockKB;

            const result = await handlers.executeToolCall('save_knowledge', { ...SAVE_PARAMS, target: 'community' });

            expect(mockKB.contributeArticle).toHaveBeenCalled();
            expect(mockKB.saveArticle).not.toHaveBeenCalled();
            expect(result.success).toBe(true);
            expect(result.issueUrl).toBeDefined();
        });

        it('should throw when required params are missing', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            (handlers as any).knowledgeBase = { saveArticle: jest.fn(), contributeArticle: jest.fn() };

            await expect(handlers.executeToolCall('save_knowledge', { title: 'test' }))
                .rejects.toThrow('title, category, content, and target are required');
        });

        it('should throw when KB is not available', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            // No knowledgeBase attached

            await expect(handlers.executeToolCall('save_knowledge', SAVE_PARAMS))
                .rejects.toThrow('Knowledge Base is not available');
        });
    });

    // =========================================================================
    // Telemetry — get_knowledge
    // =========================================================================
    describe('Telemetry — get_knowledge', () => {
        it('tracks Mcp.GetKnowledge with resultCount when KB is available', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            const mockKB = {
                search: jest.fn().mockReturnValue(SAMPLE_ARTICLES),
                getSummary: jest.fn().mockReturnValue({ community: 1, local: 1, excluded: 0, source: 'github' }),
            };
            (handlers as any).knowledgeBase = mockKB;

            await handlers.executeToolCall('get_knowledge', { eventId: 'RT0006' });

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.GetKnowledge',
                expect.objectContaining({ resultCount: 2 })
            );
        });

        it('tracks Mcp.GetKnowledge with resultCount:0 when KB is unavailable', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            // no knowledgeBase attached

            await handlers.executeToolCall('get_knowledge', {});

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.GetKnowledge',
                expect.objectContaining({ resultCount: 0 })
            );
        });
    });

    // =========================================================================
    // Telemetry — save_knowledge
    // =========================================================================
    describe('Telemetry — save_knowledge', () => {
        it('tracks Mcp.SaveKnowledge with target and category on local save', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            (handlers as any).knowledgeBase = {
                saveArticle: jest.fn().mockResolvedValue({ success: true }),
                contributeArticle: jest.fn(),
            };

            await handlers.executeToolCall('save_knowledge', {
                title: 'T', category: 'playbook', content: 'C', target: 'local',
            });

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.SaveKnowledge',
                expect.objectContaining({ target: 'local', category: 'playbook' })
            );
        });

        it('tracks Mcp.SaveKnowledge with target:community on community save', async () => {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            (handlers as any).knowledgeBase = {
                saveArticle: jest.fn(),
                contributeArticle: jest.fn().mockResolvedValue({ success: true }),
            };

            await handlers.executeToolCall('save_knowledge', {
                title: 'T', category: 'query-pattern', content: 'C', target: 'community',
            });

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.SaveKnowledge',
                expect.objectContaining({ target: 'community' })
            );
        });
    });
});
