/**
 * Configuration interface for MCP server
 * Loaded from VSCode workspace settings via environment variables
 */
export interface MCPConfig {
    // Connection
    connectionName: string;
    tenantId: string;
    clientId?: string;
    clientSecret?: string;
    authFlow: 'device_code' | 'client_credentials' | 'azure_cli' | 'vscode_auth';

    // Application Insights / Kusto
    applicationInsightsAppId: string;
    kustoClusterUrl: string;

    // Cache
    cacheEnabled: boolean;
    cacheTTLSeconds: number;

    // Sanitization
    removePII: boolean;

    // Server
    port: number;

    // Workspace
    workspacePath: string;

    // Queries
    queriesFolder: string;

    // External References
    references: Reference[];

    // Profile inheritance support (optional)
    extends?: string;

    // Usage Telemetry (tracks extension/MCP usage, NOT BC telemetry data)
    telemetry?: TelemetryConfig;
}

/**
 * Usage Telemetry Configuration (tracks extension/MCP usage)
 * Separate from Business Central telemetry querying
 */
export interface TelemetryConfig {
    // Enable/disable usage telemetry (respects VS Code telemetry level)
    enabled: boolean;

    // Rate limiting (prevent runaway costs)
    rateLimiting?: {
        maxIdenticalErrors?: number;      // Default: 10
        maxEventsPerSession?: number;     // Default: 1000 (extension), 2000 (MCP)
        maxEventsPerMinute?: number;      // Default: 100 (extension), 200 (MCP)
        errorCooldownMs?: number;         // Default: 60000 (1 minute)
    };
}

/**
 * Multi-profile configuration file format
 * Single .bctb-config.json can contain multiple customer profiles
 */
export interface ProfiledConfig {
    // Named profiles (key = profile name)
    profiles?: Record<string, MCPConfig>;

    // Default profile to use on startup
    defaultProfile?: string;

    // Global cache settings (shared across profiles)
    cache?: {
        enabled: boolean;
        ttlSeconds: number;
    };

    // Global sanitization settings
    sanitize?: {
        removePII: boolean;
    };

    // Global references (shared across profiles)
    references?: Reference[];

    // Global usage telemetry settings
    telemetry?: TelemetryConfig;

    // Single-profile mode (backward compatible)
    // If profiles is not set, treat entire config as one profile
    connectionName?: string;
    tenantId?: string;
    clientId?: string;
    clientSecret?: string;
    authFlow?: 'device_code' | 'client_credentials' | 'azure_cli' | 'vscode_auth';
    applicationInsightsAppId?: string;
    kustoClusterUrl?: string;
    cacheEnabled?: boolean;
    cacheTTLSeconds?: number;
    removePII?: boolean;
    port?: number;
    workspacePath?: string;
    queriesFolder?: string;
}

export interface Reference {
    name: string;
    type: 'github' | 'web';
    url: string;
    enabled: boolean;
}

/**
 * Load configuration from environment variables
 * Extension passes workspace settings via env vars when spawning MCP
 */
export function loadConfig(): MCPConfig {
    const workspacePath = process.env.BCTB_WORKSPACE_PATH;

    if (!workspacePath) {
        console.error('\n❌ Configuration Error: BCTB_WORKSPACE_PATH environment variable is required');
        console.error('Set it to your workspace path, e.g.: $env:BCTB_WORKSPACE_PATH="C:\\path\\to\\workspace"\n');
        throw new Error('BCTB_WORKSPACE_PATH environment variable is required');
    }

    return {
        connectionName: process.env.BCTB_CONNECTION_NAME || 'Default',
        tenantId: process.env.BCTB_TENANT_ID || '',
        clientId: process.env.BCTB_CLIENT_ID,
        clientSecret: process.env.BCTB_CLIENT_SECRET,
        authFlow: (process.env.BCTB_AUTH_FLOW as 'device_code' | 'client_credentials' | 'azure_cli' | 'vscode_auth') || 'azure_cli',

        applicationInsightsAppId: process.env.BCTB_APP_INSIGHTS_ID || '',
        kustoClusterUrl: process.env.BCTB_KUSTO_URL || '',

        cacheEnabled: process.env.BCTB_CACHE_ENABLED !== 'false',
        cacheTTLSeconds: parseInt(process.env.BCTB_CACHE_TTL || '3600', 10),

        removePII: process.env.BCTB_REMOVE_PII === 'true',

        port: parseInt(process.env.BCTB_PORT || '52345', 10),

        workspacePath,

        queriesFolder: process.env.BCTB_QUERIES_FOLDER || 'queries',

        references: parseReferences(process.env.BCTB_REFERENCES || '[]')
    };
}

/**
 * Parse references from JSON string
 */
function parseReferences(referencesJson: string): Reference[] {
    try {
        const refs = JSON.parse(referencesJson);
        return Array.isArray(refs) ? refs : [];
    } catch (error) {
        console.error('Failed to parse references:', error);
        return [];
    }
}

/**
 * Resolve profile inheritance (supports 'extends' key)
 * @param profiles All available profiles
 * @param profileName Name of profile to resolve
 * @param visited Set of visited profiles (prevents circular inheritance)
 * @returns Resolved MCPConfig with all inherited settings merged
 */
export function resolveProfileInheritance(
    profiles: Record<string, MCPConfig>,
    profileName: string,
    visited: Set<string> = new Set()
): MCPConfig {
    if (visited.has(profileName)) {
        throw new Error(`Circular profile inheritance detected: ${profileName}`);
    }
    visited.add(profileName);

    const profile = profiles[profileName];
    if (!profile) {
        throw new Error(`Profile '${profileName}' not found`);
    }

    // No inheritance
    if (!profile.extends) {
        return expandEnvironmentVariables(profile);
    }

    // Resolve parent profile
    const parentProfile = resolveProfileInheritance(profiles, profile.extends, visited);

    // Deep merge child over parent
    const merged = deepMerge(parentProfile, profile);
    delete merged.extends; // Remove extends key from final config

    return expandEnvironmentVariables(merged);
}

/**
 * Deep merge objects (child overrides parent)
 */
function deepMerge(parent: any, child: any): any {
    const result = { ...parent };

    for (const key in child) {
        if (key === 'extends') continue; // Skip extends key

        if (typeof child[key] === 'object' && !Array.isArray(child[key]) && child[key] !== null) {
            result[key] = deepMerge(parent[key] || {}, child[key]);
        } else {
            result[key] = child[key];
        }
    }

    return result;
}

/**
 * Expand environment variables in config (${VAR_NAME})
 */
export function expandEnvironmentVariables(config: any): any {
    const result: any = Array.isArray(config) ? [] : {};

    for (const key in config) {
        const value = config[key];

        if (typeof value === 'string') {
            // Replace ${VAR_NAME} with process.env.VAR_NAME
            result[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
                return process.env[varName] || '';
            });
        } else if (typeof value === 'object' && value !== null) {
            result[key] = expandEnvironmentVariables(value);
        } else {
            result[key] = value;
        }
    }

    return result;
}

/**
 * Validate required configuration
 * Returns validation errors instead of throwing - allows server to start gracefully
 */
export function validateConfig(config: MCPConfig): string[] {
    const errors: string[] = [];

    // Azure CLI and VS Code auth don't need tenantId (use current login session)
    if (config.authFlow !== 'azure_cli' && config.authFlow !== 'vscode_auth' && !config.tenantId) {
        errors.push('BCTB_TENANT_ID is required (unless using azure_cli or vscode_auth auth flow)');
    }

    if (!config.applicationInsightsAppId) {
        errors.push('BCTB_APP_INSIGHTS_ID is required');
    }

    if (!config.kustoClusterUrl) {
        errors.push('BCTB_KUSTO_URL is required');
    }

    if (config.authFlow === 'client_credentials' && !config.clientId) {
        errors.push('BCTB_CLIENT_ID is required for client_credentials auth flow');
    }

    if (config.authFlow === 'client_credentials' && !config.clientSecret) {
        errors.push('BCTB_CLIENT_SECRET is required for client_credentials auth flow');
    }

    if (errors.length > 0) {
        console.error('\n⚠️  Configuration Incomplete:');
        errors.forEach(err => console.error(`   - ${err}`));
        console.error('\nServer will start but queries will fail until configuration is complete.');
        console.error('Run "BC Telemetry Buddy: Setup Wizard" from Command Palette to configure.\n');
    }

    return errors;
}
