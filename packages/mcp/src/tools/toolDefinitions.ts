/**
 * Single source of truth for all MCP tool definitions.
 * Used by both the SDK-based stdio server and the Express HTTP server.
 * 
 * Each tool definition includes name, description, inputSchema (JSON Schema),
 * and optional annotations for MCP 2025-06-18 protocol compliance.
 */

/**
 * Tool annotation hints for MCP 2025-06-18 protocol
 */
export interface ToolAnnotations {
    /** If true, the tool does not modify any external state */
    readOnlyHint?: boolean;
    /** If true, the tool may perform destructive updates */
    destructiveHint?: boolean;
    /** If true, calling the tool repeatedly with the same args has no additional effect */
    idempotentHint?: boolean;
    /** If true, the tool interacts with the real world (network, API calls) */
    openWorldHint?: boolean;
}

/**
 * A single MCP tool definition
 */
export interface ToolDefinition {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
    };
    annotations?: ToolAnnotations;
}

/**
 * All MCP tool definitions — the single source of truth.
 * Tool handlers in toolHandlers.ts reference these by name.
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
    {
        name: 'get_event_catalog',
        description: '🚨 STEP 1 — ALWAYS START HERE. Discover available Business Central telemetry event IDs with descriptions, frequencies, status, and Learn URLs. ALWAYS call this tool BEFORE attempting to write any KQL query. Without calling this first, you will not know which event IDs exist in the telemetry data. Returns top events by occurrence count with status categorization (success/error/too slow). NEXT STEP: after getting event IDs, call get_event_field_samples(eventId) for each event you plan to query — it reveals the full list of customDimensions fields (20+ per event that you cannot guess), their exact data types (especially TIMESPAN duration fields that silently break queries if treated as numbers), and real sample values. Understanding the fields and types first is the best practice before writing any KQL.',
        inputSchema: {
            type: 'object',
            properties: {
                daysBack: { type: 'number', description: 'Number of days to analyze (default: 10)', default: 10 },
                status: { type: 'string', enum: ['all', 'success', 'error', 'too slow', 'unknown'], description: 'Filter by event status', default: 'all' },
                minCount: { type: 'number', description: 'Minimum occurrence count to include', default: 1 },
                maxResults: { type: 'number', description: 'Maximum number of events to return (default: 50, max: 200)', default: 50 },
                includeCommonFields: { type: 'boolean', description: 'Include analysis of common customDimensions fields that appear across multiple events (default: false)', default: false }
            }
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    {
        name: 'get_event_field_samples',
        description: 'BEST PRACTICE: Call this BEFORE writing any KQL that touches customDimensions — understanding the available fields and their types first saves you from broken queries and wasted retries. Discover everything inside an event\'s customDimensions — you will not know what fields exist until you call this (events routinely have 20+ fields you cannot guess). Returns: every field name present in real data, the data type of each field (critical: duration fields like executionTime/totalTime/serverTime are TIMESPAN "hh:mm:ss.fffffff" NOT numbers — getting this wrong silently breaks queries and wastes tokens on retries), occurrence rates so you know which fields are always vs. occasionally populated, real sample values so you understand the actual content, and a ready-to-copy example query. Use this for exploration ("what can I investigate here?"), for type safety ("how do I cast/filter this field?"), and for awareness of all available fields before building any filter or projection on customDimensions. Do NOT substitute `take 1 | project customDimensions` — that workaround is explicitly forbidden. You MUST call this for every event ID you intend to query — never skip it, even if you think you already know the fields.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID to analyze (e.g., RT0005, LC0011) - must be obtained from get_event_catalog() first' },
                sampleCount: { type: 'number', description: 'Number of events to sample for analysis', default: 10 },
                daysBack: { type: 'number', description: 'How many days back to search for events', default: 30 }
            },
            required: ['eventId']
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    {
        name: 'get_event_schema',
        description: '⚠️ DISCOVERY TOOL: Get schema details (available customDimensions fields) for a specific event ID by sampling recent occurrences. Use this AFTER get_event_catalog() to understand field structure. Simpler/lighter alternative to get_event_field_samples() — use get_event_field_samples() instead if you need full detail including data types, occurrence rates, and sample values.',
        inputSchema: {
            type: 'object',
            properties: {
                eventId: { type: 'string', description: 'Event ID to analyze (e.g., AL0000E26) - must be obtained from get_event_catalog() first' },
                sampleSize: { type: 'number', description: 'Number of events to sample', default: 100 }
            },
            required: ['eventId']
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    {
        name: 'get_tenant_mapping',
        description: '⚠️ IMPORTANT: Business Central telemetry uses aadTenantId (NOT company names) for filtering. Call this tool FIRST when user asks about a specific customer/company to map friendly names to tenant IDs. Returns company name → aadTenantId mappings from recent telemetry data.',
        inputSchema: {
            type: 'object',
            properties: {
                daysBack: { type: 'number', description: 'Number of days to look back for mappings (default: 10)', default: 10 },
                companyNameFilter: { type: 'string', description: 'Optional: Filter for specific company name (partial match)' }
            }
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    {
        name: 'query_telemetry',
        description: 'Execute a KQL query against Business Central telemetry data. This tool will produce INCORRECT results if you skip the prerequisite steps. MANDATORY PREREQUISITES (in order): (1) call get_event_catalog() to discover event IDs — without this you will not know which events exist, (2) call get_event_field_samples(eventId) for EVERY event ID you will filter or project on — this gives you all 20+ available fields, their exact data types, and sample values so you can form correct KQL the first time, (3) if filtering by customer, call get_tenant_mapping() to get tenant IDs. Skipping step 2 is the #1 cause of broken queries because field types (especially TIMESPAN duration fields like executionTime/totalTime/serverTime which use "hh:mm:ss.fffffff" format, NOT numbers) cannot be guessed correctly. UNNECESSARY: (a) Do not use "take 1 | project customDimensions" — get_event_field_samples already does this with richer results, (b) Never guess field names — call get_event_field_samples first, (c) Never treat duration fields as numbers — they are TIMESPAN, (d) Never filter by companyName — use aadTenantId from get_tenant_mapping.',
        inputSchema: {
            type: 'object',
            properties: {
                kql: { type: 'string', description: 'KQL query string - MUST use event IDs from get_event_catalog() and field names from get_event_field_samples(). Do not guess.' },
                useContext: { type: 'boolean', description: 'Use saved queries as examples', default: true },
                includeExternal: { type: 'boolean', description: 'Include external reference queries', default: true }
            },
            required: ['kql']
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: true
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
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
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
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
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
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: false,
            openWorldHint: false
        }
    },
    {
        name: 'get_categories',
        description: 'List all query categories (folders)',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
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
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    },
    {
        name: 'get_external_queries',
        description: 'Get KQL examples from external references (GitHub, blogs)',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: true
        }
    },
    {
        name: 'list_profiles',
        description: 'List all available telemetry profiles in the workspace configuration. Shows the currently active profile and all other available profiles. Each profile represents a different customer/environment with separate credentials and App Insights configuration. Use this to understand which profiles are available before querying data.',
        inputSchema: {
            type: 'object',
            properties: {}
        },
        annotations: {
            readOnlyHint: true,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    },
    {
        name: 'switch_profile',
        description: 'Switch to a different telemetry profile. This reloads the configuration with the new profile\'s credentials and App Insights settings. All subsequent queries will use the new profile. Use list_profiles first to see available profiles.',
        inputSchema: {
            type: 'object',
            properties: {
                profileName: { type: 'string', description: 'Name of the profile to switch to (from list_profiles)' }
            },
            required: ['profileName']
        },
        annotations: {
            readOnlyHint: false,
            destructiveHint: false,
            idempotentHint: true,
            openWorldHint: false
        }
    }
];

/**
 * Get a tool definition by name
 */
export function getToolDefinition(name: string): ToolDefinition | undefined {
    return TOOL_DEFINITIONS.find(t => t.name === name);
}

/**
 * Get all tool names
 */
export function getToolNames(): string[] {
    return TOOL_DEFINITIONS.map(t => t.name);
}
