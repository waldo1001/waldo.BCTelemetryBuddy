/**
 * Anthropic/Claude LLM provider for the agent runtime.
 *
 * Translates between the runtime's internal OpenAI-style message/tool format
 * and the Anthropic Messages API format. The runtime never sees Anthropic
 * types directly — all translation happens at this boundary.
 *
 * API reference: https://docs.anthropic.com/en/api/messages
 */

import {
    ChatMessage,
    ChatOptions,
    ChatResponse,
    LLMProvider,
    OpenAIToolDef,
    ToolCall
} from '../types.js';

// ─── Anthropic API types (internal, not exported) ────────────────────────────

interface AnthropicTool {
    name: string;
    description: string;
    input_schema: Record<string, any>;
}

interface AnthropicTextBlock {
    type: 'text';
    text: string;
}

interface AnthropicToolUseBlock {
    type: 'tool_use';
    id: string;
    name: string;
    input: Record<string, any>;
}

interface AnthropicToolResultBlock {
    type: 'tool_result';
    tool_use_id: string;
    content: string;
}

type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock | AnthropicToolResultBlock;

interface AnthropicMessage {
    role: 'user' | 'assistant';
    content: string | AnthropicContentBlock[];
}

interface AnthropicRequest {
    model: string;
    max_tokens: number;
    system?: string;
    messages: AnthropicMessage[];
    tools?: AnthropicTool[];
}

interface AnthropicResponse {
    id: string;
    type: 'message';
    role: 'assistant';
    content: AnthropicContentBlock[];
    model: string;
    stop_reason: 'end_turn' | 'tool_use' | 'max_tokens' | string;
    usage: {
        input_tokens: number;
        output_tokens: number;
    };
}

// ─── Translation helpers ─────────────────────────────────────────────────────

/**
 * Convert OpenAI-style tool definitions to Anthropic's tool format.
 */
export function translateToolsToAnthropic(tools: OpenAIToolDef[]): AnthropicTool[] {
    return tools.map(t => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters
    }));
}

/**
 * Convert our internal ChatMessage[] (OpenAI-style) to Anthropic message format.
 *
 * Key differences handled here:
 *  - system messages → top-level `system` param (not in messages array)
 *  - assistant tool_calls → assistant content array with tool_use blocks
 *  - tool role messages → grouped into user messages with tool_result blocks
 *    (Anthropic requires all tool results from one turn in a single user message)
 */
export function translateMessagesToAnthropic(messages: ChatMessage[]): {
    system?: string;
    messages: AnthropicMessage[];
} {
    let system: string | undefined;
    const anthropicMessages: AnthropicMessage[] = [];
    let i = 0;

    while (i < messages.length) {
        const msg = messages[i];

        // System messages → top-level system param
        if (msg.role === 'system') {
            system = msg.content;
            i++;
            continue;
        }

        // Consecutive tool results → single user message with tool_result blocks
        if (msg.role === 'tool') {
            const toolResults: AnthropicToolResultBlock[] = [];
            while (i < messages.length && messages[i].role === 'tool') {
                toolResults.push({
                    type: 'tool_result',
                    tool_use_id: messages[i].tool_call_id!,
                    content: messages[i].content || ''
                });
                i++;
            }
            anthropicMessages.push({ role: 'user', content: toolResults });
            continue;
        }

        // Assistant with tool calls → content array with tool_use blocks
        if (msg.role === 'assistant') {
            if (msg.tool_calls && msg.tool_calls.length > 0) {
                const content: AnthropicContentBlock[] = [];
                if (msg.content) {
                    content.push({ type: 'text', text: msg.content });
                }
                for (const tc of msg.tool_calls) {
                    let input: Record<string, any> = {};
                    try {
                        input = JSON.parse(tc.function.arguments || '{}');
                    } catch {
                        input = {};
                    }
                    content.push({
                        type: 'tool_use',
                        id: tc.id,
                        name: tc.function.name,
                        input
                    });
                }
                anthropicMessages.push({ role: 'assistant', content });
            } else {
                anthropicMessages.push({
                    role: 'assistant',
                    content: msg.content || ''
                });
            }
            i++;
            continue;
        }

        // User messages (plain string content)
        anthropicMessages.push({
            role: 'user',
            content: msg.content || ''
        });
        i++;
    }

    return { system, messages: anthropicMessages };
}

/**
 * Convert an Anthropic API response back to our internal ChatResponse format.
 * Extracts text content and tool_use blocks, re-encodes tool inputs as JSON strings
 * so the runtime can work with them using its OpenAI-style ToolCall interface.
 */
export function translateResponseFromAnthropic(data: AnthropicResponse): ChatResponse {
    const toolCalls: ToolCall[] = [];
    let textContent = '';

    for (const block of data.content) {
        if (block.type === 'text') {
            textContent += block.text;
        } else if (block.type === 'tool_use') {
            toolCalls.push({
                id: block.id,
                type: 'function',
                function: {
                    name: block.name,
                    arguments: JSON.stringify(block.input)
                }
            });
        }
    }

    // Map Anthropic stop_reason to normalized finishReason
    const finishReason = data.stop_reason === 'end_turn' ? 'stop'
        : data.stop_reason === 'tool_use' ? 'tool_calls'
            : data.stop_reason === 'max_tokens' ? 'length'
                : data.stop_reason || undefined;

    return {
        content: textContent,
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        // assistantMessage stored in OpenAI format so the runtime/context.ts works unchanged
        assistantMessage: {
            role: 'assistant',
            content: textContent || undefined,
            tool_calls: toolCalls.length > 0 ? toolCalls : undefined
        },
        usage: {
            promptTokens: data.usage?.input_tokens || 0,
            completionTokens: data.usage?.output_tokens || 0
        },
        finishReason
    };
}

// ─── Provider factory ────────────────────────────────────────────────────────

export interface AnthropicProviderConfig {
    apiKey: string;
    model: string;                           // e.g. 'claude-opus-4-5'
    endpoint?: string;                        // default: https://api.anthropic.com
    anthropicVersion?: string;               // default: '2023-06-01'
}

/**
 * Create an LLMProvider backed by the Anthropic Messages API.
 *
 * Usage in .bctb-config.json:
 *
 *   "agents": {
 *     "llm": {
 *       "provider": "anthropic",
 *       "deployment": "claude-opus-4-5"
 *     }
 *   }
 *
 * Required env var: ANTHROPIC_API_KEY
 */
export function createAnthropicProvider(config: AnthropicProviderConfig): LLMProvider {
    const {
        apiKey,
        model,
        endpoint = 'https://api.anthropic.com',
        anthropicVersion = '2023-06-01'
    } = config;

    const url = `${endpoint}/v1/messages`;

    return {
        modelName: model,
        async chat(messages: ChatMessage[], options: ChatOptions): Promise<ChatResponse> {
            const { system, messages: anthropicMessages } = translateMessagesToAnthropic(messages);

            const body: AnthropicRequest = {
                model,
                max_tokens: options?.maxTokens || 32768,
                messages: anthropicMessages
            };

            if (system) {
                body.system = system;
            }

            if (options?.tools?.length) {
                body.tools = translateToolsToAnthropic(options.tools);
            }

            // Set up an AbortController so we can cancel the request on timeout.
            // This lets chatWithRetry retry rather than waiting for a hard gateway kill.
            const timeoutMs = options?.timeoutMs;
            const abortController = new AbortController();
            let timeoutId: ReturnType<typeof setTimeout> | undefined;
            if (timeoutMs) {
                timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
            }

            let response: Response;
            try {
                response = await fetch(url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'x-api-key': apiKey,
                        'anthropic-version': anthropicVersion
                    },
                    body: JSON.stringify(body),
                    signal: abortController.signal
                });
            } catch (fetchError: any) {
                // AbortError means our timeout fired — throw a labelled error so
                // chatWithRetry can identify it and schedule a retry.
                if (abortController.signal.aborted) {
                    throw new Error(`LLM request timed out after ${timeoutMs}ms`);
                }
                throw fetchError;
            } finally {
                if (timeoutId !== undefined) {
                    clearTimeout(timeoutId);
                }
            }

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Anthropic API error ${response.status}: ${errorText}`);
            }

            const data = await response.json() as AnthropicResponse;
            return translateResponseFromAnthropic(data);
        }
    };
}
