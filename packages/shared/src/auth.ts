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
        } else if (this.config.authFlow === 'vscode_auth') {
            return this.authenticateVSCode();
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
            console.error('[MCP] Using Azure CLI authentication (az account get-access-token)...');

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

            console.error(`[MCP] ✓ Authenticated via Azure CLI`);
            console.error(`[MCP]   Subscription: ${tokenResponse.subscription || 'N/A'}`);
            console.error(`[MCP]   Tenant: ${tokenResponse.tenant || 'N/A'}`);

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
     * VS Code authentication flow - uses VS Code's built-in Microsoft authentication provider
     * In MCP context, expects token to be passed via BCTB_ACCESS_TOKEN environment variable
     * 
     * Note: Token refresh is handled by checking expiration and re-authenticating
     */
    private async authenticateVSCode(): Promise<AuthResult> {
        try {
            console.error('[MCP] Using VS Code authentication...');

            // Check if we have a cached token that's still valid
            if (this.authResult && this.authResult.authenticated && this.authResult.expiresOn) {
                const now = new Date();
                const expiresIn = (this.authResult.expiresOn.getTime() - now.getTime()) / 1000;
                
                // If token expires in more than 5 minutes, reuse it
                if (expiresIn > 300) {
                    console.error(`[MCP] ✓ Using cached VS Code token (expires in ${Math.floor(expiresIn / 60)} minutes)`);
                    return this.authResult;
                }
                
                console.error('[MCP] Token expired or expiring soon, fetching new token...');
            }

            // In MCP context, the extension passes the token via environment variable
            // The extension should refresh this before spawning MCP if using stdio mode
            const accessToken = process.env.BCTB_ACCESS_TOKEN;
            
            if (!accessToken) {
                const errorMsg = [
                    'BCTB_ACCESS_TOKEN environment variable not set.',
                    '',
                    'This happens when:',
                    '- VS Code has not been configured to pass authentication tokens to the MCP',
                    '- You need to configure the MCP to use the extension for token management',
                    '',
                    'Solutions:',
                    '1. For Copilot Chat: The extension should automatically handle this',
                    '2. For command palette: Use "BC Telemetry Buddy: Start MCP" command',
                    '3. Alternative: Switch to Azure CLI authentication (easier for MCP usage)',
                    '',
                    'To switch authentication:',
                    '- Run "BC Telemetry Buddy: Setup Wizard" and select Azure CLI or Device Code',
                    '- Or manually edit .bctb-config.json to set authFlow: "azure_cli"'
                ].join('\n');
                throw new Error(errorMsg);
            }

            this.authResult = {
                authenticated: true,
                accessToken: accessToken,
                user: 'VS Code User',
                // Token typically expires in 1 hour
                expiresOn: new Date(Date.now() + 3600000)
            };

            console.error(`[MCP] ✓ Authenticated via VS Code`);

            return this.authResult;
        } catch (error: any) {
            console.error('VS Code authentication failed:', error.message);
            this.authResult = { authenticated: false };
            throw error;
        }
    }

    /**
     * Get current access token, refresh if needed
     */
    async getAccessToken(): Promise<string> {
        const status = this.getStatus();

        // For vscode_auth, always re-authenticate to get fresh token if expired
        if (this.config.authFlow === 'vscode_auth') {
            // Check if token is expired or expiring soon (within 5 minutes)
            if (!status.authenticated || !status.accessToken || 
                (this.authResult?.expiresOn && 
                 (this.authResult.expiresOn.getTime() - Date.now()) < 300000)) {
                console.error('[MCP] Token expired or expiring, re-authenticating...');
                await this.authenticate();
                const newStatus = this.getStatus();

                if (!newStatus.accessToken) {
                    throw new Error('Failed to obtain access token from VS Code');
                }

                return newStatus.accessToken;
            }
            return status.accessToken;
        }

        // For other auth flows, use existing logic
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
