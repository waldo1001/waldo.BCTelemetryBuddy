/**
 * Tests for the KB eager-load gate in mcpSdkServer.ts.
 *
 * The MCP server must NOT write a community-articles.json cache file into
 * workspaces that have no workspace-local `.bctb-config.json` — even if
 * `loadConfigFromFile` fell back to a home-directory config.
 * See docs/plans/skip-kb-load-without-workspace-config.md.
 */

const mockLoadAll = jest.fn().mockResolvedValue({ community: [], local: [], excluded: [] });
const mockKbCtor = jest.fn().mockImplementation(() => ({ loadAll: mockLoadAll }));

jest.mock('@bctb/shared', () => ({
    KnowledgeBaseService: mockKbCtor,
}));

const mockExistsSync = jest.fn();
jest.mock('fs', () => ({
    ...jest.requireActual('fs'),
    existsSync: (...args: any[]) => mockExistsSync(...args),
}));

import { maybeLoadKnowledgeBase } from '../mcpSdkServer.js';
import type { MCPConfig } from '../config.js';
import * as path from 'path';

const baseConfig: MCPConfig = {
    workspacePath: '/tmp/unrelated-workspace',
    connectionName: 'test',
    applicationInsightsAppId: 'test-app-id',
    kustoClusterUrl: 'https://test.kusto.windows.net',
    authFlow: 'azure_cli',
} as any;

describe('maybeLoadKnowledgeBase', () => {
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        mockLoadAll.mockClear();
        mockKbCtor.mockClear();
        mockExistsSync.mockReset();
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
        consoleErrorSpy.mockRestore();
    });

    it('does not eager-load KB when the workspace has no .bctb-config.json (home-dir fallback scenario)', async () => {
        // resolvedConfig is valid (came from ~/.bctb/config.json) but the
        // *workspace* directory itself has no .bctb-config.json.
        mockExistsSync.mockImplementation((p: string) =>
            p !== path.join('/tmp/unrelated-workspace', '.bctb-config.json')
        );

        const result = await maybeLoadKnowledgeBase(baseConfig);

        expect(result.service).toBeNull();
        expect(mockKbCtor).not.toHaveBeenCalled();
        expect(mockLoadAll).not.toHaveBeenCalled();
    });

    it('eager-loads KB when the workspace has a .bctb-config.json', async () => {
        mockExistsSync.mockImplementation((p: string) =>
            p === path.join('/tmp/unrelated-workspace', '.bctb-config.json')
        );

        const result = await maybeLoadKnowledgeBase(baseConfig);

        expect(result.service).not.toBeNull();
        expect(result.reason).toBe('loaded');
        expect(mockKbCtor).toHaveBeenCalledTimes(1);
        expect(mockLoadAll).toHaveBeenCalledTimes(1);
    });

    it('returns a load-failed reason and swallows KB load failures (non-fatal)', async () => {
        mockExistsSync.mockReturnValue(true);
        mockLoadAll.mockRejectedValueOnce(new Error('boom'));

        const result = await maybeLoadKnowledgeBase(baseConfig);

        expect(result.service).toBeNull();
        expect(result.reason).toBe('load-failed');
    });

    it('returns no-workspace-path when workspacePath is empty/unset', async () => {
        mockExistsSync.mockReturnValue(false);
        const configWithoutWorkspace = { ...baseConfig, workspacePath: '' } as MCPConfig;

        const result = await maybeLoadKnowledgeBase(configWithoutWorkspace);

        expect(result.service).toBeNull();
        expect(result.reason).toBe('no-workspace-path');
        expect(mockKbCtor).not.toHaveBeenCalled();
    });

    it('AC5: reports the path it tried and logs a loud diagnostic when the workspace config is missing', async () => {
        const expectedPath = path.join('/tmp/unrelated-workspace', '.bctb-config.json');
        mockExistsSync.mockImplementation((p: string) => p !== expectedPath);

        const result = await maybeLoadKnowledgeBase({ ...baseConfig, workspaceVia: 'cwd' } as MCPConfig);

        expect(result.reason).toBe('no-workspace-config');
        expect(result.workspaceConfigPath).toBe(expectedPath);
        // Loud, diagnosable: the stderr line must name the path it looked for.
        const logged = consoleErrorSpy.mock.calls.map(c => c.join(' ')).join('\n');
        expect(logged).toContain(expectedPath);
    });
});
