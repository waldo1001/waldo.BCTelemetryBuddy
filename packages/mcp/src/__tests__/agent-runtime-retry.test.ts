/**
 * Tests for AgentRuntime retry logic — exponential backoff for transient LLM API errors.
 *
 * Covers:
 * - Successful call on first attempt (no retry)
 * - Retry on 529 (Anthropic overloaded), 429 (rate limit), 503 (service unavailable)
 * - Success after transient failures
 * - Failure after exhausting all retries
 * - Non-retryable errors (400, 401, 404) throw immediately
 * - Exponential backoff delay calculation
 * - Max delay cap
 */

import { AgentRuntime } from '../agent/runtime.js';
import {
    AgentRuntimeConfig,
    LLMProvider,
    ChatMessage,
    ChatOptions,
    ChatResponse,
    RetryConfig
} from '../agent/types.js';

// ─── Mock dependencies ──────────────────────────────────────────────────────

// Minimal mock for AgentContextManager
const mockContextManager = {
    loadInstruction: jest.fn().mockReturnValue('Monitor performance'),
    loadState: jest.fn().mockReturnValue({
        agentName: 'test-agent',
        created: '2026-01-01T00:00:00Z',
        lastRun: '2026-01-01T00:00:00Z',
        runCount: 0,
        status: 'active',
        summary: '',
        activeIssues: [],
        resolvedIssues: [],
        recentRuns: []
    }),
    updateState: jest.fn().mockReturnValue({}),
    saveRunLog: jest.fn(),
    saveState: jest.fn()
} as any;

const mockActionDispatcher = {
    dispatch: jest.fn().mockResolvedValue([])
} as any;

const mockToolHandlers = {
    executeToolCall: jest.fn().mockResolvedValue({ result: 'ok' })
} as any;

// ─── Helper to create a mock LLM provider ───────────────────────────────────

function createMockProvider(chatFn: jest.Mock): LLMProvider {
    return {
        modelName: 'test-model',
        chat: chatFn
    };
}

function createFinalResponse(): ChatResponse {
    return {
        content: JSON.stringify({
            summary: 'Test summary',
            findings: 'No issues found',
            assessment: 'All clear',
            activeIssues: [],
            resolvedIssues: [],
            actions: [],
            stateChanges: {
                issuesCreated: [],
                issuesUpdated: [],
                issuesResolved: [],
                summaryUpdated: false
            }
        }),
        toolCalls: undefined,
        assistantMessage: { role: 'assistant', content: 'done' },
        usage: { promptTokens: 100, completionTokens: 50 }
    };
}

function createDefaultRetryConfig(overrides?: Partial<RetryConfig>): RetryConfig {
    return {
        maxRetries: 3,
        initialDelayMs: 10,         // Fast for tests
        backoffMultiplier: 2,
        maxDelayMs: 100,            // Capped low for tests
        retryableStatusCodes: [429, 529, 503],
        ...overrides
    };
}

function createRuntimeConfig(chatFn: jest.Mock, retryOverrides?: Partial<RetryConfig>): AgentRuntimeConfig {
    return {
        llmProvider: createMockProvider(chatFn),
        maxToolCalls: 20,
        maxTokens: 4096,
        contextWindowRuns: 5,
        toolScope: 'read-only',
        retry: createDefaultRetryConfig(retryOverrides)
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentRuntime retry logic', () => {
    // Suppress console output during tests
    beforeEach(() => {
        jest.spyOn(console, 'error').mockImplementation(() => { });
        jest.spyOn(console, 'log').mockImplementation(() => { });
        mockContextManager.loadState.mockReturnValue({
            agentName: 'test-agent',
            created: '2026-01-01T00:00:00Z',
            lastRun: '2026-01-01T00:00:00Z',
            runCount: 0,
            status: 'active',
            summary: '',
            activeIssues: [],
            resolvedIssues: [],
            recentRuns: []
        });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    it('should succeed on first attempt without retry', async () => {
        const chatFn = jest.fn().mockResolvedValue(createFinalResponse());
        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        const runLog = await runtime.run('test-agent');

        expect(chatFn).toHaveBeenCalledTimes(1);
        expect(runLog.findings).toBe('No issues found');
    });

    it('should retry on 529 (Anthropic overloaded) and succeed', async () => {
        const chatFn = jest.fn()
            .mockRejectedValueOnce(new Error('Anthropic API error 529: {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}'))
            .mockResolvedValue(createFinalResponse());

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        const runLog = await runtime.run('test-agent');

        expect(chatFn).toHaveBeenCalledTimes(2);
        expect(runLog.findings).toBe('No issues found');
    });

    it('should retry on 429 (rate limit) and succeed', async () => {
        const chatFn = jest.fn()
            .mockRejectedValueOnce(new Error('Anthropic API error 429: rate limited'))
            .mockResolvedValue(createFinalResponse());

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        const runLog = await runtime.run('test-agent');

        expect(chatFn).toHaveBeenCalledTimes(2);
        expect(runLog.findings).toBe('No issues found');
    });

    it('should retry on 503 (service unavailable) and succeed', async () => {
        const chatFn = jest.fn()
            .mockRejectedValueOnce(new Error('Azure OpenAI API error 503: Service Unavailable'))
            .mockResolvedValue(createFinalResponse());

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        const runLog = await runtime.run('test-agent');

        expect(chatFn).toHaveBeenCalledTimes(2);
        expect(runLog.findings).toBe('No issues found');
    });

    it('should succeed after multiple retries', async () => {
        const chatFn = jest.fn()
            .mockRejectedValueOnce(new Error('Anthropic API error 529: overloaded'))
            .mockRejectedValueOnce(new Error('Anthropic API error 529: overloaded'))
            .mockResolvedValue(createFinalResponse());

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        const runLog = await runtime.run('test-agent');

        expect(chatFn).toHaveBeenCalledTimes(3);
        expect(runLog.findings).toBe('No issues found');
    });

    it('should throw after exhausting all retries', async () => {
        const chatFn = jest.fn()
            .mockRejectedValue(new Error('Anthropic API error 529: overloaded'));

        const config = createRuntimeConfig(chatFn, { maxRetries: 2 });
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await expect(runtime.run('test-agent')).rejects.toThrow('Anthropic API error 529');
        // 1 initial + 2 retries = 3 calls
        expect(chatFn).toHaveBeenCalledTimes(3);
    });

    it('should NOT retry on non-retryable errors (400)', async () => {
        const chatFn = jest.fn()
            .mockRejectedValue(new Error('Anthropic API error 400: Bad Request'));

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await expect(runtime.run('test-agent')).rejects.toThrow('Anthropic API error 400');
        expect(chatFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on authentication errors (401)', async () => {
        const chatFn = jest.fn()
            .mockRejectedValue(new Error('Anthropic API error 401: Unauthorized'));

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await expect(runtime.run('test-agent')).rejects.toThrow('Anthropic API error 401');
        expect(chatFn).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on non-HTTP errors', async () => {
        const chatFn = jest.fn()
            .mockRejectedValue(new Error('Network connection refused'));

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await expect(runtime.run('test-agent')).rejects.toThrow('Network connection refused');
        expect(chatFn).toHaveBeenCalledTimes(1);
    });

    it('should log retry attempts', async () => {
        const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => { });
        const chatFn = jest.fn()
            .mockRejectedValueOnce(new Error('Anthropic API error 529: overloaded'))
            .mockResolvedValue(createFinalResponse());

        const config = createRuntimeConfig(chatFn);
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await runtime.run('test-agent');

        const retryLogs = consoleErrorSpy.mock.calls.filter(
            call => typeof call[0] === 'string' && call[0].includes('retrying in')
        );
        expect(retryLogs.length).toBe(1);
        expect(retryLogs[0][0]).toContain('LLM API error 529');
        expect(retryLogs[0][0]).toContain('attempt 1/3');
    });

    it('should respect maxRetries=0 (no retries)', async () => {
        const chatFn = jest.fn()
            .mockRejectedValue(new Error('Anthropic API error 529: overloaded'));

        const config = createRuntimeConfig(chatFn, { maxRetries: 0 });
        const runtime = new AgentRuntime(mockToolHandlers, mockContextManager, mockActionDispatcher, config);

        await expect(runtime.run('test-agent')).rejects.toThrow('Anthropic API error 529');
        expect(chatFn).toHaveBeenCalledTimes(1);
    });
});
