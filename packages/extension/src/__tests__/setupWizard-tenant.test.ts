/**
 * #150: the Setup Wizard's Test Connection honours tenantId, through a real shell.
 * Spec: docs/specs/150-azure-cli-tenant.md
 *
 * A stub `az` on PATH (az.cmd on Windows) runs through the real exec and real @bctb/shared, so on
 * the windows-latest CI runner this exercises what the reporter's platform does. Only axios is mocked.
 */
jest.mock('vscode', () => ({
    Uri: { joinPath: jest.fn(), file: jest.fn() },
    ViewColumn: { One: 1 },
    window: { createWebviewPanel: jest.fn(), showInformationMessage: jest.fn(), showErrorMessage: jest.fn() },
    workspace: { workspaceFolders: [], getConfiguration: jest.fn(() => ({ get: jest.fn() })) },
    commands: { registerCommand: jest.fn(), executeCommand: jest.fn() },
    env: {},
    ConfigurationTarget: { Workspace: 2, WorkspaceFolder: 3 }
}), { virtual: true });
jest.mock('axios');

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import axios from 'axios';
import { SetupWizardProvider } from '../webviews/SetupWizardProvider';

const mockedAxios = axios as jest.Mocked<typeof axios>;

const RESOURCE = 'https://api.applicationinsights.io';
const GUID_TENANT = '11111111-2222-3333-4444-555555555555';
const DOMAIN_TENANT = 'contoso.onmicrosoft.com';

describe('SetupWizardProvider Test Connection tenant', () => {
    let dir: string;
    let argvFile: string;
    let markerFile: string;
    let originalPath: string | undefined;
    let posted: any[];
    let provider: any;

    function recordedArgv(): string[] {
        return JSON.parse(fs.readFileSync(argvFile, 'utf-8'));
    }

    async function testConnection(tenantId: string): Promise<any> {
        await provider._testConnection({ tenantId, appInsightsId: 'app-id', clusterUrl: '', authFlow: 'azure_cli' });
        return posted.find(m => m.type === 'connectionTest');
    }

    beforeEach(() => {
        dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bctb-az-stub-'));
        argvFile = path.join(dir, 'argv.json');
        markerFile = path.join(dir, 'injected');

        fs.writeFileSync(path.join(dir, 'az-stub.js'), [
            `require('fs').writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));`,
            `process.stdout.write(process.env.STUB_AZ_JSON);`
        ].join('\n'));
        if (process.platform === 'win32') {
            fs.writeFileSync(path.join(dir, 'az.cmd'), '@echo off\r\nnode "%~dp0az-stub.js" %*\r\n');
        } else {
            fs.writeFileSync(path.join(dir, 'az'), '#!/bin/sh\nexec node "$(dirname "$0")/az-stub.js" "$@"\n', { mode: 0o755 });
        }

        originalPath = process.env.PATH;
        process.env.PATH = `${dir}${path.delimiter}${originalPath}`;
        process.env.STUB_AZ_JSON = JSON.stringify({ accessToken: 'stub-token' });
        process.env.STUB_MARKER = markerFile;

        mockedAxios.post.mockReset();
        mockedAxios.post.mockResolvedValue({ data: { tables: [] } });

        posted = [];
        provider = new SetupWizardProvider({ fsPath: '/extension' } as any, { appendLine: jest.fn() } as any);
        provider._panel = { webview: { postMessage: (m: any) => posted.push(m) } };
    });

    afterEach(() => {
        process.env.PATH = originalPath;
        delete process.env.STUB_AZ_JSON;
        delete process.env.STUB_MARKER;
        fs.rmSync(dir, { recursive: true, force: true });
    });

    it('AC2 + AC6: the stub receives tenant and resource as separate, unaltered arguments', async () => {
        const result = await testConnection(GUID_TENANT);

        expect(recordedArgv()).toEqual(['account', 'get-access-token', '--tenant', GUID_TENANT, '--resource', RESOURCE]);
        expect(result.success).toBe(true);
    });

    it('AC6: the JSON from az becomes the bearer token', async () => {
        await testConnection(GUID_TENANT);

        const headers = (mockedAxios.post.mock.calls[0][2] as any).headers;
        expect(headers.Authorization).toBe('Bearer stub-token');
    });

    it.each([
        ['empty', ''],
        ['zero GUID', '00000000-0000-0000-0000-000000000000']
    ])('AC3: omits --tenant for %s tenantId', async (_name, tenantId) => {
        await testConnection(tenantId);

        expect(recordedArgv()).toEqual(['account', 'get-access-token', '--resource', RESOURCE]);
    });

    it('AC4: passes a domain tenant', async () => {
        await testConnection(DOMAIN_TENANT);

        expect(recordedArgv()).toEqual(['account', 'get-access-token', '--tenant', DOMAIN_TENANT, '--resource', RESOURCE]);
    });

    it.each([
        ['semicolon', `x; node -e "require('fs').writeFileSync(process.env.STUB_MARKER,'1')"`],
        ['ampersand', `x & node -e "require('fs').writeFileSync(process.env.STUB_MARKER,'1')"`],
        ['option', '--debug']
    ])('AC5: never starts a process for an injection value: %s', async (_name, tenantId) => {
        const result = await testConnection(tenantId);

        expect(fs.existsSync(argvFile)).toBe(false);
        expect(fs.existsSync(markerFile)).toBe(false);
        expect(mockedAxios.post).not.toHaveBeenCalled();
        expect(result.success).toBe(false);
        expect(result.error).toMatch(/tenantId/);
        expect(result.error).not.toContain(tenantId);
    });

    it('AC8: a 403 names the tenant the token was issued for', async () => {
        process.env.STUB_AZ_JSON = JSON.stringify({ accessToken: 'stub-token', tenant: GUID_TENANT });
        mockedAxios.post.mockRejectedValue({ response: { status: 403, data: { error: { message: 'Denied' } } } });

        const result = await testConnection(GUID_TENANT);

        expect(result.success).toBe(false);
        expect(result.error).toContain(GUID_TENANT);
    });

    it('AC9: a 403 is exactly today\'s message when no tenant is known', async () => {
        mockedAxios.post.mockRejectedValue({ response: { status: 403, data: { error: { message: 'Denied' } } } });

        const result = await testConnection('');

        expect(result.error).toBe('Authentication failed: Denied. Check your App ID and permissions.');
    });
});
