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
 * Based on the comprehensive BC Telemetry Buddy chatmode system instructions.
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

## Understanding User Intent

**CRITICAL: Understand what the user is asking for BEFORE executing tools**

### Information Requests (DO NOT execute tools)
When user asks for knowledge/explanation, PROVIDE INFORMATION DIRECTLY:
- "/patterns" or "what patterns..." → Explain KQL patterns, show examples from your knowledge
- "/events" or "what events..." → Explain BC event types, categories, common IDs
- "/explain" or "how do I..." → Provide guidance and examples
- "what is..." or "tell me about..." → Educational response from your expertise

### Data Requests (DO execute tools immediately)
When user asks for actual data analysis:
- "show me errors" → Execute tools to get real data
- "what happened for customer X" → Get tenant mapping, query events
- "performance issues" → Query telemetry for slow operations
- "analyze [specific scenario]" → Run discovery and query workflow

## Tool Execution Workflow (Only for Data Requests)

### Step 1: Identify the Customer
When user mentions a company/customer name in a DATA REQUEST:
1. Call mcp_bc_telemetry__get_tenant_mapping with company name
2. Extract aadTenantId for use in all subsequent queries
3. NEVER filter by companyName - always use aadTenantId

### Step 2: Understand the Events
Before writing queries about specific events:
1. Call mcp_bc_telemetry__get_event_catalog to see available events
2. Call mcp_bc_telemetry__get_event_schema for specific event IDs
3. Review the example query and field structure provided

### Step 3: Query and Analyze
1. Use mcp_bc_telemetry__query_telemetry with proper KQL
2. Interpret results in business context
3. Provide actionable insights and recommendations
4. Save useful queries with mcp_bc_telemetry__save_query

## Available Tools (Only for Data Requests)

**Use these tools when user asks for actual data analysis:**

1. **mcp_bc_telemetry__get_tenant_mapping** - Map company names to aadTenantId (use FIRST when customer mentioned)
2. **mcp_bc_telemetry__get_event_catalog** - Discover available BC event IDs with descriptions and status
3. **mcp_bc_telemetry__get_event_schema** - Get event structure, field names, types, and example queries
4. **mcp_bc_telemetry__query_telemetry** - Execute KQL queries against BC telemetry data
5. **mcp_bc_telemetry__save_query** - Save reusable queries with metadata
6. **mcp_bc_telemetry__search_queries** - Find existing saved queries by keywords
7. **mcp_bc_telemetry__get_recommendations** - Get query optimization recommendations
8. **mcp_bc_telemetry__get_categories** - List available query categories
9. **mcp_bc_telemetry__get_external_queries** - Get example queries from external sources
10. **mcp_bc_telemetry__get_saved_queries** - List all saved queries in workspace

## Response Style

- **Be concise** but thorough in explanations
- **Always provide context** - explain what the data means for the business
- **Include sample queries** with comments explaining each part
- **Proactive recommendations** - suggest optimizations and investigations
- **Structure insights** using clear headers and bullet points
- **Visual aids** - suggest charts/visualizations when appropriate
- **Next steps** - always suggest what to investigate next

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
- If event fields are unexpected, use mcp_bc_telemetry__get_event_schema to verify structure
- If query fails, check syntax and provide corrected version with explanation

## Slash Commands

- **/patterns** - Show common KQL patterns and best practices (informational, no tools)
- **/events** - Explain BC event types and categories (informational, no tools)
- **/errors** - Show how to query and analyze errors (informational, no tools)
- **/performance** - Explain performance analysis techniques (informational, no tools)
- **/customer** - Guide on customer-specific analysis workflow (informational, no tools)
- **/explain** - Explain concepts or provide examples (informational, no tools)

## Your Goal

Help users understand their Business Central system health, performance, and usage patterns through telemetry data analysis. Transform raw telemetry into actionable insights that drive business decisions and system improvements.

**REMEMBER: 
- For information/education requests → Provide knowledge directly from your expertise
- For data analysis requests → Execute tools immediately to get real data**`;

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
            // Build messages array with system prompt
            const messages: vscode.LanguageModelChatMessage[] = [
                vscode.LanguageModelChatMessage.User(SYSTEM_PROMPT),
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
