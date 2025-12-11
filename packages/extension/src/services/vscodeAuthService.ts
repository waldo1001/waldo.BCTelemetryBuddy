import * as vscode from 'vscode';

/**
 * Service for managing VS Code integrated Azure authentication
 * Uses VS Code's built-in Microsoft authentication provider
 */
export class VSCodeAuthService {
    private static readonly SCOPES = ['https://api.applicationinsights.io/.default'];
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
    }

    /**
     * Get an access token using VS Code's authentication provider
     * @param createIfNone If true, prompts user to sign in if not authenticated
     * @returns Access token or undefined if not authenticated
     */
    async getAccessToken(createIfNone: boolean = true): Promise<string | undefined> {
        try {
            this.outputChannel.appendLine('[VSCodeAuth] Requesting access token...');

            // Get authentication session from VS Code's Microsoft authentication provider
            const session = await vscode.authentication.getSession(
                'microsoft',
                VSCodeAuthService.SCOPES,
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
     * Check if user is currently authenticated
     */
    async isAuthenticated(): Promise<boolean> {
        try {
            const session = await vscode.authentication.getSession(
                'microsoft',
                VSCodeAuthService.SCOPES,
                { createIfNone: false, silent: true }
            );
            return session !== undefined;
        } catch {
            return false;
        }
    }

    /**
     * Sign out from VS Code authentication
     */
    async signOut(): Promise<void> {
        try {
            this.outputChannel.appendLine('[VSCodeAuth] Signing out...');
            
            const session = await vscode.authentication.getSession(
                'microsoft',
                VSCodeAuthService.SCOPES,
                { createIfNone: false, silent: true }
            );

            if (session) {
                // Note: VS Code doesn't have a direct sign-out API
                // The user needs to sign out from the Accounts menu in VS Code
                vscode.window.showInformationMessage(
                    'To sign out, use the Accounts menu in VS Code (bottom left corner) and select "Sign Out"'
                );
            }
        } catch (error: any) {
            this.outputChannel.appendLine(`[VSCodeAuth] Sign out failed: ${error.message}`);
        }
    }

    /**
     * Get account information for the current session
     */
    async getAccountInfo(): Promise<{ label: string; id: string } | undefined> {
        try {
            const session = await vscode.authentication.getSession(
                'microsoft',
                VSCodeAuthService.SCOPES,
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
