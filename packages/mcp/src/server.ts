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
 * Query pattern metadata for provenance tracking
 */
interface QueryPatternMetadata {
    source: string;                     // "external:reference-name/path/file.kql" | "local:Category/Query.kql" | "ai-generated"
    sourceReference?: string;           // Human-readable reference name from MCP config
    similarity?: number;                // 0-1 confidence score for pattern matching
    modifications?: string[];           // List of adaptations made to pattern
    alternativePatterns?: PatternMatch[]; // Other relevant patterns found
}

/**
 * Pattern match result
 */
interface PatternMatch {
    source: string;                     // Where pattern came from
    sourceReference?: string;           // Human-readable reference name
    similarity: number;                 // Match confidence 0-1
    query: SavedQuery | ExternalQuery;  // The matched query
    keywords: string[];                 // Matching keywords
}

/**
 * Query result for LLM consumption (enhanced with metadata)
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
    metadata?: QueryPatternMetadata;    // NEW: Pattern provenance
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
                case 'tools/list':
                    // MCP protocol: list available tools for Copilot discovery
                    result = {
                        tools: [
                            {
                                name: 'query_telemetry',
                                description: 'Query Business Central telemetry using KQL or natural language',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query string' },
                                        nl: { type: 'string', description: 'Natural language query' },
                                        useContext: { type: 'boolean', description: 'Use saved queries as context', default: true },
                                        includeExternal: { type: 'boolean', description: 'Include external reference queries', default: true }
                                    }
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
                                description: 'Get a catalog of recent Business Central telemetry event IDs with descriptions, frequencies, and Learn URLs. RECOMMENDED FIRST STEP when exploring telemetry or understanding what events are available.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to analyze (default: 10)', default: 10 },
                                        status: { type: 'string', enum: ['all', 'success', 'error', 'too slow', 'unknown'], description: 'Filter by event status', default: 'all' },
                                        minCount: { type: 'number', description: 'Minimum occurrence count to include', default: 1 }
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
                            }
                        ]
                    };
                    break;

                case 'query_telemetry':
                    // Handle both KQL and natural language queries
                    let kqlQuery = rpcRequest.params.kql;
                    let queryMetadata: QueryPatternMetadata | undefined;

                    if (!kqlQuery && rpcRequest.params.nl) {
                        // Natural language query - translate to KQL using pattern matching
                        const translation = await this.translateNLToKQL(
                            rpcRequest.params.nl,
                            rpcRequest.params.useContext || false,
                            rpcRequest.params.includeExternal || false
                        );
                        kqlQuery = translation.kql;
                        queryMetadata = translation.metadata;
                    }

                    if (!kqlQuery) {
                        throw new Error('Either kql or nl parameter is required');
                    }

                    result = await this.executeQuery(
                        kqlQuery,
                        rpcRequest.params.useContext || false,
                        rpcRequest.params.includeExternal || false
                    );

                    // Add metadata to result if available
                    if (queryMetadata) {
                        result.metadata = queryMetadata;
                    }
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
                    result = this.auth.getStatus();
                    break;

                case 'get_external_queries':
                    result = await this.references.getAllExternalQueries();
                    break;

                case 'get_event_catalog':
                    result = await this.getEventCatalog(
                        rpcRequest.params?.daysBack || 10,
                        rpcRequest.params?.status || 'all',
                        rpcRequest.params?.minCount || 1
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

            console.error(`[MCP] RPC Error in ${rpcRequest.method}:`, errorMessage);
            if (error.stack) {
                console.error('[MCP] Stack:', error.stack);
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
     * Find similar query patterns from saved and external sources
     */
    private async findSimilarPatterns(
        intent: string,
        useContext: boolean,
        includeExternal: boolean
    ): Promise<PatternMatch[]> {
        const keywords = this.extractKeywords(intent);
        const matches: PatternMatch[] = [];

        console.log(`Searching for patterns matching keywords: ${keywords.join(', ')}`);

        // Search local saved queries
        if (useContext) {
            const savedQueries = this.queries.getAllQueries();
            for (const query of savedQueries) {
                const similarity = this.calculateSimilarity(query, keywords);
                if (similarity > 0.3) { // Minimum threshold
                    matches.push({
                        source: `local:${query.category || 'Uncategorized'}/${query.name}`,
                        similarity,
                        query,
                        keywords: this.getMatchingKeywords(query, keywords)
                    });
                }
            }
        }

        // Search external references
        if (includeExternal) {
            const externalQueries = await this.references.getAllExternalQueries();
            for (const query of externalQueries) {
                const similarity = this.calculateExternalSimilarity(query, keywords);
                if (similarity > 0.3) { // Minimum threshold
                    matches.push({
                        source: `external:${query.source}/${query.fileName}`,
                        sourceReference: query.source, // Reference name from MCP config
                        similarity,
                        query,
                        keywords: this.getMatchingKeywordsExternal(query, keywords)
                    });
                }
            }
        }

        // Sort by similarity (best matches first)
        matches.sort((a, b) => b.similarity - a.similarity);

        console.log(`Found ${matches.length} matching patterns`);
        if (matches.length > 0) {
            console.log(`Best match: ${matches[0].source} (similarity: ${matches[0].similarity.toFixed(2)})`);
        }

        return matches;
    }

    /**
     * Extract keywords from natural language intent
     */
    private extractKeywords(intent: string): string[] {
        const lower = intent.toLowerCase();
        const keywords: string[] = [];

        // Time-related keywords
        if (lower.includes('24 hour') || lower.includes('last day') || lower.includes('yesterday')) keywords.push('24h', 'recent', 'daily');
        if (lower.includes('hour')) keywords.push('1h', 'hourly');
        if (lower.includes('week') || lower.includes('7 day')) keywords.push('7d', 'weekly');
        if (lower.includes('month') || lower.includes('30 day')) keywords.push('30d', 'monthly');

        // Error-related keywords
        if (lower.includes('error')) keywords.push('error', 'errors', 'severitylevel');
        if (lower.includes('warning')) keywords.push('warning', 'warnings');
        if (lower.includes('exception')) keywords.push('exception', 'exceptions');
        if (lower.includes('fail')) keywords.push('failure', 'failed', 'error');

        // Performance keywords
        if (lower.includes('slow')) keywords.push('performance', 'duration', 'slow');
        if (lower.includes('performance')) keywords.push('performance', 'duration');
        if (lower.includes('timeout')) keywords.push('timeout', 'duration', 'slow');

        // Telemetry type keywords
        if (lower.includes('page') || lower.includes('view')) keywords.push('pageviews', 'page');
        if (lower.includes('request')) keywords.push('requests', 'http');
        if (lower.includes('dependency') || lower.includes('database') || lower.includes('sql')) keywords.push('dependencies', 'sql', 'database');
        if (lower.includes('trace')) keywords.push('traces', 'trace');

        // Business Central specific
        if (lower.includes('bc') || lower.includes('business central')) keywords.push('bc', 'businesscentral');
        if (lower.includes('user')) keywords.push('user', 'users');
        if (lower.includes('session')) keywords.push('session', 'sessions');

        // Monitoring keywords
        if (lower.includes('monitor')) keywords.push('monitoring', 'health');
        if (lower.includes('health')) keywords.push('health', 'monitoring');

        return [...new Set(keywords)]; // Remove duplicates
    }

    /**
     * Calculate similarity between saved query and keywords
     */
    private calculateSimilarity(query: SavedQuery, keywords: string[]): number {
        let score = 0;
        const maxScore = keywords.length;

        if (maxScore === 0) return 0;

        // Check tags
        if (query.tags) {
            for (const keyword of keywords) {
                if (query.tags.some(tag => tag.toLowerCase().includes(keyword) || keyword.includes(tag.toLowerCase()))) {
                    score += 1;
                }
            }
        }

        // Check purpose and use case
        const text = `${query.purpose || ''} ${query.useCase || ''} ${query.name || ''}`.toLowerCase();
        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                score += 0.5;
            }
        }

        // Check KQL content
        const kql = (query.kql || '').toLowerCase();
        for (const keyword of keywords) {
            if (kql.includes(keyword)) {
                score += 0.3;
            }
        }

        return Math.min(score / maxScore, 1.0);
    }

    /**
     * Calculate similarity for external query
     */
    private calculateExternalSimilarity(query: ExternalQuery, keywords: string[]): number {
        let score = 0;
        const maxScore = keywords.length;

        if (maxScore === 0) return 0;

        // Check filename
        const fileName = query.fileName.toLowerCase();
        for (const keyword of keywords) {
            if (fileName.includes(keyword)) {
                score += 1;
            }
        }

        // Check content
        const content = (query.content || '').toLowerCase();
        for (const keyword of keywords) {
            if (content.includes(keyword)) {
                score += 0.5;
            }
        }

        return Math.min(score / maxScore, 1.0);
    }

    /**
     * Get matching keywords from saved query
     */
    private getMatchingKeywords(query: SavedQuery, keywords: string[]): string[] {
        const matches: string[] = [];
        const text = `${query.purpose || ''} ${query.useCase || ''} ${query.name || ''} ${query.tags?.join(' ') || ''}`.toLowerCase();

        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                matches.push(keyword);
            }
        }

        return matches;
    }

    /**
     * Get matching keywords from external query
     */
    private getMatchingKeywordsExternal(query: ExternalQuery, keywords: string[]): string[] {
        const matches: string[] = [];
        const text = `${query.fileName} ${query.content || ''}`.toLowerCase();

        for (const keyword of keywords) {
            if (text.includes(keyword)) {
                matches.push(keyword);
            }
        }

        return matches;
    }

    /**
     * Adapt pattern to user intent (extract and modify parameters)
     */
    private adaptPattern(patternKql: string, intent: string): { kql: string; modifications: string[] } {
        let adaptedKql = patternKql;
        const modifications: string[] = [];

        // Extract time range from intent
        const intentLower = intent.toLowerCase();

        // Time range adaptation
        if (intentLower.includes('24 hour') || intentLower.includes('last day') || intentLower.includes('yesterday')) {
            if (patternKql.includes('ago(')) {
                adaptedKql = adaptedKql.replace(/ago\([^)]+\)/g, 'ago(1d)');
                modifications.push('Changed time range to 24 hours');
            }
        } else if (intentLower.includes('last hour')) {
            if (patternKql.includes('ago(')) {
                adaptedKql = adaptedKql.replace(/ago\([^)]+\)/g, 'ago(1h)');
                modifications.push('Changed time range to 1 hour');
            }
        } else if (intentLower.includes('week') || intentLower.includes('7 day')) {
            if (patternKql.includes('ago(')) {
                adaptedKql = adaptedKql.replace(/ago\([^)]+\)/g, 'ago(7d)');
                modifications.push('Changed time range to 7 days');
            }
        } else if (intentLower.includes('month') || intentLower.includes('30 day')) {
            if (patternKql.includes('ago(')) {
                adaptedKql = adaptedKql.replace(/ago\([^)]+\)/g, 'ago(30d)');
                modifications.push('Changed time range to 30 days');
            }
        }

        // Severity level adaptation for errors
        if (intentLower.includes('error') && !patternKql.includes('severityLevel')) {
            if (patternKql.includes('| where timestamp')) {
                adaptedKql = adaptedKql.replace('| where timestamp', '| where severityLevel >= 3\n| where timestamp');
                modifications.push('Added error severity filter');
            }
        }

        return { kql: adaptedKql, modifications };
    }

    /**
     * Translate natural language to KQL using pattern matching
     * Phase 1: Search for similar patterns
     * Phase 2: Adapt best match or fall back to keyword-based generation
     */
    private async translateNLToKQL(
        nl: string,
        useContext: boolean,
        includeExternal: boolean
    ): Promise<{ kql: string; metadata: QueryPatternMetadata }> {
        console.log(`Translating NL to KQL: "${nl}"`);

        // Phase 1: Find similar patterns
        const patterns = await this.findSimilarPatterns(nl, useContext, includeExternal);

        // Phase 2: Use best pattern if similarity is high enough
        if (patterns.length > 0 && patterns[0].similarity >= 0.5) {
            const bestMatch = patterns[0];
            console.log(`Using pattern: ${bestMatch.source} (similarity: ${bestMatch.similarity.toFixed(2)})`);

            // Extract KQL from pattern
            let patternKql: string;
            if ('kql' in bestMatch.query) {
                // SavedQuery
                patternKql = (bestMatch.query as SavedQuery).kql || '';
            } else {
                // ExternalQuery
                patternKql = (bestMatch.query as ExternalQuery).content || '';
            }

            // Adapt pattern to user intent
            const { kql, modifications } = this.adaptPattern(patternKql, nl);

            // Build metadata
            const metadata: QueryPatternMetadata = {
                source: bestMatch.source,
                sourceReference: bestMatch.sourceReference,
                similarity: bestMatch.similarity,
                modifications: modifications.length > 0 ? modifications : undefined,
                alternativePatterns: patterns.slice(1, 4).map(p => ({ // Top 3 alternatives
                    source: p.source,
                    sourceReference: p.sourceReference,
                    similarity: p.similarity,
                    query: p.query,
                    keywords: p.keywords
                }))
            };

            console.log(`Adapted query with ${modifications.length} modifications`);
            return { kql, metadata };
        }

        // Phase 3: Fall back to keyword-based generation
        console.log('No suitable pattern found, falling back to keyword-based generation');
        const kql = this.generateKQLFromKeywords(nl);

        const metadata: QueryPatternMetadata = {
            source: 'ai-generated',
            alternativePatterns: patterns.slice(0, 3).map(p => ({ // Show alternatives even if not used
                source: p.source,
                sourceReference: p.sourceReference,
                similarity: p.similarity,
                query: p.query,
                keywords: p.keywords
            }))
        };

        return { kql, metadata };
    }

    /**
     * Generate KQL from keywords (fallback method)
     */
    private generateKQLFromKeywords(nl: string): string {

        // Simple keyword-based translation (basic implementation)
        // This is a fallback for command palette - Copilot Chat will do better
        const nlLower = nl.toLowerCase();
        let kql = '';

        // Detect table
        let table = 'traces';
        if (nlLower.includes('request') || nlLower.includes('page')) {
            table = 'requests';
        } else if (nlLower.includes('dependency') || nlLower.includes('database') || nlLower.includes('sql')) {
            table = 'dependencies';
        } else if (nlLower.includes('exception')) {
            table = 'exceptions';
        } else if (nlLower.includes('pageview')) {
            table = 'pageViews';
        }

        kql = table;

        // Detect time range
        if (nlLower.includes('last 24 hour') || nlLower.includes('last day')) {
            kql += ' | where timestamp > ago(1d)';
        } else if (nlLower.includes('last hour')) {
            kql += ' | where timestamp > ago(1h)';
        } else if (nlLower.includes('last 7 day') || nlLower.includes('last week')) {
            kql += ' | where timestamp > ago(7d)';
        } else {
            kql += ' | where timestamp > ago(1d)'; // Default
        }

        // Detect filters
        if (nlLower.includes('error')) {
            kql += ' | where severityLevel >= 3';
        } else if (nlLower.includes('warning')) {
            kql += ' | where severityLevel == 2';
        }

        // Add limit
        kql += ' | take 100';

        console.log(`Generated KQL: ${kql}`);
        return kql;
    }

    /**
     * Get event catalog - recent BC telemetry event IDs with descriptions, frequencies, and Learn URLs
     */
    private async getEventCatalog(daysBack: number = 10, status: string = 'all', minCount: number = 1): Promise<any> {
        const kql = `
traces
| where timestamp >= ago(${daysBack}d)
| extend eventId = tostring(customDimensions.eventId)
| extend shortMessage = iif(substring(message, 0, 4) == "Task", "Task Executed",
                    iif(eventId == "AL0000JRG", "Job Queue Error",
                        iff(indexof(message, ":") <= 0, message, substring(message, 0, indexof(message, ":")))))
| extend eventStatus = 
    iif(shortMessage has_any ("called","executed","succeeded","rendered","successfully","success","opened", "added", "started", "finished"),"success",
        iif(shortMessage has_any ("error","fail","failed","deadlock","timed out"), "error",
            iif(shortMessage has_any ("exceeded"),"too slow",
                "unknown")))
| summarize count = count() by tostring(eventId), tostring(shortMessage), eventStatus
| extend LearnUrl = strcat("https://learn.microsoft.com/en-us/search/?scope=BusinessCentral&terms=",eventId, "+", replace_string(shortMessage," ","+"))
| project eventId, shortMessage, status=eventStatus, count, LearnUrl
${status !== 'all' ? `| where status == "${status}"` : ''}
| where count >= ${minCount}
| order by count desc
        `.trim();

        console.log(`Getting event catalog (${daysBack} days back, status: ${status}, minCount: ${minCount})...`);

        // Execute the query
        const result = await this.executeQuery(kql, false, false);

        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        // Format the response
        return {
            summary: `Found ${result.rows?.length || 0} event IDs in the last ${daysBack} days`,
            daysBack,
            statusFilter: status,
            minCount,
            events: result.rows?.map((row: any[]) => ({
                eventId: row[0],
                shortMessage: row[1],
                status: row[2],
                count: row[3],
                learnUrl: row[4]
            })) || []
        };
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

        console.log(`Getting schema for event ${eventId} (sample size: ${sampleSize})...`);

        // Execute the query
        const result = await this.executeQuery(kql, false, false);

        if (result.type === 'error') {
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
     * Get tenant ID mapping for company names
     * Maps customer/company names to aadTenantId for filtering telemetry
     */
    private async getTenantMapping(daysBack: number = 10, companyNameFilter?: string): Promise<any> {
        console.log(`Getting tenant mapping (${daysBack} days back, filter: ${companyNameFilter || 'none'})...`);

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
            console.log(`\n✓ MCP Server listening on port ${port}`);
            console.log(`Ready to receive requests\n`);
        });

        // Authenticate immediately on startup
        // For device_code flow, this triggers the browser login before any queries
        // For client_credentials flow, this validates credentials early
        console.log('Authenticating...');
        try {
            await this.auth.authenticate();
            console.log('✓ Authentication successful\n');
        } catch (error: any) {
            console.error('❌ Authentication failed:', error.message);
            console.error('You can retry authentication when running your first query.\n');
        }

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

    /**
     * Start the server in stdio mode (for VSCode MCP infrastructure)
     */
    async startStdio(): Promise<void> {
        // Console redirection is already done in startup code before constructor
        // to prevent constructor logs from breaking JSON-RPC

        console.log('BC Telemetry Buddy MCP Server starting in stdio mode');

        // Authenticate silently (no console output that breaks JSON-RPC)
        try {
            await this.auth.authenticate();
            console.log('Authentication successful');
        } catch (error: any) {
            console.error('Authentication failed:', error.message);
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
                    process.stdout.write(JSON.stringify(response) + '\n');
                } catch (error: any) {
                    console.error('Failed to process request:', error.message);
                }
            }
        });

        process.stdin.on('end', () => {
            console.log('Stdin closed, shutting down');
            process.exit(0);
        });

        // Graceful shutdown
        process.on('SIGINT', () => {
            console.log('Shutting down gracefully...');
            process.exit(0);
        });

        process.on('SIGTERM', () => {
            console.log('Shutting down gracefully...');
            process.exit(0);
        });
    }

    /**
     * Handle JSON-RPC request for stdio mode
     */
    private async handleStdioJSONRPC(request: any): Promise<any> {
        const { id, method, params } = request;

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
                                description: 'Query Business Central telemetry using KQL or natural language',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        kql: { type: 'string', description: 'KQL query string' },
                                        nl: { type: 'string', description: 'Natural language query' },
                                        useContext: { type: 'boolean', description: 'Use saved queries as context', default: true },
                                        includeExternal: { type: 'boolean', description: 'Include external reference queries', default: true }
                                    }
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
                                description: 'Discover available Business Central telemetry event IDs with descriptions, status, and documentation URLs',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to look back (default: 10)', default: 10 },
                                        status: { type: 'string', description: 'Filter by status: all, success, error, too slow, unknown (default: all)', default: 'all' },
                                        minCount: { type: 'number', description: 'Minimum occurrence count to include (default: 1)', default: 1 }
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
                                name: 'get_tenant_mapping',
                                description: 'IMPORTANT: BC telemetry uses aadTenantId (not company names) for filtering. Use this tool to map company/customer names to tenant IDs before querying. Always call this first when user asks about a specific customer/company.',
                                inputSchema: {
                                    type: 'object',
                                    properties: {
                                        daysBack: { type: 'number', description: 'Number of days to look back for mappings (default: 10)', default: 10 },
                                        companyNameFilter: { type: 'string', description: 'Optional: Filter for specific company name (partial match)' }
                                    }
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
                    // Handle both KQL and natural language queries
                    let kqlQuery2 = params.kql;
                    let queryMetadata2: QueryPatternMetadata | undefined;

                    if (!kqlQuery2 && params.nl) {
                        // Natural language query - translate to KQL using pattern matching
                        const translation2 = await this.translateNLToKQL(
                            params.nl,
                            params.useContext || false,
                            params.includeExternal || false
                        );
                        kqlQuery2 = translation2.kql;
                        queryMetadata2 = translation2.metadata;
                    }

                    if (!kqlQuery2) {
                        throw new Error('Either kql or nl parameter is required');
                    }

                    result = await this.executeQuery(
                        kqlQuery2,
                        params.useContext || false,
                        params.includeExternal || false
                    );

                    // Add metadata to result if available
                    if (queryMetadata2) {
                        result.metadata = queryMetadata2;
                    }
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
                        params?.minCount || 1
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

                case 'get_tenant_mapping':
                    result = await this.getTenantMapping(
                        params?.daysBack || 10,
                        params?.companyNameFilter
                    );
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
        switch (toolName) {
            case 'query_telemetry':
                // Handle both KQL and natural language queries
                let kqlQuery3 = params.kql;
                let queryMetadata3: QueryPatternMetadata | undefined;

                if (!kqlQuery3 && params.nl) {
                    const translation3 = await this.translateNLToKQL(
                        params.nl,
                        params.useContext || false,
                        params.includeExternal || false
                    );
                    kqlQuery3 = translation3.kql;
                    queryMetadata3 = translation3.metadata;
                }

                if (!kqlQuery3) {
                    throw new Error('Either kql or nl parameter is required');
                }

                const result3 = await this.executeQuery(
                    kqlQuery3,
                    params.useContext || false,
                    params.includeExternal || false
                );

                // Attach metadata if available
                if (queryMetadata3) {
                    result3.metadata = queryMetadata3;
                }

                return result3;

            case 'get_saved_queries':
                return this.queries.getAllQueries();

            case 'search_queries':
                return this.queries.searchQueries(params.searchTerms || []);

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
                return { filePath };

            case 'get_categories':
                return this.queries.getCategories();

            case 'get_recommendations':
                return await this.generateRecommendations(params.kql, params.results);

            case 'get_external_queries':
                return await this.references.getAllExternalQueries();

            case 'get_event_catalog':
                return await this.getEventCatalog(
                    params?.daysBack || 10,
                    params?.status || 'all',
                    params?.minCount || 1
                );

            case 'get_event_schema':
                if (!params?.eventId) {
                    throw new Error('eventId parameter is required');
                }
                return await this.getEventSchema(
                    params.eventId,
                    params?.sampleSize || 100
                );

            case 'get_tenant_mapping':
                return await this.getTenantMapping(
                    params?.daysBack || 10,
                    params?.companyNameFilter
                );

            default:
                throw new Error(`Unknown tool: ${toolName}`);
        }
    }
}

// Detect mode: stdio (VSCode MCP) vs HTTP (legacy MCPClient)
// Can be explicitly set via BCTB_MODE env var (http or stdio)
// Otherwise, if stdin is a TTY, it's interactive/HTTP mode
// If stdin is a pipe, it's stdio mode
const forcedMode = process.env.BCTB_MODE?.toLowerCase();
const isStdioMode = forcedMode === 'stdio' ? true
    : forcedMode === 'http' ? false
        : !process.stdin.isTTY;

// If stdio mode, redirect console output BEFORE creating server instance
// to prevent constructor logs from breaking JSON-RPC on stdout
if (isStdioMode) {
    const originalLog = console.log;
    const originalError = console.error;

    console.log = (...args: any[]) => {
        process.stderr.write('[MCP] ' + args.join(' ') + '\n');
    };

    console.error = (...args: any[]) => {
        process.stderr.write('[MCP] ERROR: ' + args.join(' ') + '\n');
    };
}

(async () => {
    try {
        const server = new MCPServer();

        if (isStdioMode) {
            // VSCode MCP infrastructure uses stdio
            await server.startStdio();
        } else {
            // Legacy HTTP mode for Command Palette
            await server.startHTTP();
        }
    } catch (error: any) {
        console.error('\n❌ Failed to start MCP server:');
        console.error(error.message);
        console.error('\nPlease check your environment variables and configuration.');
        process.exit(1);
    }
})();
