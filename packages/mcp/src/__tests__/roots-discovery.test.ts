/**
 * Tests for discoverWorkspaceViaRoots in mcpSdkServer.ts — the MCP "roots"
 * fallback that locates workspace knowledge for hosts (e.g. Claude Code) that
 * don't pass --config into the workspace but DO advertise roots.
 *
 * Connection config must NOT be mutated by roots discovery — it only attaches
 * a KnowledgeBaseService. See docs/plans/mcp-workspace-knowledge-discovery.md.
 */

const mockLoadAll = jest.fn().mockResolvedValue({
    communityArticles: [], localArticles: [], communitySource: 'disabled', excludedCount: 0, errors: [],
});
const mockKbCtor = jest.fn().mockImplementation(() => ({
    loadAll: mockLoadAll, search: jest.fn(), getSummary: jest.fn(),
}));

jest.mock('@bctb/shared', () => ({
    KnowledgeBaseService: mockKbCtor,
    TELEMETRY_EVENTS: { MCP: { ROOTS_DISCOVERY: 'TB-MCP-004' } },
    createCommonProperties: jest.fn((_e: string, _c: string, _s: string, _i: string, _v: string, options?: any) => ({ ...options })),
    cleanTelemetryProperties: jest.fn((p: any) => p),
}));

const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: (...args: any[]) => mockExistsSync(...args),
}));

jest.mock('../version.js', () => ({ VERSION: '0.0.0-test' }));

import { discoverWorkspaceViaRoots } from '../mcpSdkServer.js';
import type { MCPConfig } from '../config.js';
import * as path from 'path';

const cfg: MCPConfig = {
    workspacePath: '/cwd',
    connectionName: 'test',
    applicationInsightsAppId: 'test-app-id',
    kustoClusterUrl: 'https://test.kusto.windows.net',
    authFlow: 'azure_cli',
} as any;

function fakeToolHandlers(overrides?: any) {
    return {
        knowledgeBase: null,
        kbSkipReason: null,
        services: {
            usageTelemetry: { trackEvent: jest.fn() },
            sessionId: 's',
            installationId: 'i',
        },
        ...overrides,
    };
}

function fakeServer(caps: any, listRoots: jest.Mock) {
    return { server: { getClientCapabilities: jest.fn().mockReturnValue(caps), listRoots } };
}

function rootsEvent(th: any) {
    return (th.services.usageTelemetry.trackEvent as jest.Mock).mock.calls
        .find(c => c[0] === 'Mcp.RootsDiscovery');
}

describe('discoverWorkspaceViaRoots', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        mockLoadAll.mockClear();
        mockKbCtor.mockClear();
        mockExistsSync.mockReset();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('AC7: loads KB from a matching client root', async () => {
        const listRoots = jest.fn().mockResolvedValue({ roots: [{ uri: 'file:///ws' }] });
        mockExistsSync.mockImplementation((p: string) =>
            p === path.join('/ws', '.bctb-config.json') ||
            p === path.join('/ws', '.vscode', '.bctb', 'knowledge')
        );
        const th = fakeToolHandlers();

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        expect(svc).not.toBeNull();
        expect(mockKbCtor).toHaveBeenCalledWith('/ws', expect.anything());
        expect(mockLoadAll).toHaveBeenCalledTimes(1);
        expect(th.knowledgeBase).toBe(svc);
        expect(rootsEvent(th)[1]).toMatchObject({ clientAdvertisedRoots: true, matched: true, kbLoaded: true });
    });

    it('AC8: skips when the client does not advertise roots', async () => {
        const listRoots = jest.fn();
        const th = fakeToolHandlers();

        const svc = await discoverWorkspaceViaRoots(fakeServer({}, listRoots) as any, cfg, th as any);

        expect(svc).toBeNull();
        expect(listRoots).not.toHaveBeenCalled();
        expect(mockKbCtor).not.toHaveBeenCalled();
        expect(rootsEvent(th)[1]).toMatchObject({ clientAdvertisedRoots: false });
    });

    it('AC9: short-circuits when a KB is already loaded (eager-load win)', async () => {
        const listRoots = jest.fn();
        const th = fakeToolHandlers({ knowledgeBase: { search: jest.fn() } });

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        expect(svc).toBeNull();
        expect(listRoots).not.toHaveBeenCalled();
        expect(mockKbCtor).not.toHaveBeenCalled();
    });

    it('AC11: loads knowledge from roots while leaving the connection config untouched', async () => {
        const listRoots = jest.fn().mockResolvedValue({ roots: [{ uri: 'file:///ws' }] });
        mockExistsSync.mockImplementation((p: string) => p.startsWith('/ws'));
        const th = fakeToolHandlers();
        const globalCfg = { ...cfg, connectionName: 'iFacto Customers', applicationInsightsAppId: 'GLOBAL-APP' } as any;

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, globalCfg, th as any);

        expect(svc).not.toBeNull();
        expect(mockKbCtor).toHaveBeenCalledWith('/ws', expect.anything());
        // Connection config is the global one and must be unchanged by knowledge discovery.
        expect(globalCfg.applicationInsightsAppId).toBe('GLOBAL-APP');
        expect(globalCfg.connectionName).toBe('iFacto Customers');
    });

    it('records rootsCount and matched:false when no root contains a workspace', async () => {
        const listRoots = jest.fn().mockResolvedValue({ roots: [{ uri: 'file:///a' }, { uri: 'file:///b' }] });
        mockExistsSync.mockReturnValue(false);
        const th = fakeToolHandlers();

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        expect(svc).toBeNull();
        expect(rootsEvent(th)[1]).toMatchObject({ rootsCount: 2, matched: false, kbLoaded: false });
    });

    it('skips non-file:// root URIs without throwing', async () => {
        const listRoots = jest.fn().mockResolvedValue({ roots: [{ uri: 'https://example.com/ws' }] });
        mockExistsSync.mockReturnValue(true);
        const th = fakeToolHandlers();

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        expect(svc).toBeNull();
        expect(mockKbCtor).not.toHaveBeenCalled();
        expect(rootsEvent(th)[1]).toMatchObject({ rootsCount: 1, matched: false });
    });

    it('swallows a listRoots failure (non-fatal)', async () => {
        const listRoots = jest.fn().mockRejectedValue(new Error('client gone'));
        const th = fakeToolHandlers();

        const svc = await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        expect(svc).toBeNull();
    });

    it('telemetry from roots discovery carries no filesystem paths', async () => {
        const listRoots = jest.fn().mockResolvedValue({ roots: [{ uri: 'file:///ws' }] });
        mockExistsSync.mockImplementation((p: string) => p.startsWith('/ws'));
        const th = fakeToolHandlers();

        await discoverWorkspaceViaRoots(fakeServer({ roots: {} }, listRoots) as any, cfg, th as any);

        const props = rootsEvent(th)[1];
        for (const v of Object.values(props)) {
            if (typeof v === 'string') {
                expect(v.includes('/')).toBe(false);
                expect(v.includes('\\')).toBe(false);
            }
        }
    });
});
