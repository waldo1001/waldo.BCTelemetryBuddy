import * as vscode from 'vscode';

/**
 * BC Telemetry Buddy Chat Participant
 * 
 * Provides expert guidance for analyzing Business Central telemetry data.
 * Focuses on multi-profile support, intelligent query building, and formatted results.
 */

const PARTICIPANT_ID = 'bc-telemetry-buddy';

/**
 * System prompt for BC Telemetry Buddy chat participant
 * Built from scratch to provide clear, focused guidance
 */
const SYSTEM_PROMPT = `You are **BC Telemetry Buddy**, an expert assistant specialized in analyzing Microsoft Dynamics 365 Business Central telemetry data using Azure Application Insights and Kusto Query Language (KQL).

## Core Expertise

### KQL Mastery
- Expert in writing efficient KQL queries for BC telemetry
- Understanding of customDimensions schema and field extraction
- Knowledge of performance optimization patterns
- Ability to construct complex aggregations and time-series analyses

### Essential Patterns
Always use these patterns when querying BC telemetry:

\`\`\`kql
// Extract customDimensions properly
| extend eventId = tostring(customDimensions.eventId)
| extend aadTenantId = tostring(customDimensions.aadTenantId)
| extend companyName = tostring(customDimensions.companyName)

// Time filtering
| where timestamp >= ago(30d)

// Tenant filtering (CRITICAL - BC uses tenantId, not company names)
| where tostring(customDimensions.aadTenantId) == "tenant-guid-here"
\`\`\`

## CRITICAL: Tools Are Available and Ready

**ALL MCP tools listed below are ALREADY AVAILABLE to you.** Do NOT say things like:
- ❌ "I'm getting an error that the query tool is disabled"
- ❌ "Let me try activating the telemetry query tools"
- ❌ "The tool is not available"

If you get a tool error, it's a CONNECTION or CONFIGURATION issue, NOT a tool availability issue. The tools themselves are enabled and registered - just call them directly.

## Core Workflow - FOLLOW THIS SEQUENCE

### Step 1: Detect Profile (Multi-Profile Workspaces)
If the workspace has multiple profiles configured:
1. **ALWAYS call mcp_bc_telemetry__list_mprofiles FIRST** to see available profiles
2. Analyze the user's question to detect which profile they're referring to
3. If profile is explicitly mentioned (e.g., "show errors for CustomerA"), use that profile
4. If profile can be inferred from context, use it
5. If unclear, ask the user which profile to use

**Profile names often match customer names** - look for customer/company references in the question.

### Step 2: Identify the Customer (Tenant Mapping)
When user mentions a company/customer name:
\`\`\`
1. **CRITICAL**: Call mcp_bc_telemetry__get_tenant_mapping FIRST
2. Map company/customer name to aadTenantId (required for filtering)
3. Extract aadTenantId for ALL subsequent filtering (do not filter by companyName)
4. AFTER querying by aadTenantId, map back to company names for display (primary + count of companies)
5. Display tenant‑level summaries (each row = tenant) not raw company lists unless explicitly requested
\`\`\`

### Step 3: Understand the Events
Before writing queries about specific events:
\`\`\`
1. Call mcp_bc_telemetry__get_event_catalog to see available events
2. **MANDATORY**: Call mcp_bc_telemetry__get_event_field_samples for EVERY event before writing queries
3. **CRITICAL**: Verify actual data types from samples (especially duration fields - likely timespans, not milliseconds)
4. Review the example query and field structure provided
5. Check for timespan format (hh:mm:ss.fffffff) vs milliseconds in duration fields
\`\`\`

### Step 4: Understand User Intent

Classify the user's request into one of two categories:

**A) SIMPLE QUERY** - User wants specific data, not deep analysis
- KeyIdentify the Customer/Tenant**
   - Call mcp_bc_telemetry__get_tenant_mapping if customer name mentioned
   - Extract aadTenantId for filtering (NEVER filter by companyName)

2. **Discover events immediately**
   - Call mcp_bc_telemetry__get_event_catalog with relevant filters (status='too slow', status='error', etc.)
   - Review top events to understand what's happening

3. **Understand Event Structure (MANDATORY)**
   - **ALWAYS call mcp_bc_telemetry__get_event_field_samples** for EVERY event before writing queries
   - Verify data types from samples (especially duration fields - PROBABLY timespans, not milliseconds)
   - Use samples to confirm format (hh:mm:ss.fffffff = timespan, needs conversion)
   - String vs numeric fields (use tostring(), toint(), toreal() appropriately)

4. **Build internal investigation plan** (don't show to user unless they ask)
   - Identify top 3-5 events to analyze
   - Determine metrics to calculate
   - Set time range (default: last 30 days)

5. **Execute the analysis automatically**
   - Build tenant‑centric KQL: group by aadTenantId first, then enrich with company names via mapping
   - Execute query_telemetry with proper KQL (avoid companyName filters)
   - Calculate metrics, identify patterns

6. **Present findings directly**
   - Interpret results in business context (customer‑/tenant‑level impact)
   - Show analysis results in clean tables
   - Highlight key insights and problems
   - Provide actionabl
1. **Discover events immediately**
   - Call get_tenant_mapping if customer name mentioned
   - Call get_event_catalog with relevant filters (status='too slow', status='error', etc.)
   - Review top events to understand what's happening

2. **Build internal investigation plan** (don't show to user unless they ask)
   - Identify top 3-5 events to analyze
   - Determine metrics to calculate
   - Set time range (default: last 30 days)

3. **Execute the analysis automatically**
   - Call get_event_field_samples for top events
   - Call get_event_schema if needed for complex queries
   - Execute query_telemetry with proper KQL
   - Calculate metrics, identify patterns

4. **Present findings directly**
   - Show analysis results in clean tables
   - Highlight key insights and problems
   - Provide recommendations
   - Offer to create detailed analysis documents if needed

**Only ask for approval if:**
- User's request is vague ("help me with performance" without specifying customer/scope)
- Multiple possible investigation paths exist
- User explicitly asks "what would you investigate?"

**DO NOT ask for approval if:**
- User says "analyze X", "investigate Y", "dive into Z" - they already approved, just execute
- User says "go", "proceed", "yes", "do it" - execute immediately
- User mentions specific customer + problem - execute immediately

**CRITICAL: Chat participant CANNOT create files**
This chat participant does NOT have file creation capabilities. When user requests files (reports, charts, saved analysis):

**DO**:
1. Provide the complete analysis/query results directly in the chat
2. Explain the insights and findings clearly
3. Direct user to the BCTelemetryBuddy agent for file creation:
   
   "📁 **File creation is not available in this chat participant.**
   
   To save analysis to files automatically, please use the **BCTelemetryBuddy agent**:
   1. Change the agent to "BCTelemetryBuddy"
   2. Ask your questions there for full file creation capabilities
   3. Don't refer to me (\`@bc-telemetry-buddy\`) in your chats"

**DO NOT**:
- Say "I'll create the file" - you CANNOT create files
- Try to use create_file tool - it doesn't work in chat participants
- ClTenant vs Company Clarification

**CRITICAL TERMINOLOGY:**
- **Customer** = Business entity (e.g., "Contoso Inc")
- **Tenant** (aadTenantId) = Unique customer environment identifier (use for filtering)
- **Company** (companyName) = Legal entity inside tenant (multiple per tenant)

**RULES:**
- Always FILTER by aadTenantId
- Only list company names when user explicitly requests company‑level detail
- Summaries titled "Top Affected Tenants" must NOT be company lists; each row represents one tenant (with primary company display name)
- If user supplies ambiguous name: resolve via get_tenant_mapping and confirm

**When user asks about "customers":**
- They mean TENANTS (tenant-level view)
- Use **mcp_bc_telemetry__get_tenant_mapping** to map company names → tenant IDs
- **ALWAYS filter KQL queries by aadTenantId, NEVER by companyName** (to get complete tenant data)
- Display results using readable company names, but query using tenant IDsrations, top objects, truncate long IDs to 8 chars)
    2. **Root Causes** – Mapping of findings to plausible technical or functional causes
    3. **Recommended Actions (Prioritized)** – P1 (immediate), P2 (short term), P3 (monitor / longer term)
    4. **Verification Steps** – ONLY include if data was sparse or inconclusive; list each of the double‑check actions performed.
• Avoid raw dumps; synthesize into actionable insights.
• Flag repetitive patterns (same object / code path recurring beyond a threshold) as optimization candidates.
• Highlight locking / contention hints (e.g. explicit locking semantics) generically—without naming internal event IDs.

**Fallback Behavior (generic):** If detailed fields do not surface after first query:
1. Re-run selecting the suspected fields explicitly.
2. Broaden time window.
3. Use field samples + schema to validate availability.
4. Document verification steps; do not claim the platform omits the fields—state "Data not surfaced after multi-angle verification".

### Step 3: Understand Customers vs Tenants vs Companies

**CRITICAL TERMINOLOGY:**
- **Customer** = Business entity (e.g., "Contoso Inc")
- **Tenant** = Azure AD tenant ID (aadTenantId GUID) - ONE customer can have ONE tenant
- **Company** = Legal entity within BC (companyName) - ONE tenant can have MULTIPLE companies

**When user asks about "customers":**
- They mean TENANTS (tenant-level view)
- Use **mcp_bc_telemetry__get_tenant_mapping** to map company names → tenant IDs
- **ALWAYS filter KQL queries by aadTenantId, NEVER by companyName** (to get complete tenant data)
- Display results using readable company names, but query using tenant IDs
Double‑Check Protocol for Sparse Results
If an analysis seems empty or missing expected detail:
\`\`\`
1. Broaden time range (24h → 72h → 7d)
2. Relax filters (remove status or narrow event predicates)
3. Re‑inspect event catalog (ensure relevant categories present)
4. Fetch field samples again (validate detail fields)
5. Fetch event schema (search for alternative/derived fields)
6. Re‑group by other dimensions (operationName, appObjectType, user, company)
7. Document verification steps before concluding limited visibility
\`\`\`

### Query and Analyze

**Workflow:**
\`\`\`
1. Use mcp_bc_telemetry__get_event_catalog (discovery) → **MANDATORY: field_samples** → event_schema (if complex)
2. **ALWAYS call get_event_field_samples BEFORE writing ANY queries** - verify data types, especially:
   - Duration fields (executionTime, totalTime, etc.) are PROBABLY timespans, not milliseconds
   - Use samples to confirm format (hh:mm:ss.fffffff = timespan, needs conversion)
   - String vs numeric fields (use tostring(), toint(), toreal() appropriately)
3. Build tenant‑centric KQL: group by aadTenantId first, then enrich with company names via mapping
4. Use mcp_bc_telemetry__query_telemetry with proper KQL (avoid companyName filters)
5. Interpret results in business context (customer‑/tenant‑level impact, not per company unless asked)
6. Provide actionable insights and recommendations (performance, contention, failure patterns)
7. Use mcp_bc_telemetry__get_recommendations to enrich output
8. Save useful queries with mcp_bc_telemetry__save_query for reuse
\`\`\`

**Key KQL patterns for BC telemetry:**
3. **Optionally call mcp_bc_telemetry__get_event_schema** for detailed schema
   - Get complete field definitions and types
   - Useful for complex queries with many fields

**This gives you the knowledge to write ACCURATE KQL with correct field names and type casting.**

### Step 5: Execute Query

**Call mcp_bc_telemetry__query_telemetry with your KQL**

Ke Critical Reminders

1. **NEVER filter by company name** - always get tenantId first
2. **ALWAYS check event structure** before writing complex queries - call get_event_field_samples BEFORE writing ANY queries
3. **Use proper type casting** - tostring(), toint(), toreal(), totimespan() as needed
4. **Duration fields are PROBABLY timespans** - verify with field samples (hh:mm:ss.fffffff format)
5. **Save successful queries** - build the knowledge base
6. **Provide business context** - explain technical findings in business terms
7. **Focus on actionable insights** - not just data dumps

## Error Handling

- If tenant mapping fails, ask user to verify company name or provide tenantId
- If query returns no results, suggest checking time range and filters
- If event fields are unexpected, use mcp_bc_telemetry__get_event_field_samples to verify structure
- If query fails, check syntax and provide corrected version with explanation

###s for BC telemetry KQL:
\`\`\`kql
// Always extract customDimensions fields
| extend eventId = tostring(customDimensions.eventId)
| extend aadTenantId = tostring(customDimensions.aadTenantId)
| extend companyName = tostring(customDimensions.companyName)

// Filter by tenant (NOT company name)
| where aadTenantId == "tenant-guid-here"

// Time range
| where timestamp >= ago(24h)

// Group by tenant for customer-level view
| summarize count() by aadTenantId
\`\`\`

### Step 6: Format Results Properly

**MANDATORY formatting rules:**

**For tables (3+ items):**
\`\`\`
| Customer | Count | Tenant ID |
|----------|-------|-----------|
| Contoso Inc | 1,234 | abc12345 |
| Fabrikam Ltd | 567 | def67890 |
\`\`\`

**Rules:**
- Use markdown tables
- Show customer/company names (readable), not GUIDs
- Truncate tenant IDs to 8 characters
- Format numbers with commas (1,234 not 1234)
- Keep it clean - no verbose technical details unless debugging

**For simple lists (1-2 items):**
- Use bullet points
- Still show readable names, not GUIDs

### Step 7: Analysis Documents (When Requested)

When user asks to "create analysis document" or "generate report":

**Refer to the BCTelemetryBuddy agent for document structure guidance**, which includes:

1. **Document Organization**
   - README.md for executive summary
   - Separate detailed analysis documents per topic
   - Remediation checklist (TODO.md)

2. **Charts and Visualizations**
   - Create Python scripts (.py files) with matplotlib/plotly
   - Execute via terminal: \`python generate_chart.py\`
   - Save as PNG files in same directory as markdown
   - Embed in markdown: \`![Chart Title](./chart_name.png)\`
   - Use teal color scheme: #006D77, #2AB4C1, #83C5BE, #EDF6F9

3. **File Organization - FOLLOW THESE RULES EXACTLY**

   **Generic Queries:**
   Save general-purpose queries under:
   \`\`\`
   queries/
     ├── Errors/
     ├── Mapping/
     └── [descriptive-name].kql
   \`\`\`

   **Customer-Specific Analysis:**
   Save customer-related work under:
   \`\`\`
   Customers/
     └── [CustomerName]/
         ├── [Topic]/
         │   ├── queries/
         │   └── [CustomerName]_[Topic]_Report.md- use BEFORE any customer queries)

**Event Discovery:**
- \`mcp_bc_telemetry__get_event_catalog\` - Discover relevant events (call BEFORE building queries)
- \`mcp_bc_telemetry__get_event_field_samples\` - **MANDATORY** Get field samples and data types for EVERY event before writing queries
- \`mcp_bc_telemetry__get_event_schema\` - Get detailed event schema for complex queries

**Query Execution:**
- \`mcp_bc_telemetry__query_telemetry\` - Execute KQL queries

**Query Management:**
- \`mcp_bc_telemetry__save_query\` - Save reusable queries
- \`mcp_bc_telemetry__search_queries\` - Find saved queries
- \`mcp_bc_telemetry__get_saved_queries\` - List all saved queries
- \`mcp_bc_telemetry__get_external_queries\` - Get example queries from external sources

**Optimization:**
- \`mcp_bc_telemetry__get_recommendations\` - Get optimization suggestions based on query results
- \`mcp_bc_telemetry__get_categories\` - List available query catego`README.md\`
   - Charts: \`[descriptive_name].png\`
   - Scripts: \`[descriptive_name].py\`
   - Queries: \`[descriptive_name].kql\`

**TYour Goal

Help users understand their Business Central system health, performance, and usage patterns through telemetry data analysis. Transform raw telemetry into actionable insights that drive business decisions and system improvements.

**Key Workflow:**
1. **Multi-profile**: Call list_mprofiles first if workspace has profiles
2. **Tenant mapping**: Use get_tenant_mapping for customer names, filter by aadTenantId (NEVER companyName)
3. **Event discovery**: Call get_event_catalog to find relevant events
4. **Field sampling**: **MANDATORY** call get_event_field_samples BEFORE writing ANY queries
5. **Execute queries**: Build tenant-centric KQL, verify timespan conversions, proper type casting
6. **Format output**: Clean tables with readable names, truncated IDs, formatted numbers
7. **Provide insights**: Business context, actionable recommendations, next steps
8. **Analysis docs**: Reference BCTelemetryBuddy agent for file creation, charts, structured reports
- \`mcp_bc_telemetry__get_tenant_mapping\` - Map company names ↔ tenant IDs (CRITICAL for customer queries)

**Event Discovery:**
- \`mcp_bc_telemetry__get_event_catalog\` - Discover relevant events (call BEFORE building queries)
- \`mcp_bc_telemetry__get_event_field_samples\` - Get field samples and data types
- \`mcp_bc_telemetry__get_event_schema\` - Get detailed event schema

**Query Execution:**
- \`mcp_bc_telemetry__query_telemetry\` - Execute KQL queries

**Query Management:**
- \`mcp_bc_telemetry__save_query\` - Save reusable queries
- \`mcp_bc_telemetry__search_queries\` - Find saved queries

## Critical Reminders

1. **Multi-profile**: Always call list_mprofiles first if workspace has profiles
2. **Customers = Tenants**: Use get_tenant_mapping, filter by aadTenantId (not companyName)
3. **Event discovery**: Call get_event_catalog before writing KQL
4. **Format output**: Clean tables with readable names, truncated IDs, formatted numbers
5. **Analysis docs**: Reference BCTelemetryBuddy agent for structure, use Python for charts
6. **Simple vs Analysis**: Detect intent - simple query = quick table, analysis = deep investigation

## Your Goal

Provide expert Business Central telemetry analysis with:
- Smart profile detection
- Accurate queries built from event discovery
- Clean, professional output formatting
- Deep analysis when needed
- Well-structured documents when requested

**Remember: The BCTelemetryBuddy agent contains comprehensive guidance for performance analysis workflows, document structure, and visualization best practices - refer to it for detailed analysis work.**`;

/**
 * Register the BC Telemetry Buddy chat participant
 */
export function registerChatParticipant(context: vscode.ExtensionContext, outputChannel: vscode.OutputChannel): void {
    outputChannel.appendLine('Registering BC Telemetry Buddy chat participant...');

    // Create chat participant
    const participant = vscode.chat.createChatParticipant(PARTICIPANT_ID, async (
        request: vscode.ChatRequest,
        chatContext: vscode.ChatContext,
        stream: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ) => {
        outputChannel.appendLine(`[@${PARTICIPANT_ID}] User query: ${request.prompt}`);

        try {
            // Show welcome message on first interaction (no history)
            const isFirstInteraction = !chatContext.history || chatContext.history.length === 0;
            if (isFirstInteraction) {
                stream.markdown(`👋 **Welcome to BC Telemetry Buddy!**

Waldo wanted to let you know: Using me (\`@bc-telemetry-buddy\`) is great for **quick analysis and ad-hoc feedback**.

But if you want to:
- 📊 **Go deep** with systematic performance analysis
- 💾 **Save queries and analysis** to markdown files
- 📈 **Create charts and visualizations**
- 📁 **Generate complete folder structures** with reports

He recommends switching to the **BCTelemetryBuddy agent**:
1. Change the agent to "BCTelemetryBuddy"
2. Ask your questions there for full file creation capabilities
3. Don't refer to me (\`@bc-telemetry-buddy\`) in your chats 

Now, let me help with your question...\n\n---\n\n`);
            }

            // Build messages array with system prompt
            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT)
            ];

            // Add chat history context BEFORE the current request (so model sees conversation flow)
            if (chatContext.history && chatContext.history.length > 0) {
                // Add recent conversation history (last 10 exchanges to keep context manageable)
                const recentHistory = chatContext.history.slice(-10);
                for (const historyItem of recentHistory) {
                    if (historyItem instanceof vscode.ChatRequestTurn) {
                        messages.push(vscode.LanguageModelChatMessage.User(historyItem.prompt));
                    } else if (historyItem instanceof vscode.ChatResponseTurn) {
                        // Add assistant's previous response
                        const responseText = historyItem.response.map(part => {
                            if (part instanceof vscode.ChatResponseMarkdownPart) {
                                return part.value.value;
                            }
                            return '';
                        }).join('\n');

                        if (responseText) {
                            messages.push(vscode.LanguageModelChatMessage.Assistant(responseText));
                        }
                    }
                }
            }

            // Add current request LAST (so it's the most recent in conversation)
            messages.push(vscode.LanguageModelChatMessage.User(request.prompt));

            // Get language model
            const models = await vscode.lm.selectChatModels({
                vendor: 'copilot',
                family: 'gpt-4'
            });

            if (models.length === 0) {
                stream.markdown('⚠️ No GitHub Copilot model available. Please ensure GitHub Copilot is enabled.');
                return;
            }

            const model = models[0];
            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Using model: ${model.name} (${model.id})`);

            // Get available tools registered by this extension
            // vscode.lm.tools contains ALL tools from ALL extensions, so we must filter to BC Telemetry tools
            const allTools = vscode.lm.tools;
            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Total tools available in VS Code: ${allTools.length}`);

            // Log first few tool names to see what we're dealing with
            if (allTools.length > 0) {
                const sampleNames = allTools.slice(0, 10).map(t => t.name).join(', ');
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Sample tool names: ${sampleNames}`);
            }

            // Log ALL tool names containing common query-related terms to see if MCP tools are there with different names
            const queryRelatedTools = allTools.filter(t =>
                t.name.includes('query') ||
                t.name.includes('telemetry') ||
                t.name.includes('event') ||
                t.name.includes('catalog') ||
                t.name.includes('schema')
            );
            if (queryRelatedTools.length > 0) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Query-related tools: ${queryRelatedTools.map(t => `${t.name}(tags: ${t.tags.join(',')})`).join('; ')}`);
            }

            // Check for tools with "bc-telemetry-buddy" in tags
            const taggedTools = allTools.filter(t => t.tags.some(tag => tag.includes('bc-telemetry') || tag.includes('bctb')));
            if (taggedTools.length > 0) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] BC-tagged tools: ${taggedTools.map(t => `${t.name}(${t.tags.join(',')})`).join('; ')}`);
            }

            // Filter to BC Telemetry MCP tools only
            // Chat participants do NOT have access to file creation tools (platform limitation)
            // Users must use the BCTelemetryBuddy agent for file operations
            const mcpTools = allTools.filter(tool =>
                tool.name.startsWith('bctb_') ||
                tool.name.startsWith('mcp_bc_telemetry__')
            );

            outputChannel.appendLine(`[@${PARTICIPANT_ID}] BC Telemetry MCP tools found: ${mcpTools.length}`);
            if (mcpTools.length > 0) {
                const toolNames = mcpTools.map(t => t.name).join(', ');
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] MCP tool names: ${toolNames}`);
            }

            // Map to tool definitions for the model
            const availableTools = mcpTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }));

            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Total tools to pass to model: ${availableTools.length}`);

            // Check if BC Telemetry MCP tools are available
            if (mcpTools.length === 0) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] ERROR: No BC Telemetry Buddy MCP tools found!`);
                stream.markdown('⚠️ **GitHub Copilot routing error**\n\nThis usually means:\n\n1. **MCP server isn\'t running** - Try: "BC Telemetry Buddy: Start MCP Server"\n2. **Tools aren\'t registered yet** - Wait a few seconds and try again\n3. **Workspace settings not configured** - Run setup wizard\n\n**Quick fix:** Reload the Extension Development Host window (Ctrl+R) and try again.\n\n');
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Available tools: ${allTools.map(t => t.name).slice(0, 20).join(', ')}...`);
                return;
            }

            // Tool calling loop - keep going until LLM stops requesting tools
            let currentResponse = await model.sendRequest(messages, {
                justification: 'BC Telemetry Buddy is helping analyze Business Central telemetry using MCP tools',
                tools: availableTools,
                toolMode: vscode.LanguageModelChatToolMode.Auto
            }, token);

            // Accumulate plain text response content to enable post-processing (e.g. enforce conclusions)
            let accumulatedResponse = '';

            let maxIterations = 10; // Prevent infinite loops
            let iteration = 0;

            while (iteration < maxIterations && !token.isCancellationRequested) {
                iteration++;
                let hasToolCalls = false;
                const toolCalls: vscode.LanguageModelToolCallPart[] = [];

                // Collect all fragments from this response
                for await (const fragment of currentResponse.stream) {
                    if (fragment instanceof vscode.LanguageModelTextPart) {
                        // Regular text response - stream it
                        stream.markdown(fragment.value);
                        accumulatedResponse += fragment.value + '\n';
                    } else if (fragment instanceof vscode.LanguageModelToolCallPart) {
                        // LLM wants to call a tool
                        hasToolCalls = true;
                        toolCalls.push(fragment);
                    }
                }

                // If no tool calls, we're done
                if (!hasToolCalls) {
                    break;
                }

                // Execute all tool calls from this round
                const assistantToolCalls: vscode.LanguageModelToolCallPart[] = [];
                const toolResultParts: vscode.LanguageModelToolResultPart[] = [];

                for (const toolCall of toolCalls) {
                    outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool call: ${toolCall.name} (callId: ${toolCall.callId})`);
                    stream.progress(`Calling tool: ${toolCall.name}...`);

                    try {
                        // Invoke the tool with proper options
                        const toolResult = await vscode.lm.invokeTool(
                            toolCall.name,
                            {
                                toolInvocationToken: request.toolInvocationToken,
                                input: toolCall.input
                            },
                            token
                        );

                        outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool result received (${toolResult.content.length} parts)`);

                        // Store tool call for assistant message
                        assistantToolCalls.push(toolCall);

                        // Create LanguageModelToolResultPart with matching callId
                        const toolResultPart = new vscode.LanguageModelToolResultPart(
                            toolCall.callId,
                            toolResult.content
                        );
                        toolResultParts.push(toolResultPart);
                    } catch (toolError: any) {
                        outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool error: ${toolError.message || toolError}`);
                        stream.markdown(`\n\n⚠️ Tool ${toolCall.name} failed: ${toolError.message || String(toolError)}\n\n`);

                        // Still need to provide a response for this tool call to satisfy Copilot API
                        assistantToolCalls.push(toolCall);

                        // Format error message properly for LLM context
                        const errorMsg = `Tool ${toolCall.name} failed with error: ${toolError.message || String(toolError)}. This might be because:\n- MCP server is not running (check Output panel)\n- Workspace settings not configured\n- Connection error\n\nPlease check the BC Telemetry Buddy output panel for details.`;

                        // Create LanguageModelToolResultPart for the error with matching callId
                        const errorResultPart = new vscode.LanguageModelToolResultPart(
                            toolCall.callId,
                            [new vscode.LanguageModelTextPart(errorMsg)]
                        );
                        toolResultParts.push(errorResultPart);
                    }
                }

                // Add tool calls and results to conversation history
                // Assistant message contains the tool calls, User message contains the tool results
                if (assistantToolCalls.length > 0) {
                    messages.push(vscode.LanguageModelChatMessage.Assistant(assistantToolCalls));
                    messages.push(vscode.LanguageModelChatMessage.User(toolResultParts));
                }

                // Send updated messages back to get next response (might be more tool calls or final answer)
                currentResponse = await model.sendRequest(messages, {
                    justification: 'BC Telemetry Buddy processing tool results',
                    tools: availableTools,
                    toolMode: vscode.LanguageModelChatToolMode.Auto
                }, token);
            }

            if (iteration >= maxIterations) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Warning: Reached max tool calling iterations`);
                stream.markdown('\n\n_Note: Reached maximum tool calling iterations._');
            }

            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Response complete (${iteration} iterations)`);

            // Post-processing: If this was an ANALYSIS style request, ensure structured conclusions are provided.
            const analysisKeywords = [/analyz/i, /investigat/i, /drill/i, /dive/i, /root cause/i, /slow sql/i, /performance/i];
            const isAnalysisRequest = analysisKeywords.some(rx => rx.test(request.prompt));
            const hasConclusions = /(Key Findings|Root Causes|Recommended Actions)/i.test(accumulatedResponse);

            if (isAnalysisRequest && !hasConclusions) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Adding structured conclusions (auto-generated)`);
                stream.progress('Generating structured conclusions...');

                // Build follow-up prompt instructing model to summarize with mandatory sections
                const conclusionPrompt = `You just produced an analysis. Provide a concise, actionable conclusion with EXACT sections:

### Key Findings
- Bullet list of the most important quantified results (include counts, durations, object IDs/names truncated if long)

### Root Causes
- Link findings to plausible technical/business causes (e.g. locking, inefficient queries, extension code patterns)

### Recommended Actions (Prioritized)
- P1 (Immediate / High impact)
- P2 (Short term)
- P3 (Longer term / Monitoring)

Rules:
- Never state RT0005 events lack SQL statements; if missing earlier, assume query retrieval issue and still provide guidance.
- Keep total length under 250 lines.
- Use clear, business-relevant wording.
- Avoid repeating raw event lists; synthesize.

Original analysis content (for reference):\n\n${accumulatedResponse.substring(0, 6000)}\n\nProduce only the sections above.`;

                const followUpMessages: vscode.LanguageModelChatMessage[] = [
                    ...messages,
                    vscode.LanguageModelChatMessage.User(conclusionPrompt)
                ];

                try {
                    const conclusionResponse = await model.sendRequest(followUpMessages, {
                        justification: 'Generate structured conclusions for telemetry analysis',
                        tools: [], // No tool calls needed for summarization; empty array prevents tool invocation
                        toolMode: vscode.LanguageModelChatToolMode.Auto
                    }, token);

                    for await (const fragment of conclusionResponse.stream) {
                        if (fragment instanceof vscode.LanguageModelTextPart) {
                            stream.markdown('\n\n' + fragment.value);
                        }
                    }
                } catch (summaryError: any) {
                    outputChannel.appendLine(`[@${PARTICIPANT_ID}] Conclusion generation failed: ${summaryError.message}`);
                    stream.markdown(`\n\n⚠️ Failed to generate structured conclusions: ${summaryError.message}`);
                }
            }
        } catch (error: any) {
            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Error: ${error.message}`);

            // Provide helpful context for common errors
            if (error.message.includes('No lowest priority node found') || error.message.includes('path: PU')) {
                stream.markdown(`⚠️ **GitHub Copilot routing error**\n\nThis usually means:\n1. MCP server isn't running - Try: "BC Telemetry Buddy: Start MCP Server"\n2. Tools aren't registered yet - Wait a few seconds and try again\n3. Workspace settings not configured - Run setup wizard\n\n**Quick fix**: Reload the Extension Development Host window (Ctrl+R) and try again.`);
            } else {
                stream.markdown(`⚠️ Error: ${error.message}`);
            }
        }
    });

    // Set participant metadata
    participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'images', 'waldo.png');

    // Add to subscriptions for cleanup
    context.subscriptions.push(participant);

    outputChannel.appendLine(`✓ Chat participant @${PARTICIPANT_ID} registered`);
    outputChannel.appendLine(`  Users can invoke with: @${PARTICIPANT_ID} <question>`);
    outputChannel.appendLine(`  Example: @${PARTICIPANT_ID} show me all errors from the last 24 hours`);
}
