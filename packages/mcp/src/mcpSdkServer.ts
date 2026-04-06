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
import * as fs from 'fs';
import { loadConfig, loadConfigFromFile, validateConfig, MCPConfig } from './config.js';
import { TOOL_DEFINITIONS } from './tools/toolDefinitions.js';
import { SERVER_INSTRUCTIONS, WORKFLOW_PROMPT_CONTENT } from './tools/serverInstructions.js';
import { ToolHandlers, ToolCallResult, initializeServices } from './tools/toolHandlers.js';
import { ExportService } from '@bctb/shared';
import { VERSION } from './version.js';
import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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

    // Create SDK server with all tools and resource template
    const server = createSdkServer(toolHandlers, services.exports);

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
