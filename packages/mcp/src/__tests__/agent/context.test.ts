/**
 * Tests for AgentContextManager — filesystem operations for agent state management.
 *
 * Coverage targets:
 * - createAgent: directory creation, initial state, instruction file
 * - loadInstruction / loadState: reading files, missing file handling
 * - saveState / saveRunLog: writing files, directory auto-creation
 * - updateState: sliding window, issue tracking, resolved issue pruning
 * - listAgents / getRunHistory: directory scanning
 * - setAgentStatus: pause/resume
 * - agentExists: existence check
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { AgentContextManager } from '../../agent/context';
import { AgentState, AgentOutput, AgentAction, AgentRunLog } from '../../agent/types';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createTempDir(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-agent-test-'));
}

function createTestState(overrides?: Partial<AgentState>): AgentState {
    return {
        agentName: 'test-agent',
        created: '2026-02-24T10:00:00.000Z',
        lastRun: '2026-02-24T12:00:00.000Z',
        runCount: 3,
        status: 'active',
        summary: 'Previous runs found 2 issues.',
        activeIssues: [],
        resolvedIssues: [],
        recentRuns: [],
        ...overrides
    };
}

function createTestOutput(overrides?: Partial<AgentOutput>): AgentOutput {
    return {
        summary: 'Updated summary after this run.',
        findings: 'Found 5 errors in the last hour.',
        assessment: 'Error rate is increasing.',
        investigationReport: '### Run #1\n\nError rate is increasing.',
        activeIssues: [],
        resolvedIssues: [],
        actions: [],
        stateChanges: {
            issuesCreated: [],
            issuesUpdated: [],
            issuesResolved: [],
            summaryUpdated: true
        },
        ...overrides
    };
}

function createTestRunLog(overrides?: Partial<AgentRunLog>): AgentRunLog {
    return {
        runId: 1,
        agentName: 'test-agent',
        timestamp: '2026-02-24T10:00:00.000Z',
        durationMs: 5000,
        instruction: 'Monitor errors.',
        stateAtStart: {
            summary: '',
            activeIssueCount: 0,
            runCount: 0
        },
        llm: {
            model: 'test',
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            toolCallCount: 2
        },
        toolCalls: [],
        assessment: 'All clear.',
        findings: 'No issues found.',
        actions: [],
        stateChanges: {
            issuesCreated: [],
            issuesUpdated: [],
            issuesResolved: [],
            summaryUpdated: false
        },
        ...overrides
    };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('AgentContextManager', () => {
    let tempDir: string;
    let manager: AgentContextManager;

    beforeEach(() => {
        tempDir = createTempDir();
        manager = new AgentContextManager(tempDir, 5, 30);
    });

    afterEach(() => {
        fs.rmSync(tempDir, { recursive: true, force: true });
    });

    // ─── createAgent ─────────────────────────────────────────────────────

    describe('createAgent', () => {
        it('should create agent directory structure', () => {
            manager.createAgent('my-agent', 'Monitor errors.');

            expect(fs.existsSync(path.join(tempDir, 'agents', 'my-agent', 'instruction.md'))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, 'agents', 'my-agent', 'state.json'))).toBe(true);
            expect(fs.existsSync(path.join(tempDir, 'agents', 'my-agent', 'runs'))).toBe(true);
        });

        it('should write the instruction file', () => {
            manager.createAgent('my-agent', 'Monitor BC errors hourly.');

            const content = fs.readFileSync(
                path.join(tempDir, 'agents', 'my-agent', 'instruction.md'),
                'utf-8'
            );
            expect(content).toBe('Monitor BC errors hourly.');
        });

        it('should write initial state with correct defaults', () => {
            manager.createAgent('my-agent', 'Monitor errors.');

            const state: AgentState = JSON.parse(
                fs.readFileSync(path.join(tempDir, 'agents', 'my-agent', 'state.json'), 'utf-8')
            );

            expect(state.agentName).toBe('my-agent');
            expect(state.runCount).toBe(0);
            expect(state.status).toBe('active');
            expect(state.summary).toBe('');
            expect(state.activeIssues).toEqual([]);
            expect(state.resolvedIssues).toEqual([]);
            expect(state.recentRuns).toEqual([]);
            expect(state.lastRun).toBe('');
        });

        it('should throw if agent already exists', () => {
            manager.createAgent('dupe', 'First.');
            expect(() => manager.createAgent('dupe', 'Second.')).toThrow("Agent 'dupe' already exists");
        });
    });

    // ─── loadInstruction ─────────────────────────────────────────────────

    describe('loadInstruction', () => {
        it('should read instruction.md', () => {
            manager.createAgent('test', 'Check telemetry.');
            expect(manager.loadInstruction('test')).toBe('Check telemetry.');
        });

        it('should throw for non-existent agent', () => {
            expect(() => manager.loadInstruction('nonexistent')).toThrow("Agent 'nonexistent' has no instruction.md");
        });
    });

    // ─── loadState ───────────────────────────────────────────────────────

    describe('loadState', () => {
        it('should read state.json for existing agent', () => {
            manager.createAgent('test', 'Monitor.');
            const state = manager.loadState('test');

            expect(state.agentName).toBe('test');
            expect(state.runCount).toBe(0);
            expect(state.status).toBe('active');
        });

        it('should return initial state for agent without state.json', () => {
            // Create agent manually without state.json
            const agentDir = path.join(tempDir, 'agents', 'partial');
            fs.mkdirSync(agentDir, { recursive: true });
            fs.writeFileSync(path.join(agentDir, 'instruction.md'), 'Test.', 'utf-8');

            const state = manager.loadState('partial');
            expect(state.agentName).toBe('partial');
            expect(state.runCount).toBe(0);
        });
    });

    // ─── agentExists ─────────────────────────────────────────────────────

    describe('agentExists', () => {
        it('should return true for existing agent', () => {
            manager.createAgent('exists', 'Test.');
            expect(manager.agentExists('exists')).toBe(true);
        });

        it('should return false for non-existent agent', () => {
            expect(manager.agentExists('nope')).toBe(false);
        });
    });

    // ─── listAgents ──────────────────────────────────────────────────────

    describe('listAgents', () => {
        it('should return empty array when no agents exist', () => {
            expect(manager.listAgents()).toEqual([]);
        });

        it('should list all agents with their info', () => {
            manager.createAgent('agent-a', 'Monitor A.');
            manager.createAgent('agent-b', 'Monitor B.');

            const agents = manager.listAgents();
            expect(agents).toHaveLength(2);
            expect(agents.map(a => a.name).sort()).toEqual(['agent-a', 'agent-b']);
            expect(agents[0].status).toBe('active');
            expect(agents[0].runCount).toBe(0);
        });

        it('should ignore directories without instruction.md', () => {
            manager.createAgent('real', 'Monitor.');
            fs.mkdirSync(path.join(tempDir, 'agents', 'empty-dir'), { recursive: true });

            const agents = manager.listAgents();
            expect(agents).toHaveLength(1);
            expect(agents[0].name).toBe('real');
        });

        it('should return empty array when agents dir does not exist', () => {
            const freshManager = new AgentContextManager(path.join(tempDir, 'nonexistent'));
            expect(freshManager.listAgents()).toEqual([]);
        });
    });

    // ─── saveState ───────────────────────────────────────────────────────

    describe('saveState', () => {
        it('should write state.json to disk', () => {
            manager.createAgent('test', 'Monitor.');

            const state = createTestState({ agentName: 'test', runCount: 5 });
            manager.saveState('test', state);

            const loaded = JSON.parse(
                fs.readFileSync(path.join(tempDir, 'agents', 'test', 'state.json'), 'utf-8')
            );
            expect(loaded.runCount).toBe(5);
        });

        it('should create directory if needed', () => {
            const state = createTestState({ agentName: 'new-agent' });
            manager.saveState('new-agent', state);

            expect(fs.existsSync(path.join(tempDir, 'agents', 'new-agent', 'state.json'))).toBe(true);
        });
    });

    // ─── saveRunLog ──────────────────────────────────────────────────────

    describe('saveRunLog', () => {
        it('should write run log with formatted timestamp filename', () => {
            manager.createAgent('test', 'Monitor.');
            const runLog = createTestRunLog({ timestamp: '2026-02-24T10:30:00.123Z' });
            manager.saveRunLog('test', runLog);

            const files = fs.readdirSync(path.join(tempDir, 'agents', 'test', 'runs'));
            // Saves both .json audit trail and .md human-readable report
            expect(files).toHaveLength(2);
            expect(files).toContain('2026-02-24T10-30-00Z-run0001.json');
            expect(files).toContain('2026-02-24T10-30-00Z-run0001.md');
        });

        it('should create runs directory if it does not exist', () => {
            const agentDir = path.join(tempDir, 'agents', 'nodir');
            fs.mkdirSync(agentDir, { recursive: true });
            fs.writeFileSync(path.join(agentDir, 'instruction.md'), 'Test.', 'utf-8');

            const runLog = createTestRunLog();
            manager.saveRunLog('nodir', runLog);

            expect(fs.existsSync(path.join(agentDir, 'runs'))).toBe(true);
        });
    });

    // ─── getRunHistory ───────────────────────────────────────────────────

    describe('getRunHistory', () => {
        it('should return empty for agent with no runs', () => {
            manager.createAgent('empty', 'Monitor.');
            expect(manager.getRunHistory('empty')).toEqual([]);
        });

        it('should return runs sorted newest first', () => {
            manager.createAgent('test', 'Monitor.');

            const run1 = createTestRunLog({ runId: 1, timestamp: '2026-02-24T10:00:00.000Z' });
            const run2 = createTestRunLog({ runId: 2, timestamp: '2026-02-24T11:00:00.000Z' });
            const run3 = createTestRunLog({ runId: 3, timestamp: '2026-02-24T12:00:00.000Z' });

            manager.saveRunLog('test', run1);
            manager.saveRunLog('test', run2);
            manager.saveRunLog('test', run3);

            const history = manager.getRunHistory('test');
            expect(history).toHaveLength(3);
            expect(history[0].runId).toBe(3);
            expect(history[2].runId).toBe(1);
        });

        it('should respect limit parameter', () => {
            manager.createAgent('test', 'Monitor.');

            for (let i = 1; i <= 5; i++) {
                manager.saveRunLog('test', createTestRunLog({
                    runId: i,
                    timestamp: `2026-02-24T${String(10 + i).padStart(2, '0')}:00:00.000Z`
                }));
            }

            expect(manager.getRunHistory('test', 2)).toHaveLength(2);
        });

        it('should return empty for non-existent runs dir', () => {
            expect(manager.getRunHistory('nope')).toEqual([]);
        });
    });

    // ─── setAgentStatus ──────────────────────────────────────────────────

    describe('setAgentStatus', () => {
        it('should pause an active agent', () => {
            manager.createAgent('test', 'Monitor.');
            manager.setAgentStatus('test', 'paused');

            const state = manager.loadState('test');
            expect(state.status).toBe('paused');
        });

        it('should resume a paused agent', () => {
            manager.createAgent('test', 'Monitor.');
            manager.setAgentStatus('test', 'paused');
            manager.setAgentStatus('test', 'active');

            const state = manager.loadState('test');
            expect(state.status).toBe('active');
        });
    });

    // ─── updateState ─────────────────────────────────────────────────────

    describe('updateState', () => {
        it('should increment runCount', () => {
            const prev = createTestState({ runCount: 3 });
            const output = createTestOutput();

            const updated = manager.updateState('test', prev, output, [], 5000, ['tool1']);
            expect(updated.runCount).toBe(4);
        });

        it('should update summary from output', () => {
            const prev = createTestState();
            const output = createTestOutput({ summary: 'New summary after run 4.' });

            const updated = manager.updateState('test', prev, output, [], 5000, []);
            expect(updated.summary).toBe('New summary after run 4.');
        });

        it('should add run to recentRuns sliding window', () => {
            const prev = createTestState({ recentRuns: [] });
            const output = createTestOutput({ findings: 'Found 3 issues.' });

            const updated = manager.updateState('test', prev, output, [], 5000, ['query_telemetry']);

            expect(updated.recentRuns).toHaveLength(1);
            expect(updated.recentRuns[0].runId).toBe(4);
            expect(updated.recentRuns[0].findings).toBe('Found 3 issues.');
            expect(updated.recentRuns[0].toolCalls).toEqual(['query_telemetry']);
        });

        it('should trim recentRuns to window size', () => {
            const recentRuns = Array.from({ length: 5 }, (_, i) => ({
                runId: i + 1,
                timestamp: `2026-02-24T${String(10 + i).padStart(2, '0')}:00:00.000Z`,
                durationMs: 3000,
                toolCalls: ['query_telemetry'],
                findings: `Run ${i + 1}`,
                actions: [] as AgentAction[]
            }));

            const prev = createTestState({ runCount: 5, recentRuns });
            const output = createTestOutput({ findings: 'Run 6' });

            const updated = manager.updateState('test', prev, output, [], 3000, ['query_telemetry']);

            expect(updated.recentRuns).toHaveLength(5);
            expect(updated.recentRuns[0].runId).toBe(2);  // run 1 dropped off
            expect(updated.recentRuns[4].runId).toBe(6);   // run 6 added
        });

        it('should build activeIssues from output, preserving firstSeen', () => {
            const prev = createTestState({
                activeIssues: [{
                    id: 'issue-001',
                    fingerprint: 'fp-001',
                    title: 'Existing issue',
                    firstSeen: '2026-02-24T08:00:00.000Z',
                    lastSeen: '2026-02-24T10:00:00.000Z',
                    consecutiveDetections: 2,
                    trend: 'stable',
                    counts: [10, 12],
                    actionsTaken: []
                }]
            });

            const output = createTestOutput({
                activeIssues: [{
                    id: 'issue-001',
                    fingerprint: 'fp-001',
                    title: 'Existing issue',
                    consecutiveDetections: 3,
                    trend: 'increasing',
                    counts: [10, 12, 15],
                    lastSeen: '2026-02-24T12:00:00.000Z'
                }]
            });

            const updated = manager.updateState('test', prev, output, [], 5000, []);

            expect(updated.activeIssues).toHaveLength(1);
            expect(updated.activeIssues[0].firstSeen).toBe('2026-02-24T08:00:00.000Z');
            expect(updated.activeIssues[0].consecutiveDetections).toBe(3);
        });

        it('should move resolved issues to resolvedIssues', () => {
            const recentDate = new Date();
            recentDate.setDate(recentDate.getDate() - 1); // yesterday — within TTL
            const prev = createTestState({
                activeIssues: [
                    {
                        id: 'issue-001',
                        fingerprint: 'fp-001',
                        title: 'Will resolve',
                        firstSeen: recentDate.toISOString(),
                        lastSeen: recentDate.toISOString(),
                        consecutiveDetections: 2,
                        trend: 'stable',
                        counts: [5, 3],
                        actionsTaken: []
                    }
                ],
                resolvedIssues: []
            });

            const output = createTestOutput({
                resolvedIssues: ['issue-001']
            });

            const updated = manager.updateState('test', prev, output, [], 5000, []);

            expect(updated.activeIssues).toHaveLength(0);
            expect(updated.resolvedIssues).toHaveLength(1);
            expect(updated.resolvedIssues[0].id).toBe('issue-001');
        });

        it('should prune resolved issues older than TTL', () => {
            const oldDate = new Date();
            oldDate.setDate(oldDate.getDate() - 60);  // 60 days ago

            const prev = createTestState({
                resolvedIssues: [{
                    id: 'old-issue',
                    fingerprint: 'fp-old',
                    title: 'Very old issue',
                    firstSeen: oldDate.toISOString(),
                    lastSeen: oldDate.toISOString(),
                    consecutiveDetections: 1,
                    trend: 'stable',
                    counts: [1],
                    actionsTaken: []
                }]
            });

            const output = createTestOutput();

            const updated = manager.updateState('test', prev, output, [], 5000, []);
            expect(updated.resolvedIssues).toHaveLength(0);
        });

        it('should set run number on executed actions', () => {
            const prev = createTestState({ runCount: 5 });
            const actions: AgentAction[] = [
                { run: 0, type: 'teams-webhook', status: 'sent', timestamp: new Date().toISOString() }
            ];
            const output = createTestOutput({
                activeIssues: [{
                    id: 'issue-001',
                    fingerprint: 'fp-001',
                    title: 'Test',
                    consecutiveDetections: 1,
                    trend: 'stable',
                    counts: [5],
                    lastSeen: new Date().toISOString()
                }]
            });

            const updated = manager.updateState('test', prev, output, actions, 5000, []);

            expect(updated.activeIssues[0].actionsTaken).toHaveLength(1);
            expect(updated.activeIssues[0].actionsTaken[0].run).toBe(6);
        });

        it('should preserve previous status', () => {
            const prev = createTestState({ status: 'paused' });
            const output = createTestOutput();

            const updated = manager.updateState('test', prev, output, [], 5000, []);
            expect(updated.status).toBe('paused');
        });

        it('should preserve created timestamp', () => {
            const prev = createTestState({ created: '2026-01-01T00:00:00.000Z' });
            const output = createTestOutput();

            const updated = manager.updateState('test', prev, output, [], 5000, []);
            expect(updated.created).toBe('2026-01-01T00:00:00.000Z');
        });
    });

    // ─── getAgentsDir ────────────────────────────────────────────────────

    describe('getAgentsDir', () => {
        it('should return the agents directory path', () => {
            expect(manager.getAgentsDir()).toBe(path.join(tempDir, 'agents'));
        });
    });
});
