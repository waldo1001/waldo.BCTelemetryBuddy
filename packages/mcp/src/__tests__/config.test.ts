import { loadConfig, validateConfig, loadConfigFromFile, initConfig, MCPConfig, Reference } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('Configuration Module', () => {
    // Store original environment
    const originalEnv = process.env;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        // Mock console.error to suppress output during tests
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Reset environment before each test
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
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

        it('should use current directory when BCTB_WORKSPACE_PATH is missing', () => {
            // Arrange
            delete process.env.BCTB_WORKSPACE_PATH;

            // Act
            const config = loadConfig();

            // Assert
            expect(config.workspacePath).toBe(process.cwd());
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
        it('should return error when workspacePath is missing', () => {
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
                workspacePath: '', // Empty workspace path
                queriesFolder: 'queries',
                references: []
            };

            // Act
            const errors = validateConfig(config);

            // Assert
            expect(errors).toContain('workspacePath is required - set it in your config file or via BCTB_WORKSPACE_PATH environment variable');
        });

        it('should not require tenantId when using azure_cli auth flow', () => {
            // Arrange
            const config: MCPConfig = {
                connectionName: 'Test',
                tenantId: '', // Empty tenantId
                authFlow: 'azure_cli', // azure_cli doesn't require tenantId
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
            // Should not have tenantId error since azure_cli doesn't need it
            expect(errors).not.toContain('BCTB_TENANT_ID is required (unless using azure_cli auth flow)');
        });

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

    describe('loadConfigFromFile', () => {
        let testConfigDir: string;

        beforeEach(() => {
            // Create unique test directory per test to avoid conflicts
            // Use mkdtempSync for secure temp directory creation (mode 0o700)
            testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-test-config-'));
        });

        afterEach(() => {
            // Clean up
            if (fs.existsSync(testConfigDir)) {
                fs.rmSync(testConfigDir, { recursive: true, force: true });
            }
        }); it('should load single profile config from file', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                connectionName: 'Test Connection',
                tenantId: 'test-tenant',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: '/test/workspace',
                queriesFolder: 'queries'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Test Connection');
            expect(loaded!.tenantId).toBe('test-tenant');
            expect(loaded!.authFlow).toBe('azure_cli');
            expect(loaded!.applicationInsightsAppId).toBe('test-app-id');
        });

        it('should load multi-profile config with default profile', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'device_code',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    },
                    staging: {
                        connectionName: 'Staging',
                        tenantId: 'staging-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'staging-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/staging/workspace',
                        queriesFolder: 'queries'
                    }
                },
                defaultProfile: 'production'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Production');
            expect(loaded!.tenantId).toBe('prod-tenant');
        });

        it('should load specific profile when profileName is provided', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'device_code',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    },
                    staging: {
                        connectionName: 'Staging',
                        tenantId: 'staging-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'staging-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/staging/workspace',
                        queriesFolder: 'queries'
                    }
                },
                defaultProfile: 'production'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath, 'staging');

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Staging');
            expect(loaded!.tenantId).toBe('staging-tenant');
        });

        it('should handle profile inheritance with extends', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    base: {
                        authFlow: 'azure_cli',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/base/workspace',
                        queriesFolder: 'queries',
                        cacheEnabled: true,
                        cacheTTLSeconds: 3600
                    },
                    production: {
                        extends: 'base',
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        applicationInsightsAppId: 'prod-app-id'
                    }
                },
                defaultProfile: 'production'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert - should have both base and child properties
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Production');
            expect(loaded!.tenantId).toBe('prod-tenant');
            expect(loaded!.authFlow).toBe('azure_cli'); // Inherited from base
            expect(loaded!.kustoClusterUrl).toBe('https://ade.applicationinsights.io'); // Inherited
            expect(loaded!.cacheEnabled).toBe(true); // Inherited
        });

        it('should expand environment variables in config', () => {
            // Arrange
            process.env.TEST_TENANT_ID = 'env-tenant-id';
            process.env.TEST_APP_ID = 'env-app-id';

            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                connectionName: 'Test',
                tenantId: '${TEST_TENANT_ID}',
                authFlow: 'azure_cli',
                applicationInsightsAppId: '${TEST_APP_ID}',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: '/test/workspace',
                queriesFolder: 'queries'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.tenantId).toBe('env-tenant-id');
            expect(loaded!.applicationInsightsAppId).toBe('env-app-id');

            // Cleanup
            delete process.env.TEST_TENANT_ID;
            delete process.env.TEST_APP_ID;
        });

        it('should merge top-level cache settings with profile', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    }
                },
                defaultProfile: 'production',
                cache: {
                    enabled: false,
                    ttlSeconds: 7200
                },
                sanitize: {
                    removePII: true
                }
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.cacheEnabled).toBe(false);
            expect(loaded!.cacheTTLSeconds).toBe(7200);
            expect(loaded!.removePII).toBe(true);
        });

        it('should return null when config file not found', () => {
            // Arrange
            const originalCwd = process.cwd();
            const emptyDir = path.join(testConfigDir, 'empty-nowhere');
            fs.mkdirSync(emptyDir, { recursive: true });
            process.chdir(emptyDir); // Change to directory without any config
            delete process.env.BCTB_WORKSPACE_PATH; // Ensure no workspace path

            // Act
            const result = loadConfigFromFile();

            // Assert
            expect(result).toBeNull();

            // Cleanup
            process.chdir(originalCwd);
        });

        it('should throw error when profile not found', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    }
                },
                defaultProfile: 'production'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act & Assert
            expect(() => loadConfigFromFile(configPath, 'nonexistent')).toThrow("Profile 'nonexistent' not found");
        });

        it('should throw error when no profile specified and no default', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    }
                }
                // No defaultProfile
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act & Assert
            expect(() => loadConfigFromFile(configPath)).toThrow('No profile specified');
        });

        it('should detect circular profile inheritance', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    profileA: {
                        extends: 'profileB',
                        connectionName: 'A'
                    },
                    profileB: {
                        extends: 'profileA',
                        connectionName: 'B'
                    }
                },
                defaultProfile: 'profileA'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act & Assert
            expect(() => loadConfigFromFile(configPath)).toThrow('Circular profile inheritance detected');
        });

        it('should use BCTB_PROFILE env var when no profile specified', () => {
            // Arrange
            process.env.BCTB_PROFILE = 'staging';
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    production: {
                        connectionName: 'Production',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/prod/workspace',
                        queriesFolder: 'queries'
                    },
                    staging: {
                        connectionName: 'Staging',
                        tenantId: 'staging-tenant',
                        authFlow: 'azure_cli',
                        applicationInsightsAppId: 'staging-app-id',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/staging/workspace',
                        queriesFolder: 'queries'
                    }
                },
                defaultProfile: 'production'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Staging');

            // Cleanup
            delete process.env.BCTB_PROFILE;
        });

        it('should discover config in current directory', () => {
            // Arrange
            const originalCwd = process.cwd();
            process.chdir(testConfigDir);

            const config = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: '/test/workspace',
                queriesFolder: 'queries'
            };
            fs.writeFileSync('.bctb-config.json', JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile();

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Test');

            // Cleanup
            process.chdir(originalCwd);
        });

        it('should discover config in BCTB_WORKSPACE_PATH', () => {
            // Arrange
            const originalCwd = process.cwd();
            const emptyDir = path.join(testConfigDir, 'empty');
            fs.mkdirSync(emptyDir, { recursive: true });
            process.chdir(emptyDir); // Change to directory without .bctb-config.json

            const workspacePath = path.join(testConfigDir, 'workspace');
            fs.mkdirSync(workspacePath, { recursive: true });
            process.env.BCTB_WORKSPACE_PATH = workspacePath;

            const config = {
                connectionName: 'Workspace Config',
                tenantId: 'workspace-tenant',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'workspace-app-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: workspacePath,
                queriesFolder: 'queries'
            };
            fs.writeFileSync(path.join(workspacePath, '.bctb-config.json'), JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile();

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Workspace Config');

            // Cleanup
            process.chdir(originalCwd);
            delete process.env.BCTB_WORKSPACE_PATH;
        });

        it('should throw error when parent profile not found in inheritance chain', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    child: {
                        extends: 'nonexistent-parent',
                        connectionName: 'Child'
                    }
                },
                defaultProfile: 'child'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act & Assert
            expect(() => loadConfigFromFile(configPath)).toThrow("Profile 'nonexistent-parent' not found");
        });

        it('should handle deep merge with null values', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                profiles: {
                    base: {
                        authFlow: 'azure_cli',
                        kustoClusterUrl: 'https://ade.applicationinsights.io',
                        workspacePath: '/base/workspace',
                        queriesFolder: 'queries',
                        customField: null // Null value to test null check in deepMerge
                    },
                    child: {
                        extends: 'base',
                        connectionName: 'Child',
                        tenantId: 'child-tenant',
                        applicationInsightsAppId: 'child-app-id',
                        customField: { nested: 'value' } // Override null with object
                    }
                },
                defaultProfile: 'child'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.connectionName).toBe('Child');
            expect(loaded!.authFlow).toBe('azure_cli'); // Inherited
            expect((loaded as any).customField).toEqual({ nested: 'value' }); // Overridden
        });

        it('should expand ${workspaceFolder} placeholder to BCTB_WORKSPACE_PATH', () => {
            // Arrange
            process.env.BCTB_WORKSPACE_PATH = '/my/workspace/path';

            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: '${workspaceFolder}/queries', // Use placeholder
                queriesFolder: 'queries'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.workspacePath).toBe('/my/workspace/path/queries');
            expect(consoleErrorSpy).toHaveBeenCalledWith(
                expect.stringContaining('Expanding ${workspaceFolder} to: /my/workspace/path')
            );

            // Cleanup
            delete process.env.BCTB_WORKSPACE_PATH;
        });

        it('should expand ${workspaceFolder} to cwd when BCTB_WORKSPACE_PATH not set', () => {
            // Arrange
            delete process.env.BCTB_WORKSPACE_PATH;
            const expectedPath = process.cwd();

            const configPath = path.join(testConfigDir, '.bctb-config.json');
            const config = {
                connectionName: 'Test',
                tenantId: 'test-tenant',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: '${workspaceFolder}', // Use placeholder
                queriesFolder: 'queries'
            };
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

            // Act
            const loaded = loadConfigFromFile(configPath);

            // Assert
            expect(loaded).not.toBeNull();
            expect(loaded!.workspacePath).toBe(expectedPath);
        });
    });

    describe('initConfig', () => {
        let testConfigDir: string;

        beforeEach(() => {
            // Create unique test directory per test to avoid conflicts
            // Use mkdtempSync for secure temp directory creation (mode 0o700)
            testConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-test-init-'));
        });

        afterEach(() => {
            // Clean up
            if (fs.existsSync(testConfigDir)) {
                fs.rmSync(testConfigDir, { recursive: true, force: true });
            }
        });

        it('should create config file with template', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');

            // Act
            initConfig(configPath);

            // Assert
            expect(fs.existsSync(configPath)).toBe(true);
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);

            expect(config.profiles).toBeDefined();
            expect(config.profiles.default).toBeDefined();
            expect(config.defaultProfile).toBe('default');
            expect(config.cache).toBeDefined();
            expect(config.sanitize).toBeDefined();
            expect(config.references).toBeDefined();
        });

        it('should create valid config structure', () => {
            // Arrange
            const configPath = path.join(testConfigDir, '.bctb-config.json');

            // Act
            initConfig(configPath);

            // Assert
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);

            expect(config.profiles.default.authFlow).toBe('azure_cli');
            expect(config.cache.enabled).toBe(true);
            expect(config.cache.ttlSeconds).toBe(3600);
            expect(config.sanitize.removePII).toBe(false);
            expect(Array.isArray(config.references)).toBe(true);
        });
    });
});
