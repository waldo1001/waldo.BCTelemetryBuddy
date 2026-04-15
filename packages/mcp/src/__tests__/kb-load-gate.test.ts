/**
 * Tests for the KB eager-load gate in mcpSdkServer.ts.
 *
 * The MCP server must NOT write a community-articles.json cache file into
 * workspaces that have no BCTB config. See docs/plans/skip-kb-load-without-config.md.
 */

const mockLoadAll = jest.fn().mockResolvedValue({ community: [], local: [], excluded: [] });
const mockKbCtor = jest.fn().mockImplementation(() => ({ loadAll: mockLoadAll }));

jest.mock('@bctb/shared', () => ({
    KnowledgeBaseService: mockKbCtor,
}));

import { maybeLoadKnowledgeBase } from '../mcpSdkServer.js';
import type { MCPConfig } from '../config.js';

const baseConfig: MCPConfig = {
    workspacePath: '/tmp/unrelated-workspace',
    connectionName: 'test',
    applicationInsightsAppId: 'test-app-id',
    kustoClusterUrl: 'https://test.kusto.windows.net',
    authFlow: 'azure_cli',
} as any;

describe('maybeLoadKnowledgeBase', () => {
    beforeEach(() => {
        mockLoadAll.mockClear();
        mockKbCtor.mockClear();
    });

    it('does not eager-load KB when no workspace BCTB config file was found', async () => {
        const result = await maybeLoadKnowledgeBase(baseConfig, false);

        expect(result).toBeNull();
        expect(mockKbCtor).not.toHaveBeenCalled();
        expect(mockLoadAll).not.toHaveBeenCalled();
    });

    it('eager-loads KB when a workspace BCTB config file is present', async () => {
        const result = await maybeLoadKnowledgeBase(baseConfig, true);

        expect(result).not.toBeNull();
        expect(mockKbCtor).toHaveBeenCalledTimes(1);
        expect(mockLoadAll).toHaveBeenCalledTimes(1);
    });

    it('returns null and swallows KB load failures (non-fatal)', async () => {
        mockLoadAll.mockRejectedValueOnce(new Error('boom'));

        const result = await maybeLoadKnowledgeBase(baseConfig, true);

        expect(result).toBeNull();
    });
});
