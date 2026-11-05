/**
 * #150: azure_cli auth honours the configured tenantId.
 * Spec: docs/specs/150-azure-cli-tenant.md
 *
 * Only public APIs are used (AuthService, KustoService, RateLimitedUsageTelemetry), with
 * child_process and axios as the seams. Tenants are fake.
 */
import { exec } from 'child_process';
import axios from 'axios';
import { AuthService } from '../auth.js';
import { KustoService } from '../kusto.js';
import { MCPConfig } from '../config.js';
import { IUsageTelemetry, RateLimitedUsageTelemetry } from '../usageTelemetry.js';
import { TELEMETRY_EVENTS } from '../telemetryEvents.js';
import { registerTelemetryRedaction } from '../usageTelemetryUtils.js';

jest.mock('@azure/msal-node');
jest.mock('axios');
jest.mock('child_process', () => ({ exec: jest.fn() }));

const mockedExec = exec as unknown as jest.Mock;
const mockedAxios = axios as jest.Mocked<typeof axios>;

const RESOURCE = 'https://api.applicationinsights.io';
const UNSCOPED_COMMAND = `az account get-access-token --resource ${RESOURCE}`;
const GUID_TENANT = '11111111-2222-3333-4444-555555555555';
const DOMAIN_TENANT = 'contoso.onmicrosoft.com';

function config(tenantId: unknown): MCPConfig {
    return { connectionName: 'test', authFlow: 'azure_cli', tenantId } as unknown as MCPConfig;
}

function azReturns(json: Record<string, unknown> = { accessToken: 'token', tenant: 'whatever' }): void {
    mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) =>
        cb(null, { stdout: JSON.stringify(json), stderr: '' }));
}

function azPrints(stdout: string): void {
    mockedExec.mockImplementation((_cmd: string, _opts: unknown, cb: Function) => cb(null, { stdout, stderr: '' }));
}

function azFails(text: string): void {
    mockedExec.mockImplementation((cmd: string, _opts: unknown, cb: Function) =>
        cb(new Error(`Command failed: ${cmd}\n${text}`)));
}

function executedCommand(): string {
    expect(mockedExec).toHaveBeenCalledTimes(1);
    return mockedExec.mock.calls[0][0];
}

function fakeInner(): jest.Mocked<IUsageTelemetry> {
    return {
        trackEvent: jest.fn(),
        trackException: jest.fn(),
        trackDependency: jest.fn(),
        trackTrace: jest.fn(),
        flush: jest.fn().mockResolvedValue(undefined)
    };
}

function jwt(claims: Record<string, unknown>): string {
    const part = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
    return `${part({ alg: 'none' })}.${part(claims)}.signature`;
}

function kustoRejects(status: number, message: string): void {
    mockedAxios.create.mockReturnValue({
        post: jest.fn().mockRejectedValue({ isAxiosError: true, response: { status, data: { error: { message } } } })
    } as any);
    mockedAxios.isAxiosError.mockReturnValue(true);
}

beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => jest.restoreAllMocks());

describe('az token command', () => {
    it('AC1: passes --tenant for a GUID tenantId', async () => {
        azReturns();
        await new AuthService(config(GUID_TENANT)).authenticate();
        expect(executedCommand()).toBe(`az account get-access-token --tenant ${GUID_TENANT} --resource ${RESOURCE}`);
    });

    it('AC1: accepts an upper-case GUID and trims surrounding whitespace', async () => {
        azReturns();
        await new AuthService(config(`  ${GUID_TENANT.toUpperCase().replace(/1/g, 'A')}  `)).authenticate();
        expect(executedCommand()).toContain(`--tenant ${GUID_TENANT.toUpperCase().replace(/1/g, 'A')} --resource`);
    });

    it.each([
        ['missing', undefined],
        ['null', null],
        ['empty', ''],
        ['whitespace', '   '],
        ['zero GUID', '00000000-0000-0000-0000-000000000000']
    ])('AC3: command is byte-identical to today for %s tenantId', async (_name, tenantId) => {
        azReturns();
        await new AuthService(config(tenantId)).authenticate();
        expect(executedCommand()).toBe(UNSCOPED_COMMAND);
    });

    it('AC4: passes --tenant for a domain tenantId', async () => {
        azReturns();
        await new AuthService(config(DOMAIN_TENANT)).authenticate();
        expect(executedCommand()).toBe(`az account get-access-token --tenant ${DOMAIN_TENANT} --resource ${RESOURCE}`);
    });

    it.each([
        ['semicolon', 'x; calc'],
        ['ampersand', 'x & calc'],
        ['double ampersand', 'contoso.com&&calc'],
        ['pipe', 'x|y'],
        ['subshell', '$(id)'],
        ['backticks', '`id`'],
        ['space', 'a b'],
        ['double quote', 'a"b'],
        ['cmd variable', '%PATH%'],
        ['embedded newline', 'contoso.com\ncalc'],
        ['option', '--debug'],
        ['short option', '-t'],
        ['leading-hyphen domain', '-contoso.com'],
        ['placeholder', 'your-tenant-id'],
        ['authority alias', 'common'],
        ['unresolved variable', '${TENANT}'],
        ['too long', `${'a'.repeat(250)}.com`],
        ['number', 12345]
    ])('AC5: starts no process and does not echo the value for %s', async (_name, tenantId) => {
        azReturns();
        const failure = new AuthService(config(tenantId)).authenticate();

        await expect(failure).rejects.toThrow(/tenantId/);
        await expect(failure).rejects.toThrow(/GUID|domain/);
        expect(mockedExec).not.toHaveBeenCalled();
        if (typeof tenantId === 'string') {
            await expect(failure).rejects.not.toThrow(tenantId);
        }
    });
});

describe('az failures', () => {
    it('AC7: names the tenant, the az message and both fixes', async () => {
        azFails('ERROR: AADSTS50076 something az said');
        const failure = new AuthService(config(GUID_TENANT)).authenticate();

        await expect(failure).rejects.toThrow(`az login --tenant ${GUID_TENANT}`);
        await expect(failure).rejects.toThrow('AADSTS50076 something az said');
        await expect(failure).rejects.toThrow(/remove tenantId/i);
    });

    it.each([
        ['POSIX', '/bin/sh: az: command not found'],
        ['Windows', "'az' is not recognized as an internal or external command"]
    ])('AC7 edge: does not suggest az login --tenant when az is not installed (%s)', async (_name, text) => {
        azFails(text);
        const error = await new AuthService(config(GUID_TENANT)).authenticate().catch(e => e);

        expect(error.message).toContain(text);
        expect(error.message).not.toContain('az login');
    });

    it('AC7 edge: does not wrap invalid JSON from az', async () => {
        azPrints('not json');
        const error = await new AuthService(config(GUID_TENANT)).authenticate().catch(e => e);

        expect(error).toBeInstanceOf(SyntaxError);
    });

    it('AC7 edge: does not wrap a response without a token', async () => {
        azReturns({ tenant: GUID_TENANT });

        await expect(new AuthService(config(GUID_TENANT)).authenticate())
            .rejects.toThrow(/^No access token returned from Azure CLI$/);
    });

    it('AC3: leaves the az error untouched when no tenant is configured', async () => {
        azFails("ERROR: Please run 'az login' to setup account.");
        const error = await new AuthService(config('')).authenticate().catch(e => e);

        expect(error.message).toBe(`Command failed: ${UNSCOPED_COMMAND}\nERROR: Please run 'az login' to setup account.`);
    });
});

describe('KustoService 401/403 message', () => {
    const appId = 'test-app-id';
    const url = 'https://api.applicationinsights.io';

    it.each([401, 403])('AC8: names the tenant from the token on %i', async status => {
        kustoRejects(status, 'The provided authentication is not valid for this resource');

        await expect(new KustoService(appId, url).executeQuery('traces', jwt({ tid: GUID_TENANT })))
            .rejects.toThrow(GUID_TENANT);
    });

    it.each([
        ['not a JWT', 'test-access-token'],
        ['payload is not JSON', 'aaa.bbb.ccc'],
        ['no tid claim', jwt({ sub: 'x' })],
        ['tid is not a string', jwt({ tid: 42 })],
        ['tid is not a GUID', jwt({ tid: 'x; calc' })]
    ])('AC9: message is exactly today for an undecodable token: %s', async (_name, token) => {
        kustoRejects(403, 'Denied');

        await expect(new KustoService(appId, url).executeQuery('traces', token))
            .rejects.toThrow(/^Authentication failed: Denied\. Check your credentials and permissions\.$/);
    });
});

describe('telemetry', () => {
    function assertNotTracked(inner: jest.Mocked<IUsageTelemetry>, value: string): void {
        expect(inner.trackException).toHaveBeenCalled();
        for (const [error, properties] of inner.trackException.mock.calls) {
            const seen = [error.message, error.stack, JSON.stringify(properties)].join('\n').toLowerCase();
            expect(seen).not.toContain(value.toLowerCase());
        }
    }

    it.each([
        ['GUID', GUID_TENANT],
        ['domain', DOMAIN_TENANT]
    ])('AC10: a %s tenant reaches neither message, stack nor properties, but stays on the thrown error', async (_name, tenant) => {
        azFails(`ERROR: failed for ${tenant}`);
        const inner = fakeInner();
        const telemetry = new RateLimitedUsageTelemetry(inner);

        const thrown = await new AuthService(config(tenant), telemetry).authenticate().catch(e => e);

        expect(thrown.message).toContain(tenant);
        assertNotTracked(inner, tenant);
    });

    it('AC10: scrubs a differently-cased tenant too', async () => {
        const tenant = 'Fabrikam.onmicrosoft.com';
        azFails(`ERROR: failed for ${tenant.toUpperCase()}`);
        const inner = fakeInner();

        await new AuthService(config(tenant), new RateLimitedUsageTelemetry(inner)).authenticate().catch(e => e);

        assertNotTracked(inner, tenant);
    });

    it('AC10: scrubs the token tenant from a Kusto 401/403', async () => {
        const tenant = '66666666-7777-8888-9999-aaaaaaaaaaaa';
        kustoRejects(403, 'Denied');
        const inner = fakeInner();
        const telemetry = new RateLimitedUsageTelemetry(inner);

        const thrown = await new KustoService('app', 'https://x', telemetry)
            .executeQuery('traces', jwt({ tid: tenant })).catch(e => e);

        expect(thrown.message).toContain(tenant);
        assertNotTracked(inner, tenant);
    });

    it('AC10: scrubs a GUID nobody registered from the stackTrace property', () => {
        const unregistered = '77777777-8888-9999-aaaa-bbbbbbbbbbbb';
        const inner = fakeInner();

        new RateLimitedUsageTelemetry(inner).trackException(new Error(`failed for ${unregistered}`));

        const properties = inner.trackException.mock.calls[0][1];
        expect(properties?.stackTrace).toBeDefined();
        expect(properties?.stackTrace).not.toContain(unregistered);
    });

    it('AC10: scrubs a registered value from a property the caller supplied', () => {
        const tenant = 'northwind.onmicrosoft.com';
        registerTelemetryRedaction(tenant);
        const inner = fakeInner();

        new RateLimitedUsageTelemetry(inner).trackException(new Error('boom'), { detail: `tried ${tenant}` });

        expect(inner.trackException.mock.calls[0][1]).toHaveProperty('detail', 'tried <tenant>');
    });

    it('AC10: keeps GUID properties that are not tenants', async () => {
        const correlationId = 'abcdefab-1234-1234-1234-abcdefabcdef';
        const inner = fakeInner();

        new RateLimitedUsageTelemetry(inner).trackException(new Error('boom'), { correlationId });

        expect(inner.trackException.mock.calls[0][1]).toHaveProperty('correlationId', correlationId);
    });

    it('marks a scoped success with tenantScoped, never the value', async () => {
        azReturns();
        const inner = fakeInner();

        await new AuthService(config(GUID_TENANT), new RateLimitedUsageTelemetry(inner)).authenticate();

        const completed = inner.trackEvent.mock.calls.find(c => c[0] === TELEMETRY_EVENTS.AUTH.AUTHENTICATION_COMPLETED);
        expect(completed?.[1]).toMatchObject({ authFlow: 'azure_cli', tenantScoped: 'true' });
        expect(JSON.stringify(inner.trackEvent.mock.calls)).not.toContain(GUID_TENANT);
    });

    it('marks an unscoped success with tenantScoped false', async () => {
        azReturns();
        const inner = fakeInner();

        await new AuthService(config(''), new RateLimitedUsageTelemetry(inner)).authenticate();

        const completed = inner.trackEvent.mock.calls.find(c => c[0] === TELEMETRY_EVENTS.AUTH.AUTHENTICATION_COMPLETED);
        expect(completed?.[1]).toMatchObject({ tenantScoped: 'false' });
    });

    it('marks a scoped failure with tenantScoped', async () => {
        azFails('ERROR: nope');
        const inner = fakeInner();

        await new AuthService(config(GUID_TENANT), new RateLimitedUsageTelemetry(inner)).authenticate().catch(e => e);

        expect(inner.trackException.mock.calls[0][1]).toMatchObject({ tenantScoped: 'true' });
    });
});
