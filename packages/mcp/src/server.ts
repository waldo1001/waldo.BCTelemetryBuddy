import express, { Express, Request, Response, NextFunction } from 'express';
import { loadConfig, validateConfig, MCPConfig } from './config.js';
import { AuthService, AuthResult } from './auth.js';
import { KustoService } from './kusto.js';
import { CacheService } from './cache.js';
import { QueriesService, SavedQuery } from './queries.js';
import { ReferencesService, ExternalQuery } from './references.js';
import { sanitizeObject } from './sanitize.js';

/**
 * JSON-RPC 2.0 request structure
 */
interface JSONRPCRequest {
    jsonrpc: '2.0';
    method: string;
    params?: any;
    id: string | number;
}

/**
 * JSON-RPC 2.0 response structure
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
 * Query result for LLM consumption
 */
interface QueryResult {
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
 * MCP Server with JSON-RPC protocol support
 */
export class MCPServer {
    private app: Express;
    private config: MCPConfig;
    private auth: AuthService;
    private kusto: KustoService;
    private cache: CacheService;
    private queries: QueriesService;
    private references: ReferencesService;

    constructor() {
        this.app = express();

        // Load and validate configuration
        this.config = loadConfig();
        validateConfig(this.config);

        console.log('=== BC Telemetry Buddy MCP Server ===');
        console.log(`Workspace: ${this.config.workspacePath}`);
        console.log(`Auth flow: ${this.config.authFlow}`);
        console.log(`Cache enabled: ${this.config.cacheEnabled}`);
        console.log(`PII sanitization: ${this.config.removePII ? 'enabled' : 'disabled'}`);
        console.log(`External references: ${this.config.references.length}`);
        console.log('=====================================\n');

        // Initialize services
        this.auth = new AuthService(this.config);
        this.kusto = new KustoService(this.config.applicationInsightsAppId, this.config.kustoClusterUrl);
        this.cache = new CacheService(this.config.workspacePath, this.config.cacheTTLSeconds, this.config.cacheEnabled);
        this.queries = new QueriesService(this.config.workspacePath);
        this.references = new ReferencesService(this.config.references, this.cache);

        this.setupMiddleware();
        this.setupRoutes();
    }

    /**
     * Setup Express middleware
     */
    private setupMiddleware(): void {
        this.app.use(express.json());

        // CORS for VSCode extension
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            res.header('Access-Control-Allow-Origin', '*');
            res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
            res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

            if (req.method === 'OPTIONS') {
                res.sendStatus(200);
            } else {
                next();
            }
        });

        // Request logging
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            console.log(`${req.method} ${req.path}`);
            next();
        });
    }

    /**
     * Setup routes
     */
    private setupRoutes(): void {
        // JSON-RPC endpoint (primary)
        this.app.post('/rpc', async (req: Request, res: Response) => {
            await this.handleJSONRPC(req, res);
        });

        // REST endpoints (for compatibility)
        this.app.get('/auth/status', async (req: Request, res: Response) => {
            const status = this.auth.getStatus();
            res.json(status);
        });

        this.app.post('/query', async (req: Request, res: Response) => {
            try {
                const result = await this.executeQuery(
                    req.body.kql,
                    req.body.useContext || false,
                    req.body.includeExternal || false
                );
                res.json(result);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/saved', async (req: Request, res: Response) => {
            const savedQueries = this.queries.getAllQueries();
            res.json(savedQueries);
        });

        this.app.post('/saved', async (req: Request, res: Response) => {
            try {
                const filePath = this.queries.saveQuery(
                    req.body.name,
                    req.body.kql,
                    req.body.purpose,
                    req.body.useCase,
                    req.body.tags
                );
                res.json({ filePath });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/recommend', async (req: Request, res: Response) => {
            const recommendations = await this.generateRecommendations(req.body.kql, req.body.results);
            res.json({ recommendations });
        });

        // Health check
        this.app.get('/health', (req: Request, res: Response) => {
            res.json({ status: 'ok' });
        });

        // Error handler
        this.app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
            console.error('Error:', err);
            res.status(500).json({ error: err.message });
        });
    }

    /**
     * Handle JSON-RPC 2.0 requests
     */
    private async handleJSONRPC(req: Request, res: Response): Promise<void> {
        const rpcRequest: JSONRPCRequest = req.body;

        // Validate JSON-RPC structure
        if (rpcRequest.jsonrpc !== '2.0' || !rpcRequest.method) {
            const errorResponse: JSONRPCResponse = {
                jsonrpc: '2.0',
                error: {
                    code: -32600,
                    message: 'Invalid Request'
                },
                id: null
            };
            res.json(errorResponse);
            return;
        }

        try {
            let result: any;

            // Route to appropriate handler
            switch (rpcRequest.method) {
                case 'query_telemetry':
                    result = await this.executeQuery(
                        rpcRequest.params.kql,
                        rpcRequest.params.useContext || false,
                        rpcRequest.params.includeExternal || false
                    );
                    break;

                case 'get_saved_queries':
                    result = this.queries.getAllQueries();
                    break;

                case 'search_queries':
                    result = this.queries.searchQueries(rpcRequest.params.searchTerms || []);
                    break;

                case 'save_query':
                    const filePath = this.queries.saveQuery(
                        rpcRequest.params.name,
                        rpcRequest.params.kql,
                        rpcRequest.params.purpose,
                        rpcRequest.params.useCase,
                        rpcRequest.params.tags
                    );
                    result = { filePath };
                    break;

                case 'get_recommendations':
                    result = await this.generateRecommendations(
                        rpcRequest.params.kql,
                        rpcRequest.params.results
                    );
                    break;

                case 'get_auth_status':
                    result = this.auth.getStatus();
                    break;

                case 'get_external_queries':
                    result = await this.references.getAllExternalQueries();
                    break;

                default:
                    throw new Error(`Method not found: ${rpcRequest.method}`);
            }

            // Success response
            const response: JSONRPCResponse = {
                jsonrpc: '2.0',
                result,
                id: rpcRequest.id
            };

            res.json(response);
        } catch (error: any) {
            // Error response
            const errorResponse: JSONRPCResponse = {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: error.message || 'Internal error'
                },
                id: rpcRequest.id
            };

            res.json(errorResponse);
        }
    }

    /**
     * Execute KQL query with optional context
     */
    private async executeQuery(
        kql: string,
        useContext: boolean,
        includeExternal: boolean
    ): Promise<QueryResult> {
        try {
            // Check cache first
            const cached = this.cache.get<QueryResult>(kql);

            if (cached) {
                console.log('✓ Returning cached result');
                return { ...cached, cached: true };
            }

            // Validate query
            const validationErrors = this.kusto.validateQuery(kql);

            if (validationErrors.length > 0) {
                return {
                    type: 'error',
                    kql,
                    summary: 'Query validation failed',
                    recommendations: validationErrors,
                    cached: false
                };
            }

            // Authenticate and get access token
            const accessToken = await this.auth.getAccessToken();

            // Execute query
            const rawResult = await this.kusto.executeQuery(kql, accessToken);
            const parsed = this.kusto.parseResult(rawResult);

            // Build result
            let result: QueryResult = {
                type: 'table',
                kql,
                summary: parsed.summary,
                columns: parsed.columns,
                rows: parsed.rows,
                cached: false
            };

            // Sanitize PII if enabled
            if (this.config.removePII) {
                result = sanitizeObject(result, true);
            }

            // Generate recommendations
            result.recommendations = await this.generateRecommendations(kql, result);

            // Cache result
            this.cache.set(kql, result);

            return result;
        } catch (error: any) {
            console.error('Query execution failed:', error);

            return {
                type: 'error',
                kql,
                summary: `Error: ${error.message}`,
                cached: false
            };
        }
    }

    /**
     * Generate recommendations based on query and results
     */
    private async generateRecommendations(kql: string, results: any): Promise<string[]> {
        const recommendations: string[] = [];

        // Check for missing indexes (simplified heuristic)
        if (kql.includes('where') && !kql.includes('| where')) {
            recommendations.push('Consider using the pipe operator before "where" for better performance');
        }

        // Check for SELECT *
        if (kql.includes('*')) {
            recommendations.push('Specify explicit columns instead of * for better performance');
        }

        // Check for time range
        if (!kql.toLowerCase().includes('ago(')) {
            recommendations.push('Consider adding a time range filter (e.g., | where timestamp > ago(1d))');
        }

        // Check result size
        if (results.rows && results.rows.length > 10000) {
            recommendations.push('Large result set. Consider adding "| take 100" or similar limit');
        }

        return recommendations;
    }

    /**
     * Start the server
     */
    start(): void {
        const port = this.config.port;

        this.app.listen(port, () => {
            console.log(`\n✓ MCP Server listening on port ${port}`);
            console.log(`Ready to receive requests\n`);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('\nShutting down gracefully...');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('\nShutting down gracefully...');
            process.exit(0);
        });
    }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    const server = new MCPServer();
    server.start();
}
