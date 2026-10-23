/**
 * HTTP mode bind address — spec docs/specs/145-mcp-http-localhost-bind.md
 */
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import express from 'express';
import { AddressInfo } from 'net';

jest.mock('@bctb/shared', () => ({
    AuthService: jest.fn().mockImplementation(() => ({ authenticate: jest.fn() })),
    KustoService: jest.fn().mockImplementation(() => ({ query: jest.fn() })),
    CacheService: jest.fn().mockImplementation(() => ({ get: jest.fn(), set: jest.fn() })),
    QueriesService: jest.fn().mockImplementation(() => ({ list: jest.fn() })),
    ReferencesService: jest.fn().mockImplementation(() => ({ search: jest.fn() })),
    sanitizeObject: jest.fn((obj: any) => obj),
    lookupEventCategory: jest.fn(),
    NoOpUsageTelemetry: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn(), flush: jest.fn() })),
    RateLimitedUsageTelemetry: jest.fn().mockImplementation(() => ({ trackEvent: jest.fn(), flush: jest.fn() })),
    IUsageTelemetry: undefined,
    TELEMETRY_CONNECTION_STRING: '',
    TELEMETRY_EVENTS: { MCP: { SERVER_STARTED: 'Mcp.ServerStarted', HTTP_NON_LOOPBACK_BIND: 'TB-MCP-008' } },
    createCommonProperties: jest.fn(() => ({})),
    cleanTelemetryProperties: jest.fn(() => ({})),
    hashValue: jest.fn(() => 'testhash'),
}));

jest.mock('../mcpTelemetry', () => ({
    createMCPUsageTelemetry: jest.fn(() => null),
    getMCPInstallationId: jest.fn(() => 'test-installation-id'),
}));

jest.mock('../version', () => ({
    VERSION: '0.0.0-test',
}));

jest.mock('../mcpSdkServer', () => ({
    startSdkStdioServer: jest.fn(async () => undefined),
}));

import * as httpBind from '../httpBind';
import {
    DEFAULT_HTTP_HOST,
    classifyHost,
    formatListenUrl,
    listenHttp,
    reportHttpBind,
    resolveHttpHost
} from '../httpBind';
import { loadConfigFromFile, MCPConfig } from '../config';
import { MCPServer, startServer } from '../server';

function makeDeps() {
    return {
        warn: jest.fn(),
        track: jest.fn(),
        commonProps: jest.fn(() => ({ eventId: 'TB-MCP-008' }))
    };
}

function get(url: string): Promise<number> {
    return new Promise((resolve, reject) => {
        http.get(url, res => {
            res.resume();
            resolve(res.statusCode ?? 0);
        }).on('error', reject);
    });
}

describe('httpBind', () => {
    describe('resolveHttpHost', () => {
        it('AC1: defaults to 127.0.0.1', () => {
            expect(DEFAULT_HTTP_HOST).toBe('127.0.0.1');
            expect(resolveHttpHost(undefined, undefined)).toEqual({ host: '127.0.0.1', source: 'default' });
        });

        it('AC3: BCTB_HOST overrides config host', () => {
            expect(resolveHttpHost('0.0.0.0', '192.168.1.10')).toEqual({ host: '0.0.0.0', source: 'env' });
        });

        it('AC4: uses config host when BCTB_HOST is unset', () => {
            expect(resolveHttpHost(undefined, '192.168.1.10')).toEqual({ host: '192.168.1.10', source: 'config' });
        });

        it.each([[''], ['  '], [undefined]])('AC5: env value %p counts as unset', envHost => {
            expect(resolveHttpHost(envHost, '::1')).toEqual({ host: '::1', source: 'config' });
        });

        it.each([[''], ['  '], [undefined]])('AC5: config value %p counts as unset', configHost => {
            expect(resolveHttpHost(undefined, configHost)).toEqual({ host: '127.0.0.1', source: 'default' });
        });

        it('AC3/AC5: trims surrounding whitespace', () => {
            expect(resolveHttpHost(' 0.0.0.0 ', undefined)).toEqual({ host: '0.0.0.0', source: 'env' });
        });
    });

    describe('classifyHost', () => {
        it.each([
            ['127.0.0.1', 'loopback'],
            ['127.1.2.3', 'loopback'],
            ['::1', 'loopback'],
            ['localhost', 'loopback'],
            ['LOCALHOST', 'loopback'],
            ['0.0.0.0', 'wildcard'],
            ['::', 'wildcard'],
            ['192.168.1.10', 'specific'],
            ['my-laptop.local', 'specific'],
            ['128.0.0.1', 'specific']
        ])('%s is %s', (host, kind) => {
            expect(classifyHost(host)).toBe(kind);
        });
    });

    describe('formatListenUrl', () => {
        it.each([
            ['127.0.0.1', 52345, 'http://127.0.0.1:52345'],
            ['0.0.0.0', 52346, 'http://0.0.0.0:52346'],
            ['::1', 52345, 'http://[::1]:52345'],
            ['localhost', 8080, 'http://localhost:8080']
        ])('AC6: %s:%d -> %s', (host, port, url) => {
            expect(formatListenUrl(host, port)).toBe(url);
        });
    });

    describe('reportHttpBind', () => {
        it.each([['0.0.0.0', 'env', 'wildcard'], ['::', 'config', 'wildcard'], ['192.168.1.10', 'config', 'specific']] as const)(
            'AC7: %s warns once and tracks once without the address',
            (host, source, kind) => {
                const deps = makeDeps();
                expect(reportHttpBind(deps, host, source)).toBe(kind);

                expect(deps.warn).toHaveBeenCalledTimes(1);
                expect(deps.warn.mock.calls[0][0]).toMatch(/no authentication/i);
                expect(deps.track).toHaveBeenCalledTimes(1);
                const [name, props] = deps.track.mock.calls[0];
                expect(name).toBe('Mcp.HttpNonLoopbackBind');
                expect(props).toEqual({ eventId: 'TB-MCP-008', hostSource: source, hostKind: kind });
                expect(JSON.stringify(props)).not.toContain(host === '::' ? '"::"' : host);
            }
        );

        it.each([['127.0.0.1'], ['127.1.2.3'], ['::1'], ['localhost']])('AC7: loopback %s neither warns nor tracks', host => {
            const deps = makeDeps();
            expect(reportHttpBind(deps, host, 'config')).toBe('loopback');
            expect(deps.warn).not.toHaveBeenCalled();
            expect(deps.track).not.toHaveBeenCalled();
        });

        it('AC7: never throws when warn, track or commonProps throw', () => {
            const boom = () => { throw new Error('boom'); };
            expect(() => reportHttpBind({ warn: boom, track: boom, commonProps: boom }, '0.0.0.0', 'env')).not.toThrow();
        });
    });

    describe('listenHttp', () => {
        it('AC1: listens on the given host only', async () => {
            const server = await listenHttp(express(), '127.0.0.1', 0);
            try {
                expect((server.address() as AddressInfo).address).toBe('127.0.0.1');
            } finally {
                server.close();
            }
        });

        it('AC8: rejects naming host and port when the host cannot be bound', async () => {
            // 192.0.2.1 is TEST-NET-1 (RFC 5737): never assigned to a local interface
            await expect(listenHttp(express(), '192.0.2.1', 52399)).rejects.toThrow(/192\.0\.2\.1:52399/);
        });
    });
});

describe('MCPServer.startHTTP bind (spec #145)', () => {
    const originalEnv = process.env;
    let consoleErrorSpy: jest.SpyInstance;
    let tempDir: string;
    let server: MCPServer | undefined;

    function makeConfig(overrides?: Partial<MCPConfig>): MCPConfig {
        return {
            connectionName: 'Test Connection',
            tenantId: 'test-tenant',
            authFlow: 'azure_cli',
            applicationInsightsAppId: 'test-app-id',
            kustoClusterUrl: 'https://ade.applicationinsights.io',
            cacheEnabled: false,
            cacheTTLSeconds: 3600,
            removePII: false,
            port: 0,
            workspacePath: tempDir,
            queriesFolder: 'queries',
            references: [],
            ...overrides
        };
    }

    function listening(): AddressInfo {
        return (server as any).httpServer.address() as AddressInfo;
    }

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.BCTB_HOST;
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-http-bind-'));
    });

    afterEach(async () => {
        if (server && (server as any).httpServer) {
            await new Promise(resolve => (server as any).httpServer.close(resolve));
        }
        server = undefined;
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.env = originalEnv;
        consoleErrorSpy.mockRestore();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('AC1: listens on 127.0.0.1 when no host is configured', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        expect(listening().address).toBe('127.0.0.1');
    });

    it('AC2: a request to localhost reaches the default 127.0.0.1 listener', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        expect(await get(`http://localhost:${listening().port}/health`)).toBe(200);
    });

    it('AC3: BCTB_HOST overrides the config host', async () => {
        process.env.BCTB_HOST = '127.0.0.1';
        server = new MCPServer(makeConfig({ host: '192.0.2.1' }), 'http');
        await server.startHTTP();
        expect(listening().address).toBe('127.0.0.1');
    });

    it('AC6: the startup line names the listen URL', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        const lines = consoleErrorSpy.mock.calls.map(c => String(c[0]));
        expect(lines.some(l => l.includes(`listening on http://127.0.0.1:${listening().port}`))).toBe(true);
    });

    it('AC7: a wildcard host logs the exposure warning once', async () => {
        server = new MCPServer(makeConfig({ host: '0.0.0.0' }), 'http');
        await server.startHTTP();
        const warnings = consoleErrorSpy.mock.calls.map(c => String(c[0])).filter(l => /no authentication/i.test(l));
        expect(warnings).toHaveLength(1);
    });

    it('AC8: an unbindable host rejects with host and port', async () => {
        server = new MCPServer(makeConfig({ host: '192.0.2.1', port: 52398 }), 'http');
        await expect(server.startHTTP()).rejects.toThrow(/192\.0\.2\.1:52398/);
    });

    it('AC9: stdio startServer never resolves or binds an HTTP host', async () => {
        const resolveSpy = jest.spyOn(httpBind, 'resolveHttpHost');
        const listenSpy = jest.spyOn(httpBind, 'listenHttp');
        try {
            await startServer(makeConfig(), 'stdio');
            expect(resolveSpy).not.toHaveBeenCalled();
            expect(listenSpy).not.toHaveBeenCalled();
        } finally {
            resolveSpy.mockRestore();
            listenSpy.mockRestore();
        }
    });
});

describe('config host (spec #145 AC4)', () => {
    const originalEnv = process.env;
    let tempDir: string;

    beforeEach(() => {
        process.env = { ...originalEnv };
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-http-host-config-'));
        process.env.BCTB_WORKSPACE_PATH = tempDir;
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    function write(config: object): string {
        const configPath = path.join(tempDir, '.bctb-config.json');
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
        return configPath;
    }

    const profile = { authFlow: 'azure_cli', applicationInsightsAppId: 'app-id', kustoClusterUrl: 'https://ade.applicationinsights.io' };

    it('AC4: single-profile config reads host', () => {
        const config = loadConfigFromFile(write({ ...profile, host: '0.0.0.0' }), undefined, true);
        expect(config?.host).toBe('0.0.0.0');
    });

    it('AC4: profile host wins over top-level host', () => {
        const configPath = write({ host: '0.0.0.0', defaultProfile: 'A', profiles: { A: { ...profile, host: '::1' } } });
        expect(loadConfigFromFile(configPath, undefined, true)?.host).toBe('::1');
    });

    it('AC4: top-level host applies when the profile has none', () => {
        const configPath = write({ host: '0.0.0.0', defaultProfile: 'A', profiles: { A: { ...profile } } });
        expect(loadConfigFromFile(configPath, undefined, true)?.host).toBe('0.0.0.0');
    });

    it('AC1: no host anywhere leaves config host unset', () => {
        expect(loadConfigFromFile(write({ ...profile }), undefined, true)?.host).toBeUndefined();
    });
});

describe('resolveHttpPort (plan amendment, #147)', () => {
    const { resolveHttpPort } = require('../httpBind');

    it.each([
        ['52346', 52345, 52346],
        [' 8080 ', 52345, 8080],
        ['0', 52345, 0],
        [undefined, 52345, 52345],
        ['', 52345, 52345],
        ['abc', 52345, 52345],
        ['80.5', 52345, 52345],
        ['-1', 52345, 52345],
        ['65536', 52345, 52345]
    ])('BCTB_PORT %p with config port %p -> %p', (envPort, configPort, expected) => {
        expect(resolveHttpPort(envPort, configPort)).toBe(expected);
    });
});

describe('startHTTP port override (plan amendment, #147)', () => {
    const originalEnv = process.env;
    let server: MCPServer | undefined;
    let tempDir: string;

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.BCTB_HOST;
        jest.spyOn(console, 'error').mockImplementation();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-http-port-'));
    });

    afterEach(async () => {
        if (server && (server as any).httpServer) {
            await new Promise(resolve => (server as any).httpServer.close(resolve));
        }
        process.removeAllListeners('SIGINT');
        process.removeAllListeners('SIGTERM');
        process.env = originalEnv;
        jest.restoreAllMocks();
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    it('startHTTP listens on BCTB_PORT over the config port', async () => {
        const probe = await listenHttp(express(), '127.0.0.1', 0);
        const freePort = (probe.address() as AddressInfo).port;
        await new Promise(resolve => probe.close(resolve));

        process.env.BCTB_PORT = String(freePort);
        server = new MCPServer({
            connectionName: 'c', tenantId: 't', authFlow: 'azure_cli', applicationInsightsAppId: 'a',
            kustoClusterUrl: 'https://ade.applicationinsights.io', cacheEnabled: false, cacheTTLSeconds: 3600,
            removePII: false, port: 1, workspacePath: tempDir, queriesFolder: 'queries', references: []
        }, 'http');
        await server.startHTTP();
        expect(((server as any).httpServer.address() as AddressInfo).port).toBe(freePort);
    });
});
