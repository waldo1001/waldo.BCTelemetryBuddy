/**
 * Extension HTTP-mode token — spec docs/specs/147-mcp-http-origin-host-token.md
 */
import { HTTP_TOKEN_SECRET_KEY, generateHttpToken, getOrCreateHttpToken, withHttpToken } from '../services/httpToken';

function makeSecrets(initial?: string) {
    const store = new Map<string, string>();
    if (initial !== undefined) {
        store.set(HTTP_TOKEN_SECRET_KEY, initial);
    }
    return {
        store: jest.fn(async (key: string, value: string) => { store.set(key, value); }),
        get: jest.fn(async (key: string) => store.get(key)),
        map: store
    };
}

describe('httpToken', () => {
    it('AC9: generateHttpToken returns 32 random bytes as base64url', () => {
        const a = generateHttpToken();
        const b = generateHttpToken();
        expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(Buffer.from(a, 'base64url')).toHaveLength(32);
        expect(a).not.toBe(b);
    });

    it('AC9: generates and stores a token when none is stored', async () => {
        const secrets = makeSecrets();
        const token = await getOrCreateHttpToken(secrets);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(secrets.store).toHaveBeenCalledWith(HTTP_TOKEN_SECRET_KEY, token);
        expect(secrets.map.get(HTTP_TOKEN_SECRET_KEY)).toBe(token);
    });

    it('AC9: reuses a stored token without storing again', async () => {
        const secrets = makeSecrets('stored-token-value');
        expect(await getOrCreateHttpToken(secrets)).toBe('stored-token-value');
        expect(secrets.store).not.toHaveBeenCalled();
    });

    it('AC9: an empty stored value is replaced', async () => {
        const secrets = makeSecrets('');
        const token = await getOrCreateHttpToken(secrets);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(secrets.store).toHaveBeenCalledTimes(1);
    });

    it('AC9: falls back to an in-memory token when SecretStorage fails', async () => {
        const secrets = {
            get: jest.fn(async () => { throw new Error('keyring locked'); }),
            store: jest.fn(async () => { throw new Error('keyring locked'); })
        };
        const log = jest.fn();
        const token = await getOrCreateHttpToken(secrets, log);
        expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(log).toHaveBeenCalledTimes(1);
        expect(String(log.mock.calls[0][0])).not.toContain(token);
        // Same session keeps the same fallback token
        expect(await getOrCreateHttpToken(secrets, log)).toBe(token);
    });

    it('AC10: withHttpToken adds BCTB_HTTP_TOKEN and keeps the rest without mutating', () => {
        const env = { BCTB_MODE: 'http', BCTB_PORT: '52346' };
        const result = withHttpToken(env, 'tok');
        expect(result).toEqual({ BCTB_MODE: 'http', BCTB_PORT: '52346', BCTB_HTTP_TOKEN: 'tok' });
        expect(env).toEqual({ BCTB_MODE: 'http', BCTB_PORT: '52346' });
    });
});
