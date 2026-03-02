/**
 * Integration tests for AgentRuntime — multi-run scenarios with real filesystem context.
 *
 * Uses a real AgentContextManager (temp directories) with mocked LLM and ToolHandlers
 * to test end-to-end scenarios: state persistence across runs, sliding window compaction,
 * issue lifecycle (new → tracked → resolved → pruned).
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentRuntime } from '../../agent/runtime';
import { AgentContextManager } from '../../agent/context';
import { ActionDispatcher } from '../../agent/actions';
import {
    AgentOutput,
    AgentRuntimeConfig,
    LLMProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
    AgentState
} from '../../agent/types';

// ─── Mock tool definitions ───────────────────────────────────────────────────

jest.mock('../../tools/toolDefinitions', () => ({
    TOOL_DEFINITIONS: [
        {
            name: 'query_telemetry',
            description: 'Run a KQL query',
            inputSchema: { type: 'object', properties: {}, required: [] }
        }
    ]
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-agent-int-'));
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
});

function createLLMThatReturns(output: AgentOutput): LLMProvider {
    return {
        modelName: 'mock-model',
        chat: jest.fn(async (): Promise<ChatResponse> => ({
            content: JSON.stringify(output),
            toolCalls: undefined,
            assistantMessage: { role: 'assistant', content: JSON.stringify(output) },
            usage: { promptTokens: 100, completionTokens: 50 }
        }))
    };
}

function createLLMSequence(outputs: AgentOutput[]): LLMProvider {
    let index = 0;
    return {
        modelName: 'mock-model',
        chat: jest.fn(async (): Promise<ChatResponse> => {
            if (index >= outputs.length) throw new Error('LLM called more times than expected');
            const output = outputs[index++];
            return {
                content: JSON.stringify(output),
                toolCalls: undefined,
                assistantMessage: { role: 'assistant', content: JSON.stringify(output) },
                usage: { promptTokens: 100, completionTokens: 50 }
            };
        })
    };
}

function createConfig(llm: LLMProvider, overrides?: Partial<AgentRuntimeConfig>): AgentRuntimeConfig {
    return {
        llmProvider: llm,
        maxToolCalls: 20,
        maxTokens: 4096,
        contextWindowRuns: 3,
        toolScope: 'read-only',
        retry: {
            maxRetries: 3,
            initialDelayMs: 10,
            backoffMultiplier: 2,
            maxDelayMs: 100,
            retryableStatusCodes: [429, 529, 503]
        },
        ...overrides
    };
}

const baseOutput: AgentOutput = {
    summary: 'All clear',
    findings: 'No issues.',
    assessment: 'Healthy.',
    investigationReport: '### Run #1\n\nNo issues found.',
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRuntime Integration', () => {

    describe('multi-run state persistence', () => {
        it('should increment runCount across multiple sequential runs', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('perf-agent', '# Monitor performance');

            const llm = createLLMSequence([baseOutput, baseOutput, baseOutput]);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 3; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm)
                );
                await runtime.run('perf-agent');
            }

            const state = contextMgr.loadState('perf-agent');
            expect(state.runCount).toBe(3);
        });

        it('should persist summary updates across runs', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('summary-agent', '# Monitor stuff');

            const run1Output = { ...baseOutput, summary: 'Run 1: All clear' };
            const run2Output = { ...baseOutput, summary: 'Run 2: Minor errors detected' };

            const llm = createLLMSequence([run1Output, run2Output]);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 2; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm)
                );
                await runtime.run('summary-agent');
            }

            const state = contextMgr.loadState('summary-agent');
            expect(state.summary).toBe('Run 2: Minor errors detected');
        });

        it('should persist run logs to filesystem', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('log-agent', '# Monitor');

            const llm = createLLMThatReturns(baseOutput);
            const dispatcher = new ActionDispatcher({});

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                contextMgr,
                dispatcher,
                createConfig(llm)
            );
            await runtime.run('log-agent');

            const history = contextMgr.getRunHistory('log-agent');
            expect(history).toHaveLength(1);
            expect(history[0].findings).toBe('No issues.');
        });
    });

    describe('sliding window compaction', () => {
        it('should keep only last N runs in recentRuns', async () => {
            const windowSize = 3;
            const contextMgr = new AgentContextManager(tmpDir, windowSize);
            contextMgr.createAgent('window-agent', '# Monitor');

            // Run 5 times with window size 3
            const outputs: AgentOutput[] = [];
            for (let i = 0; i < 5; i++) {
                outputs.push({
                    ...baseOutput,
                    summary: `Run ${i + 1} summary`,
                    findings: `Finding from run ${i + 1}`
                });
            }

            const llm = createLLMSequence(outputs);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 5; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm, { contextWindowRuns: windowSize })
                );
                await runtime.run('window-agent');
            }

            const state = contextMgr.loadState('window-agent');
            expect(state.recentRuns).toHaveLength(3);
            expect(state.recentRuns[0].runId).toBe(3);
            expect(state.recentRuns[2].runId).toBe(5);
        });

        it('should preserve all runs in run logs regardless of window', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 2); // small window
            contextMgr.createAgent('log-all-agent', '# Monitor');

            const outputs = Array(4).fill(null).map((_, i) => ({
                ...baseOutput,
                findings: `Finding ${i + 1}`
            }));

            const llm = createLLMSequence(outputs);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 4; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm, { contextWindowRuns: 2 })
                );
                await runtime.run('log-all-agent');
            }

            // All 4 runs should be in the runs/ directory
            const history = contextMgr.getRunHistory('log-all-agent');
            expect(history).toHaveLength(4);
        });
    });

    describe('issue lifecycle', () => {
        it('should track new issues', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('issue-agent', '# Monitor errors');

            const outputWithIssue: AgentOutput = {
                ...baseOutput,
                summary: 'High error rate detected',
                activeIssues: [{
                    id: 'issue-err-rate',
                    fingerprint: 'error-rate-high',
                    title: 'Error rate above 5%',
                    consecutiveDetections: 1,
                    trend: 'increasing',
                    counts: [47],
                    lastSeen: new Date().toISOString()
                }],
                stateChanges: {
                    issuesCreated: ['issue-err-rate'],
                    issuesUpdated: [],
                    issuesResolved: [],
                    summaryUpdated: true
                }
            };

            const llm = createLLMThatReturns(outputWithIssue);
            const dispatcher = new ActionDispatcher({});

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                contextMgr,
                dispatcher,
                createConfig(llm)
            );
            await runtime.run('issue-agent');

            const state = contextMgr.loadState('issue-agent');
            expect(state.activeIssues).toHaveLength(1);
            expect(state.activeIssues[0].fingerprint).toBe('error-rate-high');
            expect(state.activeIssues[0].firstSeen).toBeDefined();
        });

        it('should resolve issues when reported resolved', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('resolve-agent', '# Monitor');

            // Run 1: create issue
            const run1: AgentOutput = {
                ...baseOutput,
                activeIssues: [{
                    id: 'issue-1',
                    fingerprint: 'fp-1',
                    title: 'Problem X',
                    consecutiveDetections: 1,
                    trend: 'stable',
                    counts: [10],
                    lastSeen: new Date().toISOString()
                }],
                stateChanges: {
                    issuesCreated: ['issue-1'],
                    issuesUpdated: [],
                    issuesResolved: [],
                    summaryUpdated: true
                }
            };

            // Run 2: resolve issue
            const run2: AgentOutput = {
                ...baseOutput,
                summary: 'Issue resolved',
                activeIssues: [],
                resolvedIssues: ['issue-1'],
                stateChanges: {
                    issuesCreated: [],
                    issuesUpdated: [],
                    issuesResolved: ['issue-1'],
                    summaryUpdated: true
                }
            };

            const llm = createLLMSequence([run1, run2]);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 2; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm)
                );
                await runtime.run('resolve-agent');
            }

            const state = contextMgr.loadState('resolve-agent');
            expect(state.activeIssues).toHaveLength(0);
            expect(state.resolvedIssues).toHaveLength(1);
            expect(state.resolvedIssues[0].id).toBe('issue-1');
        });

        it('should preserve firstSeen when issue persists across runs', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('firstseen-agent', '# Monitor');

            const now = new Date().toISOString();

            const run1: AgentOutput = {
                ...baseOutput,
                activeIssues: [{
                    id: 'issue-1',
                    fingerprint: 'fp-1',
                    title: 'Ongoing',
                    consecutiveDetections: 1,
                    trend: 'stable',
                    counts: [5],
                    lastSeen: now
                }],
                stateChanges: { issuesCreated: ['issue-1'], issuesUpdated: [], issuesResolved: [], summaryUpdated: true }
            };

            const run2: AgentOutput = {
                ...baseOutput,
                activeIssues: [{
                    id: 'issue-1',
                    fingerprint: 'fp-1',
                    title: 'Ongoing',
                    consecutiveDetections: 2,
                    trend: 'stable',
                    counts: [5, 6],
                    lastSeen: new Date().toISOString()
                }],
                stateChanges: { issuesCreated: [], issuesUpdated: ['issue-1'], issuesResolved: [], summaryUpdated: true }
            };

            const llm = createLLMSequence([run1, run2]);
            const dispatcher = new ActionDispatcher({});

            for (let i = 0; i < 2; i++) {
                const runtime = new AgentRuntime(
                    { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                    contextMgr,
                    dispatcher,
                    createConfig(llm)
                );
                await runtime.run('firstseen-agent');
            }

            const state = contextMgr.loadState('firstseen-agent');
            expect(state.activeIssues).toHaveLength(1);
            // firstSeen should be from run 1, not overwritten in run 2
            expect(state.activeIssues[0].firstSeen).toBeDefined();
            expect(state.activeIssues[0].consecutiveDetections).toBe(2);
        });
    });

    describe('pause/resume flow', () => {
        it('should reject runs for paused agents', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('pause-agent', '# Monitor');
            contextMgr.setAgentStatus('pause-agent', 'paused');

            const llm = createLLMThatReturns(baseOutput);
            const dispatcher = new ActionDispatcher({});

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn() } as any,
                contextMgr,
                dispatcher,
                createConfig(llm)
            );

            await expect(runtime.run('pause-agent'))
                .rejects.toThrow("paused");
        });

        it('should allow runs after resuming', async () => {
            const contextMgr = new AgentContextManager(tmpDir, 5);
            contextMgr.createAgent('resume-agent', '# Monitor');
            contextMgr.setAgentStatus('resume-agent', 'paused');
            contextMgr.setAgentStatus('resume-agent', 'active');

            const llm = createLLMThatReturns(baseOutput);
            const dispatcher = new ActionDispatcher({});

            const runtime = new AgentRuntime(
                { executeToolCall: jest.fn().mockResolvedValue({}) } as any,
                contextMgr,
                dispatcher,
                createConfig(llm)
            );

            const result = await runtime.run('resume-agent');
            expect(result.findings).toBe('No issues.');
        });
    });
});
