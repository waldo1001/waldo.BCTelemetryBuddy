import {
    discoverEndpoints,
    parseSubscriptions,
    AzUnavailableError,
    RunAz,
} from '../setup/endpointDiscovery.js';

describe('parseSubscriptions', () => {
    it('extracts id + tenantId', () => {
        const subs = parseSubscriptions(JSON.stringify([
            { id: 'sub-1', tenantId: 't-1', name: 'One' },
            { id: 'sub-2', tenantId: 't-2', name: 'Two' },
        ]));
        expect(subs).toEqual([
            { id: 'sub-1', tenantId: 't-1' },
            { id: 'sub-2', tenantId: 't-2' },
        ]);
    });
});

// Build a fake `az` runner that dispatches on the command string.
function makeRunAz(handlers: Array<[RegExp, string | Error]>): RunAz {
    return async (args: string) => {
        for (const [re, out] of handlers) {
            if (re.test(args)) {
                if (out instanceof Error) throw out;
                return out;
            }
        }
        throw new Error(`unexpected az call: ${args}`);
    };
}

describe('discoverEndpoints', () => {
    it('maps components across subscriptions with appId and tenantId', async () => {
        const runAz = makeRunAz([
            [/account list/, JSON.stringify([{ id: 'sub-1', tenantId: 't-1' }])],
            [/resource list/, JSON.stringify([
                { id: '/comp/a', name: 'ai-a', resourceGroup: 'rg1', location: 'westeurope' },
            ])],
            [/component show .*\/comp\/a/, JSON.stringify({ appId: 'appid-a' })],
        ]);

        const endpoints = await discoverEndpoints(runAz);
        expect(endpoints).toEqual([
            { name: 'ai-a', appId: 'appid-a', resourceGroup: 'rg1', subscriptionId: 'sub-1', tenantId: 't-1', location: 'westeurope' },
        ]);
    });

    it('returns empty array when no components exist', async () => {
        const runAz = makeRunAz([
            [/account list/, JSON.stringify([{ id: 'sub-1', tenantId: 't-1' }])],
            [/resource list/, JSON.stringify([])],
        ]);
        expect(await discoverEndpoints(runAz)).toEqual([]);
    });

    it('skips a subscription whose listing fails and continues', async () => {
        const runAz = makeRunAz([
            [/account list/, JSON.stringify([{ id: 'bad', tenantId: 't' }, { id: 'good', tenantId: 't2' }])],
            [/resource list .*--subscription bad/, new Error('AuthorizationFailed')],
            [/resource list .*--subscription good/, JSON.stringify([{ id: '/c/g', name: 'g', resourceGroup: 'rg', location: 'loc' }])],
            [/component show .*\/c\/g/, JSON.stringify({ appId: 'gid' })],
        ]);
        const endpoints = await discoverEndpoints(runAz);
        expect(endpoints.map(e => e.name)).toEqual(['g']);
    });

    it('throws AzUnavailableError when az is not installed/logged in', async () => {
        const runAz = makeRunAz([
            [/account list/, new Error('az: command not found')],
        ]);
        await expect(discoverEndpoints(runAz)).rejects.toBeInstanceOf(AzUnavailableError);
    });
});
