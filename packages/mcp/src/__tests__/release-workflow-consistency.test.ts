/**
 * Keeps the release pipeline on npm Trusted Publishing and on Node 24 action majors
 * — plan docs/plans/npm-trusted-publishing.md (#137, AC1–AC4)
 */
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const workflowsDir = path.join(repoRoot, '.github', 'workflows');
const releaseMcp = fs.readFileSync(path.join(workflowsDir, 'release-mcp.yml'), 'utf-8');

const PUBLISH_JOBS = ['publish-npm', 'publish-npm-prerelease'];

const EXPECTED_ACTION_MAJORS: Record<string, string> = {
    'checkout': 'v7',
    'setup-node': 'v7',
    'upload-artifact': 'v7',
    'download-artifact': 'v8',
    'github-script': 'v9',
    'labeler': 'v7',
    'dependency-review-action': 'v5'
};

/** Text of one top-level job (two-space indented key under `jobs:`), up to the next job. */
function jobBlock(content: string, job: string): string {
    const lines = content.split('\n');
    const start = lines.findIndex(l => l === `  ${job}:`);
    if (start < 0) {
        throw new Error(`job ${job} not found`);
    }
    const rest = lines.slice(start + 1);
    const end = rest.findIndex(l => /^ {2}[A-Za-z0-9_-]+:\s*$/.test(l));
    return [lines[start], ...(end < 0 ? rest : rest.slice(0, end))].join('\n');
}

/** Text of one step (by its `name:`), up to the next step. */
function stepBlock(job: string, stepName: string): string | undefined {
    const steps = job.split(/\n(?= {6}- )/);
    return steps.find(s => new RegExp(`- name: ${stepName}\\s*$`, 'm').test(s));
}

describe('release workflow consistency', () => {
    it.each(PUBLISH_JOBS)('AC1: %s requests id-token: write with read-only contents', (job) => {
        const block = jobBlock(releaseMcp, job);
        const permissions = /\n {4}permissions:[^\n]*\n((?: {6}.+\n)+)/.exec(block + '\n');

        expect(permissions).not.toBeNull();
        expect(permissions![1]).toMatch(/^ {6}id-token: write$/m);
        expect(permissions![1]).toMatch(/^ {6}contents: read$/m);
    });

    it('AC1: release-mcp.yml no longer references an npm token', () => {
        expect(releaseMcp).not.toMatch(/NPM_TOKEN/);
        expect(releaseMcp).not.toMatch(/NODE_AUTH_TOKEN/);
    });

    it.each(PUBLISH_JOBS)('AC2: %s installs npm >= 11.5.1 before npm publish', (job) => {
        const block = jobBlock(releaseMcp, job);
        const install = block.search(/npm install -g npm@\^11\.5\.1/);
        const publish = block.search(/npm publish /);

        expect(install).toBeGreaterThan(-1);
        expect(publish).toBeGreaterThan(install);
    });

    it('AC3: publish verification retries and fails the job when the version never appears', () => {
        const verify = stepBlock(jobBlock(releaseMcp, 'publish-npm'), 'Verify NPM publication');

        expect(verify).toBeDefined();
        expect(verify).toMatch(/for \w+ in \$\(seq 1 \d+\)|until /);
        expect(verify).toMatch(/npm view "\$PACKAGE_NAME@\$VERSION" version/);
        expect(verify).toMatch(/exit 1/);
    });

    it('AC4: every actions/* step uses its Node 24 major', () => {
        const files = fs.readdirSync(workflowsDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
        const found: string[] = [];

        for (const file of files) {
            const content = fs.readFileSync(path.join(workflowsDir, file), 'utf-8');
            for (const m of content.matchAll(/uses:\s*actions\/([\w-]+)@(\S+)/g)) {
                const [, action, ref] = m;
                found.push(action);
                expect({ file, action, ref }).toEqual({ file, action, ref: EXPECTED_ACTION_MAJORS[action] });
            }
        }

        expect(found.length).toBeGreaterThan(0);
    });
});
