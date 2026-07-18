/**
 * Tests for the "consult KB" nudge attached to pre-query MCP tool responses.
 *
 * Plan: docs/plans/kb-nudge-on-pre-query-tools.md
 *
 * Scope: a single `kbHint` string is attached to the responses of four
 * pre-query tools (`get_event_catalog`, `get_tenant_mapping`,
 * `get_event_field_samples`, `get_event_schema`) until `get_knowledge`
 * runs in the session. KB-not-loaded suppresses the hint entirely.
 * Telemetry event TB-MCP-114 fires only when a hint is actually attached.
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
        getStats: jest.fn().mockReturnValue({ totalEntries: 0, hitRate: 0 }),
        clear: jest.fn(),
        cleanupExpired: jest.fn()
    })),
    QueriesService: jest.fn().mockImplementation(() => ({
        getAllQueries: jest.fn().mockReturnValue([]),
        searchQueries: jest.fn().mockReturnValue([]),
        saveQuery: jest.fn().mockReturnValue('/path/to/query.kql'),
        getCategories: jest.fn().mockReturnValue([])
    })),
    ReferencesService: jest.fn().mockImplementation(() => ({
        getAllExternalQueries: jest.fn().mockResolvedValue([])
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
    TELEMETRY_EVENTS: {
        MCP: { SERVER_STARTED: 'TB-MCP-001', ERROR: 'TB-MCP-005' },
        MCP_TOOLS: {
            QUERY_TELEMETRY: 'TB-MCP-101',
            GET_EVENT_CATALOG: 'TB-MCP-108',
            GET_EVENT_SCHEMA: 'TB-MCP-109',
            GET_EVENT_FIELD_SAMPLES: 'TB-MCP-110',
            GET_KNOWLEDGE: 'TB-MCP-111',
            SAVE_KNOWLEDGE: 'TB-MCP-112',
            DEPRECATED_TOOL_CALLED: 'TB-MCP-113',
            KB_HINT_EMITTED: 'TB-MCP-114'
        }
    },
    createCommonProperties: jest.fn(
        (_eventId: string, _component: string, _sessionId: string, _installationId: string, _version: string, options?: any) =>
            ({ ...options })
    ),
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

import { ToolHandlers, ServerServices } from '../tools/toolHandlers.js';
import { MCPConfig } from '../config.js';

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
        kusto: { executeQuery: jest.fn(), parseResult: jest.fn(), validateQuery: jest.fn().mockReturnValue([]) } as any,
        cache: { get: jest.fn().mockReturnValue(null), set: jest.fn(), getStats: jest.fn().mockReturnValue({}) } as any,
        queries: {
            getAllQueries: jest.fn().mockReturnValue([]),
            searchQueries: jest.fn().mockReturnValue([]),
            saveQuery: jest.fn().mockReturnValue('/tmp/q.kql'),
            getCategories: jest.fn().mockReturnValue([]),
        } as any,
        references: { getAllExternalQueries: jest.fn().mockResolvedValue([]) } as any,
        usageTelemetry: { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() } as any,
        exports: { exportJson: jest.fn(), exportCsv: jest.fn(), listExports: jest.fn().mockReturnValue([]), readExport: jest.fn(), cleanupExpired: jest.fn().mockReturnValue(0) } as any,
        installationId: 'test-id',
        sessionId: 'test-session',
    };
}

function createKbMock() {
    return {
        search: jest.fn().mockReturnValue([]),
        getSummary: jest.fn().mockReturnValue({ community: 0, local: 0, excluded: 0, source: 'github' }),
    };
}

/**
 * Stub `executeQuery` on a handlers instance so the four pre-query tools
 * return deterministic shapes without hitting Kusto. We override the method
 * directly because the underlying KQL composition is irrelevant to nudge
 * behavior — only the result shape that flows back into the public methods
 * matters.
 */
function stubExecuteQuery(handlers: ToolHandlers, byKqlSubstring: Array<{ contains: string; result: any }>) {
    (handlers as any).executeQuery = jest.fn(async (kql: string) => {
        for (const entry of byKqlSubstring) {
            if (kql.includes(entry.contains)) {
                return entry.result;
            }
        }
        return { type: 'table', kql, summary: '', columns: [], rows: [], cached: false };
    });
}

describe('KB nudge (kbHint) on pre-query tools', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    // =====================================================================
    // AC1
    // =====================================================================
    it('attaches kbHint with significant event IDs to get_event_catalog when KB not yet consulted', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        // 7 distinct event IDs with descending counts so the 90% percentile
        // selects the first 6 (top one alone is 30/100=30%, accumulating).
        // We expect the hint to cap at 5.
        stubExecuteQuery(handlers, [{
            contains: 'summarize count',
            result: {
                type: 'table',
                rows: [
                    ['RT0006', 'slow', 'too slow', 30, 'url'],
                    ['RT0008', 'slower', 'too slow', 25, 'url'],
                    ['RT0011', 'cancel', 'error', 20, 'url'],
                    ['AL0000JRG', 'jq', 'error', 10, 'url'],
                    ['LC0136', 'cancel', 'info', 6, 'url'],
                    ['LC0137', 'ok', 'success', 4, 'url'],
                    ['LC0138', 'tail', 'info', 5, 'url'],
                ],
                cached: false,
                summary: '',
                columns: [],
            }
        }]);

        const result = await handlers.executeToolCall('get_event_catalog', {});

        expect(result.kbHint).toBeDefined();
        expect(typeof result.kbHint).toBe('string');
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('eventIds');
        expect(result.kbHint).toContain('RT0006');
        // Hint must be capped at 5 IDs even though 6+ are significant.
        const idsInHint = (result.kbHint.match(/RT\d{4}|AL[A-Z0-9]+|LC\d{4}/g) || []);
        expect(idsInHint.length).toBeLessThanOrEqual(5);
    });

    it('falls back to a generic event-interpretation hint when significantEvents is empty', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'summarize count',
            result: { type: 'table', rows: [], cached: false, summary: '', columns: [] }
        }]);

        const result = await handlers.executeToolCall('get_event_catalog', {});

        expect(result.kbHint).toBeDefined();
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('event-interpretation');
    });

    // =====================================================================
    // AC2
    // =====================================================================
    it('suppresses kbHint on get_event_catalog after get_knowledge has run', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        const kb = createKbMock();
        (handlers as any).knowledgeBase = kb;

        // Run get_knowledge once, returning zero articles — should still flip
        // the consulted flag.
        kb.search.mockReturnValue([]);
        await handlers.executeToolCall('get_knowledge', { eventId: 'RT0006' });

        stubExecuteQuery(handlers, [{
            contains: 'summarize count',
            result: {
                type: 'table',
                rows: [['RT0006', 'slow', 'too slow', 30, 'url']],
                cached: false, summary: '', columns: [],
            }
        }]);

        const result = await handlers.executeToolCall('get_event_catalog', {});

        expect(result.kbHint).toBeUndefined();
    });

    // =====================================================================
    // AC3
    // =====================================================================
    it('attaches customer-scoped kbHint to get_tenant_mapping when companyNameFilter is provided', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'companyName',
            result: { type: 'table', rows: [['Engels NV', 'tenant-1', 5]], cached: false, summary: '', columns: [] }
        }]);

        const result = await handlers.executeToolCall('get_tenant_mapping', { companyNameFilter: 'Engels' });

        expect(result.kbHint).toBeDefined();
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('search');
        expect(result.kbHint).toContain('Engels');
    });

    it('properly escapes companyNameFilter values containing quotes in the hint string', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'companyName',
            result: { type: 'table', rows: [], cached: false, summary: '', columns: [] }
        }]);

        const result = await handlers.executeToolCall('get_tenant_mapping', { companyNameFilter: 'O"Reilly' });

        expect(result.kbHint).toBeDefined();
        // JSON-stringify produces `\"` for the embedded quote — guarantees the
        // suggestion can be parsed by anything reading it.
        expect(result.kbHint).toContain('\\"');
    });

    // =====================================================================
    // AC4
    // =====================================================================
    it('attaches generic kbHint to get_tenant_mapping when no companyNameFilter', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'companyName',
            result: { type: 'table', rows: [], cached: false, summary: '', columns: [] }
        }]);

        const result = await handlers.executeToolCall('get_tenant_mapping', {});

        expect(result.kbHint).toBeDefined();
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('playbook');
    });

    // =====================================================================
    // AC5
    // =====================================================================
    it('attaches event-scoped kbHint to get_event_field_samples', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'project timestamp, message, customDimensions',
            result: {
                type: 'table',
                rows: [['2026-01-01', 'msg', { eventId: 'RT0006', companyName: 'Acme' }]],
                cached: false, summary: '', columns: [],
            }
        }]);

        const result = await handlers.executeToolCall('get_event_field_samples', { eventId: 'RT0006' });

        expect(result.kbHint).toBeDefined();
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('eventId');
        expect(result.kbHint).toContain('RT0006');
    });

    // =====================================================================
    // AC6
    // =====================================================================
    it('attaches event-scoped kbHint to get_event_schema', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'project customDimensions',
            result: {
                type: 'table',
                rows: [[{ eventId: 'RT0008' }]],
                cached: false, summary: '', columns: [],
            }
        }]);

        const result = await handlers.executeToolCall('get_event_schema', { eventId: 'RT0008' });

        expect(result.kbHint).toBeDefined();
        expect(result.kbHint).toContain('get_knowledge');
        expect(result.kbHint).toContain('eventId');
        expect(result.kbHint).toContain('RT0008');
    });

    // =====================================================================
    // AC7
    // =====================================================================
    it('suppresses kbHint entirely when KB is not loaded', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        // Do NOT attach a knowledgeBase — null is the default.

        stubExecuteQuery(handlers, [
            {
                contains: 'summarize count',
                result: {
                    type: 'table',
                    rows: [['RT0006', 'slow', 'too slow', 30, 'url']],
                    cached: false, summary: '', columns: [],
                }
            },
            {
                contains: 'project timestamp, message, customDimensions',
                result: {
                    type: 'table',
                    rows: [['2026-01-01', 'msg', { eventId: 'RT0006' }]],
                    cached: false, summary: '', columns: [],
                }
            },
            {
                contains: 'project customDimensions',
                result: {
                    type: 'table',
                    rows: [[{ eventId: 'RT0006' }]],
                    cached: false, summary: '', columns: [],
                }
            },
            {
                contains: 'companyName',
                result: { type: 'table', rows: [], cached: false, summary: '', columns: [] }
            },
        ]);

        const catalogResult = await handlers.executeToolCall('get_event_catalog', {});
        const samplesResult = await handlers.executeToolCall('get_event_field_samples', { eventId: 'RT0006' });
        const schemaResult = await handlers.executeToolCall('get_event_schema', { eventId: 'RT0006' });
        const tenantResult = await handlers.executeToolCall('get_tenant_mapping', { companyNameFilter: 'Acme' });

        expect(catalogResult.kbHint).toBeUndefined();
        expect(samplesResult.kbHint).toBeUndefined();
        expect(schemaResult.kbHint).toBeUndefined();
        expect(tenantResult.kbHint).toBeUndefined();

        // Telemetry: no KB_HINT_EMITTED event should have fired.
        const trackEventCalls = (services.usageTelemetry.trackEvent as jest.Mock).mock.calls;
        const hintEvents = trackEventCalls.filter(call => call[0] === 'Mcp.KbHintEmitted');
        expect(hintEvents.length).toBe(0);
    });

    // =====================================================================
    // AC8 — regression guard for scope creep
    // =====================================================================
    it('never attaches kbHint to non-pre-query tools', async () => {
        const nonPreQueryTools: Array<{ name: string; params: any }> = [
            { name: 'get_saved_queries', params: {} },
            { name: 'save_query', params: { name: 'q', kql: 'traces | take 1', purpose: 'p', useCase: 'u' } },
            { name: 'get_categories', params: {} },
            { name: 'list_profiles', params: {} },
        ];

        for (const { name, params } of nonPreQueryTools) {
            const services = createMockServices();
            const handlers = new ToolHandlers(TEST_CONFIG, services, true);
            (handlers as any).knowledgeBase = createKbMock();

            const result = await handlers.executeToolCall(name, params);

            expect(result?.kbHint).toBeUndefined();
        }
    });

    // =====================================================================
    // Telemetry: KB_HINT_EMITTED fires when a hint is attached
    // =====================================================================
    it('emits KB_HINT_EMITTED telemetry exactly once per attached hint', async () => {
        const services = createMockServices();
        const handlers = new ToolHandlers(TEST_CONFIG, services, true);
        (handlers as any).knowledgeBase = createKbMock();

        stubExecuteQuery(handlers, [{
            contains: 'summarize count',
            result: {
                type: 'table',
                rows: [['RT0006', 'slow', 'too slow', 30, 'url']],
                cached: false, summary: '', columns: [],
            }
        }]);

        await handlers.executeToolCall('get_event_catalog', {});

        const trackEventCalls = (services.usageTelemetry.trackEvent as jest.Mock).mock.calls;
        const hintEvents = trackEventCalls.filter(call => call[0] === 'Mcp.KbHintEmitted');
        expect(hintEvents.length).toBe(1);

        const props = hintEvents[0][1];
        expect(props.toolName).toBe('get_event_catalog');
        expect(props.hasEventIds).toBe('true');
    });
});
