import { MCPClient, QueryRequest, QueryResult, SaveQueryRequest } from '../mcpClient.js';
import axios, { AxiosInstance } from 'axios';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock vscode
const mockOutputChannel = {
    appendLine: jest.fn(),
    append: jest.fn(),
    show: jest.fn(),
    dispose: jest.fn(),
    name: 'Test',
    hide: jest.fn(),
    clear: jest.fn(),
    replace: jest.fn()
};

describe('MCPClient', () => {
    let client: MCPClient;
    let mockAxiosInstance: jest.Mocked<AxiosInstance>;

    beforeEach(() => {
        jest.clearAllMocks();
        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        mockAxiosInstance = {
            post: jest.fn(),
            get: jest.fn()
        } as any;

        mockedAxios.create.mockReturnValue(mockAxiosInstance);

        client = new MCPClient('http://localhost:52345', mockOutputChannel as any);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    describe('constructor', () => {
        it('should create client with base URL', () => {
            expect(client).toBeDefined();
            expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
                baseURL: 'http://localhost:52345',
                timeout: 60000
            }));
        });

        it('should set Content-Type header', () => {
            expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
                headers: expect.objectContaining({
                    'Content-Type': 'application/json'
                })
            }));
        });
    });

    describe('healthCheck', () => {
        it('should return true on success', async () => {
            mockAxiosInstance.get.mockResolvedValue({
                data: { status: 'ok' }
            });

            const result = await client.healthCheck();

            expect(result).toBe(true);
            expect(mockAxiosInstance.get).toHaveBeenCalledWith('/health');
        });

        it('should return false on failure', async () => {
            mockAxiosInstance.get.mockRejectedValue(new Error('Connection failed'));

            const result = await client.healthCheck();

            expect(result).toBe(false);
        });
    });

    describe('getAuthStatus', () => {
        it('should make correct RPC call', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: { authenticated: true, user: 'test@example.com' },
                    id: 1
                }
            });

            const result = await client.getAuthStatus();

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                jsonrpc: '2.0',
                method: 'get_auth_status',
                id: expect.any(Number)
            }));
            expect(result).toEqual({ authenticated: true, user: 'test@example.com' });
        });

        it('should log request to output channel', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: { authenticated: false },
                    id: 1
                }
            });

            await client.getAuthStatus();

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('[MCP Client] get_auth_status')
            );
        });
    });

    describe('queryTelemetry', () => {
        it('should format KQL request correctly', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {
                        type: 'table',
                        kql: 'traces | take 10',
                        summary: 'Query executed',
                        columns: ['timestamp', 'message'],
                        rows: [['2025-10-15', 'test']],
                        cached: false
                    },
                    id: 1
                }
            });

            const request: QueryRequest = {
                query: 'traces | take 10',
                queryType: 'kql',
                maxRows: 100,
                useContext: true,
                includeExternal: false
            };

            const result = await client.queryTelemetry(request);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'query_telemetry',
                params: expect.objectContaining({
                    kql: 'traces | take 10',
                    maxRows: 100,
                    useContext: true,
                    includeExternal: false,
                    nl: undefined
                })
            }));
            expect(result.type).toBe('table');
            expect(result.cached).toBe(false);
        });

        it('should format NL request correctly', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {
                        type: 'table',
                        kql: 'traces | take 10',
                        summary: 'Query executed',
                        cached: false
                    },
                    id: 1
                }
            });

            const request: QueryRequest = {
                query: 'show me errors',
                queryType: 'natural',
                useContext: true,
                includeExternal: true
            };

            await client.queryTelemetry(request);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                params: expect.objectContaining({
                    nl: 'show me errors',
                    kql: undefined,
                    useContext: true,
                    includeExternal: true
                })
            }));
        });

        it('should handle RPC error responses', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal error'
                    },
                    id: 1
                }
            });

            await expect(client.queryTelemetry({
                query: 'test',
                queryType: 'kql'
            })).rejects.toThrow('Internal error');
        });

        it('should handle network errors', async () => {
            mockAxiosInstance.post.mockRejectedValue(new Error('Network error'));

            await expect(client.queryTelemetry({
                query: 'test',
                queryType: 'kql'
            })).rejects.toThrow('Network error');
        });

        it('should handle axios errors with response data', async () => {
            const axiosError: any = new Error('Request failed');
            axiosError.isAxiosError = true;
            axiosError.response = {
                data: {
                    error: {
                        message: 'Custom error message'
                    }
                }
            };

            // Need to also mock axios.isAxiosError
            (axios.isAxiosError as any) = jest.fn().mockReturnValue(true);

            mockAxiosInstance.post.mockRejectedValue(axiosError);

            await expect(client.queryTelemetry({
                query: 'test',
                queryType: 'kql'
            })).rejects.toThrow('Custom error message');
        });
    });

    describe('getSavedQueries', () => {
        it('should make correct RPC call', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'Query 1', kql: 'traces | take 10' }
                    ],
                    id: 1
                }
            });

            const result = await client.getSavedQueries();

            expect(Array.isArray(result)).toBe(true);
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'get_saved_queries'
            }));
        });
    });

    describe('searchQueries', () => {
        it('should pass search terms correctly', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'Error Query', kql: 'traces | where level == "Error"' }
                    ],
                    id: 1
                }
            });

            await client.searchQueries(['error', 'traces']);

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'search_queries',
                params: { searchTerms: ['error', 'traces'] }
            }));
        });
    });

    describe('saveQuery', () => {
        it('should pass all query metadata', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: { filePath: '/path/to/query.kql' },
                    id: 1
                }
            });

            const request: SaveQueryRequest = {
                name: 'Test Query',
                kql: 'traces | take 10',
                purpose: 'Testing',
                useCase: 'Development',
                tags: ['test', 'dev']
            };

            const result = await client.saveQuery(request);

            expect(result.filePath).toBe('/path/to/query.kql');
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'save_query',
                params: {
                    name: 'Test Query',
                    kql: 'traces | take 10',
                    purpose: 'Testing',
                    useCase: 'Development',
                    tags: ['test', 'dev']
                }
            }));
        });
    });

    describe('getRecommendations', () => {
        it('should pass KQL and results', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {
                        recommendations: ['Add where clause', 'Use summarize']
                    },
                    id: 1
                }
            });

            const recommendations = await client.getRecommendations(
                'traces | take 10',
                { rows: 10 }
            );

            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations).toHaveLength(2);
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'get_recommendations',
                params: {
                    kql: 'traces | take 10',
                    results: { rows: 10 }
                }
            }));
        });

        it('should handle missing recommendations array', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {}, // No recommendations field
                    id: 1
                }
            });

            const recommendations = await client.getRecommendations('traces');

            expect(Array.isArray(recommendations)).toBe(true);
            expect(recommendations).toHaveLength(0);
        });
    });

    describe('getExternalQueries', () => {
        it('should make correct RPC call', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'External Query', kql: 'traces | take 5' }
                    ],
                    id: 1
                }
            });

            const result = await client.getExternalQueries();

            expect(Array.isArray(result)).toBe(true);
            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                method: 'get_external_queries'
            }));
        });
    });

    describe('request ID', () => {
        it('should increment request ID for each request', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {},
                    id: 1
                }
            });

            await client.getAuthStatus();
            await client.getSavedQueries();

            const calls = mockAxiosInstance.post.mock.calls;
            const firstId = (calls[0][1] as any).id;
            const secondId = (calls[1][1] as any).id;

            expect(secondId).toBeGreaterThan(firstId);
        });

        it('should set correct JSON-RPC version', async () => {
            mockAxiosInstance.post.mockResolvedValue({
                data: {
                    jsonrpc: '2.0',
                    result: {},
                    id: 1
                }
            });

            await client.getAuthStatus();

            expect(mockAxiosInstance.post).toHaveBeenCalledWith('/rpc', expect.objectContaining({
                jsonrpc: '2.0'
            }));
        });
    });
});
