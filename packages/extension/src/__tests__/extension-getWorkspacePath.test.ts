/**
 * Tests for getActiveWorkspacePath() — extracted from extension.ts file-private
 * getWorkspacePath() so it picks the workspace folder containing .bctb-config.json
 * in multi-root setups.
 *
 * See plan: docs/plans/kb-webview-multiroot-path.md
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { getActiveWorkspacePath } from '../services/workspaceFinder';

jest.mock('fs');
const mockedFs = jest.mocked(fs);

function setFolders(paths: string[] | undefined) {
    if (paths === undefined) {
        (vscode.workspace as any).workspaceFolders = undefined;
        return;
    }
    (vscode.workspace as any).workspaceFolders = paths.map((p, i) => ({
        uri: { fsPath: p },
        name: p.split(/[\\/]/).pop(),
        index: i,
    }));
}

beforeEach(() => {
    jest.resetAllMocks();
    setFolders(undefined);
});

describe('getActiveWorkspacePath', () => {
    it('returns the workspace folder containing .bctb-config.json in a multi-root workspace', () => {
        setFolders(['/folderA', '/folderB', '/folderC']);
        // Only folderC has the config
        mockedFs.existsSync.mockImplementation((p: fs.PathLike) => String(p).includes('folderC'));

        expect(getActiveWorkspacePath()).toBe('/folderC');
    });

    it('returns the only folder in a single-root workspace (regardless of config presence)', () => {
        setFolders(['/only']);
        mockedFs.existsSync.mockReturnValue(false);
        expect(getActiveWorkspacePath()).toBe('/only');

        mockedFs.existsSync.mockReturnValue(true);
        expect(getActiveWorkspacePath()).toBe('/only');
    });

    it('returns undefined when no workspace is open', () => {
        setFolders(undefined);
        expect(getActiveWorkspacePath()).toBeUndefined();
    });

    it('falls back to folders[0] in multi-root when no folder has a config (matches findConfigWorkspace)', () => {
        setFolders(['/first', '/second']);
        mockedFs.existsSync.mockReturnValue(false);
        expect(getActiveWorkspacePath()).toBe('/first');
    });
});
