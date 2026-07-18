/**
 * MCP SDK-based server for stdio mode.
 * 
 * Uses the official @modelcontextprotocol/sdk to handle the MCP protocol,
 * replacing the hand-rolled JSON-RPC implementation for stdio transport.
 * 
 * Architecture:
 * - McpServer (SDK) handles protocol negotiation, capability exchange, transport
 * - StdioServerTransport (SDK) handles stdin/stdout JSON-RPC framing
 * - ToolHandlers (extracted) contains all business logic
 * - TOOL_DEFINITIONS (extracted) is the single source of truth for tool metadata
 * 
 * The Express HTTP server in server.ts remains untouched for backward compatibility
 * with the VS Code extension Command Palette (MCPClient/axios).
 */

import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { loadConfig, loadConfigFromFile, validateConfig, scanDirForWorkspaceConfigs, MCPConfig } from './config.js';
import { TOOL_DEFINITIONS } from './tools/toolDefinitions.js';
import { SERVER_INSTRUCTIONS, WORKFLOW_PROMPT_CONTENT } from './tools/serverInstructions.js';
import { SETUP_PROMPT_CONTENT } from './tools/setupInstructions.js';
import { ToolHandlers, ToolCallResult, initializeServices } from './tools/toolHandlers.js';
import { ExportService } from '@bctb/shared';
import { VERSION } from './version.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import {
    KnowledgeBaseService,
    KBConfig,
    TELEMETRY_EVENTS,
    createCommonProperties,
    cleanTelemetryProperties,
} from '@bctb/shared';

/**
 * Why the Knowledge Base eager-load did or didn't happen.
 */
export type KbLoadReason = 'loaded' | 'no-workspace-config' | 'load-failed' | 'no-workspace-path';

export interface KbLoadResult {
    service: KnowledgeBaseService | null;
    reason: KbLoadReason;
    /** The workspace-local `.bctb-config.json` path that gates the load. */
    workspaceConfigPath: string;
}

/**
 * Eager-load the Knowledge Base at MCP startup — but only when the workspace
 * directory itself contains `.bctb-config.json`. Checking
 * `loadConfigFromFile`'s return value is not enough: it falls back to
 * `~/.bctb/config.json`, and `resolvedConfig.workspacePath` then resolves to
 * `BCTB_WORKSPACE_PATH` / config-dir / `process.cwd()`. Without this direct
 * workspace-local check, the KB cache ends up written into every workspace
 * MCP touches.
 *
 * Returns the loaded service plus a diagnosable reason. When the load is
 * skipped because the workspace has no `.bctb-config.json`, a loud stderr line
 * names the path that was tried and how the workspace was resolved — so the
 * "Knowledge Base is not available" symptom is debuggable rather than silent.
 * Failures are non-fatal.
 */
export async function maybeLoadKnowledgeBase(
    resolvedConfig: MCPConfig
): Promise<KbLoadResult> {
    if (!resolvedConfig.workspacePath) {
        return { service: null, reason: 'no-workspace-path', workspaceConfigPath: '' };
    }
    const workspaceConfigPath = path.join(resolvedConfig.workspacePath, '.bctb-config.json');
    if (!fs.existsSync(workspaceConfigPath)) {
        console.error(
            `[KB] Knowledge Base not loaded: no .bctb-config.json at ${workspaceConfigPath} ` +
            `(workspace resolved via '${resolvedConfig.workspaceVia ?? 'unknown'}'). ` +
            `Launch with --config <workspace>/.bctb-config.json, set BCTB_WORKSPACE_PATH, ` +
            `or use an MCP host that advertises 'roots'.`
        );
        return { service: null, reason: 'no-workspace-config', workspaceConfigPath };
    }
    try {
        const kbService = new KnowledgeBaseService(resolvedConfig.workspacePath, defaultKbConfig(resolvedConfig));
        await kbService.loadAll();
        return { service: kbService, reason: 'loaded', workspaceConfigPath };
    } catch (err: any) {
        console.error(`KB load failed (non-fatal): ${err.message}`);
        return { service: null, reason: 'load-failed', workspaceConfigPath };
    }
}

/** Resolve the KB config for a workspace, falling back to the public defaults. */
function defaultKbConfig(resolvedConfig: MCPConfig): KBConfig {
    return resolvedConfig.knowledgeBase ?? {
        enabled: true,
        source: 'https://github.com/waldo1001/waldo.BCTelemetryBuddy/tree/main/knowledge-base',
        exclude: [],
        autoRefresh: true,
        cacheOnly: false,
    };
}

/**
 * Locate workspace knowledge via the MCP "roots" capability (S1).
 *
 * This is the host-agnostic fallback for clients (e.g. Claude Code) that
 * advertise their workspace roots but were launched with a global `--config`
 * (so the eager, config-dir-anchored load found nothing). It is intentionally
 * scoped to *knowledge only* — it never swaps the active connection/profile,
 * so a client-supplied root cannot silently retarget which Application Insights
 * resource is queried.
 *
 * Runs from the server's `oninitialized` hook (roots can only be requested
 * after the client connects). All failures are non-fatal. Telemetry is
 * path-free: only counts and booleans, never URIs or filesystem paths.
 */
export async function discoverWorkspaceViaRoots(
    server: McpServer,
    resolvedConfig: MCPConfig,
    toolHandlers: ToolHandlers
): Promise<KnowledgeBaseService | null> {
    // Eager load already won — nothing to do.
    if (toolHandlers.knowledgeBase) {
        return null;
    }

    const lowLevel: any = server.server;
    const caps = lowLevel?.getClientCapabilities?.();
    if (!caps?.roots) {
        trackRootsDiscovery(toolHandlers, { clientAdvertisedRoots: false, rootsCount: 0, matched: false, kbLoaded: false });
        return null;
    }

    let roots: Array<{ uri: string; name?: string }> = [];
    try {
        const res = await lowLevel.listRoots();
        roots = res?.roots ?? [];
    } catch (err: any) {
        console.error(`[KB] roots discovery failed (non-fatal): ${err?.message}`);
        trackRootsDiscovery(toolHandlers, { clientAdvertisedRoots: true, rootsCount: 0, matched: false, kbLoaded: false, connectionsFound: toolHandlers.workspaceProfiles?.size ?? 0 });
        return null;
    }

    // Pass 1 — collect selectable workspace CONNECTIONS from every root. This is
    // side-effect-free w.r.t. the active connection (registry only); the active
    // App Insights target is never changed here (cross-tenant safety). Auto-activate,
    // if opted in, happens separately in startSdkStdioServer.
    for (const root of roots) {
        if (!root?.uri || !root.uri.startsWith('file://')) {
            continue;
        }
        let rootPath: string;
        try {
            rootPath = fileURLToPath(root.uri);
        } catch {
            continue;
        }
        for (const cfgPath of scanDirForWorkspaceConfigs(rootPath)) {
            toolHandlers.registerWorkspaceConnection(cfgPath, rootPath, 'roots');
        }
    }

    // Pass 2 — locate workspace KNOWLEDGE (first matching root wins), unchanged.
    for (const root of roots) {
        if (!root?.uri || !root.uri.startsWith('file://')) {
            continue;
        }
        let rootPath: string;
        try {
            rootPath = fileURLToPath(root.uri);
        } catch {
            continue;
        }
        const cfgPath = path.join(rootPath, '.bctb-config.json');
        const kbDir = path.join(rootPath, '.vscode', '.bctb', 'knowledge');
        if (fs.existsSync(cfgPath) && fs.existsSync(kbDir)) {
            try {
                const svc = new KnowledgeBaseService(rootPath, defaultKbConfig(resolvedConfig));
                await svc.loadAll();
                toolHandlers.knowledgeBase = svc;
                toolHandlers.kbSkipReason = 'loaded-via-roots';
                console.error(`[KB] Knowledge Base loaded via MCP roots.`);
                trackRootsDiscovery(toolHandlers, { clientAdvertisedRoots: true, rootsCount: roots.length, matched: true, kbLoaded: true, connectionsFound: toolHandlers.workspaceProfiles?.size ?? 0 });
                return svc;
            } catch (err: any) {
                console.error(`[KB] roots KB load failed (non-fatal): ${err?.message}`);
                trackRootsDiscovery(toolHandlers, { clientAdvertisedRoots: true, rootsCount: roots.length, matched: true, kbLoaded: false, connectionsFound: toolHandlers.workspaceProfiles?.size ?? 0 });
                return null;
            }
        }
    }

    trackRootsDiscovery(toolHandlers, { clientAdvertisedRoots: true, rootsCount: roots.length, matched: false, kbLoaded: false, connectionsFound: toolHandlers.workspaceProfiles?.size ?? 0 });
    return null;
}

function trackRootsDiscovery(
    toolHandlers: ToolHandlers,
    props: { clientAdvertisedRoots: boolean; rootsCount: number; matched: boolean; kbLoaded: boolean; connectionsFound?: number }
): void {
    try {
        toolHandlers.services.usageTelemetry.trackEvent(
            'Mcp.RootsDiscovery',
            cleanTelemetryProperties(createCommonProperties(
                TELEMETRY_EVENTS.MCP.ROOTS_DISCOVERY, 'mcp',
                toolHandlers.services.sessionId, toolHandlers.services.installationId, VERSION,
                props
            ))
        );
    } catch {
        // Telemetry must never break discovery.
    }
}

/**
 * Convert a JSON Schema property definition to a Zod schema.
 * Handles the property types used in our tool definitions.
 */
function jsonSchemaToZod(prop: any): z.ZodTypeAny {
    switch (prop.type) {
        case 'string':
            if (prop.enum) {
                // zod enum requires at least one value 
                return z.enum(prop.enum as [string, ...string[]]).optional();
            }
            return z.string().optional();
        case 'number':
            return z.number().optional();
        case 'boolean':
            return z.boolean().optional();
        case 'array':
            if (prop.items?.type === 'string') {
                return z.array(z.string()).optional();
            }
            return z.array(z.unknown()).optional();
        case 'object':
            return z.record(z.string(), z.unknown()).optional();
        default:
            return z.unknown().optional();
    }
}

/**
 * Convert a required JSON Schema property to a non-optional Zod schema.
 */
function jsonSchemaToZodRequired(prop: any): z.ZodTypeAny {
    switch (prop.type) {
        case 'string':
            if (prop.enum) {
                return z.enum(prop.enum as [string, ...string[]]);
            }
            return z.string();
        case 'number':
            return z.number();
        case 'boolean':
            return z.boolean();
        case 'array':
            if (prop.items?.type === 'string') {
                return z.array(z.string());
            }
            return z.array(z.unknown());
        case 'object':
            return z.record(z.string(), z.unknown());
        default:
            return z.unknown();
    }
}

/**
 * Build a Zod raw shape from a tool definition's inputSchema.
 * The SDK's registerTool expects a Zod raw shape (Record<string, ZodType>).
 */
function buildZodShape(toolDef: typeof TOOL_DEFINITIONS[0]): Record<string, z.ZodTypeAny> {
    const shape: Record<string, z.ZodTypeAny> = {};
    const requiredFields = new Set(toolDef.inputSchema.required || []);

    for (const [key, prop] of Object.entries(toolDef.inputSchema.properties)) {
        if (requiredFields.has(key)) {
            shape[key] = jsonSchemaToZodRequired(prop);
        } else {
            shape[key] = jsonSchemaToZod(prop);
        }
    }

    return shape;
}

/**
 * Create and configure the SDK-based MCP server with all tools registered.
 * Returns the McpServer instance ready to be connected to a transport.
 */
export function createSdkServer(toolHandlers: ToolHandlers, exportService?: ExportService): McpServer {
    const server = new McpServer(
        {
            name: 'BC Telemetry Buddy',
            version: VERSION
        },
        {
            instructions: SERVER_INSTRUCTIONS,
            capabilities: {
                tools: {
                    listChanged: true
                },
                prompts: {
                    listChanged: true
                },
                resources: {},
                logging: {}
            }
        }
    );

    // Register the workflow guidance prompt — discoverable by any MCP client
    server.registerPrompt(
        'bc-telemetry-workflow',
        {
            description: 'Mandatory tool-call workflow for BC Telemetry Buddy. Invoke this FIRST to understand the correct sequence of tool calls for querying Business Central telemetry data. Explains which tools to call, in what order, and which patterns are forbidden.'
        },
        async () => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: WORKFLOW_PROMPT_CONTENT
                    }
                }
            ]
        })
    );

    // Register the connection-setup prompt — lets ANY MCP client (Claude Code, Cursor,
    // Copilot agent mode) walk the user through configuring .bctb-config.json. Works
    // even when the server is unconfigured (validateConfig is non-throwing).
    server.registerPrompt(
        'setup-connection',
        {
            description: 'Set up a connection to your Business Central telemetry. Walks through authentication, discovering your Application Insights endpoints, choosing the target workspace folder (multi-root aware), and writing .bctb-config.json. Invoke this when you have no connection configured yet, or want to add another.'
        },
        async () => ({
            messages: [
                {
                    role: 'user' as const,
                    content: {
                        type: 'text' as const,
                        text: SETUP_PROMPT_CONTENT
                    }
                }
            ]
        })
    );

    // Register resource template for exported telemetry data files
    if (exportService) {
        server.registerResource(
            'telemetry-export',
            new ResourceTemplate('bctb://exports/{filename}', {
                list: async () => {
                    const entries = exportService.listExports();
                    return {
                        resources: entries.map(entry => ({
                            uri: `bctb://exports/${entry.filename}`,
                            name: entry.filename,
                            mimeType: entry.mimeType
                        }))
                    };
                }
            }),
            {
                description: 'Exported telemetry query results. Use resultFormat: "resource" on query_telemetry to generate exports.'
            },
            async (uri: URL, variables: { filename?: string }) => {
                const filename = variables.filename;
                if (!filename) {
                    throw new Error('Filename is required');
                }
                const result = exportService.readExport(filename);
                if (!result) {
                    throw new Error(`Export file not found: ${filename}`);
                }
                return {
                    contents: [{
                        uri: uri.href,
                        mimeType: result.mimeType,
                        text: result.content
                    }]
                };
            }
        );
    }

    // Register all tools from the single source of truth
    for (const toolDef of TOOL_DEFINITIONS) {
        const zodShape = buildZodShape(toolDef);

        server.registerTool(
            toolDef.name,
            {
                description: toolDef.description,
                inputSchema: zodShape,
                annotations: toolDef.annotations ? {
                    readOnlyHint: toolDef.annotations.readOnlyHint,
                    destructiveHint: toolDef.annotations.destructiveHint,
                    idempotentHint: toolDef.annotations.idempotentHint,
                    openWorldHint: toolDef.annotations.openWorldHint
                } : undefined
            },
            async (params: any): Promise<CallToolResult> => {
                try {
                    const result = await toolHandlers.executeToolCall(toolDef.name, params);

                    // Handle embedded resource response (resultFormat: 'resource')
                    if (result?.asResource && result.filePath) {
                        const toolCallResult = result as ToolCallResult;
                        const fileContent = fs.readFileSync(toolCallResult.filePath!, 'utf-8');
                        return {
                            content: [
                                {
                                    type: 'text' as const,
                                    text: toolCallResult.summary || 'Results exported as file resource.'
                                },
                                {
                                    type: 'resource' as const,
                                    resource: {
                                        uri: toolCallResult.fileUri!,
                                        mimeType: toolCallResult.mimeType!,
                                        text: fileContent
                                    }
                                }
                            ]
                        };
                    }

                    // Default: inline text response (backward compatible)
                    return {
                        content: [
                            {
                                type: 'text',
                                text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
                            }
                        ]
                    };
                } catch (error: any) {
                    return {
                        content: [
                            {
                                type: 'text',
                                text: `Error: ${error.message}`
                            }
                        ],
                        isError: true
                    };
                }
            }
        );
    }

    return server;
}

/**
 * Start the MCP server in stdio mode using the official SDK.
 * This replaces the hand-rolled stdin/stdout JSON-RPC handler.
 */
export async function startSdkStdioServer(config?: MCPConfig): Promise<void> {
    // Redirect console output BEFORE anything else
    // This prevents any console.log from corrupting the JSON-RPC stream
    console.log = (...args: any[]) => {
        process.stderr.write('[MCP] ' + args.join(' ') + '\n');
    };
    console.error = (...args: any[]) => {
        process.stderr.write('[MCP] ' + args.join(' ') + '\n');
    };

    console.error(`BC Telemetry Buddy MCP Server v${VERSION} starting (stdio mode)...`);

    // Load configuration
    let resolvedConfig: MCPConfig;
    if (config) {
        resolvedConfig = config;
    } else {
        const fileConfig = loadConfigFromFile(undefined, undefined, true);
        if (fileConfig) {
            resolvedConfig = fileConfig;
        } else {
            resolvedConfig = loadConfig();
        }
    }

    const configErrors = validateConfig(resolvedConfig);

    // Initialize services
    const services = initializeServices(resolvedConfig, true);

    // Create tool handlers
    const toolHandlers = new ToolHandlers(resolvedConfig, services, true, configErrors);

    // Clean up expired exports on startup
    services.exports.cleanupExpired();

    const kbLoad = await maybeLoadKnowledgeBase(resolvedConfig);
    if (kbLoad.service) {
        toolHandlers.knowledgeBase = kbLoad.service;
    }
    toolHandlers.kbSkipReason = kbLoad.reason;

    // Create SDK server with all tools and resource template
    const server = createSdkServer(toolHandlers, services.exports);

    // Opt-in: auto-activate a single workspace connection discovered synchronously
    // via CLAUDE_PROJECT_DIR (default OFF; loud + only when exactly one is found).
    // Never fires silently — see docs/plans/mcp-workspace-connection-discovery.md.
    toolHandlers.maybeAutoActivateWorkspaceConnection();

    // If the eager (config-dir-anchored) load found no workspace knowledge, fall
    // back to MCP roots once the client connects. roots can only be requested
    // after initialize, so this runs from the oninitialized hook. It also collects
    // selectable workspace connections and (if opted in) auto-activates the single one.
    if (!kbLoad.service) {
        server.server.oninitialized = () => {
            void discoverWorkspaceViaRoots(server, resolvedConfig, toolHandlers)
                .then(() => { toolHandlers.maybeAutoActivateWorkspaceConnection(); });
        };
    }

    // Emit how the workspace was resolved (path-free) for field diagnostics.
    services.usageTelemetry.trackEvent(
        'Mcp.WorkspaceResolved',
        cleanTelemetryProperties(createCommonProperties(
            TELEMETRY_EVENTS.MCP.WORKSPACE_RESOLVED, 'mcp',
            services.sessionId, services.installationId, VERSION,
            {
                via: resolvedConfig.workspaceVia ?? (process.env.BCTB_WORKSPACE_PATH ? 'env' : 'cwd'),
                tokenStripped: resolvedConfig.workspaceTokenStripped ?? false,
                host: process.env.BCTB_WORKSPACE_PATH ? 'vscode' : 'other',
                kbSkipReason: kbLoad.reason,
            }
        ))
    );

    // Authenticate silently if config is valid
    if (configErrors.length === 0) {
        try {
            await services.auth.authenticate();
        } catch {
            // Errors will be returned through tool responses
        }
    }

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await server.connect(transport);

    // Graceful shutdown
    const shutdown = async () => {
        await services.usageTelemetry.flush();
        await server.close();
        process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
}
