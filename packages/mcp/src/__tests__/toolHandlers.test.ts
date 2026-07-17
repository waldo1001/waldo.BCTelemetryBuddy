/**
 * Tests for ToolHandlers — business logic for all MCP tools.
 *
 * Covers:
 * - initializeServices() with various config scenarios
 * - ToolHandlers.executeToolCall() dispatch for every tool
 * - Business logic methods (executeQuery, getEventCatalog, etc.)
 * - Helper methods (isTimespanValue, generateRecommendations, etc.)
 * - Error handling and telemetry tracking
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

// Mock shared modules
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
        getAllExternalQueries: jest.fn().mockResolvedValue([{ name: 'ext-query' }])
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
    RateLimitedUsageTelemetry: jest.fn().mockImplementation(() => ({
        trackEvent: jest.fn(),
        trackException: jest.fn(),
        flush: jest.fn().mockResolvedValue(undefined)
    })),
    TELEMETRY_CONNECTION_STRING: '',
    TELEMETRY_EVENTS: {
        MCP: { SERVER_STARTED: 'Mcp.ServerStarted', ERROR: 'Mcp.Error', WORKSPACE_PROFILE_SWITCH: 'Mcp.WorkspaceProfileSwitch' },
        MCP_TOOLS: { QUERY_TELEMETRY: 'Mcp.Tools.QueryTelemetry' }
    },
    createCommonProperties: jest.fn().mockReturnValue({}),
    cleanTelemetryProperties: jest.fn().mockReturnValue({}),
    hashValue: jest.fn().mockReturnValue('abc123def456'),
    categorizeError: jest.fn().mockReturnValue('UnknownError')
}));

jest.mock('../mcpTelemetry.js', () => ({
    createMCPUsageTelemetry: jest.fn().mockReturnValue(null),
    getMCPInstallationId: jest.fn().mockReturnValue('test-installation-id')
}));

jest.mock('../version.js', () => ({
    VERSION: '3.0.0-test'
}));

import { ToolHandlers, initializeServices, ServerServices, QueryResult } from '../tools/toolHandlers.js';
import { MCPConfig, validateConfig } from '../config.js';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTestConfig(overrides?: Partial<MCPConfig>): MCPConfig {
    return {
        workspacePath: '/tmp/test-workspace',
        connectionName: 'test-connection',
        applicationInsightsAppId: 'test-app-id',
        kustoClusterUrl: 'https://test.kusto.windows.net',
        authFlow: 'azure_cli',
        tenantId: 'test-tenant-id',
        cacheEnabled: true,
        cacheTTLSeconds: 3600,
        removePII: false,
        queriesFolder: 'queries',
        references: [],
        port: 3000,
        ...overrides
    } as MCPConfig;
}

function createMockServices(overrides?: Partial<ServerServices>): ServerServices {
    return {
        auth: {
            authenticate: jest.fn().mockResolvedValue(undefined),
            getAccessToken: jest.fn().mockResolvedValue('mock-token'),
            getStatus: jest.fn().mockReturnValue({ authenticated: true })
        } as any,
        kusto: {
            executeQuery: jest.fn().mockResolvedValue({ tables: [{ rows: [] }] }),
            parseResult: jest.fn().mockReturnValue({
                summary: 'Test result',
                columns: ['col1'],
                rows: [['val1']]
            }),
            validateQuery: jest.fn().mockReturnValue([])
        } as any,
        cache: {
            get: jest.fn().mockReturnValue(null),
            set: jest.fn(),
            getStats: jest.fn().mockReturnValue({ totalEntries: 5, hitRate: 0.5 }),
            clear: jest.fn(),
            cleanupExpired: jest.fn()
        } as any,
        queries: {
            getAllQueries: jest.fn().mockReturnValue([{ name: 'q1', kql: 'traces | take 10' }]),
            searchQueries: jest.fn().mockReturnValue([{ name: 'found' }]),
            saveQuery: jest.fn().mockReturnValue('/queries/test.kql'),
            getCategories: jest.fn().mockReturnValue(['performance', 'errors'])
        } as any,
        references: {
            getAllExternalQueries: jest.fn().mockResolvedValue([{ name: 'ext-query' }])
        } as any,
        usageTelemetry: {
            trackEvent: jest.fn(),
            trackException: jest.fn(),
            flush: jest.fn().mockResolvedValue(undefined)
        } as any,
        installationId: 'test-installation-id',
        sessionId: 'test-session-id',
        ...overrides
    };
}

function createHandlersWithServices(
    configOverrides?: Partial<MCPConfig>,
    serviceOverrides?: Partial<ServerServices>,
    configErrors: string[] = []
): { handlers: ToolHandlers; services: ServerServices; config: MCPConfig } {
    const config = createTestConfig(configOverrides);
    const services = createMockServices(serviceOverrides);
    const handlers = new ToolHandlers(config, services, true, configErrors);
    return { handlers, services, config };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('ToolHandlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Isolate discovery from the ambient host (e.g. running the suite inside Claude Code,
        // which sets CLAUDE_PROJECT_DIR). Individual tests set it explicitly when needed.
        delete process.env.CLAUDE_PROJECT_DIR;
    });

    // ─── initializeServices ──────────────────────────────────────────────

    describe('initializeServices', () => {
        test('creates all service instances from config', () => {
            const config = createTestConfig();
            const services = initializeServices(config, true);

            expect(services).toHaveProperty('auth');
            expect(services).toHaveProperty('kusto');
            expect(services).toHaveProperty('cache');
            expect(services).toHaveProperty('queries');
            expect(services).toHaveProperty('references');
            expect(services).toHaveProperty('usageTelemetry');
            expect(services).toHaveProperty('installationId');
            expect(services).toHaveProperty('sessionId');
        });

        test('uses existing telemetry when provided', () => {
            const config = createTestConfig();
            const existingTelemetry = {
                trackEvent: jest.fn(),
                trackException: jest.fn(),
                flush: jest.fn()
            };

            const services = initializeServices(config, true, existingTelemetry as any, 'custom-id');

            expect(services.installationId).toBe('custom-id');
        });

        test('uses NoOpUsageTelemetry when no connection string', () => {
            const config = createTestConfig();
            const services = initializeServices(config, false);

            // With empty TELEMETRY_CONNECTION_STRING mock, it should use NoOp
            expect(services.usageTelemetry).toBeDefined();
            expect(services.installationId).toBeDefined();
        });

        test('generates unique session ID', () => {
            const config = createTestConfig();
            const services1 = initializeServices(config, true);
            const services2 = initializeServices(config, true);

            expect(services1.sessionId).toBeDefined();
            expect(services2.sessionId).toBeDefined();
            // UUIDs should be different
            expect(services1.sessionId).not.toBe(services2.sessionId);
        });

        test('defaults installationId to unknown when no existing telemetry id', () => {
            const config = createTestConfig();
            const existingTelemetry = { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() };
            const services = initializeServices(config, true, existingTelemetry as any);

            expect(services.installationId).toBe('unknown');
        });
    });

    // ─── Constructor ─────────────────────────────────────────────────────

    describe('constructor', () => {
        test('stores config and services', () => {
            const { handlers, config, services } = createHandlersWithServices();

            expect(handlers.config).toBe(config);
            expect(handlers.services).toBe(services);
        });

        test('accepts config errors parameter', () => {
            const { handlers } = createHandlersWithServices({}, {}, ['Missing app ID']);

            expect(handlers.configErrors).toEqual(['Missing app ID']);
        });

        test('validates config when no errors provided', () => {
            const config = createTestConfig();
            const services = createMockServices();
            const handlers = new ToolHandlers(config, services, true);

            // configErrors should be populated from validateConfig
            expect(handlers.configErrors).toBeDefined();
        });

        test('detects initial profile name', () => {
            const { handlers } = createHandlersWithServices();

            // With no .bctb-config.json, it returns null
            expect(handlers.activeProfileName).toBeNull();
        });
    });

    // ─── executeToolCall dispatch ────────────────────────────────────────

    describe('executeToolCall', () => {
        test('dispatches get_saved_queries', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_saved_queries', {});

            expect(services.queries.getAllQueries).toHaveBeenCalled();
            expect(result).toEqual([{ name: 'q1', kql: 'traces | take 10' }]);
        });

        test('dispatches search_queries', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('search_queries', { searchTerms: ['perf'] });

            expect(services.queries.searchQueries).toHaveBeenCalledWith(['perf']);
            expect(result).toEqual([{ name: 'found' }]);
        });

        test('dispatches save_query', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('save_query', {
                name: 'test-q',
                kql: 'traces | take 5',
                purpose: 'test',
                useCase: 'testing',
                tags: ['test'],
                category: 'perf'
            });

            expect(services.queries.saveQuery).toHaveBeenCalledWith(
                'test-q', 'traces | take 5', 'test', 'testing', ['test'], 'perf', undefined
            );
            expect(result).toEqual({ filePath: '/queries/test.kql' });
        });

        test('dispatches get_categories', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_categories', {});

            expect(services.queries.getCategories).toHaveBeenCalled();
            expect(result).toEqual(['performance', 'errors']);
        });

        test('dispatches get_external_queries', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_external_queries', {});

            expect(services.references.getAllExternalQueries).toHaveBeenCalled();
            expect(result).toEqual([{ name: 'ext-query' }]);
        });

        test('dispatches get_cache_stats', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_cache_stats', {});

            expect(services.cache.getStats).toHaveBeenCalled();
            expect(result).toEqual({ totalEntries: 5, hitRate: 0.5 });
        });

        test('dispatches clear_cache', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('clear_cache', {});

            expect(services.cache.clear).toHaveBeenCalled();
            expect(result).toEqual({ success: true, message: 'Cache cleared successfully' });
        });

        test('dispatches cleanup_cache', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('cleanup_cache', {});

            expect(services.cache.cleanupExpired).toHaveBeenCalled();
            expect(result).toHaveProperty('success', true);
            expect(result).toHaveProperty('stats');
        });

        test('dispatches get_auth_status with valid config', async () => {
            const { handlers, services } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_auth_status', {});

            expect(services.auth.getStatus).toHaveBeenCalled();
            expect(result).toEqual({ authenticated: true });
        });

        test('dispatches get_auth_status with invalid config', async () => {
            const { handlers } = createHandlersWithServices({}, {}, ['Missing app ID']);
            const result = await handlers.executeToolCall('get_auth_status', {});

            expect(result).toHaveProperty('authenticated', false);
            expect(result).toHaveProperty('configurationIssues');
            expect(result.configurationIssues).toContain('Missing app ID');
        });

        test('dispatches list_profiles', async () => {
            const { handlers } = createHandlersWithServices();
            const result = await handlers.executeToolCall('list_profiles', {});

            // No .bctb-config.json → single profile mode
            expect(result).toHaveProperty('profileMode', 'single');
        });

        test('dispatches switch_profile with missing name', async () => {
            const { handlers } = createHandlersWithServices();

            await expect(handlers.executeToolCall('switch_profile', {}))
                .rejects.toThrow('profileName parameter is required');
        });

        test('dispatches get_recommendations with deprecation notice', async () => {
            const { handlers } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_recommendations', {
                kql: 'traces | where * | take 10',
                results: { rows: [] }
            });

            expect(result).toHaveProperty('deprecated', true);
            expect(result).toHaveProperty('message');
            expect(result.message).toContain('deprecated');
            expect(Array.isArray(result.recommendations)).toBe(true);
        });

        test('dispatches get_recommendations without results (no crash)', async () => {
            const { handlers } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_recommendations', {
                kql: 'traces | take 10'
            });

            expect(result).toHaveProperty('deprecated', true);
            expect(Array.isArray(result.recommendations)).toBe(true);
        });

        test('dispatches query_telemetry with empty kql throws', async () => {
            const { handlers } = createHandlersWithServices();

            await expect(handlers.executeToolCall('query_telemetry', { kql: '' }))
                .rejects.toThrow('QUERY BLOCKED');
        });

        test('dispatches query_telemetry with valid kql', async () => {
            const { handlers } = createHandlersWithServices();
            const result = await handlers.executeToolCall('query_telemetry', {
                kql: 'traces | take 10',
                useContext: false,
                includeExternal: false
            });

            expect(result).toHaveProperty('type');
        });

        test('dispatches get_event_schema requires eventId', async () => {
            const { handlers } = createHandlersWithServices();

            await expect(handlers.executeToolCall('get_event_schema', {}))
                .rejects.toThrow('eventId parameter is required');
        });

        test('dispatches get_event_field_samples requires eventId', async () => {
            const { handlers } = createHandlersWithServices();

            await expect(handlers.executeToolCall('get_event_field_samples', {}))
                .rejects.toThrow('eventId parameter is required');
        });

        test('throws for unknown tool', async () => {
            const { handlers } = createHandlersWithServices();

            await expect(handlers.executeToolCall('nonexistent_tool', {}))
                .rejects.toThrow('Unknown tool: nonexistent_tool');
        });

        test('tracks telemetry on success', async () => {
            const { handlers, services } = createHandlersWithServices();
            await handlers.executeToolCall('get_saved_queries', {});

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.ToolCompleted',
                expect.any(Object),
                expect.objectContaining({ duration: expect.any(Number) })
            );
        });

        test('tracks telemetry on failure', async () => {
            const mockQueries = {
                getAllQueries: jest.fn().mockImplementation(() => { throw new Error('fail'); }),
                searchQueries: jest.fn(),
                saveQuery: jest.fn(),
                getCategories: jest.fn()
            };
            const { handlers, services } = createHandlersWithServices({}, {
                queries: mockQueries as any
            });

            await expect(handlers.executeToolCall('get_saved_queries', {})).rejects.toThrow('fail');

            expect(services.usageTelemetry.trackEvent).toHaveBeenCalledWith(
                'Mcp.ToolFailed',
                expect.any(Object),
                expect.objectContaining({ duration: expect.any(Number) })
            );
            expect(services.usageTelemetry.trackException).toHaveBeenCalled();
        });
    });

    // ─── checkConfigurationComplete ──────────────────────────────────────

    describe('checkConfigurationComplete', () => {
        test('does not throw when config is valid', () => {
            const { handlers } = createHandlersWithServices();
            expect(() => handlers.checkConfigurationComplete()).not.toThrow();
        });

        test('throws when config has errors', () => {
            const { handlers } = createHandlersWithServices({}, {}, ['Missing app ID']);
            expect(() => handlers.checkConfigurationComplete()).toThrow('Configuration incomplete');
        });
    });

    // ─── executeQuery ────────────────────────────────────────────────────

    describe('executeQuery', () => {
        test('returns cached result when available', async () => {
            const cachedResult: QueryResult = {
                type: 'table',
                kql: 'traces | take 10',
                summary: 'Cached',
                columns: ['col'],
                rows: [['val']],
                cached: false
            };
            const { handlers } = createHandlersWithServices({}, {
                cache: {
                    get: jest.fn().mockReturnValue(cachedResult),
                    set: jest.fn(),
                    getStats: jest.fn(),
                    clear: jest.fn(),
                    cleanupExpired: jest.fn()
                } as any
            });

            const result = await handlers.executeQuery('traces | take 10', false, false);
            expect(result.cached).toBe(true);
        });

        test('returns validation errors', async () => {
            const { handlers } = createHandlersWithServices({}, {
                kusto: {
                    executeQuery: jest.fn(),
                    parseResult: jest.fn(),
                    validateQuery: jest.fn().mockReturnValue(['Invalid syntax'])
                } as any
            });

            const result = await handlers.executeQuery('bad query', false, false);
            expect(result.type).toBe('error');
            expect(result.recommendations).toContain('Invalid syntax');
        });

        test('executes query and returns result', async () => {
            const { handlers, services } = createHandlersWithServices();

            const result = await handlers.executeQuery('traces | take 10', false, false);

            expect(services.auth.getAccessToken).toHaveBeenCalled();
            expect(services.kusto.executeQuery).toHaveBeenCalled();
            expect(result.type).toBe('table');
            expect(result.cached).toBe(false);
        });

        test('caches result after execution', async () => {
            const { handlers, services } = createHandlersWithServices();

            await handlers.executeQuery('traces | take 10', false, false);

            expect(services.cache.set).toHaveBeenCalledWith(
                'traces | take 10',
                expect.objectContaining({ type: 'table' })
            );
        });

        test('sanitizes result when removePII is true', async () => {
            const { sanitizeObject } = require('@bctb/shared');
            const { handlers } = createHandlersWithServices({ removePII: true });

            await handlers.executeQuery('traces | take 10', false, false);

            expect(sanitizeObject).toHaveBeenCalled();
        });

        test('returns error result on exception', async () => {
            const { handlers } = createHandlersWithServices({}, {
                kusto: {
                    executeQuery: jest.fn().mockRejectedValue(new Error('Connection failed')),
                    parseResult: jest.fn(),
                    validateQuery: jest.fn().mockReturnValue([])
                } as any
            });

            const result = await handlers.executeQuery('traces | take 10', false, false);
            expect(result.type).toBe('error');
            expect(result.summary).toContain('Connection failed');
        });
    });

    // ─── getEventCatalog ─────────────────────────────────────────────────

    describe('getEventCatalog', () => {
        test('returns event catalog with defaults', async () => {
            const { handlers } = createHandlersWithServices();

            // Mock executeQuery to return event rows
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table',
                kql: '',
                summary: 'OK',
                columns: ['eventId', 'shortMessage', 'status', 'count', 'LearnUrl'],
                rows: [
                    ['RT0005', 'Report rendered', 'success', 100, 'https://learn.microsoft.com/'],
                    ['RT0012', 'Error occurred', 'error', 50, 'https://learn.microsoft.com/']
                ],
                cached: false
            });

            const result = await handlers.getEventCatalog();

            expect(result).toHaveProperty('events');
            expect(result.events).toHaveLength(2);
            expect(result.events[0]).toHaveProperty('eventId', 'RT0005');
            expect(result).toHaveProperty('daysBack', 10);
            // Percentile-based significant events
            expect(result).toHaveProperty('uniqueEventIds', 2);
            expect(result).toHaveProperty('significantEvents');
            expect(result.significantEvents.length).toBeGreaterThan(0);
            // RT0005 has 100 out of 150 total = 66.7%, so it alone covers >50% but we need 90%
            // RT0005 (66.7%) + RT0012 (33.3%) = 100%, both should be significant
            expect(result.significantEvents).toHaveLength(2);
            expect(result.significantEvents[0].eventId).toBe('RT0005');
            expect(result.significantEvents[0].pct).toBeCloseTo(66.7, 0);
            expect(result.significantEvents[1].eventId).toBe('RT0012');
            // requiredNextStep should list both events
            expect(result.requiredNextStep).toContain('RT0005');
            expect(result.requiredNextStep).toContain('RT0012');
            expect(result.requiredNextStep).toContain('100%');
        });

        test('limits maxResults to 200', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK', columns: [], rows: [], cached: false
            });

            const result = await handlers.getEventCatalog(10, 'all', 1, false, 500);
            expect(result.maxResults).toBe(200);
        });

        test('throws on query error', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'error', kql: '', summary: 'Auth failed', cached: false
            });

            await expect(handlers.getEventCatalog()).rejects.toThrow('Auth failed');
        });

        test('includes common fields when requested', async () => {
            const { handlers } = createHandlersWithServices();

            // First call: catalog query
            // Second call: common fields query
            jest.spyOn(handlers, 'executeQuery')
                .mockResolvedValueOnce({
                    type: 'table', kql: '', summary: 'OK',
                    columns: ['eventId', 'shortMessage', 'status', 'count', 'LearnUrl'],
                    rows: [['RT0005', 'Report', 'success', 100, 'url']],
                    cached: false
                })
                .mockResolvedValueOnce({
                    type: 'table', kql: '', summary: 'OK',
                    columns: ['eventId', 'customDimensions'],
                    rows: [['RT0005', { fieldA: 'val1', fieldB: 'val2' }]],
                    cached: false
                });

            const result = await handlers.getEventCatalog(10, 'all', 1, true, 50);
            expect(result).toHaveProperty('commonFields');
        });

        test('calculates percentile coverage — top events cover 90%', async () => {
            const { handlers } = createHandlersWithServices();

            // Simulate realistic scenario: one dominant event + many small ones
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['eventId', 'shortMessage', 'status', 'count', 'LearnUrl'],
                rows: [
                    ['RT0006', 'Report rendering failed', 'error', 105000, 'url1'],
                    ['RT0001', 'Authorization failed', 'error', 21000, 'url2'],
                    ['RT0030', 'Error dialog shown', 'error', 12000, 'url3'],
                    ['RT0031', 'Permission error', 'error', 900, 'url4'],
                    ['RT0002', 'Auth failed on company', 'error', 700, 'url5'],
                    ['RT0012', 'Database lock timeout', 'error', 120, 'url6'],
                    ['AL0000JRG', 'Job queue error', 'error', 30, 'url7'],
                ],
                cached: false
            });

            const result = await handlers.getEventCatalog(10, 'error', 1, false, 50);

            // Total: 139,750. 90% = 125,775
            // RT0006: 105,000 (75.1%) — cumulative 75.1%
            // RT0001:  21,000 (15.0%) — cumulative 90.2% → threshold hit
            expect(result.significantEvents).toHaveLength(2);
            expect(result.significantEvents[0].eventId).toBe('RT0006');
            expect(result.significantEvents[1].eventId).toBe('RT0001');
            expect(result.requiredNextStep).toContain('RT0006');
            expect(result.requiredNextStep).toContain('RT0001');
            // Should NOT mention RT0030 (it's below the 90th percentile threshold)
            expect(result.significantEvents.map((e: any) => e.eventId)).not.toContain('RT0030');
        });

        test('deduplicates events by eventId when computing percentile', async () => {
            const { handlers } = createHandlersWithServices();

            // Same eventId appears multiple times with different shortMessages
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['eventId', 'shortMessage', 'status', 'count', 'LearnUrl'],
                rows: [
                    ['LC0156', 'App update v1.0', 'success', 500, 'url1'],
                    ['LC0156', 'App update v2.0', 'success', 300, 'url1'],
                    ['LC0156', 'App update v3.0', 'success', 200, 'url1'],
                    ['RT0005', 'Report rendered', 'success', 50, 'url2'],
                ],
                cached: false
            });

            const result = await handlers.getEventCatalog();

            // Raw events are still 4 rows, but unique = 2
            expect(result.events).toHaveLength(4);
            expect(result.uniqueEventIds).toBe(2);
            // LC0156 deduplicated: 500+300+200=1000 out of 1050 total = 95.2%
            expect(result.significantEvents).toHaveLength(1);
            expect(result.significantEvents[0].eventId).toBe('LC0156');
            expect(result.significantEvents[0].count).toBe(1000);
        });

        test('handles empty events gracefully', async () => {
            const { handlers } = createHandlersWithServices();

            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['eventId', 'shortMessage', 'status', 'count', 'LearnUrl'],
                rows: [],
                cached: false
            });

            const result = await handlers.getEventCatalog();

            expect(result.uniqueEventIds).toBe(0);
            expect(result.significantEvents).toHaveLength(0);
            expect(result.requiredNextStep).toContain('get_event_field_samples');
        });
    });

    // ─── getEventSchema ──────────────────────────────────────────────────

    describe('getEventSchema', () => {
        test('returns schema for event', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['customDimensions'],
                rows: [
                    [{ fieldA: 'value1', fieldB: 42 }],
                    [{ fieldA: 'value2', fieldC: true }]
                ],
                cached: false
            });

            const result = await handlers.getEventSchema('RT0005');

            expect(result).toHaveProperty('eventId', 'RT0005');
            expect(result).toHaveProperty('fields');
            expect(result.fields.length).toBeGreaterThan(0);
            expect(result).toHaveProperty('usage');
        });

        test('throws on query error', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'error', kql: '', summary: 'Not found', cached: false
            });

            await expect(handlers.getEventSchema('INVALID')).rejects.toThrow('Not found');
        });
    });

    // ─── getEventFieldSamples ────────────────────────────────────────────

    describe('getEventFieldSamples', () => {
        test('returns field samples for event', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: [
                    ['2025-01-01', 'Report rendered', { eventId: 'RT0005', executionTime: '00:00:01.234', reportName: 'TestReport' }],
                    ['2025-01-02', 'Report rendered', { eventId: 'RT0005', executionTime: '00:00:02.000', reportName: 'Other' }]
                ],
                cached: false
            });

            const result = await handlers.getEventFieldSamples('RT0005');

            expect(result).toHaveProperty('eventId', 'RT0005');
            expect(result).toHaveProperty('fields');
            expect(result).toHaveProperty('exampleQuery');
            expect(result).toHaveProperty('category');
            expect(result).toHaveProperty('recommendations');
        });

        test('returns no-data result when no events found', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: [],
                cached: false
            });

            const result = await handlers.getEventFieldSamples('RT9999', 10, 7);
            expect(result).toHaveProperty('eventId', 'RT9999');
            expect(result).toHaveProperty('samplesAnalyzed', 0);
            expect(result).toHaveProperty('fields', []);
            expect(result.summary).toContain('No events found');
            expect(result).toHaveProperty('recommendations');
        });

        test('returns no-data result when rows is undefined', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: undefined as any,
                cached: false
            });

            const result = await handlers.getEventFieldSamples('RT9999', 10, 7);
            expect(result).toHaveProperty('eventId', 'RT9999');
            expect(result).toHaveProperty('samplesAnalyzed', 0);
            expect(result).toHaveProperty('fields', []);
        });

        test('handles string-encoded customDimensions', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: [
                    ['2025-01-01', 'msg', JSON.stringify({ eventId: 'RT0005', field1: 'val' })]
                ],
                cached: false
            });

            const result = await handlers.getEventFieldSamples('RT0005');
            expect(result).toHaveProperty('fields');
            expect(result.fields.length).toBeGreaterThan(0);
        });

        test('detects timespan fields', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: [
                    ['2025-01-01', 'msg', { eventId: 'RT0005', serverExecutionTime: '00:01:23.4567890' }]
                ],
                cached: false
            });

            const result = await handlers.getEventFieldSamples('RT0005');
            const timeField = result.fields.find((f: any) => f.fieldName === 'serverExecutionTime');
            expect(timeField?.dataType).toBe('timespan');
        });
    });

    // ─── getTenantMapping ────────────────────────────────────────────────

    describe('getTenantMapping', () => {
        test('returns tenant mappings', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['companyName', 'aadTenantId', 'count_'],
                rows: [
                    ['Contoso', 'tenant-123', 500],
                    ['Fabrikam', 'tenant-456', 200]
                ],
                cached: false
            });

            const result = await handlers.getTenantMapping(10);

            expect(result).toHaveProperty('daysBack', 10);
            expect(result.mappings).toHaveLength(2);
            expect(result.mappings[0]).toHaveProperty('companyName', 'Contoso');
        });

        test('applies company name filter', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['companyName', 'aadTenantId', 'count_'],
                rows: [['Contoso', 'tenant-123', 500]],
                cached: false
            });

            const result = await handlers.getTenantMapping(10, 'Contoso');
            expect(result.mappings).toHaveLength(1);
        });

        test('throws on query error', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'error', kql: '', summary: 'Failed', cached: false
            });

            await expect(handlers.getTenantMapping()).rejects.toThrow('Failed');
        });
    });

    // ─── isTimespanValue ─────────────────────────────────────────────────

    describe('isTimespanValue', () => {
        test('detects timespan string format', () => {
            const { handlers } = createHandlersWithServices();

            expect(handlers.isTimespanValue('00:01:23.4567890', 'anything')).toBe(true);
            expect(handlers.isTimespanValue('1.02:30:00', 'anything')).toBe(true);
            expect(handlers.isTimespanValue('12:30:00', 'anything')).toBe(true);
        });

        test('detects duration-like field names', () => {
            const { handlers } = createHandlersWithServices();

            expect(handlers.isTimespanValue('some_value', 'executionTime')).toBe(true);
            expect(handlers.isTimespanValue('some_value', 'totalDuration')).toBe(true);
            expect(handlers.isTimespanValue('some_value', 'serverLatency')).toBe(true);
            expect(handlers.isTimespanValue('some_value', 'waitElapsed')).toBe(true);
        });

        test('returns false for non-timespan values', () => {
            const { handlers } = createHandlersWithServices();

            expect(handlers.isTimespanValue('hello', 'name')).toBe(false);
            expect(handlers.isTimespanValue(42, 'count')).toBe(false);
            expect(handlers.isTimespanValue(true, 'enabled')).toBe(false);
        });
    });

    // ─── generateRecommendations ─────────────────────────────────────────

    describe('generateRecommendations', () => {
        test('recommends pipe before where', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces where x = 1', {});

            expect(recs).toContainEqual(expect.stringContaining('pipe operator'));
        });

        test('recommends no wildcard', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | project *', {});

            expect(recs).toContainEqual(expect.stringContaining('explicit columns'));
        });

        test('recommends time range', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | take 10', {});

            expect(recs).toContainEqual(expect.stringContaining('time range'));
        });

        test('recommends limit for large result', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | where timestamp > ago(1d)', {
                rows: new Array(10001)
            });

            expect(recs).toContainEqual(expect.stringContaining('Large result set'));
        });

        test('returns empty for good query', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | where timestamp > ago(1d) | project col1 | take 100', {
                rows: [['a']]
            });

            expect(recs).toHaveLength(0);
        });

        test('returns empty array when kql is undefined', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations(undefined as any, {});

            expect(recs).toEqual([]);
        });

        test('returns empty array when kql is empty string', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('', {});

            expect(recs).toEqual([]);
        });

        test('returns empty array when kql is non-string type', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations(123 as any, {});

            expect(recs).toEqual([]);
        });

        test('handles undefined results without crashing', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | take 10', undefined);

            expect(Array.isArray(recs)).toBe(true);
        });

        test('handles null results without crashing', async () => {
            const { handlers } = createHandlersWithServices();
            const recs = await handlers.generateRecommendations('traces | take 10', null);

            expect(Array.isArray(recs)).toBe(true);
        });
    });

    // ─── listProfiles ────────────────────────────────────────────────────

    describe('listProfiles', () => {
        test('returns single profile when no config file', () => {
            const { handlers } = createHandlersWithServices();
            const result = handlers.listProfiles();

            expect(result).toHaveProperty('profileMode', 'single');
            expect(result.currentProfile).toHaveProperty('name', 'default');
        });
    });

    // ─── switchProfile ───────────────────────────────────────────────────

    describe('switchProfile', () => {
        test('fails when no config file exists', () => {
            const { handlers } = createHandlersWithServices();
            const result = handlers.switchProfile('production');

            expect(result).toHaveProperty('success', false);
            expect(result.error).toContain('No .bctb-config.json found');
        });
    });

    // ─── detectInitialProfile ────────────────────────────────────────────

    describe('detectInitialProfile', () => {
        test('returns null when no config file', () => {
            const { handlers } = createHandlersWithServices();
            expect(handlers.detectInitialProfile()).toBeNull();
        });
    });

    // ─── configFilePath fallback (Issue #95 / PR #96 / PR #99) ──────────
    //     Verifies that ToolHandlers (stdio mode) uses configFilePath
    //     when the config file lives OUTSIDE workspacePath

    describe('configFilePath — non-default config location (Issue #95)', () => {
        const originalEnv = process.env;
        let externalConfigDir: string;

        beforeEach(() => {
            process.env = { ...originalEnv };
            externalConfigDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'bctb-th-configpath-'));
        });

        afterEach(() => {
            process.env = originalEnv;
            fs.rmSync(externalConfigDir, { recursive: true, force: true });
        });

        /** Write a multi-profile config to the external dir with a custom filename */
        function createExternalConfig(): string {
            const configPath = path.join(externalConfigDir, 'my-custom-config.json');
            const config = {
                defaultProfile: 'Alpha',
                profiles: {
                    _base: {
                        authFlow: 'azure_cli',
                        kustoClusterUrl: 'https://ade.applicationinsights.io'
                    },
                    Alpha: {
                        extends: '_base',
                        connectionName: 'Alpha Environment',
                        applicationInsightsAppId: 'alpha-app-id',
                        tenantId: 'alpha-tenant'
                    },
                    Beta: {
                        extends: '_base',
                        connectionName: 'Beta Environment',
                        applicationInsightsAppId: 'beta-app-id',
                        tenantId: 'beta-tenant'
                    }
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            return configPath;
        }

        test('detectInitialProfile uses configFilePath when set', () => {
            const externalPath = createExternalConfig();
            const { handlers } = createHandlersWithServices({ configFilePath: externalPath } as any);

            delete process.env.BCTB_PROFILE;
            const result = handlers.detectInitialProfile();
            expect(result).toBe('Alpha');
        });

        test('detectInitialProfile returns null when configFilePath is not set and no file in workspacePath', () => {
            const { handlers } = createHandlersWithServices();
            const result = handlers.detectInitialProfile();
            expect(result).toBeNull();
        });

        test('listProfiles returns multi-profile mode when configFilePath points outside workspacePath', () => {
            const externalPath = createExternalConfig();
            const { handlers } = createHandlersWithServices({ configFilePath: externalPath } as any);
            const result = handlers.listProfiles();

            expect(result.profileMode).toBe('multi');
            const allNames = [
                result.currentProfile.name,
                ...result.availableProfiles.map((p: any) => p.name)
            ];
            expect(allNames).toContain('Alpha');
            expect(allNames).toContain('Beta');
            expect(allNames).not.toContain('_base');
        });

        test('listProfiles falls back to single mode when configFilePath is not set and no file in workspacePath', () => {
            const { handlers } = createHandlersWithServices();
            const result = handlers.listProfiles();

            expect(result.profileMode).toBe('single');
        });

        test('switchProfile succeeds when configFilePath points outside workspacePath', () => {
            const externalPath = createExternalConfig();
            process.env.BCTB_WORKSPACE_PATH = externalConfigDir;
            const { handlers } = createHandlersWithServices({ configFilePath: externalPath } as any);

            const result = handlers.switchProfile('Beta');
            expect(result.success).toBe(true);
            expect(result.currentProfile.name).toBe('Beta');
            expect(result.currentProfile.connectionName).toBe('Beta Environment');
        });

        test('switchProfile fails when configFilePath is not set and no file in workspacePath', () => {
            const { handlers } = createHandlersWithServices();
            const result = handlers.switchProfile('Beta');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No .bctb-config.json found');
        });
    });

    // ─── workspace-discovered profiles (Claude Code) ──────────────────────
    //     docs/plans/mcp-workspace-connection-discovery.md

    describe('workspace-discovered profiles (Claude Code)', () => {
        const originalEnv = process.env;
        let projectDir: string;   // simulates CLAUDE_PROJECT_DIR
        let globalCfgDir: string; // holds the pinned global multi-profile config

        beforeEach(() => {
            process.env = { ...originalEnv };
            delete process.env.CLAUDE_PROJECT_DIR;
            delete process.env.BCTB_PROFILE;
            delete process.env.BCTB_WORKSPACE_PATH;
            delete process.env.BCTB_AUTO_WORKSPACE_CONNECTION;
            projectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-ws-proj-'));
            globalCfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-ws-glob-'));
        });

        afterEach(() => {
            process.env = originalEnv;
            fs.rmSync(projectDir, { recursive: true, force: true });
            fs.rmSync(globalCfgDir, { recursive: true, force: true });
        });

        /** Pinned global multi-profile config (like ~/.config/.../config.json). */
        function writeGlobalConfig(): string {
            const p = path.join(globalCfgDir, 'config.json');
            fs.writeFileSync(p, JSON.stringify({
                defaultProfile: 'ifacto-customers',
                profiles: {
                    _base: { authFlow: 'azure_cli', kustoClusterUrl: 'https://ade.applicationinsights.io' },
                    'ifacto-customers': { extends: '_base', connectionName: 'iFacto Customers', applicationInsightsAppId: 'GLOBAL-IFACTO' },
                    'bctb-usage': { extends: '_base', connectionName: 'BCTB Usage', applicationInsightsAppId: 'GLOBAL-BCTB' }
                }
            }));
            return p;
        }

        /**
         * Create a customer workspace under projectDir and return the folder that
         * CLAUDE_PROJECT_DIR should point at (the customer root). When `sub` is set
         * the config lives one level below the root (the Coeck/TelemetryAnalysis layout).
         */
        function makeCustomerWorkspace(customer: string, connectionName: string, appId: string, sub: string | null = 'TelemetryAnalysis'): string {
            const root = path.join(projectDir, customer);
            const dir = sub ? path.join(root, sub) : root;
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, '.bctb-config.json'), JSON.stringify({
                connectionName, applicationInsightsAppId: appId, kustoClusterUrl: 'https://ade.applicationinsights.io', authFlow: 'azure_cli'
            }));
            return root;
        }

        it('AC-W4: derives a stable, unique key per discovered connection', () => {
            const { handlers } = createHandlersWithServices();
            const d = (root: string, cfg: string, conn: string, sub: string | undefined, appId: string, taken: Set<string>) =>
                (handlers as any).deriveWorkspaceProfileKey(root, cfg, conn, sub, appId, taken);

            // config directly in the opened folder -> folder basename
            expect(d('/x/Coeck', '/x/Coeck/.bctb-config.json', 'Coeck', undefined, 'app1', new Set())).toBe('Coeck');
            // config one level down in a generic subfolder -> opened-folder basename (the Coeck layout)
            expect(d('/x/Coeck', '/x/Coeck/TelemetryAnalysis/.bctb-config.json', 'Coeck', undefined, 'app1', new Set())).toBe('Coeck');
            // config one level down in a meaningful subfolder -> that subfolder name
            expect(d('/x/parent', '/x/parent/CustA/.bctb-config.json', 'iFacto Customers', undefined, 'appA', new Set())).toBe('CustA');
            // generic root + generic child -> falls back to connectionName
            expect(d('/x/TelemetryAnalysis', '/x/TelemetryAnalysis/.bctb-config.json', 'iFacto Customers', undefined, 'appI', new Set())).toBe('iFacto Customers');
            // collision with an existing/file profile name -> appId hash suffix (hashValue mocked -> 'abc123def456')
            expect(d('/x/Coeck', '/x/Coeck/.bctb-config.json', 'Coeck', undefined, 'app1', new Set(['Coeck']))).toBe('Coeck#abc123');
            // sub-profile name appended
            expect(d('/x/Multi', '/x/Multi/TelemetryAnalysis/.bctb-config.json', 'Multi Prod', 'prod', 'app1', new Set())).toBe('Multi/prod');
        });

        it('AC-W5: discovers a workspace config one level below CLAUDE_PROJECT_DIR (idempotent)', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.workspaceProfiles.size).toBe(1);
            handlers.ensureWorkspaceProfilesDiscovered(); // second call must not duplicate
            expect(handlers.workspaceProfiles.size).toBe(1);

            const entry = [...handlers.workspaceProfiles.values()][0];
            expect(entry.key).toBe('Coeck');
            expect(entry.connectionName).toBe('Coeck');
            expect(entry.applicationInsightsAppId).toBe('ce466ef1');
            expect(entry.source).toBe('workspace');
            expect(entry.origin).toBe('claude-project-dir');
        });

        it('AC-W6: list_profiles merges workspace connections with the global profiles', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            const result = handlers.listProfiles();
            expect(result.profileMode).toBe('multi');
            const names = [result.currentProfile, ...result.availableProfiles].map((p: any) => p.name);
            expect(names).toContain('ifacto-customers');
            expect(names).toContain('bctb-usage');

            const ws = result.availableProfiles.find((p: any) => p.source === 'workspace');
            expect(ws).toBeDefined();
            expect(ws.connectionName).toBe('Coeck');
            expect(ws.isActive).toBe(false);
            expect(result.usage.workspaceConnections).toBeDefined();
        });

        it('AC-W7: surfaces workspace connections even when the base config is flat/single', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const flatBase = path.join(globalCfgDir, 'flat.json');
            fs.writeFileSync(flatBase, JSON.stringify({ connectionName: 'Global Flat', applicationInsightsAppId: 'FLAT', authFlow: 'azure_cli', kustoClusterUrl: 'https://ade.applicationinsights.io' }));
            const { handlers } = createHandlersWithServices({ configFilePath: flatBase } as any);

            const result = handlers.listProfiles();
            const ws = result.availableProfiles.find((p: any) => p.source === 'workspace');
            expect(ws).toBeDefined();
            expect(ws.connectionName).toBe('Coeck');
        });

        it('AC-W8: switch_profile selects a workspace connection and rebuilds services', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            const result = handlers.switchProfile('Coeck');
            expect(result.success).toBe(true);
            expect(result.source).toBe('workspace');
            expect(result.currentProfile.connectionName).toBe('Coeck');
            expect(handlers.activeProfileSource).toBe('workspace');
            expect(handlers.config.applicationInsightsAppId).toBe('ce466ef1');
        });

        it('AC-W9: after a workspace switch, global profiles remain listable and switchable (no strand)', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.switchProfile('Coeck').success).toBe(true);

            const list = handlers.listProfiles();
            const names = [list.currentProfile, ...list.availableProfiles].map((p: any) => p.name);
            expect(names).toContain('ifacto-customers');
            expect(names).toContain('bctb-usage');

            const back = handlers.switchProfile('bctb-usage');
            expect(back.success).toBe(true);
            expect(back.currentProfile.connectionName).toBe('BCTB Usage');
            expect(handlers.activeProfileSource).toBe('file');
            expect(handlers.config.applicationInsightsAppId).toBe('GLOBAL-BCTB');
        });

        it('AC-W10: switch_profile by connectionName errors when ambiguous, leaving state unchanged', () => {
            // Two customers directly one level below a shared parent, same connectionName.
            fs.mkdirSync(path.join(projectDir, 'CustA'));
            fs.writeFileSync(path.join(projectDir, 'CustA', '.bctb-config.json'), JSON.stringify({ connectionName: 'iFacto Customers', applicationInsightsAppId: 'APP-A', kustoClusterUrl: 'https://ade', authFlow: 'azure_cli' }));
            fs.mkdirSync(path.join(projectDir, 'CustB'));
            fs.writeFileSync(path.join(projectDir, 'CustB', '.bctb-config.json'), JSON.stringify({ connectionName: 'iFacto Customers', applicationInsightsAppId: 'APP-B', kustoClusterUrl: 'https://ade', authFlow: 'azure_cli' }));
            process.env.CLAUDE_PROJECT_DIR = projectDir;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.workspaceProfiles.size).toBe(2);
            const beforeAppId = handlers.config.applicationInsightsAppId;
            const result = handlers.switchProfile('iFacto Customers');
            expect(result.success).toBe(false);
            expect(result.error.toLowerCase()).toContain('ambiguous');
            expect(handlers.config.applicationInsightsAppId).toBe(beforeAppId);
        });

        it('AC-W11: a service constructor failure mid-switch leaves state unchanged (atomic)', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            const beforeAppId = handlers.config.applicationInsightsAppId;
            const beforeSource = handlers.activeProfileSource;
            const beforeName = handlers.activeProfileName;

            const shared = require('@bctb/shared');
            (shared.KustoService as jest.Mock).mockImplementationOnce(() => { throw new Error('boom'); });

            const result = handlers.switchProfile('Coeck');
            expect(result.success).toBe(false);
            expect(handlers.config.applicationInsightsAppId).toBe(beforeAppId);
            expect(handlers.activeProfileSource).toBe(beforeSource);
            expect(handlers.activeProfileName).toBe(beforeName);
        });

        it('AC-W15: a multi-profile workspace config registers one entry per sub-profile', () => {
            const root = path.join(projectDir, 'Multi');
            const dir = path.join(root, 'TelemetryAnalysis');
            fs.mkdirSync(dir, { recursive: true });
            fs.writeFileSync(path.join(dir, '.bctb-config.json'), JSON.stringify({
                defaultProfile: 'prod',
                profiles: {
                    _base: { authFlow: 'azure_cli', kustoClusterUrl: 'https://ade' },
                    prod: { extends: '_base', connectionName: 'Multi Prod', applicationInsightsAppId: 'MULTI-PROD' },
                    test: { extends: '_base', connectionName: 'Multi Test', applicationInsightsAppId: 'MULTI-TEST' }
                }
            }));
            process.env.CLAUDE_PROJECT_DIR = root;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.workspaceProfiles.size).toBe(2);
            const conns = [...handlers.workspaceProfiles.values()].map((e: any) => e.connectionName).sort();
            expect(conns).toEqual(['Multi Prod', 'Multi Test']);

            const r = handlers.switchProfile('Multi Prod');
            expect(r.success).toBe(true);
            expect(handlers.config.applicationInsightsAppId).toBe('MULTI-PROD');
        });

        it('AC-W14 (unset): discovery never changes the active connection without the opt-in flag', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            delete process.env.BCTB_AUTO_WORKSPACE_CONNECTION;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            // Discovered, but the active connection is untouched (still the one the server booted with).
            expect(handlers.workspaceProfiles.size).toBe(1);
            expect(handlers.activeProfileSource).toBe('file');
            expect(handlers.config.applicationInsightsAppId).toBe('test-app-id');
        });

        it('AC-W14 (set, one): opt-in flag auto-activates the single discovered connection, loudly', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            process.env.BCTB_AUTO_WORKSPACE_CONNECTION = '1';
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);
            const errSpy = jest.spyOn(console, 'error').mockImplementation();

            const activated = handlers.maybeAutoActivateWorkspaceConnection();

            expect(activated).toBe('Coeck');
            expect(handlers.activeProfileSource).toBe('workspace');
            expect(handlers.activeProfileAutoActivated).toBe(true);
            expect(handlers.config.applicationInsightsAppId).toBe('ce466ef1');
            expect(errSpy.mock.calls.flat().join(' ')).toContain('AUTO-ACTIVATED');
            errSpy.mockRestore();
        });

        it('AC-W14 (crash-safe): a failure during auto-activation is non-fatal and leaves state unchanged', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            process.env.BCTB_AUTO_WORKSPACE_CONNECTION = '1';
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            const beforeAppId = handlers.config.applicationInsightsAppId;
            const beforeSource = handlers.activeProfileSource;
            const errSpy = jest.spyOn(console, 'error').mockImplementation();

            // A service constructor blows up during activation — must NOT crash startup.
            const shared = require('@bctb/shared');
            (shared.KustoService as jest.Mock).mockImplementationOnce(() => { throw new Error('boom'); });

            let activated: any;
            expect(() => { activated = handlers.maybeAutoActivateWorkspaceConnection(); }).not.toThrow();
            expect(activated).toBeNull();
            expect(handlers.config.applicationInsightsAppId).toBe(beforeAppId);
            expect(handlers.activeProfileSource).toBe(beforeSource);
            errSpy.mockRestore();
        });

        it('AC-W14 (set, many): opt-in flag does NOT auto-activate when more than one is discovered', () => {
            fs.mkdirSync(path.join(projectDir, 'CustA'));
            fs.writeFileSync(path.join(projectDir, 'CustA', '.bctb-config.json'), JSON.stringify({ connectionName: 'A', applicationInsightsAppId: 'APP-A', kustoClusterUrl: 'https://ade', authFlow: 'azure_cli' }));
            fs.mkdirSync(path.join(projectDir, 'CustB'));
            fs.writeFileSync(path.join(projectDir, 'CustB', '.bctb-config.json'), JSON.stringify({ connectionName: 'B', applicationInsightsAppId: 'APP-B', kustoClusterUrl: 'https://ade', authFlow: 'azure_cli' }));
            process.env.CLAUDE_PROJECT_DIR = projectDir;
            process.env.BCTB_AUTO_WORKSPACE_CONNECTION = 'true';
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.workspaceProfiles.size).toBe(2);
            const activated = handlers.maybeAutoActivateWorkspaceConnection();
            expect(activated).toBeNull();
            expect(handlers.activeProfileSource).toBe('file');
        });

        it('AC-W14 (no-op): does not retarget when the single discovered appId already matches the active one', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'same-app');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            process.env.BCTB_AUTO_WORKSPACE_CONNECTION = '1';
            // Active connection already targets the same App Insights resource.
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig(), applicationInsightsAppId: 'same-app' } as any);

            const activated = handlers.maybeAutoActivateWorkspaceConnection();
            expect(activated).toBeNull();
            expect(handlers.activeProfileSource).toBe('file');
        });

        it('AC-W13: registering the same config via CLAUDE_PROJECT_DIR and roots dedups to one entry', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);
            expect(handlers.workspaceProfiles.size).toBe(1);

            // The MCP roots path would register the same file again — must dedup by realpath.
            const cfgPath = path.join(coeckRoot, 'TelemetryAnalysis', '.bctb-config.json');
            handlers.registerWorkspaceConnection(cfgPath, coeckRoot, 'roots');
            expect(handlers.workspaceProfiles.size).toBe(1);
        });

        it('AC-W17: workspace-profile-switch telemetry carries no filesystem paths', () => {
            const coeckRoot = makeCustomerWorkspace('Coeck', 'Coeck', 'ce466ef1');
            process.env.CLAUDE_PROJECT_DIR = coeckRoot;
            const { handlers } = createHandlersWithServices({ configFilePath: writeGlobalConfig() } as any);

            expect(handlers.switchProfile('Coeck').success).toBe(true);

            const shared = require('@bctb/shared');
            const call = (shared.createCommonProperties as jest.Mock).mock.calls
                .find((c: any[]) => c[0] === 'Mcp.WorkspaceProfileSwitch');
            expect(call).toBeDefined();
            const options = call![5] || {};
            for (const v of Object.values(options)) {
                if (typeof v === 'string') {
                    expect(v.includes('/')).toBe(false);
                    expect(v.includes('\\')).toBe(false);
                }
            }
        });
    });
});
