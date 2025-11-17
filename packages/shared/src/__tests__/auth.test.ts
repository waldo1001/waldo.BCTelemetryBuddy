import { AuthService, AuthResult } from '../auth.js';
import { MCPConfig } from '../config.js';
import { PublicClientApplication, DeviceCodeRequest, ConfidentialClientApplication } from '@azure/msal-node';

// Mock MSAL
jest.mock('@azure/msal-node');

describe('AuthService', () => {
    const mockConfig: MCPConfig = {
        connectionName: 'test',
        tenantId: 'test-tenant-id',
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
        authFlow: 'device_code',
        applicationInsightsAppId: 'test-app-id',
        kustoClusterUrl: 'https://test.kusto.windows.net',
        cacheEnabled: true,
        cacheTTLSeconds: 3600,
        removePII: false,
        port: 52345,
        workspacePath: '/test/workspace',
        queriesFolder: 'queries',
        references: []
    };

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('getStatus', () => {
        it('should return unauthenticated status when no auth result exists', () => {
            // Arrange
            const authService = new AuthService(mockConfig);

            // Act
            const status = authService.getStatus();

            // Assert
            expect(status.authenticated).toBe(false);
            expect(status.accessToken).toBeUndefined();
        });

        it('should return authenticated status when valid token exists', () => {
            // Arrange
            const authService = new AuthService(mockConfig);
            const futureDate = new Date(Date.now() + 3600000); // 1 hour from now

            // Use reflection to set private authResult
            (authService as any).authResult = {
                authenticated: true,
                accessToken: 'test-token',
                user: 'test@example.com',
                expiresOn: futureDate
            };

            // Act
            const status = authService.getStatus();

            // Assert
            expect(status.authenticated).toBe(true);
            expect(status.accessToken).toBe('test-token');
            expect(status.user).toBe('test@example.com');
        });

        it('should return unauthenticated when token is expired', () => {
            // Arrange
            const authService = new AuthService(mockConfig);
            const pastDate = new Date(Date.now() - 3600000); // 1 hour ago

            (authService as any).authResult = {
                authenticated: true,
                accessToken: 'expired-token',
                user: 'test@example.com',
                expiresOn: pastDate
            };

            // Act
            const status = authService.getStatus();

            // Assert
            expect(status.authenticated).toBe(false);
        });
    });

    describe('authenticateDeviceCode', () => {
        it('should authenticate successfully with device code flow', async () => {
            // Arrange
            const mockPCA = {
                acquireTokenByDeviceCode: jest.fn().mockResolvedValue({
                    accessToken: 'device-code-token',
                    account: { username: 'user@example.com' },
                    expiresOn: new Date(Date.now() + 3600000)
                })
            };

            (PublicClientApplication as jest.Mock).mockReturnValue(mockPCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'device_code' });

            // Act
            const result = await authService.authenticate();

            // Assert
            expect(result.authenticated).toBe(true);
            expect(result.accessToken).toBe('device-code-token');
            expect(result.user).toBe('user@example.com');
            expect(PublicClientApplication).toHaveBeenCalledWith({
                auth: {
                    clientId: 'test-client-id',
                    authority: 'https://login.microsoftonline.com/test-tenant-id'
                }
            });
            expect(mockPCA.acquireTokenByDeviceCode).toHaveBeenCalledWith(
                expect.objectContaining({
                    scopes: ['https://api.applicationinsights.io/.default'],
                    deviceCodeCallback: expect.any(Function)
                })
            );
        });

        it('should handle device code authentication failure', async () => {
            // Arrange
            const mockError = new Error('Device code auth failed');
            const mockPCA = {
                acquireTokenByDeviceCode: jest.fn().mockRejectedValue(mockError)
            };

            (PublicClientApplication as jest.Mock).mockReturnValue(mockPCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'device_code' });

            // Act & Assert
            await expect(authService.authenticate()).rejects.toThrow('Device code auth failed');
            expect(authService.getStatus().authenticated).toBe(false);
        });

        it('should call device code callback during authentication', async () => {
            // Arrange
            let capturedCallback: ((response: any) => void) | null = null;

            const mockPCA = {
                acquireTokenByDeviceCode: jest.fn().mockImplementation(async (request: DeviceCodeRequest) => {
                    capturedCallback = request.deviceCodeCallback;
                    return {
                        accessToken: 'token',
                        account: { username: 'user@example.com' },
                        expiresOn: new Date(Date.now() + 3600000)
                    };
                })
            };

            (PublicClientApplication as jest.Mock).mockReturnValue(mockPCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'device_code' });

            // Act
            await authService.authenticate();

            // Assert
            expect(capturedCallback).not.toBeNull();

            // Test callback
            const consoleSpy = jest.spyOn(console, 'log');
            capturedCallback!({ message: 'Test device code message' });
            expect(consoleSpy).toHaveBeenCalled();
        });
    });

    describe('authenticateClientCredentials', () => {
        it('should authenticate successfully with client credentials flow', async () => {
            // Arrange
            const mockCCA = {
                acquireTokenByClientCredential: jest.fn().mockResolvedValue({
                    accessToken: 'client-cred-token',
                    expiresOn: new Date(Date.now() + 3600000)
                })
            };

            (ConfidentialClientApplication as jest.Mock).mockReturnValue(mockCCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'client_credentials' });

            // Act
            const result = await authService.authenticate();

            // Assert
            expect(result.authenticated).toBe(true);
            expect(result.accessToken).toBe('client-cred-token');
            expect(result.user).toBe('ServicePrincipal:test-client-id');
            expect(ConfidentialClientApplication).toHaveBeenCalledWith({
                auth: {
                    clientId: 'test-client-id',
                    authority: 'https://login.microsoftonline.com/test-tenant-id',
                    clientSecret: 'test-secret'
                }
            });
            expect(mockCCA.acquireTokenByClientCredential).toHaveBeenCalledWith({
                scopes: ['https://api.applicationinsights.io/.default']
            });
        });

        it('should throw error when clientId is missing for client credentials flow', async () => {
            // Arrange
            const config = { ...mockConfig, authFlow: 'client_credentials' as const, clientId: undefined };
            const authService = new AuthService(config);

            // Act & Assert
            await expect(authService.authenticate()).rejects.toThrow(
                'Client credentials flow requires clientId and clientSecret'
            );
        });

        it('should throw error when clientSecret is missing for client credentials flow', async () => {
            // Arrange
            const config = { ...mockConfig, authFlow: 'client_credentials' as const, clientSecret: undefined };
            const authService = new AuthService(config);

            // Act & Assert
            await expect(authService.authenticate()).rejects.toThrow(
                'Client credentials flow requires clientId and clientSecret'
            );
        });

        it('should handle client credentials authentication failure', async () => {
            // Arrange
            const mockError = new Error('Client cred auth failed');
            const mockCCA = {
                acquireTokenByClientCredential: jest.fn().mockRejectedValue(mockError)
            };

            (ConfidentialClientApplication as jest.Mock).mockReturnValue(mockCCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'client_credentials' });

            // Act & Assert
            await expect(authService.authenticate()).rejects.toThrow('Client cred auth failed');
            expect(authService.getStatus().authenticated).toBe(false);
        });
    });

    describe('getAccessToken', () => {
        it('should return existing valid token', async () => {
            // Arrange
            const authService = new AuthService(mockConfig);
            const futureDate = new Date(Date.now() + 3600000);

            (authService as any).authResult = {
                authenticated: true,
                accessToken: 'existing-token',
                user: 'test@example.com',
                expiresOn: futureDate
            };

            // Act
            const token = await authService.getAccessToken();

            // Assert
            expect(token).toBe('existing-token');
        });

        it('should authenticate and return token when not authenticated', async () => {
            // Arrange
            const mockPCA = {
                acquireTokenByDeviceCode: jest.fn().mockResolvedValue({
                    accessToken: 'new-token',
                    account: { username: 'user@example.com' },
                    expiresOn: new Date(Date.now() + 3600000)
                })
            };

            (PublicClientApplication as jest.Mock).mockReturnValue(mockPCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'device_code' });

            // Act
            const token = await authService.getAccessToken();

            // Assert
            expect(token).toBe('new-token');
            expect(mockPCA.acquireTokenByDeviceCode).toHaveBeenCalled();
        });

        it('should throw error when authentication fails', async () => {
            // Arrange
            const mockPCA = {
                acquireTokenByDeviceCode: jest.fn().mockResolvedValue(null)
            };

            (PublicClientApplication as jest.Mock).mockReturnValue(mockPCA);

            const authService = new AuthService({ ...mockConfig, authFlow: 'device_code' });

            // Act & Assert
            await expect(authService.getAccessToken()).rejects.toThrow('Failed to acquire token');
        });
    });

    describe('clearAuth', () => {
        it('should clear authentication state', () => {
            // Arrange
            const authService = new AuthService(mockConfig);
            (authService as any).authResult = {
                authenticated: true,
                accessToken: 'token',
                user: 'user@example.com'
            };

            // Act
            authService.clearAuth();

            // Assert
            expect(authService.getStatus().authenticated).toBe(false);
        });
    });
});
