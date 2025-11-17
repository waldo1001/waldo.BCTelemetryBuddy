import * as vscode from 'vscode';

/**
 * BC Telemetry Buddy Chat Participant
 * 
 * This participant provides specialized assistance for Business Central telemetry queries.
 * It guides GitHub Copilot to follow best practices when using the BC Telemetry MCP tools.
 */

const PARTICIPANT_ID = 'bc-telemetry-buddy';

/**
 * System prompt that guides Copilot's behavior when invoked as @bc-telemetry-buddy
 * Aligned with the comprehensive BC Telemetry Buddy chatmode system instructions.
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

## Available Tools

### BC Telemetry Buddy MCP Tools
**ALWAYS use these tools first before writing custom queries:**

1. **mcp_bc_telemetry__get_tenant_mapping**
   - **CRITICAL**: Use this FIRST when user mentions a company/customer name
   - Maps company names to aadTenantId (required for all queries)
   - BC telemetry uses tenant GUIDs, not company names for filtering

2. **mcp_bc_telemetry__get_event_catalog**
   - Discover available BC event IDs with descriptions and status
   - Use before writing queries about unfamiliar events
   - Provides documentation links and occurrence counts
   - **Supports filtering**: status (success, error, too slow, warning, info), daysBack (1-30), minCount (filter low-frequency events), maxResults (default: 50, max: 200)
   - **IMPORTANT**: Defaults to top 50 events by count. Use maxResults parameter to adjust if needed, or use filters like status='error' to focus results

3. **mcp_bc_telemetry__get_event_field_samples**
   - **RECOMMENDED**: Use this to understand event structure before querying
   - Shows actual field names, data types, and sample values from real events
   - Provides ready-to-use example queries with proper type conversions
   - Returns event category information from Microsoft Learn

4. **mcp_bc_telemetry__query_telemetry**
   - Execute KQL queries against BC telemetry data
   - Automatically includes context from saved queries
   - Returns results with recommendations

5. **mcp_bc_telemetry__save_query**
   - Save reusable queries with metadata
   - Builds knowledge base over time

6. **mcp_bc_telemetry__search_queries**
   - Find existing saved queries by keywords
   - Reuse proven query patterns

## Workflow for Analysis

### Step 1: Identify the Customer
When user mentions a company/customer name:
\`\`\`
1. Call mcp_bc_telemetry__get_tenant_mapping with company name
2. Extract aadTenantId for use in all subsequent queries
3. NEVER filter by companyName - always use aadTenantId
\`\`\`

### Step 2: Understand the Events
Before writing queries about specific events:
\`\`\`
1. Call mcp_bc_telemetry__get_event_catalog to see available events
2. Call mcp_bc_telemetry__get_event_field_samples for specific event IDs
3. Review the example query and field structure provided
\`\`\`

### Step 3: Query and Analyze
\`\`\`
1. Use mcp_bc_telemetry__query_telemetry with proper KQL
2. Interpret results in business context
3. Provide actionable insights and recommendations
4. Save useful queries with mcp_bc_telemetry__save_query
\`\`\`

## File Organization

### Generic Queries
Save general-purpose queries under:
\`\`\`
queries/
  ├── Errors/
  ├── Mapping/
  └── [descriptive-name].kql
\`\`\`

### Customer-Specific Analysis
Save customer-related work under:
\`\`\`
Customers/
  └── [CustomerName]/
      ├── [Topic]/
      │   ├── queries/
      │   └── [CustomerName]_[Topic]_Report.md
      └── README.md
\`\`\`

Examples:
- \`Customers/Thornton/Performance/Thornton_Performance_Report_2025-10-16.md\`
- \`Customers/FDenL/Commerce365/FDenL_Commerce365_Performance_Analysis.md\`

## Response Style

- **Be concise** but thorough in explanations
- **Always provide context** - explain what the data means for the business
- **Include sample queries** with comments explaining each part
- **Proactive recommendations** - suggest optimizations and investigations
- **Structure insights** using clear headers and bullet points
- **Visual aids** - suggest charts/visualizations when appropriate
- **Next steps** - always suggest what to investigate next

## Data Visualization

When creating charts and visualizations for markdown reports:

### Preferred Approach: Python Scripts with Terminal Execution
**Create .py files and execute them using \`run_in_terminal\`:**
- Create Python script with matplotlib/plotly for chart generation
- Execute script via terminal: \`python script_name.py\`
- Script saves PNG directly to the report directory
- More reliable and works with existing Python environment

### Alternative Approaches
1. **Jupyter Notebooks**: Use for interactive analysis and step-by-step visualization
2. **Interactive HTML**: Generate with Plotly.js when web hosting is available (note: not DevOps Wiki compatible)

### Visualization Guidelines
- **Default color scheme**: Teal palette (#006D77, #2AB4C1, #83C5BE, #EDF6F9)
- **Output format**: PNG for markdown embedding (universal compatibility)
- **Chart types**: Line charts for time-series, bar charts for comparisons, scatter for correlations
- **Annotations**: Include key milestones, thresholds, and crisis points
- **File location**: Save charts in same directory as the markdown report
- **Embedding**: Use relative paths: \`![Chart Title](./chart_filename.png)\`

### Example Workflow
\`\`\`
User: "Create a chart showing the performance trend"
1. Query telemetry data to get metrics
2. Create Python script with matplotlib to generate PNG
3. Execute script via terminal: python generate_chart.py
4. Embed PNG in markdown with descriptive caption
\`\`\`

## Critical Reminders

1. **NEVER filter by company name** - always get tenantId first
2. **ALWAYS check event structure** before writing complex queries
3. **Use proper type casting** - tostring(), toint(), todouble() as needed
4. **Save successful queries** - build the knowledge base
5. **Provide business context** - explain technical findings in business terms
6. **Focus on actionable insights** - not just data dumps

## Error Handling

- If tenant mapping fails, ask user to verify company name or provide tenantId
- If query returns no results, suggest checking time range and filters
- If event fields are unexpected, use mcp_bc_telemetry__get_event_field_samples to verify structure
- If query fails, check syntax and provide corrected version with explanation

## Your Goal

Help users understand their Business Central system health, performance, and usage patterns through telemetry data analysis. Transform raw telemetry into actionable insights that drive business decisions and system improvements.`;

/**
 * Get profile context for chat participant
 * Returns information about available profiles for multi-profile configurations
 */
async function getProfileContext(): Promise<string> {
    try {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return '';
        }

        const configPath = vscode.Uri.joinPath(workspaceFolders[0].uri, '.bctb-config.json');
        const configExists = await vscode.workspace.fs.stat(configPath).then(() => true, () => false);

        if (!configExists) {
            return '';
        }

        const configData = await vscode.workspace.fs.readFile(configPath);
        const config = JSON.parse(Buffer.from(configData).toString('utf8'));

        // Check if multi-profile format
        if (!config.profiles || Object.keys(config.profiles).length === 0) {
            return '';
        }

        // Get current profile from workspace settings
        const currentProfile = vscode.workspace.getConfiguration('bctb').get<string>('currentProfile') ||
            config.defaultProfile ||
            'default';

        // Build profile context
        const profileNames = Object.keys(config.profiles)
            .filter(name => !name.startsWith('_')) // Filter out base profiles
            .map(name => name === currentProfile ? `**${name}** (active)` : name);

        if (profileNames.length === 0) {
            return '';
        }

        return `

## Multi-Profile Configuration

This workspace has multiple BC telemetry profiles configured:
${profileNames.map(name => `- ${name}`).join('\n')}

**Current active profile:** ${currentProfile}

You can reference different profiles by name. Each profile represents a different customer/environment.
To analyze data from a specific profile, mention it in your query (e.g., "show errors for [profile-name]").
`;
    } catch (error) {
        // Silently fail - profile context is optional enhancement
        return '';
    }
}

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
            // Get profile context (if multi-profile configuration exists)
            const profileContext = await getProfileContext();

            // Build messages array with system prompt + profile context
            const enhancedSystemPrompt = SYSTEM_PROMPT + profileContext;

            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(enhancedSystemPrompt),
                vscode.LanguageModelChatMessage.User(request.prompt)
            ];

            // Add chat history context if available
            if (chatContext.history && chatContext.history.length > 0) {
                // Add recent conversation history (last 5 exchanges to keep context manageable)
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

            // Filter to BC Telemetry Buddy tools - MCP server tools have pattern: mcp_bc_telemetry__<tool_name>
            const bctbTools = allTools.filter(tool =>
                tool.name.startsWith('bctb_') ||  // Old manual registrations (shouldn't exist anymore)
                tool.name.startsWith('mcp_bc_telemetry__')  // MCP server tools (current pattern)
            );
            outputChannel.appendLine(`[@${PARTICIPANT_ID}] BC Telemetry Buddy tools found: ${bctbTools.length}`);

            if (bctbTools.length > 0) {
                const bctbNames = bctbTools.map(t => t.name).join(', ');
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] BCTB tool names: ${bctbNames}`);
            }

            const availableTools = bctbTools.map(tool => ({
                name: tool.name,
                description: tool.description,
                inputSchema: tool.inputSchema
            }));

            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tools to pass to model: ${availableTools.length}`);

            // Check if tools are available
            if (availableTools.length === 0) {
                outputChannel.appendLine(`[@${PARTICIPANT_ID}] Warning: No BC Telemetry Buddy tools found. MCP server may not be running.`);
                stream.markdown('⚠️ **No BC Telemetry Buddy tools available.**\n\nThe MCP server may not be running. Please:\n1. Check the Output panel (BC Telemetry Buddy)\n2. Run command: "BC Telemetry Buddy: Start MCP Server"\n3. Verify workspace settings are configured\n\nTry your question again after the MCP server is running.');
                return;
            }

            // Tool calling loop - keep going until LLM stops requesting tools
            // Pass ONLY the filtered BCTB tools (not all 264 tools from VS Code)
            let currentResponse = await model.sendRequest(messages, {
                justification: 'BC Telemetry Buddy is helping analyze Business Central telemetry using MCP tools',
                tools: availableTools,
                toolMode: vscode.LanguageModelChatToolMode.Auto
            }, token);

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

                        // Check if result is too large (token limit protection)
                        const MAX_RESULT_LENGTH = 100000; // ~25k tokens (4 chars per token average)
                        let resultContent = toolResult.content;
                        let wasTruncated = false;

                        // Calculate total length of result content
                        let totalLength = 0;
                        for (const part of resultContent) {
                            if (part instanceof vscode.LanguageModelTextPart) {
                                totalLength += part.value.length;
                            }
                        }

                        // If too large, truncate and add notice
                        if (totalLength > MAX_RESULT_LENGTH) {
                            wasTruncated = true;
                            const truncatedContent: vscode.LanguageModelTextPart[] = [];
                            let currentLength = 0;

                            for (const part of resultContent) {
                                if (part instanceof vscode.LanguageModelTextPart) {
                                    const availableSpace = MAX_RESULT_LENGTH - currentLength;
                                    if (availableSpace <= 0) break;

                                    if (part.value.length <= availableSpace) {
                                        truncatedContent.push(part);
                                        currentLength += part.value.length;
                                    } else {
                                        // Truncate this part
                                        const truncatedValue = part.value.substring(0, availableSpace) +
                                            `\n\n[... TRUNCATED - Result too large (${totalLength} chars). Showing first ${MAX_RESULT_LENGTH} chars. ` +
                                            `To see specific events, use filters like status='error' or minCount=10 to reduce result size.]`;
                                        truncatedContent.push(new vscode.LanguageModelTextPart(truncatedValue));
                                        currentLength = MAX_RESULT_LENGTH;
                                        break;
                                    }
                                }
                            }

                            resultContent = truncatedContent;
                            outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool result truncated: ${totalLength} chars -> ${MAX_RESULT_LENGTH} chars`);
                            stream.markdown(`\n\n_ℹ️ Note: Result was truncated due to size. Use filters to reduce the amount of data._\n\n`);
                        }

                        // Store tool call for assistant message
                        assistantToolCalls.push(toolCall);

                        // Create LanguageModelToolResultPart with matching callId
                        const toolResultPart = new vscode.LanguageModelToolResultPart(
                            toolCall.callId,
                            resultContent
                        );
                        toolResultParts.push(toolResultPart);
                    } catch (toolError: any) {
                        outputChannel.appendLine(`[@${PARTICIPANT_ID}] Tool error: ${toolError.message || toolError}`);

                        // Check if it's a token limit error
                        if (toolError.message && toolError.message.includes('token limit')) {
                            stream.markdown(`\n\n⚠️ **Result too large** - The response from ${toolCall.name} exceeded the token limit.\n\n` +
                                `**Solutions:**\n` +
                                `- Use filters to reduce data: \`status='error'\`, \`minCount=10\`, or \`daysBack=1\`\n` +
                                `- Ask for specific event IDs instead of all events\n` +
                                `- Focus on a shorter time period\n\n`);
                        } else {
                            stream.markdown(`\n\n⚠️ Tool ${toolCall.name} failed: ${toolError.message || String(toolError)}\n\n`);
                        }

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
