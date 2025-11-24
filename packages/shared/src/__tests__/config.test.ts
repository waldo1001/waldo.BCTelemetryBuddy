import { loadConfig, validateConfig, MCPConfig, Reference, resolveProfileInheritance, expandEnvironmentVariables } from '../config.js';

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

        it('should return error when tenantId is missing', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('BCTB_TENANT_ID is required (unless using azure_cli auth flow)');
        });

        it('should return error when applicationInsightsAppId is missing', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('BCTB_APP_INSIGHTS_ID is required');
        });

        it('should return error when kustoClusterUrl is missing', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('BCTB_KUSTO_URL is required');
        });

        it('should return error when clientId is missing for client_credentials flow', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('BCTB_CLIENT_ID is required for client_credentials auth flow');
        });

        it('should return error when clientSecret is missing for client_credentials flow', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('BCTB_CLIENT_SECRET is required for client_credentials auth flow');
        });

        it('should return multiple validation failures', () => {
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

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors.length).toBeGreaterThan(0);
            expect(errors).toContain('BCTB_APP_INSIGHTS_ID is required');
            expect(errors).toContain('BCTB_KUSTO_URL is required');
            expect(errors).toContain('BCTB_CLIENT_ID is required for client_credentials auth flow');
            expect(errors).toContain('BCTB_CLIENT_SECRET is required for client_credentials auth flow');
        });
    });

    describe('resolveProfileInheritance', () => {
        it('should return profile without inheritance', () => {
            const profiles = {
                prod: {
                    connectionName: 'Prod',
                    tenantId: 'tenant-123',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: 'app-123',
                    kustoClusterUrl: 'https://kusto.example.com',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                }
            };

            const resolved = resolveProfileInheritance(profiles, 'prod');

            expect(resolved).toEqual(profiles.prod);
            expect(resolved.extends).toBeUndefined();
        });

        it('should merge child profile over parent profile', () => {
            const profiles = {
                base: {
                    connectionName: 'Base',
                    tenantId: 'base-tenant',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: 'base-app',
                    kustoClusterUrl: 'https://base.kusto.com',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                },
                prod: {
                    extends: 'base',
                    connectionName: 'Prod Override',
                    applicationInsightsAppId: 'prod-app',
                    authFlow: 'device_code' as const,
                    tenantId: 'base-tenant',
                    kustoClusterUrl: 'https://base.kusto.com',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                }
            };

            const resolved = resolveProfileInheritance(profiles, 'prod');

            expect(resolved.connectionName).toBe('Prod Override');
            expect(resolved.applicationInsightsAppId).toBe('prod-app');
            expect(resolved.authFlow).toBe('device_code'); // Overridden
            expect(resolved.kustoClusterUrl).toBe('https://base.kusto.com');
            expect(resolved.tenantId).toBe('base-tenant');
            expect(resolved.extends).toBeUndefined(); // Removed after resolution
        });

        it('should throw error on circular inheritance', () => {
            const profiles = {
                a: {
                    extends: 'b',
                    connectionName: 'A',
                    tenantId: '',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: '',
                    kustoClusterUrl: '',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                },
                b: {
                    extends: 'a',
                    connectionName: 'B',
                    tenantId: '',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: '',
                    kustoClusterUrl: '',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                }
            };

            expect(() => resolveProfileInheritance(profiles, 'a')).toThrow('Circular profile inheritance detected: a');
        });

        it('should throw error if parent profile not found', () => {
            const profiles = {
                prod: {
                    extends: 'nonexistent',
                    connectionName: 'Prod',
                    tenantId: '',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: '',
                    kustoClusterUrl: '',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                }
            };

            expect(() => resolveProfileInheritance(profiles, 'prod')).toThrow("Profile 'nonexistent' not found");
        });

        it('should expand environment variables in resolved profile', () => {
            process.env.TEST_TENANT = 'test-tenant-id';
            process.env.TEST_APP = 'test-app-id';

            const profiles = {
                prod: {
                    connectionName: 'Prod',
                    tenantId: '${TEST_TENANT}',
                    authFlow: 'azure_cli' as const,
                    applicationInsightsAppId: '${TEST_APP}',
                    kustoClusterUrl: 'https://kusto.example.com',
                    cacheEnabled: true,
                    cacheTTLSeconds: 3600,
                    removePII: false,
                    port: 52345,
                    workspacePath: '/workspace',
                    queriesFolder: 'queries',
                    references: []
                }
            };

            const resolved = resolveProfileInheritance(profiles, 'prod');

            expect(resolved.tenantId).toBe('test-tenant-id');
            expect(resolved.applicationInsightsAppId).toBe('test-app-id');

            delete process.env.TEST_TENANT;
            delete process.env.TEST_APP;
        });
    });

    describe('expandEnvironmentVariables', () => {
        it('should expand environment variables in strings', () => {
            process.env.TEST_VAR = 'test-value';

            const config = {
                tenantId: '${TEST_VAR}',
                appId: 'app-${TEST_VAR}'
            };

            const expanded = expandEnvironmentVariables(config);

            expect(expanded.tenantId).toBe('test-value');
            expect(expanded.appId).toBe('app-test-value');

            delete process.env.TEST_VAR;
        });

        it('should handle missing environment variables', () => {
            const config = {
                tenantId: '${NONEXISTENT_VAR}'
            };

            const expanded = expandEnvironmentVariables(config);

            expect(expanded.tenantId).toBe('');
        });

        it('should expand nested objects', () => {
            process.env.TEST_VAR = 'nested-value';

            const config = {
                nested: {
                    field: '${TEST_VAR}'
                }
            };

            const expanded = expandEnvironmentVariables(config);

            expect(expanded.nested.field).toBe('nested-value');

            delete process.env.TEST_VAR;
        });

        it('should handle arrays', () => {
            process.env.TEST_VAR = 'array-value';

            const config = ['${TEST_VAR}', 'static'];

            const expanded = expandEnvironmentVariables(config);

            expect(expanded[0]).toBe('array-value');
            expect(expanded[1]).toBe('static');

            delete process.env.TEST_VAR;
        });

        it('should not modify non-string values', () => {
            const config = {
                number: 123,
                boolean: true,
                null: null
            };

            const expanded = expandEnvironmentVariables(config);

            expect(expanded.number).toBe(123);
            expect(expanded.boolean).toBe(true);
            expect(expanded.null).toBe(null);
        });
    });
});
