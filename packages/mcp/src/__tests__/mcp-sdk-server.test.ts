/**
 * Tests for the MCP SDK-based server (mcpSdkServer.ts).
 * 
 * Verifies that:
 * - createSdkServer registers all tools from TOOL_DEFINITIONS
 * - Tool callbacks delegate to ToolHandlers.executeToolCall
 * - Error handling returns isError: true CallToolResult
 * - Console redirection is present for stdio mode
 * - Zod schema conversion works for all property types
 */

import * as fs from 'fs';
import * as path from 'path';

// Mock the SDK
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => {
    return {
        McpServer: jest.fn().mockImplementation(() => ({
            server: {},
            registerTool: jest.fn(),
            registerPrompt: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
            close: jest.fn().mockResolvedValue(undefined)
        }))
    };
});

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => {
    return {
        StdioServerTransport: jest.fn().mockImplementation(() => ({}))
    };
});

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
        getStats: jest.fn().mockReturnValue({ totalEntries: 0 }),
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
        documentationUrl: 'https://learn.microsoft.com',
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
    hashValue: jest.fn().mockReturnValue('abc123')
}));

jest.mock('../mcpTelemetry.js', () => ({
    createMCPUsageTelemetry: jest.fn().mockReturnValue(null),
    getMCPInstallationId: jest.fn().mockReturnValue('test-installation-id')
}));

jest.mock('../version.js', () => ({
    VERSION: '2.4.0-test'
}));

import { TOOL_DEFINITIONS, getToolDefinition, getToolNames } from '../tools/toolDefinitions.js';

const mockConfig = {
    workspacePath: '/tmp/test',
    connectionName: 'test',
    applicationInsightsAppId: 'test-app-id',
    kustoClusterUrl: 'https://test.kusto.windows.net',
    authFlow: 'azure_cli',
    tenantId: 'test-tenant',
    cacheEnabled: false,
    cacheTTLSeconds: 3600,
    removePII: false,
    queriesFolder: 'queries',
    references: [],
    port: 3000
};

function createMockServices(overrides?: any) {
    return {
        auth: { authenticate: jest.fn(), getAccessToken: jest.fn(), getStatus: jest.fn() },
        kusto: { executeQuery: jest.fn(), parseResult: jest.fn(), validateQuery: jest.fn().mockReturnValue([]) },
        cache: { get: jest.fn(), set: jest.fn(), getStats: jest.fn(), clear: jest.fn(), cleanupExpired: jest.fn() },
        queries: { getAllQueries: jest.fn().mockReturnValue([]), searchQueries: jest.fn(), saveQuery: jest.fn(), getCategories: jest.fn() },
        references: { getAllExternalQueries: jest.fn() },
        usageTelemetry: { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() },
        installationId: 'test-id',
        sessionId: 'test-session',
        ...overrides
    };
}

describe('MCP SDK Server', () => {

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createSdkServer', () => {
        test('registers all tools from TOOL_DEFINITIONS', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            // McpServer mock was called once
            expect(McpServer).toHaveBeenCalledTimes(1);
            expect(McpServer).toHaveBeenCalledWith(
                expect.objectContaining({ name: 'BC Telemetry Buddy' }),
                expect.objectContaining({
                    instructions: expect.any(String),
                    capabilities: expect.objectContaining({
                        tools: { listChanged: true },
                        prompts: { listChanged: true }
                    })
                })
            );

            // registerTool was called for each tool definition
            const mockInstance = McpServer.mock.results[0].value;
            expect(mockInstance.registerTool).toHaveBeenCalledTimes(TOOL_DEFINITIONS.length);

            // Verify each tool was registered by name
            const registeredNames = mockInstance.registerTool.mock.calls.map(
                (call: any[]) => call[0]
            );

            for (const toolDef of TOOL_DEFINITIONS) {
                expect(registeredNames).toContain(toolDef.name);
            }
        });

        test('tool callbacks return proper CallToolResult format', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const services = createMockServices({
                queries: {
                    getAllQueries: jest.fn().mockReturnValue([{ name: 'test-query' }]),
                    searchQueries: jest.fn(),
                    saveQuery: jest.fn(),
                    getCategories: jest.fn()
                }
            });

            const handlers = new ToolHandlers(mockConfig, services, true, []);
            createSdkServer(handlers);

            // Get the callback for 'get_saved_queries'
            const mockInstance = McpServer.mock.results[0].value;
            const getSavedQueriesCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'get_saved_queries'
            );
            expect(getSavedQueriesCall).toBeDefined();

            // Call the callback
            const callback = getSavedQueriesCall[2]; // 3rd arg is the callback
            const result = await callback({});

            // Should return CallToolResult format
            expect(result).toHaveProperty('content');
            expect(result.content).toHaveLength(1);
            expect(result.content[0]).toHaveProperty('type', 'text');
            expect(result.content[0]).toHaveProperty('text');

            // Text should be the JSON-stringified result
            const parsed = JSON.parse(result.content[0].text);
            expect(parsed).toEqual([{ name: 'test-query' }]);
        });

        test('tool callbacks return isError on failure', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const services = createMockServices({
                queries: {
                    getAllQueries: jest.fn().mockImplementation(() => { throw new Error('DB error'); }),
                    searchQueries: jest.fn(),
                    saveQuery: jest.fn(),
                    getCategories: jest.fn()
                }
            });

            const handlers = new ToolHandlers(mockConfig, services, true, []);
            createSdkServer(handlers);

            // Get the callback for 'get_saved_queries' (which will throw)
            const mockInstance = McpServer.mock.results[0].value;
            const getSavedQueriesCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'get_saved_queries'
            );

            const callback = getSavedQueriesCall[2];
            const result = await callback({});

            // Should return error format
            expect(result).toHaveProperty('isError', true);
            expect(result.content[0].text).toContain('Error:');
            expect(result.content[0].text).toContain('DB error');
        });
    });

    describe('Tool definitions consistency', () => {
        test('TOOL_DEFINITIONS covers all expected tools', () => {
            const expectedTools = [
                'get_event_catalog',
                'get_event_field_samples',
                'get_event_schema',
                'get_tenant_mapping',
                'query_telemetry',
                'get_saved_queries',
                'search_queries',
                'save_query',
                'get_categories',
                'get_recommendations',
                'get_external_queries',
                'list_profiles',
                'switch_profile'
            ];

            const definedTools = TOOL_DEFINITIONS.map(t => t.name);

            for (const tool of expectedTools) {
                expect(definedTools).toContain(tool);
            }
        });

        test('all tool definitions have valid inputSchema', () => {
            for (const toolDef of TOOL_DEFINITIONS) {
                expect(toolDef.inputSchema).toHaveProperty('type', 'object');
                expect(toolDef.inputSchema).toHaveProperty('properties');
                expect(typeof toolDef.inputSchema.properties).toBe('object');
            }
        });

        test('all tool definitions have annotations', () => {
            for (const toolDef of TOOL_DEFINITIONS) {
                expect(toolDef.annotations).toBeDefined();
                expect(typeof toolDef.annotations!.readOnlyHint).toBe('boolean');
            }
        });
    });

    describe('Source code verification', () => {
        test('mcpSdkServer.ts uses official SDK imports', () => {
            const source = fs.readFileSync(
                path.join(__dirname, '../mcpSdkServer.ts'),
                'utf-8'
            );

            expect(source).toContain("@modelcontextprotocol/sdk/server/mcp.js");
            expect(source).toContain("@modelcontextprotocol/sdk/server/stdio.js");
            expect(source).toContain('McpServer');
            expect(source).toContain('StdioServerTransport');
        });

        test('server.ts routes stdio to SDK server', () => {
            const source = fs.readFileSync(
                path.join(__dirname, '../server.ts'),
                'utf-8'
            );

            expect(source).toContain('startSdkStdioServer');
            expect(source).toContain("import { startSdkStdioServer } from './mcpSdkServer.js'");
        });

        test('SDK server declares protocol 2025-06-18 capabilities', () => {
            const source = fs.readFileSync(
                path.join(__dirname, '../mcpSdkServer.ts'),
                'utf-8'
            );

            // Check capabilities declaration
            expect(source).toContain('listChanged: true');
            expect(source).toContain("logging: {}");
            // Check server instructions are included
            expect(source).toContain('instructions: SERVER_INSTRUCTIONS');
            // Check prompts capability
            expect(source).toContain('prompts:');
        });
    });

    describe('Zod schema conversion coverage', () => {
        test('createSdkServer handles tools with array string properties', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            // search_queries has required array<string> (searchTerms)
            const mockInstance = McpServer.mock.results[0].value;
            const searchQueryCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'search_queries'
            );
            expect(searchQueryCall).toBeDefined();
            // The Zod shape should have been built without errors
            expect(searchQueryCall[1]).toHaveProperty('description');
        });

        test('createSdkServer handles tools with enum properties', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            // get_event_catalog has enum 'status' property
            const mockInstance = McpServer.mock.results[0].value;
            const catalogCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'get_event_catalog'
            );
            expect(catalogCall).toBeDefined();
        });

        test('createSdkServer handles tools with object properties', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            // get_recommendations has 'results' object property
            const mockInstance = McpServer.mock.results[0].value;
            const recCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'get_recommendations'
            );
            expect(recCall).toBeDefined();
        });

        test('createSdkServer handles tool with required string properties', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            // save_query has required 'name' and 'kql' string properties
            const mockInstance = McpServer.mock.results[0].value;
            const saveCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'save_query'
            );
            expect(saveCall).toBeDefined();
        });

        test('createSdkServer passes annotations for tools', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            const mockInstance = McpServer.mock.results[0].value;
            const catalogCall = mockInstance.registerTool.mock.calls.find(
                (call: any[]) => call[0] === 'get_event_catalog'
            );

            // Check annotations are passed
            expect(catalogCall[1]).toHaveProperty('annotations');
            expect(catalogCall[1].annotations).toHaveProperty('readOnlyHint', true);
        });

        test('tool callback returns string result directly', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const services = createMockServices({
                cache: {
                    clear: jest.fn(),
                    get: jest.fn(),
                    set: jest.fn(),
                    getStats: jest.fn().mockReturnValue({ totalEntries: 0 }),
                    cleanupExpired: jest.fn()
                }
            });
            const handlers = new ToolHandlers(mockConfig, services, true, []);

            // Override executeToolCall to return a string
            jest.spyOn(handlers, 'executeToolCall').mockResolvedValue('plain text result');

            createSdkServer(handlers);

            const mockInstance = McpServer.mock.results[0].value;
            const call = mockInstance.registerTool.mock.calls.find(
                (c: any[]) => c[0] === 'get_saved_queries'
            );
            const callback = call[2];
            const result = await callback({});

            expect(result.content[0].text).toBe('plain text result');
        });
    });

    describe('toolDefinitions helpers', () => {
        test('getToolDefinition returns tool by name', () => {
            const tool = getToolDefinition('query_telemetry');
            expect(tool).toBeDefined();
            expect(tool!.name).toBe('query_telemetry');
        });

        test('getToolDefinition returns undefined for missing tool', () => {
            const tool = getToolDefinition('nonexistent');
            expect(tool).toBeUndefined();
        });

        test('getToolNames returns all tool names', () => {
            const names = getToolNames();
            expect(names).toContain('query_telemetry');
            expect(names).toContain('get_saved_queries');
            expect(names).toContain('list_profiles');
            expect(names.length).toBe(TOOL_DEFINITIONS.length);
        });
    });
});
