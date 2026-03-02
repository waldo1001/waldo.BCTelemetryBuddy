/**
 * Agent Runtime — the core ReAct loop that drives autonomous telemetry monitoring.
 *
 * Architecture:
 * 1. Loads the agent's instruction and previous state
 * 2. Sends both to an LLM along with available tool definitions
 * 3. LLM reasons → calls tools → observes results → repeats
 * 4. Produces findings, assessment, and actions
 * 5. Updates state and writes run log
 *
 * Design:
 * - DIP: LLM is injected via LLMProvider interface (Azure OpenAI is just one impl)
 * - SRP: Runtime handles only the loop; context, actions, prompts are separate modules
 * - OCP: New LLM providers = implement interface, no runtime changes
 */

import { ToolHandlers } from '../tools/toolHandlers.js';
import { TOOL_DEFINITIONS } from '../tools/toolDefinitions.js';
import { AgentContextManager } from './context.js';
import { ActionDispatcher } from './actions.js';
import {
    buildAgentPrompt,
    AGENT_SYSTEM_PROMPT,
    parseAgentOutput,
    filterToolsByScope,
    toolDefinitionsToOpenAI
} from './prompts.js';
import {
    AgentRuntimeConfig,
    AgentRunLog,
    ChatMessage,
    ChatOptions,
    ChatResponse,
    RetryConfig,
    ToolCallEntry
} from './types.js';

export class AgentRuntime {
    private readonly toolHandlers: ToolHandlers;
    private readonly contextManager: AgentContextManager;
    private readonly actionDispatcher: ActionDispatcher;
    private readonly config: AgentRuntimeConfig;

    constructor(
        toolHandlers: ToolHandlers,
        contextManager: AgentContextManager,
        actionDispatcher: ActionDispatcher,
        config: AgentRuntimeConfig
    ) {
        this.toolHandlers = toolHandlers;
        this.contextManager = contextManager;
        this.actionDispatcher = actionDispatcher;
        this.config = config;
    }

    /**
     * CI-aware collapsible group helpers.
     * Azure DevOps: ##[group]title / ##[endgroup]
     * GitHub Actions: ::group::title / ::endgroup::
     * Other: plain header line
     */
    private beginGroup(title: string): void {
        if (process.env.TF_BUILD) {
            console.log(`##[group]${title}`);
        } else if (process.env.GITHUB_ACTIONS) {
            console.log(`::group::${title}`);
        } else {
            console.log(`  ┌─ ${title}`);
        }
    }

    private endGroup(): void {
        if (process.env.TF_BUILD) {
            console.log('##[endgroup]');
        } else if (process.env.GITHUB_ACTIONS) {
            console.log('::endgroup::');
        } else {
            console.log('  └─');
        }
    }

    /**
     * Call the LLM with retry + exponential backoff for transient errors.
     * Retries on status codes like 429 (rate limit), 529 (overloaded), 503 (unavailable).
     */
    private async chatWithRetry(
        messages: ChatMessage[],
        options: ChatOptions
    ): Promise<ChatResponse> {
        const retry = this.config.retry;
        let lastError: Error | undefined;

        for (let attempt = 0; attempt <= retry.maxRetries; attempt++) {
            try {
                return await this.config.llmProvider.chat(messages, options);
            } catch (error: any) {
                lastError = error;

                // Check if this is a retryable error (extract status code from error message)
                const statusMatch = error.message?.match(/error (\d{3}):/);
                const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
                const isRetryable = retry.retryableStatusCodes.includes(statusCode);

                if (!isRetryable || attempt >= retry.maxRetries) {
                    throw error;
                }

                // Calculate delay with exponential backoff
                const delay = Math.min(
                    retry.initialDelayMs * Math.pow(retry.backoffMultiplier, attempt),
                    retry.maxDelayMs
                );

                console.log(`  🔄 LLM API error ${statusCode}, retrying in ${(delay / 1000).toFixed(1)}s (attempt ${attempt + 1}/${retry.maxRetries})...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        // Should not reach here, but just in case
        throw lastError || new Error('LLM call failed after retries');
    }

    /**
     * Execute a single monitoring pass for the named agent.
     * Returns the run log for audit trail.
     */
    async run(agentName: string): Promise<AgentRunLog> {
        const startTime = Date.now();

        // 1. Load instruction and state
        const instruction = this.contextManager.loadInstruction(agentName);
        const state = this.contextManager.loadState(agentName);

        // Check if agent is paused
        if (state.status === 'paused') {
            throw new Error(`Agent '${agentName}' is paused. Use 'agent resume' to reactivate.`);
        }

        // 2. Build initial messages
        const filteredTools = filterToolsByScope(TOOL_DEFINITIONS, this.config.toolScope);
        const tools = toolDefinitionsToOpenAI(filteredTools);
        const messages: ChatMessage[] = [
            { role: 'system', content: AGENT_SYSTEM_PROMPT },
            { role: 'user', content: buildAgentPrompt(instruction, state) }
        ];

        // 3. ReAct loop
        const toolCallLog: ToolCallEntry[] = [];
        let totalToolCalls = 0;
        let llmStats = { promptTokens: 0, completionTokens: 0 };
        let iteration = 0;

        while (totalToolCalls < this.config.maxToolCalls) {
            iteration++;
            console.log(`\n── Iteration ${iteration} (${totalToolCalls}/${this.config.maxToolCalls} tool calls used) ──`);
            const response = await this.chatWithRetry(messages, {
                tools,
                maxTokens: this.config.maxTokens
            });

            llmStats.promptTokens += response.usage.promptTokens;
            llmStats.completionTokens += response.usage.completionTokens;

            if (response.toolCalls && response.toolCalls.length > 0) {
                // LLM wants to call tools — add assistant message to conversation
                // Log any reasoning text the LLM included alongside tool calls
                if (response.content) {
                    console.log(`  💭 Reasoning: ${response.content.substring(0, 200)}${response.content.length > 200 ? '...' : ''}`);
                }
                messages.push(response.assistantMessage);

                for (const call of response.toolCalls) {
                    totalToolCalls++;
                    const callStart = Date.now();

                    // Log tool call with arguments summary
                    const argsSummary = (() => {
                        try {
                            const parsed = JSON.parse(call.function.arguments);
                            const entries = Object.entries(parsed);
                            if (entries.length === 0) return '';
                            return entries.map(([k, v]) => {
                                const val = typeof v === 'string' && v.length > 80 ? v.substring(0, 80) + '...' : v;
                                return `${k}=${JSON.stringify(val)}`;
                            }).join(', ');
                        } catch { return call.function.arguments.substring(0, 100); }
                    })();
                    console.log(`     [${totalToolCalls}] ${call.function.name}`);

                    // Extract KQL for query_telemetry calls to show in group
                    let kqlQuery: string | undefined;
                    if (call.function.name === 'query_telemetry') {
                        try {
                            const parsed = JSON.parse(call.function.arguments);
                            kqlQuery = parsed.query;
                        } catch { /* ignore */ }
                    }

                    // Wrap tool execution in a collapsible group (hides internal kusto/auth/cache logs)
                    this.beginGroup(`🔧 [${totalToolCalls}] ${call.function.name}(${argsSummary})`);

                    // Show KQL inside collapsible group
                    if (kqlQuery) {
                        console.log(`KQL:\n${kqlQuery}`);
                    }

                    let resultStr: string;
                    try {
                        const args = JSON.parse(call.function.arguments);
                        const result = await this.toolHandlers.executeToolCall(
                            call.function.name,
                            args
                        );
                        resultStr = typeof result === 'string'
                            ? result
                            : JSON.stringify(result, null, 2);
                    } catch (error: any) {
                        resultStr = JSON.stringify({
                            error: error.message || 'Tool execution failed'
                        });
                    }

                    this.endGroup();

                    const callDuration = Date.now() - callStart;
                    // Log result summary: row count for queries, length for other results
                    const resultPreview = (() => {
                        try {
                            const parsed = JSON.parse(resultStr);
                            if (parsed.rows && Array.isArray(parsed.rows)) {
                                return `${parsed.rows.length} row(s), ${parsed.columns?.length || '?'} col(s)`;
                            }
                            if (parsed.summary) return parsed.summary;
                            if (parsed.error) return `ERROR: ${parsed.error}`;
                            return `${resultStr.length} chars`;
                        } catch {
                            return `${resultStr.length} chars`;
                        }
                    })();
                    console.log(`         → ${resultPreview} (${callDuration}ms)`);

                    messages.push({
                        role: 'tool',
                        content: resultStr,
                        tool_call_id: call.id
                    });

                    toolCallLog.push({
                        sequence: totalToolCalls,
                        tool: call.function.name,
                        args: (() => {
                            try { return JSON.parse(call.function.arguments); }
                            catch { return {}; }
                        })(),
                        resultSummary: resultStr.substring(0, 500),
                        durationMs: callDuration
                    });
                }
            } else {
                // LLM is done reasoning — parse final output
                console.log(`\n── Agent finished reasoning ──`);

                // Detect truncated output
                if (response.finishReason === 'length') {
                    console.log(`  ⚠ Response was TRUNCATED (hit max_tokens=${this.config.maxTokens}). Consider increasing maxTokens in config.`);
                }

                const output = parseAgentOutput(response.content, response.finishReason === 'length');

                // Display parsed assessment (not regex — handles multi-line and escaped chars)
                if (output.assessment) {
                    const preview = output.assessment.replace(/\n/g, ' ').substring(0, 300);
                    console.log(`  📋 Assessment: ${preview}${output.assessment.length > 300 ? '...' : ''}`);
                }

                // Warn when output fields look abbreviated
                const abbreviated = ['summary', 'findings', 'assessment', 'investigationReport']
                    .filter(f => {
                        const val = (output as any)[f];
                        return typeof val === 'string' && (val === '...' || val === '…' || val.length < 10);
                    });
                if (abbreviated.length > 0) {
                    console.log(`  ⚠ WARNING: These output fields appear abbreviated: ${abbreviated.join(', ')}. The LLM may have truncated its own output.`);
                }

                // 4. Execute actions
                const executedActions = await this.actionDispatcher.dispatch(
                    output.actions,
                    agentName
                );

                // 5. Update state
                const updatedState = this.contextManager.updateState(
                    agentName,
                    state,
                    output,
                    executedActions,
                    Date.now() - startTime,
                    toolCallLog.map(tc => tc.tool)
                );

                // 6. Build run log
                const runLog: AgentRunLog = {
                    runId: state.runCount + 1,
                    agentName,
                    timestamp: new Date().toISOString(),
                    durationMs: Date.now() - startTime,
                    instruction,
                    stateAtStart: {
                        summary: state.summary,
                        activeIssueCount: state.activeIssues.length,
                        runCount: state.runCount
                    },
                    llm: {
                        model: this.config.llmProvider.modelName,
                        promptTokens: llmStats.promptTokens,
                        completionTokens: llmStats.completionTokens,
                        totalTokens: llmStats.promptTokens + llmStats.completionTokens,
                        toolCallCount: totalToolCalls
                    },
                    toolCalls: toolCallLog,
                    assessment: output.assessment,
                    findings: output.findings,
                    actions: executedActions,
                    stateChanges: output.stateChanges
                };

                // 7. Persist
                this.contextManager.saveRunLog(agentName, runLog, output.investigationReport);
                this.contextManager.saveState(agentName, updatedState);

                return runLog;
            }
        }

        // Safety: max tool calls reached
        throw new Error(`Agent '${agentName}' exceeded max tool calls (${this.config.maxToolCalls})`);
    }
}
