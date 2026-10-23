/**
 * Node.js runtime security floor — spec docs/specs/134-node-runtime-security-floor.md
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    classifyNodeRuntime,
    formatRuntimeWarning,
    reportRuntimeSecurity,
    NODE_SECURITY_ADVISORY_URL
} from '../runtimeSecurity.js';

const COMMON_PROPS = { eventId: 'TB-MCP-007', component: 'mcp', sessionId: 's', installationId: 'i', version: '0.0.0' };

function makeDeps() {
    return {
        warn: jest.fn(),
        track: jest.fn(),
        commonProps: jest.fn(() => ({ ...COMMON_PROPS }))
    };
}

describe('runtimeSecurity', () => {
    describe('classifyNodeRuntime', () => {
        it.each([
            ['20.20.2', { status: 'unpatched', reason: 'eol' }],
            ['18.20.0', { status: 'unpatched', reason: 'eol' }],
            ['23.11.0', { status: 'unpatched', reason: 'eol' }],
            ['25.0.0', { status: 'unpatched', reason: 'eol' }],
            ['22.23.3', { status: 'unpatched', reason: 'below-patched' }],
            ['24.14.0', { status: 'unpatched', reason: 'below-patched' }],
            ['26.10.0', { status: 'unpatched', reason: 'below-patched' }],
            ['22.23.4', { status: 'patched' }],
            ['24.22.1', { status: 'patched' }],
            ['26.12.1', { status: 'patched' }],
            ['24.23.0', { status: 'patched' }],
            ['27.0.0', { status: 'patched' }],
            ['v24.22.1', { status: 'patched' }],
            ['garbage', { status: 'unknown' }],
            ['', { status: 'unknown' }],
            ['24.22', { status: 'unknown' }]
        ])('AC1: classifies %s as %o', (version, expected) => {
            expect(classifyNodeRuntime(version)).toEqual(expected);
        });
    });

    describe('reportRuntimeSecurity', () => {
        let stdoutSpy: jest.SpyInstance;

        beforeEach(() => {
            stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
        });

        afterEach(() => {
            stdoutSpy.mockRestore();
        });

        it('AC2: unpatched runtime writes exactly one warning line to stderr and nothing to stdout', () => {
            const deps = makeDeps();

            reportRuntimeSecurity(deps, '24.14.0');

            expect(deps.warn).toHaveBeenCalledTimes(1);
            const line: string = deps.warn.mock.calls[0][0];
            expect(line).toContain('24.14.0');
            expect(line).toContain('22.23.4');
            expect(line).toContain('24.22.1');
            expect(line).toContain('26.12.1');
            expect(line).toContain(NODE_SECURITY_ADVISORY_URL);
            expect(line).not.toContain('\n');
            expect(stdoutSpy).not.toHaveBeenCalled();
        });

        it('AC2: EOL runtime warning says the line is end-of-life', () => {
            expect(formatRuntimeWarning('20.20.2', 'eol')).toMatch(/end-of-life/i);
            expect(formatRuntimeWarning('24.14.0', 'below-patched')).not.toMatch(/end-of-life/i);
        });

        it('AC3: unpatched runtime fires one Mcp.RuntimeUnpatched event with nodeVersion + reason only', () => {
            const deps = makeDeps();

            reportRuntimeSecurity(deps, '20.20.2');

            expect(deps.track).toHaveBeenCalledTimes(1);
            const [name, props] = deps.track.mock.calls[0];
            expect(name).toBe('Mcp.RuntimeUnpatched');
            expect(props).toEqual({ ...COMMON_PROPS, nodeVersion: '20.20.2', reason: 'eol' });
        });

        it('AC4: patched runtime warns nothing and tracks nothing', () => {
            const deps = makeDeps();

            const result = reportRuntimeSecurity(deps, '24.22.1');

            expect(result).toEqual({ status: 'patched' });
            expect(deps.warn).not.toHaveBeenCalled();
            expect(deps.track).not.toHaveBeenCalled();
        });

        it('AC5: unknown version warns nothing, tracks nothing, does not throw', () => {
            const deps = makeDeps();

            expect(() => reportRuntimeSecurity(deps, 'not-a-version')).not.toThrow();
            expect(deps.warn).not.toHaveBeenCalled();
            expect(deps.track).not.toHaveBeenCalled();
        });

        it('AC5: never throws when warn, track or commonProps throw', () => {
            const boom = () => { throw new Error('boom'); };

            expect(() => reportRuntimeSecurity({ warn: boom, track: jest.fn(), commonProps: () => ({}) }, '20.0.0')).not.toThrow();
            expect(() => reportRuntimeSecurity({ warn: jest.fn(), track: boom, commonProps: () => ({}) }, '20.0.0')).not.toThrow();
            expect(() => reportRuntimeSecurity({ warn: jest.fn(), track: jest.fn(), commonProps: boom }, '20.0.0')).not.toThrow();
        });

        it('AC5: still warns when telemetry throws', () => {
            const deps = makeDeps();
            deps.track.mockImplementation(() => { throw new Error('telemetry down'); });

            reportRuntimeSecurity(deps, '24.14.0');

            expect(deps.warn).toHaveBeenCalledTimes(1);
        });

        it('defaults to the running process version', () => {
            const deps = makeDeps();
            const expected = classifyNodeRuntime(process.versions.node);

            expect(reportRuntimeSecurity(deps)).toEqual(expected);
        });
    });

    describe('startup wiring', () => {
        const srcDir = path.join(__dirname, '..');

        it('AC2/AC3: stdio startup reports runtime security once, after services are initialized', () => {
            const source = fs.readFileSync(path.join(srcDir, 'mcpSdkServer.ts'), 'utf-8');
            const body = source.slice(source.indexOf('export async function startSdkStdioServer'));

            expect(source).toContain("from './runtimeSecurity.js'");
            expect(body.match(/reportRuntimeSecurity\(/g)).toHaveLength(1);
            expect(body.indexOf('reportRuntimeSecurity(')).toBeGreaterThan(body.indexOf('initializeServices('));
            expect(body.indexOf('reportRuntimeSecurity(')).toBeLessThan(body.indexOf('new StdioServerTransport('));
        });

        it('AC2/AC3: HTTP MCPServer reports runtime security once, guarded to HTTP mode', () => {
            const source = fs.readFileSync(path.join(srcDir, 'server.ts'), 'utf-8');

            expect(source).toContain("from './runtimeSecurity.js'");
            expect(source.match(/reportRuntimeSecurity\(/g)).toHaveLength(1);
            expect(source).toMatch(/if\s*\(\s*!this\.isStdioMode\s*\)\s*\{\s*reportRuntimeSecurity\(/);
        });
    });
});
