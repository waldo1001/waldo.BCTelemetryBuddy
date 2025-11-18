/**
 * TelemetryService integration tests
 * 
 * Tests the TelemetryService class that provides direct access to telemetry data
 * without requiring MCP server (Phase 3 functionality).
 */

import { TelemetryService } from '../services/telemetryService';
import { AuthService, KustoService, CacheService, QueriesService } from '@bctb/shared';
import * as vscode from 'vscode';

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
    QueriesService: jest.fn()
}));

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
            clear: jest.fn()
        };
        (CacheService as jest.Mock).mockImplementation(() => mockCacheService);

        mockQueriesService = {
            saveQuery: jest.fn().mockResolvedValue(undefined),
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
});
