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
    authFlow: 'device_code' | 'client_credentials' | 'azure_cli';

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
}

export interface Reference {
    name: string;
    type: 'github' | 'web';
    url: string;
    enabled: boolean;
}

export interface ProfiledConfig {
    profiles?: Record<string, Partial<MCPConfig>>;
    defaultProfile?: string;
    cache?: {
        enabled: boolean;
        ttlSeconds: number;
    };
    sanitize?: {
        removePII: boolean;
    };
    references?: Reference[];
}

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Load configuration from environment variables
 * Extension passes workspace settings via env vars when spawning MCP
 */
export function loadConfig(): MCPConfig {
    let workspacePath = process.env.BCTB_WORKSPACE_PATH;

    if (!workspacePath) {
        console.error('\n❌ Configuration Error: BCTB_WORKSPACE_PATH environment variable is required');
        console.error('Set it to your workspace path, e.g.: $env:BCTB_WORKSPACE_PATH="C:\\path\\to\\workspace"');
        console.error('Or create a .bctb-config.json file - run: bctb-mcp init\n');
        // Use a default workspace path to allow server to start gracefully
        workspacePath = process.cwd();
    }

    return {
        connectionName: process.env.BCTB_CONNECTION_NAME || 'Default',
        tenantId: process.env.BCTB_TENANT_ID || '',
        clientId: process.env.BCTB_CLIENT_ID,
        clientSecret: process.env.BCTB_CLIENT_SECRET,
        authFlow: (process.env.BCTB_AUTH_FLOW as 'device_code' | 'client_credentials' | 'azure_cli') || 'azure_cli',

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
 * Validate required configuration
 * Returns validation errors instead of throwing - allows server to start gracefully
 */
export function validateConfig(config: MCPConfig): string[] {
    const errors: string[] = [];

    // Check if workspace path is set (either from config file or environment variable)
    if (!config.workspacePath) {
        errors.push('workspacePath is required - set it in your config file or via BCTB_WORKSPACE_PATH environment variable');
    }

    // Azure CLI doesn't need tenantId (uses current az login session)
    if (config.authFlow !== 'azure_cli' && !config.tenantId) {
        errors.push('BCTB_TENANT_ID is required (unless using azure_cli auth flow)');
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
        console.error('Run "bctb-mcp init" to create a config file, or "bctb-mcp validate" to check your existing config.\n');
    }

    return errors;
}

/**
 * Load config from file with discovery and profile support
 * Returns null if no config file is found (allows fallback to env vars)
 */
export function loadConfigFromFile(configPath?: string, profileName?: string): MCPConfig | null {
    let filePath: string | null = null;

    // Discovery order (as per refactoring plan):
    // 1. --config CLI argument
    // 2. .bctb-config.json in current directory
    // 3. .bctb-config.json in workspace root (BCTB_WORKSPACE_PATH env var)
    // 4. ~/.bctb/config.json OR ~/.bctb-config.json in user home directory

    // Try each location in order until we find a config file
    if (configPath) {
        filePath = path.resolve(configPath);
    }

    if (!filePath && fs.existsSync('.bctb-config.json')) {
        filePath = path.resolve('.bctb-config.json');
    }

    if (!filePath && process.env.BCTB_WORKSPACE_PATH) {
        const workspacePath = path.join(process.env.BCTB_WORKSPACE_PATH, '.bctb-config.json');
        if (fs.existsSync(workspacePath)) {
            filePath = workspacePath;
        }
    }

    if (!filePath) {
        // Check both home directory formats:
        // 1. ~/.bctb/config.json (subfolder format, used by setup wizard)
        // 2. ~/.bctb-config.json (single file format)
        const homePathSubfolder = path.join(os.homedir(), '.bctb', 'config.json');
        const homePathSingleFile = path.join(os.homedir(), '.bctb-config.json');

        if (fs.existsSync(homePathSubfolder)) {
            filePath = homePathSubfolder;
        } else if (fs.existsSync(homePathSingleFile)) {
            filePath = homePathSingleFile;
        }
    }

    if (!filePath) {
        // No config file found - return null to allow fallback to env vars
        console.log('[Config] No config file found in any location');
        return null;
    }

    console.log(`📄 Loading config from: ${filePath}`);
    console.log(`[Config] BCTB_WORKSPACE_PATH env var = ${process.env.BCTB_WORKSPACE_PATH || '(not set)'}`);

    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const rawConfig = JSON.parse(fileContent) as ProfiledConfig & Partial<MCPConfig>;

    // Handle multi-profile configs
    if (rawConfig.profiles) {
        const profile = profileName || process.env.BCTB_PROFILE || rawConfig.defaultProfile;

        if (!profile) {
            throw new Error('No profile specified. Use --profile <name> or set BCTB_PROFILE env var');
        }

        if (!rawConfig.profiles[profile]) {
            throw new Error(`Profile '${profile}' not found in config`);
        }

        console.log(`📋 Using profile: "${profile}"`);

        // Resolve profile inheritance
        const resolvedProfile = resolveProfileInheritance(rawConfig.profiles, profile);

        // Merge with top-level settings (cache, sanitize, references)
        const merged: MCPConfig = {
            ...resolvedProfile as MCPConfig,
            cacheEnabled: resolvedProfile.cacheEnabled ?? rawConfig.cache?.enabled ?? true,
            cacheTTLSeconds: resolvedProfile.cacheTTLSeconds ?? rawConfig.cache?.ttlSeconds ?? 3600,
            removePII: resolvedProfile.removePII ?? rawConfig.sanitize?.removePII ?? false,
            references: resolvedProfile.references ?? rawConfig.references ?? [],
            port: resolvedProfile.port ?? 52345,
            workspacePath: resolvedProfile.workspacePath ?? process.env.BCTB_WORKSPACE_PATH ?? process.cwd(),
            queriesFolder: resolvedProfile.queriesFolder ?? 'queries',
            connectionName: resolvedProfile.connectionName ?? 'Default',
            tenantId: resolvedProfile.tenantId ?? '',
            authFlow: resolvedProfile.authFlow ?? 'azure_cli',
            applicationInsightsAppId: resolvedProfile.applicationInsightsAppId ?? '',
            kustoClusterUrl: resolvedProfile.kustoClusterUrl ?? ''
        };

        return expandEnvironmentVariables(merged);
    }

    // Single profile config (backward compatible)
    const singleConfig: MCPConfig = {
        connectionName: rawConfig.connectionName ?? 'Default',
        tenantId: rawConfig.tenantId ?? '',
        clientId: rawConfig.clientId,
        clientSecret: rawConfig.clientSecret,
        authFlow: rawConfig.authFlow ?? 'azure_cli',
        applicationInsightsAppId: rawConfig.applicationInsightsAppId ?? '',
        kustoClusterUrl: rawConfig.kustoClusterUrl ?? '',
        cacheEnabled: rawConfig.cacheEnabled ?? true,
        cacheTTLSeconds: rawConfig.cacheTTLSeconds ?? 3600,
        removePII: rawConfig.removePII ?? false,
        port: rawConfig.port ?? 52345,
        workspacePath: rawConfig.workspacePath ?? process.env.BCTB_WORKSPACE_PATH ?? process.cwd(),
        queriesFolder: rawConfig.queriesFolder ?? 'queries',
        references: rawConfig.references ?? []
    };

    return expandEnvironmentVariables(singleConfig);
}

/**
 * Resolve profile inheritance (supports 'extends' key)
 */
function resolveProfileInheritance(profiles: Record<string, any>, profileName: string, visited: Set<string> = new Set()): Partial<MCPConfig> {
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
        return profile;
    }

    // Resolve parent profile
    const parentProfile = resolveProfileInheritance(profiles, profile.extends, visited);

    // Deep merge child over parent
    const merged = deepMerge(parentProfile, profile);
    delete merged.extends; // Remove extends key from final config

    return merged;
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
 * Special handling for VS Code placeholders like ${workspaceFolder}
 */
function expandEnvironmentVariables(config: any): any {
    if (typeof config === 'string') {
        return config.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            // Special case: ${workspaceFolder} maps to BCTB_WORKSPACE_PATH
            if (varName === 'workspaceFolder') {
                const value = process.env.BCTB_WORKSPACE_PATH || process.cwd();
                console.log(`[Config] Expanding \${workspaceFolder} to: ${value}`);
                return value;
            }
            return process.env[varName] || '';
        });
    }

    if (Array.isArray(config)) {
        return config.map(item => expandEnvironmentVariables(item));
    }

    if (typeof config === 'object' && config !== null) {
        const result: any = {};
        for (const key in config) {
            result[key] = expandEnvironmentVariables(config[key]);
        }
        return result;
    }

    return config;
}

/**
 * Initialize config file template
 */
export function initConfig(outputPath: string): void {
    const template: ProfiledConfig = {
        profiles: {
            default: {
                connectionName: 'My BC Production',
                authFlow: 'azure_cli',
                applicationInsightsAppId: 'your-app-insights-id',
                kustoClusterUrl: 'https://ade.applicationinsights.io',
                workspacePath: process.cwd(),
                queriesFolder: 'queries'
            }
        },
        defaultProfile: 'default',
        cache: {
            enabled: true,
            ttlSeconds: 3600
        },
        sanitize: {
            removePII: false
        },
        references: [
            {
                name: 'Microsoft BC Telemetry Samples',
                type: 'github',
                url: 'https://github.com/microsoft/BCTech',
                enabled: true
            }
        ]
    };

    fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
}
