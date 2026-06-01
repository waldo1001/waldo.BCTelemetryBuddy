import { mergeConfig, slugify, ProfileInput } from '../setup/configMerge.js';

const base: ProfileInput = {
    connectionName: 'Contoso Prod',
    authFlow: 'azure_cli',
    applicationInsightsAppId: 'app-123',
};

describe('slugify', () => {
    it('lowercases and dash-joins', () => {
        expect(slugify('Contoso Prod')).toBe('contoso-prod');
        expect(slugify('Customer A / Test!')).toBe('customer-a-test');
    });
});

describe('mergeConfig — no existing config', () => {
    it('creates a single-profile config with $schema and derived kustoClusterUrl', () => {
        const { content, mode } = mergeConfig(null, base);
        const obj = JSON.parse(content);
        expect(mode).toBe('created');
        expect(obj.$schema).toContain('config-schema.json');
        expect(obj.connectionName).toBe('Contoso Prod');
        expect(obj.applicationInsightsAppId).toBe('app-123');
        expect(obj.kustoClusterUrl).toBe('https://api.applicationinsights.io');
        expect(obj.cacheEnabled).toBe(true);
        expect(obj.profiles).toBeUndefined();
    });

    it('defaults tenantId to all-zero GUID for azure_cli', () => {
        const obj = JSON.parse(mergeConfig(null, base).content);
        expect(obj.tenantId).toBe('00000000-0000-0000-0000-000000000000');
    });

    it('creates a profiled config when profileName is supplied', () => {
        const { content, mode } = mergeConfig(null, { ...base, profileName: 'prod' });
        const obj = JSON.parse(content);
        expect(mode).toBe('created');
        expect(obj.defaultProfile).toBe('prod');
        expect(obj.profiles.prod.connectionName).toBe('Contoso Prod');
    });
});

describe('mergeConfig — existing profiled config', () => {
    const existing = JSON.stringify({
        $schema: 'x',
        defaultProfile: 'customer-a',
        profiles: {
            'customer-a': { connectionName: 'Customer A', authFlow: 'azure_cli', applicationInsightsAppId: 'a' },
        },
    });

    it('adds a named profile without clobbering siblings or defaultProfile', () => {
        const { content, mode } = mergeConfig(existing, { ...base, profileName: 'customer-b' });
        const obj = JSON.parse(content);
        expect(mode).toBe('merged-profile');
        expect(obj.defaultProfile).toBe('customer-a');           // preserved
        expect(obj.profiles['customer-a'].connectionName).toBe('Customer A'); // preserved
        expect(obj.profiles['customer-b'].applicationInsightsAppId).toBe('app-123'); // added
    });

    it('derives a profile name from connectionName when none supplied', () => {
        const obj = JSON.parse(mergeConfig(existing, base).content);
        expect(obj.profiles['contoso-prod']).toBeDefined();
    });
});

describe('mergeConfig — existing flat config + new profile', () => {
    const flat = JSON.stringify({
        $schema: 'x',
        connectionName: 'Old One',
        authFlow: 'azure_cli',
        applicationInsightsAppId: 'old',
    });

    it('converts flat config into profiles without losing the original', () => {
        const { content, mode } = mergeConfig(flat, { ...base, profileName: 'new' });
        const obj = JSON.parse(content);
        expect(mode).toBe('merged-profile');
        expect(obj.profiles['new'].applicationInsightsAppId).toBe('app-123');
        // original preserved under its own derived profile key
        expect(obj.profiles['old-one'].applicationInsightsAppId).toBe('old');
        expect(obj.connectionName).toBeUndefined(); // flat keys moved into profiles
    });
});
