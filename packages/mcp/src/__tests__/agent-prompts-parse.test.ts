/**
 * Tests for parseAgentOutput — JSON repair of LLM output.
 *
 * Covers:
 * - Strict valid JSON
 * - Trailing comma repair
 * - Ellipsis placeholder repair: [...], {...}, : ...
 * - Truncated JSON recovery
 * - wasTruncated fallback mode
 * - Error cases: empty content, missing required fields
 */

import { parseAgentOutput } from '../agent/prompts.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Return a minimal valid AgentOutput JSON string. */
function validJson(overrides: Record<string, unknown> = {}): string {
    const base = {
        summary: 'All good.',
        findings: 'No issues found.',
        assessment: 'Stable.',
        investigationReport: 'N/A',
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
    return JSON.stringify(base);
}

// ─── Strict valid JSON ────────────────────────────────────────────────────────

describe('parseAgentOutput — strict valid JSON', () => {
    it('parses a complete, valid response', () => {
        const result = parseAgentOutput(validJson());
        expect(result.summary).toBe('All good.');
        expect(result.findings).toBe('No issues found.');
        expect(result.assessment).toBe('Stable.');
        expect(result.activeIssues).toEqual([]);
        expect(result.actions).toEqual([]);
    });

    it('extracts JSON wrapped in markdown code fences', () => {
        const fenced = '```json\n' + validJson() + '\n```';
        const result = parseAgentOutput(fenced);
        expect(result.summary).toBe('All good.');
    });

    it('extracts JSON from plain markdown block without json label', () => {
        const fenced = '```\n' + validJson() + '\n```';
        const result = parseAgentOutput(fenced);
        expect(result.summary).toBe('All good.');
    });
});

// ─── Ellipsis placeholder repair ─────────────────────────────────────────────

describe('parseAgentOutput — ellipsis placeholder repair', () => {
    it('replaces [...] array placeholders with []', () => {
        // LLM uses [...] as a shorthand for a non-empty-but-irrelevant array
        const json = JSON.stringify({
            summary: 'Summary.',
            findings: 'Findings.',
            assessment: 'Assessment.',
        }).replace('{}', '{}') + ''; // no-op to keep TS happy

        const raw = `{
  "summary": "Summary.",
  "findings": "Findings.",
  "assessment": "Assessment.",
  "activeIssues": [...],
  "resolvedIssues": [...],
  "actions": [...],
  "stateChanges": { "issuesCreated": [], "issuesUpdated": [], "issuesResolved": [], "summaryUpdated": true }
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('Summary.');
        expect(result.activeIssues).toEqual([]);
        expect(result.actions).toEqual([]);
    });

    it('replaces {...} object placeholders with {}', () => {
        const raw = `{
  "summary": "S.",
  "findings": "F.",
  "assessment": "A.",
  "activeIssues": [],
  "actions": [],
  "stateChanges": {...}
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('S.');
        // stateChanges replaced with {}, so defaults kick in
        expect(result.stateChanges).toBeDefined();
    });

    it('replaces bare : ... value placeholder with null', () => {
        const raw = `{
  "summary": "S.",
  "findings": "F.",
  "assessment": "A.",
  "activeIssues": [],
  "actions": ...,
  "stateChanges": { "issuesCreated": [], "issuesUpdated": [], "issuesResolved": [], "summaryUpdated": true }
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('S.');
        expect(result.actions).toEqual([]);
    });

    it('handles combined ellipsis patterns in one response', () => {
        // Simulates what a stressed LLM produces after multiple timeouts
        const raw = `{
  "summary": "Critical issues found.",
  "findings": "Multiple failures detected.",
  "assessment": "Needs attention.",
  "investigationReport": "See findings.",
  "activeIssues": [...],
  "resolvedIssues": [...],
  "actions": [...],
  "stateChanges": {...}
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('Critical issues found.');
        expect(result.findings).toBe('Multiple failures detected.');
        expect(result.activeIssues).toEqual([]);
        expect(result.resolvedIssues).toEqual([]);
        expect(result.actions).toEqual([]);
    });
});

// ─── Trailing comma repair ────────────────────────────────────────────────────

describe('parseAgentOutput — trailing comma repair', () => {
    it('removes trailing commas before }', () => {
        const raw = `{
  "summary": "S.",
  "findings": "F.",
  "assessment": "A.",
  "activeIssues": [],
  "actions": [],
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('S.');
    });

    it('removes trailing commas before ]', () => {
        const raw = `{
  "summary": "S.",
  "findings": "F.",
  "assessment": "A.",
  "activeIssues": ["issue1",],
  "actions": [],
}`;
        const result = parseAgentOutput(raw);
        expect(result.summary).toBe('S.');
    });
});

// ─── Truncated JSON recovery ──────────────────────────────────────────────────

describe('parseAgentOutput — truncated JSON recovery', () => {
    it('recovers from truncation with wasTruncated=true', () => {
        const partial = `{
  "summary": "Truncated summary",
  "findings": "Some findings`;
        // wasTruncated=true uses fallback mode — no strict validate throws
        const result = parseAgentOutput(partial, true);
        expect(result.summary).toBe('Truncated summary');
    });

    it('uses fallback values when fields missing and wasTruncated=true', () => {
        const partial = `{
  "summary": "Only summary"`;
        const result = parseAgentOutput(partial, true);
        expect(result.summary).toBe('Only summary');
        expect(result.findings).toBe('(truncated — no findings)');
        expect(result.assessment).toBe('(truncated — no findings)');
    });
});

// ─── Error cases ──────────────────────────────────────────────────────────────

describe('parseAgentOutput — error cases', () => {
    it('throws on empty content', () => {
        expect(() => parseAgentOutput('')).toThrow('Agent produced empty response');
    });

    it('throws when content contains no JSON object', () => {
        expect(() => parseAgentOutput('Just plain text, no JSON here.')).toThrow(
            'Agent did not produce valid JSON output'
        );
    });

    it('throws when required field summary is missing (non-truncated)', () => {
        const raw = JSON.stringify({
            findings: 'F.',
            assessment: 'A.',
            activeIssues: [],
            actions: []
        });
        expect(() => parseAgentOutput(raw, false)).toThrow('Missing required field: summary');
    });

    it('throws when required field findings is missing (non-truncated)', () => {
        const raw = JSON.stringify({
            summary: 'S.',
            assessment: 'A.',
            activeIssues: [],
            actions: []
        });
        expect(() => parseAgentOutput(raw, false)).toThrow('Missing required field: findings');
    });
});
