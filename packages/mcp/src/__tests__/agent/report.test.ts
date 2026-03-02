/**
 * Tests for generateRunReport — converts AgentRunLog into Markdown.
 *
 * Coverage:
 * - Header section (agent name, run ID, date)
 * - Summary table (all fields)
 * - Instruction section
 * - State at start (with/without prior summary)
 * - Tool calls table (empty + populated)
 * - Findings, assessment (present/absent)
 * - Actions taken (empty + sent + failed)
 * - State changes (none + all change types)
 * - Large numbers are locale-formatted
 * - Pipe chars in result summaries are escaped
 * - Long text is truncated
 */

import { generateRunReport, appendToDailyReport, createInvestigationReport } from '../../agent/report';
import { AgentRunLog, AgentAction, ToolCallEntry } from '../../agent/types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRunLog(overrides?: Partial<AgentRunLog>): AgentRunLog {
    return {
        runId: 1,
        agentName: 'test-agent',
        timestamp: '2026-02-24T10:00:00.000Z',
        durationMs: 5000,
        instruction: 'Monitor errors and alert on high rates.',
        stateAtStart: {
            summary: 'No prior issues.',
            activeIssueCount: 2,
            runCount: 3
        },
        llm: {
            model: 'claude-opus-4-5',
            promptTokens: 10000,
            completionTokens: 500,
            totalTokens: 10500,
            toolCallCount: 3
        },
        toolCalls: [],
        assessment: 'System looks healthy.',
        findings: 'Found 5 errors in the last hour.',
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

function makeToolCall(overrides?: Partial<ToolCallEntry>): ToolCallEntry {
    return {
        sequence: 1,
        tool: 'query_telemetry',
        args: { eventId: 'RT0001' },
        resultSummary: 'Returned 5 rows.',
        durationMs: 1200,
        ...overrides
    };
}

function makeAction(overrides?: Partial<AgentAction>): AgentAction {
    return {
        run: 1,
        type: 'teams-webhook',
        timestamp: '2026-02-24T10:00:05.000Z',
        status: 'sent',
        details: { title: 'Alert: High Errors' },
        ...overrides
    };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('generateRunReport', () => {

    // ─── Header ──────────────────────────────────────────────────────────────

    describe('header', () => {
        it('includes agent name in header', () => {
            const report = generateRunReport(makeRunLog({ agentName: 'my-monitor' }));
            expect(report).toContain('my-monitor');
        });

        it('formats run ID with 4-digit padding', () => {
            const report = generateRunReport(makeRunLog({ runId: 7 }));
            expect(report).toContain('Run #0007');
        });

        it('includes generated timestamp line', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('Generated:');
        });
    });

    // ─── Summary Table ────────────────────────────────────────────────────────

    describe('summary table', () => {
        it('contains ## Summary heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Summary');
        });

        it('shows run ID in summary table', () => {
            const report = generateRunReport(makeRunLog({ runId: 42 }));
            expect(report).toContain('| **Run ID** | 42 |');
        });

        it('shows duration in seconds', () => {
            const report = generateRunReport(makeRunLog({ durationMs: 12500 }));
            expect(report).toContain('12.5s');
        });

        it('shows model name', () => {
            const report = generateRunReport(makeRunLog({ llm: { model: 'gpt-4o', promptTokens: 100, completionTokens: 50, totalTokens: 150, toolCallCount: 1 } }));
            expect(report).toContain('gpt-4o');
        });

        it('shows total tokens', () => {
            const report = generateRunReport(makeRunLog({ llm: { model: 'x', promptTokens: 1000, completionTokens: 500, totalTokens: 1500, toolCallCount: 2 } }));
            expect(report).toContain('1500');
        });

        it('shows tool call count', () => {
            const report = generateRunReport(makeRunLog({ llm: { model: 'x', promptTokens: 0, completionTokens: 0, totalTokens: 0, toolCallCount: 7 } }));
            expect(report).toContain('| **Tool Calls** | 7 |');
        });
    });

    // ─── Instruction ─────────────────────────────────────────────────────────

    describe('instruction', () => {
        it('contains ## Instruction heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Instruction');
        });

        it('renders instruction in a code block', () => {
            const report = generateRunReport(makeRunLog({ instruction: 'Alert when errors > 5%.' }));
            expect(report).toContain('```\nAlert when errors > 5%.\n```');
        });

        it('trims instruction whitespace', () => {
            const report = generateRunReport(makeRunLog({ instruction: '  Monitor errors.  ' }));
            expect(report).toContain('Monitor errors.');
        });
    });

    // ─── State at Start ───────────────────────────────────────────────────────

    describe('stateAtStart', () => {
        it('contains ## State at Start heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## State at Start');
        });

        it('shows run count', () => {
            const report = generateRunReport(makeRunLog({ stateAtStart: { summary: '', activeIssueCount: 0, runCount: 5 } }));
            expect(report).toContain('| **Run Count** | 5 |');
        });

        it('shows active issue count', () => {
            const report = generateRunReport(makeRunLog({ stateAtStart: { summary: '', activeIssueCount: 3, runCount: 1 } }));
            expect(report).toContain('| **Active Issues** | 3 |');
        });

        it('shows prior summary when present', () => {
            const report = generateRunReport(makeRunLog({ stateAtStart: { summary: 'Error rate elevated.', activeIssueCount: 1, runCount: 2 } }));
            expect(report).toContain('Error rate elevated.');
        });

        it('shows _none_ when prior summary is empty', () => {
            const report = generateRunReport(makeRunLog({ stateAtStart: { summary: '', activeIssueCount: 0, runCount: 0 } }));
            expect(report).toContain('_none_');
        });
    });

    // ─── Tool Calls ───────────────────────────────────────────────────────────

    describe('toolCalls', () => {
        it('contains ## Tool Calls heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Tool Calls');
        });

        it('shows placeholder when no tool calls', () => {
            const report = generateRunReport(makeRunLog({ toolCalls: [] }));
            expect(report).toContain('_No tool calls made._');
        });

        it('renders tool call rows in table', () => {
            const log = makeRunLog({ toolCalls: [makeToolCall({ sequence: 1, tool: 'query_telemetry', resultSummary: 'Returned 5 rows.' })] });
            const report = generateRunReport(log);
            expect(report).toContain('`query_telemetry`');
            expect(report).toContain('Returned 5 rows.');
        });

        it('shows duration in ms when under 1 second', () => {
            const log = makeRunLog({ toolCalls: [makeToolCall({ durationMs: 350 })] });
            const report = generateRunReport(log);
            expect(report).toContain('350ms');
        });

        it('shows duration in seconds when >= 1000ms', () => {
            const log = makeRunLog({ toolCalls: [makeToolCall({ durationMs: 2500 })] });
            const report = generateRunReport(log);
            expect(report).toContain('2.5s');
        });

        it('escapes pipe characters in result summary', () => {
            const log = makeRunLog({ toolCalls: [makeToolCall({ resultSummary: 'col1 | col2 | col3' })] });
            const report = generateRunReport(log);
            expect(report).toContain('col1 \\| col2 \\| col3');
        });

        it('replaces newlines in result summary with spaces', () => {
            const log = makeRunLog({ toolCalls: [makeToolCall({ resultSummary: 'line1\nline2' })] });
            const report = generateRunReport(log);
            const tableSection = report.split('## Tool Calls')[1];
            expect(tableSection).not.toContain('line1\nline2');
            expect(tableSection).toContain('line1 line2');
        });

        it('renders multiple tool calls', () => {
            const log = makeRunLog({
                toolCalls: [
                    makeToolCall({ sequence: 1, tool: 'get_event_catalog' }),
                    makeToolCall({ sequence: 2, tool: 'query_telemetry' }),
                    makeToolCall({ sequence: 3, tool: 'get_tenant_mapping' })
                ]
            });
            const report = generateRunReport(log);
            expect(report).toContain('`get_event_catalog`');
            expect(report).toContain('`query_telemetry`');
            expect(report).toContain('`get_tenant_mapping`');
        });
    });

    // ─── Findings ─────────────────────────────────────────────────────────────

    describe('findings', () => {
        it('contains ## Findings heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Findings');
        });

        it('renders findings text', () => {
            const report = generateRunReport(makeRunLog({ findings: 'Error rate is 3.5%.' }));
            expect(report).toContain('Error rate is 3.5%.');
        });

        it('shows placeholder when findings empty', () => {
            const report = generateRunReport(makeRunLog({ findings: '' }));
            expect(report).toContain('_No findings recorded._');
        });
    });

    // ─── Assessment ───────────────────────────────────────────────────────────

    describe('assessment', () => {
        it('contains ## Assessment heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Assessment');
        });

        it('renders assessment text', () => {
            const report = generateRunReport(makeRunLog({ assessment: 'Action needed.' }));
            expect(report).toContain('Action needed.');
        });

        it('shows placeholder when assessment empty', () => {
            const report = generateRunReport(makeRunLog({ assessment: '' }));
            expect(report).toContain('_No assessment recorded._');
        });
    });

    // ─── Actions ─────────────────────────────────────────────────────────────

    describe('actions', () => {
        it('contains ## Actions Taken heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## Actions Taken');
        });

        it('shows placeholder when no actions', () => {
            const report = generateRunReport(makeRunLog({ actions: [] }));
            expect(report).toContain('_No actions taken._');
        });

        it('renders sent action with checkmark', () => {
            const log = makeRunLog({ actions: [makeAction({ status: 'sent' })] });
            const report = generateRunReport(log);
            expect(report).toContain('✅ sent');
        });

        it('renders failed action with cross', () => {
            const log = makeRunLog({ actions: [makeAction({ status: 'failed' })] });
            const report = generateRunReport(log);
            expect(report).toContain('❌ failed');
        });

        it('renders action type', () => {
            const log = makeRunLog({ actions: [makeAction({ type: 'teams-webhook' })] });
            const report = generateRunReport(log);
            expect(report).toContain('teams-webhook');
        });

        it('renders action title from details', () => {
            const log = makeRunLog({ actions: [makeAction({ details: { title: 'Critical Alert' } })] });
            const report = generateRunReport(log);
            expect(report).toContain('Critical Alert');
        });

        it('renders action channel from details', () => {
            const log = makeRunLog({ actions: [makeAction({ details: { channel: '#alerts' } })] });
            const report = generateRunReport(log);
            expect(report).toContain('channel: #alerts');
        });

        it('renders multiple actions', () => {
            const log = makeRunLog({
                actions: [
                    makeAction({ type: 'teams-webhook', status: 'sent' }),
                    makeAction({ type: 'email-smtp', status: 'failed' })
                ]
            });
            const report = generateRunReport(log);
            expect(report).toContain('teams-webhook');
            expect(report).toContain('email-smtp');
        });
    });

    // ─── State Changes ────────────────────────────────────────────────────────

    describe('stateChanges', () => {
        it('contains ## State Changes heading', () => {
            const report = generateRunReport(makeRunLog());
            expect(report).toContain('## State Changes');
        });

        it('shows placeholder when no state changes', () => {
            const report = generateRunReport(makeRunLog({
                stateChanges: { issuesCreated: [], issuesUpdated: [], issuesResolved: [], summaryUpdated: false }
            }));
            expect(report).toContain('_No state changes._');
        });

        it('shows summaryUpdated message', () => {
            const report = generateRunReport(makeRunLog({
                stateChanges: { issuesCreated: [], issuesUpdated: [], issuesResolved: [], summaryUpdated: true }
            }));
            expect(report).toContain('Summary updated');
        });

        it('shows created issue IDs', () => {
            const report = generateRunReport(makeRunLog({
                stateChanges: { issuesCreated: ['issue-abc', 'issue-def'], issuesUpdated: [], issuesResolved: [], summaryUpdated: false }
            }));
            expect(report).toContain('`issue-abc`');
            expect(report).toContain('`issue-def`');
            expect(report).toContain('created');
        });

        it('shows updated issue IDs', () => {
            const report = generateRunReport(makeRunLog({
                stateChanges: { issuesCreated: [], issuesUpdated: ['issue-xyz'], issuesResolved: [], summaryUpdated: false }
            }));
            expect(report).toContain('`issue-xyz`');
            expect(report).toContain('updated');
        });

        it('shows resolved issue IDs', () => {
            const report = generateRunReport(makeRunLog({
                stateChanges: { issuesCreated: [], issuesUpdated: [], issuesResolved: ['issue-999'], summaryUpdated: false }
            }));
            expect(report).toContain('`issue-999`');
            expect(report).toContain('resolved');
        });
    });

    // ─── Text Truncation ─────────────────────────────────────────────────────

    describe('text truncation', () => {
        it('truncates prior summary longer than 200 chars', () => {
            const longSummary = 'A'.repeat(300);
            const report = generateRunReport(makeRunLog({
                stateAtStart: { summary: longSummary, activeIssueCount: 0, runCount: 0 }
            }));
            // 200 chars then ellipsis
            expect(report).toContain('…');
            expect(report).not.toContain('A'.repeat(201));
        });

        it('does not truncate prior summary <= 200 chars', () => {
            const shortSummary = 'A'.repeat(200);
            const report = generateRunReport(makeRunLog({
                stateAtStart: { summary: shortSummary, activeIssueCount: 0, runCount: 0 }
            }));
            expect(report).toContain(shortSummary);
        });

        it('truncates tool result summary longer than 120 chars', () => {
            const longResult = 'B'.repeat(150);
            const log = makeRunLog({ toolCalls: [makeToolCall({ resultSummary: longResult })] });
            const report = generateRunReport(log);
            expect(report).toContain('…');
            expect(report).not.toContain('B'.repeat(121));
        });
    });

    // ─── Output Structure ────────────────────────────────────────────────────

    describe('output structure', () => {
        it('ends with a newline', () => {
            const report = generateRunReport(makeRunLog());
            expect(report.endsWith('\n')).toBe(true);
        });

        it('returns a string', () => {
            const report = generateRunReport(makeRunLog());
            expect(typeof report).toBe('string');
        });

        it('contains all required sections in order', () => {
            const report = generateRunReport(makeRunLog());
            const sections = ['## Summary', '## Instruction', '## State at Start', '## Tool Calls', '## Findings', '## Assessment', '## Actions Taken', '## State Changes'];
            let lastIdx = -1;
            for (const section of sections) {
                const idx = report.indexOf(section);
                expect(idx).toBeGreaterThan(lastIdx);
                lastIdx = idx;
            }
        });
    });
});

// ─── createInvestigationReport Tests ─────────────────────────────────────────

describe('createInvestigationReport', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-report-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const runLog = makeRunLog({ agentName: 'error-monitor', timestamp: '2026-03-02T14:30:00.000Z', runId: 3 });

    it('creates a new investigation doc with date-time in filename', () => {
        const relPath = createInvestigationReport(tmpDir, 'error-monitor', runLog, '### Run #3 — 14:30 UTC\n\nAll clear.');

        expect(relPath).toBe('docs/2026-03-02-1430-error-monitor.md');
        const content = fs.readFileSync(path.join(tmpDir, 'docs', '2026-03-02-1430-error-monitor.md'), 'utf-8');
        expect(content).toContain('# error-monitor — Investigation Report — 2026-03-02 14:30 UTC');
        expect(content).toContain('Auto-generated by BC Telemetry Buddy');
        expect(content).toContain('### Run #3 — 14:30 UTC');
        expect(content).toContain('All clear.');
    });

    it('creates separate files for different run times', () => {
        createInvestigationReport(tmpDir, 'error-monitor', runLog, '### Run #3\n\nFirst run.');

        const runLog2 = makeRunLog({ agentName: 'error-monitor', timestamp: '2026-03-02T15:30:00.000Z', runId: 4 });
        createInvestigationReport(tmpDir, 'error-monitor', runLog2, '### Run #4\n\nSecond run.');

        // Two separate files should exist
        const file1 = path.join(tmpDir, 'docs', '2026-03-02-1430-error-monitor.md');
        const file2 = path.join(tmpDir, 'docs', '2026-03-02-1530-error-monitor.md');
        expect(fs.existsSync(file1)).toBe(true);
        expect(fs.existsSync(file2)).toBe(true);

        const content1 = fs.readFileSync(file1, 'utf-8');
        const content2 = fs.readFileSync(file2, 'utf-8');
        expect(content1).toContain('First run.');
        expect(content1).not.toContain('Second run.');
        expect(content2).toContain('Second run.');
        expect(content2).not.toContain('First run.');
    });

    it('includes header with date and time', () => {
        createInvestigationReport(tmpDir, 'error-monitor', runLog, '### Run #3\n\nTest.');

        const content = fs.readFileSync(path.join(tmpDir, 'docs', '2026-03-02-1430-error-monitor.md'), 'utf-8');
        expect(content).toContain('# error-monitor — Investigation Report — 2026-03-02 14:30 UTC');
        expect(content).toContain('---');
    });

    it('creates docs directory if it does not exist', () => {
        expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(false);
        createInvestigationReport(tmpDir, 'error-monitor', runLog, '### Run #3\n\nTest.');
        expect(fs.existsSync(path.join(tmpDir, 'docs'))).toBe(true);
    });

    it('returns correct relative path with time component', () => {
        const relPath = createInvestigationReport(tmpDir, 'perf-agent', runLog, '### Run\n\nTest.');
        expect(relPath).toBe('docs/2026-03-02-1430-perf-agent.md');
    });

    it('handles midnight timestamps correctly', () => {
        const midnightLog = makeRunLog({ agentName: 'error-monitor', timestamp: '2026-03-02T00:00:00.000Z', runId: 1 });
        const relPath = createInvestigationReport(tmpDir, 'error-monitor', midnightLog, '### Run\n\nTest.');
        expect(relPath).toBe('docs/2026-03-02-0000-error-monitor.md');
    });

    it('handles late-night timestamps correctly', () => {
        const lateLog = makeRunLog({ agentName: 'error-monitor', timestamp: '2026-03-02T23:59:00.000Z', runId: 1 });
        const relPath = createInvestigationReport(tmpDir, 'error-monitor', lateLog, '### Run\n\nTest.');
        expect(relPath).toBe('docs/2026-03-02-2359-error-monitor.md');
    });
});

// ─── appendToDailyReport backward compatibility ─────────────────────────────

describe('appendToDailyReport (deprecated)', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-report-test-'));
    });

    afterEach(() => {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    const runLog = makeRunLog({ agentName: 'error-monitor', timestamp: '2026-03-02T14:30:00.000Z', runId: 3 });

    it('delegates to createInvestigationReport', () => {
        const relPath = appendToDailyReport(tmpDir, 'error-monitor', runLog, '### Run #3\n\nTest.');
        expect(relPath).toBe('docs/2026-03-02-1430-error-monitor.md');
        expect(fs.existsSync(path.join(tmpDir, 'docs', '2026-03-02-1430-error-monitor.md'))).toBe(true);
    });
});
