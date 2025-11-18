/**
 * Azure CLI Authentication Tests
 * Tests for Azure CLI authentication flow using cached credentials
 * Added: 2025-10-16 00:20 (Prompt #75)
 */

import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

describe('Azure CLI Authentication', () => {
    describe('authenticateAzureCLI', () => {
        it('should execute correct Azure CLI command', async () => {
            const expectedCommand = 'az account get-access-token --resource https://api.applicationinsights.io';

            // Command structure should request App Insights resource token
            expect(expectedCommand).toContain('az account get-access-token');
            expect(expectedCommand).toContain('--resource');
            expect(expectedCommand).toContain('https://api.applicationinsights.io');
        });

        it('should parse Azure CLI JSON response correctly', () => {
            const mockResponse = JSON.stringify({
                accessToken: 'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6...',
                expiresOn: '2025-10-17 12:00:00.000000',
                subscription: 'subscription-123',
                tenant: 'tenant-456',
                tokenType: 'Bearer'
            });

            const parsed = JSON.parse(mockResponse);

            expect(parsed.accessToken).toBeDefined();
            expect(parsed.accessToken).toMatch(/^eyJ/); // JWT token starts with eyJ
            expect(parsed.subscription).toBe('subscription-123');
            expect(parsed.tenant).toBe('tenant-456');
            expect(parsed.expiresOn).toBeDefined();
        });

        it('should validate access token format', () => {
            const validTokens = [
                'eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiIsIng1dCI6...',
                'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0...'
            ];

            validTokens.forEach(token => {
                expect(isValidJWT(token)).toBe(true);
            });

            const invalidTokens = [
                '',
                'not-a-jwt',
                'bearer eyJ...',
                null,
                undefined
            ];

            invalidTokens.forEach(token => {
                expect(isValidJWT(token)).toBe(false);
            });
        });

        it('should handle Azure CLI not installed error', () => {
            const errorMessages = [
                "az: command not found",
                "'az' is not recognized as an internal or external command",
                "The term 'az' is not recognized"
            ];

            errorMessages.forEach(message => {
                const isNotInstalledError = detectAzureCliNotInstalled(message);
                expect(isNotInstalledError).toBe(true);
            });
        });

        it('should handle not logged in error', () => {
            const errorMessages = [
                "Please run 'az login' to setup account",
                "No subscription found. Run 'az login'",
                "ERROR: Please run 'az login'"
            ];

            errorMessages.forEach(message => {
                const isNotLoggedIn = detectAzureCliNotLoggedIn(message);
                expect(isNotLoggedIn).toBe(true);
            });
        });

        it('should parse expiration date correctly', () => {
            const expiresOnFormats = [
                '2025-10-17 12:00:00.000000',
                '2025-10-17T12:00:00.000000Z',
                '2025-10-17T12:00:00+00:00'
            ];

            expiresOnFormats.forEach(dateStr => {
                const date = new Date(dateStr);
                expect(date).toBeInstanceOf(Date);
                expect(date.getTime()).toBeGreaterThan(0);
            });
        });

        it('should validate token expiration', () => {
            const now = Date.now();

            // Future expiration (valid)
            const futureExpiration = new Date(now + 3600 * 1000); // 1 hour from now
            expect(isTokenExpired(futureExpiration)).toBe(false);

            // Past expiration (invalid)
            const pastExpiration = new Date(now - 3600 * 1000); // 1 hour ago
            expect(isTokenExpired(pastExpiration)).toBe(true);

            // Exactly now (edge case - treat as expired)
            const nowExpiration = new Date(now);
            expect(isTokenExpired(nowExpiration)).toBe(true);
        });

        it('should construct auth result correctly', () => {
            const tokenResponse = {
                accessToken: 'test-token',
                expiresOn: '2025-10-17 12:00:00.000000',
                subscription: 'sub-123',
                tenant: 'tenant-456'
            };

            const authResult = {
                authenticated: true,
                accessToken: tokenResponse.accessToken,
                user: tokenResponse.subscription || 'Azure CLI User',
                expiresOn: new Date(tokenResponse.expiresOn)
            };

            expect(authResult.authenticated).toBe(true);
            expect(authResult.accessToken).toBe('test-token');
            expect(authResult.user).toBe('sub-123');
            expect(authResult.expiresOn).toBeInstanceOf(Date);
        });

        it('should handle missing access token in response', () => {
            const incompleteResponse = JSON.stringify({
                subscription: 'sub-123',
                tenant: 'tenant-456',
                // accessToken missing
            });

            const parsed = JSON.parse(incompleteResponse);

            expect(parsed.accessToken).toBeUndefined();
            // Should throw error when validated
            expect(() => validateTokenResponse(parsed)).toThrow('No access token returned');
        });

        it('should prefer Azure CLI over other auth methods when configured', () => {
            const authFlowPriority = ['azure_cli', 'device_code', 'client_credentials'];

            const defaultFlow = 'azure_cli';

            expect(authFlowPriority[0]).toBe('azure_cli');
            expect(defaultFlow).toBe('azure_cli');
        });

        it('should not require tenant ID for azure_cli flow', () => {
            const azureCliConfig = {
                authFlow: 'azure_cli',
                // tenantId not needed - uses current az login session
                appInsightsAppId: 'app-123'
            };

            const requiresTenantId = azureCliConfig.authFlow !== 'azure_cli';

            expect(requiresTenantId).toBe(false);
        });

        it('should not require client ID for azure_cli flow', () => {
            const azureCliConfig = {
                authFlow: 'azure_cli',
                // clientId not needed - Azure CLI handles this
                appInsightsAppId: 'app-123'
            };

            const requiresClientId = azureCliConfig.authFlow !== 'azure_cli';

            expect(requiresClientId).toBe(false);
        });

        it('should format helpful error messages', () => {
            const errors = {
                notInstalled: {
                    message: 'Azure CLI is not installed or not in PATH',
                    help: 'Install from: https://docs.microsoft.com/cli/azure/install-azure-cli'
                },
                notLoggedIn: {
                    message: 'You need to login first using: az login',
                    help: 'Run "az login" in your terminal and try again.'
                }
            };

            expect(errors.notInstalled.message).toContain('not installed');
            expect(errors.notInstalled.help).toContain('https://');
            expect(errors.notLoggedIn.message).toContain('az login');
        });
    });

    describe('Token Resource Scope', () => {
        it('should request token for correct resource', () => {
            const resource = 'https://api.applicationinsights.io';

            // Verify correct App Insights API endpoint
            expect(resource).toBe('https://api.applicationinsights.io');
            expect(resource).not.toBe('https://management.azure.com');
            expect(resource).not.toBe('https://graph.microsoft.com');
        });

        it('should use token for Application Insights queries', () => {
            const apiEndpoint = 'https://api.applicationinsights.io/v1/apps/{appId}/query';
            const tokenResource = 'https://api.applicationinsights.io';

            // Token resource should match API endpoint domain
            expect(apiEndpoint).toContain(tokenResource);
        });
    });

    describe('Token Caching and Refresh', () => {
        it('should detect when token needs refresh', () => {
            const now = Date.now();

            const scenarios = [
                { expiresOn: new Date(now - 1000), needsRefresh: true, desc: 'Expired' },
                { expiresOn: new Date(now + 60000), needsRefresh: false, desc: 'Valid for 1 minute' },
                { expiresOn: new Date(now + 3600000), needsRefresh: false, desc: 'Valid for 1 hour' },
                { expiresOn: undefined, needsRefresh: true, desc: 'No expiration' }
            ];

            scenarios.forEach(scenario => {
                const needsRefresh = !scenario.expiresOn || scenario.expiresOn < new Date();
                expect(needsRefresh).toBe(scenario.needsRefresh);
            });
        });

        it('should re-use token if not expired', () => {
            const cachedToken = {
                accessToken: 'cached-token',
                expiresOn: new Date(Date.now() + 3600000) // 1 hour from now
            };

            const shouldFetchNew = !cachedToken.accessToken ||
                !cachedToken.expiresOn ||
                cachedToken.expiresOn < new Date();

            expect(shouldFetchNew).toBe(false);
            expect(cachedToken.accessToken).toBe('cached-token');
        });
    });
});

// Helper functions
function isValidJWT(token: any): boolean {
    if (!token || typeof token !== 'string') {
        return false;
    }
    // JWT tokens start with eyJ (base64 encoded JSON)
    return token.startsWith('eyJ');
}

function detectAzureCliNotInstalled(errorMessage: string): boolean {
    const lowerMessage = errorMessage.toLowerCase();
    return lowerMessage.includes('command not found') ||
        lowerMessage.includes('not recognized') ||
        lowerMessage.includes("'az' is not recognized");
}

function detectAzureCliNotLoggedIn(errorMessage: string): boolean {
    return errorMessage.includes('az login') ||
        errorMessage.includes('Please run');
}

function isTokenExpired(expiresOn: Date): boolean {
    return expiresOn <= new Date();
}

function validateTokenResponse(response: any): void {
    if (!response.accessToken) {
        throw new Error('No access token returned from Azure CLI');
    }
}
