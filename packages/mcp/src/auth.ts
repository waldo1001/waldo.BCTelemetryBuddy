import { ConfidentialClientApplication, DeviceCodeRequest, PublicClientApplication } from '@azure/msal-node';
import { MCPConfig } from './config.js';

/**
 * Authentication result containing access token and user info
 */
export interface AuthResult {
    authenticated: boolean;
    accessToken?: string;
    user?: string;
    expiresOn?: Date;
}

/**
 * Authentication service using MSAL for Azure AD
 * Supports both device_code and client_credentials flows
 */
export class AuthService {
    private config: MCPConfig;
    private authResult: AuthResult | null = null;

    constructor(config: MCPConfig) {
        this.config = config;
    }

    /**
     * Get current authentication status
     */
    getStatus(): AuthResult {
        if (!this.authResult || !this.authResult.authenticated) {
            return { authenticated: false };
        }

        // Check if token is expired
        if (this.authResult.expiresOn && this.authResult.expiresOn < new Date()) {
            return { authenticated: false };
        }

        return this.authResult;
    }

    /**
     * Authenticate using configured flow
     */
    async authenticate(): Promise<AuthResult> {
        if (this.config.authFlow === 'device_code') {
            return this.authenticateDeviceCode();
        } else {
            return this.authenticateClientCredentials();
        }
    }

    /**
     * Device code flow - interactive, no secrets required
     * User completes authentication in browser
     */
    private async authenticateDeviceCode(): Promise<AuthResult> {
        try {
            const pca = new PublicClientApplication({
                auth: {
                    clientId: this.config.clientId || 'default-client-id', // Use default or configured
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`
                }
            });

            const deviceCodeRequest: DeviceCodeRequest = {
                scopes: ['https://api.applicationinsights.io/.default'],
                deviceCodeCallback: (response) => {
                    console.log('\n=== DEVICE CODE AUTHENTICATION ===');
                    console.log(response.message);
                    console.log('==================================\n');
                }
            };

            const response = await pca.acquireTokenByDeviceCode(deviceCodeRequest);

            if (!response) {
                throw new Error('Failed to acquire token');
            }

            this.authResult = {
                authenticated: true,
                accessToken: response.accessToken,
                user: response.account?.username,
                expiresOn: response.expiresOn || undefined
            };

            console.log(`✓ Authenticated as: ${this.authResult.user}`);

            return this.authResult;
        } catch (error) {
            console.error('Device code authentication failed:', error);
            this.authResult = { authenticated: false };
            throw error;
        }
    }

    /**
     * Client credentials flow - non-interactive, uses service principal
     * Suitable for unattended/server scenarios
     */
    private async authenticateClientCredentials(): Promise<AuthResult> {
        if (!this.config.clientId || !this.config.clientSecret) {
            throw new Error('Client credentials flow requires clientId and clientSecret');
        }

        try {
            const cca = new ConfidentialClientApplication({
                auth: {
                    clientId: this.config.clientId,
                    authority: `https://login.microsoftonline.com/${this.config.tenantId}`,
                    clientSecret: this.config.clientSecret
                }
            });

            const response = await cca.acquireTokenByClientCredential({
                scopes: ['https://api.applicationinsights.io/.default']
            });

            if (!response) {
                throw new Error('Failed to acquire token');
            }

            this.authResult = {
                authenticated: true,
                accessToken: response.accessToken,
                user: `ServicePrincipal:${this.config.clientId}`,
                expiresOn: response.expiresOn || undefined
            };

            console.log(`✓ Authenticated with service principal`);

            return this.authResult;
        } catch (error) {
            console.error('Client credentials authentication failed:', error);
            this.authResult = { authenticated: false };
            throw error;
        }
    }

    /**
     * Get current access token, refresh if needed
     */
    async getAccessToken(): Promise<string> {
        const status = this.getStatus();

        if (!status.authenticated || !status.accessToken) {
            await this.authenticate();
            const newStatus = this.getStatus();

            if (!newStatus.accessToken) {
                throw new Error('Failed to obtain access token');
            }

            return newStatus.accessToken;
        }

        return status.accessToken;
    }

    /**
     * Clear authentication state
     */
    clearAuth(): void {
        this.authResult = null;
    }
}
