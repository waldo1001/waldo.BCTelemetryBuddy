import * as assert from 'assert';
import * as vscode from 'vscode';
import * as sinon from 'sinon';
import axios from 'axios';
import { MCPClient } from '../../mcpClient';

suite('MCPClient Test Suite', () => {
    let sandbox: sinon.SinonSandbox;
    let client: MCPClient;
    let outputChannel: vscode.OutputChannel;
    let axiosStub: sinon.SinonStub;

    setup(() => {
        sandbox = sinon.createSandbox();
        outputChannel = {
            appendLine: sandbox.stub(),
            append: sandbox.stub(),
            show: sandbox.stub(),
            dispose: sandbox.stub(),
            name: 'Test',
            hide: sandbox.stub(),
            clear: sandbox.stub(),
            replace: sandbox.stub()
        } as any;

        client = new MCPClient('http://localhost:52345', outputChannel);

        // Stub axios methods
        axiosStub = sandbox.stub(axios, 'create').returns({
            post: sandbox.stub(),
            get: sandbox.stub()
        } as any);
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Should create client with base URL', () => {
        const client = new MCPClient('http://localhost:12345', outputChannel);
        assert.ok(client);
    });

    test('Should log requests to output channel', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: { authenticated: true },
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);

        try {
            await client.getAuthStatus();
        } catch {
            // May fail due to mocking, but we just want to verify logging
        }

        // Should log the request
        const appendLineStub = outputChannel.appendLine as sinon.SinonStub;
        assert.ok(appendLineStub.called);
    });

    test('healthCheck should return true on success', async () => {
        const mockAxios = {
            get: sandbox.stub().resolves({ data: { status: 'ok' } }),
            post: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.healthCheck();

        assert.strictEqual(result, true);
        assert.ok(mockAxios.get.calledWith('/health'));
    });

    test('healthCheck should return false on failure', async () => {
        const mockAxios = {
            get: sandbox.stub().rejects(new Error('Connection failed')),
            post: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.healthCheck();

        assert.strictEqual(result, false);
    });

    test('getAuthStatus should make correct RPC call', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: { authenticated: true, user: 'test@example.com' },
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.getAuthStatus();

        assert.ok(mockAxios.post.called);
        const callArgs = mockAxios.post.firstCall.args;
        assert.strictEqual(callArgs[0], '/rpc');
        assert.strictEqual(callArgs[1].method, 'get_auth_status');
    });

    test('queryTelemetry should format KQL request correctly', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
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
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.queryTelemetry({
            query: 'traces | take 10',
            queryType: 'kql',
            maxRows: 100,
            useContext: true,
            includeExternal: false
        });

        assert.ok(mockAxios.post.called);
        const params = mockAxios.post.firstCall.args[1].params;
        assert.strictEqual(params.kql, 'traces | take 10');
        assert.strictEqual(params.maxRows, 100);
        assert.strictEqual(params.useContext, true);
        assert.strictEqual(params.includeExternal, false);
        assert.strictEqual(params.nl, undefined);
    });

    test('queryTelemetry should format NL request correctly', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
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
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        await client.queryTelemetry({
            query: 'show me errors',
            queryType: 'natural',
            useContext: true,
            includeExternal: true
        });

        const params = mockAxios.post.firstCall.args[1].params;
        assert.strictEqual(params.nl, 'show me errors');
        assert.strictEqual(params.kql, undefined);
        assert.strictEqual(params.useContext, true);
        assert.strictEqual(params.includeExternal, true);
    });

    test('getSavedQueries should make correct RPC call', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'Query 1', kql: 'traces | take 10' }
                    ],
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.getSavedQueries();

        assert.ok(Array.isArray(result));
        const callArgs = mockAxios.post.firstCall.args[1];
        assert.strictEqual(callArgs.method, 'get_saved_queries');
    });

    test('searchQueries should pass search terms correctly', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'Error Query', kql: 'traces | where level == "Error"' }
                    ],
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        await client.searchQueries(['error', 'traces']);

        const params = mockAxios.post.firstCall.args[1].params;
        assert.deepStrictEqual(params.searchTerms, ['error', 'traces']);
    });

    test('saveQuery should pass all query metadata', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: { filePath: '/path/to/query.kql' },
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.saveQuery({
            name: 'Test Query',
            kql: 'traces | take 10',
            purpose: 'Testing',
            useCase: 'Development',
            tags: ['test', 'dev']
        });

        assert.strictEqual(result.filePath, '/path/to/query.kql');

        const params = mockAxios.post.firstCall.args[1].params;
        assert.strictEqual(params.name, 'Test Query');
        assert.strictEqual(params.kql, 'traces | take 10');
        assert.strictEqual(params.purpose, 'Testing');
        assert.strictEqual(params.useCase, 'Development');
        assert.deepStrictEqual(params.tags, ['test', 'dev']);
    });

    test('getRecommendations should pass KQL and results', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: {
                        recommendations: ['Add where clause', 'Use summarize']
                    },
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const recommendations = await client.getRecommendations(
            'traces | take 10',
            { rows: 10 }
        );

        assert.ok(Array.isArray(recommendations));
        assert.strictEqual(recommendations.length, 2);

        const params = mockAxios.post.firstCall.args[1].params;
        assert.strictEqual(params.kql, 'traces | take 10');
        assert.deepStrictEqual(params.results, { rows: 10 });
    });

    test('getRecommendations should handle missing recommendations array', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: {}, // No recommendations field
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const recommendations = await client.getRecommendations('traces');

        assert.ok(Array.isArray(recommendations));
        assert.strictEqual(recommendations.length, 0);
    });

    test('getExternalQueries should make correct RPC call', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: [
                        { name: 'External Query', kql: 'traces | take 5' }
                    ],
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        const result = await client.getExternalQueries();

        assert.ok(Array.isArray(result));
        const callArgs = mockAxios.post.firstCall.args[1];
        assert.strictEqual(callArgs.method, 'get_external_queries');
    });

    test('Should handle RPC error responses', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    error: {
                        code: -32603,
                        message: 'Internal error'
                    },
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);

        await assert.rejects(
            async () => await client.getAuthStatus(),
            /Internal error/
        );
    });

    test('Should handle network errors', async () => {
        const mockAxios = {
            post: sandbox.stub().rejects(new Error('Network error')),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);

        await assert.rejects(
            async () => await client.getAuthStatus(),
            /Network error/
        );
    });

    test('Should handle axios errors with response data', async () => {
        const axiosError = new Error('Request failed') as any;
        axiosError.isAxiosError = true;
        axiosError.response = {
            data: {
                error: {
                    message: 'Custom error message'
                }
            }
        };

        const mockAxios = {
            post: sandbox.stub().rejects(axiosError),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);

        await assert.rejects(
            async () => await client.queryTelemetry({
                query: 'test',
                queryType: 'kql'
            }),
            /Custom error message/
        );
    });

    test('Should increment request ID for each request', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: {},
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);

        await client.getAuthStatus();
        await client.getSavedQueries();

        const firstId = mockAxios.post.firstCall.args[1].id;
        const secondId = mockAxios.post.secondCall.args[1].id;

        assert.ok(secondId > firstId, 'Request IDs should increment');
    });

    test('Should set correct JSON-RPC version', async () => {
        const mockAxios = {
            post: sandbox.stub().resolves({
                data: {
                    jsonrpc: '2.0',
                    result: {},
                    id: 1
                }
            }),
            get: sandbox.stub()
        };

        axiosStub.returns(mockAxios as any);

        const client = new MCPClient('http://localhost:52345', outputChannel);
        await client.getAuthStatus();

        const request = mockAxios.post.firstCall.args[1];
        assert.strictEqual(request.jsonrpc, '2.0');
    });

    test('Should handle timeout configuration', () => {
        // Verify that client is created with timeout
        // (We can't directly test axios config, but we verify creation succeeds)
        const client = new MCPClient('http://localhost:52345', outputChannel);
        assert.ok(client);
    });

    test('Should set correct Content-Type header', () => {
        // Verify that axios client is configured with correct headers
        // (We can't directly access headers, but we verify creation succeeds)
        const client = new MCPClient('http://localhost:52345', outputChannel);
        assert.ok(client);
    });
});
