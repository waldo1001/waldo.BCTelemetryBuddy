/**
 * Regression test for the v3.5.0 `npx bc-telemetry-buddy-mcp` breakage.
 *
 * v3.5.0 added multiple bins (bctb-setup*) with none matching the package
 * name, so `npx -y bc-telemetry-buddy-mcp start` failed with
 * "could not determine executable to run" and the MCP server never launched
 * (Claude Desktop: "Server disconnected"). The fix is a bin alias whose key
 * equals the package name, pointing at the CLI entry.
 *
 * See docs/plans/done/mcp-bin-package-name-alias.md
 */

import * as fs from 'fs';
import * as path from 'path';

describe('package.json bin map', () => {
    const pkg = JSON.parse(
        fs.readFileSync(path.join(__dirname, '..', '..', 'package.json'), 'utf8')
    ) as { name: string; bin: Record<string, string> };

    it('exposes a bin named after the package so `npx bc-telemetry-buddy-mcp` resolves', () => {
        expect(pkg.bin).toBeDefined();
        expect(Object.keys(pkg.bin)).toContain(pkg.name);
    });

    it('package-name bin points to the CLI entry (dist/cli.js)', () => {
        expect(pkg.bin[pkg.name]).toBe(pkg.bin['bctb-mcp']);
        expect(pkg.bin[pkg.name]).toMatch(/dist\/cli\.js$/);
    });
});
