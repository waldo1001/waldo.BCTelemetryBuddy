import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import {
    AuthService,
    KustoService,
    CacheService,
    QueriesService,
    sanitizeObject,
    MCPConfig,
    ProfiledConfig,
    resolveProfileInheritance,
    expandEnvironmentVariables
} from '@bctb/shared';
import type { AuthResult } from '@bctb/shared';

/**
 * Query result for extension consumption
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
 * Direct telemetry service - no MCP required
 * Used by VSCode commands (Run KQL, Save Query, etc.)
 * Uses @bctb/shared library directly
 * Supports multi-profile configuration
 */
export class TelemetryService {
    private auth: AuthService;
    private kusto: KustoService;
    private cache: CacheService;
    private queries: QueriesService;
    private config: MCPConfig;
    private outputChannel: vscode.OutputChannel;
    private currentProfile: string | null = null;

    constructor(outputChannel: vscode.OutputChannel, profileName?: string) {
        this.outputChannel = outputChannel;
        this.currentProfile = profileName || null;
        this.config = this.loadConfig();

        this.outputChannel.appendLine('[TelemetryService] Initializing with config:');
        if (this.currentProfile) {
            this.outputChannel.appendLine(`  Profile: ${this.currentProfile} (${this.config.connectionName})`);
        }
        this.outputChannel.appendLine(`  Workspace: ${this.config.workspacePath}`);
        this.outputChannel.appendLine(`  Auth flow: ${this.config.authFlow}`);
        this.outputChannel.appendLine(`  App Insights ID: ${this.config.applicationInsightsAppId || '(not set)'}`);

        this.auth = new AuthService(this.config);
        this.kusto = new KustoService(
            this.config.applicationInsightsAppId,
            this.config.kustoClusterUrl
        );
        this.cache = new CacheService(
            this.config.workspacePath,
            this.config.cacheTTLSeconds,
            this.config.cacheEnabled
        );
        this.queries = new QueriesService(
            this.config.workspacePath,
            this.config.queriesFolder
        );
    }

    /**
     * Load configuration from .bctb-config.json file (supports multi-profile)
     */
    private loadConfig(): MCPConfig {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        const workspacePath = workspaceFolders[0].uri.fsPath;
        const configPath = path.join(workspacePath, '.bctb-config.json');

        // Check if .bctb-config.json exists
        if (fs.existsSync(configPath)) {
            return this.loadFromConfigFile(configPath, workspacePath);
        }

        // Fallback to VSCode settings (backward compatibility)
        return this.loadFromVSCodeSettings(workspacePath);
    }

    /**
     * Load configuration from .bctb-config.json file
     */
    private loadFromConfigFile(configPath: string, workspacePath: string): MCPConfig {
        const fileContent = fs.readFileSync(configPath, 'utf-8');
        const config: ProfiledConfig = JSON.parse(fileContent);

        // Multi-profile mode
        if (config.profiles) {
            const profileName = this.currentProfile ||
                vscode.workspace.getConfiguration('bctb').get<string>('currentProfile') ||
                config.defaultProfile ||
                'default';

            if (!config.profiles[profileName]) {
                throw new Error(`Profile '${profileName}' not found in .bctb-config.json`);
            }

            // Resolve profile with inheritance
            const resolved = resolveProfileInheritance(config.profiles, profileName);

            // Merge global settings
            return {
                ...resolved,
                workspacePath,
                cacheEnabled: resolved.cacheEnabled ?? config.cache?.enabled ?? true,
                cacheTTLSeconds: resolved.cacheTTLSeconds ?? config.cache?.ttlSeconds ?? 3600,
                removePII: resolved.removePII ?? config.sanitize?.removePII ?? false,
                references: resolved.references || config.references || [],
                port: resolved.port || 52345,
                queriesFolder: resolved.queriesFolder || 'queries'
            };
        }

        // Single profile mode (backward compatible)
        return expandEnvironmentVariables({
            connectionName: config.connectionName || 'Default',
            tenantId: config.tenantId || '',
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            authFlow: config.authFlow || 'azure_cli',
            applicationInsightsAppId: config.applicationInsightsAppId || '',
            kustoClusterUrl: config.kustoClusterUrl || '',
            cacheEnabled: config.cacheEnabled ?? config.cache?.enabled ?? true,
            cacheTTLSeconds: config.cacheTTLSeconds ?? config.cache?.ttlSeconds ?? 3600,
            removePII: config.removePII ?? config.sanitize?.removePII ?? false,
            port: config.port || 52345,
            workspacePath,
            queriesFolder: config.queriesFolder || 'queries',
            references: config.references || []
        });
    }

    /**
     * Load configuration from VSCode settings (fallback/backward compatibility)
     */
    private loadFromVSCodeSettings(workspacePath: string): MCPConfig {
        const folderUri = vscode.workspace.workspaceFolders![0].uri;
        const config = vscode.workspace.getConfiguration('bctb', folderUri);

        const appInsightsId = config.get<string>('mcp.applicationInsights.appId', '');
        const kustoUrl = config.get<string>('mcp.kusto.clusterUrl', '');

        return {
            connectionName: config.get<string>('mcp.connectionName', 'Default'),
            tenantId: config.get<string>('mcp.tenantId', ''),
            clientId: config.get<string>('mcp.clientId'),
            clientSecret: config.get<string>('mcp.clientSecret'),
            authFlow: (config.get<string>('mcp.authFlow', 'azure_cli') as 'device_code' | 'client_credentials' | 'azure_cli'),

            applicationInsightsAppId: appInsightsId,
            kustoClusterUrl: kustoUrl,

            cacheEnabled: config.get<boolean>('mcp.cache.enabled', true),
            cacheTTLSeconds: config.get<number>('mcp.cache.ttlSeconds', 3600),

            removePII: config.get<boolean>('mcp.sanitize.removePII', false),

            port: config.get<number>('mcp.port', 52345),

            workspacePath,
            queriesFolder: config.get<string>('queries.folder', 'queries'),

            references: config.get<any[]>('mcp.references', [])
        };
    }

    /**
     * Authenticate using configured flow
     */
    async authenticate(): Promise<AuthResult> {
        try {
            this.outputChannel.appendLine('[TelemetryService] Authenticating...');
            const result = await this.auth.authenticate();
            this.outputChannel.appendLine(`[TelemetryService] Authentication successful: ${result.user}`);
            return result;
        } catch (error: any) {
            this.outputChannel.appendLine(`[TelemetryService] Authentication failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Execute a KQL query against telemetry data
     */
    async executeKQL(kql: string): Promise<QueryResult> {
        try {
            this.outputChannel.appendLine('[TelemetryService] Executing KQL query...');

            // Check cache first
            const cachedResult = this.cache.get<QueryResult>(kql);

            if (cachedResult) {
                this.outputChannel.appendLine('[TelemetryService] Using cached result');
                return {
                    ...cachedResult,
                    cached: true
                };
            }

            // Get access token
            const token = await this.auth.getAccessToken();

            // Execute query
            this.outputChannel.appendLine('[TelemetryService] Sending query to Kusto...');
            const result = await this.kusto.executeQuery(kql, token);

            // Parse result
            const queryResult = this.kusto.parseResult(result);

            // Sanitize if enabled
            if (this.config.removePII && queryResult.rows) {
                queryResult.rows = queryResult.rows.map(row => sanitizeObject(row, this.config.removePII));
            }

            // Format as QueryResult
            const formattedResult: QueryResult = {
                type: 'table',
                kql,
                summary: `Returned ${queryResult.rows?.length || 0} rows`,
                columns: queryResult.columns,
                rows: queryResult.rows,
                cached: false
            };

            // Cache result
            this.cache.set(kql, formattedResult);

            this.outputChannel.appendLine(`[TelemetryService] Query successful: ${queryResult.rows?.length || 0} rows`);

            return formattedResult;
        } catch (error: any) {
            this.outputChannel.appendLine(`[TelemetryService] Query failed: ${error.message}`);

            return {
                type: 'error',
                kql,
                summary: `Error: ${error.message}`,
                cached: false
            };
        }
    }

    /**
     * Save a KQL query for future reference
     */
    async saveQuery(
        name: string,
        kql: string,
        purpose?: string,
        useCase?: string,
        tags?: string[],
        category?: string
    ): Promise<void> {
        try {
            this.outputChannel.appendLine(`[TelemetryService] Saving query: ${name}`);

            await this.queries.saveQuery(
                name,
                kql,
                purpose,
                useCase,
                tags,
                category
            );

            this.outputChannel.appendLine('[TelemetryService] Query saved successfully');
        } catch (error: any) {
            this.outputChannel.appendLine(`[TelemetryService] Failed to save query: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get all saved queries
     */
    async getSavedQueries(tags?: string[]): Promise<any[]> {
        try {
            this.outputChannel.appendLine('[TelemetryService] Loading saved queries...');
            const allQueries = await this.queries.getAllQueries();
            const queries = tags && tags.length > 0
                ? allQueries.filter(q => q.tags?.some(t => tags.includes(t)))
                : allQueries;
            this.outputChannel.appendLine(`[TelemetryService] Found ${queries.length} queries`);
            return queries;
        } catch (error: any) {
            this.outputChannel.appendLine(`[TelemetryService] Failed to load queries: ${error.message}`);
            throw error;
        }
    }

    /**
     * Search saved queries by keywords
     */
    async searchQueries(searchTerms: string[]): Promise<any[]> {
        try {
            this.outputChannel.appendLine(`[TelemetryService] Searching queries: ${searchTerms.join(', ')}`);
            const queries = await this.queries.searchQueries(searchTerms);
            this.outputChannel.appendLine(`[TelemetryService] Found ${queries.length} matching queries`);
            return queries;
        } catch (error: any) {
            this.outputChannel.appendLine(`[TelemetryService] Search failed: ${error.message}`);
            throw error;
        }
    }

    /**
     * Get cache statistics
     */
    getCacheStats(): any {
        return this.cache.getStats();
    }

    /**
     * Clear cache
     */
    clearCache(): void {
        this.outputChannel.appendLine('[TelemetryService] Clearing cache...');
        this.cache.clear();
        this.outputChannel.appendLine('[TelemetryService] Cache cleared');
    }

    /**
     * Check if configuration is valid
     */
    isConfigured(): boolean {
        return !!(
            this.config.applicationInsightsAppId &&
            this.config.kustoClusterUrl
        );
    }

    /**
     * Get current configuration
     */
    getConfig(): MCPConfig {
        return this.config;
    }

    /**
     * Reload configuration from workspace settings
     */
    reloadConfig(): void {
        this.outputChannel.appendLine('[TelemetryService] Reloading configuration...');
        this.config = this.loadConfig();

        // Recreate services with new config
        this.auth = new AuthService(this.config);
        this.kusto = new KustoService(
            this.config.applicationInsightsAppId,
            this.config.kustoClusterUrl
        );
        this.cache = new CacheService(
            this.config.workspacePath,
            this.config.cacheTTLSeconds,
            this.config.cacheEnabled
        );
        this.queries = new QueriesService(
            this.config.workspacePath,
            this.config.queriesFolder
        );

        this.outputChannel.appendLine('[TelemetryService] Configuration reloaded');
        if (this.currentProfile) {
            this.outputChannel.appendLine(`[TelemetryService] Active profile: ${this.currentProfile} (${this.config.connectionName})`);
        }
    }

    /**
     * Switch to a different profile and reload configuration
     */
    switchProfile(profileName: string): void {
        this.outputChannel.appendLine(`[TelemetryService] Switching to profile: ${profileName}`);
        this.currentProfile = profileName;
        this.reloadConfig();
    }

    /**
     * Get current profile name (if using multi-profile mode)
     */
    getCurrentProfileName(): string | null {
        return this.currentProfile;
    }

    /**
     * Get connection name from current config
     */
    getConnectionName(): string {
        return this.config.connectionName;
    }
}
