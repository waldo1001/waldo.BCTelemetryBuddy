/**
 * Tool handlers — all business logic for MCP tools, extracted from MCPServer.
 * 
 * This class owns the service instances and all tool execution logic. 
 * It's consumed by both the SDK-based stdio server and the Express HTTP server.
 * 
 * Design: Constructor injection of services (DIP), single tool dispatch method (SRP).
 */

import { loadConfigFromFile, validateConfig, scanDirForWorkspaceConfigs, readWorkspaceConnectionMeta, MCPConfig } from '../config.js';
import * as fs from 'fs';
import * as path from 'path';
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
    hashValue,
    categorizeError
} from '@bctb/shared';
import { VERSION } from '../version.js';
import { SETUP_PROMPT_CONTENT } from './setupInstructions.js';
import { createMCPUsageTelemetry, getMCPInstallationId } from '../mcpTelemetry.js';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

async function resolveGitAuthor(): Promise<string | undefined> {
    try {
        const { stdout } = await execAsync('git config user.name');
        const name = stdout.trim();
        return name || undefined;
    } catch {
        return undefined;
    }
}

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
 * A telemetry connection discovered from a workspace `.bctb-config.json` (via
 * CLAUDE_PROJECT_DIR or MCP roots). It is selectable through switch_profile but
 * never becomes the active connection unless the user opts in (explicit switch
 * or BCTB_AUTO_WORKSPACE_CONNECTION). See docs/plans/mcp-workspace-connection-discovery.md.
 */
export interface DiscoveredProfile {
    key: string;
    connectionName?: string;
    applicationInsightsAppId?: string;
    authFlow?: string;
    configPath: string;
    subProfileName?: string;
    source: 'workspace';
    origin: 'claude-project-dir' | 'roots';
    realpath: string;
}

/** Folder names too generic to distinguish a customer — fall back to connectionName. */
const GENERIC_WORKSPACE_LABELS = new Set([
    '', '.', 'telemetryanalysis', 'src', 'app', 'test', 'tests', 'workspace', 'repo', 'code'
]);

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
        auth: new AuthService(config, usageTelemetry),
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
    public knowledgeBase: any = null;
    /** Why the KB eager-load was skipped (set at startup) — surfaced in get_knowledge diagnostics. */
    public kbSkipReason: string | null = null;
    private kbConsulted: boolean = false;

    /** Connections discovered from workspace `.bctb-config.json` files (CLAUDE_PROJECT_DIR / roots). */
    public workspaceProfiles: Map<string, DiscoveredProfile> = new Map();
    /** Whether the active connection comes from the pinned config file or a discovered workspace file. */
    public activeProfileSource: 'file' | 'workspace' = 'file';
    /** True when the active workspace connection was auto-activated (opt-in flag), not explicitly switched. */
    public activeProfileAutoActivated: boolean = false;
    /** The pinned/global config path, frozen at construction so a workspace switch never hides file profiles. */
    private baseConfigFilePath: string | null = null;
    private claudeDirScanned: boolean = false;

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
        // Freeze the file-profile anchor: after switching to a workspace connection,
        // this.config.configFilePath points at the flat workspace file, but file-based
        // profile enumeration/switching must keep using the original pinned config.
        this.baseConfigFilePath = config.configFilePath ?? path.join(config.workspacePath, '.bctb-config.json');
        this.ensureWorkspaceProfilesDiscovered();
        this.activeProfileName = this.detectInitialProfile();
    }

    /**
     * Discover workspace connections from CLAUDE_PROJECT_DIR (synchronous, race-free).
     * Idempotent — runs its filesystem scan once. The MCP roots fallback registers
     * additional connections separately via registerWorkspaceConnection('roots').
     */
    public ensureWorkspaceProfilesDiscovered(): void {
        if (this.claudeDirScanned) {
            return;
        }
        this.claudeDirScanned = true;

        const projectDir = process.env.CLAUDE_PROJECT_DIR;
        if (!projectDir) {
            return;
        }

        for (const cfgPath of scanDirForWorkspaceConfigs(projectDir)) {
            // Never register the pinned/global config itself as a workspace connection.
            if (this.isBaseConfig(cfgPath)) {
                continue;
            }
            this.registerWorkspaceConnection(cfgPath, projectDir, 'claude-project-dir');
        }
    }

    private isBaseConfig(cfgPath: string): boolean {
        if (!this.baseConfigFilePath) {
            return false;
        }
        try {
            return fs.realpathSync(cfgPath) === fs.realpathSync(this.baseConfigFilePath);
        } catch {
            return path.resolve(cfgPath) === path.resolve(this.baseConfigFilePath);
        }
    }

    /** Profile names defined in the pinned/global config file (excludes `_`-prefixed base profiles). */
    private getFileProfileNames(): string[] {
        try {
            if (this.baseConfigFilePath && fs.existsSync(this.baseConfigFilePath)) {
                const cfg = JSON.parse(fs.readFileSync(this.baseConfigFilePath, 'utf-8'));
                if (cfg.profiles) {
                    return Object.keys(cfg.profiles).filter((n: string) => !n.startsWith('_'));
                }
            }
        } catch {
            // ignore — treated as no file profiles
        }
        return [];
    }

    /**
     * Register a workspace connection discovered at `configPath` (found while scanning
     * `scannedRootDir`). Reads metadata WITHOUT activating it; dedups by realpath +
     * sub-profile; a multi-profile workspace config registers one entry per sub-profile.
     */
    public registerWorkspaceConnection(
        configPath: string,
        scannedRootDir: string,
        origin: 'claude-project-dir' | 'roots'
    ): void {
        let realpath: string;
        try {
            realpath = fs.realpathSync(configPath);
        } catch {
            realpath = path.resolve(configPath);
        }

        const meta = readWorkspaceConnectionMeta(configPath);
        if (!meta) {
            return;
        }

        const fileNames = this.getFileProfileNames();

        const addEntry = (
            connectionName: string | undefined,
            appId: string | undefined,
            authFlow: string | undefined,
            subProfileName: string | undefined
        ): void => {
            // Dedup: same file (by realpath) + same sub-profile already registered (e.g. via CLAUDE_PROJECT_DIR and roots).
            for (const existing of this.workspaceProfiles.values()) {
                if (existing.realpath === realpath && (existing.subProfileName ?? '') === (subProfileName ?? '')) {
                    return;
                }
            }
            const taken = new Set<string>([...this.workspaceProfiles.keys(), ...fileNames]);
            const key = this.deriveWorkspaceProfileKey(scannedRootDir, configPath, connectionName, subProfileName, appId, taken);
            this.workspaceProfiles.set(key, {
                key,
                connectionName,
                applicationInsightsAppId: appId,
                authFlow,
                configPath,
                subProfileName,
                source: 'workspace',
                origin,
                realpath
            });
        };

        if (meta.isMultiProfile) {
            for (const sp of meta.subProfiles ?? []) {
                addEntry(sp.connectionName, sp.applicationInsightsAppId, sp.authFlow, sp.name);
            }
        } else {
            addEntry(meta.connectionName, meta.applicationInsightsAppId, meta.authFlow, undefined);
        }
    }

    /**
     * Derive a stable, unique, human-friendly key for a discovered connection.
     * Prefers the opened folder's name (the customer), NOT the shared
     * `TelemetryAnalysis`/`connectionName` (9/10 customers share "iFacto Customers").
     */
    private deriveWorkspaceProfileKey(
        scannedRootDir: string,
        configPath: string,
        connectionName: string | undefined,
        subProfileName: string | undefined,
        appId: string | undefined,
        taken: Set<string>
    ): string {
        const configDir = path.dirname(configPath);
        let label: string;
        if (path.resolve(configDir) === path.resolve(scannedRootDir)) {
            // Config lives directly in the opened folder.
            label = path.basename(scannedRootDir);
        } else {
            // Config lives one level down. Use the subfolder name unless it's generic
            // (e.g. TelemetryAnalysis) — then fall back to the opened folder's name.
            const child = path.basename(configDir);
            label = GENERIC_WORKSPACE_LABELS.has(child.toLowerCase()) ? path.basename(scannedRootDir) : child;
        }
        if (!label || GENERIC_WORKSPACE_LABELS.has(label.toLowerCase())) {
            label = connectionName || 'workspace';
        }
        if (subProfileName) {
            label = `${label}/${subProfileName}`;
        }

        if (!taken.has(label)) {
            return label;
        }
        // Collision (with a file profile, another workspace connection, or the 9× "iFacto Customers"
        // case): disambiguate with a short appId hash, then a counter as a last resort.
        const suffix = (appId ? hashValue(appId) : hashValue(path.resolve(configPath) + (subProfileName ?? ''))).slice(0, 6);
        let key = `${label}#${suffix}`;
        let i = 2;
        while (taken.has(key)) {
            key = `${label}#${suffix}-${i++}`;
        }
        return key;
    }

    /** Find a discovered connection by key, or by connectionName when unambiguous. */
    private matchWorkspaceProfile(name: string): { entry?: DiscoveredProfile; ambiguous?: boolean } | null {
        if (this.workspaceProfiles.has(name)) {
            return { entry: this.workspaceProfiles.get(name)! };
        }
        const byConn = [...this.workspaceProfiles.values()].filter(e => e.connectionName === name);
        if (byConn.length === 1) {
            return { entry: byConn[0] };
        }
        if (byConn.length > 1) {
            return { ambiguous: true };
        }
        return null;
    }

    /**
     * Atomically activate a resolved config: build all services into locals first,
     * and commit to `this.*` only after every constructor succeeds. A failure mid-way
     * leaves the previous connection fully intact.
     */
    private applyConfig(
        newConfig: MCPConfig,
        source: 'file' | 'workspace',
        profileName: string,
        autoActivated: boolean
    ): { previousProfile: string } {
        newConfig.port = this.config.port;

        // Build first — if any throws, nothing below runs and state is unchanged.
        const auth = new AuthService(newConfig, this.services.usageTelemetry);
        const kusto = new KustoService(newConfig.applicationInsightsAppId, newConfig.kustoClusterUrl, this.services.usageTelemetry);
        const cache = new CacheService(newConfig.workspacePath, newConfig.cacheTTLSeconds, newConfig.cacheEnabled);
        const queries = new QueriesService(newConfig.workspacePath, newConfig.queriesFolder);
        const references = new ReferencesService(newConfig.references, cache as any);

        const previousProfile = this.activeProfileName || this.config.connectionName;

        // Commit.
        this.config = newConfig;
        this.configErrors = validateConfig(newConfig);
        this.activeProfileName = profileName;
        this.activeProfileSource = source;
        this.activeProfileAutoActivated = source === 'workspace' ? autoActivated : false;
        this.services.auth = auth;
        this.services.kusto = kusto;
        this.services.cache = cache;
        this.services.queries = queries;
        this.services.references = references;

        return { previousProfile };
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
                        throw new Error('❌ QUERY BLOCKED: kql parameter is required. Before writing KQL, call get_event_catalog() to discover event IDs, then call get_event_field_samples(eventId) for each event — this reveals all available fields (20+ per event you cannot guess), their exact data types (duration fields are TIMESPAN not numbers), and sample values so you write correct KQL the first time.');
                    }
                    result = await this.executeQuery(
                        kqlQuery,
                        params.useContext || false,
                        params.includeExternal || false
                    );
                    // Warn when customDimensions fields are referenced but schema was likely not pre-validated.
                    // Agents that call get_event_field_samples first will see this and understand the consequences;
                    // agents that skipped it will see the warning and know to fix their workflow next time.
                    const customDimFields = this.extractCustomDimensionsFields(kqlQuery);
                    if (customDimFields.length > 0) {
                        result.schemaWarning = `⚠️ FIELD TYPES NOT VERIFIED: This query references customDimensions fields (${customDimFields.slice(0, 5).join(', ')}${customDimFields.length > 5 ? `, ...+${customDimFields.length - 5} more` : ''}) but get_event_field_samples() was not called first. Best practice: call get_event_field_samples(eventId) before writing KQL to discover all available fields (events have 20+ you cannot guess), learn exact data types (duration fields are TIMESPAN "hh:mm:ss.fffffff" not numbers), and see real sample values. This avoids broken queries and wasted retries. If results look wrong, call get_event_field_samples(eventId) now and rewrite with correct types.`;
                    }
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

                case 'get_recommendations': {
                    const recommendations = await this.generateRecommendations(params.kql, params.results);
                    this.services.usageTelemetry.trackEvent('Mcp.DeprecatedToolCalled', cleanTelemetryProperties(
                        createCommonProperties(
                            TELEMETRY_EVENTS.MCP_TOOLS.DEPRECATED_TOOL_CALLED,
                            'mcp',
                            this.services.sessionId,
                            this.services.installationId,
                            VERSION,
                            { toolName: 'get_recommendations', profileHash }
                        )
                    ));
                    result = {
                        deprecated: true,
                        message: 'This tool is deprecated and will be removed in a future version. Recommendations are already included automatically in every query_telemetry response. Do not call this tool separately.',
                        recommendations
                    };
                    break;
                }

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

                case 'get_knowledge': {
                    if (this.knowledgeBase) {
                        this.kbConsulted = true;
                    }
                    if (!this.knowledgeBase) {
                        const reason = this.kbSkipReason ?? 'unknown';
                        const via = this.config.workspaceVia ?? 'unknown';
                        const workspaceTried = this.config.workspacePath;
                        result = {
                            articles: [],
                            count: 0,
                            // Full paths go to the model (it needs them to fix the launch); never to telemetry.
                            message: `Knowledge Base is not available (reason: ${reason}). Looked for .bctb-config.json + .vscode/.bctb/knowledge under '${workspaceTried}' (workspace resolved via '${via}'). If running outside VS Code, launch the MCP server with --config <workspace>/.bctb-config.json, set BCTB_WORKSPACE_PATH, or use an MCP host that advertises 'roots'.`,
                            workspaceTried,
                            resolvedVia: via,
                        };
                        this.services.usageTelemetry.trackEvent(
                            'Mcp.GetKnowledge',
                            cleanTelemetryProperties(createCommonProperties(
                                TELEMETRY_EVENTS.MCP_TOOLS.GET_KNOWLEDGE, 'mcp',
                                this.services.sessionId, this.services.installationId, VERSION,
                                { profileHash, resultCount: 0, kbAvailable: 'false', kbSkipReason: reason, resolvedVia: via }
                            ))
                        );
                    } else {
                        const searchParams: any = {};
                        if (params.category) searchParams.category = params.category;
                        if (params.tags) searchParams.tags = params.tags;
                        if (params.eventId) searchParams.eventId = params.eventId;
                        if (params.search) searchParams.search = params.search;
                        if (params.source) searchParams.source = params.source;
                        const articles = this.knowledgeBase.search(searchParams);
                        const summary = this.knowledgeBase.getSummary();
                        result = {
                            articles,
                            count: articles.length,
                            summary,
                        };
                        this.services.usageTelemetry.trackEvent(
                            'Mcp.GetKnowledge',
                            cleanTelemetryProperties(createCommonProperties(
                                TELEMETRY_EVENTS.MCP_TOOLS.GET_KNOWLEDGE, 'mcp',
                                this.services.sessionId, this.services.installationId, VERSION,
                                {
                                    profileHash,
                                    resultCount: articles.length,
                                    hasCategory: String(!!params.category),
                                    hasSearch: String(!!params.search),
                                    hasEventId: String(!!params.eventId),
                                    source: params.source ?? 'all',
                                }
                            ))
                        );
                    }
                    break;
                }

                case 'save_knowledge': {
                    if (!params?.title || !params?.category || !params?.content || !params?.target) {
                        throw new Error('title, category, content, and target are required.');
                    }
                    if (!this.knowledgeBase) {
                        throw new Error('Knowledge Base is not available. It may be disabled or failed to load at startup.');
                    }
                    const saveParams = {
                        title: params.title,
                        category: params.category,
                        tags: params.tags,
                        eventIds: params.eventIds,
                        appliesTo: params.appliesTo,
                        content: params.content,
                        author: await resolveGitAuthor(),
                    };
                    if (params.target === 'community') {
                        result = await this.knowledgeBase.contributeArticle(saveParams);
                    } else {
                        result = await this.knowledgeBase.saveArticle(saveParams);
                    }
                    this.services.usageTelemetry.trackEvent(
                        'Mcp.SaveKnowledge',
                        cleanTelemetryProperties(createCommonProperties(
                            TELEMETRY_EVENTS.MCP_TOOLS.SAVE_KNOWLEDGE, 'mcp',
                            this.services.sessionId, this.services.installationId, VERSION,
                            { profileHash, target: params.target, category: params.category }
                        ))
                    );
                    break;
                }

                case 'get_setup_guide':
                    this.services.usageTelemetry.trackEvent(
                        'Mcp.GetSetupGuide',
                        cleanTelemetryProperties(createCommonProperties(
                            TELEMETRY_EVENTS.MCP_TOOLS.GET_SETUP_GUIDE, 'mcp',
                            this.services.sessionId, this.services.installationId, VERSION,
                            { profileHash }
                        ))
                    );
                    result = SETUP_PROMPT_CONTENT;
                    break;

                default:
                    throw new Error(`Unknown tool: ${toolName}`);
            }

            result = this.maybeAttachKbHint(toolName, params, result);

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
            const errorCategory = error instanceof Error ? categorizeError(error) : 'UnknownError';
            const failedProps = createCommonProperties(
                TELEMETRY_EVENTS.MCP.ERROR,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    toolName,
                    profileHash,
                    errorType,
                    errorCategory
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

    /**
     * Attach a single-string `kbHint` field to the result of a pre-query tool
     * when the KB is loaded but `get_knowledge` has not yet been called in
     * this session. Returns the result unchanged otherwise.
     *
     * Suppression rules:
     *  - skip when `this.knowledgeBase` is falsy (KB not available)
     *  - skip when `this.kbConsulted` is true (already nudged)
     *  - skip when toolName is not one of the four pre-query tools
     */
    private maybeAttachKbHint(toolName: string, params: any, result: any): any {
        if (!this.knowledgeBase || this.kbConsulted) {
            return result;
        }
        const PRE_QUERY_TOOLS = new Set([
            'get_event_catalog',
            'get_tenant_mapping',
            'get_event_field_samples',
            'get_event_schema',
        ]);
        if (!PRE_QUERY_TOOLS.has(toolName) || !result || typeof result !== 'object') {
            return result;
        }

        let suggestion: string;
        let hasEventIds = false;
        let hasCustomerSearch = false;

        switch (toolName) {
            case 'get_event_catalog': {
                const sig = Array.isArray(result.significantEvents) ? result.significantEvents : [];
                const ids = sig.map((e: any) => e?.eventId).filter((id: any) => typeof id === 'string').slice(0, 5);
                if (ids.length > 0) {
                    suggestion = `get_knowledge({ eventIds: ${JSON.stringify(ids)} })`;
                    hasEventIds = true;
                } else {
                    suggestion = `get_knowledge({ category: "event-interpretation" })`;
                }
                break;
            }
            case 'get_event_field_samples':
            case 'get_event_schema': {
                const eventId = typeof params?.eventId === 'string' ? params.eventId : '';
                suggestion = `get_knowledge({ eventId: ${JSON.stringify(eventId)} })`;
                hasEventIds = true;
                break;
            }
            case 'get_tenant_mapping': {
                const filter = typeof params?.companyNameFilter === 'string' ? params.companyNameFilter : '';
                if (filter) {
                    suggestion = `get_knowledge({ search: ${JSON.stringify(filter)} })`;
                    hasCustomerSearch = true;
                } else {
                    suggestion = `get_knowledge({ category: "playbook" })`;
                }
                break;
            }
            default:
                return result;
        }

        const hint = `⚠️ Knowledge base not consulted yet. Recommended next: ${suggestion} before writing KQL.`;

        const profileHash = this.config.connectionName
            ? hashValue(this.config.connectionName).substring(0, 16)
            : undefined;
        this.services.usageTelemetry.trackEvent(
            'Mcp.KbHintEmitted',
            cleanTelemetryProperties(createCommonProperties(
                TELEMETRY_EVENTS.MCP_TOOLS.KB_HINT_EMITTED,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    toolName,
                    hasEventIds: String(hasEventIds),
                    hasCustomerSearch: String(hasCustomerSearch),
                    profileHash,
                }
            ))
        );

        return { ...result, kbHint: hint };
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
     * Extract customDimensions field names referenced in a KQL query.
     * Used to detect when query_telemetry is called without prior schema validation.
     */
    private extractCustomDimensionsFields(kql: string): string[] {
        const fields = new Set<string>();
        // Match patterns like: customDimensions.fieldName, customDimensions["fieldName"], tostring(customDimensions.fieldName)
        const dotPattern = /customDimensions\.([a-zA-Z_][a-zA-Z0-9_]*)/g;
        const bracketPattern = /customDimensions\[["']([^"']+)["']\]/g;
        let match: RegExpExecArray | null;
        while ((match = dotPattern.exec(kql)) !== null) {
            fields.add(match[1]);
        }
        while ((match = bracketPattern.exec(kql)) !== null) {
            fields.add(match[1]);
        }
        return Array.from(fields);
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

        // Deduplicate by eventId, summing counts, to compute percentile coverage
        const eventCountMap = new Map<string, number>();
        for (const e of events) {
            eventCountMap.set(e.eventId, (eventCountMap.get(e.eventId) || 0) + e.count);
        }
        const deduplicatedEvents = Array.from(eventCountMap.entries())
            .map(([eventId, count]) => ({ eventId, count }))
            .sort((a, b) => b.count - a.count);

        const totalCount = deduplicatedEvents.reduce((sum, e) => sum + e.count, 0);

        // Find events covering the 90th percentile of total volume
        let runningCount = 0;
        const significantEvents: { eventId: string; count: number; pct: number }[] = [];
        for (const e of deduplicatedEvents) {
            runningCount += e.count;
            const pct = Math.round((e.count / totalCount) * 1000) / 10;
            significantEvents.push({ eventId: e.eventId, count: e.count, pct });
            if (runningCount / totalCount >= 0.9) break;
        }

        const significantList = significantEvents
            .map(e => `${e.eventId} (${e.pct}%)`)
            .join(', ');
        const coveragePct = totalCount > 0
            ? Math.round((runningCount / totalCount) * 1000) / 10
            : 0;

        const response: any = {
            summary: `Found ${events.length} event rows (${deduplicatedEvents.length} unique event IDs) in the last ${daysBack} days${events.length >= limitedMaxResults ? ` (limited to top ${limitedMaxResults} by count)` : ''}`,
            daysBack,
            statusFilter: status,
            minCount,
            maxResults: limitedMaxResults,
            totalReturned: events.length,
            uniqueEventIds: deduplicatedEvents.length,
            events,
            significantEvents,
            requiredNextStep: significantEvents.length > 0
                ? `STEP 2 — INVESTIGATE THE SIGNIFICANT EVENTS: These ${significantEvents.length} event IDs cover ${coveragePct}% of total volume: ${significantList}. Call get_event_field_samples(eventId) for EACH of these before writing ANY KQL — this reveals all customDimensions fields (20+ per event), exact data types (duration fields are TIMESPAN not numbers), and sample values so you write correct queries on the first attempt.`
                : `STEP 2 — Call get_event_field_samples(eventId) for each event ID you plan to query before writing any KQL.`
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
            'Best practice: call get_event_field_samples(eventId) before writing any KQL that touches customDimensions — it reveals every available field, their exact data types (especially TIMESPAN duration fields), and real sample values so you write correct queries the first time.'
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
            return {
                eventId,
                samplesAnalyzed: 0,
                fields: [],
                summary: `No events found for eventId "${eventId}" in the last ${daysBack} days. Try increasing daysBack or check if the eventId is correct.`,
                recommendations: ['Try increasing daysBack parameter', 'Verify the eventId is correct']
            };
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
            nextStep: `✅ SCHEMA VALIDATED for ${eventId}. You now have exact field names and data types. Proceed to call query_telemetry() with a KQL query built using these fields. Use the exampleQuery above as a starting point and adjust the projection and filters as needed.`,
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
     * Detect the initial active profile name (from the pinned/global config file).
     */
    detectInitialProfile(): string | null {
        try {
            const configPath = this.baseConfigFilePath;
            if (!configPath || !fs.existsSync(configPath)) {
                return null;
            }

            const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

            if (!config.profiles || Object.keys(config.profiles).length === 0) {
                return null;
            }

            return process.env.BCTB_PROFILE || config.defaultProfile || 'default';
        } catch {
            return null;
        }
    }

    /**
     * Read the profiles defined in the pinned/global config file. Returns the
     * parsed config plus whether the file exists / is multi-profile. Always keyed
     * on baseConfigFilePath so a prior workspace switch cannot hide file profiles.
     */
    private readBaseProfiles(): { exists: boolean; isMulti: boolean; names: string[]; parsed: any } {
        const configPath = this.baseConfigFilePath;
        if (!configPath || !fs.existsSync(configPath)) {
            return { exists: false, isMulti: false, names: [], parsed: null };
        }
        try {
            const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
            const hasProfiles = !!parsed.profiles && Object.keys(parsed.profiles).length > 0;
            const names = hasProfiles ? Object.keys(parsed.profiles).filter((n: string) => !n.startsWith('_')) : [];
            return { exists: true, isMulti: hasProfiles, names, parsed };
        } catch {
            return { exists: true, isMulti: false, names: [], parsed: null };
        }
    }

    /**
     * Switch to a different profile — a file-based profile from the pinned config,
     * or a discovered workspace connection (selectable by key or unambiguous
     * connectionName). Service re-init is atomic (see applyConfig).
     */
    switchProfile(profileName: string): any {
        try {
            this.ensureWorkspaceProfilesDiscovered();
            const base = this.readBaseProfiles();

            // 1. File-based profile from the pinned/global config.
            if (base.isMulti && base.names.includes(profileName)) {
                const newConfig = loadConfigFromFile(this.baseConfigFilePath!, profileName, this.isStdioMode);
                if (!newConfig) {
                    return { success: false, error: `Failed to load configuration for profile '${profileName}'` };
                }
                const { previousProfile } = this.applyConfig(newConfig, 'file', profileName, false);
                this.logProfileSwitch(previousProfile, profileName);
                return this.buildSwitchResult(previousProfile, profileName, 'file');
            }

            // 2. Discovered workspace connection.
            const wsMatch = this.matchWorkspaceProfile(profileName);
            if (wsMatch?.ambiguous) {
                const candidates = [...this.workspaceProfiles.values()]
                    .filter(e => e.connectionName === profileName)
                    .map(e => e.key);
                return {
                    success: false,
                    error: `Ambiguous connection name '${profileName}' — it matches multiple discovered workspace connections. Use one of these exact names instead: ${candidates.join(', ')}.`
                };
            }
            if (wsMatch?.entry) {
                const entry = wsMatch.entry;
                const newConfig = loadConfigFromFile(entry.configPath, entry.subProfileName, this.isStdioMode);
                if (!newConfig) {
                    return { success: false, error: `Failed to load workspace configuration for '${entry.key}'` };
                }
                const { previousProfile } = this.applyConfig(newConfig, 'workspace', entry.key, false);
                this.logProfileSwitch(previousProfile, entry.key);
                this.trackWorkspaceProfileSwitch(entry, previousProfile, false);
                return this.buildSwitchResult(previousProfile, entry.key, 'workspace');
            }

            // 3. Not found — tailor the message to what's available.
            if (!base.exists && this.workspaceProfiles.size === 0) {
                return { success: false, error: 'No .bctb-config.json found - cannot switch profiles in single-config mode' };
            }
            if (base.exists && !base.isMulti && this.workspaceProfiles.size === 0) {
                return { success: false, error: 'Config file has no profiles defined - cannot switch profiles' };
            }
            const available = [...base.names, ...this.workspaceProfiles.keys()];
            return {
                success: false,
                error: `Profile '${profileName}' not found. Available profiles: ${available.join(', ')}`
            };
        } catch (error: any) {
            return { success: false, error: `Failed to switch profile: ${error.message}` };
        }
    }

    private logProfileSwitch(previousProfile: string, profileName: string): void {
        if (!this.isStdioMode) {
            console.error(`[Profile] Switched from '${previousProfile}' to '${profileName}'`);
            console.error(`[Profile] Connection: ${this.config.connectionName}`);
            console.error(`[Profile] App Insights ID: ${this.config.applicationInsightsAppId || '(not set)'}`);
        }
    }

    private buildSwitchResult(previousProfile: string, profileName: string, source: 'file' | 'workspace'): any {
        const result: any = {
            success: true,
            previousProfile,
            source,
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
        if (this.config.authFlow === 'azure_cli') {
            result.note = "Auth uses your current 'az login' session; the config's tenantId is not used for azure_cli. If queries return 403, run: az login --tenant <tenantId>.";
        }
        return result;
    }

    private trackWorkspaceProfileSwitch(entry: DiscoveredProfile, previousProfile: string, autoActivated: boolean): void {
        try {
            const props = createCommonProperties(
                TELEMETRY_EVENTS.MCP.WORKSPACE_PROFILE_SWITCH,
                'mcp',
                this.services.sessionId,
                this.services.installationId,
                VERSION,
                {
                    origin: entry.origin,
                    authFlow: entry.authFlow ?? 'unknown',
                    wasAmbiguousMatch: false,
                    previousSource: previousProfile === this.config.connectionName ? 'unknown' : 'file',
                    autoActivated
                }
            );
            this.services.usageTelemetry.trackEvent('Mcp.WorkspaceProfileSwitch', cleanTelemetryProperties(props));
        } catch {
            // Telemetry must never break a profile switch.
        }
    }

    /**
     * Auto-activate a single discovered workspace connection (opt-in via
     * BCTB_AUTO_WORKSPACE_CONNECTION). Returns the activated key, or null when it
     * did not fire (flag off, not exactly one connection, or already targeting it).
     */
    public maybeAutoActivateWorkspaceConnection(): string | null {
        this.ensureWorkspaceProfilesDiscovered();
        const flag = process.env.BCTB_AUTO_WORKSPACE_CONNECTION;
        if (!flag || flag === '0' || flag.toLowerCase() === 'false') {
            return null;
        }
        if (this.workspaceProfiles.size !== 1) {
            if (this.workspaceProfiles.size > 1) {
                console.error('[MCP] Multiple workspace connections discovered; not auto-activating (ambiguous). Use switch_profile.');
            }
            return null;
        }
        const entry = [...this.workspaceProfiles.values()][0];
        // No-op if the active connection already targets this App Insights resource.
        if (entry.applicationInsightsAppId && entry.applicationInsightsAppId === this.config.applicationInsightsAppId) {
            return null;
        }

        // Activation is best-effort and MUST NOT crash server startup. applyConfig is
        // atomic, so a mid-activation failure leaves the previous connection intact.
        try {
            const newConfig = loadConfigFromFile(entry.configPath, entry.subProfileName, this.isStdioMode);
            if (!newConfig) {
                return null;
            }
            const { previousProfile } = this.applyConfig(newConfig, 'workspace', entry.key, true);
            console.error(
                `[MCP] AUTO-ACTIVATED workspace connection "${entry.connectionName ?? entry.key}" ` +
                `(BCTB_AUTO_WORKSPACE_CONNECTION=on). Queries now target a workspace App Insights resource, not the global default.`
            );
            this.trackWorkspaceProfileSwitch(entry, previousProfile, true);
            return entry.key;
        } catch (err: any) {
            console.error(`[MCP] Auto-activation of workspace connection "${entry.key}" failed (non-fatal): ${err?.message}. Active connection unchanged; use switch_profile to select it manually.`);
            return null;
        }
    }

    /**
     * List all available profiles — file-based profiles from the pinned config
     * MERGED with discovered workspace connections (tagged source:'workspace').
     */
    listProfiles(): any {
        try {
            this.ensureWorkspaceProfilesDiscovered();
            const base = this.readBaseProfiles();

            const currentProfileName = this.activeProfileName || process.env.BCTB_PROFILE || base.parsed?.defaultProfile || 'default';

            const fileProfiles = (base.isMulti ? base.names : []).map((name: string) => {
                const pc = base.parsed.profiles[name] ?? {};
                return {
                    name,
                    connectionName: pc.connectionName || name,
                    isActive: this.activeProfileSource === 'file' && name === currentProfileName,
                    applicationInsightsAppId: pc.applicationInsightsAppId,
                    authFlow: pc.authFlow,
                    extends: pc.extends,
                    source: 'file' as const
                };
            });

            const wsProfiles = [...this.workspaceProfiles.values()].map(e => ({
                name: e.key,
                connectionName: e.connectionName || e.key,
                isActive: this.activeProfileSource === 'workspace' && e.key === this.activeProfileName,
                applicationInsightsAppId: e.applicationInsightsAppId,
                authFlow: e.authFlow,
                source: 'workspace' as const,
                origin: e.origin
            }));

            const all = [...fileProfiles, ...wsProfiles];

            // Nothing selectable anywhere → single mode (backward compatible).
            if (all.length === 0) {
                return {
                    profileMode: 'single',
                    currentProfile: {
                        name: 'default',
                        connectionName: this.config.connectionName,
                        isActive: true,
                        source: 'file'
                    },
                    availableProfiles: [],
                    message: base.exists
                        ? 'Single profile mode - config file has no profiles object'
                        : 'Single profile mode - using workspace settings or environment variables'
                };
            }

            let currentProfile: any = all.find(p => p.isActive);
            if (!currentProfile) {
                // Active connection is the base flat/default one (not a named profile).
                currentProfile = {
                    name: this.activeProfileName || currentProfileName,
                    connectionName: this.config.connectionName,
                    isActive: true,
                    source: this.activeProfileAutoActivated ? 'workspace-auto' : this.activeProfileSource
                };
            } else if (currentProfile.source === 'workspace' && this.activeProfileAutoActivated) {
                currentProfile = { ...currentProfile, source: 'workspace-auto' };
            }

            const usage: any = {
                summary: 'This server exposes multiple telemetry connections (customer/environment profiles).',
                switchingInstructions: 'To switch, call switch_profile with the profile name. In VS Code you can also use the status bar or command palette.',
                noteForQueries: 'All queries execute against the currently active profile. Call list_profiles to confirm which profile is active before running queries.'
            };
            if (wsProfiles.length > 0) {
                usage.workspaceConnections = 'Entries tagged source:"workspace" are connections discovered from the folder(s) you opened (not from the global config). Select one with switch_profile using its name. These are separate App Insights resources — switching retargets which telemetry is queried.';
            }

            return {
                profileMode: 'multi',
                currentProfile,
                availableProfiles: all.filter(p => !(p as any).isActive),
                totalProfiles: all.length,
                message: `${all.length} profile(s) available (${fileProfiles.length} from config, ${wsProfiles.length} discovered from workspace). Currently using: ${currentProfile.name}`,
                usage
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

        if (!kql || typeof kql !== 'string') {
            return recommendations;
        }

        if (kql.includes('where') && !kql.includes('| where')) {
            recommendations.push('Consider using the pipe operator before "where" for better performance');
        }

        if (kql.includes('*')) {
            recommendations.push('Specify explicit columns instead of * for better performance');
        }

        if (!kql.toLowerCase().includes('ago(')) {
            recommendations.push('Consider adding a time range filter (e.g., | where timestamp > ago(1d))');
        }

        if (results?.rows && results.rows.length > 10000) {
            recommendations.push('Large result set. Consider adding "| take 100" or similar limit');
        }

        return recommendations;
    }
}
