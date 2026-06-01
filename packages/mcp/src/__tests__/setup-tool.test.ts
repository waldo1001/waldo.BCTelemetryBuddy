/**
 * Tests for the get_setup_guide MCP tool and the setup-connection prompt wiring.
 */

jest.mock('@bctb/shared', () => ({
    AuthService: jest.fn().mockImplementation(() => ({ getStatus: jest.fn() })),
    KustoService: jest.fn(),
    CacheService: jest.fn(),
    QueriesService: jest.fn(),
    ReferencesService: jest.fn(),
    sanitizeObject: jest.fn((o: any) => o),
    IUsageTelemetry: jest.fn(),
    NoOpUsageTelemetry: jest.fn(),
    RateLimitedUsageTelemetry: jest.fn(),
    TELEMETRY_CONNECTION_STRING: '',
    TELEMETRY_EVENTS: {
        MCP: { SERVER_STARTED: 'Mcp.ServerStarted', ERROR: 'Mcp.Error' },
        MCP_TOOLS: {
            QUERY_TELEMETRY: 'Mcp.Tools.QueryTelemetry',
            GET_SETUP_GUIDE: 'TB-MCP-116',
            SETUP_PROMPT_SERVED: 'TB-MCP-115',
        },
    },
    createCommonProperties: jest.fn().mockReturnValue({}),
    cleanTelemetryProperties: jest.fn().mockReturnValue({}),
    hashValue: jest.fn().mockReturnValue('abc123'),
    categorizeError: jest.fn().mockReturnValue('UnknownError'),
}));

jest.mock('../mcpTelemetry.js', () => ({
    createMCPUsageTelemetry: jest.fn().mockReturnValue(null),
    getMCPInstallationId: jest.fn().mockReturnValue('test-installation-id'),
}));
jest.mock('../version.js', () => ({ VERSION: '3.0.0-test' }));

import { ToolHandlers } from '../tools/toolHandlers.js';
import { TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';
import { SETUP_PROMPT_CONTENT } from '../tools/setupInstructions.js';

const mockConfig: any = {
    workspacePath: '/tmp/test', connectionName: 'test', applicationInsightsAppId: 'x',
    kustoClusterUrl: 'https://x', authFlow: 'azure_cli', tenantId: 't',
    cacheEnabled: false, cacheTTLSeconds: 3600, removePII: false, queriesFolder: 'queries', references: [], port: 3000,
};

function mockServices() {
    return {
        auth: { getStatus: jest.fn() }, kusto: {}, cache: {}, queries: {}, references: {},
        usageTelemetry: { trackEvent: jest.fn(), trackException: jest.fn(), flush: jest.fn() },
        installationId: 'i', sessionId: 's',
    } as any;
}

describe('get_setup_guide tool', () => {
    it('is registered as a read-only tool', () => {
        const def = TOOL_DEFINITIONS.find(t => t.name === 'get_setup_guide');
        expect(def).toBeDefined();
        expect(def!.annotations?.readOnlyHint).toBe(true);
    });

    it('returns the setup workflow content', async () => {
        const handlers = new ToolHandlers(mockConfig, mockServices(), true, []);
        const result = await handlers.executeToolCall('get_setup_guide', {});
        expect(result).toBe(SETUP_PROMPT_CONTENT);
    });

    it('works even when config is incomplete (setup must run unconfigured)', async () => {
        const handlers = new ToolHandlers(mockConfig, mockServices(), true, ['BCTB_APP_INSIGHTS_ID is required']);
        const result = await handlers.executeToolCall('get_setup_guide', {});
        expect(result).toContain('Connection Setup');
    });

    it('emits GET_SETUP_GUIDE telemetry', async () => {
        const services = mockServices();
        const handlers = new ToolHandlers(mockConfig, services, true, []);
        await handlers.executeToolCall('get_setup_guide', {});
        const events = services.usageTelemetry.trackEvent.mock.calls.map((c: any[]) => c[0]);
        expect(events).toContain('Mcp.GetSetupGuide');
    });
});
