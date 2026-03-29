// Mock vscode module with chat participant APIs
jest.mock('vscode', () => ({
    chat: {
        createChatParticipant: jest.fn()
    },
    lm: {
        selectChatModels: jest.fn(),
        invokeTool: jest.fn(),
        tools: [
            { name: 'mcp_bc_telemetry__query_telemetry', description: 'Execute KQL queries', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_event_catalog', description: 'List BC telemetry events', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_event_schema', description: 'Get event schema', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_tenant_mapping', description: 'Map company names to tenant IDs', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_saved_queries', description: 'List saved queries', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__search_queries', description: 'Search saved queries', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__save_query', description: 'Save a query', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_event_field_samples', description: 'Analyze event fields', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_recommendations', description: 'Get recommendations', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_categories', description: 'Get event categories', tags: ['mcp'] },
            { name: 'mcp_bc_telemetry__get_external_queries', description: 'Fetch external query examples', tags: ['mcp'] },
            { name: 'some_other_tool', description: 'Not a BC Telemetry tool', tags: [] }
        ] // Array of registered tools - includes MCP tools with mcp_bc_telemetry__ prefix
    },
    LanguageModelChatMessage: {
        User: jest.fn((content: string) => ({ role: 'user', content })),
        Assistant: jest.fn((content: string) => ({ role: 'assistant', content }))
    },
    LanguageModelTextPart: class MockLanguageModelTextPart {
        constructor(public value: string) { }
    },
    LanguageModelToolCallPart: class MockLanguageModelToolCallPart {
        constructor(public name: string, public input: any) { }
    },
    LanguageModelChatToolMode: {
        Auto: 'auto'
    },
    ChatRequestTurn: class MockChatRequestTurn {
        constructor(public prompt: string) { }
    },
    ChatResponseTurn: class MockChatResponseTurn {
        constructor(public response: any[]) { }
    },
    ChatResponseMarkdownPart: class MockChatResponseMarkdownPart {
        constructor(public value: { value: string }) { }
    },
    Uri: {
        joinPath: jest.fn((uri: any, ...paths: string[]) => ({
            fsPath: paths.join('/')
        }))
    }
}), { virtual: true });

import { registerChatParticipant } from '../chatParticipant';

const vscode = require('vscode');

describe('Chat Participant', () => {
    let mockOutputChannel: any;
    let mockContext: any;
    let createdParticipant: any;

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        };

        // Mock extension context
        mockContext = {
            subscriptions: [],
            extensionUri: { fsPath: '/test/extension' }
        };

        // Capture created participant
        (vscode.chat.createChatParticipant as jest.Mock).mockImplementation((id, handler) => {
            createdParticipant = {
                id,
                handler,
                iconPath: undefined
            };
            return createdParticipant;
        });
    });

    describe('registerChatParticipant', () => {
        it('should register chat participant with correct ID', () => {
            registerChatParticipant(mockContext, mockOutputChannel);

            expect(vscode.chat.createChatParticipant).toHaveBeenCalledWith(
                'bc-telemetry-buddy',
                expect.any(Function)
            );
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                'Registering BC Telemetry Buddy chat participant...'
            );
        });

        it('should set icon path to waldo.png', () => {
            registerChatParticipant(mockContext, mockOutputChannel);

            expect(vscode.Uri.joinPath).toHaveBeenCalledWith(
                mockContext.extensionUri,
                'images',
                'waldo.png'
            );
            expect(createdParticipant.iconPath).toBeDefined();
        });

        it('should add participant to context subscriptions', () => {
            registerChatParticipant(mockContext, mockOutputChannel);

            expect(mockContext.subscriptions).toContain(createdParticipant);
        });

        it('should log successful registration', () => {
            registerChatParticipant(mockContext, mockOutputChannel);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '✓ Chat participant @bc-telemetry-buddy registered'
            );
        });
    });

    describe('Chat Participant Handler', () => {
        let handler: any;
        let mockRequest: any;
        let mockChatContext: any;
        let mockStream: any;
        let mockToken: any;

        beforeEach(() => {
            registerChatParticipant(mockContext, mockOutputChannel);
            handler = createdParticipant.handler;

            // Mock request with model (request.model is the model the user is chatting with)
            mockRequest = {
                prompt: 'Show me all errors from the last 24 hours',
                command: undefined,
                references: [],
                toolReferences: [],
                model: {
                    id: 'gpt-4o',
                    name: 'GPT-4o',
                    sendRequest: jest.fn().mockResolvedValue({
                        stream: (async function* () {
                            yield new (vscode.LanguageModelTextPart as any)('Default response');
                        })()
                    })
                }
            };

            // Mock chat context
            mockChatContext = {
                history: []
            };

            // Mock stream
            mockStream = {
                markdown: jest.fn(),
                progress: jest.fn(),
                button: jest.fn()
            };

            // Mock token
            mockToken = {
                isCancellationRequested: false,
                onCancellationRequested: jest.fn()
            };
        });

        it('should log user query', async () => {
            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[@bc-telemetry-buddy] User query: Show me all errors from the last 24 hours'
            );
        });

        it('should include question coaching in system prompt', async () => {
            const mockModel = {
                id: 'gpt-4o',
                name: 'GPT-4o',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Test response');
                    })()
                })
            };

            mockRequest.model = mockModel;

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            const messages = mockModel.sendRequest.mock.calls[0][0];
            const systemPrompt = messages[0].content;

            // Question Coaching (Step 4a)
            expect(systemPrompt).toContain('Question Coaching');
            expect(systemPrompt).toContain('Rephrase the question');
            expect(systemPrompt).toContain('Suggest investigation paths');
        });

        it('should include answer validation in system prompt', async () => {
            const mockModel = {
                id: 'gpt-4o',
                name: 'GPT-4o',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Test response');
                    })()
                })
            };

            mockRequest.model = mockModel;

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            const messages = mockModel.sendRequest.mock.calls[0][0];
            const systemPrompt = messages[0].content;

            // Challenge & Validate (Step 6a)
            expect(systemPrompt).toContain('Challenge Your Own Output');
            expect(systemPrompt).toContain('State your assumptions');
            expect(systemPrompt).toContain('Flag limitations honestly');
            expect(systemPrompt).toContain('Propose follow-up questions');
        });

        it('should call language model with system prompt and user query', async () => {
            const mockModel = {
                id: 'gpt-4o',
                name: 'GPT-4o',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Test response');
                    })()
                })
            };

            mockRequest.model = mockModel;

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockModel.sendRequest).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ content: expect.stringContaining('BC Telemetry Buddy') }),
                    expect.objectContaining({ content: 'Show me all errors from the last 24 hours' })
                ]),
                expect.objectContaining({
                    justification: expect.stringContaining('BC Telemetry Buddy')
                }),
                mockToken
            );
        });

        it('should stream response fragments', async () => {
            const mockModel = {
                id: 'gpt-4o',
                name: 'GPT-4o',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Fragment 1 ');
                        yield new (vscode.LanguageModelTextPart as any)('Fragment 2');
                    })()
                })
            };

            mockRequest.model = mockModel;

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockStream.markdown).toHaveBeenCalledWith('Fragment 1 ');
            expect(mockStream.markdown).toHaveBeenCalledWith('Fragment 2');
        });

        it('should include chat history in messages', async () => {
            const mockModel = {
                id: 'gpt-4o',
                name: 'GPT-4o',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Response');
                    })()
                })
            };

            mockRequest.model = mockModel;

            // Add history
            mockChatContext.history = [
                new (vscode.ChatRequestTurn as any)('Previous question'),
                new (vscode.ChatResponseTurn as any)([
                    new (vscode.ChatResponseMarkdownPart as any)({ value: 'Previous answer' })
                ])
            ];

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockModel.sendRequest).toHaveBeenCalledWith(
                expect.arrayContaining([
                    expect.objectContaining({ content: 'Previous question' }),
                    expect.objectContaining({ content: 'Previous answer' })
                ]),
                expect.any(Object),
                mockToken
            );
        });

        it('should handle errors gracefully', async () => {
            const error = new Error('Test error');
            mockRequest.model.sendRequest = jest.fn().mockRejectedValue(error);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[@bc-telemetry-buddy] Error: Test error'
            );
            expect(mockStream.markdown).toHaveBeenCalledWith(
                expect.stringContaining('Error: Test error')
            );
        });

        it('should log completion with iteration count', async () => {
            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/^\[@bc-telemetry-buddy\] Response complete \(\d+ iterations?\)$/)
            );
        });
    });
});
