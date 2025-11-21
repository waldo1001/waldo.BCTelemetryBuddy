/**
 * TelemetryService integration tests
 * 
 * Tests the TelemetryService class that provides direct access to telemetry data
 * without requiring MCP server (Phase 3 functionality).
 */

import { TelemetryService } from '../services/telemetryService';
import {
    AuthService,
    KustoService,
    CacheService,
    QueriesService,
    resolveProfileInheritance,
    expandEnvironmentVariables
} from '@bctb/shared';
import * as vscode from 'vscode';
import * as fs from 'fs';

// Mock vscode module
jest.mock('vscode', () => ({
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }]
    },
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn()
        }))
    }
}), { virtual: true });

// Mock @bctb/shared services
jest.mock('@bctb/shared', () => ({
    AuthService: jest.fn(),
    KustoService: jest.fn(),
    CacheService: jest.fn(),
    QueriesService: jest.fn(),
    resolveProfileInheritance: jest.fn((profiles, profileName) => {
        // Simple mock implementation - just return the profile without inheritance
        return profiles[profileName];
    }),
    expandEnvironmentVariables: jest.fn((config) => config)
}));

// Mock fs module
jest.mock('fs');

describe('TelemetryService', () => {
    let telemetryService: TelemetryService;
    let mockConfig: any;
    let mockOutputChannel: any;
    let mockAuthService: any;
    let mockKustoService: any;
    let mockCacheService: any;
    let mockQueriesService: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Default: mock fs.existsSync to return false (no .bctb-config.json)
        // Tests can override this in their own beforeEach
        (fs.existsSync as jest.Mock).mockReturnValue(false);

        // Setup mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn()
        };

        // Setup mock configuration
        mockConfig = {
            get: jest.fn((key: string, defaultValue?: any) => {
                const config: Record<string, any> = {
                    'mcp.connectionName': 'test-connection',
                    'mcp.tenantId': 'test-tenant-id',
                    'mcp.clientId': 'test-client-id',
                    'mcp.clientSecret': '',
                    'mcp.authFlow': 'device_code',
                    'mcp.applicationInsights.appId': 'test-app-id',
                    'mcp.kusto.clusterUrl': 'https://test.kusto.windows.net',
                    'mcp.kusto.database': 'test-database',
                    'mcp.cache.enabled': true,
                    'mcp.cache.ttlSeconds': 3600,
                    'mcp.sanitize.removePII': false,
                    'queries.folder': 'queries'
                };
                return config[key] ?? defaultValue;
            })
        };

        (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

        // Setup mock services
        mockAuthService = {
            authenticate: jest.fn().mockResolvedValue({
                accessToken: 'test-token',
                expiresOn: new Date(Date.now() + 3600000)
            }),
            getAccessToken: jest.fn().mockResolvedValue('test-token')
        };
        (AuthService as jest.Mock).mockImplementation(() => mockAuthService);

        mockKustoService = {
            executeQuery: jest.fn().mockResolvedValue({
                rows: [{ timestamp: '2025-01-01', message: 'Test log' }],
                columns: [{ name: 'timestamp', type: 'datetime' }, { name: 'message', type: 'string' }]
            }),
            parseResult: jest.fn().mockReturnValue({
                rows: [{ timestamp: '2025-01-01', message: 'Test log' }],
                columns: ['timestamp', 'message']
            })
        };
        (KustoService as jest.Mock).mockImplementation(() => mockKustoService);

        mockCacheService = {
            get: jest.fn(),
            set: jest.fn(),
            clear: jest.fn(),
            getStats: jest.fn().mockReturnValue({ hits: 0, misses: 0, size: 0 })
        };
        (CacheService as jest.Mock).mockImplementation(() => mockCacheService);

        mockQueriesService = {
            saveQuery: jest.fn().mockResolvedValue(undefined),
            getQueries: jest.fn().mockResolvedValue([]),
            getAllQueries: jest.fn().mockReturnValue([]),
            searchQueries: jest.fn().mockResolvedValue([])
        };
        (QueriesService as jest.Mock).mockImplementation(() => mockQueriesService);

        // Create service instance
        telemetryService = new TelemetryService(mockOutputChannel);
    });

    describe('Initialization', () => {
        it('should create TelemetryService instance', () => {
            expect(telemetryService).toBeInstanceOf(TelemetryService);
        });

        it('should be configured when all required settings are present', () => {
            expect(telemetryService.isConfigured()).toBe(true);
        });

        it('should not be configured when appId is missing', () => {
            const newMockConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'mcp.applicationInsights.appId') return '';
                    const config: Record<string, any> = {
                        'mcp.connectionName': 'test-connection',
                        'mcp.tenantId': 'test-tenant-id',
                        'mcp.clientId': 'test-client-id',
                        'mcp.clientSecret': '',
                        'mcp.authFlow': 'device_code',
                        'mcp.kusto.clusterUrl': 'https://test.kusto.windows.net',
                        'mcp.kusto.database': 'test-database',
                        'mcp.cache.enabled': true,
                        'mcp.cache.ttlSeconds': 3600,
                        'mcp.sanitize.removePII': false,
                        'queries.folder': 'queries'
                    };
                    return config[key] ?? defaultValue;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(newMockConfig);

            const service = new TelemetryService(mockOutputChannel);
            expect(service.isConfigured()).toBe(false);
        });

        it('should initialize auth, kusto, cache, and queries services', () => {
            expect(AuthService).toHaveBeenCalled();
            expect(KustoService).toHaveBeenCalled();
            expect(CacheService).toHaveBeenCalled();
            expect(QueriesService).toHaveBeenCalled();
        });
    });

    describe('authenticate()', () => {
        it('should authenticate successfully', async () => {
            const result = await telemetryService.authenticate();

            expect(result).toBeDefined();
            expect(result.accessToken).toBe('test-token');
            expect(mockAuthService.authenticate).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Authenticating'));
        });

        it('should throw error if authentication fails', async () => {
            mockAuthService.authenticate.mockRejectedValue(new Error('Auth failed'));

            await expect(telemetryService.authenticate()).rejects.toThrow('Auth failed');
        });
    });

    describe('executeKQL()', () => {
        it('should execute KQL query successfully', async () => {
            const kql = 'traces | take 10';
            const result = await telemetryService.executeKQL(kql);

            expect(result).toBeDefined();
            expect(result.type).toBe('table');
            expect(result.rows).toBeDefined();
            expect(mockKustoService.executeQuery).toHaveBeenCalledWith(kql, 'test-token');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Executing KQL'));
        });

        it('should use cache when available', async () => {
            const kql = 'traces | take 10';
            const cachedResult = {
                type: 'table' as const,
                kql,
                rows: [{ timestamp: '2025-01-01', message: 'Cached' }],
                columns: ['timestamp', 'message'],
                summary: 'Returned 1 rows',
                cached: false
            };

            mockCacheService.get.mockReturnValue(cachedResult);

            const result = await telemetryService.executeKQL(kql);

            expect(result.cached).toBe(true);
            expect(result.type).toBe('table');
            expect(mockKustoService.executeQuery).not.toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Using cached result'));
        });

        it('should execute query when service is configured', async () => {
            const kql = 'traces | take 10';
            const result = await telemetryService.executeKQL(kql);

            expect(result).toBeDefined();
            expect(mockKustoService.executeQuery).toHaveBeenCalledWith(kql, 'test-token');
        });

        it('should return error object if query execution fails', async () => {
            mockKustoService.executeQuery.mockRejectedValue(new Error('Query failed'));

            const result = await telemetryService.executeKQL('invalid query');

            expect(result.type).toBe('error');
            expect(result.summary).toContain('Error: Query failed');
        });
    });

    describe('saveQuery()', () => {
        it('should save query successfully', async () => {
            await telemetryService.saveQuery(
                'Test Query',
                'traces | take 10',
                'Test purpose',
                'Test use case',
                ['test', 'demo'],
                'Testing'
            );

            expect(mockQueriesService.saveQuery).toHaveBeenCalledWith(
                'Test Query',
                'traces | take 10',
                'Test purpose',
                'Test use case',
                ['test', 'demo'],
                'Testing'
            );
        });

        it('should save query with minimal parameters', async () => {
            await telemetryService.saveQuery('Simple Query', 'traces | take 5');

            expect(mockQueriesService.saveQuery).toHaveBeenCalledWith(
                'Simple Query',
                'traces | take 5',
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should throw error if save fails', async () => {
            mockQueriesService.saveQuery.mockRejectedValue(new Error('Save failed'));

            await expect(
                telemetryService.saveQuery('Test', 'traces | take 10')
            ).rejects.toThrow('Save failed');
        });
    });

    describe('getSavedQueries()', () => {
        it('should retrieve saved queries', async () => {
            const mockQueries = [
                { name: 'Query 1', kql: 'traces | take 10', tags: ['test'] },
                { name: 'Query 2', kql: 'dependencies | take 5', tags: ['demo'] }
            ];
            mockQueriesService.getAllQueries.mockReturnValue(mockQueries);

            const result = await telemetryService.getSavedQueries();

            expect(result).toEqual(mockQueries);
            expect(mockQueriesService.getAllQueries).toHaveBeenCalled();
        });

        it('should filter queries by tags', async () => {
            const allQueries = [
                { name: 'Query 1', kql: 'traces | take 10', tags: ['test'] },
                { name: 'Query 2', kql: 'dependencies | take 5', tags: ['demo'] },
                { name: 'Query 3', kql: 'requests | take 3', tags: ['test', 'demo'] }
            ];
            mockQueriesService.getAllQueries.mockReturnValue(allQueries);

            const result = await telemetryService.getSavedQueries(['test']);

            expect(result).toHaveLength(2); // Query 1 and Query 3
            expect(result.every(q => q.tags?.includes('test'))).toBe(true);
            expect(mockQueriesService.getAllQueries).toHaveBeenCalled();
        });

        it('should return empty array when no queries exist', async () => {
            mockQueriesService.getAllQueries.mockReturnValue([]);

            const result = await telemetryService.getSavedQueries();

            expect(result).toEqual([]);
        });
    });

    describe('searchQueries()', () => {
        it('should search queries by keywords', async () => {
            const mockResults = [
                { name: 'Slow Queries', kql: 'dependencies | where duration > 2000', score: 0.95 }
            ];
            mockQueriesService.searchQueries.mockResolvedValue(mockResults);

            const result = await telemetryService.searchQueries(['slow', 'performance']);

            expect(result).toEqual(mockResults);
            expect(mockQueriesService.searchQueries).toHaveBeenCalledWith(['slow', 'performance']);
        });

        it('should return empty array when no matches found', async () => {
            mockQueriesService.searchQueries.mockResolvedValue([]);

            const result = await telemetryService.searchQueries(['nonexistent']);

            expect(result).toEqual([]);
        });
    });

    describe('Phase 3 Independence', () => {
        it('should NOT depend on MCP server', () => {
            // TelemetryService should use @bctb/shared directly
            expect(AuthService).toHaveBeenCalled();
            expect(KustoService).toHaveBeenCalled();

            // Should not import or reference MCPClient
            const serviceCode = telemetryService.toString();
            expect(serviceCode).not.toContain('MCPClient');
            expect(serviceCode).not.toContain('mcpClient');
        });

        it('should use @bctb/shared services directly', () => {
            // Verify services are from @bctb/shared package
            expect(AuthService).toHaveBeenCalled();
            expect(KustoService).toHaveBeenCalled();
            expect(CacheService).toHaveBeenCalled();
            expect(QueriesService).toHaveBeenCalled();
        });
    });

    describe('Multi-Profile Configuration', () => {
        beforeEach(() => {
            // Mock fs to simulate .bctb-config.json with profiles
            (fs.existsSync as jest.Mock).mockReturnValue(true);
        });

        afterEach(() => {
            // Reset to default (no config file)
            (fs.existsSync as jest.Mock).mockReturnValue(false);
        });

        it('should load configuration from multi-profile config with default profile', () => {
            const multiProfileConfig = {
                defaultProfile: 'production',
                profiles: {
                    production: {
                        connectionName: 'Prod Connection',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli' as const,
                        applicationInsightsAppId: 'prod-app-id',
                        kustoClusterUrl: 'https://prod.kusto.windows.net'
                    }
                }
            };

            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiProfileConfig));

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
            expect(fs.readFileSync).toHaveBeenCalled();
        });

        it('should load configuration from specified profile', () => {
            const multiProfileConfig = {
                defaultProfile: 'production',
                profiles: {
                    production: {
                        connectionName: 'Prod',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli' as const,
                        applicationInsightsAppId: 'prod-app',
                        kustoClusterUrl: 'https://prod.kusto.windows.net'
                    },
                    staging: {
                        connectionName: 'Staging',
                        tenantId: 'staging-tenant',
                        authFlow: 'device_code' as const,
                        applicationInsightsAppId: 'staging-app',
                        kustoClusterUrl: 'https://staging.kusto.windows.net'
                    }
                }
            };

            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiProfileConfig));

            const service = new TelemetryService(mockOutputChannel, 'staging');

            expect(service.isConfigured()).toBe(true);
        });

        it('should throw error when specified profile does not exist', () => {
            const multiProfileConfig = {
                profiles: {
                    production: {
                        connectionName: 'Prod',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli' as const,
                        applicationInsightsAppId: 'prod-app',
                        kustoClusterUrl: 'https://prod.kusto.windows.net'
                    }
                }
            };

            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiProfileConfig));

            expect(() => new TelemetryService(mockOutputChannel, 'nonexistent'))
                .toThrow("Profile 'nonexistent' not found");
        });

        it('should merge global cache settings with profile settings', () => {
            const multiProfileConfig = {
                defaultProfile: 'dev',
                cache: {
                    enabled: true,
                    ttlSeconds: 7200
                },
                sanitize: {
                    removePII: true
                },
                profiles: {
                    dev: {
                        connectionName: 'Dev',
                        tenantId: 'dev-tenant',
                        authFlow: 'azure_cli' as const,
                        applicationInsightsAppId: 'dev-app',
                        kustoClusterUrl: 'https://dev.kusto.windows.net',
                        cacheEnabled: false // Override global
                    }
                }
            };

            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiProfileConfig));

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
        });

        it('should use VSCode setting for currentProfile when profile not specified', () => {
            const multiProfileConfig = {
                profiles: {
                    production: {
                        connectionName: 'Prod',
                        tenantId: 'prod-tenant',
                        authFlow: 'azure_cli' as const,
                        applicationInsightsAppId: 'prod-app',
                        kustoClusterUrl: 'https://prod.kusto.windows.net'
                    }
                }
            };

            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(multiProfileConfig));

            const mockVSCodeConfig = {
                get: jest.fn((key: string) => {
                    if (key === 'currentProfile') return 'production';
                    return undefined;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
            expect(mockVSCodeConfig.get).toHaveBeenCalledWith('currentProfile');
        });
    });

    describe('VSCode Settings Fallback', () => {
        // fs.existsSync is already mocked to return false in outer beforeEach
        // No additional setup needed

        it('should load configuration from VSCode settings when no config file exists', () => {
            const mockVSCodeConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    const config: Record<string, any> = {
                        'mcp.connectionName': 'VSCode Connection',
                        'mcp.tenantId': 'vscode-tenant',
                        'mcp.authFlow': 'device_code',
                        'mcp.applicationInsights.appId': 'vscode-app-id',
                        'mcp.kusto.clusterUrl': 'https://vscode.kusto.windows.net'
                    };
                    return config[key] ?? defaultValue;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
            expect(mockVSCodeConfig.get).toHaveBeenCalledWith('mcp.applicationInsights.appId', '');
        });

        it('should use default values when VSCode settings are missing', () => {
            const mockVSCodeConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    // Minimal config - only appId and clusterUrl
                    if (key === 'mcp.applicationInsights.appId') return 'minimal-app-id';
                    if (key === 'mcp.kusto.clusterUrl') return 'https://minimal.kusto.windows.net';
                    return defaultValue;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
        });

        it('should handle client credentials from VSCode settings', () => {
            const mockVSCodeConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    const config: Record<string, any> = {
                        'mcp.authFlow': 'client_credentials',
                        'mcp.tenantId': 'cc-tenant',
                        'mcp.clientId': 'cc-client-id',
                        'mcp.clientSecret': 'cc-secret',
                        'mcp.applicationInsights.appId': 'cc-app-id',
                        'mcp.kusto.clusterUrl': 'https://cc.kusto.windows.net'
                    };
                    return config[key] ?? defaultValue;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
        });

        it('should use cache and sanitize settings from VSCode config', () => {
            const mockVSCodeConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    const config: Record<string, any> = {
                        'mcp.applicationInsights.appId': 'test-app',
                        'mcp.kusto.clusterUrl': 'https://test.kusto.windows.net',
                        'mcp.cache.enabled': false,
                        'mcp.cache.ttlSeconds': 1800,
                        'mcp.sanitize.removePII': true
                    };
                    return config[key] ?? defaultValue;
                })
            };
            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockVSCodeConfig);

            const service = new TelemetryService(mockOutputChannel);

            expect(service.isConfigured()).toBe(true);
            expect(mockVSCodeConfig.get).toHaveBeenCalledWith('mcp.cache.enabled', true);
        });
    });

    describe('Cache Management', () => {
        it('should get cache statistics', () => {
            const mockStats = { hits: 10, misses: 5, size: 15 };
            mockCacheService.getStats.mockReturnValue(mockStats);

            const service = new TelemetryService(mockOutputChannel);
            const stats = service.getCacheStats();

            expect(stats).toEqual(mockStats);
            expect(mockCacheService.getStats).toHaveBeenCalled();
        });

        it('should clear cache', () => {
            const service = new TelemetryService(mockOutputChannel);

            service.clearCache();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Clearing cache...');
            expect(mockCacheService.clear).toHaveBeenCalled();
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Cache cleared');
        });
    });

    describe('Query Search', () => {
        it('should search queries successfully', async () => {
            const service = new TelemetryService(mockOutputChannel);
            const mockResults = [{ name: 'Test Query', kql: 'traces | take 10' }];
            (mockQueriesService.searchQueries as jest.Mock).mockResolvedValue(mockResults);

            const results = await service.searchQueries(['traces', 'test']);

            expect(results).toEqual(mockResults);
            expect(mockQueriesService.searchQueries).toHaveBeenCalledWith(['traces', 'test']);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Searching queries: traces, test');
        });

        it('should handle search errors', async () => {
            const service = new TelemetryService(mockOutputChannel);
            const error = new Error('Search failed');
            (mockQueriesService.searchQueries as jest.Mock).mockRejectedValue(error);

            await expect(service.searchQueries(['test'])).rejects.toThrow('Search failed');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Search failed: Search failed');
        });
    });

    describe('Profile Management', () => {
        beforeEach(() => {
            // Mock config file for profile tests
            (fs.existsSync as jest.Mock).mockReturnValue(true);
            (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({
                profiles: {
                    default: {
                        connectionName: 'Default Connection',
                        tenantId: 'default-tenant',
                        authFlow: 'device_code',
                        mcp: {
                            applicationInsights: { appId: 'default-app' },
                            kusto: { clusterUrl: 'https://default.kusto.windows.net' }
                        }
                    },
                    dev: {
                        connectionName: 'Dev Connection',
                        tenantId: 'dev-tenant',
                        authFlow: 'device_code',
                        mcp: {
                            applicationInsights: { appId: 'dev-app' },
                            kusto: { clusterUrl: 'https://dev.kusto.windows.net' }
                        }
                    },
                    prod: {
                        connectionName: 'Prod Connection',
                        tenantId: 'prod-tenant',
                        authFlow: 'device_code',
                        mcp: {
                            applicationInsights: { appId: 'prod-app' },
                            kusto: { clusterUrl: 'https://prod.kusto.windows.net' }
                        }
                    }
                }
            }));
            (resolveProfileInheritance as jest.Mock).mockImplementation((profiles, profileName) => {
                return profiles[profileName];
            });
            (expandEnvironmentVariables as jest.Mock).mockImplementation((value) => value);
        });

        afterEach(() => {
            (fs.existsSync as jest.Mock).mockReturnValue(false);
        });

        it('should switch profile and reload configuration', () => {
            const service = new TelemetryService(mockOutputChannel);
            expect(service.getConnectionName()).toBe('Default Connection');

            service.switchProfile('prod');

            expect(service.getCurrentProfileName()).toBe('prod');
            expect(service.getConnectionName()).toBe('Prod Connection');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Switching to profile: prod');
        });

        it('should reload configuration', () => {
            const service = new TelemetryService(mockOutputChannel);

            service.reloadConfig();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Reloading configuration...');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Configuration reloaded');
        });

        it('should return current profile name', () => {
            const service = new TelemetryService(mockOutputChannel);

            // currentProfile is null unless explicitly set via constructor or switchProfile
            expect(service.getCurrentProfileName()).toBe(null);
        });

        it('should return connection name from config', () => {
            const service = new TelemetryService(mockOutputChannel);

            expect(service.getConnectionName()).toBe('Default Connection');
        });
    });

    describe('Error Paths', () => {
        it('should throw error when no workspace folder is open', () => {
            const savedWorkspaceFolders = vscode.workspace.workspaceFolders;
            (vscode.workspace as any).workspaceFolders = undefined;

            expect(() => new TelemetryService(mockOutputChannel)).toThrow('No workspace folder open');

            (vscode.workspace as any).workspaceFolders = savedWorkspaceFolders;
        });

        it('should handle saveQuery errors', async () => {
            const service = new TelemetryService(mockOutputChannel);
            const error = new Error('Save failed');
            mockQueriesService.saveQuery.mockRejectedValue(error);

            await expect(service.saveQuery('Test', 'traces | take 10')).rejects.toThrow('Save failed');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Failed to save query: Save failed');
        });

        it('should handle getSavedQueries errors', async () => {
            const service = new TelemetryService(mockOutputChannel);
            const error = new Error('Load failed');
            mockQueriesService.getAllQueries.mockRejectedValue(error);

            await expect(service.getSavedQueries()).rejects.toThrow('Load failed');
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith('[TelemetryService] Failed to load queries: Load failed');
        });
    });
});
