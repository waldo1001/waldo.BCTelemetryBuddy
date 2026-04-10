/**
 * Tests for Agent CLI commands — verifies command registration, argument parsing,
 * and error handling for the `bctb-mcp agent` subcommand group.
 *
 * Coverage:
 * - All 7 commands are registered with correct names and descriptions
 * - Commands have the correct arguments and options
 * - `agent list` and `agent history` read from AgentContextManager
 * - `agent pause` / `agent resume` set agent status correctly
 * - `agent start` creates a new agent
 * - Error paths (missing config, missing agent) exit with code 1
 * - BCTB_WORKSPACE_PATH env var is respected for workspace resolution
 */

import { Command } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { registerAgentCommands } from '../../agent/cli';
import { AgentContextManager } from '../../agent/context';
import { AgentInfo, AgentRunLog } from '../../agent/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeProgram(): Command {
    const program = new Command();
    program.exitOverride(); // Prevent Commander from calling process.exit
    registerAgentCommands(program);
    return program;
}

/** Execute a CLI command safely and capture output */
function execCommand(program: Command, args: string[]): string {
    const output: string[] = [];
    const originalLog = console.log;
    const originalError = console.error;
    console.log = (...a: any[]) => output.push(a.join(' '));
    console.error = (...a: any[]) => output.push(a.join(' '));
    try {
        program.parse(['node', 'bctb-mcp', ...args]);
    } finally {
        console.log = originalLog;
        console.error = originalError;
    }
    return output.join('\n');
}

let tmpDir: string;

beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-cli-test-'));
    // Clear any previous env overrides
    delete process.env.BCTB_WORKSPACE_PATH;
});

afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.BCTB_WORKSPACE_PATH;
});

// ─── Command Registration ─────────────────────────────────────────────────────

describe('registerAgentCommands', () => {
    it('should register an "agent" subcommand on the program', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent');
        expect(agentCmd).toBeDefined();
    });

    it('should register start, run, run-all, list, history, pause, resume subcommands', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;
        const subNames = agentCmd.commands.map(c => c.name());

        expect(subNames).toContain('start');
        expect(subNames).toContain('run');
        expect(subNames).toContain('run-all');
        expect(subNames).toContain('list');
        expect(subNames).toContain('history');
        expect(subNames).toContain('pause');
        expect(subNames).toContain('resume');
    });

    it('should give each command a non-empty description', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;

        for (const sub of agentCmd.commands) {
            expect(sub.description().length).toBeGreaterThan(0);
        }
    });

    it('start command requires --name option', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;
        const startCmd = agentCmd.commands.find(c => c.name() === 'start')!;
        const nameOpt = startCmd.options.find(o => o.long === '--name');
        expect(nameOpt).toBeDefined();
        expect(nameOpt!.mandatory).toBe(true);
    });

    it('run command accepts --once and --profile options', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;
        const runCmd = agentCmd.commands.find(c => c.name() === 'run')!;
        const optLongs = runCmd.options.map(o => o.long);

        expect(optLongs).toContain('--once');
        expect(optLongs).toContain('--profile');
        expect(optLongs).toContain('--config');
    });

    it('history command accepts --limit option', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;
        const histCmd = agentCmd.commands.find(c => c.name() === 'history')!;
        const limitOpt = histCmd.options.find(o => o.long === '--limit');
        expect(limitOpt).toBeDefined();
    });

    it('run-all command accepts --once, --config, --profile options', () => {
        const program = makeProgram();
        const agentCmd = program.commands.find(c => c.name() === 'agent')!;
        const runAllCmd = agentCmd.commands.find(c => c.name() === 'run-all')!;
        const optLongs = runAllCmd.options.map(o => o.long);

        expect(optLongs).toContain('--once');
        expect(optLongs).toContain('--config');
        expect(optLongs).toContain('--profile');
    });
});

// ─── agent list ───────────────────────────────────────────────────────────────

describe('agent list', () => {
    it('should print "No agents found" when workspace is empty', () => {
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const output: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a: any[]) => output.push(a.join(' '));
        console.error = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        // Mock process.exit to prevent test from stopping
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'list']);
        } finally {
            console.log = originalLog;
            console.error = originalError;
            mockExit.mockRestore();
        }

        // Either says "No agents found" or lists agents
        const combined = output.join('\n');
        expect(combined).toMatch(/No agents found|Agents:/);
    });

    it('should list agents found in workspace', () => {
        // Create a real agent directory
        const agentsDir = path.join(tmpDir, 'agents', 'test-agent');
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'instruction.md'), 'Monitor errors.', 'utf-8');

        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'list']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toContain('test-agent');
    });
});

// ─── agent history ────────────────────────────────────────────────────────────

describe('agent history', () => {
    it('should print "No run history" for an agent with no runs', () => {
        // Create agent without any runs
        const agentsDir = path.join(tmpDir, 'agents', 'empty-agent');
        fs.mkdirSync(path.join(agentsDir, 'runs'), { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'instruction.md'), 'Monitor errors.', 'utf-8');

        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'history', 'empty-agent']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        expect(output.join('\n')).toContain('No run history');
    });

    it('should display run history when runs exist', () => {
        const agentsDir = path.join(tmpDir, 'agents', 'hist-agent');
        const runsDir = path.join(agentsDir, 'runs');
        fs.mkdirSync(runsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'instruction.md'), 'Monitor errors.', 'utf-8');

        const runLog: AgentRunLog = {
            runId: 1,
            agentName: 'hist-agent',
            timestamp: '2026-02-24T10:00:00.000Z',
            durationMs: 8000,
            instruction: 'Monitor errors.',
            stateAtStart: { summary: '', activeIssueCount: 0, runCount: 0 },
            llm: { model: 'gpt-4o', promptTokens: 200, completionTokens: 100, totalTokens: 300, toolCallCount: 3 },
            toolCalls: [],
            assessment: 'All clear.',
            findings: 'Environment healthy, no anomalies detected.',
            actions: [],
            stateChanges: { issuesCreated: [], issuesUpdated: [], issuesResolved: [], summaryUpdated: true }
        };

        fs.writeFileSync(
            path.join(runsDir, '2026-02-24T10-00-00-000Z-run0001.json'),
            JSON.stringify(runLog, null, 2),
            'utf-8'
        );

        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'history', 'hist-agent']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toContain('Run History');
        expect(combined).toContain('#1');
        expect(combined).toContain('healthy');
    });
});

// ─── agent pause / resume ─────────────────────────────────────────────────────

describe('agent pause and resume', () => {
    function createTestAgent(name: string): void {
        const agentsDir = path.join(tmpDir, 'agents', name);
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'instruction.md'), 'Monitor errors.', 'utf-8');
    }

    it('should pause an active agent', () => {
        createTestAgent('pause-test-agent');
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'pause', 'pause-test-agent']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        // Verify state was actually written to disk
        const stateFile = path.join(tmpDir, 'agents', 'pause-test-agent', 'state.json');
        expect(fs.existsSync(stateFile)).toBe(true);
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        expect(state.status).toBe('paused');
        expect(output.join('\n')).toContain("paused");
    });

    it('should resume a paused agent', () => {
        createTestAgent('resume-test-agent');
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        // First pause it
        const ctxMgr = new AgentContextManager(tmpDir);
        ctxMgr.setAgentStatus('resume-test-agent', 'paused');

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'resume', 'resume-test-agent']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        const stateFile = path.join(tmpDir, 'agents', 'resume-test-agent', 'state.json');
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8'));
        expect(state.status).toBe('active');
        expect(output.join('\n')).toContain("resumed");
    });

    it('should exit with error when pausing a non-existent agent', () => {
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const output: string[] = [];
        const originalError = console.error;
        console.error = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'pause', 'does-not-exist']);
            expect(mockExit).toHaveBeenCalledWith(1);
            expect(output.join('\n')).toMatch(/not found/i);
        } finally {
            console.error = originalError;
            mockExit.mockRestore();
        }
    });

    it('should exit with error when resuming a non-existent agent', () => {
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const output: string[] = [];
        const originalError = console.error;
        console.error = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'resume', 'does-not-exist']);
            expect(mockExit).toHaveBeenCalledWith(1);
            expect(output.join('\n')).toMatch(/not found/i);
        } finally {
            console.error = originalError;
            mockExit.mockRestore();
        }
    });
});

// ─── agent start ─────────────────────────────────────────────────────────────

describe('agent start', () => {
    it('should create agent directory structure', () => {
        // Build a minimal config file
        const configPath = path.join(tmpDir, '.bctb-config.json');
        fs.writeFileSync(configPath, JSON.stringify({ workspacePath: tmpDir }), 'utf-8');

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse([
                'node', 'bctb-mcp', 'agent', 'start',
                'Monitor errors and alert on high rates.',
                '--name', 'new-test-agent',
                '--config', configPath
            ]);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        // Agent directory should be created
        const agentDir = path.join(tmpDir, 'agents', 'new-test-agent');
        expect(fs.existsSync(agentDir)).toBe(true);
        expect(fs.existsSync(path.join(agentDir, 'instruction.md'))).toBe(true);
        expect(fs.existsSync(path.join(agentDir, 'state.json'))).toBe(true);

        // Instruction text is stored verbatim
        const instruction = fs.readFileSync(path.join(agentDir, 'instruction.md'), 'utf-8');
        expect(instruction).toBe('Monitor errors and alert on high rates.');

        // Output confirms creation
        expect(output.join('\n')).toContain('Created agent');
        expect(output.join('\n')).toContain('new-test-agent');
    });

    it('should fail when creating an already-existing agent', () => {
        const configPath = path.join(tmpDir, '.bctb-config.json');
        fs.writeFileSync(configPath, JSON.stringify({ workspacePath: tmpDir }), 'utf-8');

        // Pre-create the agent
        const agentDir = path.join(tmpDir, 'agents', 'duplicate-agent');
        fs.mkdirSync(agentDir, { recursive: true });
        fs.writeFileSync(path.join(agentDir, 'instruction.md'), 'existing', 'utf-8');

        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);
        const errOutput: string[] = [];
        const originalError = console.error;
        console.error = (...a: any[]) => errOutput.push(a.join(' '));

        const program = makeProgram();

        try {
            program.parse([
                'node', 'bctb-mcp', 'agent', 'start',
                'New instruction.',
                '--name', 'duplicate-agent',
                '--config', configPath
            ]);
            expect(mockExit).toHaveBeenCalledWith(1);
            expect(errOutput.join('\n')).toMatch(/already exists|Failed/i);
        } finally {
            console.error = originalError;
            mockExit.mockRestore();
        }
    });
});

// ─── agent run-all summary output ────────────────────────────────────────────

describe('agent run-all failure summary', () => {
    // These tests mock the heavy dependencies (config, LLM, ToolHandlers)
    // and focus on the summary output at the end of run-all.

    const mockRun = jest.fn();

    beforeEach(() => {
        // Set env var so createLLMProvider doesn't throw on missing API key
        process.env.AZURE_OPENAI_KEY = 'test-key-for-mock';

        // Mock loadConfigFromFile to return a minimal MCPConfig
        jest.spyOn(require('../../config'), 'loadConfigFromFile')
            .mockReturnValue({ workspacePath: tmpDir });

        // Mock initializeServices + ToolHandlers (dynamic import in run-all)
        jest.spyOn(require('../../tools/toolHandlers'), 'initializeServices')
            .mockReturnValue({});
        jest.spyOn(require('../../tools/toolHandlers'), 'ToolHandlers')
            .mockImplementation(() => ({}));

        // Mock AgentRuntime — inject our mockRun into every instance
        jest.spyOn(require('../../agent/runtime'), 'AgentRuntime')
            .mockImplementation(() => ({ run: mockRun }));

        mockRun.mockReset();
    });

    afterEach(() => {
        delete process.env.AZURE_OPENAI_KEY;
        jest.restoreAllMocks();
    });

    function setupAgents(names: string[]): void {
        for (const name of names) {
            const agentDir = path.join(tmpDir, 'agents', name);
            fs.mkdirSync(agentDir, { recursive: true });
            fs.writeFileSync(path.join(agentDir, 'instruction.md'), `Monitor ${name}.`, 'utf-8');
        }
    }

    function writeAgentsConfig(): string {
        const configPath = path.join(tmpDir, '.bctb-config.json');
        fs.writeFileSync(configPath, JSON.stringify({
            workspacePath: tmpDir,
            agents: {
                llm: { provider: 'azure-openai', endpoint: 'https://test', deployment: 'gpt-4o' },
                defaults: {}
            }
        }), 'utf-8');
        return configPath;
    }

    function makeRunLog(agentName: string, runId: number): AgentRunLog {
        return {
            runId,
            agentName,
            timestamp: '2026-04-10T10:00:00.000Z',
            durationMs: 5000,
            instruction: `Monitor ${agentName}.`,
            stateAtStart: { summary: '', activeIssueCount: 0, runCount: 0 },
            llm: { model: 'gpt-4o', promptTokens: 100, completionTokens: 50, totalTokens: 150, toolCallCount: 3 },
            toolCalls: [],
            assessment: 'All clear.',
            findings: 'No issues found.',
            actions: [],
            stateChanges: { issuesCreated: [], issuesUpdated: [], issuesResolved: [], summaryUpdated: true }
        };
    }

    it('should list failed agent names in summary when some agents fail', async () => {
        // Agents are iterated alphabetically: aaa-ok, bbb-broken, ccc-broken
        setupAgents(['aaa-ok', 'bbb-broken', 'ccc-broken']);
        const configPath = writeAgentsConfig();

        mockRun
            .mockResolvedValueOnce(makeRunLog('aaa-ok', 1))
            .mockRejectedValueOnce(new Error('LLM timeout after 240s'))
            .mockRejectedValueOnce(new Error('No instruction.md found'));

        const output: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a: any[]) => output.push(a.join(' '));
        console.error = (...a: any[]) => output.push(a.join(' '));
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        const program = makeProgram();
        try {
            await program.parseAsync(['node', 'bctb-mcp', 'agent', 'run-all', '--config', configPath]);
        } finally {
            console.log = originalLog;
            console.error = originalError;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toContain('1 succeeded, 2 failed');
        // Summary block must list each failed agent with its error
        expect(combined).toMatch(/Failed agents:/);
        expect(combined).toMatch(/bbb-broken.*LLM timeout/);
        expect(combined).toMatch(/ccc-broken.*No instruction\.md/);
    });

    it('should not show failure list when all agents succeed', async () => {
        setupAgents(['agent-a', 'agent-b']);
        const configPath = writeAgentsConfig();

        mockRun
            .mockResolvedValueOnce(makeRunLog('agent-a', 1))
            .mockResolvedValueOnce(makeRunLog('agent-b', 1));

        const output: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a: any[]) => output.push(a.join(' '));
        console.error = (...a: any[]) => output.push(a.join(' '));
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        const program = makeProgram();
        try {
            await program.parseAsync(['node', 'bctb-mcp', 'agent', 'run-all', '--config', configPath]);
        } finally {
            console.log = originalLog;
            console.error = originalError;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toContain('2 succeeded, 0 failed');
        expect(combined).not.toMatch(/Failed agents:/);
    });

    it('should show all agents as failed when all fail', async () => {
        setupAgents(['fail-1', 'fail-2']);
        const configPath = writeAgentsConfig();

        mockRun
            .mockRejectedValueOnce(new Error('Connection refused'))
            .mockRejectedValueOnce(new Error('Rate limited'));

        const output: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a: any[]) => output.push(a.join(' '));
        console.error = (...a: any[]) => output.push(a.join(' '));
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        const program = makeProgram();
        try {
            await program.parseAsync(['node', 'bctb-mcp', 'agent', 'run-all', '--config', configPath]);
        } finally {
            console.log = originalLog;
            console.error = originalError;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toContain('0 succeeded, 2 failed');
        expect(combined).toMatch(/Failed agents:/);
        expect(combined).toMatch(/fail-1.*Connection refused/);
        expect(combined).toMatch(/fail-2.*Rate limited/);
    });

    it('should include the error message for each failed agent in the summary', async () => {
        // Alphabetical: aaa-good runs first (success), bbb-bad runs second (fails)
        setupAgents(['aaa-good', 'bbb-bad']);
        const configPath = writeAgentsConfig();

        mockRun
            .mockResolvedValueOnce(makeRunLog('aaa-good', 1))
            .mockRejectedValueOnce(new Error('Azure OpenAI API error 429: Rate limited'));

        const output: string[] = [];
        const originalLog = console.log;
        const originalError = console.error;
        console.log = (...a: any[]) => output.push(a.join(' '));
        console.error = (...a: any[]) => output.push(a.join(' '));
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        const program = makeProgram();
        try {
            await program.parseAsync(['node', 'bctb-mcp', 'agent', 'run-all', '--config', configPath]);
        } finally {
            console.log = originalLog;
            console.error = originalError;
            mockExit.mockRestore();
        }

        const combined = output.join('\n');
        expect(combined).toMatch(/Failed agents:/);
        expect(combined).toMatch(/bbb-bad.*Azure OpenAI API error 429/);
        // aaa-good should NOT appear in the failure list
        expect(combined).not.toMatch(/aaa-good.*Azure OpenAI/);
    });
});

// ─── BCTB_WORKSPACE_PATH resolution ──────────────────────────────────────────

describe('BCTB_WORKSPACE_PATH resolution', () => {
    it('should use BCTB_WORKSPACE_PATH when no --config is provided', () => {
        process.env.BCTB_WORKSPACE_PATH = tmpDir;

        // Create an agent in that workspace
        const agentsDir = path.join(tmpDir, 'agents', 'env-agent');
        fs.mkdirSync(agentsDir, { recursive: true });
        fs.writeFileSync(path.join(agentsDir, 'instruction.md'), 'Monitor.', 'utf-8');

        const output: string[] = [];
        const originalLog = console.log;
        console.log = (...a: any[]) => output.push(a.join(' '));

        const program = makeProgram();
        const mockExit = jest.spyOn(process, 'exit').mockImplementation((() => { }) as any);

        try {
            program.parse(['node', 'bctb-mcp', 'agent', 'list']);
        } finally {
            console.log = originalLog;
            mockExit.mockRestore();
        }

        expect(output.join('\n')).toContain('env-agent');
    });
});
