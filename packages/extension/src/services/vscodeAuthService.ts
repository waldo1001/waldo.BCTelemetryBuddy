import * as vscode from 'vscode';

/**
 * Service for managing VS Code integrated Azure authentication
 * Uses VS Code's built-in Microsoft authentication provider
 */
export class VSCodeAuthService {
    private static readonly BASE_SCOPES = ['https://api.applicationinsights.io/.default'];
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Get an access token using VS Code's authentication provider
     * @param createIfNone If true, prompts user to sign in if not authenticated
     * @param tenantId Optional tenant ID to authenticate against (important for guest users)
     * @returns Access token or undefined if not authenticated
     */
    async getAccessToken(createIfNone: boolean = true, tenantId?: string): Promise<string | undefined> {
        try {
            // Build scopes with tenant hint if provided
            // For guest users, this ensures the token is issued for the correct tenant
            const scopes = this.buildScopes(tenantId);
            
            this.outputChannel.appendLine('[VSCodeAuth] Requesting access token...');
            if (tenantId) {
                this.outputChannel.appendLine(`[VSCodeAuth] Using tenant ID: ${tenantId}`);
            }

            // Get authentication session from VS Code's Microsoft authentication provider
            const session = await vscode.authentication.getSession(
                'microsoft',
                scopes,
                { createIfNone }
            );

            if (!session) {
                this.outputChannel.appendLine('[VSCodeAuth] No authentication session available');
                return undefined;
            }

            this.outputChannel.appendLine(`[VSCodeAuth] ✓ Authenticated as: ${session.account.label}`);
            return session.accessToken;
        } catch (error: any) {
            this.outputChannel.appendLine(`[VSCodeAuth] ❌ Authentication failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Build authentication scopes with optional tenant hint
     * @param tenantId Optional tenant ID to include in scopes
     * @returns Array of scopes for authentication
     */
    private buildScopes(tenantId?: string): string[] {
        if (!tenantId) {
            return VSCodeAuthService.BASE_SCOPES;
        }

        // VS Code's Microsoft authentication provider supports tenant-specific authentication
        // by including the tenant ID as a scope in the format: "TENANT:<tenant-id>"
        // This ensures the token is issued for the specified tenant, which is critical
        // for guest users who belong to multiple tenants
        return [`TENANT:${tenantId}`, ...VSCodeAuthService.BASE_SCOPES];
    }

    /**
     * Check if user is currently authenticated
     * @param tenantId Optional tenant ID to check authentication for specific tenant
     */
    async isAuthenticated(tenantId?: string): Promise<boolean> {
        try {
            const scopes = this.buildScopes(tenantId);
            const session = await vscode.authentication.getSession(
                'microsoft',
                scopes,
                { createIfNone: false, silent: true }
            );
            return session !== undefined;
        } catch {
            return false;
        }
    }

    /**
     * Sign out from VS Code authentication
     * Note: VS Code doesn't have a programmatic sign-out API
     * @param tenantId Optional tenant ID to check authentication for specific tenant
     * @returns false to indicate sign-out must be done manually by the user
     */
    async signOut(tenantId?: string): Promise<boolean> {
        try {
            this.outputChannel.appendLine('[VSCodeAuth] Sign out requested...');
            
            const scopes = this.buildScopes(tenantId);
            const session = await vscode.authentication.getSession(
                'microsoft',
                scopes,
                { createIfNone: false, silent: true }
            );

            if (session) {
                // VS Code doesn't have a direct sign-out API
                // The user needs to sign out from the Accounts menu in VS Code
                vscode.window.showInformationMessage(
                    'To sign out, use the Accounts menu in VS Code (bottom left corner) and select "Sign Out"'
                );
                return false; // Indicates manual sign-out is required
            }
            return true; // No session found, already signed out
        } catch (error: any) {
            this.outputChannel.appendLine(`[VSCodeAuth] Sign out check failed: ${error.message}`);
            throw new Error(`Failed to check authentication status: ${error.message}`);
        }
    }

    /**
     * Get account information for the current session
     * @param tenantId Optional tenant ID to get account info for specific tenant
     */
    async getAccountInfo(tenantId?: string): Promise<{ label: string; id: string } | undefined> {
        try {
            const scopes = this.buildScopes(tenantId);
            const session = await vscode.authentication.getSession(
                'microsoft',
                scopes,
                { createIfNone: false, silent: true }
            );

            if (session) {
                return {
                    label: session.account.label,
                    id: session.account.id
                };
            }
        } catch {
            // Ignore errors
        }
        return undefined;
    }
}
