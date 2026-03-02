/**
 * Agent CLI commands — adds `agent` subcommand group to the bctb-mcp CLI.
 *
 * Commands:
 * - agent start <instruction> --name <name>   Create a new agent
 * - agent run <name> --once                   Run a single monitoring pass
 * - agent run-all --once                      Run all active agents
 * - agent list                                List all agents
 * - agent history <name> --limit <n>          Show run history
 * - agent pause <name>                        Pause an agent
 * - agent resume <name>                       Resume a paused agent
 *
 * Design:
 * - Separated from main CLI for SRP (agent concerns are isolated)
 * - Uses existing loadConfigFromFile for MCPConfig
 * - Reads raw config JSON for agents section (avoids modifying MCPConfig interface)
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { loadConfigFromFile, validateConfig } from '../config.js';
import { initializeServices } from '../tools/toolHandlers.js';
import { AgentContextManager } from './context.js';
import { ActionDispatcher } from './actions.js';
import { AgentRuntime } from './runtime.js';
import { AgentConfigSection, AgentRuntimeConfig, LLMProvider } from './types.js';
import { createAnthropicProvider } from './providers/anthropic.js';

/**
 * Resolve the config file path using the same logic as loadConfigFromFile.
 */
function resolveConfigPath(explicitPath?: string): string {
    if (explicitPath) return explicitPath;
    if (process.env.BCTB_WORKSPACE_PATH) {
        return path.join(process.env.BCTB_WORKSPACE_PATH, '.bctb-config.json');
    }
    return '.bctb-config.json';
}

/**
 * Load the agents section from raw config JSON.
 * MCPConfig is NOT modified — this is a separate concern.
 */
function loadAgentsConfig(configPath: string): AgentConfigSection {
    if (!fs.existsSync(configPath)) {
        throw new Error(`Config file not found: ${configPath}`);
    }
    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    const agentsConfig = rawConfig.agents as AgentConfigSection | undefined;
    if (!agentsConfig?.llm) {
        throw new Error(
            'No agents.llm section in config file. Add an "agents" section with LLM configuration.\n' +
            'See: https://github.com/waldo1001/waldo.BCTelemetryBuddy for agent setup instructions.'
        );
    }
    return agentsConfig;
}

/**
 * Create an LLMProvider from config + env vars.
 * Dispatches to the correct provider based on agents.llm.provider.
 *
 * Supported providers:
 *   - 'azure-openai' (default) — requires AZURE_OPENAI_KEY env var
 *   - 'anthropic'              — requires ANTHROPIC_API_KEY env var
 */
function createLLMProvider(agentsConfig: AgentConfigSection): LLMProvider {
    const provider = agentsConfig.llm.provider || 'azure-openai';

    // ─── Anthropic ────────────────────────────────────────────────────────────
    if (provider === 'anthropic') {
        const apiKey = process.env.ANTHROPIC_API_KEY || '';
        const model = process.env.ANTHROPIC_MODEL
            || agentsConfig.llm.model
            || agentsConfig.llm.deployment
            || 'claude-opus-4-5';

        if (!apiKey) throw new Error('Anthropic API key not set (set ANTHROPIC_API_KEY env var)');

        return createAnthropicProvider({
            apiKey,
            model,
            endpoint: agentsConfig.llm.endpoint  // optional; defaults to https://api.anthropic.com
        });
    }

    // ─── Azure OpenAI (default) ───────────────────────────────────────────────
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT || agentsConfig.llm.endpoint;
    const apiKey = process.env.AZURE_OPENAI_KEY || '';
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT || agentsConfig.llm.deployment;
    const apiVersion = agentsConfig.llm.apiVersion || '2024-10-21';

    if (!endpoint) throw new Error('Azure OpenAI endpoint not configured (set AZURE_OPENAI_ENDPOINT or agents.llm.endpoint)');
    if (!apiKey) throw new Error('Azure OpenAI API key not set (set AZURE_OPENAI_KEY env var)');
    if (!deployment) throw new Error('Azure OpenAI deployment not configured (set AZURE_OPENAI_DEPLOYMENT or agents.llm.deployment)');

    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    return {
        modelName: deployment,
        async chat(messages, options) {
            const body: any = {
                messages: messages.map(m => {
                    const msg: any = { role: m.role, content: m.content };
                    if (m.tool_calls) msg.tool_calls = m.tool_calls;
                    if (m.tool_call_id) msg.tool_call_id = m.tool_call_id;
                    return msg;
                })
            };

            if (options?.tools?.length) {
                body.tools = options.tools;
            }
            if (options?.maxTokens) {
                body.max_tokens = options.maxTokens;
            }

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'api-key': apiKey
                },
                body: JSON.stringify(body)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Azure OpenAI API error ${response.status}: ${errorText}`);
            }

            const data = await response.json() as any;
            const choice = data.choices[0];
            const message = choice.message;

            return {
                content: message.content || '',
                toolCalls: message.tool_calls || undefined,
                assistantMessage: {
                    role: 'assistant',
                    content: message.content || undefined,
                    tool_calls: message.tool_calls || undefined
                },
                usage: {
                    promptTokens: data.usage?.prompt_tokens || 0,
                    completionTokens: data.usage?.completion_tokens || 0
                }
            };
        }
    };
}

/**
 * Build an AgentRuntimeConfig from the agents config section.
 */
function buildRuntimeConfig(agentsConfig: AgentConfigSection): AgentRuntimeConfig {
    const llmProvider = createLLMProvider(agentsConfig);
    const retryDefaults = agentsConfig.defaults?.retry ?? {};
    return {
        llmProvider,
        maxToolCalls: agentsConfig.defaults?.maxToolCalls ?? 20,
        maxTokens: agentsConfig.defaults?.maxTokens ?? 4096,
        contextWindowRuns: agentsConfig.defaults?.contextWindowRuns ?? 5,
        toolScope: agentsConfig.defaults?.toolScope ?? 'read-only',
        retry: {
            maxRetries: retryDefaults.maxRetries ?? 10,
            initialDelayMs: retryDefaults.initialDelayMs ?? 2000,
            backoffMultiplier: retryDefaults.backoffMultiplier ?? 2,
            maxDelayMs: retryDefaults.maxDelayMs ?? 60000,
            retryableStatusCodes: [429, 529, 503]
        }
    };
}

/**
 * Register all agent subcommands on the given Commander program.
 */
export function registerAgentCommands(program: Command): void {
    const agent = program
        .command('agent')
        .description('Manage autonomous telemetry monitoring agents');

    // ─── agent start ─────────────────────────────────────────────────────────
    agent
        .command('start')
        .description('Create a new monitoring agent')
        .argument('<instruction>', 'Agent instruction (natural language)')
        .requiredOption('-n, --name <name>', 'Agent name (used as directory name)')
        .option('-c, --config <path>', 'Path to config file')
        .action((instruction: string, options: { name: string; config?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                const rawConfig = fs.existsSync(configPath)
                    ? JSON.parse(fs.readFileSync(configPath, 'utf-8'))
                    : {};

                const workspacePath = rawConfig.workspacePath
                    || process.env.BCTB_WORKSPACE_PATH
                    || process.cwd();

                const contextManager = new AgentContextManager(workspacePath);
                contextManager.createAgent(options.name, instruction);

                console.log(`✓ Created agent: ${options.name}`);
                console.log(`  Instruction: ${instruction.substring(0, 80)}${instruction.length > 80 ? '...' : ''}`);
                console.log(`  Directory: agents/${options.name}/`);
                console.log('\nNext steps:');
                console.log(`  1. Review: agents/${options.name}/instruction.md`);
                console.log(`  2. Run: bctb-mcp agent run ${options.name} --once`);
            } catch (error: any) {
                console.error(`✗ Failed to create agent: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent run ───────────────────────────────────────────────────────────
    agent
        .command('run')
        .description('Run a single monitoring pass for an agent')
        .argument('<name>', 'Agent name')
        .option('--once', 'Run once and exit (default)', true)
        .option('-c, --config <path>', 'Path to config file')
        .option('-p, --profile <name>', 'Profile name to use')
        .action(async (name: string, options: { config?: string; profile?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                const mcpConfig = loadConfigFromFile(options.config, options.profile);
                if (!mcpConfig) {
                    console.error('✗ No config file found. Run: bctb-mcp init');
                    process.exit(1);
                }

                const agentsConfig = loadAgentsConfig(configPath);
                const runtimeConfig = buildRuntimeConfig(agentsConfig);

                const services = initializeServices(mcpConfig, true);
                const { ToolHandlers } = await import('../tools/toolHandlers.js');
                const toolHandlers = new ToolHandlers(mcpConfig, services, true);

                const contextManager = new AgentContextManager(
                    mcpConfig.workspacePath,
                    runtimeConfig.contextWindowRuns,
                    agentsConfig.defaults?.resolvedIssueTTLDays
                );
                const actionDispatcher = new ActionDispatcher(agentsConfig.actions ?? {});

                const runtime = new AgentRuntime(toolHandlers, contextManager, actionDispatcher, runtimeConfig);

                console.log(`Running agent: ${name}...`);
                const runLog = await runtime.run(name);

                console.log(`\n✓ Run #${runLog.runId} completed in ${(runLog.durationMs / 1000).toFixed(1)}s`);
                console.log(`  Tool calls: ${runLog.llm.toolCallCount}`);
                console.log(`  Tokens: ${runLog.llm.totalTokens} (${runLog.llm.promptTokens} prompt + ${runLog.llm.completionTokens} completion)`);
                console.log(`  Findings: ${runLog.findings}`);
                if (runLog.actions.length > 0) {
                    console.log(`  Actions: ${runLog.actions.map(a => `${a.type}(${a.status})`).join(', ')}`);
                }
            } catch (error: any) {
                console.error(`✗ Agent run failed: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent run-all ───────────────────────────────────────────────────────
    agent
        .command('run-all')
        .description('Run all active agents')
        .option('--once', 'Run once and exit (default)', true)
        .option('-c, --config <path>', 'Path to config file')
        .option('-p, --profile <name>', 'Profile name to use')
        .action(async (options: { config?: string; profile?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                const mcpConfig = loadConfigFromFile(options.config, options.profile);
                if (!mcpConfig) {
                    console.error('✗ No config file found. Run: bctb-mcp init');
                    process.exit(1);
                }

                const agentsConfig = loadAgentsConfig(configPath);
                const runtimeConfig = buildRuntimeConfig(agentsConfig);

                const services = initializeServices(mcpConfig, true);
                const { ToolHandlers } = await import('../tools/toolHandlers.js');
                const toolHandlers = new ToolHandlers(mcpConfig, services, true);

                const contextManager = new AgentContextManager(
                    mcpConfig.workspacePath,
                    runtimeConfig.contextWindowRuns,
                    agentsConfig.defaults?.resolvedIssueTTLDays
                );
                const actionDispatcher = new ActionDispatcher(agentsConfig.actions ?? {});

                const agents = contextManager.listAgents().filter(a => a.status === 'active');

                if (agents.length === 0) {
                    console.log('No active agents found.');
                    return;
                }

                console.log(`Running ${agents.length} active agent(s)...\n`);

                const runtime = new AgentRuntime(toolHandlers, contextManager, actionDispatcher, runtimeConfig);

                let succeeded = 0;
                let failed = 0;

                for (const agent of agents) {
                    try {
                        console.log(`─── ${agent.name} ───`);
                        const runLog = await runtime.run(agent.name);
                        console.log(`  ✓ Run #${runLog.runId} completed in ${(runLog.durationMs / 1000).toFixed(1)}s`);
                        console.log(`    Tool calls: ${runLog.llm.toolCallCount}, Tokens: ${runLog.llm.totalTokens} (${runLog.llm.promptTokens}p + ${runLog.llm.completionTokens}c)`);
                        console.log(`    Findings: ${runLog.findings}`);
                        if (runLog.actions.length > 0) {
                            console.log(`    Actions: ${runLog.actions.map(a => `${a.type}(${a.status})`).join(', ')}`);
                        }
                        succeeded++;
                    } catch (error: any) {
                        console.error(`  ✗ Failed: ${error.message}`);
                        failed++;
                    }
                }

                console.log(`\nResults: ${succeeded} succeeded, ${failed} failed`);
                if (failed > 0) process.exit(1);
            } catch (error: any) {
                console.error(`✗ Run-all failed: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent list ──────────────────────────────────────────────────────────
    agent
        .command('list')
        .description('List all agents')
        .option('-c, --config <path>', 'Path to config file')
        .action((options: { config?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                let workspacePath: string;

                if (fs.existsSync(configPath)) {
                    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    workspacePath = rawConfig.workspacePath
                        || process.env.BCTB_WORKSPACE_PATH
                        || process.cwd();
                } else {
                    workspacePath = process.env.BCTB_WORKSPACE_PATH || process.cwd();
                }

                const contextManager = new AgentContextManager(workspacePath);
                const agents = contextManager.listAgents();

                if (agents.length === 0) {
                    console.log('No agents found. Create one with: bctb-mcp agent start "instruction" --name my-agent');
                    return;
                }

                console.log('Agents:\n');
                for (const a of agents) {
                    const statusIcon = a.status === 'active' ? '●' : '○';
                    const lastRun = a.lastRun ? a.lastRun.substring(0, 19) + 'Z' : 'never';
                    const issues = a.activeIssueCount === 1
                        ? '1 active issue'
                        : `${a.activeIssueCount} active issues`;
                    console.log(`  ${statusIcon} ${a.name.padEnd(25)} ${a.status.padEnd(8)} ${String(a.runCount).padStart(3)} runs    last: ${lastRun}    ${issues}`);
                }
            } catch (error: any) {
                console.error(`✗ Failed to list agents: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent history ───────────────────────────────────────────────────────
    agent
        .command('history')
        .description('Show run history for an agent')
        .argument('<name>', 'Agent name')
        .option('-l, --limit <n>', 'Number of runs to show', '5')
        .option('-c, --config <path>', 'Path to config file')
        .action((name: string, options: { limit: string; config?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                let workspacePath: string;

                if (fs.existsSync(configPath)) {
                    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    workspacePath = rawConfig.workspacePath
                        || process.env.BCTB_WORKSPACE_PATH
                        || process.cwd();
                } else {
                    workspacePath = process.env.BCTB_WORKSPACE_PATH || process.cwd();
                }

                const contextManager = new AgentContextManager(workspacePath);
                const runs = contextManager.getRunHistory(name, parseInt(options.limit, 10));

                if (runs.length === 0) {
                    console.log(`No run history for agent '${name}'.`);
                    return;
                }

                console.log(`Run History (${name}):\n`);
                for (const run of runs) {
                    const duration = `${(run.durationMs / 1000).toFixed(0)}s`;
                    const tools = run.llm.toolCallCount === 1
                        ? '1 tool'
                        : `${run.llm.toolCallCount} tools`;
                    console.log(`  #${run.runId}  ${run.timestamp.substring(0, 19)}Z  ${duration.padStart(4)}  ${tools.padStart(8)}  "${run.findings.substring(0, 60)}${run.findings.length > 60 ? '...' : ''}"`);
                }
            } catch (error: any) {
                console.error(`✗ Failed to get history: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent pause ─────────────────────────────────────────────────────────
    agent
        .command('pause')
        .description('Pause an agent')
        .argument('<name>', 'Agent name')
        .option('-c, --config <path>', 'Path to config file')
        .action((name: string, options: { config?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                let workspacePath: string;

                if (fs.existsSync(configPath)) {
                    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    workspacePath = rawConfig.workspacePath
                        || process.env.BCTB_WORKSPACE_PATH
                        || process.cwd();
                } else {
                    workspacePath = process.env.BCTB_WORKSPACE_PATH || process.cwd();
                }

                const contextManager = new AgentContextManager(workspacePath);

                if (!contextManager.agentExists(name)) {
                    console.error(`✗ Agent '${name}' not found.`);
                    process.exit(1);
                }

                contextManager.setAgentStatus(name, 'paused');
                console.log(`✓ Agent '${name}' paused. Use 'agent resume ${name}' to reactivate.`);
            } catch (error: any) {
                console.error(`✗ Failed to pause agent: ${error.message}`);
                process.exit(1);
            }
        });

    // ─── agent resume ────────────────────────────────────────────────────────
    agent
        .command('resume')
        .description('Resume a paused agent')
        .argument('<name>', 'Agent name')
        .option('-c, --config <path>', 'Path to config file')
        .action((name: string, options: { config?: string }) => {
            try {
                const configPath = resolveConfigPath(options.config);
                let workspacePath: string;

                if (fs.existsSync(configPath)) {
                    const rawConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    workspacePath = rawConfig.workspacePath
                        || process.env.BCTB_WORKSPACE_PATH
                        || process.cwd();
                } else {
                    workspacePath = process.env.BCTB_WORKSPACE_PATH || process.cwd();
                }

                const contextManager = new AgentContextManager(workspacePath);

                if (!contextManager.agentExists(name)) {
                    console.error(`✗ Agent '${name}' not found.`);
                    process.exit(1);
                }

                contextManager.setAgentStatus(name, 'active');
                console.log(`✓ Agent '${name}' resumed.`);
            } catch (error: any) {
                console.error(`✗ Failed to resume agent: ${error.message}`);
                process.exit(1);
            }
        });
}
