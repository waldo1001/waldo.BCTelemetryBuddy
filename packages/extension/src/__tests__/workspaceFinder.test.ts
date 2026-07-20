/**
 * Tests for workspaceFinder.ts — findConfigWorkspace()
 *
 * Validates multiroot workspace config discovery:
 * - Returns undefined when no workspace folders are open
 * - Returns the first folder that contains .bctb-config.json
 * - Falls back to the first folder when none contain a config
 * - Stops searching after the first match
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import { findConfigWorkspace } from '../services/workspaceFinder';

jest.mock('fs');
const mockedFs = jest.mocked(fs);

function mockFolders(paths: string[]) {
    (vscode.workspace as any).workspaceFolders = paths.map(p => ({
        uri: { fsPath: p },
        name: p.split(/[\\/]/).pop(),
        index: 0,
    }));
}

beforeEach(() => {
    jest.resetAllMocks();
    (vscode.workspace as any).workspaceFolders = undefined;
});

describe('findConfigWorkspace', () => {
    it('should return undefined when no workspace folders are open', () => {
        (vscode.workspace as any).workspaceFolders = undefined;
        expect(findConfigWorkspace()).toBeUndefined();
    });

    it('should return undefined when workspace folders array is empty', () => {
        (vscode.workspace as any).workspaceFolders = [];
        expect(findConfigWorkspace()).toBeUndefined();
    });

    it('should return first folder with config when only one folder has it', () => {
        mockFolders(['/folderA', '/folderB', '/folderC']);

        // Only /folderB has the config
        mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('folderB');
        });

        const result = findConfigWorkspace();
        expect(result).toEqual({
            workspacePath: '/folderB',
            configFilePath: expect.stringContaining('folderB'),
        });
        expect(result!.configFilePath).toMatch(/folderB.*\.bctb-config\.json$/);
    });

    it('should return the FIRST matching folder when multiple have configs', () => {
        mockFolders(['/folderA', '/folderB', '/folderC']);

        // Both B and C have configs — should pick B (first match)
        mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
            const s = String(p);
            return s.includes('folderB') || s.includes('folderC');
        });

        const result = findConfigWorkspace();
        expect(result!.workspacePath).toBe('/folderB');
    });

    it('should return config in first folder if it has one (original behavior)', () => {
        mockFolders(['/first', '/second']);

        mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('first');
        });

        const result = findConfigWorkspace();
        expect(result).toEqual({
            workspacePath: '/first',
            configFilePath: expect.stringContaining('first'),
        });
    });

    it('should fall back to first folder when NO folder has a config', () => {
        mockFolders(['/folderA', '/folderB']);

        mockedFs.existsSync.mockReturnValue(false);

        const result = findConfigWorkspace();
        expect(result).toEqual({
            workspacePath: '/folderA',
            configFilePath: undefined,
        });
    });

    it('should work with Windows-style paths', () => {
        mockFolders(['C:\\Users\\dev\\projectA', 'C:\\Users\\dev\\projectB']);

        mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
            return String(p).includes('projectB');
        });

        const result = findConfigWorkspace();
        expect(result!.workspacePath).toBe('C:\\Users\\dev\\projectB');
        expect(result!.configFilePath).toMatch(/projectB.*\.bctb-config\.json$/);
    });

    it('should handle single workspace folder with config', () => {
        mockFolders(['/only-folder']);
        mockedFs.existsSync.mockReturnValue(true);

        const result = findConfigWorkspace();
        expect(result!.workspacePath).toBe('/only-folder');
        expect(result!.configFilePath).toBeDefined();
    });

    it('should handle single workspace folder without config', () => {
        mockFolders(['/only-folder']);
        mockedFs.existsSync.mockReturnValue(false);

        const result = findConfigWorkspace();
        expect(result).toEqual({
            workspacePath: '/only-folder',
            configFilePath: undefined,
        });
    });
});
