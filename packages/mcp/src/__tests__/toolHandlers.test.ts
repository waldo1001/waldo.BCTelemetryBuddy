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
        MCP: { SERVER_STARTED: 'Mcp.ServerStarted', ERROR: 'Mcp.Error' },
        MCP_TOOLS: { QUERY_TELEMETRY: 'Mcp.Tools.QueryTelemetry' }
    },
    createCommonProperties: jest.fn().mockReturnValue({}),
    cleanTelemetryProperties: jest.fn().mockReturnValue({}),
    hashValue: jest.fn().mockReturnValue('abc123def456')
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

        test('dispatches get_recommendations', async () => {
            const { handlers } = createHandlersWithServices();
            const result = await handlers.executeToolCall('get_recommendations', {
                kql: 'traces | where * | take 10',
                results: { rows: [] }
            });

            expect(Array.isArray(result)).toBe(true);
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

        test('throws when no events found', async () => {
            const { handlers } = createHandlersWithServices();
            jest.spyOn(handlers, 'executeQuery').mockResolvedValue({
                type: 'table', kql: '', summary: 'OK',
                columns: ['timestamp', 'message', 'customDimensions'],
                rows: [],
                cached: false
            });

            await expect(handlers.getEventFieldSamples('RT9999', 10, 7))
                .rejects.toThrow('No events found');
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
});
