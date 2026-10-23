/**
 * Keeps codecov.yml in step with the coverage uploads ci.yml produces
 * — plan docs/plans/codecov-upload-stability.md (#140, AC1–AC3)
 */
import * as fs from 'fs';
import * as path from 'path';

const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
const ciYml = fs.readFileSync(path.join(repoRoot, '.github', 'workflows', 'ci.yml'), 'utf-8');
const codecovPath = path.join(repoRoot, 'codecov.yml');

function readCodecov(): string {
    return fs.existsSync(codecovPath) ? fs.readFileSync(codecovPath, 'utf-8') : '';
}

/** Coverage uploads ci.yml produces: per job, codecov-action steps × matrix combinations. */
function expectedUploadCount(content: string): number {
    const jobs = content.split(/\n(?= {2}[A-Za-z0-9_-]+:\s*\n)/);
    let total = 0;
    for (const job of jobs) {
        const uploads = (job.match(/uses:\s*codecov\/codecov-action@/g) || []).length;
        if (uploads === 0) {
            continue;
        }
        const matrix = /\n {6}matrix:\n((?: {8}.+\n)+)/.exec(job);
        let combinations = 1;
        if (matrix) {
            for (const m of matrix[1].matchAll(/^ {8}[\w-]+:\s*\[([^\]]*)\]/gm)) {
                combinations *= m[1].split(',').filter(v => v.trim()).length;
            }
        }
        total += uploads * combinations;
    }
    return total;
}

describe('codecov config consistency', () => {
    it('AC1: after_n_builds equals the upload count derived from ci.yml', () => {
        const codecov = readCodecov();
        const expected = expectedUploadCount(ciYml);
        const notify = /\ncodecov:\n {2}notify:\n {4}after_n_builds:\s*(\d+)/.exec('\n' + codecov);
        const comment = /\ncomment:\n(?: {2}.+\n)*? {2}after_n_builds:\s*(\d+)/.exec('\n' + codecov + '\n');

        expect(expected).toBe(10);
        expect(notify && Number(notify[1])).toBe(expected);
        expect(comment && Number(comment[1])).toBe(expected);
    });

    it('AC1: project status uses target auto with a 0.5% threshold', () => {
        const codecov = readCodecov();

        expect(codecov).toMatch(/ {4}project:\n {6}default:\n {8}target:\s*auto\n {8}threshold:\s*0\.5%/);
    });

    it('AC2: mcp, shared and extension flags carry forward', () => {
        const codecov = readCodecov();

        expect(codecov).toMatch(/flag_management:\n {2}default_rules:\n {4}carryforward:\s*true/);
        for (const flag of ['mcp', 'shared', 'extension']) {
            expect(codecov).toMatch(new RegExp(`- name: ${flag}\\n\\s+paths:`));
        }
    });

    it('AC3: shared jest config emits a json coverage report (coverage-final.json)', () => {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sharedJest = require(path.join(repoRoot, 'packages', 'shared', 'jest.config.js'));

        expect(sharedJest.coverageReporters).toContain('json');
    });
});
