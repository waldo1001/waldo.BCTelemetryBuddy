/**
 * Tests for the Anthropic/Claude LLM provider.
 *
 * All external HTTP calls are mocked — no real API calls are made.
 * Tests cover the translation layer (OpenAI ↔ Anthropic format) and
 * the fetch-based provider factory.
 */

import {
    translateToolsToAnthropic,
    translateMessagesToAnthropic,
    translateResponseFromAnthropic,
    createAnthropicProvider,
    AnthropicProviderConfig
} from '../../agent/providers/anthropic.js';
import { ChatMessage, OpenAIToolDef } from '../../agent/types.js';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

beforeEach(() => {
    mockFetch.mockReset();
});

// ─── translateToolsToAnthropic ────────────────────────────────────────────────

describe('translateToolsToAnthropic', () => {
    it('converts a single tool definition', () => {
        const tools: OpenAIToolDef[] = [{
            type: 'function',
            function: {
                name: 'get_event_catalog',
                description: 'List available telemetry events',
                parameters: {
                    type: 'object',
                    properties: { status: { type: 'string' } },
                    required: []
                }
            }
        }];

        const result = translateToolsToAnthropic(tools);

        expect(result).toHaveLength(1);
        expect(result[0].name).toBe('get_event_catalog');
        expect(result[0].description).toBe('List available telemetry events');
        expect(result[0].input_schema).toEqual(tools[0].function.parameters);
    });

    it('converts multiple tools', () => {
        const tools: OpenAIToolDef[] = [
            { type: 'function', function: { name: 'tool_a', description: 'A', parameters: {} } },
            { type: 'function', function: { name: 'tool_b', description: 'B', parameters: {} } }
        ];
        const result = translateToolsToAnthropic(tools);
        expect(result).toHaveLength(2);
        expect(result.map(t => t.name)).toEqual(['tool_a', 'tool_b']);
    });

    it('returns empty array for empty input', () => {
        expect(translateToolsToAnthropic([])).toEqual([]);
    });
});

// ─── translateMessagesToAnthropic ─────────────────────────────────────────────

describe('translateMessagesToAnthropic', () => {
    it('extracts system message to top-level system param', () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: 'You are a BC telemetry monitor.' },
            { role: 'user', content: 'Hello' }
        ];
        const { system, messages: translated } = translateMessagesToAnthropic(messages);

        expect(system).toBe('You are a BC telemetry monitor.');
        expect(translated).toHaveLength(1);
        expect(translated[0]).toEqual({ role: 'user', content: 'Hello' });
    });

    it('passes through a plain user message', () => {
        const messages: ChatMessage[] = [
            { role: 'user', content: 'Run the agent.' }
        ];
        const { system, messages: translated } = translateMessagesToAnthropic(messages);

        expect(system).toBeUndefined();
        expect(translated).toHaveLength(1);
        expect(translated[0]).toEqual({ role: 'user', content: 'Run the agent.' });
    });

    it('converts assistant with tool_calls to content array', () => {
        const messages: ChatMessage[] = [{
            role: 'assistant',
            content: 'Let me check',
            tool_calls: [{
                id: 'call_1',
                type: 'function',
                function: { name: 'query_telemetry', arguments: '{"eventId":"RT0005"}' }
            }]
        }];
        const { messages: translated } = translateMessagesToAnthropic(messages);

        expect(translated).toHaveLength(1);
        const msg = translated[0];
        expect(msg.role).toBe('assistant');
        expect(Array.isArray(msg.content)).toBe(true);
        const content = msg.content as any[];
        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({ type: 'text', text: 'Let me check' });
        expect(content[1]).toEqual({
            type: 'tool_use',
            id: 'call_1',
            name: 'query_telemetry',
            input: { eventId: 'RT0005' }
        });
    });

    it('omits text block when assistant has no content string', () => {
        const messages: ChatMessage[] = [{
            role: 'assistant',
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'tool', arguments: '{}' } }]
        }];
        const { messages: translated } = translateMessagesToAnthropic(messages);
        const content = translated[0].content as any[];
        // Only tool_use block, no text block
        expect(content).toHaveLength(1);
        expect(content[0].type).toBe('tool_use');
    });

    it('groups consecutive tool messages into a single user message', () => {
        const messages: ChatMessage[] = [
            { role: 'tool', tool_call_id: 'c1', content: 'result_1' },
            { role: 'tool', tool_call_id: 'c2', content: 'result_2' }
        ];
        const { messages: translated } = translateMessagesToAnthropic(messages);

        expect(translated).toHaveLength(1);
        expect(translated[0].role).toBe('user');
        const content = translated[0].content as any[];
        expect(content).toHaveLength(2);
        expect(content[0]).toEqual({ type: 'tool_result', tool_use_id: 'c1', content: 'result_1' });
        expect(content[1]).toEqual({ type: 'tool_result', tool_use_id: 'c2', content: 'result_2' });
    });

    it('handles full multi-turn conversation (system + user + assistant tool + tool results)', () => {
        const messages: ChatMessage[] = [
            { role: 'system', content: 'You are an agent.' },
            { role: 'user', content: 'Start monitoring.' },
            {
                role: 'assistant',
                tool_calls: [{ id: 'c1', type: 'function', function: { name: 'get_event_catalog', arguments: '{}' } }]
            },
            { role: 'tool', tool_call_id: 'c1', content: '["RT0005"]' },
            { role: 'assistant', content: 'Found RT0005.' }
        ];
        const { system, messages: translated } = translateMessagesToAnthropic(messages);

        expect(system).toBe('You are an agent.');
        expect(translated).toHaveLength(4); // user, assistant(tool_use), user(tool_result), assistant(text)

        expect(translated[0]).toEqual({ role: 'user', content: 'Start monitoring.' });
        expect(translated[1].role).toBe('assistant');
        expect(Array.isArray(translated[1].content)).toBe(true);
        expect(translated[2].role).toBe('user');
        expect(Array.isArray(translated[2].content)).toBe(true);
        expect((translated[2].content as any[])[0].type).toBe('tool_result');
        expect(translated[3]).toEqual({ role: 'assistant', content: 'Found RT0005.' });
    });

    it('handles assistant with neither content nor tool_calls', () => {
        const messages: ChatMessage[] = [{ role: 'assistant' }];
        const { messages: translated } = translateMessagesToAnthropic(messages);
        expect(translated[0]).toEqual({ role: 'assistant', content: '' });
    });

    it('handles empty tool_call arguments gracefully (invalid JSON)', () => {
        const messages: ChatMessage[] = [{
            role: 'assistant',
            tool_calls: [{ id: 'c1', type: 'function', function: { name: 'tool', arguments: 'not-json' } }]
        }];
        // Should not throw, should fall back to {}
        expect(() => translateMessagesToAnthropic(messages)).not.toThrow();
        const { messages: translated } = translateMessagesToAnthropic(messages);
        const block = (translated[0].content as any[])[0];
        expect(block.input).toEqual({});
    });
});

// ─── translateResponseFromAnthropic ──────────────────────────────────────────

describe('translateResponseFromAnthropic', () => {
    it('converts a text-only response', () => {
        const anthropicResp: any = {
            id: 'msg_1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'All looks good.' }],
            model: 'claude-opus-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 100, output_tokens: 50 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);

        expect(result.content).toBe('All looks good.');
        expect(result.toolCalls).toBeUndefined();
        expect(result.assistantMessage.role).toBe('assistant');
        expect(result.assistantMessage.content).toBe('All looks good.');
        expect(result.assistantMessage.tool_calls).toBeUndefined();
        expect(result.usage).toEqual({ promptTokens: 100, completionTokens: 50 });
    });

    it('converts a tool_use response', () => {
        const anthropicResp: any = {
            id: 'msg_2',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'tool_use', id: 'toolu_01', name: 'query_telemetry', input: { eventId: 'RT0005' } }
            ],
            model: 'claude-opus-4-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 200, output_tokens: 30 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);

        expect(result.content).toBe('');
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0]).toEqual({
            id: 'toolu_01',
            type: 'function',
            function: { name: 'query_telemetry', arguments: '{"eventId":"RT0005"}' }
        });
        expect(result.assistantMessage.tool_calls).toHaveLength(1);
    });

    it('converts a mixed text + tool_use response', () => {
        const anthropicResp: any = {
            id: 'msg_3',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'text', text: 'Let me query...' },
                { type: 'tool_use', id: 'toolu_02', name: 'get_event_catalog', input: {} }
            ],
            model: 'claude-opus-4-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 150, output_tokens: 40 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);

        expect(result.content).toBe('Let me query...');
        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].function.name).toBe('get_event_catalog');
    });

    it('handles multiple tool_use blocks', () => {
        const anthropicResp: any = {
            id: 'msg_4',
            type: 'message',
            role: 'assistant',
            content: [
                { type: 'tool_use', id: 't1', name: 'tool_a', input: { x: 1 } },
                { type: 'tool_use', id: 't2', name: 'tool_b', input: { y: 2 } }
            ],
            model: 'claude-opus-4-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 100, output_tokens: 20 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.toolCalls).toHaveLength(2);
        expect(result.toolCalls![0].id).toBe('t1');
        expect(result.toolCalls![1].id).toBe('t2');
    });

    it('handles missing usage gracefully', () => {
        const anthropicResp: any = {
            id: 'msg_5',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Ok.' }],
            model: 'claude-opus-4-5',
            stop_reason: 'end_turn'
            // usage missing
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.usage).toEqual({ promptTokens: 0, completionTokens: 0 });
    });

    it('returns empty content and no toolCalls for empty content array', () => {
        const anthropicResp: any = {
            id: 'msg_6',
            type: 'message',
            role: 'assistant',
            content: [],
            model: 'claude-opus-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 5 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.content).toBe('');
        expect(result.toolCalls).toBeUndefined();
    });

    it('maps end_turn stop_reason to stop finishReason', () => {
        const anthropicResp: any = {
            id: 'msg_7',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Done.' }],
            model: 'claude-opus-4-5',
            stop_reason: 'end_turn',
            usage: { input_tokens: 50, output_tokens: 10 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.finishReason).toBe('stop');
    });

    it('maps tool_use stop_reason to tool_calls finishReason', () => {
        const anthropicResp: any = {
            id: 'msg_8',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'tool_use', id: 't1', name: 'query_telemetry', input: {} }],
            model: 'claude-opus-4-5',
            stop_reason: 'tool_use',
            usage: { input_tokens: 50, output_tokens: 10 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.finishReason).toBe('tool_calls');
    });

    it('maps max_tokens stop_reason to length finishReason', () => {
        const anthropicResp: any = {
            id: 'msg_9',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: '{"summary": "truncated...' }],
            model: 'claude-opus-4-5',
            stop_reason: 'max_tokens',
            usage: { input_tokens: 5000, output_tokens: 4096 }
        };

        const result = translateResponseFromAnthropic(anthropicResp);
        expect(result.finishReason).toBe('length');
    });
});

// ─── createAnthropicProvider (integration with mocked fetch) ─────────────────

describe('createAnthropicProvider', () => {
    const config: AnthropicProviderConfig = {
        apiKey: 'test-key-abc',
        model: 'claude-opus-4-5'
    };

    function mockSuccessResponse(content: any[]) {
        mockFetch.mockResolvedValueOnce({
            ok: true,
            json: async () => ({
                id: 'msg_test',
                type: 'message',
                role: 'assistant',
                content,
                model: 'claude-opus-4-5',
                stop_reason: 'end_turn',
                usage: { input_tokens: 100, output_tokens: 50 }
            })
        });
    }

    it('exposes modelName from config', () => {
        const provider = createAnthropicProvider({ apiKey: 'key', model: 'claude-sonnet-4-5' });
        expect(provider.modelName).toBe('claude-sonnet-4-5');
    });

    it('makes a POST request to the Anthropic API', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Done.' }]);

        const provider = createAnthropicProvider(config);
        await provider.chat([{ role: 'user', content: 'Hello' }], {});

        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url, init] = mockFetch.mock.calls[0];
        expect(url).toBe('https://api.anthropic.com/v1/messages');
        expect(init.method).toBe('POST');
        expect(init.headers['x-api-key']).toBe('test-key-abc');
        expect(init.headers['anthropic-version']).toBe('2023-06-01');
    });

    it('sends the correct request body with model and max_tokens', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Done.' }]);

        const provider = createAnthropicProvider(config);
        await provider.chat([{ role: 'user', content: 'Hello' }], { maxTokens: 2048 });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.model).toBe('claude-opus-4-5');
        expect(body.max_tokens).toBe(2048);
    });

    it('extracts system message to top-level system param', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Done.' }]);

        const provider = createAnthropicProvider(config);
        await provider.chat([
            { role: 'system', content: 'You are an agent.' },
            { role: 'user', content: 'Go.' }
        ], {});

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.system).toBe('You are an agent.');
        expect(body.messages).toHaveLength(1);
        expect(body.messages[0]).toEqual({ role: 'user', content: 'Go.' });
    });

    it('sends tools in Anthropic format when provided', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Done.' }]);

        const tools: OpenAIToolDef[] = [{
            type: 'function',
            function: { name: 'query', description: 'Run a query', parameters: { type: 'object', properties: {} } }
        }];

        const provider = createAnthropicProvider(config);
        await provider.chat([{ role: 'user', content: 'Go.' }], { tools });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.tools).toHaveLength(1);
        expect(body.tools[0].name).toBe('query');
        expect(body.tools[0].input_schema).toBeDefined();
    });

    it('does not send tools key when tools array is empty', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Done.' }]);

        const provider = createAnthropicProvider(config);
        await provider.chat([{ role: 'user', content: 'Go.' }], { tools: [] });

        const body = JSON.parse(mockFetch.mock.calls[0][1].body);
        expect(body.tools).toBeUndefined();
    });

    it('returns text content from response', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Telemetry looks healthy.' }]);

        const provider = createAnthropicProvider(config);
        const result = await provider.chat([{ role: 'user', content: 'Check.' }], {});

        expect(result.content).toBe('Telemetry looks healthy.');
        expect(result.toolCalls).toBeUndefined();
    });

    it('returns tool calls from response', async () => {
        mockSuccessResponse([{
            type: 'tool_use',
            id: 'toolu_999',
            name: 'get_event_catalog',
            input: { status: 'error' }
        }]);

        const provider = createAnthropicProvider(config);
        const result = await provider.chat([{ role: 'user', content: 'Check errors.' }], {});

        expect(result.toolCalls).toHaveLength(1);
        expect(result.toolCalls![0].id).toBe('toolu_999');
        expect(result.toolCalls![0].function.name).toBe('get_event_catalog');
        expect(JSON.parse(result.toolCalls![0].function.arguments)).toEqual({ status: 'error' });
    });

    it('uses a custom endpoint when provided', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Ok.' }]);

        const provider = createAnthropicProvider({
            ...config,
            endpoint: 'https://my-proxy.contoso.com'
        });
        await provider.chat([{ role: 'user', content: 'Hi.' }], {});

        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe('https://my-proxy.contoso.com/v1/messages');
    });

    it('uses a custom anthropicVersion when provided', async () => {
        mockSuccessResponse([{ type: 'text', text: 'Ok.' }]);

        const provider = createAnthropicProvider({
            ...config,
            anthropicVersion: '2024-01-01'
        });
        await provider.chat([{ role: 'user', content: 'Hi.' }], {});

        const init = mockFetch.mock.calls[0][1];
        expect(init.headers['anthropic-version']).toBe('2024-01-01');
    });

    it('throws a clear error when the API returns non-ok status', async () => {
        mockFetch.mockResolvedValueOnce({
            ok: false,
            status: 401,
            text: async () => '{"error":{"type":"authentication_error","message":"Invalid API key"}}'
        });

        const provider = createAnthropicProvider(config);
        await expect(provider.chat([{ role: 'user', content: 'Hi.' }], {}))
            .rejects.toThrow('Anthropic API error 401');
    });

    it('throws when API call itself rejects (network error)', async () => {
        mockFetch.mockRejectedValueOnce(new Error('Network unreachable'));

        const provider = createAnthropicProvider(config);
        await expect(provider.chat([{ role: 'user', content: 'Hi.' }], {}))
            .rejects.toThrow('Network unreachable');
    });
});
