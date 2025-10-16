import * as vscode from 'vscode';
import axios, { AxiosInstance } from 'axios';

/**
 * Query request parameters
 */
export interface QueryRequest {
    query: string;
    queryType: 'kql' | 'natural';
    maxRows?: number;
    useContext?: boolean;
    includeExternal?: boolean;
}

/**
 * Query result from MCP
 */
export interface QueryResult {
    type: 'table' | 'chart' | 'summary' | 'error';
    kql: string;
    summary: string;
    columns?: string[];
    rows?: any[][];
    chart?: any;
    recommendations?: string[];
    cached: boolean;
}

/**
 * Save query request
 */
export interface SaveQueryRequest {
    name: string;
    kql: string;
    purpose?: string;
    useCase?: string;
    tags?: string[];
    category?: string;
    companyName?: string;
}

/**
 * JSON-RPC request
 */
interface JSONRPCRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id: string | number;
}

/**
 * JSON-RPC response
 */
interface JSONRPCResponse {
    jsonrpc: '2.0';
    result?: any;
    error?: {
        code: number;
        message: string;
        data?: any;
    };
    id: string | number | null;
}

/**
 * MCP client for JSON-RPC communication
 */
export class MCPClient {
    private client: AxiosInstance;
    private outputChannel: vscode.OutputChannel;
    private requestId: number = 1;

    constructor(baseUrl: string, outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;

        this.client = axios.create({
            baseURL: baseUrl,
            timeout: 60000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    /**
     * Make JSON-RPC request
     */
    private async rpcRequest<T>(method: string, params?: any): Promise<T> {
        const request: JSONRPCRequest = {
            jsonrpc: '2.0',
            method,
            params,
            id: this.requestId++
        };

        try {
            this.outputChannel.appendLine(`[MCP Client] ${method} -> ${JSON.stringify(params || {})}`);

            const response = await this.client.post<JSONRPCResponse>('/rpc', request);

            if (response.data.error) {
                const errorMessage = response.data.error.message || 'Unknown error';
                const errorCode = response.data.error.code || -1;
                const errorData = response.data.error.data ? JSON.stringify(response.data.error.data) : '';

                this.outputChannel.appendLine(`[MCP Client] ${method} <- JSON-RPC Error (code ${errorCode}): ${errorMessage}`);
                if (errorData) {
                    this.outputChannel.appendLine(`[MCP Client] Error data: ${errorData}`);
                }

                throw new Error(errorMessage);
            }

            this.outputChannel.appendLine(`[MCP Client] ${method} <- Success`);

            return response.data.result as T;
        } catch (err: any) {
            if (axios.isAxiosError(err)) {
                // Axios error - could be network, HTTP status, etc.
                const message = err.response?.data?.error?.message || err.message;
                const status = err.response?.status;
                const url = err.config?.url;
                const baseURL = err.config?.baseURL;

                this.outputChannel.appendLine(`[MCP Client] ${method} <- Axios Error (status ${status || 'unknown'}): ${message}`);
                this.outputChannel.appendLine(`[MCP Client] Error code: ${err.code || 'none'}`);
                this.outputChannel.appendLine(`[MCP Client] Base URL: ${baseURL}`);
                if (url) {
                    this.outputChannel.appendLine(`[MCP Client] Request URL: ${url}`);
                }
                if (err.response?.data) {
                    this.outputChannel.appendLine(`[MCP Client] Response data: ${JSON.stringify(err.response.data)}`);
                } else {
                    this.outputChannel.appendLine(`[MCP Client] No response received - connection error?`);
                }

                // Provide more helpful error message
                if (err.code === 'ECONNREFUSED') {
                    throw new Error(`Cannot connect to MCP server at ${baseURL}. Is the MCP server running?`);
                } else if (err.code === 'ETIMEDOUT') {
                    throw new Error(`Connection to MCP server timed out at ${baseURL}`);
                }

                throw new Error(message);
            }

            // Other error type - log full error object
            this.outputChannel.appendLine(`[MCP Client] ${method} <- Unexpected Error: ${err.message || String(err)}`);
            this.outputChannel.appendLine(`[MCP Client] Error type: ${err.constructor.name}`);
            if (err.stack) {
                this.outputChannel.appendLine(`[MCP Client] Stack: ${err.stack}`);
            }

            throw err;
        }
    }

    /**
     * Health check
     */
    async healthCheck(): Promise<boolean> {
        try {
            const response = await this.client.get('/health');
            return response.data.status === 'ok';
        } catch {
            return false;
        }
    }

    /**
     * Get authentication status
     */
    async getAuthStatus(): Promise<{ authenticated: boolean; user?: string }> {
        return this.rpcRequest('get_auth_status');
    }

    /**
     * Query telemetry
     */
    async queryTelemetry(request: QueryRequest): Promise<QueryResult> {
        return this.rpcRequest('query_telemetry', {
            kql: request.queryType === 'kql' ? request.query : undefined,
            nl: request.queryType === 'natural' ? request.query : undefined,
            maxRows: request.maxRows,
            useContext: request.useContext ?? true,
            includeExternal: request.includeExternal ?? true
        });
    }

    /**
     * Get saved queries
     */
    async getSavedQueries(): Promise<any[]> {
        return this.rpcRequest('get_saved_queries');
    }

    /**
     * Search queries
     */
    async searchQueries(searchTerms: string[]): Promise<any[]> {
        return this.rpcRequest('search_queries', { searchTerms });
    }

    /**
     * Save query
     */
    async saveQuery(request: SaveQueryRequest): Promise<{ filePath: string }> {
        return this.rpcRequest('save_query', {
            name: request.name,
            kql: request.kql,
            purpose: request.purpose,
            useCase: request.useCase,
            tags: request.tags,
            category: request.category
        });
    }

    /**
     * Generic JSON-RPC request (for any method)
     */
    async request<T = any>(method: string, params?: any): Promise<{ result?: T; error?: any }> {
        try {
            const result = await this.rpcRequest<T>(method, params);
            return { result };
        } catch (error: any) {
            return { error: error.message };
        }
    }

    /**
     * Get recommendations
     */
    async getRecommendations(kql?: string, results?: any): Promise<string[]> {
        const result = await this.rpcRequest<{ recommendations: string[] }>('get_recommendations', {
            kql,
            results
        });
        return result.recommendations || [];
    }

    /**
     * Get external queries
     */
    async getExternalQueries(): Promise<any[]> {
        return this.rpcRequest('get_external_queries');
    }
}
