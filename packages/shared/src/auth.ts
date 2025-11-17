import { ConfidentialClientApplication, DeviceCodeRequest, PublicClientApplication } from '@azure/msal-node';
import { MCPConfig } from './config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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
 * Supports device_code, client_credentials, and azure_cli flows
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
        if (this.config.authFlow === 'azure_cli') {
            return this.authenticateAzureCLI();
        } else if (this.config.authFlow === 'device_code') {
            return this.authenticateDeviceCode();
        } else {
            return this.authenticateClientCredentials();
        }
    }

    /**
     * Azure CLI flow - uses cached credentials from 'az login'
     * No interactive login required if user already logged in via Azure CLI
     */
    private async authenticateAzureCLI(): Promise<AuthResult> {
        try {
            console.log('Using Azure CLI authentication (az account get-access-token)...');

            // Get access token from Azure CLI
            // Use --resource flag to get token for Application Insights API
            const { stdout, stderr } = await execAsync(
                'az account get-access-token --resource https://api.applicationinsights.io'
            );

            if (stderr) {
                console.error('Azure CLI stderr:', stderr);
            }

            const tokenResponse = JSON.parse(stdout);

            if (!tokenResponse.accessToken) {
                throw new Error('No access token returned from Azure CLI');
            }

            this.authResult = {
                authenticated: true,
                accessToken: tokenResponse.accessToken,
                user: tokenResponse.subscription || 'Azure CLI User',
                expiresOn: tokenResponse.expiresOn ? new Date(tokenResponse.expiresOn) : undefined
            };

            console.log(`✓ Authenticated via Azure CLI`);
            console.log(`  Subscription: ${tokenResponse.subscription || 'N/A'}`);
            console.log(`  Tenant: ${tokenResponse.tenant || 'N/A'}`);

            return this.authResult;
        } catch (error: any) {
            console.error('Azure CLI authentication failed:', error.message);

            if (error.message.includes('az: command not found') || error.message.includes('not recognized')) {
                console.error('\n⚠️  Azure CLI is not installed or not in PATH');
                console.error('Install from: https://docs.microsoft.com/cli/azure/install-azure-cli\n');
            } else if (error.message.includes('az login')) {
                console.error('\n⚠️  You need to login first using: az login');
                console.error('Run "az login" in your terminal and try again.\n');
            }

            this.authResult = { authenticated: false };
            throw error;
        }
    }

    /**
     * Device code flow - interactive, no secrets required
     * User completes authentication in browser
     */
    private async authenticateDeviceCode(): Promise<AuthResult> {
        try {
            // Use Azure CLI's public client ID if none configured
            // This is a well-known Microsoft client ID for device code flow
            const clientId = this.config.clientId || '04b07795-8ddb-461a-bbee-02f9e1bf7b46';

            const pca = new PublicClientApplication({
                auth: {
                    clientId,
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
