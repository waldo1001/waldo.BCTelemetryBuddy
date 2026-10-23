/**
 * Keeps CI workflows and engines.node in step with the runtime security floor
 * — spec docs/specs/134-node-runtime-security-floor.md (AC6, AC7)
 */
import * as fs from 'fs';
import * as path from 'path';
import { enginesRangeFromFloor } from '../runtimeSecurity.js';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');

function readWorkflows(): Array<{ file: string; content: string }> {
    return fs.readdirSync(workflowsDir)
        .filter(f => f.endsWith('.yml') || f.endsWith('.yaml'))
        .map(file => ({ file, content: fs.readFileSync(path.join(workflowsDir, file), 'utf-8') }));
}

function nodeVersionValues(content: string): string[] {
    return [...content.matchAll(/node-version:\s*(.+)/g)].map(m => m[1].trim());
}

describe('Node.js floor consistency', () => {
    it('AC6: no workflow uses Node < 22; CI matrices are [22.x, 24.x]; release/codeql use 22.x', () => {
        const workflows = readWorkflows();
        expect(workflows.length).toBeGreaterThan(0);

        for (const { file, content } of workflows) {
            for (const value of nodeVersionValues(content)) {
                if (value.startsWith('${{')) {
                    continue; // matrix reference, checked below
                }
                const versions = value.startsWith('[')
                    ? value.replace(/[[\]]/g, '').split(',').map(v => v.trim())
                    : [value];
                for (const v of versions) {
                    const major = parseInt(v, 10);
                    expect({ file, v, ok: major >= 22 }).toEqual({ file, v, ok: true });
                }
                if (value.startsWith('[')) {
                    expect({ file, matrix: versions }).toEqual({ file, matrix: ['22.x', '24.x'] });
                } else if (/^(release-|codeql)/.test(file)) {
                    expect({ file, value }).toEqual({ file, value: '22.x' });
                }
            }
        }

        const ci = workflows.find(w => w.file === 'ci.yml');
        expect(ci).toBeDefined();
        expect(nodeVersionValues(ci!.content)).toContain('[22.x, 24.x]');
    });

    it('AC7: root and mcp engines.node equal the floor-derived range', () => {
        const expected = '^22.23.4 || ^24.22.1 || >=26.12.1';
        expect(enginesRangeFromFloor()).toBe(expected);

        const rootPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf-8'));
        const mcpPkg = JSON.parse(fs.readFileSync(path.join(repoRoot, 'packages', 'mcp', 'package.json'), 'utf-8'));

        expect(rootPkg.engines?.node).toBe(expected);
        expect(mcpPkg.engines?.node).toBe(expected);
    });
});
