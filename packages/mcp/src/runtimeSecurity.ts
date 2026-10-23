/**
 * Node.js runtime security floor — spec docs/specs/134-node-runtime-security-floor.md
 *
 * Single source for the minimum patched Node.js version per release line.
 * A future advisory changes NODE_SECURITY_FLOOR (+ the advisory URL) and the
 * engines.node strings, which node-floor-consistency.test.ts keeps in step.
 */

export const NODE_SECURITY_FLOOR: ReadonlyArray<{ major: number; minimum: string }> = [
    { major: 22, minimum: '22.23.4' },
    { major: 24, minimum: '24.22.1' },
    { major: 26, minimum: '26.12.1' }
];

export const NODE_SECURITY_ADVISORY_URL = 'https://nodejs.org/en/blog/vulnerability/october-2026-security-releases';

export type RuntimeClassification =
    | { status: 'patched' }
    | { status: 'unpatched'; reason: 'eol' | 'below-patched' }
    | { status: 'unknown' };

export interface RuntimeSecurityDeps {
    warn: (line: string) => void;
    track: (name: string, props: Record<string, string | number | boolean>) => void;
    commonProps: () => Record<string, string | number | boolean>;
}

function parseVersion(version: string): [number, number, number] | undefined {
    const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
    return match ? [Number(match[1]), Number(match[2]), Number(match[3])] : undefined;
}

function compareVersions(a: [number, number, number], b: [number, number, number]): number {
    return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

export function classifyNodeRuntime(version: string): RuntimeClassification {
    const parsed = parseVersion(version);
    if (!parsed) {
        return { status: 'unknown' };
    }

    const highestFloorMajor = NODE_SECURITY_FLOOR[NODE_SECURITY_FLOOR.length - 1].major;
    if (parsed[0] > highestFloorMajor) {
        return { status: 'patched' };
    }

    const line = NODE_SECURITY_FLOOR.find(f => f.major === parsed[0]);
    if (!line) {
        // Below the lowest supported line, or an odd (non-LTS) line in between: both EOL
        return { status: 'unpatched', reason: 'eol' };
    }

    return compareVersions(parsed, parseVersion(line.minimum)!) >= 0
        ? { status: 'patched' }
        : { status: 'unpatched', reason: 'below-patched' };
}

export function formatRuntimeWarning(version: string, reason: 'eol' | 'below-patched'): string {
    const minimums = NODE_SECURITY_FLOOR.map(f => f.minimum);
    const upgrade = `${minimums.slice(0, -1).join(', ')} or ${minimums[minimums.length - 1]} or later`;
    const problem = reason === 'eol'
        ? `Node.js v${version} is end-of-life and no longer receives security fixes`
        : `Node.js v${version} is missing security fixes`;
    return `⚠️  ${problem} (Node.js Oct 2026 security release, incl. CVE-2026-111497). Upgrade to ${upgrade}: ${NODE_SECURITY_ADVISORY_URL}`;
}

export function enginesRangeFromFloor(): string {
    return NODE_SECURITY_FLOOR
        .map((f, i) => (i === NODE_SECURITY_FLOOR.length - 1 ? `>=${f.minimum}` : `^${f.minimum}`))
        .join(' || ');
}

/**
 * Warns (stderr) and tracks telemetry when running on an unpatched Node.js.
 * Never throws: a failing check must not affect server startup.
 */
export function reportRuntimeSecurity(deps: RuntimeSecurityDeps, version: string = process.versions.node): RuntimeClassification {
    let classification: RuntimeClassification = { status: 'unknown' };
    try {
        classification = classifyNodeRuntime(version);
    } catch {
        return classification;
    }

    if (classification.status !== 'unpatched') {
        return classification;
    }

    try {
        deps.warn(formatRuntimeWarning(version, classification.reason));
    } catch {
        // Ignore: warning output must never break startup
    }

    try {
        deps.track('Mcp.RuntimeUnpatched', {
            ...deps.commonProps(),
            nodeVersion: version.replace(/^v/, ''),
            reason: classification.reason
        });
    } catch {
        // Ignore: telemetry must never break startup
    }

    return classification;
}
