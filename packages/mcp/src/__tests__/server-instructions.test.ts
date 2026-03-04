/**
 * Tests for MCP Server-Level Instructions and Workflow Prompt.
 * 
 * Verifies that:
 * - SERVER_INSTRUCTIONS contains critical workflow guidance
 * - WORKFLOW_PROMPT_CONTENT contains the concise step sequence
 * - createSdkServer passes instructions to McpServer options
 * - createSdkServer registers the bc-telemetry-workflow prompt
 * - The prompt callback returns the expected message format
 */

import { SERVER_INSTRUCTIONS, WORKFLOW_PROMPT_CONTENT } from '../tools/serverInstructions.js';

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

function createMockServices() {
    return {
        auth: { authenticate: jest.fn(), getAccessToken: jest.fn(), getStatus: jest.fn() },
        kusto: { executeQuery: jest.fn(), parseResult: jest.fn(), validateQuery: jest.fn().mockReturnValue([]) },
        cache: { get: jest.fn(), set: jest.fn(), getStats: jest.fn(), clear: jest.fn(), cleanupExpired: jest.fn() },
        queries: { getAllQueries: jest.fn().mockReturnValue([]), searchQueries: jest.fn(), saveQuery: jest.fn(), getCategories: jest.fn() },
        references: { getAllExternalQueries: jest.fn() },
        usageTelemetry: { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() },
        installationId: 'test-id',
        sessionId: 'test-session'
    };
}

describe('Server Instructions', () => {

    describe('SERVER_INSTRUCTIONS content', () => {
        test('contains mandatory tool-call sequence heading', () => {
            expect(SERVER_INSTRUCTIONS).toContain('MANDATORY Tool-Call Sequence');
        });

        test('references get_event_field_samples as mandatory step', () => {
            expect(SERVER_INSTRUCTIONS).toContain('get_event_field_samples');
            expect(SERVER_INSTRUCTIONS).toContain('MANDATORY before ANY KQL');
        });

        test('references get_event_catalog as first step', () => {
            expect(SERVER_INSTRUCTIONS).toContain('get_event_catalog');
            expect(SERVER_INSTRUCTIONS).toContain('FIRST');
        });

        test('contains forbidden patterns section', () => {
            expect(SERVER_INSTRUCTIONS).toContain('FORBIDDEN Patterns');
            expect(SERVER_INSTRUCTIONS).toContain('take 1 | project customDimensions');
        });

        test('forbids guessing field names', () => {
            expect(SERVER_INSTRUCTIONS).toContain('Guessing field names');
            expect(SERVER_INSTRUCTIONS).toContain('Do NOT invent customDimensions field names');
        });

        test('forbids treating duration fields as numbers', () => {
            expect(SERVER_INSTRUCTIONS).toContain('Treating duration fields as numbers');
            expect(SERVER_INSTRUCTIONS).toContain('TIMESPAN');
        });

        test('forbids filtering by companyName', () => {
            expect(SERVER_INSTRUCTIONS).toContain('Filtering by companyName');
            expect(SERVER_INSTRUCTIONS).toContain('aadTenantId');
        });

        test('describes multi-profile workflow', () => {
            expect(SERVER_INSTRUCTIONS).toContain('list_profiles');
            expect(SERVER_INSTRUCTIONS).toContain('switch_profile');
        });

        test('describes Application Insights tables', () => {
            expect(SERVER_INSTRUCTIONS).toContain('traces');
            expect(SERVER_INSTRUCTIONS).toContain('pageViews');
        });

        test('includes efficiency tips', () => {
            expect(SERVER_INSTRUCTIONS).toContain('Efficiency Tips');
            expect(SERVER_INSTRUCTIONS).toContain('summarize count()');
        });
    });

    describe('WORKFLOW_PROMPT_CONTENT', () => {
        test('contains the 5-step workflow', () => {
            expect(WORKFLOW_PROMPT_CONTENT).toContain('get_event_catalog');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('get_event_field_samples');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('get_tenant_mapping');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('query_telemetry');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('save_query');
        });

        test('contains usage guidance patterns', () => {
            expect(WORKFLOW_PROMPT_CONTENT).toContain('UNNECESSARY');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('FORBIDDEN');
            expect(WORKFLOW_PROMPT_CONTENT).toContain('take 1 | project customDimensions');
        });

        test('marks get_event_field_samples as mandatory', () => {
            expect(WORKFLOW_PROMPT_CONTENT).toContain('MANDATORY before KQL');
        });
    });

    describe('createSdkServer integration', () => {

        beforeEach(() => {
            jest.clearAllMocks();
        });

        test('passes instructions to McpServer constructor', () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            expect(McpServer).toHaveBeenCalledTimes(1);
            const constructorArgs = McpServer.mock.calls[0];

            // Second arg is options — should contain instructions
            const options = constructorArgs[1];
            expect(options).toHaveProperty('instructions');
            expect(options.instructions).toContain('MANDATORY Tool-Call Sequence');
            expect(options.instructions).toContain('get_event_field_samples');
        });

        test('declares prompts capability', () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            const options = McpServer.mock.calls[0][1];
            expect(options.capabilities).toHaveProperty('prompts');
            expect(options.capabilities.prompts).toEqual({ listChanged: true });
        });

        test('registers bc-telemetry-workflow prompt', () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            const mockInstance = McpServer.mock.results[0].value;
            expect(mockInstance.registerPrompt).toHaveBeenCalledTimes(1);

            const promptCall = mockInstance.registerPrompt.mock.calls[0];
            expect(promptCall[0]).toBe('bc-telemetry-workflow');
            expect(promptCall[1]).toHaveProperty('description');
            expect(promptCall[1].description).toContain('Mandatory tool-call workflow');
        });

        test('workflow prompt callback returns proper message format', async () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            const mockInstance = McpServer.mock.results[0].value;
            const promptCallback = mockInstance.registerPrompt.mock.calls[0][2];

            const result = await promptCallback();

            expect(result).toHaveProperty('messages');
            expect(result.messages).toHaveLength(1);
            expect(result.messages[0]).toEqual({
                role: 'user',
                content: {
                    type: 'text',
                    text: WORKFLOW_PROMPT_CONTENT
                }
            });
        });

        test('still registers all tools alongside prompt', () => {
            const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
            const { createSdkServer } = require('../mcpSdkServer.js');
            const { ToolHandlers } = require('../tools/toolHandlers.js');
            const { TOOL_DEFINITIONS } = require('../tools/toolDefinitions.js');

            const handlers = new ToolHandlers(mockConfig, createMockServices(), true, []);
            createSdkServer(handlers);

            const mockInstance = McpServer.mock.results[0].value;

            // All tools still registered
            expect(mockInstance.registerTool).toHaveBeenCalledTimes(TOOL_DEFINITIONS.length);

            // Prompt also registered
            expect(mockInstance.registerPrompt).toHaveBeenCalledTimes(1);
        });
    });
});
