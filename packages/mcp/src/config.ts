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

    // Config file path (set by loadConfigFromFile for profile switching)
    configFilePath?: string;

    // How workspacePath was resolved (diagnostics/telemetry; set by loadConfigFromFile)
    workspaceVia?: 'explicit' | 'env' | 'config-dir' | 'cwd';
    workspaceTokenStripped?: boolean;

    // Knowledge Base
    knowledgeBase?: KBConfig;
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

/**
 * Connection metadata read from a workspace `.bctb-config.json` for discovery
 * (list_profiles / switch_profile) WITHOUT activating it. Normalizes both the
 * flat single-profile shape and the multi-profile `{ profiles }` shape.
 * See docs/plans/mcp-workspace-connection-discovery.md.
 */
export interface WorkspaceConnectionMeta {
    isMultiProfile: boolean;
    connectionName?: string;
    applicationInsightsAppId?: string;
    authFlow?: string;
    subProfiles?: Array<{
        name: string;
        connectionName?: string;
        applicationInsightsAppId?: string;
        authFlow?: string;
    }>;
}

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import type { KBConfig } from '@bctb/shared';

/**
 * Load configuration from environment variables
 * Used by VSCode extension for backward compatibility
 */
export function loadConfig(): MCPConfig {
    let workspacePath = process.env.BCTB_WORKSPACE_PATH;

    if (!workspacePath) {
        console.error('\n❌ Configuration Error: BCTB_WORKSPACE_PATH environment variable is required');
        console.error('Set it to your workspace path, e.g.: $env:BCTB_WORKSPACE_PATH="C:\\path\\to\\workspace"');
        console.error('Or create a .bctb-config.json file - run: node path/to/cli.js init\n');
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

/** Matches an unexpanded `${...}` variable token (e.g. VS Code's `${workspaceFolder}`). */
const UNEXPANDED_VAR_TOKEN = /\$\{[^}]+\}/;

/**
 * How the workspace path was resolved — surfaced for diagnostics/telemetry.
 */
export interface WorkspaceResolution {
    path: string;
    via: 'explicit' | 'env' | 'config-dir' | 'cwd';
    tokenStripped: boolean;
}

/**
 * Resolve the workspace root host-agnostically (S2/S3).
 *
 * Precedence (env first, to keep the VS Code extension path byte-identical):
 *   1. BCTB_WORKSPACE_PATH (if set and not an unexpanded `${...}` token)  -> 'env'
 *   2. rawWorkspacePath    (if set and not a token)                       -> 'explicit'
 *   3. dirname(configFilePath) (if set)                                   -> 'config-dir'
 *   4. process.cwd()                                                      -> 'cwd'
 *
 * Any candidate still containing a `${...}` token is treated as unset and
 * `tokenStripped` is reported true.
 */
export function resolveWorkspacePath(
    rawWorkspacePath: string | undefined,
    configFilePath: string | null
): WorkspaceResolution {
    const env = process.env.BCTB_WORKSPACE_PATH;
    const envHasToken = !!env && UNEXPANDED_VAR_TOKEN.test(env);

    // 1. Environment variable wins (the VS Code extension always sets this).
    if (env && !envHasToken) {
        return { path: env, via: 'env', tokenStripped: false };
    }

    const rawHasToken = !!rawWorkspacePath && UNEXPANDED_VAR_TOKEN.test(rawWorkspacePath);
    const tokenStripped = rawHasToken || envHasToken;

    // 2. Explicit, non-token workspacePath from the config.
    if (rawWorkspacePath && !rawHasToken) {
        return { path: rawWorkspacePath, via: 'explicit', tokenStripped };
    }

    // 3. The directory the config file lives in (the host-agnostic fix).
    if (configFilePath) {
        return { path: path.dirname(configFilePath), via: 'config-dir', tokenStripped };
    }

    // 4. Last resort: the current working directory.
    return { path: process.cwd(), via: 'cwd', tokenStripped };
}

/**
 * Load config from file with discovery and profile support
 * Returns null if no config file is found (allows fallback to env vars)
 * @param configPath Optional path to config file
 * @param profileName Optional profile name to use
 * @param silent If true, suppress console output (for stdio mode)
 */
export function loadConfigFromFile(configPath?: string, profileName?: string, silent: boolean = false): MCPConfig | null {
    let filePath: string | null = null;
    let explicitPathProvided = false;

    // Discovery order (as per refactoring plan):
    // 1. --config CLI argument
    // 2. .bctb-config.json in workspace root (BCTB_WORKSPACE_PATH env var) - PRIORITY for VSCode extension
    // 3. .bctb-config.json in current directory
    // 4. ~/.bctb/config.json OR ~/.bctb-config.json in user home directory

    // Try each location in order until we find a config file
    if (configPath) {
        explicitPathProvided = true;
        const resolvedPath = path.resolve(configPath);
        if (fs.existsSync(resolvedPath)) {
            filePath = resolvedPath;
        }
        // If explicit path provided but doesn't exist, don't fallback to other locations
        if (!filePath) {
            return null;
        }
    }

    // Check BCTB_WORKSPACE_PATH first (VSCode extension sets this)
    if (!filePath && process.env.BCTB_WORKSPACE_PATH) {
        const workspacePath = path.join(process.env.BCTB_WORKSPACE_PATH, '.bctb-config.json');
        if (fs.existsSync(workspacePath)) {
            filePath = workspacePath;
        }
    }

    // Then check current directory
    if (!filePath && fs.existsSync('.bctb-config.json')) {
        filePath = path.resolve('.bctb-config.json');
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
        // No config file found - return null (caller should handle error)
        console.error('\n❌ Configuration Error: No .bctb-config.json file found');
        console.error(`\nSearched locations:`);
        if (process.env.BCTB_WORKSPACE_PATH) {
            console.error(`  - ${path.join(process.env.BCTB_WORKSPACE_PATH, '.bctb-config.json')} (workspace)`);
        }
        console.error(`  - ${path.join(os.homedir(), '.bctb', 'config.json')} (home directory)`);
        console.error(`  - ${path.join(os.homedir(), '.bctb-config.json')} (home directory)`);
        console.error(`\nTo create a config file, run:\n  node path/to/mcp/dist/cli.js init\n`);
        return null;
    }

    if (!silent) {
        console.error(`📄 Loading config from: ${filePath}`);
        console.error(`[Config] BCTB_WORKSPACE_PATH env var = ${process.env.BCTB_WORKSPACE_PATH || '(not set)'}`);
    }

    const fileContents = fs.readFileSync(filePath, 'utf-8');
    const rawConfig = JSON.parse(fileContents) as ProfiledConfig & Partial<MCPConfig>;

    // Handle multi-profile configs
    if (rawConfig.profiles) {
        const profile = profileName || process.env.BCTB_PROFILE || rawConfig.defaultProfile;

        if (!profile) {
            throw new Error('No profile specified. Use --profile <name> or set BCTB_PROFILE env var');
        }

        if (!rawConfig.profiles[profile]) {
            throw new Error(`Profile '${profile}' not found in config`);
        }

        console.error(`📋 Using profile: "${profile}"`);

        // Resolve profile inheritance
        const resolvedProfile = resolveProfileInheritance(rawConfig.profiles, profile);

        // Resolve the workspace root host-agnostically (env -> explicit -> config-dir -> cwd).
        const ws = resolveWorkspacePath(resolvedProfile.workspacePath, filePath);

        // Merge with top-level settings (cache, sanitize, references)
        const merged: MCPConfig = {
            ...resolvedProfile as MCPConfig,
            cacheEnabled: resolvedProfile.cacheEnabled ?? rawConfig.cache?.enabled ?? true,
            cacheTTLSeconds: resolvedProfile.cacheTTLSeconds ?? rawConfig.cache?.ttlSeconds ?? 3600,
            removePII: resolvedProfile.removePII ?? rawConfig.sanitize?.removePII ?? false,
            references: resolvedProfile.references ?? rawConfig.references ?? [],
            port: resolvedProfile.port ?? 52345,
            // Keep a raw token (e.g. ${workspaceFolder}) so expandEnvironmentVariables can
            // expand it against ws.path while preserving any suffix; otherwise default to ws.path.
            workspacePath: resolvedProfile.workspacePath ?? ws.path,
            workspaceVia: ws.via,
            workspaceTokenStripped: ws.tokenStripped,
            queriesFolder: resolvedProfile.queriesFolder ?? 'queries',
            connectionName: resolvedProfile.connectionName ?? 'Default',
            tenantId: resolvedProfile.tenantId ?? '',
            authFlow: resolvedProfile.authFlow ?? 'azure_cli',
            applicationInsightsAppId: resolvedProfile.applicationInsightsAppId ?? '',
            kustoClusterUrl: resolvedProfile.kustoClusterUrl ?? '',
            configFilePath: filePath!
        };

        return expandEnvironmentVariables(merged, ws.path);
    }

    // Single profile config (backward compatible)
    const ws = resolveWorkspacePath(rawConfig.workspacePath, filePath);
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
        workspacePath: rawConfig.workspacePath ?? ws.path,
        workspaceVia: ws.via,
        workspaceTokenStripped: ws.tokenStripped,
        queriesFolder: rawConfig.queriesFolder ?? 'queries',
        references: rawConfig.references ?? [],
        configFilePath: filePath!
    };

    return expandEnvironmentVariables(singleConfig, ws.path);
}

/** Directory names that are never worth scanning for a workspace config. */
const SCAN_SKIP_DIRS = new Set(['node_modules', '.git', '.vscode', 'bin', 'obj', 'dist', 'out']);

/**
 * Find workspace `.bctb-config.json` files anchored at `dir`: the file directly
 * in `dir`, plus one level down (`dir/<child>/.bctb-config.json`) — which covers
 * the customer/TelemetryAnalysis layout where the config is a subfolder of the
 * opened workspace root. Bounded: single readdir, no recursion beyond one level,
 * skips `node_modules`/`.git`/dot-directories. Never throws (returns [] on error).
 * See docs/plans/mcp-workspace-connection-discovery.md.
 */
export function scanDirForWorkspaceConfigs(dir: string): string[] {
    const found: string[] = [];
    try {
        const direct = path.join(dir, '.bctb-config.json');
        if (fs.existsSync(direct)) {
            found.push(direct);
        }

        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const name = entry.name;
            if (name.startsWith('.') || SCAN_SKIP_DIRS.has(name)) continue;
            const childCfg = path.join(dir, name, '.bctb-config.json');
            if (fs.existsSync(childCfg)) {
                found.push(childCfg);
            }
        }
    } catch {
        // Unreadable/non-existent dir — discovery is best-effort, never fatal.
        return [];
    }
    return found;
}

/**
 * Read connection metadata from a workspace `.bctb-config.json` for discovery,
 * WITHOUT activating it (no env/cwd side-effects, no "No profile specified" throw).
 * Normalizes both the flat and multi-profile shapes; excludes `_`-prefixed base
 * profiles and resolves `extends` inheritance so inherited authFlow is populated.
 * Returns null on any read/parse failure.
 */
export function readWorkspaceConnectionMeta(configPath: string): WorkspaceConnectionMeta | null {
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as ProfiledConfig & Partial<MCPConfig>;

        if (raw.profiles && Object.keys(raw.profiles).length > 0) {
            const subProfiles = Object.keys(raw.profiles)
                .filter(name => !name.startsWith('_'))
                .map(name => {
                    let resolved: Partial<MCPConfig>;
                    try {
                        resolved = resolveProfileInheritance(raw.profiles as Record<string, any>, name);
                    } catch {
                        resolved = raw.profiles![name] ?? {};
                    }
                    return {
                        name,
                        connectionName: resolved.connectionName,
                        applicationInsightsAppId: resolved.applicationInsightsAppId,
                        authFlow: resolved.authFlow,
                    };
                });
            return { isMultiProfile: true, subProfiles };
        }

        return {
            isMultiProfile: false,
            connectionName: raw.connectionName,
            applicationInsightsAppId: raw.applicationInsightsAppId,
            authFlow: raw.authFlow,
        };
    } catch {
        return null;
    }
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
function expandEnvironmentVariables(config: any, workspaceRoot?: string): any {
    if (typeof config === 'string') {
        return config.replace(/\$\{([^}]+)\}/g, (_, varName) => {
            // Special case: ${workspaceFolder} maps to the resolved workspace root.
            // Outside VS Code (no BCTB_WORKSPACE_PATH) this anchors to the config-file
            // directory instead of silently falling back to cwd — the host-agnostic fix.
            if (varName === 'workspaceFolder') {
                const value = process.env.BCTB_WORKSPACE_PATH || workspaceRoot || process.cwd();
                console.error(`[Config] Expanding \${workspaceFolder} to: ${value}`);
                return value;
            }
            return process.env[varName] || '';
        });
    }

    if (Array.isArray(config)) {
        return config.map(item => expandEnvironmentVariables(item, workspaceRoot));
    }

    if (typeof config === 'object' && config !== null) {
        const result: any = {};
        for (const key in config) {
            result[key] = expandEnvironmentVariables(config[key], workspaceRoot);
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

    // Merge in the agents section template (not part of MCPConfig/ProfiledConfig but lives in same file)
    const agentsTemplate = {
        agents: {
            llm: {
                provider: 'azure-openai',
                endpoint: '${AZURE_OPENAI_ENDPOINT}',
                deployment: 'gpt-4o',
                apiVersion: '2024-10-21'
            },
            defaults: {
                maxToolCalls: 20,
                maxTokens: 4096,
                contextWindowRuns: 5,
                resolvedIssueTTLDays: 30,
                toolScope: 'read-only'
            },
            actions: {
                'teams-webhook': {
                    url: '${TEAMS_WEBHOOK_URL}'
                }
            }
        }
    };

    const combined = { ...template, ...agentsTemplate };
    fs.writeFileSync(outputPath, JSON.stringify(combined, null, 2));
}
