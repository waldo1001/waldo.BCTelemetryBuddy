/**
 * VSCodeAuthService unit tests
 * 
 * Tests the VSCodeAuthService class that manages VS Code integrated Azure authentication
 */

import { VSCodeAuthService } from '../services/vscodeAuthService';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
    authentication: {
        getSession: jest.fn()
    },
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })),
        showInformationMessage: jest.fn()
    }
}), { virtual: true });

describe('VSCodeAuthService', () => {
    let authService: VSCodeAuthService;
    let mockOutputChannel: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        };

        authService = new VSCodeAuthService(mockOutputChannel);
    });

    describe('Constructor', () => {
        it('should create VSCodeAuthService instance with output channel', () => {
            expect(authService).toBeInstanceOf(VSCodeAuthService);
            expect(authService).toBeDefined();
        });
    });

    describe('getAccessToken()', () => {
        it('should request and return access token when authenticated', async () => {
            const mockSession = {
                accessToken: 'test-access-token-12345',
                account: {
                    label: 'test@example.com',
                    id: 'test-account-id'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const token = await authService.getAccessToken();

            expect(token).toBe('test-access-token-12345');
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: true }
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[VSCodeAuth] Requesting access token...');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[VSCodeAuth] ✓ Authenticated as: test@example.com');
        });

        it('should return undefined when no session is available', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            const token = await authService.getAccessToken();

            expect(token).toBeUndefined();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[VSCodeAuth] No authentication session available');
        });

        it('should use createIfNone parameter when set to false', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            const token = await authService.getAccessToken(false);

            expect(token).toBeUndefined();
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false }
            );
        });

        it('should use createIfNone parameter when set to true', async () => {
            const mockSession = {
                accessToken: 'token-123',
                account: {
                    label: 'user@test.com',
                    id: 'user-id'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const token = await authService.getAccessToken(true);

            expect(token).toBe('token-123');
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: true }
            );
        });

        it('should throw error when authentication fails', async () => {
            const authError = new Error('Authentication failed: user cancelled');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(authError);

            await expect(authService.getAccessToken()).rejects.toThrow('Authentication failed: user cancelled');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[VSCodeAuth] ❌ Authentication failed: Authentication failed: user cancelled'
            );
        });

        it('should handle network errors', async () => {
            const networkError = new Error('Network request failed');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(networkError);

            await expect(authService.getAccessToken()).rejects.toThrow('Network request failed');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[VSCodeAuth] ❌ Authentication failed: Network request failed'
            );
        });
    });

    describe('isAuthenticated()', () => {
        it('should return true when user is authenticated', async () => {
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'test@example.com',
                    id: 'test-id'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const isAuth = await authService.isAuthenticated();

            expect(isAuth).toBe(true);
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return false when no session exists', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            const isAuth = await authService.isAuthenticated();

            expect(isAuth).toBe(false);
        });

        it('should return false when authentication check throws error', async () => {
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('Auth check failed'));

            const isAuth = await authService.isAuthenticated();

            expect(isAuth).toBe(false);
        });

        it('should use silent mode to avoid prompting user', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            await authService.isAuthenticated();

            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });
    });

    describe('signOut()', () => {
        it('should show information message when session exists', async () => {
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'test@example.com',
                    id: 'test-id'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const result = await authService.signOut();

            expect(result).toBe(false);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[VSCodeAuth] Sign out requested...');
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                'To sign out, use the Accounts menu in VS Code (bottom left corner) and select "Sign Out"'
            );
        });

        it('should return true when no session exists', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            const result = await authService.signOut();

            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should throw error when sign out check fails', async () => {
            const error = new Error('Failed to check session');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(error);

            await expect(authService.signOut()).rejects.toThrow(
                'Failed to check authentication status: Failed to check session'
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[VSCodeAuth] Sign out check failed: Failed to check session'
            );
        });

        it('should use silent mode when checking for session', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            await authService.signOut();

            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });
    });

    describe('getAccountInfo()', () => {
        it('should return account information when session exists', async () => {
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'test@example.com',
                    id: 'test-account-id-12345'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const accountInfo = await authService.getAccountInfo();

            expect(accountInfo).toEqual({
                label: 'test@example.com',
                id: 'test-account-id-12345'
            });
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return undefined when no session exists', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            const accountInfo = await authService.getAccountInfo();

            expect(accountInfo).toBeUndefined();
        });

        it('should return undefined when error occurs', async () => {
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('Session error'));

            const accountInfo = await authService.getAccountInfo();

            expect(accountInfo).toBeUndefined();
        });

        it('should use silent mode to avoid prompting user', async () => {
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            await authService.getAccountInfo();

            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should handle session with different account formats', async () => {
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'Another User <another@test.com>',
                    id: 'different-id'
                }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const accountInfo = await authService.getAccountInfo();

            expect(accountInfo).toEqual({
                label: 'Another User <another@test.com>',
                id: 'different-id'
            });
        });
    });

    describe('Edge Cases and Integration', () => {
        it('should handle multiple sequential authentication calls', async () => {
            const mockSession = {
                accessToken: 'token-1',
                account: { label: 'user@test.com', id: 'id-1' }
            };

            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            const token1 = await authService.getAccessToken();
            const token2 = await authService.getAccessToken();

            expect(token1).toBe('token-1');
            expect(token2).toBe('token-1');
            expect(vscode.authentication.getSession).toHaveBeenCalledTimes(2);
        });

        it('should handle session state changes between calls', async () => {
            // First call: authenticated
            const mockSession = {
                accessToken: 'token-1',
                account: { label: 'user@test.com', id: 'id-1' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValueOnce(mockSession);

            const isAuth1 = await authService.isAuthenticated();
            expect(isAuth1).toBe(true);

            // Second call: not authenticated
            (vscode.authentication.getSession as jest.Mock).mockResolvedValueOnce(undefined);

            const isAuth2 = await authService.isAuthenticated();
            expect(isAuth2).toBe(false);
        });

        it('should use correct scopes for Application Insights', async () => {
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'user@test.com', id: 'id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            await authService.getAccessToken();

            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                expect.any(Object)
            );
        });

        it('should handle empty error messages gracefully', async () => {
            const error = new Error('');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(error);

            await expect(authService.getAccessToken()).rejects.toThrow();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('❌ Authentication failed')
            );
        });
    });
});
