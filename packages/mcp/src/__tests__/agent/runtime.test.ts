/**
 * Tests for AgentRuntime — the core ReAct loop.
 *
 * All dependencies are mocked:
 * - LLMProvider: returns scripted responses
 * - ToolHandlers: returns scripted tool results
 * - AgentContextManager: mocked filesystem operations
 * - ActionDispatcher: mocked action execution
 */

import { AgentRuntime } from '../../agent/runtime';
import { AgentContextManager } from '../../agent/context';
import { ActionDispatcher } from '../../agent/actions';
import {
    AgentState,
    AgentRuntimeConfig,
    LLMProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
    AgentRunLog,
    AgentOutput
} from '../../agent/types';

// ─── Mock setup ──────────────────────────────────────────────────────────────

// Mock the tool definitions module
jest.mock('../../tools/toolDefinitions', () => ({
    TOOL_DEFINITIONS: [
        {
            name: 'query_telemetry',
            description: 'Run a KQL query',
            inputSchema: {
                type: 'object',
                properties: { kql: { type: 'string' } },
                required: ['kql']
            }
        },
        {
            name: 'get_event_catalog',
            description: 'Get event catalog',
            inputSchema: {
                type: 'object',
                properties: {},
                required: []
            }
        }
    ]
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

const validAgentOutput: AgentOutput = {
    summary: 'System is healthy, no issues detected.',
    findings: 'All error rates within normal range.',
    assessment: 'No action required.',
    investigationReport: '### Run #1\n\nAll error rates within normal range.',
    activeIssues: [],
    resolvedIssues: [],
    actions: [],
    stateChanges: {
        issuesCreated: [],
        issuesUpdated: [],
        issuesResolved: [],
        summaryUpdated: true
    }
};

function createMockState(overrides?: Partial<AgentState>): AgentState {
    return {
        agentName: 'test-agent',
        created: '2025-01-01T00:00:00Z',
        lastRun: '2025-01-01T00:00:00Z',
        runCount: 0,
        status: 'active',
        summary: '',
        activeIssues: [],
        resolvedIssues: [],
        recentRuns: [],
        ...overrides
    };
}

/**
 * Create a mock LLM provider that returns the given responses in sequence.
 * Each response can be either a "content" response (final answer) or a "tool_calls" response.
 */
function createMockLLM(responses: ChatResponse[]): LLMProvider {
    let callIndex = 0;
    return {
        modelName: 'mock-model',
        chat: jest.fn(async (_messages: ChatMessage[], _options: ChatOptions): Promise<ChatResponse> => {
            if (callIndex >= responses.length) {
                throw new Error(`LLM called more times than expected (${responses.length})`);
            }
            return responses[callIndex++];
        })
    };
}

function createContentResponse(output: AgentOutput): ChatResponse {
    return {
        content: JSON.stringify(output),
        toolCalls: undefined,
        assistantMessage: {
            role: 'assistant',
            content: JSON.stringify(output)
        },
        usage: { promptTokens: 100, completionTokens: 50 }
    };
}

function createToolCallResponse(toolName: string, args: Record<string, any>): ChatResponse {
    return {
        content: '',
        toolCalls: [{
            id: `call_${toolName}_${Date.now()}`,
            type: 'function',
            function: {
                name: toolName,
                arguments: JSON.stringify(args)
            }
        }],
        assistantMessage: {
            role: 'assistant',
            content: '',
            tool_calls: [{
                id: `call_${toolName}_${Date.now()}`,
                type: 'function',
                function: {
                    name: toolName,
                    arguments: JSON.stringify(args)
                }
            }]
        },
        usage: { promptTokens: 80, completionTokens: 30 }
    };
}

function createMockContext(state?: AgentState): AgentContextManager {
    const mockState = state || createMockState();
    return {
        loadInstruction: jest.fn().mockReturnValue('Monitor error rates.'),
        loadState: jest.fn().mockReturnValue(mockState),
        updateState: jest.fn().mockReturnValue({ ...mockState, runCount: mockState.runCount + 1 }),
        saveRunLog: jest.fn(),
        saveState: jest.fn()
    } as unknown as AgentContextManager;
}

function createMockDispatcher(): ActionDispatcher {
    return {
        dispatch: jest.fn().mockResolvedValue([]),
        isConfigured: jest.fn().mockReturnValue(true)
    } as unknown as ActionDispatcher;
}

function createConfig(llm: LLMProvider): AgentRuntimeConfig {
    return {
        llmProvider: llm,
        maxToolCalls: 20,
        maxTokens: 4096,
        contextWindowRuns: 5,
        toolScope: 'read-only',
        retry: {
            maxRetries: 3,
            initialDelayMs: 10,
            backoffMultiplier: 2,
            maxDelayMs: 100,
            retryableStatusCodes: [429, 529, 503]
        }
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRuntime', () => {

    describe('simple run (no tool calls)', () => {
        it('should complete a run when LLM returns immediate answer', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(result.agentName).toBe('test-agent');
            expect(result.findings).toBe('All error rates within normal range.');
            expect(result.assessment).toBe('No action required.');
            expect(result.toolCalls).toHaveLength(0);
            expect(result.llm.toolCallCount).toBe(0);
        });

        it('should load instruction and state from context', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            expect(context.loadInstruction).toHaveBeenCalledWith('test-agent');
            expect(context.loadState).toHaveBeenCalledWith('test-agent');
        });

        it('should save state and run log after completion', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            expect(context.saveRunLog).toHaveBeenCalledTimes(1);
            expect(context.saveState).toHaveBeenCalledTimes(1);
            expect(context.updateState).toHaveBeenCalledTimes(1);
        });

        it('should track token usage', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(result.llm.promptTokens).toBe(100);
            expect(result.llm.completionTokens).toBe(50);
            expect(result.llm.totalTokens).toBe(150);
        });

        it('should compute run duration', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(result.durationMs).toBeDefined();
            expect(result.durationMs).toBeGreaterThanOrEqual(0);
        });
    });

    describe('run with tool calls', () => {
        it('should execute tool calls and pass results back to LLM', async () => {
            const toolResponse = createToolCallResponse('query_telemetry', { kql: 'traces | limit 10' });
            const finalResponse = createContentResponse(validAgentOutput);

            const llm = createMockLLM([toolResponse, finalResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            const toolHandlers = {
                executeToolCall: jest.fn().mockResolvedValue({ rows: [], columns: [] })
            };

            const runtime = new AgentRuntime(
                toolHandlers as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(toolHandlers.executeToolCall).toHaveBeenCalledWith(
                'query_telemetry',
                { kql: 'traces | limit 10' }
            );
            expect(result.toolCalls).toHaveLength(1);
            expect(result.toolCalls[0].tool).toBe('query_telemetry');
            expect(result.llm.toolCallCount).toBe(1);
        });

        it('should handle multiple sequential tool calls', async () => {
            const call1 = createToolCallResponse('get_event_catalog', {});
            const call2 = createToolCallResponse('query_telemetry', { kql: 'errors | count' });
            const final = createContentResponse(validAgentOutput);

            const llm = createMockLLM([call1, call2, final]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            const toolHandlers = {
                executeToolCall: jest.fn()
                    .mockResolvedValueOnce(['RT0001', 'RT0002'])
                    .mockResolvedValueOnce({ count: 42 })
            };

            const runtime = new AgentRuntime(
                toolHandlers as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(toolHandlers.executeToolCall).toHaveBeenCalledTimes(2);
            expect(result.toolCalls).toHaveLength(2);
            expect(result.llm.toolCallCount).toBe(2);
        });

        it('should capture tool call result summaries', async () => {
            const toolResponse = createToolCallResponse('query_telemetry', { kql: 'test' });
            const finalResponse = createContentResponse(validAgentOutput);

            const llm = createMockLLM([toolResponse, finalResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            const toolHandlers = {
                executeToolCall: jest.fn().mockResolvedValue('result data here')
            };

            const runtime = new AgentRuntime(
                toolHandlers as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(result.toolCalls[0].resultSummary).toContain('result data here');
        });

        it('should accumulate token usage across multiple LLM calls', async () => {
            const call1 = createToolCallResponse('get_event_catalog', {});
            const final = createContentResponse(validAgentOutput);

            const llm = createMockLLM([call1, final]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            // call1: 80+30, final: 100+50
            expect(result.llm.promptTokens).toBe(180);
            expect(result.llm.completionTokens).toBe(80);
            expect(result.llm.totalTokens).toBe(260);
        });
    });

    describe('tool call error handling', () => {
        it('should wrap tool errors in JSON and continue', async () => {
            const toolResponse = createToolCallResponse('query_telemetry', { kql: 'bad' });
            const finalResponse = createContentResponse(validAgentOutput);

            const llm = createMockLLM([toolResponse, finalResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            const toolHandlers = {
                executeToolCall: jest.fn().mockRejectedValue(new Error('Query failed'))
            };

            const runtime = new AgentRuntime(
                toolHandlers as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            // Should NOT throw — error is passed back to LLM as tool result
            const result = await runtime.run('test-agent');

            expect(result).toBeDefined();
            expect(result.toolCalls).toHaveLength(1);
        });

        it('should pass error message back to LLM in tool result', async () => {
            const toolResponse = createToolCallResponse('query_telemetry', { kql: 'bad' });
            const finalResponse = createContentResponse(validAgentOutput);

            const llm = createMockLLM([toolResponse, finalResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            const toolHandlers = {
                executeToolCall: jest.fn().mockRejectedValue(new Error('Access denied'))
            };

            const runtime = new AgentRuntime(
                toolHandlers as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            // Check that the LLM received the error as a tool message
            const llmCalls = (llm.chat as jest.Mock).mock.calls;
            const secondCallMessages = llmCalls[1][0] as ChatMessage[];
            const toolMessage = secondCallMessages.find(m => m.role === 'tool');
            expect(toolMessage).toBeDefined();
            expect(toolMessage!.content).toContain('Access denied');
        });
    });

    describe('paused agent', () => {
        it('should throw if agent is paused', async () => {
            const llm = createMockLLM([]);
            const pausedState = createMockState({ status: 'paused' });
            const context = createMockContext(pausedState);
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await expect(runtime.run('test-agent'))
                .rejects.toThrow("Agent 'test-agent' is paused");
        });

        it('should not call LLM for paused agents', async () => {
            const llm = createMockLLM([]);
            const pausedState = createMockState({ status: 'paused' });
            const context = createMockContext(pausedState);
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            try { await runtime.run('test-agent'); } catch { /* expected */ }

            expect(llm.chat).not.toHaveBeenCalled();
        });
    });

    describe('max tool calls limit', () => {
        it('should throw if max tool calls is exceeded', async () => {
            // Create LLM that always returns tool calls (never a content response)
            const infiniteToolCalls: ChatResponse[] = Array(25).fill(null).map(() =>
                createToolCallResponse('query_telemetry', { kql: 'test' })
            );

            const llm = createMockLLM(infiniteToolCalls);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const config = createConfig(llm);
            config.maxToolCalls = 3; // Low limit for testing

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue('ok') } as any,
                context,
                dispatcher,
                config
            );

            await expect(runtime.run('test-agent'))
                .rejects.toThrow('exceeded max tool calls (3)');
        });
    });

    describe('action dispatch', () => {
        it('should dispatch actions from agent output', async () => {
            const outputWithActions: AgentOutput = {
                ...validAgentOutput,
                actions: [{
                    type: 'teams-webhook',
                    title: 'High Error Rate',
                    message: 'Error rate exceeded 5%',
                    severity: 'high'
                }]
            };

            const llm = createMockLLM([createContentResponse(outputWithActions)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();
            (dispatcher.dispatch as jest.Mock).mockResolvedValue([{
                run: 0,
                type: 'teams-webhook',
                status: 'sent',
                timestamp: '2025-01-01T00:00:00Z',
                details: {}
            }]);

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('test-agent');

            expect(dispatcher.dispatch).toHaveBeenCalledWith(
                outputWithActions.actions,
                'test-agent'
            );
            expect(result.actions).toHaveLength(1);
            expect(result.actions[0].status).toBe('sent');
        });

        it('should pass empty actions list when no actions requested', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            expect(dispatcher.dispatch).toHaveBeenCalledWith([], 'test-agent');
        });
    });

    describe('state update', () => {
        it('should call updateState with correct parameters', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            expect(context.updateState).toHaveBeenCalledTimes(1);
            const updateArgs = (context.updateState as jest.Mock).mock.calls[0];
            expect(updateArgs[0]).toBe('test-agent'); // agentName
            // updateArgs[1] = previous state
            // updateArgs[2] = output
            expect(updateArgs[2].summary).toBe('System is healthy, no issues detected.');
            // updateArgs[3] = executed actions
            // updateArgs[4] = duration ms
            expect(typeof updateArgs[4]).toBe('number');
            // updateArgs[5] = tool call names
            expect(updateArgs[5]).toEqual([]);
        });

        it('should pass tool call names to updateState', async () => {
            const toolCall = createToolCallResponse('query_telemetry', { kql: 'test' });
            const finalResponse = createContentResponse(validAgentOutput);

            const llm = createMockLLM([toolCall, finalResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue('ok') } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            const toolNames = (context.updateState as jest.Mock).mock.calls[0][5];
            expect(toolNames).toContain('query_telemetry');
        });
    });

    describe('run log structure', () => {
        it('should include all required run log fields', async () => {
            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const log = await runtime.run('test-agent');

            expect(log.runId).toBe(1);
            expect(log.agentName).toBe('test-agent');
            expect(log.timestamp).toBeDefined();
            expect(log.durationMs).toBeGreaterThanOrEqual(0);
            expect(log.instruction).toBe('Monitor error rates.');
            expect(log.stateAtStart).toBeDefined();
            expect(log.stateAtStart.runCount).toBe(0);
            expect(log.llm).toBeDefined();
            expect(log.stateChanges).toBeDefined();
        });

        it('should record stateAtStart accurately', async () => {
            const startState = createMockState({
                runCount: 5,
                summary: 'Everything fine',
                activeIssues: [{
                    id: 'issue-1',
                    fingerprint: 'fp-1',
                    title: 'Old issue',
                    firstSeen: '2025-01-01T00:00:00Z',
                    lastSeen: '2025-01-01T00:00:00Z',
                    consecutiveDetections: 3,
                    trend: 'stable',
                    counts: [1, 1, 1],
                    actionsTaken: []
                }]
            });

            const llm = createMockLLM([createContentResponse(validAgentOutput)]);
            const context = createMockContext(startState);
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            const log = await runtime.run('test-agent');

            expect(log.stateAtStart.summary).toBe('Everything fine');
            expect(log.stateAtStart.activeIssueCount).toBe(1);
            expect(log.stateAtStart.runCount).toBe(5);
            expect(log.runId).toBe(6);
        });
    });

    describe('truncation recovery', () => {
        it('should recover gracefully when response is truncated', async () => {
            // Simulate a truncated LLM response (finishReason = 'length')
            const truncatedResponse: ChatResponse = {
                content: `{"summary": "Checked 12 tenants", "findings": "DK Tools slow queries at 58"`,
                toolCalls: undefined,
                assistantMessage: {
                    role: 'assistant',
                    content: `{"summary": "Checked 12 tenants", "findings": "DK Tools slow queries at 58"`
                },
                usage: { promptTokens: 5000, completionTokens: 4096 },
                finishReason: 'length'
            };

            const llm = createMockLLM([truncatedResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            // Should NOT throw — should recover with fallbacks
            const log = await runtime.run('test-agent');
            expect(log.findings).toBe('DK Tools slow queries at 58');
            // assessment falls back to findings when truncated
            expect(log.assessment).toBe('DK Tools slow queries at 58');
        });

        it('should still throw on missing fields when NOT truncated', async () => {
            // Same response but without finishReason = 'length'
            const badResponse: ChatResponse = {
                content: `{"summary": "ok", "findings": "none"}`,
                toolCalls: undefined,
                assistantMessage: {
                    role: 'assistant',
                    content: `{"summary": "ok", "findings": "none"}`
                },
                usage: { promptTokens: 100, completionTokens: 50 },
                finishReason: 'stop'
            };

            const llm = createMockLLM([badResponse]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await expect(runtime.run('test-agent'))
                .rejects.toThrow('Missing required field: assessment');
        });
    });

    describe('abbreviated output warning', () => {
        it('should log warning when output fields are abbreviated', async () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            const abbreviatedOutput: AgentOutput = {
                ...validAgentOutput,
                summary: '...',
                findings: '...',
                assessment: '...',
                investigationReport: '...'
            };

            const llm = createMockLLM([createContentResponse(abbreviatedOutput)]);
            const context = createMockContext();
            const dispatcher = createMockDispatcher();

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                context,
                dispatcher,
                createConfig(llm)
            );

            await runtime.run('test-agent');

            const warningCall = consoleSpy.mock.calls.find(
                call => typeof call[0] === 'string' && call[0].includes('WARNING: These output fields appear abbreviated')
            );
            expect(warningCall).toBeDefined();
            consoleSpy.mockRestore();
        });
    });
});
