/**
 * Tests for AgentMonitoringSetupProvider
 */

// Mock vscode BEFORE imports
jest.mock('vscode', () => ({
    Uri: {
        joinPath: jest.fn((...args: any[]) => ({
            toString: () => args.join('/'),
            with: jest.fn(),
            fsPath: args.join('/'),
        })),
        file: jest.fn((p: string) => ({
            fsPath: p,
            toString: () => `file://${p}`,
        })),
    },
    ViewColumn: { One: 1 },
    window: {
        createWebviewPanel: jest.fn(),
        activeTextEditor: undefined,
        showTextDocument: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    workspace: {
        workspaceFolders: [{ uri: { fsPath: '/test/workspace' } }],
    },
    commands: {
        executeCommand: jest.fn(),
    },
}), { virtual: true });

jest.mock('../services/mcpInstaller', () => ({
    getMCPStatus: jest.fn(),
    MCPStatus: {},
}));

jest.mock('child_process', () => ({
    exec: jest.fn(),
}));

jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
}));

import * as vscode from 'vscode';
import * as fs from 'fs';
import { AgentMonitoringSetupProvider } from '../webviews/AgentMonitoringSetupProvider';
import { getMCPStatus } from '../services/mcpInstaller';

describe('AgentMonitoringSetupProvider', () => {
    let provider: AgentMonitoringSetupProvider;
    let mockPanel: any;
    let messageHandler: (msg: any) => Promise<void>;
    let mockExtensionUri: any;
    let mockOutputChannel: any;

    beforeEach(() => {
        jest.clearAllMocks();

        mockExtensionUri = {
            toString: () => 'file:///extension/path',
            fsPath: '/extension/path',
        };

        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
        };

        mockPanel = {
            webview: {
                html: '',
                postMessage: jest.fn(),
                onDidReceiveMessage: jest.fn((handler: any) => {
                    messageHandler = handler;
                    return { dispose: jest.fn() };
                }),
            },
            reveal: jest.fn(),
            dispose: jest.fn(),
            onDidDispose: jest.fn((callback: any) => {
                mockPanel._onDidDisposeCallback = callback;
                return { dispose: jest.fn() };
            }),
        };

        (vscode.window.createWebviewPanel as jest.Mock).mockReturnValue(mockPanel);

        provider = new AgentMonitoringSetupProvider(mockExtensionUri, mockOutputChannel);
    });

    afterEach(() => {
        provider.dispose();
    });

    describe('show()', () => {
        it('should create webview panel', async () => {
            await provider.show();

            expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
                'bcTelemetryBuddy.agentMonitoringSetup',
                'BC Telemetry Buddy - Agent Monitoring Setup (Preview)',
                expect.anything(),
                expect.objectContaining({
                    enableScripts: true,
                    retainContextWhenHidden: true,
                })
            );
        });

        it('should set HTML content on webview', async () => {
            await provider.show();
            expect(mockPanel.webview.html).toBeTruthy();
            expect(mockPanel.webview.html).toContain('Agent Monitoring Setup');
            expect(mockPanel.webview.html).toContain('Prerequisites');
        });

        it('should register message handler', async () => {
            await provider.show();
            expect(mockPanel.webview.onDidReceiveMessage).toHaveBeenCalled();
        });

        it('should reveal existing panel if already shown', async () => {
            await provider.show();
            await provider.show();
            expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
            expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
        });
    });

    describe('message handlers', () => {
        beforeEach(async () => {
            await provider.show();
        });

        describe('checkPrerequisites', () => {
            it('should report when all prerequisites are met', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify({ agents: { llm: {} } }));
                (getMCPStatus as jest.Mock).mockResolvedValue({
                    installed: true,
                    version: '2.0.0',
                    inPath: true,
                    globalPath: '/usr/bin/bctb-mcp',
                });

                await messageHandler({ type: 'checkPrerequisites' });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'prerequisites',
                        hasWorkspace: true,
                        hasConfig: true,
                        mcpInstalled: true,
                        mcpVersion: '2.0.0',
                        hasAgentsConfig: true,
                    })
                );
            });

            it('should report missing config', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);
                (getMCPStatus as jest.Mock).mockResolvedValue({
                    installed: false,
                    version: null,
                    inPath: false,
                    globalPath: null,
                });

                await messageHandler({ type: 'checkPrerequisites' });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'prerequisites',
                        hasWorkspace: true,
                        hasConfig: false,
                        mcpInstalled: false,
                    })
                );
            });
        });

        describe('loadConfig', () => {
            it('should load existing config', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                const mockConfig = { tenantId: 'test', agents: { llm: { provider: 'azure-openai' } } };
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(mockConfig));

                await messageHandler({ type: 'loadConfig' });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                    type: 'currentConfig',
                    config: mockConfig,
                });
            });

            it('should return empty config on error', async () => {
                (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('ENOENT'); });

                await messageHandler({ type: 'loadConfig' });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                    type: 'currentConfig',
                    config: {},
                });
            });
        });

        describe('saveLLMConfig', () => {
            it('should save LLM config to .bctb-config.json', async () => {
                const existing = { tenantId: 'test' };
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existing));

                const llmConfig = { provider: 'azure-openai', endpoint: 'https://test.openai.azure.com/', deployment: 'gpt-4o' };
                await messageHandler({ type: 'saveLLMConfig', llmConfig });

                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('.bctb-config.json'),
                    expect.stringContaining('"agents"'),
                    'utf-8'
                );
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                    type: 'llmConfigSaved',
                    success: true,
                });
            });

            it('should report errors gracefully', async () => {
                (fs.readFileSync as jest.Mock).mockImplementation(() => { throw new Error('oops'); });

                await messageHandler({ type: 'saveLLMConfig', llmConfig: {} });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'llmConfigSaved',
                        success: false,
                    })
                );
            });
        });

        describe('createAgent', () => {
            it('should create agent directory structure', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'createAgent',
                    agentName: 'test-monitor',
                    instruction: 'Monitor errors',
                });

                expect(fs.mkdirSync).toHaveBeenCalledWith(
                    expect.stringContaining('agents'),
                    expect.objectContaining({ recursive: true })
                );
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('instruction.md'),
                    'Monitor errors',
                    'utf-8'
                );
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('state.json'),
                    expect.stringContaining('"agentName": "test-monitor"'),
                    'utf-8'
                );
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'agentCreated',
                        success: true,
                        agentName: 'test-monitor',
                    })
                );
            });

            it('should report error when no workspace open', async () => {
                // Temporarily override workspace folders
                const origFolders = vscode.workspace.workspaceFolders;
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: undefined,
                    configurable: true,
                });

                await messageHandler({
                    type: 'createAgent',
                    agentName: 'test-monitor',
                    instruction: 'Monitor errors',
                });

                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'agentCreated',
                        success: false,
                    })
                );

                // Restore
                Object.defineProperty(vscode.workspace, 'workspaceFolders', {
                    value: origFolders,
                    configurable: true,
                });
            });
        });

        describe('saveActionsConfig', () => {
            it('should save actions to agents section', async () => {
                const existing = { tenantId: 'test', agents: { llm: { provider: 'azure-openai' } } };
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existing));

                const actionsConfig = { 'teams-webhook': { url: 'https://webhook.test' } };
                await messageHandler({ type: 'saveActionsConfig', actionsConfig });

                const writtenConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
                expect(writtenConfig.agents.actions).toEqual(actionsConfig);
                expect(writtenConfig.agents.llm.provider).toBe('azure-openai'); // Preserved
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                    type: 'actionsConfigSaved',
                    success: true,
                });
            });
        });

        describe('saveDefaultsConfig', () => {
            it('should save defaults to agents section', async () => {
                const existing = { agents: { llm: {}, actions: {} } };
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (fs.readFileSync as jest.Mock).mockReturnValue(JSON.stringify(existing));

                const defaultsConfig = {
                    maxToolCalls: 25,
                    maxTokens: 4096,
                    contextWindowRuns: 5,
                    resolvedIssueTTLDays: 30,
                    toolScope: 'read-only',
                };
                await messageHandler({ type: 'saveDefaultsConfig', defaultsConfig });

                const writtenConfig = JSON.parse((fs.writeFileSync as jest.Mock).mock.calls[0][1]);
                expect(writtenConfig.agents.defaults).toEqual(defaultsConfig);
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith({
                    type: 'defaultsConfigSaved',
                    success: true,
                });
            });
        });

        describe('copyPipeline', () => {
            it('should copy GitHub Actions template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'github-actions' });

                expect(fs.mkdirSync).toHaveBeenCalledWith(
                    expect.stringContaining('.github'),
                    expect.objectContaining({ recursive: true })
                );
                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('telemetry-agent.yml'),
                    expect.stringContaining('Telemetry Monitoring Agents'),
                    'utf-8'
                );
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pipelineCopied',
                        success: true,
                        pipelineType: 'github-actions',
                    })
                );
            });

            it('should copy Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'azure-devops' });

                expect(fs.writeFileSync).toHaveBeenCalledWith(
                    expect.stringContaining('azure-pipelines-agents.yml'),
                    expect.stringContaining('bctb-secrets'),
                    'utf-8'
                );
            });

            it('should use Anthropic key when llmProvider is anthropic (GitHub Actions)', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'copyPipeline',
                    pipelineType: 'github-actions',
                    pipelineOptions: { llmProvider: 'anthropic' }
                });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('ANTHROPIC_API_KEY');
                expect(writtenContent).not.toContain('AZURE_OPENAI_KEY');
            });

            it('should use Azure OpenAI key when llmProvider is azure-openai (Azure DevOps)', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'copyPipeline',
                    pipelineType: 'azure-devops',
                    pipelineOptions: { llmProvider: 'azure-openai' }
                });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                // env block should have AZURE_OPENAI_KEY and NOT ANTHROPIC_API_KEY
                const envBlock = writtenContent.split('displayName: "Run all agents"')[1];
                expect(envBlock).toContain('AZURE_OPENAI_KEY');
                expect(envBlock).not.toContain('ANTHROPIC_API_KEY');
            });

            it('should use Anthropic key when llmProvider is anthropic (Azure DevOps)', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'copyPipeline',
                    pipelineType: 'azure-devops',
                    pipelineOptions: { llmProvider: 'anthropic' }
                });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                // env block should have ANTHROPIC_API_KEY and NOT AZURE_OPENAI_KEY
                const envBlock = writtenContent.split('displayName: "Run all agents"')[1];
                expect(envBlock).toContain('ANTHROPIC_API_KEY');
                expect(envBlock).not.toContain('AZURE_OPENAI_KEY');
                // variables section should set AZURE_OPENAI_KEY to empty
                expect(writtenContent).toContain("value: ''");
            });

            it('should use custom branch name in Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'copyPipeline',
                    pipelineType: 'azure-devops',
                    pipelineOptions: { branchName: 'master' }
                });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('include: [master]');
                expect(writtenContent).toContain('HEAD:master');
                expect(writtenContent).not.toContain('HEAD:main');
            });

            it('should use custom variable group name in Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({
                    type: 'copyPipeline',
                    pipelineType: 'azure-devops',
                    pipelineOptions: { variableGroupName: 'my-custom-secrets' }
                });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('group: my-custom-secrets');
                expect(writtenContent).not.toContain('bctb-secrets');
            });

            it('should include @latest in npm install command', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'azure-devops' });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('bc-telemetry-buddy-mcp@latest');
            });

            it('should include BCTB_WORKSPACE_PATH in Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'azure-devops' });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('BCTB_WORKSPACE_PATH');
                expect(writtenContent).toContain('$(Build.SourcesDirectory)');
            });

            it('should use inline export for npm install in Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'azure-devops' });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('export npm_config_prefix=$HOME/.npm-global');
                expect(writtenContent).toContain('export PATH=$HOME/.npm-global/bin:$PATH');
            });

            it('should use trigger: none in Azure DevOps template', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(false);

                await messageHandler({ type: 'copyPipeline', pipelineType: 'azure-devops' });

                const writtenContent = (fs.writeFileSync as jest.Mock).mock.calls[0][1] as string;
                expect(writtenContent).toContain('trigger: none');
            });

            it('should prompt when pipeline file already exists', async () => {
                (fs.existsSync as jest.Mock).mockReturnValue(true);
                (vscode.window.showWarningMessage as jest.Mock).mockResolvedValue('Cancel');

                await messageHandler({ type: 'copyPipeline', pipelineType: 'github-actions' });

                expect(vscode.window.showWarningMessage).toHaveBeenCalled();
                expect(mockPanel.webview.postMessage).toHaveBeenCalledWith(
                    expect.objectContaining({
                        type: 'pipelineCopied',
                        success: true,
                        skipped: true,
                    })
                );
            });
        });

        describe('openSetupWizard', () => {
            it('should execute bctb.setupWizard command', async () => {
                await messageHandler({ type: 'openSetupWizard' });
                expect(vscode.commands.executeCommand).toHaveBeenCalledWith('bctb.setupWizard');
            });
        });

        describe('openFile', () => {
            it('should open the specified file', async () => {
                await messageHandler({ type: 'openFile', filePath: '/test/workspace/agents/test/instruction.md' });
                expect(vscode.window.showTextDocument).toHaveBeenCalled();
            });
        });
    });

    describe('HTML content', () => {
        it('should contain all 8 wizard steps', async () => {
            await provider.show();
            const html = mockPanel.webview.html;
            expect(html).toContain('step-1');
            expect(html).toContain('step-2');
            expect(html).toContain('step-3');
            expect(html).toContain('step-4');
            expect(html).toContain('step-5');
            expect(html).toContain('step-6');
            expect(html).toContain('step-7');
            expect(html).toContain('step-8');
        });

        it('should contain agent template data', async () => {
            await provider.show();
            const html = mockPanel.webview.html;
            expect(html).toContain('appsource-validation');
            expect(html).toContain('performance-monitoring');
            expect(html).toContain('error-rate-monitoring');
            expect(html).toContain('post-deployment-check');
        });

        it('should contain LLM provider options', async () => {
            await provider.show();
            const html = mockPanel.webview.html;
            expect(html).toContain('azure-openai');
            expect(html).toContain('anthropic');
        });

        it('should contain pipeline templates', async () => {
            await provider.show();
            const html = mockPanel.webview.html;
            expect(html).toContain('GitHub Actions');
            expect(html).toContain('Azure DevOps');
        });

        it('should contain action types', async () => {
            await provider.show();
            const html = mockPanel.webview.html;
            expect(html).toContain('Teams Webhook');
            expect(html).toContain('Email (SMTP)');
            expect(html).toContain('Microsoft Graph');
            expect(html).toContain('Generic Webhook');
            expect(html).toContain('Pipeline Trigger');
        });
    });

    describe('dispose()', () => {
        it('should dispose panel and subscriptions', async () => {
            await provider.show();
            provider.dispose();
            expect(mockPanel.dispose).toHaveBeenCalled();
        });
    });
});
