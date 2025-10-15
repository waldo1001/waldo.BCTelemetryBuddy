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
    authFlow: 'device_code' | 'client_credentials';

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

    // External References
    references: Reference[];
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
        throw new Error('BCTB_WORKSPACE_PATH environment variable is required');
    }

    return {
        connectionName: process.env.BCTB_CONNECTION_NAME || 'Default',
        tenantId: process.env.BCTB_TENANT_ID || '',
        clientId: process.env.BCTB_CLIENT_ID,
        clientSecret: process.env.BCTB_CLIENT_SECRET,
        authFlow: (process.env.BCTB_AUTH_FLOW as 'device_code' | 'client_credentials') || 'device_code',

        applicationInsightsAppId: process.env.BCTB_APP_INSIGHTS_ID || '',
        kustoClusterUrl: process.env.BCTB_KUSTO_URL || '',

        cacheEnabled: process.env.BCTB_CACHE_ENABLED !== 'false',
        cacheTTLSeconds: parseInt(process.env.BCTB_CACHE_TTL || '3600', 10),

        removePII: process.env.BCTB_REMOVE_PII === 'true',

        port: parseInt(process.env.BCTB_PORT || '52345', 10),

        workspacePath,

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
 * Validate required configuration
 */
export function validateConfig(config: MCPConfig): void {
    const errors: string[] = [];

    if (!config.tenantId) {
        errors.push('tenantId is required');
    }

    if (!config.applicationInsightsAppId) {
        errors.push('applicationInsightsAppId is required');
    }

    if (!config.kustoClusterUrl) {
        errors.push('kustoClusterUrl is required');
    }

    if (config.authFlow === 'client_credentials' && !config.clientId) {
        errors.push('clientId is required for client_credentials auth flow');
    }

    if (config.authFlow === 'client_credentials' && !config.clientSecret) {
        errors.push('clientSecret is required for client_credentials auth flow');
    }

    if (errors.length > 0) {
        throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
    }
}
