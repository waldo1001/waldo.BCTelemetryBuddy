/**
 * Tests for Agent Prompts — system prompt, prompt builder, output parser, tool filtering.
 */

import {
    AGENT_SYSTEM_PROMPT,
    buildAgentPrompt,
    parseAgentOutput,
    filterToolsByScope,
    toolDefinitionsToOpenAI
} from '../../agent/prompts';
import { AgentState } from '../../agent/types';
import { ToolDefinition } from '../../tools/toolDefinitions';

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createState(overrides?: Partial<AgentState>): AgentState {
    return {
        agentName: 'test-agent',
        created: '2025-01-01T00:00:00Z',
        lastRun: '2025-01-01T00:00:00Z',
        runCount: 0,
        status: 'active',
        summary: '',
        activeIssues: [],
        resolvedIssues: [],
        recentRuns: [],
        ...overrides
    };
}

function createToolDef(name: string): ToolDefinition {
    return {
        name,
        description: `Tool: ${name}`,
        inputSchema: {
            type: 'object',
            properties: { q: { type: 'string', description: 'query' } },
            required: ['q']
        }
    };
}

// ─── AGENT_SYSTEM_PROMPT ─────────────────────────────────────────────────────

describe('AGENT_SYSTEM_PROMPT', () => {
    it('should be a non-empty string', () => {
        expect(typeof AGENT_SYSTEM_PROMPT).toBe('string');
        expect(AGENT_SYSTEM_PROMPT.length).toBeGreaterThan(100);
    });

    it('should contain core behavior instructions', () => {
        expect(AGENT_SYSTEM_PROMPT).toContain('telemetry monitoring agent');
        expect(AGENT_SYSTEM_PROMPT).toContain('Business Central');
    });

    it('should describe the output format', () => {
        expect(AGENT_SYSTEM_PROMPT).toContain('summary');
        expect(AGENT_SYSTEM_PROMPT).toContain('findings');
        expect(AGENT_SYSTEM_PROMPT).toContain('assessment');
        expect(AGENT_SYSTEM_PROMPT).toContain('activeIssues');
        expect(AGENT_SYSTEM_PROMPT).toContain('actions');
    });

    it('should mention all action types', () => {
        expect(AGENT_SYSTEM_PROMPT).toContain('teams-webhook');
        expect(AGENT_SYSTEM_PROMPT).toContain('email-smtp');
        expect(AGENT_SYSTEM_PROMPT).toContain('email-graph');
        expect(AGENT_SYSTEM_PROMPT).toContain('generic-webhook');
        expect(AGENT_SYSTEM_PROMPT).toContain('pipeline-trigger');
    });

    it('should include re-alerting and cooldown rules', () => {
        expect(AGENT_SYSTEM_PROMPT).toContain('cooldown');
        expect(AGENT_SYSTEM_PROMPT).toContain('Re-alerting');
    });
});

// ─── buildAgentPrompt ────────────────────────────────────────────────────────

describe('buildAgentPrompt', () => {
    it('should include instruction in the prompt', () => {
        const prompt = buildAgentPrompt('Monitor error rate spikes.', createState());
        expect(prompt).toContain('Monitor error rate spikes.');
    });

    it('should indicate first run for runCount=0', () => {
        const prompt = buildAgentPrompt('Test instruction', createState({ runCount: 0 }));
        expect(prompt).toContain('FIRST RUN');
        expect(prompt).toContain('No previous context');
    });

    it('should include summary and active issues for subsequent runs', () => {
        const state = createState({
            runCount: 5,
            summary: 'Error rate is at 5%.',
            activeIssues: [{
                id: 'issue-1',
                fingerprint: 'err-rate-high',
                title: 'High error rate',
                firstSeen: '2025-01-01T00:00:00Z',
                lastSeen: '2025-01-01T12:00:00Z',
                consecutiveDetections: 3,
                trend: 'stable',
                counts: [5, 5, 5],
                actionsTaken: []
            }]
        });

        const prompt = buildAgentPrompt('Test', state);
        expect(prompt).not.toContain('FIRST RUN');
        expect(prompt).toContain('Error rate is at 5%.');
        expect(prompt).toContain('Active Issues (1)');
        expect(prompt).toContain('issue-1');
    });

    it('should include recent runs when present', () => {
        const state = createState({
            runCount: 2,
            summary: 'All good',
            recentRuns: [{
                runId: 1,
                timestamp: '2025-01-01T06:00:00Z',
                durationMs: 5000,
                toolCalls: ['query_telemetry'],
                findings: 'No issues found.',
                actions: []
            }]
        });

        const prompt = buildAgentPrompt('Test', state);
        expect(prompt).toContain('Recent Runs (last 1)');
        expect(prompt).toContain('No issues found.');
    });

    it('should include actions from recent runs', () => {
        const state = createState({
            runCount: 1,
            summary: 'Alert sent',
            recentRuns: [{
                runId: 1,
                timestamp: '2025-01-01T06:00:00Z',
                durationMs: 5000,
                toolCalls: ['query_telemetry'],
                findings: 'High errors',
                actions: [{
                    run: 1,
                    type: 'teams-webhook',
                    timestamp: '2025-01-01T06:00:00Z',
                    status: 'sent'
                }]
            }]
        });

        const prompt = buildAgentPrompt('Test', state);
        expect(prompt).toContain('Actions: teams-webhook');
    });

    it('should include current time and run number', () => {
        const state = createState({ runCount: 9 });
        const prompt = buildAgentPrompt('Instr', state);
        expect(prompt).toContain('Run #10');
        expect(prompt).toContain('Current Time');
    });

    it('should contain the task instruction at the end', () => {
        const prompt = buildAgentPrompt('Test', createState());
        expect(prompt).toContain('Execute your instruction now');
    });
});

// ─── parseAgentOutput ────────────────────────────────────────────────────────

describe('parseAgentOutput', () => {
    const validOutput = {
        summary: 'All clear',
        findings: 'No issues',
        assessment: 'Healthy',
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

    it('should parse raw JSON', () => {
        const result = parseAgentOutput(JSON.stringify(validOutput));
        expect(result.summary).toBe('All clear');
        expect(result.findings).toBe('No issues');
        expect(result.assessment).toBe('Healthy');
    });

    it('should parse JSON in code fences', () => {
        const fenced = '```json\n' + JSON.stringify(validOutput) + '\n```';
        const result = parseAgentOutput(fenced);
        expect(result.summary).toBe('All clear');
    });

    it('should parse JSON in plain code fences', () => {
        const fenced = '```\n' + JSON.stringify(validOutput) + '\n```';
        const result = parseAgentOutput(fenced);
        expect(result.summary).toBe('All clear');
    });

    it('should extract JSON embedded in prose', () => {
        const text = 'Here is my analysis:\n' + JSON.stringify(validOutput) + '\nEnd.';
        const result = parseAgentOutput(text);
        expect(result.summary).toBe('All clear');
    });

    it('should default optional arrays', () => {
        const minimal = { summary: 'Ok', findings: 'Nothing', assessment: 'Good' };
        const result = parseAgentOutput(JSON.stringify(minimal));
        expect(result.activeIssues).toEqual([]);
        expect(result.resolvedIssues).toEqual([]);
        expect(result.actions).toEqual([]);
    });

    it('should throw on empty input', () => {
        expect(() => parseAgentOutput('')).toThrow('Agent produced empty response');
    });

    it('should throw on whitespace-only input', () => {
        expect(() => parseAgentOutput('   ')).toThrow('Agent produced empty response');
    });

    it('should throw on missing summary', () => {
        const noSummary = { findings: 'x', assessment: 'y' };
        expect(() => parseAgentOutput(JSON.stringify(noSummary)))
            .toThrow('Missing required field: summary');
    });

    it('should throw on missing findings', () => {
        const noFindings = { summary: 'x', assessment: 'y' };
        expect(() => parseAgentOutput(JSON.stringify(noFindings)))
            .toThrow('Missing required field: findings');
    });

    it('should throw on missing assessment', () => {
        const noAssessment = { summary: 'x', findings: 'y' };
        expect(() => parseAgentOutput(JSON.stringify(noAssessment)))
            .toThrow('Missing required field: assessment');
    });

    it('should throw on no JSON in content', () => {
        expect(() => parseAgentOutput('This is just text without JSON'))
            .toThrow('Agent did not produce valid JSON output');
    });

    it('should throw on invalid JSON', () => {
        expect(() => parseAgentOutput('```json\n{invalid json}\n```'))
            .toThrow('Failed to parse agent JSON output');
    });

    it('should preserve activeIssues when provided', () => {
        const output = {
            ...validOutput,
            activeIssues: [{
                id: 'issue-1',
                fingerprint: 'fp-1',
                title: 'Test Issue',
                consecutiveDetections: 2,
                trend: 'increasing',
                counts: [10, 15],
                lastSeen: '2025-01-01T00:00:00Z'
            }]
        };
        const result = parseAgentOutput(JSON.stringify(output));
        expect(result.activeIssues).toHaveLength(1);
        expect(result.activeIssues[0].fingerprint).toBe('fp-1');
    });

    it('should preserve actions when provided', () => {
        const output = {
            ...validOutput,
            actions: [{
                type: 'teams-webhook',
                title: 'Alert',
                message: 'Error spike',
                severity: 'high'
            }]
        };
        const result = parseAgentOutput(JSON.stringify(output));
        expect(result.actions).toHaveLength(1);
        expect(result.actions[0].type).toBe('teams-webhook');
    });

    // ─── JSON repair tests ───────────────────────────────────────────────

    describe('JSON repair', () => {
        it('should repair trailing commas in arrays', () => {
            const json = `{
                "summary": "All clear",
                "findings": "No issues",
                "assessment": "Healthy",
                "activeIssues": [
                    {"id": "issue-1", "fingerprint": "fp-1", "title": "Test", "consecutiveDetections": 1, "trend": "stable", "counts": [10,], "lastSeen": "2026-01-01T00:00:00Z"},
                ],
                "resolvedIssues": [],
                "actions": []
            }`;
            const result = parseAgentOutput(json);
            expect(result.summary).toBe('All clear');
            expect(result.activeIssues).toHaveLength(1);
        });

        it('should repair trailing commas in objects', () => {
            const json = `{
                "summary": "All clear",
                "findings": "No issues",
                "assessment": "Healthy",
                "actions": [],
            }`;
            const result = parseAgentOutput(json);
            expect(result.summary).toBe('All clear');
        });

        it('should handle unescaped newlines in string values', () => {
            // Simulate LLM putting actual newlines inside JSON string values
            const json = '{"summary": "Line 1\\nLine 2", "findings": "Found\\nstuff", "assessment": "All\\ngood"}';
            const result = parseAgentOutput(json);
            expect(result.summary).toBe('Line 1\nLine 2');
        });

        it('should recover truncated JSON with missing closing braces', () => {
            const json = `{
                "summary": "All clear",
                "findings": "No issues found in the last 24 hours",
                "assessment": "System is healthy",
                "activeIssues": [],
                "resolvedIssues": [],
                "actions": []`;
            // Missing final }
            const result = parseAgentOutput(json);
            expect(result.summary).toBe('All clear');
            expect(result.findings).toBe('No issues found in the last 24 hours');
        });

        it('should recover truncated JSON with missing closing brackets and braces', () => {
            const json = `{
                "summary": "Issues found",
                "findings": "Error spike detected",
                "assessment": "Needs attention",
                "activeIssues": [
                    {"id": "issue-1", "fingerprint": "fp-1", "title": "Error spike", "consecutiveDetections": 2, "trend": "increasing", "counts": [10, 20], "lastSeen": "2026-01-01T00:00:00Z"}`;
            // Missing ], }
            const result = parseAgentOutput(json);
            expect(result.summary).toBe('Issues found');
            expect(result.activeIssues).toHaveLength(1);
        });

        it('should still throw on completely invalid content', () => {
            expect(() => parseAgentOutput('This has no JSON at all'))
                .toThrow('Agent did not produce valid JSON output');
        });

        it('should still throw on missing required fields after repair', () => {
            const json = `{"summary": "ok", "findings": "none",}`;
            // Missing assessment — repair fixes comma but validation catches missing field
            expect(() => parseAgentOutput(json))
                .toThrow('Missing required field: assessment');
        });

        it('should handle multiple trailing commas', () => {
            const json = `{
                "summary": "ok",
                "findings": "none",
                "assessment": "good",
                "activeIssues": [
                    {"id": "a", "fingerprint": "f", "title": "t", "consecutiveDetections": 1, "trend": "stable", "counts": [1,2,3,], "lastSeen": "2026-01-01",},
                    {"id": "b", "fingerprint": "g", "title": "u", "consecutiveDetections": 1, "trend": "stable", "counts": [4,5,], "lastSeen": "2026-01-02",},
                ],
            }`;
            const result = parseAgentOutput(json);
            expect(result.activeIssues).toHaveLength(2);
        });
    });
});

// ─── filterToolsByScope ──────────────────────────────────────────────────────

describe('filterToolsByScope', () => {
    const tools: ToolDefinition[] = [
        createToolDef('query_telemetry'),
        createToolDef('get_event_catalog'),
        createToolDef('save_query'),
        createToolDef('switch_profile')
    ];

    it('should return all tools for full scope', () => {
        const result = filterToolsByScope(tools, 'full');
        expect(result).toHaveLength(4);
    });

    it('should exclude write tools for read-only scope', () => {
        const result = filterToolsByScope(tools, 'read-only');
        expect(result).toHaveLength(2);
        expect(result.map(t => t.name)).toEqual(['query_telemetry', 'get_event_catalog']);
    });

    it('should not exclude save_query in full scope', () => {
        const result = filterToolsByScope(tools, 'full');
        expect(result.map(t => t.name)).toContain('save_query');
    });

    it('should not exclude switch_profile in full scope', () => {
        const result = filterToolsByScope(tools, 'full');
        expect(result.map(t => t.name)).toContain('switch_profile');
    });

    it('should handle empty tools array', () => {
        const result = filterToolsByScope([], 'read-only');
        expect(result).toEqual([]);
    });
});

// ─── toolDefinitionsToOpenAI ─────────────────────────────────────────────────

describe('toolDefinitionsToOpenAI', () => {
    it('should convert MCP tool defs to OpenAI format', () => {
        const tools = [createToolDef('query_telemetry')];
        const result = toolDefinitionsToOpenAI(tools);

        expect(result).toHaveLength(1);
        expect(result[0].type).toBe('function');
        expect(result[0].function.name).toBe('query_telemetry');
        expect(result[0].function.description).toBe('Tool: query_telemetry');
        expect(result[0].function.parameters).toBeDefined();
    });

    it('should convert multiple tools', () => {
        const tools = [createToolDef('a'), createToolDef('b'), createToolDef('c')];
        const result = toolDefinitionsToOpenAI(tools);
        expect(result).toHaveLength(3);
    });

    it('should handle empty array', () => {
        expect(toolDefinitionsToOpenAI([])).toEqual([]);
    });

    it('should preserve input schema as parameters', () => {
        const tools = [createToolDef('test')];
        const result = toolDefinitionsToOpenAI(tools);
        expect(result[0].function.parameters).toEqual({
            type: 'object',
            properties: { q: { type: 'string', description: 'query' } },
            required: ['q']
        });
    });
});
