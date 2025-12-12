import { VSCodeAuthService } from '../services/vscodeAuthService';
import * as vscode from 'vscode';

// Mock vscode module
jest.mock('vscode', () => ({
    authentication: {
        getSession: jest.fn()
    },
    window: {
        showInformationMessage: jest.fn()
    }
}));

describe('VSCodeAuthService', () => {
    let outputChannel: vscode.OutputChannel;
    let authService: VSCodeAuthService;

    beforeEach(() => {
        // Mock output channel
        outputChannel = {
            appendLine: jest.fn(),
            append: jest.fn(),
            clear: jest.fn(),
            show: jest.fn(),
            hide: jest.fn(),
            dispose: jest.fn(),
            name: 'Test',
            replace: jest.fn()
        } as any;

        authService = new VSCodeAuthService(outputChannel);
        jest.clearAllMocks();
    });

    describe('getAccessToken', () => {
        it('should request access token without tenant ID', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'test@example.com',
                    id: 'test-id'
                }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            const token = await authService.getAccessToken(true);

            // Assert
            expect(token).toBe('test-token');
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: true }
            );
        });

        it('should request access token with tenant ID for guest users', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'tenant-specific-token',
                account: {
                    label: 'guest@example.com',
                    id: 'guest-id'
                }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);
            const tenantId = 'tenant-12345';

            // Act
            const token = await authService.getAccessToken(true, tenantId);

            // Assert
            expect(token).toBe('tenant-specific-token');
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                [`TENANT:${tenantId}`, 'https://api.applicationinsights.io/.default'],
                { createIfNone: true }
            );
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining(`Using tenant ID: ${tenantId}`)
            );
        });

        it('should return undefined when no session is available', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            // Act
            const token = await authService.getAccessToken(true);

            // Assert
            expect(token).toBeUndefined();
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                '[VSCodeAuth] No authentication session available'
            );
        });

        it('should handle authentication errors', async () => {
            // Arrange
            const error = new Error('Authentication failed');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(error);

            // Act & Assert
            await expect(authService.getAccessToken(true)).rejects.toThrow('Authentication failed');
            expect(outputChannel.appendLine).toHaveBeenCalledWith(
                '[VSCodeAuth] ❌ Authentication failed: Authentication failed'
            );
        });

        it('should pass createIfNone parameter correctly', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            await authService.getAccessToken(false);

            // Assert
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                expect.any(Array),
                { createIfNone: false }
            );
        });
    });

    describe('isAuthenticated', () => {
        it('should return true when user is authenticated', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            const result = await authService.isAuthenticated();

            // Assert
            expect(result).toBe(true);
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                ['https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return true when user is authenticated for specific tenant', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'tenant-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);
            const tenantId = 'tenant-12345';

            // Act
            const result = await authService.isAuthenticated(tenantId);

            // Assert
            expect(result).toBe(true);
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                [`TENANT:${tenantId}`, 'https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return false when user is not authenticated', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            // Act
            const result = await authService.isAuthenticated();

            // Assert
            expect(result).toBe(false);
        });

        it('should return false on error', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('Error'));

            // Act
            const result = await authService.isAuthenticated();

            // Assert
            expect(result).toBe(false);
        });
    });

    describe('signOut', () => {
        it('should show information message when user is signed in', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            const result = await authService.signOut();

            // Assert
            expect(result).toBe(false);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('To sign out')
            );
        });

        it('should use tenant-specific scopes when signing out', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);
            const tenantId = 'tenant-12345';

            // Act
            await authService.signOut(tenantId);

            // Assert
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                [`TENANT:${tenantId}`, 'https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return true when no session exists', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            // Act
            const result = await authService.signOut();

            // Assert
            expect(result).toBe(true);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should throw error on failure', async () => {
            // Arrange
            const error = new Error('Sign out failed');
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(error);

            // Act & Assert
            await expect(authService.signOut()).rejects.toThrow('Failed to check authentication status');
        });
    });

    describe('getAccountInfo', () => {
        it('should return account information when authenticated', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: {
                    label: 'test@example.com',
                    id: 'test-id-123'
                }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            const accountInfo = await authService.getAccountInfo();

            // Assert
            expect(accountInfo).toEqual({
                label: 'test@example.com',
                id: 'test-id-123'
            });
        });

        it('should use tenant-specific scopes when getting account info', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'test-token',
                account: { label: 'test@example.com', id: 'test-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);
            const tenantId = 'tenant-12345';

            // Act
            await authService.getAccountInfo(tenantId);

            // Assert
            expect(vscode.authentication.getSession).toHaveBeenCalledWith(
                'microsoft',
                [`TENANT:${tenantId}`, 'https://api.applicationinsights.io/.default'],
                { createIfNone: false, silent: true }
            );
        });

        it('should return undefined when not authenticated', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(undefined);

            // Act
            const accountInfo = await authService.getAccountInfo();

            // Assert
            expect(accountInfo).toBeUndefined();
        });

        it('should return undefined on error', async () => {
            // Arrange
            (vscode.authentication.getSession as jest.Mock).mockRejectedValue(new Error('Error'));

            // Act
            const accountInfo = await authService.getAccountInfo();

            // Assert
            expect(accountInfo).toBeUndefined();
        });
    });

    describe('buildScopes - integration tests', () => {
        it('should construct correct scopes for guest user scenario', async () => {
            // Arrange
            const tenantId = 'guest-tenant-456';
            const mockSession = {
                accessToken: 'guest-token',
                account: {
                    label: 'guest.user@otherdomain.com',
                    id: 'guest-account-id'
                }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            await authService.getAccessToken(true, tenantId);

            // Assert - Verify the TENANT scope comes first
            const call = (vscode.authentication.getSession as jest.Mock).mock.calls[0];
            const scopes = call[1];
            expect(scopes[0]).toBe(`TENANT:${tenantId}`);
            expect(scopes[1]).toBe('https://api.applicationinsights.io/.default');
        });

        it('should use base scopes when tenant ID is not provided', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'regular-token',
                account: { label: 'user@example.com', id: 'user-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            await authService.getAccessToken(true);

            // Assert - Verify only base scopes are used
            const call = (vscode.authentication.getSession as jest.Mock).mock.calls[0];
            const scopes = call[1];
            expect(scopes).toEqual(['https://api.applicationinsights.io/.default']);
            expect(scopes.length).toBe(1);
        });

        it('should handle empty tenant ID by using base scopes', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'token',
                account: { label: 'user@example.com', id: 'user-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            await authService.getAccessToken(true, '');

            // Assert - Empty string should be treated as no tenant
            const call = (vscode.authentication.getSession as jest.Mock).mock.calls[0];
            const scopes = call[1];
            expect(scopes).toEqual(['https://api.applicationinsights.io/.default']);
        });

        it('should handle whitespace-only tenant ID by using base scopes', async () => {
            // Arrange
            const mockSession = {
                accessToken: 'token',
                account: { label: 'user@example.com', id: 'user-id' }
            };
            (vscode.authentication.getSession as jest.Mock).mockResolvedValue(mockSession);

            // Act
            await authService.getAccessToken(true, '   ');

            // Assert - Whitespace-only string should be treated as no tenant
            const call = (vscode.authentication.getSession as jest.Mock).mock.calls[0];
            const scopes = call[1];
            expect(scopes).toEqual(['https://api.applicationinsights.io/.default']);
        });
    });
});
