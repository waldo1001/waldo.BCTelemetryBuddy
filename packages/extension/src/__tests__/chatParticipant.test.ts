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

            // Mock request
            mockRequest = {
                prompt: 'Show me all errors from the last 24 hours',
                command: undefined,
                references: [],
                toolReferences: []
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
            // Mock no language model available
            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([]);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[@bc-telemetry-buddy] User query: Show me all errors from the last 24 hours'
            );
        });

        it('should warn if no Copilot model available', async () => {
            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([]);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockStream.markdown).toHaveBeenCalledWith(
                expect.stringContaining('No GitHub Copilot model available')
            );
        });

        it('should call language model with system prompt and user query', async () => {
            const mockModel = {
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Test response');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

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
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Fragment 1 ');
                        yield new (vscode.LanguageModelTextPart as any)('Fragment 2');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockStream.markdown).toHaveBeenCalledWith('Fragment 1 ');
            expect(mockStream.markdown).toHaveBeenCalledWith('Fragment 2');
        });

        it('should include chat history in messages', async () => {
            const mockModel = {
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Response');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

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
            (vscode.lm.selectChatModels as jest.Mock).mockRejectedValue(error);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                '[@bc-telemetry-buddy] Error: Test error'
            );
            expect(mockStream.markdown).toHaveBeenCalledWith(
                expect.stringContaining('Error: Test error')
            );
        });

        it('should log completion with iteration count', async () => {
            const mockModel = {
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Response');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

            await handler(mockRequest, mockChatContext, mockStream, mockToken);

            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringMatching(/^\[@bc-telemetry-buddy\] Response complete \(\d+ iterations?\)$/)
            );
        });
    });

    describe('System Prompt', () => {
        it('should include critical workflow steps', async () => {
            registerChatParticipant(mockContext, mockOutputChannel);
            const handler = createdParticipant.handler;

            const mockModel = {
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Response');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

            await handler(
                { prompt: 'test', command: undefined, references: [], toolReferences: [], toolInvocationToken: undefined },
                { history: [] },
                { markdown: jest.fn(), progress: jest.fn() },
                { isCancellationRequested: false }
            );

            const systemPrompt = (mockModel.sendRequest as jest.Mock).mock.calls[0][0][0].content;

            // Updated to match the new system prompt structure with intent detection
            expect(systemPrompt).toContain('Understanding User Intent');
            expect(systemPrompt).toContain('Identify the Customer');
            expect(systemPrompt).toContain('Understand the Events');
            expect(systemPrompt).toContain('Query and Analyze');
            expect(systemPrompt).toContain('mcp_bc_telemetry__get_event_catalog');
            expect(systemPrompt).toContain('mcp_bc_telemetry__get_event_schema');
        });

        it('should mention key MCP tools', async () => {
            registerChatParticipant(mockContext, mockOutputChannel);
            const handler = createdParticipant.handler;

            const mockModel = {
                id: 'gpt-4',
                name: 'GPT-4',
                sendRequest: jest.fn().mockResolvedValue({
                    stream: (async function* () {
                        yield new (vscode.LanguageModelTextPart as any)('Response');
                    })()
                })
            };

            (vscode.lm.selectChatModels as jest.Mock).mockResolvedValue([mockModel]);

            await handler(
                { prompt: 'test', command: undefined, references: [], toolReferences: [], toolInvocationToken: undefined },
                { history: [] },
                { markdown: jest.fn(), progress: jest.fn() },
                { isCancellationRequested: false }
            );

            const systemPrompt = (mockModel.sendRequest as jest.Mock).mock.calls[0][0][0].content;

            expect(systemPrompt).toContain('mcp_bc_telemetry__get_event_catalog');
            expect(systemPrompt).toContain('mcp_bc_telemetry__get_event_schema');
            expect(systemPrompt).toContain('mcp_bc_telemetry__get_tenant_mapping');
            expect(systemPrompt).toContain('mcp_bc_telemetry__query_telemetry');
            expect(systemPrompt).toContain('mcp_bc_telemetry__save_query');
            expect(systemPrompt).toContain('mcp_bc_telemetry__search_queries');
        });
    });
});
