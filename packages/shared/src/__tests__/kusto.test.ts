import { KustoService, KustoQueryResult, KustoTable } from '../kusto.js';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('KustoService', () => {
    const appInsightsAppId = 'test-app-id';
    const clusterUrl = 'https://api.applicationinsights.io';
    const accessToken = 'test-access-token';

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        // Mock axios.create to return a mock client
        mockedAxios.create.mockReturnValue({
            post: jest.fn(),
        } as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('executeQuery', () => {
        it('should execute KQL query successfully', async () => {
            // Arrange
            const mockResult: KustoQueryResult = {
                tables: [
                    {
                        tableName: 'PrimaryResult',
                        columns: [
                            { columnName: 'timestamp', dataType: 'datetime', columnType: 'datetime' },
                            { columnName: 'message', dataType: 'string', columnType: 'string' }
                        ],
                        rows: [
                            ['2025-10-15T10:00:00Z', 'Test message 1'],
                            ['2025-10-15T10:01:00Z', 'Test message 2']
                        ]
                    }
                ]
            };

            const mockClient = {
                post: jest.fn().mockResolvedValue({ data: mockResult })
            };

            mockedAxios.create.mockReturnValue(mockClient as any);

            const service = new KustoService(appInsightsAppId, clusterUrl);
            const kql = 'traces | take 10';

            // Act
            const result = await service.executeQuery(kql, accessToken);

            // Assert
            expect(result).toEqual(mockResult);
            expect(mockClient.post).toHaveBeenCalledWith(
                `${clusterUrl}/v1/apps/${appInsightsAppId}/query`,
                { query: kql },
                {
                    headers: {
                        'Authorization': `Bearer ${accessToken}`
                    }
                }
            );
        });

        it('should handle 401 authentication error', async () => {
            // Arrange
            const mockError = {
                isAxiosError: true,
                response: {
                    status: 401,
                    data: { error: { message: 'Invalid token' } }
                }
            };

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(true);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('traces | take 10', accessToken))
                .rejects.toThrow('Authentication failed: Invalid token. Check your credentials and permissions.');
        });

        it('should handle 403 authorization error', async () => {
            // Arrange
            const mockError = {
                isAxiosError: true,
                response: {
                    status: 403,
                    data: { error: { message: 'Insufficient permissions' } }
                }
            };

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(true);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('traces | take 10', accessToken))
                .rejects.toThrow('Authentication failed: Insufficient permissions. Check your credentials and permissions.');
        });

        it('should handle 400 bad request (invalid query)', async () => {
            // Arrange
            const mockError = {
                isAxiosError: true,
                response: {
                    status: 400,
                    data: { error: { message: 'Syntax error at line 1' } }
                }
            };

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(true);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('invalid kql', accessToken))
                .rejects.toThrow('Invalid query: Syntax error at line 1');
        });

        it('should handle 429 rate limit error', async () => {
            // Arrange
            const mockError = {
                isAxiosError: true,
                response: {
                    status: 429,
                    data: { error: { message: 'Too many requests' } }
                }
            };

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(true);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('traces | take 10', accessToken))
                .rejects.toThrow('Rate limit exceeded: Too many requests. Please try again later.');
        });

        it('should handle other HTTP errors', async () => {
            // Arrange
            const mockError = {
                isAxiosError: true,
                response: {
                    status: 500,
                    data: { error: { message: 'Internal server error' } }
                }
            };

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(true);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('traces | take 10', accessToken))
                .rejects.toThrow('Query execution failed: Internal server error');
        });

        it('should handle network errors', async () => {
            // Arrange
            const mockError = new Error('Network error');

            const mockClient = {
                post: jest.fn().mockRejectedValue(mockError)
            };

            mockedAxios.create.mockReturnValue(mockClient as any);
            mockedAxios.isAxiosError.mockReturnValue(false);

            const service = new KustoService(appInsightsAppId, clusterUrl);

            // Act & Assert
            await expect(service.executeQuery('traces | take 10', accessToken))
                .rejects.toThrow('Network error');
        });
    });

    describe('validateQuery', () => {
        let service: KustoService;

        beforeEach(() => {
            service = new KustoService(appInsightsAppId, clusterUrl);
        });

        it('should return no errors for valid query', () => {
            // Arrange
            const kql = 'traces | where timestamp > ago(1h) | take 100';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toEqual([]);
        });

        it('should return error for empty query', () => {
            // Arrange
            const kql = '';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toEqual(['Query cannot be empty']);
        });

        it('should return error for whitespace-only query', () => {
            // Arrange
            const kql = '   \n\t  ';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toEqual(['Query cannot be empty']);
        });

        it('should detect dangerous .drop operation', () => {
            // Arrange
            const kql = '.drop table MyTable';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toContain('Query contains potentially dangerous operation: .drop');
        });

        it('should detect dangerous .delete operation', () => {
            // Arrange
            const kql = '.delete table MyTable records';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toContain('Query contains potentially dangerous operation: .delete');
        });

        it('should detect dangerous .clear operation', () => {
            // Arrange
            const kql = '.clear table MyTable cache';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toContain('Query contains potentially dangerous operation: .clear');
        });

        it('should detect dangerous .set-or-replace operation', () => {
            // Arrange
            const kql = '.set-or-replace MyTable <| traces';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toContain('Query contains potentially dangerous operation: .set-or-replace');
        });

        it('should detect dangerous operations case-insensitively', () => {
            // Arrange
            const kql = '.DROP TABLE MyTable';

            // Act
            const errors = service.validateQuery(kql);

            // Assert
            expect(errors).toContain('Query contains potentially dangerous operation: .drop');
        });
    });

    describe('parseResult', () => {
        let service: KustoService;

        beforeEach(() => {
            service = new KustoService(appInsightsAppId, clusterUrl);
        });

        it('should parse query result successfully', () => {
            // Arrange
            const result: KustoQueryResult = {
                tables: [
                    {
                        tableName: 'PrimaryResult',
                        columns: [
                            { columnName: 'col1', dataType: 'string', columnType: 'string' },
                            { columnName: 'col2', dataType: 'int', columnType: 'int' }
                        ],
                        rows: [
                            ['value1', 100],
                            ['value2', 200],
                            ['value3', 300]
                        ]
                    }
                ]
            };

            // Act
            const parsed = service.parseResult(result);

            // Assert
            expect(parsed.columns).toEqual(['col1', 'col2']);
            expect(parsed.rows).toEqual([
                ['value1', 100],
                ['value2', 200],
                ['value3', 300]
            ]);
            expect(parsed.summary).toBe('Returned 3 row(s) with 2 column(s)');
        });

        it('should handle empty result (no tables)', () => {
            // Arrange
            const result: KustoQueryResult = { tables: [] };

            // Act
            const parsed = service.parseResult(result);

            // Assert
            expect(parsed.columns).toEqual([]);
            expect(parsed.rows).toEqual([]);
            expect(parsed.summary).toBe('No results returned');
        });

        it('should handle result with no rows', () => {
            // Arrange
            const result: KustoQueryResult = {
                tables: [
                    {
                        tableName: 'PrimaryResult',
                        columns: [
                            { columnName: 'col1', dataType: 'string', columnType: 'string' }
                        ],
                        rows: []
                    }
                ]
            };

            // Act
            const parsed = service.parseResult(result);

            // Assert
            expect(parsed.columns).toEqual(['col1']);
            expect(parsed.rows).toEqual([]);
            expect(parsed.summary).toBe('Returned 0 row(s) with 1 column(s)');
        });
    });
});
