import { loadConfig, validateConfig, MCPConfig, Reference } from '../config.js';

describe('Configuration Module', () => {
    // Store original environment
    const originalEnv = process.env;

    beforeEach(() => {
        // Reset environment before each test
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        // Restore original environment
        process.env = originalEnv;
    });

    describe('loadConfig', () => {
        it('should load configuration from environment variables', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';
            process.env.BCTB_CONNECTION_NAME = 'TestConnection';
            process.env.BCTB_TENANT_ID = 'test-tenant-id';
            process.env.BCTB_CLIENT_ID = 'test-client-id';
            process.env.BCTB_CLIENT_SECRET = 'test-secret';
            process.env.BCTB_AUTH_FLOW = 'client_credentials';
            process.env.BCTB_APP_INSIGHTS_ID = 'test-app-id';
            process.env.BCTB_KUSTO_URL = 'https://api.applicationinsights.io';
            process.env.BCTB_CACHE_ENABLED = 'true';
            process.env.BCTB_CACHE_TTL = '7200';
            process.env.BCTB_REMOVE_PII = 'true';
            process.env.BCTB_PORT = '12345';
            process.env.BCTB_REFERENCES = JSON.stringify([
                { name: 'Test Ref', type: 'github', url: 'https://github.com/test/repo', enabled: true }
            ]);

            // Act
            const config = loadConfig();

            // Assert
            expect(config).toMatchObject({
                connectionName: 'TestConnection',
                tenantId: 'test-tenant-id',
                clientId: 'test-client-id',
                clientSecret: 'test-secret',
                authFlow: 'client_credentials',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 7200,
                removePII: true,
                port: 12345,
                workspacePath: '/test/workspace'
            });
            expect(config.references).toHaveLength(1);
            expect(config.references[0].name).toBe('Test Ref');
        });

        it('should use default values when optional env vars are missing', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';

            // Act
            const config = loadConfig();

            // Assert
            expect(config).toMatchObject({
                connectionName: 'Default',
                tenantId: '',
                authFlow: 'azure_cli', // Default changed to azure_cli
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                references: []
            });
        });

        it('should throw error when BCTB_WORKSPACE_PATH is missing', () => {
            // Arrange
            delete process.env.BCTB_WORKSPACE_PATH;

            // Act & Assert
            expect(() => loadConfig()).toThrow('BCTB_WORKSPACE_PATH environment variable is required');
        });

        it('should handle cache disabled via env var', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';
            process.env.BCTB_CACHE_ENABLED = 'false';

            // Act
            const config = loadConfig();

            // Assert
            expect(config.cacheEnabled).toBe(false);
        });

        it('should handle invalid JSON in references gracefully', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';
            process.env.BCTB_REFERENCES = 'invalid-json{{{';

            // Capture console.error
            const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

            // Act
            const config = loadConfig();

            // Assert
            expect(config.references).toEqual([]);
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                'Failed to parse references:',
                expect.any(Error)
            );

            // Cleanup
            consoleErrorSpy.mockRestore();
        });

        it('should handle non-array references JSON', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';
            process.env.BCTB_REFERENCES = JSON.stringify({ notAnArray: true });

            // Act
            const config = loadConfig();

            // Assert
            expect(config.references).toEqual([]);
        });
    });

    describe('validateConfig', () => {
        it('should validate required fields successfully', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'device_code',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).not.toThrow();
        });

        it('should throw error when tenantId is missing', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: '',
                authFlow: 'device_code',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('BCTB_TENANT_ID is required (unless using azure_cli auth flow)');
        });

        it('should throw error when applicationInsightsAppId is missing', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'device_code',
                applicationInsightsAppId: '',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('BCTB_APP_INSIGHTS_ID is required');
        });

        it('should throw error when kustoClusterUrl is missing', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'device_code',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: '',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('BCTB_KUSTO_URL is required');
        });

        it('should throw error when clientId is missing for client_credentials flow', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'client_credentials',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('BCTB_CLIENT_ID is required for client_credentials auth flow');
        });

        it('should throw error when clientSecret is missing for client_credentials flow', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                clientId: 'test-client-id',
                authFlow: 'client_credentials',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://api.applicationinsights.io',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('BCTB_CLIENT_SECRET is required for client_credentials auth flow');
        });

        it('should throw error with multiple validation failures', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: '',
                authFlow: 'client_credentials',
                applicationInsightsAppId: '',
                kustoClusterUrl: '',
                cacheEnabled: true,
                cacheTTLSeconds: 3600,
                removePII: false,
                port: 52345,
                workspacePath: '/test/workspace',
                queriesFolder: 'queries',
                references: []
            };

            // Act & Assert
            expect(() => validateConfig(config)).toThrow('Configuration validation failed:');
            expect(() => validateConfig(config)).toThrow('BCTB_TENANT_ID is required');
            expect(() => validateConfig(config)).toThrow('BCTB_APP_INSIGHTS_ID is required');
            expect(() => validateConfig(config)).toThrow('BCTB_KUSTO_URL is required');
            expect(() => validateConfig(config)).toThrow('BCTB_CLIENT_ID is required');
            expect(() => validateConfig(config)).toThrow('BCTB_CLIENT_SECRET is required');
        });
    });
});
