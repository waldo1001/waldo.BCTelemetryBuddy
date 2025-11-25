import express, { Express, Request, Response, NextFunction } from 'express';
import { loadConfig, loadConfigFromFile, validateConfig, MCPConfig } from './config.js';
import {
    AuthService,
    KustoService,
    CacheService,
    QueriesService,
    ReferencesService,
    sanitizeObject,
    lookupEventCategory,
    IUsageTelemetry,
    NoOpUsageTelemetry,
    RateLimitedUsageTelemetry,
    TELEMETRY_CONNECTION_STRING,
    TELEMETRY_EVENTS,
    createCommonProperties,
    cleanTelemetryProperties,
    hashValue
} from '@bctb/shared';
import type { AuthResult } from '@bctb/shared';
import type { SavedQuery } from '@bctb/shared';
import type { ExternalQuery } from '@bctb/shared';
import type { EventCategoryInfo } from '@bctb/shared';
import { VERSION } from './version.js';
import * as https from 'https';
import { createMCPUsageTelemetry, getMCPInstallationId } from './mcpTelemetry.js';
import * as crypto from 'crypto';

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
    protected app: Express;
    protected config: MCPConfig;
    protected auth: AuthService;
    protected kusto: KustoService;
    protected cache: CacheService;
    protected queries: QueriesService;
    protected references: ReferencesService;
    protected configErrors: string[];
    protected usageTelemetry: IUsageTelemetry; // Usage telemetry (tracks MCP usage)
    protected sessionId: string; // Session identifier for this server instance
    protected installationId: string; // Installation identifier from workspace
    private isStdioMode: boolean; // Track if running in stdio mode to suppress console output

    constructor(config?: MCPConfig, mode?: 'stdio' | 'http') {
        this.app = express();
        this.isStdioMode = mode === 'stdio';

        // Load and validate configuration
        // Priority: 1. Passed config, 2. Config file, 3. Environment variables (VSCode extension)
        if (config) {
            this.config = config;
        } else {
            const fileConfig = loadConfigFromFile();
            if (fileConfig) {
                if (!this.isStdioMode) {
                    console.error('[Config] Using config file (.bctb-config.json)');
                }
                this.config = fileConfig;
            } else {
                // Fall back to env vars for VSCode extension compatibility
                if (!this.isStdioMode) {
                    console.error('[Config] No config file found, using environment variables');
                }
                this.config = loadConfig();
            }
        }
        this.configErrors = validateConfig(this.config);

        // Only print banner in HTTP mode - stdio mode uses JSON-RPC protocol
        if (!this.isStdioMode) {
            console.error('=== BC Telemetry Buddy MCP Server ===');
            console.error(`Connection: ${this.config.connectionName}`);
            console.error(`Workspace: ${this.config.workspacePath}`);
            console.error(`App Insights ID: ${this.config.applicationInsightsAppId || '(not set)'}`);
            console.error(`Kusto URL: ${this.config.kustoClusterUrl || '(not set)'}`);
            console.error(`Auth flow: ${this.config.authFlow}`);
            console.error(`Cache: ${this.config.cacheEnabled ? `enabled (TTL: ${this.config.cacheTTLSeconds}s)` : 'disabled'}`);
            console.error(`PII sanitization: ${this.config.removePII ? 'enabled' : 'disabled'}`);
            console.error(`External references: ${this.config.references.length}`);

            if (this.configErrors.length > 0) {
                console.error(`⚠️  Configuration incomplete (${this.configErrors.length} issues)`);
            } else {
                console.error('✅ Configuration valid');
            }
            console.error('=====================================\n');
        }

        // Generate session ID for this server instance
        this.sessionId = crypto.randomUUID();

        // Initialize Usage Telemetry (tracks MCP usage)
        const connectionString = TELEMETRY_CONNECTION_STRING;
        const telemetryEnabled = true; // Always enabled (no config override for now)

        if (connectionString && telemetryEnabled) {
            const baseTelemetry = createMCPUsageTelemetry(connectionString, this.config.workspacePath, VERSION);
            if (baseTelemetry) {
                // Get installation ID from workspace
                this.installationId = getMCPInstallationId(this.config.workspacePath);

                // Apply rate limiting for MCP (higher limits than extension)
                this.usageTelemetry = new RateLimitedUsageTelemetry(baseTelemetry, {
                    maxIdenticalErrors: 10,
                    maxEventsPerSession: 2000,
                    maxEventsPerMinute: 200
                });
                if (!this.isStdioMode) {
                    console.error('✓ Usage Telemetry initialized\n');
                }

                // Track server startup with common properties
                const profileHash = this.config.connectionName ? hashValue(this.config.connectionName).substring(0, 16) : undefined;
                const startupProps = createCommonProperties(
                    TELEMETRY_EVENTS.MCP.SERVER_STARTED,
                    'mcp',
                    this.sessionId,
                    this.installationId,
                    VERSION,
                    {
                        profileHash,
                        authFlow: this.config.authFlow,
                        cacheEnabled: String(this.config.cacheEnabled)
                    }
                );
                this.usageTelemetry.trackEvent('Mcp.ServerStarted', cleanTelemetryProperties(startupProps));
            } else {
                this.usageTelemetry = new NoOpUsageTelemetry();
                this.installationId = 'unknown';
                if (!this.isStdioMode) {
                    console.error('⚠️  Usage Telemetry initialization failed\n');
                }
            }
        } else {
            this.usageTelemetry = new NoOpUsageTelemetry();
            this.installationId = 'unknown';
            if (!this.isStdioMode) {
                console.error('ℹ️  Usage Telemetry disabled\n');
            }
        }

        // Initialize services (pass telemetry to KustoService for dependency tracking)
        this.auth = new AuthService(this.config);
        this.kusto = new KustoService(this.config.applicationInsightsAppId, this.config.kustoClusterUrl, this.usageTelemetry);
        this.cache = new CacheService(this.config.workspacePath, this.config.cacheTTLSeconds, this.config.cacheEnabled);
        this.queries = new QueriesService(this.config.workspacePath, this.config.queriesFolder);
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

        // Request logging with sanitized path to prevent log injection
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            // Sanitize path by removing control characters and newlines to prevent log injection
            const sanitizedPath = req.path.replace(/[\x00-\x1F\x7F-\x9F]/g, '');
            console.error(`${req.method} ${sanitizedPath}`);
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
                    req.body.tags,
                    req.body.category,
                    req.body.companyName
                );
                res.json({ filePath });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.get('/categories', async (req: Request, res: Response) => {
            try {
                const categories = this.queries.getCategories();
                res.json(categories);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/recommend', async (req: Request, res: Response) => {
            const recommendations = await this.generateRecommendations(req.body.kql, req.body.results);
            res.json({ recommendations });
        });

        // Cache management endpoints
        this.app.get('/cache/stats', async (req: Request, res: Response) => {
            try {
                const stats = this.cache.getStats();
                res.json(stats);
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/cache/clear', async (req: Request, res: Response) => {
            try {
                this.cache.clear();
                res.json({ success: true, message: 'Cache cleared successfully' });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
        });

        this.app.post('/cache/cleanup', async (req: Request, res: Response) => {
            try {
                this.cache.cleanupExpired();
                const stats = this.cache.getStats();
                res.json({ success: true, message: `Cleaned up expired entries. ${stats.totalEntries} entries remaining`, stats });
            } catch (error: any) {
                res.status(500).json({ error: error.message });
            }
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
        const startTime = Date.now();

        // Extract or generate correlationId for distributed tracing
        const correlationId = (rpcRequest.params?._correlationId as string) || crypto.randomUUID();

        // Get profileHash from config
        const profileHash = this.config.connectionName ? hashValue(this.config.connectionName).substring(0, 16) : undefined;

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
                case 'tools/list':
                    // MCP protocol: list available tools for Copilot discovery
                    result = {
                        tools: [
                            {
                                name: 'query_telemetry',
                                description: 'Execute a KQL query against Business Central telemetry data. CRITICAL PREREQUISITE: You MUST call get_event_catalog() FIRST to discover available event IDs, then call get_event_field_samples() to understand field structure BEFORE constructing any KQL query. DO NOT use this tool without completing the discovery flow first.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query string constructed using event IDs from get_event_catalog() and field names from get_event_field_samples()' },
                                        useContext: { type: 'boolean', description: 'Use saved queries as examples', default: true },
                                        includeExternal: { type: 'boolean', description: 'Include external reference queries', default: true }
                                    },
                                    required: ['kql']
                                }
                            },
                            {
                                name: 'get_saved_queries',
                                description: 'List all saved telemetry queries in the workspace',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' }
                                    }
                                }
                            },
                            {
                                name: 'search_queries',
                                description: 'Search saved queries by keywords',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        searchTerms: { type: 'array', items: { type: 'string' }, description: 'Search terms' }
                                    },
                                    required: ['searchTerms']
                                }
                            },
                            {
                                name: 'save_query',
                                description: 'Save a telemetry query for future reference',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string', description: 'Query name' },
                                        kql: { type: 'string', description: 'KQL query string' },
                                        purpose: { type: 'string', description: 'Query purpose' },
                                        useCase: { type: 'string', description: 'When to use this query' },
                                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
                                        category: { type: 'string', description: 'Category/folder for organization' }
                                    },
                                    required: ['name', 'kql']
                                }
                            },
                            {
                                name: 'get_categories',
                                description: 'List all query categories (folders)',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'get_recommendations',
                                description: 'Get recommendations for improving a query',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query to analyze' },
                                        results: { type: 'object', description: 'Query results to analyze' }
                                    }
                                }
                            },
                            {
                                name: 'get_external_queries',
                                description: 'Get KQL examples from external references (GitHub, blogs)',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'get_event_catalog',
                                description: 'Get a catalog of recent Business Central telemetry event IDs with descriptions, frequencies, and Learn URLs. RECOMMENDED FIRST STEP when exploring telemetry or understanding what events are available. Optionally includes analysis of common fields that appear across multiple events. Results are limited to top events by count to prevent overwhelming responses.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to analyze (default: 10)', default: 10 },
                                        status: { type: 'string', enum: ['all', 'success', 'error', 'too slow', 'unknown'], description: 'Filter by event status', default: 'all' },
                                        minCount: { type: 'number', description: 'Minimum occurrence count to include', default: 1 },
                                        maxResults: { type: 'number', description: 'Maximum number of events to return (default: 50, max: 200)', default: 50 },
                                        includeCommonFields: { type: 'boolean', description: 'Include analysis of common customDimensions fields that appear across multiple events (default: false)', default: false }
                                    }
                                }
                            },
                            {
                                name: 'get_event_schema',
                                description: 'Get the schema (available customDimensions fields) for a specific event ID by sampling recent occurrences. Use this after discovering an event ID to understand what fields are available before building detailed queries.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        eventId: { type: 'string', description: 'Event ID to analyze (e.g., AL0000E26)' },
                                        sampleSize: { type: 'number', description: 'Number of events to sample', default: 100 }
                                    },
                                    required: ['eventId']
                                }
                            },
                            {
                                name: 'get_event_field_samples',
                                description: 'RECOMMENDED: Get detailed field analysis from real telemetry events including data types, occurrence rates, and sample values. Also provides event category information (Performance, Lifecycle, Security, etc.) dynamically fetched from Microsoft Learn documentation. Returns ready-to-use example query with proper type conversions and documentation links. Use this to understand the exact structure of customDimensions before writing queries.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        eventId: { type: 'string', description: 'Event ID to analyze (e.g., RT0005, LC0011)' },
                                        sampleCount: { type: 'number', description: 'Number of events to sample for analysis', default: 10 },
                                        daysBack: { type: 'number', description: 'How many days back to search for events', default: 30 }
                                    },
                                    required: ['eventId']
                                }
                            }
                        ]
                    };
                    break;

                case 'query_telemetry':
                    // Check if configuration is incomplete
                    if (this.configErrors.length > 0) {
                        result = {
                            type: 'error',
                            kql: rpcRequest.params.kql || '',
                            summary: 'BC Telemetry Buddy MCP server configuration is incomplete. Please configure the required settings.',
                            recommendations: [
                                'If using VSCode: Run "BC Telemetry Buddy: Setup Wizard" from the Command Palette (Ctrl+Shift+P)',
                                'If using Claude Desktop or other MCP clients: Set environment variables in your MCP settings:',
                                '  - BCTB_WORKSPACE_PATH: Path to your workspace',
                                '  - BCTB_TENANT_ID: Your Azure tenant ID',
                                '  - BCTB_APP_INSIGHTS_ID: Your Application Insights app ID',
                                '  - BCTB_KUSTO_URL: Kusto cluster URL (e.g., https://ade.applicationinsights.io/subscriptions/...)',
                                '  - BCTB_AUTH_FLOW: Authentication method (azure_cli, device_code, or client_credentials)'
                            ],
                            cached: false
                        };
                        break;
                    }

                    // Execute KQL query
                    const kqlQuery = rpcRequest.params.kql;

                    if (!kqlQuery || kqlQuery.trim() === '') {
                        throw new Error('kql parameter is required. Use get_event_catalog() to discover events and get_event_field_samples() to understand field structure.');
                    }

                    result = await this.executeQuery(
                        kqlQuery,
                        rpcRequest.params.useContext || false,
                        rpcRequest.params.includeExternal || false,
                        'UserQuery',
                        correlationId
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
                        rpcRequest.params.tags,
                        rpcRequest.params.category
                    );
                    result = { filePath };
                    break;

                case 'get_categories':
                    result = this.queries.getCategories();
                    break;

                case 'get_recommendations':
                    result = await this.generateRecommendations(
                        rpcRequest.params.kql,
                        rpcRequest.params.results
                    );
                    break;

                case 'get_auth_status':
                    // Check if configuration is incomplete
                    if (this.configErrors.length > 0) {
                        result = {
                            authenticated: false,
                            error: 'BC Telemetry Buddy MCP server configuration is incomplete. Required settings missing.',
                            configurationIssues: this.configErrors,
                            hint: 'VSCode users: Run Setup Wizard from Command Palette. MCP client users: Configure environment variables in your MCP settings.'
                        };
                    } else {
                        result = this.auth.getStatus();
                    }
                    break;

                case 'get_external_queries':
                    result = await this.references.getAllExternalQueries();
                    break;

                case 'get_event_catalog':
                    // Check if configuration is incomplete
                    if (this.configErrors.length > 0) {
                        throw new Error('BC Telemetry Buddy MCP server configuration is incomplete. VSCode users: Run "BC Telemetry Buddy: Setup Wizard" from Command Palette. MCP client users: Configure required environment variables (BCTB_TENANT_ID, BCTB_APP_INSIGHTS_ID, BCTB_KUSTO_URL, etc.) in your MCP client settings.');
                    }

                    result = await this.getEventCatalog(
                        rpcRequest.params?.daysBack || 10,
                        rpcRequest.params?.status || 'all',
                        rpcRequest.params?.minCount || 1,
                        rpcRequest.params?.includeCommonFields || false,
                        rpcRequest.params?.maxResults || 50
                    );
                    break;

                case 'get_event_schema':
                    if (!rpcRequest.params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventSchema(
                        rpcRequest.params.eventId,
                        rpcRequest.params?.sampleSize || 100
                    );
                    break;

                case 'get_event_field_samples':
                    if (!rpcRequest.params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventFieldSamples(
                        rpcRequest.params.eventId,
                        rpcRequest.params?.sampleCount || 10,
                        rpcRequest.params?.daysBack || 30
                    );
                    break;

                case 'get_tenant_mapping':
                    result = await this.getTenantMapping(
                        rpcRequest.params?.daysBack || 10,
                        rpcRequest.params?.companyNameFilter
                    );
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
            // Error response - ensure we have a meaningful message
            const errorMessage = error.message || error.toString() || 'Internal error';

            // Track exception with full context
            const errorProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.sessionId,
                this.installationId,
                VERSION,
                {
                    correlationId,
                    profileHash,
                    toolName: rpcRequest.method,
                    errorMessage,
                    errorCategory: error.name || 'Error'
                }
            );
            if (error instanceof Error) {
                this.usageTelemetry.trackException(error, cleanTelemetryProperties(errorProps) as Record<string, string>);
            }

            const errorResponse: JSONRPCResponse = {
                jsonrpc: '2.0',
                error: {
                    code: -32603,
                    message: errorMessage,
                    data: error.stack ? { stack: error.stack } : undefined
                },
                id: rpcRequest.id
            };

            res.json(errorResponse);
        }
    }

    /**
     * Check if configuration is complete
     */
    private checkConfigurationComplete(): void {
        if (this.configErrors.length > 0) {
            const errorMessage = `Configuration incomplete:\n${this.configErrors.join('\n')}\n\nPlease run "BC Telemetry Buddy: Setup Wizard" from the Command Palette to configure the extension.`;
            throw new Error(errorMessage);
        }
    }

    /**
     * Execute KQL query with optional context
     */
    private async executeQuery(
        kql: string,
        useContext: boolean,
        includeExternal: boolean,
        queryName?: string,
        correlationId?: string
    ): Promise<QueryResult> {
        try {
            // Check configuration before attempting query
            this.checkConfigurationComplete();

            // Check cache first
            const cached = this.cache.get<QueryResult>(kql);

            if (cached) {
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

            // Execute query with telemetry tracking
            const rawResult = await this.kusto.executeQuery(
                kql,
                accessToken,
                queryName || 'UserQuery',
                correlationId
            );
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
            return {
                type: 'error',
                kql,
                summary: `Error: ${error.message}`,
                cached: false
            };
        }
    }

    /**
     * Get event catalog - recent BC telemetry event IDs with descriptions, frequencies, and Learn URLs
     */
    private async getEventCatalog(daysBack: number = 10, status: string = 'all', minCount: number = 1, includeCommonFields: boolean = false, maxResults: number = 50): Promise<any> {
        // Cap maxResults at 200 to prevent overwhelming responses
        const limitedMaxResults = Math.min(maxResults, 200);

        const kql = `
        traces
        | where timestamp >= ago(${daysBack}d)
        | extend eventId = tostring(customDimensions.eventId)
        | extend shortMessage = case(
        // Specific event IDs that need unique short messages
        eventId == "RT0048", "Multiple API web services with same path found",
        eventId == "RT0029", "StopSession invoked",
        eventId == "RT0011", "Operation canceled",
        eventId == "LC0136", "Environment session cancellation started",
        eventId == "LC0137", "Environment session cancelled successfully",
        eventId == "LC0166", "Environment app requires dependency",
        eventId == "LC0167", "Environment app 'Distri EDI Descartes' update scheduled",
        eventId == "LC0169", "Environment app update started",
        eventId == "LC0170", "Environment app update succeeded",
        eventId == "LC0163", "Environment app installation started",
        eventId == "LC0164", "Environment app installation succeeded",
        eventId == "AL0000JRG", "Job Queue Error",
        eventId == "ALADLSE-001", "Data export started",
        eventId == "ALADLSE-902", "Export manifest with table id 17",
        // Generic patterns
        substring(message, 0, 4) == "Task", "Task Executed",
        indexof(message, ":") <= 0, message,
        // Default: extract text before first colon
        substring(message, 0, indexof(message, ":"))
        )
        | extend eventStatus = case(
        // ERROR - clear failures that need attention
        shortMessage has_any ("error","fail","failed","deadlock","timed out", "timeout", "cannot", "unable", "invalid", "could not", "missing") or
        eventId has_any ("AL0000JRG", "RT0012", "RT0028", "RT0030", "RT0031"), 
        "error",
        // TOO SLOW - performance issues requiring optimization
        shortMessage has_any ("exceeded", "too slow") or 
        eventId in ("RT0005", "RT0018"), 
        "too slow",
        // WARNING - potential issues, not critical but noteworthy
        shortMessage has_any ("warn","warning"), "warning",
        // SUCCESS - operations completed successfully
        shortMessage has_any ("called","executed","succeeded","rendered","successfully","success","completed","finished","posted","sent","created","generated","applied","authenticated","connected","committed","registered") or
        eventId has_any ("LC0010", "LC0011", "LC0020", "LC0021"), 
        "success",
        // INFO - informational/operational events (everything else)
        "info"
        )
        | summarize count = count() by tostring(eventId), tostring(shortMessage), eventStatus
        | extend LearnUrl = strcat("https://learn.microsoft.com/en-us/search/?scope=BusinessCentral&terms=",eventId, "+", replace_string(shortMessage," ","+"))
        | project eventId, shortMessage, status=eventStatus, count, LearnUrl
        ${status !== 'all' ? `| where status == "${status}"` : ''}
        | where count >= ${minCount}
        | order by count desc
        | take ${limitedMaxResults}
        `.trim();

        // Execute the query
        const result = await this.executeQuery(kql, false, false);

        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        const events = result.rows?.map((row: any[]) => ({
            eventId: row[0],
            shortMessage: row[1],
            status: row[2],
            count: row[3],
            learnUrl: row[4]
        })) || [];

        const response: any = {
            summary: `Found ${events.length} event IDs in the last ${daysBack} days${events.length >= limitedMaxResults ? ` (limited to top ${limitedMaxResults} by count)` : ''}`,
            daysBack,
            statusFilter: status,
            minCount,
            maxResults: limitedMaxResults,
            totalReturned: events.length,
            events
        };

        // If includeCommonFields is true, analyze customDimensions fields across events
        if (includeCommonFields && events.length > 0) {
            response.commonFields = await this.analyzeCommonFields(daysBack, events.map(e => e.eventId));
        }

        return response;
    }

    /**
     * Analyze common customDimensions fields across multiple events
     */
    private async analyzeCommonFields(daysBack: number, eventIds: string[]): Promise<any> {
        // Sample a subset of events to analyze fields (max 50 events to keep performance reasonable)
        const eventsToAnalyze = eventIds.slice(0, 50);

        // Build KQL to get field names for each event
        const kql = `
traces
| where timestamp >= ago(${daysBack}d)
| extend eventId = tostring(customDimensions.eventId)
| where eventId in (${eventsToAnalyze.map(id => `"${id}"`).join(', ')})
| take 1000
| project eventId, customDimensions
        `.trim();

        const result = await this.executeQuery(kql, false, false);

        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        // Map to track which fields appear in which events
        const fieldEventMap = new Map<string, Set<string>>();
        const fieldTypeMap = new Map<string, Map<string, number>>(); // field -> type -> count

        result.rows?.forEach((row: any[]) => {
            const eventId = row[0];
            const customDims = row[1];

            if (typeof customDims === 'object' && customDims !== null) {
                Object.entries(customDims).forEach(([fieldName, fieldValue]) => {
                    // Track which events have this field
                    if (!fieldEventMap.has(fieldName)) {
                        fieldEventMap.set(fieldName, new Set());
                    }
                    fieldEventMap.get(fieldName)!.add(eventId);

                    // Track field type
                    if (!fieldTypeMap.has(fieldName)) {
                        fieldTypeMap.set(fieldName, new Map());
                    }
                    const typeMap = fieldTypeMap.get(fieldName)!;
                    const fieldType = typeof fieldValue;
                    typeMap.set(fieldType, (typeMap.get(fieldType) || 0) + 1);
                });
            }
        });

        const totalUniqueEvents = eventsToAnalyze.length;

        // Calculate prevalence and categorize fields
        const commonFields = Array.from(fieldEventMap.entries())
            .map(([fieldName, eventSet]) => {
                const eventCount = eventSet.size;
                const prevalence = (eventCount / totalUniqueEvents) * 100;

                // Determine most common type
                const typeMap = fieldTypeMap.get(fieldName)!;
                const dominantType = Array.from(typeMap.entries())
                    .sort((a, b) => b[1] - a[1])[0][0];

                return {
                    fieldName,
                    appearsInEvents: eventCount,
                    totalEvents: totalUniqueEvents,
                    prevalence: Math.round(prevalence * 10) / 10, // Round to 1 decimal
                    dominantType,
                    category: this.categorizeField(fieldName, prevalence)
                };
            })
            .sort((a, b) => b.prevalence - a.prevalence);

        // Group by category
        const universal = commonFields.filter(f => f.category === 'universal');
        const common = commonFields.filter(f => f.category === 'common');
        const occasional = commonFields.filter(f => f.category === 'occasional');
        const rare = commonFields.filter(f => f.category === 'rare');

        return {
            summary: `Analyzed ${result.rows?.length || 0} event samples across ${totalUniqueEvents} unique event types`,
            categories: {
                universal: {
                    description: 'Fields that appear in 80%+ of events (reliable for cross-event queries)',
                    count: universal.length,
                    fields: universal
                },
                common: {
                    description: 'Fields that appear in 50-79% of events (often available)',
                    count: common.length,
                    fields: common
                },
                occasional: {
                    description: 'Fields that appear in 20-49% of events (event-type specific)',
                    count: occasional.length,
                    fields: occasional
                },
                rare: {
                    description: 'Fields that appear in <20% of events (highly specific)',
                    count: rare.length,
                    fields: rare
                }
            },
            recommendations: this.generateFieldRecommendations(universal, common)
        };
    }

    /**
     * Categorize a field based on its prevalence
     */
    private categorizeField(fieldName: string, prevalence: number): string {
        if (prevalence >= 80) return 'universal';
        if (prevalence >= 50) return 'common';
        if (prevalence >= 20) return 'occasional';
        return 'rare';
    }

    /**
     * Generate recommendations for using common fields
     */
    private generateFieldRecommendations(universal: any[], common: any[]): string[] {
        const recommendations: string[] = [];

        if (universal.length > 0) {
            recommendations.push(
                `Universal fields (${universal.map(f => f.fieldName).join(', ')}) can be used reliably in queries that span multiple event types.`
            );
        }

        if (common.length > 0) {
            recommendations.push(
                `Common fields (${common.map(f => f.fieldName).join(', ')}) are available in most events - consider checking for null values when querying.`
            );
        }

        recommendations.push(
            'For event-specific fields, use get_event_field_samples(eventId) to understand the exact structure before writing queries.'
        );

        return recommendations;
    }

    /**
     * Get event schema - available customDimensions fields for a specific event ID
     */
    private async getEventSchema(eventId: string, sampleSize: number = 100): Promise<any> {
        const kql = `
traces
| where timestamp >= ago(10d)
| where tostring(customDimensions.eventId) == "${eventId}"
        | take ${sampleSize}
        | project customDimensions
        `.trim();

        // Execute the query
        const result = await this.executeQuery(kql, false, false); if (result.type === 'error') {
            throw new Error(result.summary);
        }

        // Extract unique field names from customDimensions
        const fieldMap = new Map<string, Set<any>>();

        result.rows?.forEach((row: any[]) => {
            const customDims = row[0];
            if (typeof customDims === 'object' && customDims !== null) {
                Object.keys(customDims).forEach(key => {
                    if (!fieldMap.has(key)) {
                        fieldMap.set(key, new Set());
                    }
                    // Store up to 5 example values
                    const examples = fieldMap.get(key)!;
                    if (examples.size < 5) {
                        examples.add(customDims[key]);
                    }
                });
            }
        });

        // Build schema with field names and example values
        const fields = Array.from(fieldMap.entries()).map(([fieldName, exampleValues]) => ({
            fieldName,
            exampleValues: Array.from(exampleValues).slice(0, 5),
            occurrences: result.rows?.filter((row: any[]) => {
                const customDims = row[0];
                return customDims && typeof customDims === 'object' && fieldName in customDims;
            }).length || 0
        }));

        return {
            eventId,
            sampleSize: result.rows?.length || 0,
            fields: fields.sort((a, b) => b.occurrences - a.occurrences), // Sort by frequency
            usage: {
                summary: `Event ${eventId} has ${fields.length} unique customDimensions fields`,
                mostCommonFields: fields.slice(0, 10).map(f => f.fieldName),
                exampleQuery: `traces\n| where timestamp >= ago(1d)\n| where tostring(customDimensions.eventId) == "${eventId}"\n| project timestamp, message, ${fields.slice(0, 5).map(f => `customDimensions.${f.fieldName}`).join(', ')}`
            }
        };
    }

    /**
     * Get event field samples - Enhanced field discovery with data types and occurrence rates
     * Shows actual customDimensions structure from real telemetry events
     */
    private async getEventFieldSamples(eventId: string, sampleCount: number = 10, daysBack: number = 30): Promise<any> {
        const kql = `
traces
| where timestamp >= ago(${daysBack}d)
| where tostring(customDimensions.eventId) == "${eventId}"
        | take ${sampleCount}
        | project timestamp, message, customDimensions
        `.trim();

        // Execute the query
        const result = await this.executeQuery(kql, false, false); if (result.type === 'error') {
            throw new Error(result.summary);
        }

        if (!result.rows || result.rows.length === 0) {
            throw new Error(`No events found for eventId "${eventId}" in the last ${daysBack} days. Try increasing daysBack or check if the eventId is correct.`);
        }

        // Analyze all customDimensions to find field patterns
        interface FieldStats {
            types: Set<string>;
            values: any[];
            nullCount: number;
            totalCount: number;
        }

        const fieldStats = new Map<string, FieldStats>();

        result.rows.forEach((row: any[]) => {
            let customDims = row[2]; // customDimensions is now third column (timestamp, message, customDimensions)

            // Application Insights returns customDimensions as a JSON string - parse it
            if (typeof customDims === 'string') {
                try {
                    customDims = JSON.parse(customDims);
                } catch (e) {
                    console.warn(`Failed to parse customDimensions for row:`, customDims);
                    return;
                }
            }

            if (!customDims || typeof customDims !== 'object') {
                return;
            }

            Object.entries(customDims).forEach(([key, value]) => {
                if (!fieldStats.has(key)) {
                    fieldStats.set(key, {
                        types: new Set<string>(),
                        values: [],
                        nullCount: 0,
                        totalCount: 0
                    });
                }

                const stats = fieldStats.get(key)!;
                stats.totalCount++;

                if (value === null || value === undefined || value === '') {
                    stats.nullCount++;
                } else {
                    // Detect actual type
                    const actualType = typeof value === 'number' ? 'number' :
                        typeof value === 'boolean' ? 'boolean' :
                            value instanceof Date ? 'datetime' :
                                'string';
                    stats.types.add(actualType);

                    // Store up to 3 distinct sample values
                    if (stats.values.length < 3 && !stats.values.includes(value)) {
                        stats.values.push(value);
                    }
                }
            });
        });

        // Convert to output format
        const fields = Array.from(fieldStats.entries())
            .map(([fieldName, stats]) => ({
                fieldName,
                dataType: Array.from(stats.types)[0] || 'string', // Primary type
                occurrenceRate: Math.round((stats.totalCount / result.rows!.length) * 100), // Percentage
                sampleValues: stats.values.slice(0, 3),
                isAlwaysPresent: stats.totalCount === result.rows!.length,
                nullCount: stats.nullCount
            }))
            .sort((a, b) => b.occurrenceRate - a.occurrenceRate); // Most common first

        // Generate example query with proper extends for top fields
        const topFields = fields
            .filter(f => f.occurrenceRate >= 50) // Only fields in >50% of samples
            .slice(0, 10); // Max 10 fields

        const extendStatements = topFields
            .map(f => {
                // Use appropriate conversion based on data type
                const conversion = f.dataType === 'number' ? 'toreal' :
                    f.dataType === 'boolean' ? 'tobool' :
                        f.dataType === 'datetime' ? 'todatetime' :
                            'tostring';
                return `    ${f.fieldName} = ${conversion}(customDimensions.${f.fieldName})`;
            })
            .join(',\n');

        const exampleQuery = `traces
| where timestamp > ago(7d)
| where tostring(customDimensions.eventId) == "${eventId}"
| extend
${extendStatements}
| take 100`;

        // Lookup event category from Microsoft Learn
        const firstSampleMessage = result.rows[0][1]; // message from first sample
        let firstSampleDimensions = result.rows[0][2]; // customDimensions from first sample

        // Parse customDimensions if it's a JSON string
        if (typeof firstSampleDimensions === 'string') {
            try {
                firstSampleDimensions = JSON.parse(firstSampleDimensions);
            } catch (e) {
                console.warn(`Failed to parse customDimensions for category lookup:`, firstSampleDimensions);
            }
        }

        const categoryInfo = await lookupEventCategory(eventId, firstSampleDimensions, firstSampleMessage);

        return {
            eventId,
            // Event category information (from Microsoft Learn or inferred)
            category: categoryInfo.category,
            subcategory: categoryInfo.subcategory,
            documentationUrl: categoryInfo.documentationUrl,
            description: categoryInfo.description,
            isStandardEvent: categoryInfo.isStandardEvent,
            categorySource: categoryInfo.source, // 'microsoft-learn', 'custom-analysis', or 'cache'
            // Field analysis
            samplesAnalyzed: result.rows.length,
            timeRange: {
                from: result.rows[result.rows.length - 1][0], // First timestamp
                to: result.rows[0][0] // Last timestamp
            },
            fields,
            summary: {
                totalFields: fields.length,
                alwaysPresentFields: fields.filter(f => f.isAlwaysPresent).length,
                optionalFields: fields.filter(f => !f.isAlwaysPresent).length
            },
            exampleQuery,
            recommendations: [
                categoryInfo.isStandardEvent && categoryInfo.documentationUrl
                    ? `📖 Official documentation: ${categoryInfo.documentationUrl}`
                    : `💡 This appears to be a custom event - analyze customDimensions to understand its purpose`,
                `Use the exampleQuery above as a starting point for your analysis`,
                `Fields with 100% occurrence rate are always available`,
                fields.filter(f => !f.isAlwaysPresent).length > 0
                    ? `${fields.filter(f => !f.isAlwaysPresent).length} optional fields may be null - handle accordingly`
                    : 'All fields are consistently present'
            ]
        };
    }

    /**
     * Get tenant ID mapping for company names
     * Maps customer/company names to aadTenantId for filtering telemetry
     */
    private async getTenantMapping(daysBack: number = 10, companyNameFilter?: string): Promise<any> {
        let kql = `traces
| where timestamp >= ago(${daysBack}d)
| where isnotempty(customDimensions.companyName)
| extend aadTenantId = tostring(customDimensions.aadTenantId)
  , companyName = tostring(customDimensions.companyName)
| summarize count() by aadTenantId, companyName
| project companyName, aadTenantId, count_`;

        // Add optional filter for specific company name
        if (companyNameFilter) {
            kql += `\n| where companyName contains "${companyNameFilter}"`;
        }

        // Execute the query using the wrapper method
        const result = await this.executeQuery(kql, false, false);

        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        interface TenantMapping {
            companyName: string;
            aadTenantId: string;
            occurrences: number;
        }

        const mappings: TenantMapping[] = (result.rows || []).map((row: any[]) => ({
            companyName: row[0],
            aadTenantId: row[1],
            occurrences: row[2]
        }));

        return {
            daysBack,
            totalMappings: mappings.length,
            mappings: mappings.sort((a: TenantMapping, b: TenantMapping) => b.occurrences - a.occurrences), // Sort by frequency
            usage: {
                summary: `Found ${mappings.length} company-to-tenant mappings in the last ${daysBack} days`,
                recommendation: 'Use aadTenantId for filtering telemetry queries. Example: | where tostring(customDimensions.aadTenantId) == "{tenantId}"'
            }
        };
    }

    /**
     * List all available profiles in the configuration
     * Shows current active profile and all other available profiles
     */
    private listProfiles(): any {
        const fs = require('fs');
        const path = require('path');

        try {
            // Check if workspace has a config file
            const configPath = path.join(this.config.workspacePath, '.bctb-config.json');

            if (!fs.existsSync(configPath)) {
                return {
                    profileMode: 'single',
                    currentProfile: {
                        name: 'default',
                        connectionName: this.config.connectionName,
                        isActive: true
                    },
                    availableProfiles: [],
                    message: 'Single profile mode - using workspace settings or environment variables'
                };
            }

            // Read config file
            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            // Check if multi-profile format
            if (!config.profiles || Object.keys(config.profiles).length === 0) {
                return {
                    profileMode: 'single',
                    currentProfile: {
                        name: 'default',
                        connectionName: config.connectionName || this.config.connectionName,
                        isActive: true
                    },
                    availableProfiles: [],
                    message: 'Single profile mode - config file has no profiles object'
                };
            }

            // Multi-profile mode - list all profiles
            const currentProfileName = process.env.BCTB_CURRENT_PROFILE || config.defaultProfile || 'default';

            const profiles = Object.entries(config.profiles)
                .filter(([name]) => !name.startsWith('_')) // Filter out base profiles
                .map(([name, profileConfig]: [string, any]) => ({
                    name,
                    connectionName: profileConfig.connectionName || name,
                    isActive: name === currentProfileName,
                    applicationInsightsAppId: profileConfig.applicationInsightsAppId,
                    authFlow: profileConfig.authFlow,
                    extends: profileConfig.extends
                }));

            const currentProfile = profiles.find(p => p.isActive);

            return {
                profileMode: 'multi',
                currentProfile: currentProfile || {
                    name: currentProfileName,
                    connectionName: this.config.connectionName,
                    isActive: true
                },
                availableProfiles: profiles.filter(p => !p.isActive),
                totalProfiles: profiles.length,
                message: `Multi-profile configuration with ${profiles.length} profile(s). Currently using: ${currentProfileName}`,
                usage: {
                    summary: 'This workspace has multiple telemetry profiles configured for different customers/environments',
                    switchingInstructions: 'To switch profiles, use the status bar in VS Code or the command palette. The MCP server will automatically use the active profile.',
                    noteForQueries: 'All queries execute against the currently active profile. Use list_profiles to confirm which profile is active before running queries.'
                }
            };
        } catch (error: any) {
            return {
                profileMode: 'error',
                error: error.message,
                currentProfile: {
                    name: 'unknown',
                    connectionName: this.config.connectionName,
                    isActive: true
                },
                availableProfiles: []
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
     * Start the server in HTTP mode (for legacy MCPClient)
     */
    async startHTTP(): Promise<void> {
        const port = this.config.port;

        this.app.listen(port, () => {
            console.error(`\n✓ MCP Server listening on port ${port}`);
            console.error(`Ready to receive requests\n`);
        });

        // Only authenticate if configuration is complete
        if (this.configErrors.length === 0) {
            // Authenticate immediately on startup
            // For device_code flow, this triggers the browser login before any queries
            // For client_credentials flow, this validates credentials early
            console.error('Authenticating...');
            try {
                await this.auth.authenticate();
                console.error('✓ Authentication successful\n');
            } catch (error: any) {
                console.error('❌ Authentication failed:', error.message);
                console.error('You can retry authentication when running your first query.\n');
            }
        } else {
            console.error('⚠️  Skipping authentication (configuration incomplete)\n');
        }

        // Graceful shutdown
        process.on('SIGINT', async () => {
            console.error('\nShutting down gracefully...');
            await this.usageTelemetry.flush();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            console.error('\nShutting down gracefully...');
            await this.usageTelemetry.flush();
            process.exit(0);
        });
    }

    /**
     * Start the server in stdio mode (for VSCode MCP infrastructure)
     */
    async startStdio(): Promise<void> {
        // Console redirection is already done in startup code before constructor
        // to prevent constructor logs from breaking JSON-RPC

        // Only authenticate if configuration is complete
        if (this.configErrors.length === 0) {
            // Authenticate silently (no console output that breaks JSON-RPC)
            try {
                await this.auth.authenticate();
            } catch (error: any) {
                // Errors will be returned through tool responses
            }
        }

        // Handle JSON-RPC messages from stdin
        let buffer = '';
        process.stdin.setEncoding('utf8');

        process.stdin.on('data', async (chunk) => {
            buffer += chunk;
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
                if (!line.trim()) continue;

                try {
                    const request = JSON.parse(line);
                    const response = await this.handleStdioJSONRPC(request);
                    // Only send response if not null (notifications don't get responses)
                    if (response !== null) {
                        process.stdout.write(JSON.stringify(response) + '\n');
                    }
                } catch (error: any) {
                    // Silently ignore malformed requests - they will timeout
                }
            }
        });

        process.stdin.on('end', async () => {
            await this.usageTelemetry.flush();
            process.exit(0);
        });

        // Graceful shutdown
        process.on('SIGINT', async () => {
            await this.usageTelemetry.flush();
            process.exit(0);
        });

        process.on('SIGTERM', async () => {
            await this.usageTelemetry.flush();
            process.exit(0);
        });
    }

    /**
     * Handle JSON-RPC request for stdio mode
     */
    private async handleStdioJSONRPC(request: any): Promise<any> {
        const { id, method, params } = request;

        // Handle notifications (no id field) - don't send a response
        if (id === undefined || id === null) {
            // Notifications like "notifications/initialized" don't expect a response
            if (method?.startsWith('notifications/')) {
                // Just acknowledge it silently
                return null;
            }
            // Other methods without id are malformed
            return {
                jsonrpc: '2.0',
                id: null,
                error: {
                    code: -32600,
                    message: 'Invalid Request: missing id field for non-notification method'
                }
            };
        }

        try {
            let result: any;

            switch (method) {
                case 'initialize':
                    result = {
                        protocolVersion: '2024-11-05',
                        serverInfo: {
                            name: 'BC Telemetry Buddy',
                            version: '0.1.0'
                        },
                        capabilities: {
                            tools: {}
                        }
                    };
                    break;

                case 'tools/list':
                    // Return same format as HTTP mode
                    result = {
                        tools: [
                            {
                                name: 'query_telemetry',
                                description: 'Execute a KQL query against Business Central telemetry data. CRITICAL PREREQUISITE: You MUST call get_event_catalog() FIRST to discover available event IDs, then call get_event_field_samples() to understand field structure BEFORE constructing any KQL query. DO NOT use this tool without completing the discovery flow first.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query string constructed using event IDs from get_event_catalog() and field names from get_event_field_samples()' },
                                        useContext: { type: 'boolean', description: 'Use saved queries as examples', default: true },
                                        includeExternal: { type: 'boolean', description: 'Include external reference queries', default: true }
                                    },
                                    required: ['kql']
                                }
                            },
                            {
                                name: 'get_saved_queries',
                                description: 'List all saved telemetry queries in the workspace',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        tags: { type: 'array', items: { type: 'string' }, description: 'Filter by tags (optional)' }
                                    }
                                }
                            },
                            {
                                name: 'search_queries',
                                description: 'Search saved queries by keywords',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        searchTerms: { type: 'array', items: { type: 'string' }, description: 'Search terms' }
                                    },
                                    required: ['searchTerms']
                                }
                            },
                            {
                                name: 'save_query',
                                description: 'Save a telemetry query for future reference',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        name: { type: 'string', description: 'Query name' },
                                        kql: { type: 'string', description: 'KQL query string' },
                                        purpose: { type: 'string', description: 'Query purpose' },
                                        useCase: { type: 'string', description: 'When to use this query' },
                                        tags: { type: 'array', items: { type: 'string' }, description: 'Tags for categorization' },
                                        category: { type: 'string', description: 'Category/folder for organization' }
                                    },
                                    required: ['name', 'kql']
                                }
                            },
                            {
                                name: 'get_categories',
                                description: 'List all query categories in the workspace',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'get_recommendations',
                                description: 'Get query optimization recommendations',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query to analyze' },
                                        results: { type: 'object', description: 'Query results to analyze' }
                                    }
                                }
                            },
                            {
                                name: 'get_external_queries',
                                description: 'Get example queries from external references',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            },
                            {
                                name: 'get_event_catalog',
                                description: 'Discover available Business Central telemetry event IDs with descriptions, status, and documentation URLs. Optionally includes analysis of common fields that appear across multiple events. Results are limited to top events by count to prevent overwhelming responses.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to look back (default: 10)', default: 10 },
                                        status: { type: 'string', description: 'Filter by status: all, success, error, too slow, unknown (default: all)', default: 'all' },
                                        minCount: { type: 'number', description: 'Minimum occurrence count to include (default: 1)', default: 1 },
                                        maxResults: { type: 'number', description: 'Maximum number of events to return (default: 50, max: 200)', default: 50 },
                                        includeCommonFields: { type: 'boolean', description: 'Include analysis of common customDimensions fields that appear across multiple events (default: false)', default: false }
                                    }
                                }
                            },
                            {
                                name: 'get_event_schema',
                                description: 'Get schema details for a specific event ID including all customDimensions fields with examples',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        eventId: { type: 'string', description: 'Event ID to analyze (e.g., RT0005, LC0012)' },
                                        sampleSize: { type: 'number', description: 'Number of samples to analyze (default: 100)', default: 100 }
                                    },
                                    required: ['eventId']
                                }
                            },
                            {
                                name: 'get_event_field_samples',
                                description: 'RECOMMENDED: Get detailed field analysis from real telemetry events including data types, occurrence rates, and sample values. Also provides event category information (Performance, Lifecycle, Security, etc.) dynamically fetched from Microsoft Learn documentation. Returns ready-to-use example query with proper type conversions and documentation links. Use this to understand the exact structure of customDimensions before writing queries.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        eventId: { type: 'string', description: 'Event ID to analyze (e.g., RT0005, LC0011)' },
                                        sampleCount: { type: 'number', description: 'Number of events to sample for analysis', default: 10 },
                                        daysBack: { type: 'number', description: 'How many days back to search for events', default: 30 }
                                    },
                                    required: ['eventId']
                                }
                            },
                            {
                                name: 'get_tenant_mapping',
                                description: 'IMPORTANT: BC telemetry uses aadTenantId (not company names) for filtering. Use this tool to map company/customer names to tenant IDs before querying. Always call this first when user asks about a specific customer/company.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to look back for mappings (default: 10)', default: 10 },
                                        companyNameFilter: { type: 'string', description: 'Optional: Filter for specific company name (partial match)' }
                                    }
                                }
                            },
                            {
                                name: 'list_profiles',
                                description: 'List all available telemetry profiles in the workspace configuration. Shows the currently active profile and all other available profiles. Each profile represents a different customer/environment with separate credentials and App Insights configuration. Use this to understand which profiles are available before querying data.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {}
                                }
                            }
                        ]
                    };
                    break;

                case 'tools/call':
                    const toolName = params?.name;
                    const toolParams = params?.arguments || {};
                    const toolResult = await this.executeToolCall(toolName, toolParams);
                    // MCP protocol expects tool results to have content array with text items
                    result = {
                        content: [
                            {
                                type: 'text',
                                text: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)
                            }
                        ]
                    };
                    break;

                case 'query_telemetry':
                    // Execute KQL query
                    const kqlQuery2 = params.kql;

                    if (!kqlQuery2 || kqlQuery2.trim() === '') {
                        throw new Error('kql parameter is required. Use get_event_catalog() to discover events and get_event_field_samples() to understand field structure.');
                    }

                    result = await this.executeQuery(
                        kqlQuery2,
                        params.useContext || false,
                        params.includeExternal || false
                    );
                    break;

                case 'get_saved_queries':
                    result = this.queries.getAllQueries();
                    break;

                case 'search_queries':
                    result = this.queries.searchQueries(params.searchTerms || []);
                    break;

                case 'save_query':
                    const filePath = this.queries.saveQuery(
                        params.name,
                        params.kql,
                        params.purpose,
                        params.useCase,
                        params.tags,
                        params.category,
                        params.companyName
                    );
                    result = { filePath };
                    break;

                case 'get_categories':
                    result = this.queries.getCategories();
                    break;

                case 'get_recommendations':
                    result = await this.generateRecommendations(params.kql, params.results);
                    break;

                case 'get_external_queries':
                    result = await this.references.getAllExternalQueries();
                    break;

                case 'get_event_catalog':
                    result = await this.getEventCatalog(
                        params?.daysBack || 10,
                        params?.status || 'all',
                        params?.minCount || 1,
                        params?.includeCommonFields || false,
                        params?.maxResults || 50
                    );
                    break;

                case 'get_event_schema':
                    if (!params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventSchema(
                        params.eventId,
                        params?.sampleSize || 100
                    );
                    break;

                case 'get_event_field_samples':
                    if (!params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventFieldSamples(
                        params.eventId,
                        params?.sampleCount || 10,
                        params?.daysBack || 30
                    );
                    break;

                case 'get_tenant_mapping':
                    result = await this.getTenantMapping(
                        params?.daysBack || 10,
                        params?.companyNameFilter
                    );
                    break;

                case 'get_cache_stats':
                    result = this.cache.getStats();
                    break;

                case 'clear_cache':
                    this.cache.clear();
                    result = { success: true, message: 'Cache cleared successfully' };
                    break;

                case 'cleanup_cache':
                    this.cache.cleanupExpired();
                    const cleanupStats = this.cache.getStats();
                    result = { success: true, message: `Cleaned up expired entries. ${cleanupStats.totalEntries} entries remaining`, stats: cleanupStats };
                    break;

                default:
                    throw new Error(`Unknown method: ${method}`);
            }

            return {
                jsonrpc: '2.0',
                id,
                result
            };
        } catch (error: any) {
            return {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: error.message
                }
            };
        }
    }

    /**
     * Execute tool call (for stdio mode tools/call)
     */
    private async executeToolCall(toolName: string, params: any): Promise<any> {
        const startTime = Date.now();
        const profileHash = this.config.connectionName ? hashValue(this.config.connectionName).substring(0, 16) : undefined;

        try {
            let result: any;

            switch (toolName) {
                case 'query_telemetry':
                    // Execute KQL query
                    const kqlQuery3 = params.kql;

                    if (!kqlQuery3 || kqlQuery3.trim() === '') {
                        throw new Error('kql parameter is required. PREREQUISITE: Call get_event_catalog() to discover events and get_event_field_samples() to understand field structure BEFORE constructing queries.');
                    }

                    result = await this.executeQuery(
                        kqlQuery3,
                        params.useContext || false,
                        params.includeExternal || false
                    );
                    break;

                case 'get_saved_queries':
                    result = this.queries.getAllQueries();
                    break;

                case 'search_queries':
                    result = this.queries.searchQueries(params.searchTerms || []);
                    break;

                case 'save_query':
                    const filePath = this.queries.saveQuery(
                        params.name,
                        params.kql,
                        params.purpose,
                        params.useCase,
                        params.tags,
                        params.category,
                        params.companyName
                    );
                    result = { filePath };
                    break;

                case 'get_categories':
                    result = this.queries.getCategories();
                    break;

                case 'get_recommendations':
                    result = await this.generateRecommendations(params.kql, params.results);
                    break;

                case 'get_external_queries':
                    result = await this.references.getAllExternalQueries();
                    break;

                case 'get_event_catalog':
                    result = await this.getEventCatalog(
                        params?.daysBack || 10,
                        params?.status || 'all',
                        params?.minCount || 1,
                        params?.includeCommonFields || false
                    );
                    break;

                case 'get_event_schema':
                    if (!params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventSchema(
                        params.eventId,
                        params?.sampleSize || 100
                    );
                    break;

                case 'get_event_field_samples':
                    if (!params?.eventId) {
                        throw new Error('eventId parameter is required');
                    }
                    result = await this.getEventFieldSamples(
                        params.eventId,
                        params?.sampleCount || 20,
                        params?.daysBack || 7
                    );
                    break;

                case 'get_tenant_mapping':
                    result = await this.getTenantMapping(
                        params?.daysBack || 10,
                        params?.companyNameFilter
                    );
                    break;

                case 'get_cache_stats':
                    result = this.cache.getStats();
                    break;

                case 'clear_cache':
                    this.cache.clear();
                    result = { success: true, message: 'Cache cleared successfully' };
                    break;

                case 'list_profiles':
                    result = this.listProfiles();
                    break;

                case 'cleanup_cache':
                    this.cache.cleanupExpired();
                    const stats = this.cache.getStats();
                    result = { success: true, message: `Cleaned up expired entries. ${stats.totalEntries} entries remaining`, stats };
                    break;

                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }

            // Track successful tool completion
            const durationMs = Date.now() - startTime;
            const completedProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP_TOOLS.QUERY_TELEMETRY, // Will be replaced per tool
                'mcp',
                this.sessionId,
                this.installationId,
                VERSION,
                {
                    toolName,
                    profileHash
                }
            );
            this.usageTelemetry.trackEvent('Mcp.ToolCompleted', cleanTelemetryProperties(completedProps), { duration: durationMs });

            return result;
        } catch (error: any) {
            // Track failed tool completion
            const durationMs = Date.now() - startTime;
            const errorType = error?.constructor?.name || 'UnknownError';
            const failedProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.sessionId,
                this.installationId,
                VERSION,
                {
                    toolName,
                    profileHash,
                    errorType
                }
            );
            this.usageTelemetry.trackEvent('Mcp.ToolFailed', cleanTelemetryProperties(failedProps), { duration: durationMs });

            // Also track exception
            const exceptionProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.sessionId,
                this.installationId,
                VERSION,
                {
                    toolName,
                    profileHash,
                    errorType,
                    operation: 'tool'
                }
            );
            if (error instanceof Error) {
                this.usageTelemetry.trackException(error, cleanTelemetryProperties(exceptionProps) as Record<string, string>);
            }

            throw error;
        }
    }
}

/**
 * Start the MCP server
 * @param config Configuration object (if not provided, loads from env vars)
 * @param mode 'stdio' or 'http'
 */
/**
 * Check for MCP updates by querying npm registry
 */
async function checkForUpdates(): Promise<void> {
    return new Promise<void>((resolve) => {
        // Set a timeout so update check doesn't delay startup
        const timeoutId = setTimeout(() => {
            resolve();
        }, 5000); // 5 second timeout

        const options = {
            hostname: 'registry.npmjs.org',
            path: '/bc-telemetry-buddy-mcp/latest',
            method: 'GET',
            headers: {
                'User-Agent': 'bc-telemetry-buddy-mcp'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                clearTimeout(timeoutId);
                try {
                    const packageInfo = JSON.parse(data);
                    const latestVersion = packageInfo.version;

                    if (latestVersion && latestVersion !== VERSION) {
                        console.error('\n⚠️  ═══════════════════════════════════════════════════════');
                        console.error('⚠️  MCP UPDATE AVAILABLE');
                        console.error('⚠️  ═══════════════════════════════════════════════════════');
                        console.error(`⚠️  Current version: ${VERSION}`);
                        console.error(`⚠️  Latest version:  ${latestVersion}`);
                        console.error('⚠️');
                        console.error('⚠️  Update with: npm install -g bc-telemetry-buddy-mcp@latest');
                        console.error('⚠️  Or use VSCode command: "BC Telemetry Buddy: Check for MCP Updates"');
                        console.error('⚠️  ═══════════════════════════════════════════════════════\n');
                    }
                } catch (error) {
                    // Silently ignore JSON parse errors
                }
                resolve();
            });
        });

        req.on('error', () => {
            // Silently ignore network errors
            clearTimeout(timeoutId);
            resolve();
        });

        req.end();
    });
}

export async function startServer(config?: MCPConfig, mode?: 'stdio' | 'http'): Promise<void> {
    // Detect mode if not specified
    const forcedMode = mode || process.env.BCTB_MODE?.toLowerCase() as 'stdio' | 'http' | undefined;
    const isStdioMode = forcedMode === 'stdio' ? true
        : forcedMode === 'http' ? false
            : !process.stdin.isTTY;

    // If stdio mode, redirect console output BEFORE creating server instance
    // This ensures any accidental console.log() calls don't break JSON-RPC protocol
    if (isStdioMode) {
        console.log = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };

        console.error = (...args: any[]) => {
            process.stderr.write('[MCP] ' + args.join(' ') + '\n');
        };
    }

    try {
        const server = new MCPServer(config, isStdioMode ? 'stdio' : 'http');

        // Check for updates asynchronously (don't await - let it run in background)
        if (!isStdioMode) {
            checkForUpdates().catch(() => { });
        }

        if (isStdioMode) {
            await server.startStdio();
        } else {
            await server.startHTTP();
        }
    } catch (error: any) {
        console.error('\n⚠️  MCP Server encountered a fatal error during startup:');
        console.error(error.message);
        console.error('\nTroubleshooting:');
        console.error('- If using VSCode: Run "BC Telemetry Buddy: Setup Wizard" from Command Palette to configure.');
        console.error('- If using Claude Desktop or other MCP clients: Configure environment variables in your MCP settings.');
        console.error('- Or run "bctb-mcp init" to create a .bctb-config.json file.');
        console.error('\nServer cannot start without valid configuration.\n');
        process.exit(1);
    }
}

// Note: No auto-start here - launcher.js calls startServer() explicitly
// This prevents double execution when bundled with esbuild
