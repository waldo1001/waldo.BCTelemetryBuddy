/**
 * VS Code engine floor — plan docs/plans/done/vscode-engine-floor.md
 *
 * activate() calls vscode.lm.registerMcpServerDefinitionProvider, which is
 * stable from VS Code 1.101.0 (1.100 = proposal, 1.96 = missing).
 */
import * as fs from 'fs';
import * as path from 'path';

const extensionRoot = path.resolve(__dirname, '..', '..');
const pkg = JSON.parse(fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf-8'));

describe('VS Code engine floor', () => {
    it('AC1: engines.vscode is ^1.101.0 (registerMcpServerDefinitionProvider is stable from 1.101)', () => {
        const source = fs.readFileSync(path.join(extensionRoot, 'src', 'extension.ts'), 'utf-8');
        expect(source).toContain('registerMcpServerDefinitionProvider');
        expect(pkg.engines.vscode).toBe('^1.101.0');
    });

    it('AC2: @types/vscode and the integration-test pin match the engine floor', () => {
        expect(pkg.devDependencies['@types/vscode']).toBe('^1.101.0');
        const runTest = fs.readFileSync(path.join(extensionRoot, 'src', 'test', 'runTest.ts'), 'utf-8');
        expect(runTest).toContain("version: '1.101.0'");
    });
});
