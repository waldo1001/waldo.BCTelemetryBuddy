/**
 * Shared secret for the MCP server's HTTP mode — spec docs/specs/147-mcp-http-origin-host-token.md
 *
 * One token per installation (SecretStorage), so every VS Code window can use a
 * server another window spawned. Never log or track its value.
 */
import * as crypto from 'crypto';
import type * as vscode from 'vscode';

export const HTTP_TOKEN_SECRET_KEY = 'bctb.mcp.httpToken';

// Used for the rest of the session when SecretStorage is unavailable (e.g. a locked keyring)
let sessionFallbackToken: string | undefined;

export function generateHttpToken(): string {
    return crypto.randomBytes(32).toString('base64url');
}

export async function getOrCreateHttpToken(
    secrets: Pick<vscode.SecretStorage, 'get' | 'store'>,
    log?: (line: string) => void
): Promise<string> {
    try {
        const stored = (await secrets.get(HTTP_TOKEN_SECRET_KEY))?.trim();
        if (stored) {
            return stored;
        }
        const token = generateHttpToken();
        await secrets.store(HTTP_TOKEN_SECRET_KEY, token);
        return token;
    } catch (error: any) {
        if (!sessionFallbackToken) {
            sessionFallbackToken = generateHttpToken();
            log?.(`⚠️ Could not use VS Code SecretStorage for the MCP HTTP token (${error?.message ?? 'unknown error'}); using a token for this session only.`);
        }
        return sessionFallbackToken;
    }
}

export function withHttpToken(env: Record<string, string>, token: string): Record<string, string> {
    return { ...env, BCTB_HTTP_TOKEN: token };
}
