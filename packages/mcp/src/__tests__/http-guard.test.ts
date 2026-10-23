/**
 * HTTP mode Origin / Host / token guard — spec docs/specs/147-mcp-http-origin-host-token.md
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
    TELEMETRY_EVENTS: {
        MCP: {
            SERVER_STARTED: 'Mcp.ServerStarted',
            HTTP_NON_LOOPBACK_BIND: 'TB-MCP-008',
            HTTP_REQUEST_REJECTED: 'TB-MCP-009',
            HTTP_MODE_STARTED: 'TB-MCP-010'
        }
    },
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

import { createHttpGuard, isLoopbackHostHeader, normalizeToken, tokenMatches, RejectReason } from '../httpGuard';
import type { HostKind } from '../httpBind';
import { MCPConfig } from '../config';
import { MCPServer } from '../server';

const TOKEN = 'test-token-AbC_123-xyz';

interface Reply { status: number; headers: http.IncomingHttpHeaders; body: string }

function send(port: number, opts: { method?: string; path?: string; headers?: Record<string, string>; noHost?: boolean; body?: string }): Promise<Reply> {
    return new Promise((resolve, reject) => {
        const req = http.request({
            host: '127.0.0.1',
            port,
            method: opts.method ?? 'GET',
            path: opts.path ?? '/ping',
            headers: opts.headers,
            setHost: !opts.noHost
        }, res => {
            let body = '';
            res.on('data', c => (body += c));
            res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
        });
        req.on('error', reject);
        if (opts.body) {
            req.write(opts.body);
        }
        req.end();
    });
}

describe('httpGuard helpers', () => {
    it.each([
        ['localhost:1'], ['LOCALHOST:1'], ['localhost'], ['127.0.0.1:1'], ['127.5.6.7:1'], ['127.0.0.1'], ['[::1]:1'], ['[::1]']
    ])('AC3: Host %s is loopback', host => {
        expect(isLoopbackHostHeader(host)).toBe(true);
    });

    it.each([
        ['attacker.example:52346'], ['192.168.1.10:52346'], ['[::2]:1'], ['127.0.0.1.attacker.example'],
        ['localhost.attacker.example:1'], ['128.0.0.1:1'], [''], [undefined]
    ])('AC4: Host %p is not loopback', host => {
        expect(isLoopbackHostHeader(host)).toBe(false);
    });

    it.each([
        [undefined, false], ['', false], [`Basic ${TOKEN}`, false], ['Bearer wrong', false],
        [`Bearer ${TOKEN}x`, false], [`Bearer ${TOKEN.slice(0, -1)}`, false], [`Bearer ${TOKEN}`, true], [`bearer ${TOKEN}`, true]
    ])('AC6: Authorization %p matches = %p', (header, expected) => {
        expect(tokenMatches(header, TOKEN)).toBe(expected);
    });

    it('AC6: a huge whitespace-padded Authorization header is refused quickly (no ReDoS)', () => {
        const header = 'Bearer ' + ' '.repeat(100_000) + 'x';
        const started = Date.now();
        expect(tokenMatches(header, TOKEN)).toBe(false);
        expect(tokenMatches('Bearer ' + ' '.repeat(100_000), TOKEN)).toBe(false);
        expect(Date.now() - started).toBeLessThan(200);
    });

    it.each([[undefined, undefined], ['', undefined], ['   ', undefined], [' abc ', 'abc']])('AC7: normalizeToken(%p) = %p', (value, expected) => {
        expect(normalizeToken(value)).toBe(expected);
    });
});

describe('createHttpGuard', () => {
    let server: http.Server;
    let port: number;
    let reached: number;
    let bindKind: HostKind;
    let token: string | undefined;
    let log: jest.Mock;
    let onReject: jest.Mock<void, [RejectReason]>;

    beforeEach(async () => {
        reached = 0;
        bindKind = 'loopback';
        token = undefined;
        log = jest.fn();
        onReject = jest.fn();
        const app = express();
        app.use(createHttpGuard({ bindKind: () => bindKind, token: () => token, log, onReject }));
        app.all('/ping', (_req, res) => {
            reached++;
            res.json({ ok: true });
        });
        server = await new Promise<http.Server>(resolve => {
            const s = app.listen(0, '127.0.0.1', () => resolve(s));
        });
        port = (server.address() as AddressInfo).port;
    });

    afterEach(async () => {
        await new Promise(resolve => server.close(resolve));
    });

    it('AC2: a request without Origin reaches the route', async () => {
        const reply = await send(port, {});
        expect(reply.status).toBe(200);
        expect(reached).toBe(1);
    });

    it.each([['GET'], ['POST'], ['OPTIONS']])('AC2: %s with Origin is refused with 403 origin_not_allowed', async method => {
        const reply = await send(port, { method, headers: { Origin: 'https://evil.example' } });
        expect(reply.status).toBe(403);
        expect(JSON.parse(reply.body)).toEqual({ error: 'origin_not_allowed' });
        expect(reached).toBe(0);
    });

    it('AC1: rejections carry no CORS headers', async () => {
        const reply = await send(port, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'POST' } });
        expect(Object.keys(reply.headers).filter(h => h.startsWith('access-control-'))).toEqual([]);
    });

    it.each([['attacker.example:52346'], ['192.168.1.10:52346'], ['127.0.0.1.attacker.example']])(
        'AC4: loopback bind refuses Host %s with 403 host_not_allowed',
        async host => {
            const reply = await send(port, { headers: { Host: host } });
            expect(reply.status).toBe(403);
            expect(JSON.parse(reply.body)).toEqual({ error: 'host_not_allowed' });
            expect(reached).toBe(0);
        }
    );

    it('AC4: a request without Host is refused (by Node, 400) before any route runs', async () => {
        const reply = await send(port, { noHost: true });
        expect(reply.status).toBe(400);
        expect(reached).toBe(0);
    });

    it.each([['localhost'], ['127.0.0.1'], ['[::1]']])('AC3: loopback bind accepts Host %s:<port>', async name => {
        const reply = await send(port, { headers: { Host: `${name}:${port}` } });
        expect(reply.status).toBe(200);
    });

    it('AC5: non-loopback bind skips the Host check but still refuses Origin', async () => {
        bindKind = 'wildcard';
        expect((await send(port, { headers: { Host: 'attacker.example' } })).status).toBe(200);
        expect((await send(port, { headers: { Host: 'attacker.example', Origin: 'https://evil.example' } })).status).toBe(403);
    });

    it.each([[undefined], ['Basic abc'], ['Bearer wrong']])('AC6: token set, Authorization %p is refused with 401', async auth => {
        token = TOKEN;
        const reply = await send(port, { headers: auth ? { Authorization: auth } : {} });
        expect(reply.status).toBe(401);
        expect(JSON.parse(reply.body)).toEqual({ error: 'unauthorized' });
        expect(reached).toBe(0);
    });

    it('AC6: token set, the right Bearer token reaches the route', async () => {
        token = TOKEN;
        const reply = await send(port, { headers: { Authorization: `Bearer ${TOKEN}` } });
        expect(reply.status).toBe(200);
        expect(reached).toBe(1);
    });

    it('AC7: no token configured, requests without Authorization pass', async () => {
        expect((await send(port, {})).status).toBe(200);
    });

    it('AC8: rejection log names method, path and reason, never the token', async () => {
        token = TOKEN;
        await send(port, { method: 'POST', path: '/ping', headers: { Authorization: `Bearer ${TOKEN}-wrong` } });
        expect(log).toHaveBeenCalledTimes(1);
        const line = String(log.mock.calls[0][0]);
        expect(line).toContain('POST');
        expect(line).toContain('/ping');
        expect(line).toContain('token');
        expect(line).not.toContain(TOKEN);
    });

    it('AC8: telemetry onReject fires at most once per reason', async () => {
        token = TOKEN;
        await send(port, { headers: { Origin: 'https://a.example' } });
        await send(port, { headers: { Origin: 'https://b.example' } });
        await send(port, { headers: { Host: 'attacker.example' } });
        await send(port, {});
        await send(port, {});
        expect(onReject.mock.calls.map(c => c[0])).toEqual(['origin', 'host', 'token']);
    });

    it('AC8: a throwing onReject or log never breaks the response', async () => {
        const boom = () => { throw new Error('boom'); };
        log.mockImplementation(boom);
        onReject.mockImplementation(boom);
        expect((await send(port, { headers: { Origin: 'https://evil.example' } })).status).toBe(403);
    });
});

describe('MCPServer HTTP guard wiring (spec #147)', () => {
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

    function port(): number {
        return ((server as any).httpServer.address() as AddressInfo).port;
    }

    function stderrLines(): string[] {
        return consoleErrorSpy.mock.calls.map(c => String(c[0]));
    }

    beforeEach(() => {
        process.env = { ...originalEnv };
        delete process.env.BCTB_HOST;
        delete process.env.BCTB_HTTP_TOKEN;
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-http-guard-'));
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

    it('AC1: /health carries no CORS headers', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        const reply = await send(port(), { path: '/health', headers: { Host: `localhost:${port()}` } });
        expect(reply.status).toBe(200);
        expect(Object.keys(reply.headers).filter(h => h.startsWith('access-control-'))).toEqual([]);
    });

    it('AC2: POST /rpc with Origin is refused before the body is handled', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        const reply = await send(port(), {
            method: 'POST', path: '/rpc',
            headers: { Host: `localhost:${port()}`, Origin: 'https://evil.example', 'Content-Type': 'application/json' },
            body: JSON.stringify({ jsonrpc: '2.0', method: 'tools/list', id: 1 })
        });
        expect(reply.status).toBe(403);
    });

    it('AC4: a rebinding Host on the default bind is refused', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        expect((await send(port(), { path: '/health', headers: { Host: 'attacker.example' } })).status).toBe(403);
    });

    it('AC6: BCTB_HTTP_TOKEN makes /health require the token', async () => {
        process.env.BCTB_HTTP_TOKEN = TOKEN;
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        const host = { Host: `localhost:${port()}` };
        expect((await send(port(), { path: '/health', headers: host })).status).toBe(401);
        expect((await send(port(), { path: '/health', headers: { ...host, Authorization: `Bearer ${TOKEN}` } })).status).toBe(200);
        expect(stderrLines().join('\n')).not.toContain(TOKEN);
    });

    it('AC7: without a token the startup output says so once', async () => {
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        expect(stderrLines().filter(l => /no token required/i.test(l))).toHaveLength(1);
        expect((await send(port(), { path: '/health', headers: { Host: `localhost:${port()}` } })).status).toBe(200);
    });

    it('AC7: with a token the startup output does not claim no token is required', async () => {
        process.env.BCTB_HTTP_TOKEN = TOKEN;
        server = new MCPServer(makeConfig(), 'http');
        await server.startHTTP();
        expect(stderrLines().filter(l => /no token required/i.test(l))).toHaveLength(0);
    });
});
