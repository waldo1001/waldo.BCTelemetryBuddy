/**
 * Tool handlers — all business logic for MCP tools, extracted from MCPServer.
 * 
 * This class owns the service instances and all tool execution logic. 
 * It's consumed by both the SDK-based stdio server and the Express HTTP server.
 * 
 * Design: Constructor injection of services (DIP), single tool dispatch method (SRP).
 */

import { loadConfigFromFile, validateConfig, MCPConfig } from '../config.js';
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
import { VERSION } from '../version.js';
import { createMCPUsageTelemetry, getMCPInstallationId } from '../mcpTelemetry.js';
import * as crypto from 'crypto';

/**
 * Query result for LLM consumption
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
 * Services container — initialized from config, injected into ToolHandlers
 */
export interface ServerServices {
    auth: AuthService;
    kusto: KustoService;
    cache: CacheService;
    queries: QueriesService;
    references: ReferencesService;
    usageTelemetry: IUsageTelemetry;
    installationId: string;
    sessionId: string;
}

/**
 * Initialize all services from config.
 * Extracted from MCPServer constructor for reuse.
 */
export function initializeServices(
    config: MCPConfig,
    isStdioMode: boolean,
    existingTelemetry?: IUsageTelemetry,
    existingInstallationId?: string
): ServerServices {
    const sessionId = crypto.randomUUID();
    let usageTelemetry: IUsageTelemetry;
    let installationId: string;

    if (existingTelemetry) {
        usageTelemetry = existingTelemetry;
        installationId = existingInstallationId || 'unknown';
    } else {
        const connectionString = TELEMETRY_CONNECTION_STRING;
        const telemetryEnabled = true;

        if (connectionString && telemetryEnabled) {
            const baseTelemetry = createMCPUsageTelemetry(connectionString, config.workspacePath, VERSION);
            if (baseTelemetry) {
                installationId = getMCPInstallationId(config.workspacePath);
                usageTelemetry = new RateLimitedUsageTelemetry(baseTelemetry, {
                    maxIdenticalErrors: 10,
                    maxEventsPerSession: 2000,
                    maxEventsPerMinute: 200
                });
                if (!isStdioMode) {
                    console.error('✓ Usage Telemetry initialized\n');
                }

                // Track server startup
                const profileHash = config.connectionName ? hashValue(config.connectionName).substring(0, 16) : undefined;
                const startupProps = createCommonProperties(
                    TELEMETRY_EVENTS.MCP.SERVER_STARTED,
                    'mcp',
                    sessionId,
                    installationId,
                    VERSION,
                    {
                        profileHash,
                        authFlow: config.authFlow,
                        cacheEnabled: String(config.cacheEnabled)
                    }
                );
                usageTelemetry.trackEvent('Mcp.ServerStarted', cleanTelemetryProperties(startupProps));
            } else {
                usageTelemetry = new NoOpUsageTelemetry();
                installationId = 'unknown';
                if (!isStdioMode) {
                    console.error('⚠️  Usage Telemetry initialization failed\n');
                }
            }
        } else {
            usageTelemetry = new NoOpUsageTelemetry();
            installationId = 'unknown';
            if (!isStdioMode) {
                console.error('ℹ️  Usage Telemetry disabled\n');
            }
        }
    }

    return {
        auth: new AuthService(config),
        kusto: new KustoService(config.applicationInsightsAppId, config.kustoClusterUrl, usageTelemetry),
        cache: new CacheService(config.workspacePath, config.cacheTTLSeconds, config.cacheEnabled),
        queries: new QueriesService(config.workspacePath, config.queriesFolder),
        references: new ReferencesService(config.references, usageTelemetry as any), // ReferencesService accepts cache or telemetry
        usageTelemetry,
        installationId,
        sessionId
    };
}

/**
 * All tool execution logic — extracted from MCPServer for reuse by both 
 * SDK-based server and Express HTTP server.
 */
export class ToolHandlers {
    public config: MCPConfig;
    public configErrors: string[];
    public services: ServerServices;
    private isStdioMode: boolean;
    public activeProfileName: string | null = null;

    constructor(
        config: MCPConfig,
        services: ServerServices,
        isStdioMode: boolean,
        configErrors?: string[]
    ) {
        this.config = config;
        this.services = services;
        this.isStdioMode = isStdioMode;
        this.configErrors = configErrors ?? validateConfig(config);
        this.activeProfileName = this.detectInitialProfile();
    }

    /**
     * Execute a tool by name — single dispatch point, eliminates triple duplication.
     * Returns the raw result (not wrapped in MCP content format).
     */
    async executeToolCall(toolName: string, params: any): Promise<any> {
        const startTime = Date.now();
        const profileHash = this.config.connectionName ? hashValue(this.config.connectionName).substring(0, 16) : undefined;

        try {
            let result: any;

            switch (toolName) {
                case 'query_telemetry': {
                    const kqlQuery = params.kql;
                    if (!kqlQuery || kqlQuery.trim() === '') {
                        throw new Error('❌ QUERY BLOCKED: kql parameter is required. MANDATORY WORKFLOW: (1) Call get_event_catalog() to discover available event IDs, (2) Call get_event_field_samples(eventId) to understand field structure, (3) Then construct query. DO NOT skip discovery steps.');
                    }
                    result = await this.executeQuery(
                        kqlQuery,
                        params.useContext || false,
                        params.includeExternal || false
                    );
                    break;
                }

                case 'get_saved_queries':
                    result = this.services.queries.getAllQueries();
                    break;

                case 'search_queries':
                    result = this.services.queries.searchQueries(params.searchTerms || []);
                    break;

                case 'save_query': {
                    const filePath = this.services.queries.saveQuery(
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
                }

                case 'get_categories':
                    result = this.services.queries.getCategories();
                    break;

                case 'get_recommendations':
                    result = await this.generateRecommendations(params.kql, params.results);
                    break;

                case 'get_external_queries':
                    result = await this.services.references.getAllExternalQueries();
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
                    result = this.services.cache.getStats();
                    break;

                case 'clear_cache':
                    this.services.cache.clear();
                    result = { success: true, message: 'Cache cleared successfully' };
                    break;

                case 'list_profiles':
                    result = this.listProfiles();
                    break;

                case 'switch_profile':
                    if (!params?.profileName) {
                        throw new Error('profileName parameter is required. Use list_profiles to see available profiles.');
                    }
                    result = this.switchProfile(params.profileName);
                    break;

                case 'cleanup_cache':
                    this.services.cache.cleanupExpired();
                    const stats = this.services.cache.getStats();
                    result = { success: true, message: `Cleaned up expired entries. ${stats.totalEntries} entries remaining`, stats };
                    break;

                case 'get_auth_status':
                    if (this.configErrors.length > 0) {
                        result = {
                            authenticated: false,
                            error: 'BC Telemetry Buddy MCP server configuration is incomplete. Required settings missing.',
                            configurationIssues: this.configErrors,
                            hint: 'VSCode users: Run Setup Wizard from Command Palette. MCP client users: Configure environment variables in your MCP settings.'
                        };
                    } else {
                        result = this.services.auth.getStatus();
                    }
                    break;

                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }

            // Track successful tool completion
            const durationMs = Date.now() - startTime;
            const completedProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP_TOOLS.QUERY_TELEMETRY,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    toolName,
                    profileHash
                }
            );
            this.services.usageTelemetry.trackEvent('Mcp.ToolCompleted', cleanTelemetryProperties(completedProps), { duration: durationMs });

            return result;
        } catch (error: any) {
            // Track failed tool completion
            const durationMs = Date.now() - startTime;
            const errorType = error?.constructor?.name || 'UnknownError';
            const failedProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    toolName,
                    profileHash,
                    errorType
                }
            );
            this.services.usageTelemetry.trackEvent('Mcp.ToolFailed', cleanTelemetryProperties(failedProps), { duration: durationMs });

            // Also track exception
            const exceptionProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    toolName,
                    profileHash,
                    errorType,
                    operation: 'tool'
                }
            );
            if (error instanceof Error) {
                this.services.usageTelemetry.trackException(error, cleanTelemetryProperties(exceptionProps) as Record<string, string>);
            }

            throw error;
        }
    }

    // ─── Business Logic Methods ─────────────────────────────────────────

    /**
     * Check if configuration is complete
     */
    checkConfigurationComplete(): void {
        if (this.configErrors.length > 0) {
            const errorMessage = `Configuration incomplete:\n${this.configErrors.join('\n')}\n\nPlease run "BC Telemetry Buddy: Setup Wizard" from the Command Palette to configure the extension.`;
            throw new Error(errorMessage);
        }
    }

    /**
     * Execute KQL query with optional context
     */
    async executeQuery(
        kql: string,
        useContext: boolean,
        includeExternal: boolean,
        queryName?: string,
        correlationId?: string
    ): Promise<QueryResult> {
        try {
            this.checkConfigurationComplete();

            const cached = this.services.cache.get<QueryResult>(kql);
            if (cached) {
                return { ...cached, cached: true };
            }

            const validationErrors = this.services.kusto.validateQuery(kql);
            if (validationErrors.length > 0) {
                return {
                    type: 'error',
                    kql,
                    summary: 'Query validation failed',
                    recommendations: validationErrors,
                    cached: false
                };
            }

            const accessToken = await this.services.auth.getAccessToken();
            const rawResult = await this.services.kusto.executeQuery(
                kql,
                accessToken,
                queryName || 'UserQuery',
                correlationId
            );
            const parsed = this.services.kusto.parseResult(rawResult);

            let result: QueryResult = {
                type: 'table',
                kql,
                summary: parsed.summary,
                columns: parsed.columns,
                rows: parsed.rows,
                cached: false
            };

            if (this.config.removePII) {
                result = sanitizeObject(result, true);
            }

            result.recommendations = await this.generateRecommendations(kql, result);
            this.services.cache.set(kql, result);

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
     * Get event catalog
     */
    async getEventCatalog(daysBack: number = 10, status: string = 'all', minCount: number = 1, includeCommonFields: boolean = false, maxResults: number = 50): Promise<any> {
        const limitedMaxResults = Math.min(maxResults, 200);

        const kql = `
        traces
        | where timestamp >= ago(${daysBack}d)
        | extend eventId = tostring(customDimensions.eventId)
        | extend shortMessage = case(
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
        substring(message, 0, 4) == "Task", "Task Executed",
        indexof(message, ":") <= 0, message,
        substring(message, 0, indexof(message, ":"))
        )
        | extend eventStatus = case(
        shortMessage has_any ("error","fail","failed","deadlock","timed out", "timeout", "cannot", "unable", "invalid", "could not", "missing") or
        eventId has_any ("AL0000JRG", "RT0012", "RT0028", "RT0030", "RT0031"), 
        "error",
        shortMessage has_any ("exceeded", "too slow") or 
        eventId in ("RT0005", "RT0018"), 
        "too slow",
        shortMessage has_any ("warn","warning"), "warning",
        shortMessage has_any ("called","executed","succeeded","rendered","successfully","success","completed","finished","posted","sent","created","generated","applied","authenticated","connected","committed","registered") or
        eventId has_any ("LC0010", "LC0011", "LC0020", "LC0021"), 
        "success",
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

        if (includeCommonFields && events.length > 0) {
            response.commonFields = await this.analyzeCommonFields(daysBack, events.map((e: any) => e.eventId));
        }

        return response;
    }

    /**
     * Analyze common customDimensions fields across multiple events
     */
    private async analyzeCommonFields(daysBack: number, eventIds: string[]): Promise<any> {
        const eventsToAnalyze = eventIds.slice(0, 50);

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

        const fieldEventMap = new Map<string, Set<string>>();
        const fieldTypeMap = new Map<string, Map<string, number>>();

        result.rows?.forEach((row: any[]) => {
            const eventId = row[0];
            const customDims = row[1];

            if (typeof customDims === 'object' && customDims !== null) {
                Object.entries(customDims).forEach(([fieldName, fieldValue]) => {
                    if (!fieldEventMap.has(fieldName)) {
                        fieldEventMap.set(fieldName, new Set());
                    }
                    fieldEventMap.get(fieldName)!.add(eventId);

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

        const commonFields = Array.from(fieldEventMap.entries())
            .map(([fieldName, eventSet]) => {
                const eventCount = eventSet.size;
                const prevalence = (eventCount / totalUniqueEvents) * 100;

                const typeMap = fieldTypeMap.get(fieldName)!;
                const dominantType = Array.from(typeMap.entries())
                    .sort((a, b) => b[1] - a[1])[0][0];

                return {
                    fieldName,
                    appearsInEvents: eventCount,
                    totalEvents: totalUniqueEvents,
                    prevalence: Math.round(prevalence * 10) / 10,
                    dominantType,
                    category: this.categorizeField(fieldName, prevalence)
                };
            })
            .sort((a, b) => b.prevalence - a.prevalence);

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

    private categorizeField(_fieldName: string, prevalence: number): string {
        if (prevalence >= 80) return 'universal';
        if (prevalence >= 50) return 'common';
        if (prevalence >= 20) return 'occasional';
        return 'rare';
    }

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
     * Get event schema
     */
    async getEventSchema(eventId: string, sampleSize: number = 100): Promise<any> {
        const kql = `
traces
| where timestamp >= ago(10d)
| where tostring(customDimensions.eventId) == "${eventId}"
        | take ${sampleSize}
        | project customDimensions
        `.trim();

        const result = await this.executeQuery(kql, false, false);
        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        const fieldMap = new Map<string, Set<any>>();

        result.rows?.forEach((row: any[]) => {
            const customDims = row[0];
            if (typeof customDims === 'object' && customDims !== null) {
                Object.keys(customDims).forEach(key => {
                    if (!fieldMap.has(key)) {
                        fieldMap.set(key, new Set());
                    }
                    const examples = fieldMap.get(key)!;
                    if (examples.size < 5) {
                        examples.add(customDims[key]);
                    }
                });
            }
        });

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
            fields: fields.sort((a, b) => b.occurrences - a.occurrences),
            usage: {
                summary: `Event ${eventId} has ${fields.length} unique customDimensions fields`,
                mostCommonFields: fields.slice(0, 10).map(f => f.fieldName),
                exampleQuery: `traces\n| where timestamp >= ago(1d)\n| where tostring(customDimensions.eventId) == "${eventId}"\n| project timestamp, message, ${fields.slice(0, 5).map(f => `customDimensions.${f.fieldName}`).join(', ')}`
            }
        };
    }

    /**
     * Detect if a value is a timespan
     */
    isTimespanValue(value: any, fieldName: string): boolean {
        if (typeof value === 'string') {
            const timespanPattern = /^(\d+\.)?(\d{1,2}):(\d{2}):(\d{2})(\.(\d+))?$/;
            if (timespanPattern.test(value)) {
                return true;
            }
        }

        const durationFieldPatterns = [
            /time$/i,
            /duration/i,
            /elapsed/i,
            /latency/i,
            /delay/i,
            /wait/i,
            /runtime/i
        ];

        return durationFieldPatterns.some(pattern => pattern.test(fieldName));
    }

    /**
     * Get event field samples
     */
    async getEventFieldSamples(eventId: string, sampleCount: number = 10, daysBack: number = 30): Promise<any> {
        const kql = `
traces
| where timestamp >= ago(${daysBack}d)
| where tostring(customDimensions.eventId) == "${eventId}"
        | take ${sampleCount}
        | project timestamp, message, customDimensions
        `.trim();

        const result = await this.executeQuery(kql, false, false);
        if (result.type === 'error') {
            throw new Error(result.summary);
        }

        if (!result.rows || result.rows.length === 0) {
            throw new Error(`No events found for eventId "${eventId}" in the last ${daysBack} days. Try increasing daysBack or check if the eventId is correct.`);
        }

        interface FieldStats {
            types: Set<string>;
            values: any[];
            nullCount: number;
            totalCount: number;
        }

        const fieldStats = new Map<string, FieldStats>();

        result.rows.forEach((row: any[]) => {
            let customDims = row[2];

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
                    let actualType: string;
                    if (this.isTimespanValue(value, key)) {
                        actualType = 'timespan';
                    } else if (typeof value === 'number') {
                        actualType = 'number';
                    } else if (typeof value === 'boolean') {
                        actualType = 'boolean';
                    } else if (value instanceof Date) {
                        actualType = 'datetime';
                    } else {
                        actualType = 'string';
                    }
                    stats.types.add(actualType);

                    if (stats.values.length < 3 && !stats.values.includes(value)) {
                        stats.values.push(value);
                    }
                }
            });
        });

        const fields = Array.from(fieldStats.entries())
            .map(([fieldName, stats]) => ({
                fieldName,
                dataType: Array.from(stats.types)[0] || 'string',
                occurrenceRate: Math.round((stats.totalCount / result.rows!.length) * 100),
                sampleValues: stats.values.slice(0, 3),
                isAlwaysPresent: stats.totalCount === result.rows!.length,
                nullCount: stats.nullCount
            }))
            .sort((a, b) => b.occurrenceRate - a.occurrenceRate);

        const topFields = fields
            .filter(f => f.occurrenceRate >= 50)
            .slice(0, 10);

        const extendStatements = topFields
            .map(f => {
                const conversion = f.dataType === 'timespan' ? 'totimespan' :
                    f.dataType === 'number' ? 'toreal' :
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

        const firstSampleMessage = result.rows[0][1];
        let firstSampleDimensions = result.rows[0][2];

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
            category: categoryInfo.category,
            subcategory: categoryInfo.subcategory,
            documentationUrl: categoryInfo.documentationUrl,
            description: categoryInfo.description,
            isStandardEvent: categoryInfo.isStandardEvent,
            categorySource: categoryInfo.source,
            samplesAnalyzed: result.rows.length,
            timeRange: {
                from: result.rows[result.rows.length - 1][0],
                to: result.rows[0][0]
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
                fields.some(f => f.dataType === 'timespan')
                    ? `⏱️ VERIFIED TIMESPAN: Fields (${fields.filter(f => f.dataType === 'timespan').map(f => f.fieldName).join(', ')}) confirmed as TIMESPANS (format: "hh:mm:ss.fffffff"), NOT milliseconds. Use totimespan() conversion. To convert to milliseconds: toreal(totimespan(fieldName))/10000`
                    : fields.some(f => /time|duration|elapsed|latency|delay|wait/i.test(f.fieldName) && !/ms$|milliseconds?|inms$|_ms$/i.test(f.fieldName))
                        ? `⚠️ VERIFY FORMAT: Fields (${fields.filter(f => /time|duration|elapsed|latency|delay|wait/i.test(f.fieldName) && !/ms$|milliseconds?|inms$|_ms$/i.test(f.fieldName)).map(f => f.fieldName).join(', ')}) with duration-like names are PROBABLY timespans ("hh:mm:ss.fffffff"), not milliseconds. Check the sample values above to confirm format before writing queries. If timespans: use totimespan(). To convert to milliseconds: toreal(totimespan(fieldName))/10000`
                        : '',
                `Use the exampleQuery above as a starting point for your analysis`,
                `Fields with 100% occurrence rate are always available`,
                fields.filter(f => !f.isAlwaysPresent).length > 0
                    ? `${fields.filter(f => !f.isAlwaysPresent).length} optional fields may be null - handle accordingly`
                    : 'All fields are consistently present'
            ].filter(r => r !== '')
        };
    }

    /**
     * Get tenant ID mapping
     */
    async getTenantMapping(daysBack: number = 10, companyNameFilter?: string): Promise<any> {
        let kql = `traces
| where timestamp >= ago(${daysBack}d)
| where isnotempty(customDimensions.companyName)
| extend aadTenantId = tostring(customDimensions.aadTenantId)
  , companyName = tostring(customDimensions.companyName)
| summarize count() by aadTenantId, companyName
| project companyName, aadTenantId, count_`;

        if (companyNameFilter) {
            kql += `\n| where companyName contains "${companyNameFilter}"`;
        }

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
            mappings: mappings.sort((a: TenantMapping, b: TenantMapping) => b.occurrences - a.occurrences),
            usage: {
                summary: `Found ${mappings.length} company-to-tenant mappings in the last ${daysBack} days`,
                recommendation: 'Use aadTenantId for filtering telemetry queries. Example: | where tostring(customDimensions.aadTenantId) == "{tenantId}"'
            }
        };
    }

    /**
     * Detect the initial active profile name
     */
    detectInitialProfile(): string | null {
        const fs = require('fs');
        const path = require('path');

        try {
            const configPath = this.config.configFilePath || path.join(this.config.workspacePath, '.bctb-config.json');
            if (!fs.existsSync(configPath)) {
                return null;
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.profiles || Object.keys(config.profiles).length === 0) {
                return null;
            }

            return process.env.BCTB_PROFILE || config.defaultProfile || 'default';
        } catch {
            return null;
        }
    }

    /**
     * Switch to a different profile
     */
    switchProfile(profileName: string): any {
        const fs = require('fs');
        const path = require('path');

        try {
            const configPath = this.config.configFilePath || path.join(this.config.workspacePath, '.bctb-config.json');

            if (!fs.existsSync(configPath)) {
                return {
                    success: false,
                    error: 'No .bctb-config.json found - cannot switch profiles in single-config mode'
                };
            }

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

            if (!config.profiles || Object.keys(config.profiles).length === 0) {
                return {
                    success: false,
                    error: 'Config file has no profiles defined - cannot switch profiles'
                };
            }

            const availableProfiles = Object.keys(config.profiles).filter(name => !name.startsWith('_'));

            if (!availableProfiles.includes(profileName)) {
                return {
                    success: false,
                    error: `Profile '${profileName}' not found. Available profiles: ${availableProfiles.join(', ')}`
                };
            }

            const newConfig = loadConfigFromFile(configPath, profileName, this.isStdioMode);
            if (!newConfig) {
                return {
                    success: false,
                    error: `Failed to load configuration for profile '${profileName}'`
                };
            }

            newConfig.port = this.config.port;
            const previousProfile = this.activeProfileName || this.config.connectionName;

            // Update config and reinitialize services
            this.config = newConfig;
            this.configErrors = validateConfig(this.config);
            this.activeProfileName = profileName;

            // Reinitialize services
            this.services.auth = new AuthService(this.config);
            this.services.kusto = new KustoService(this.config.applicationInsightsAppId, this.config.kustoClusterUrl, this.services.usageTelemetry);
            this.services.cache = new CacheService(this.config.workspacePath, this.config.cacheTTLSeconds, this.config.cacheEnabled);
            this.services.queries = new QueriesService(this.config.workspacePath, this.config.queriesFolder);
            this.services.references = new ReferencesService(this.config.references, this.services.cache as any);

            if (!this.isStdioMode) {
                console.error(`[Profile] Switched from '${previousProfile}' to '${profileName}'`);
                console.error(`[Profile] Connection: ${this.config.connectionName}`);
                console.error(`[Profile] App Insights ID: ${this.config.applicationInsightsAppId || '(not set)'}`);
            }

            return {
                success: true,
                previousProfile,
                currentProfile: {
                    name: profileName,
                    connectionName: this.config.connectionName,
                    applicationInsightsAppId: this.config.applicationInsightsAppId,
                    authFlow: this.config.authFlow
                },
                message: `Successfully switched to profile '${profileName}' (${this.config.connectionName})`,
                configValid: this.configErrors.length === 0,
                configErrors: this.configErrors.length > 0 ? this.configErrors : undefined
            };
        } catch (error: any) {
            return {
                success: false,
                error: `Failed to switch profile: ${error.message}`
            };
        }
    }

    /**
     * List all available profiles
     */
    listProfiles(): any {
        const fs = require('fs');
        const path = require('path');

        try {
            const configPath = this.config.configFilePath || path.join(this.config.workspacePath, '.bctb-config.json');

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

            const configData = fs.readFileSync(configPath, 'utf8');
            const config = JSON.parse(configData);

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

            const currentProfileName = this.activeProfileName || process.env.BCTB_PROFILE || config.defaultProfile || 'default';

            const profiles = Object.entries(config.profiles)
                .filter(([name]) => !name.startsWith('_'))
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
                    switchingInstructions: 'To switch profiles, use the switch_profile tool with the profile name. In VS Code, you can also use the status bar or command palette.',
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
     * Generate recommendations
     */
    async generateRecommendations(kql: string, results: any): Promise<string[]> {
        const recommendations: string[] = [];

        if (kql.includes('where') && !kql.includes('| where')) {
            recommendations.push('Consider using the pipe operator before "where" for better performance');
        }

        if (kql.includes('*')) {
            recommendations.push('Specify explicit columns instead of * for better performance');
        }

        if (!kql.toLowerCase().includes('ago(')) {
            recommendations.push('Consider adding a time range filter (e.g., | where timestamp > ago(1d))');
        }

        if (results.rows && results.rows.length > 10000) {
            recommendations.push('Large result set. Consider adding "| take 100" or similar limit');
        }

        return recommendations;
    }
}
