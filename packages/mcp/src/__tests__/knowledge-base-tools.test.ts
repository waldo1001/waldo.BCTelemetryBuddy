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
    TELEMETRY_EVENTS: { MCP: { SERVER_STARTED: 'Mcp.ServerStarted', TOOL_CALLED: 'Mcp.ToolCalled', ERROR: 'Mcp.Error' }, MCP_TOOLS: { QUERY_TELEMETRY: 'Mcp.Tools.QueryTelemetry' } },
    createCommonProperties: jest.fn().mockReturnValue({}),
    cleanTelemetryProperties: jest.fn((p: any) => p),
    hashValue: jest.fn((v: string) => 'hash-' + v),
    loadConfig: jest.fn(),
    validateConfig: jest.fn().mockReturnValue([]),
    loadConfigFromFile: jest.fn(),
}));

jest.mock('../version.js', () => ({ VERSION: '0.0.0-test' }));
jest.mock('../mcpTelemetry.js', () => ({
    createMCPUsageTelemetry: jest.fn(),
    getMCPInstallationId: jest.fn().mockReturnValue('test-install-id'),
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
});
