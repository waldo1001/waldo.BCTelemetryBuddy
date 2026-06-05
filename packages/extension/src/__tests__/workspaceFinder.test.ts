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

    // ═══ Priority Folder Tests (Phase 2 Enhancement) ═══

    describe('Priority folder detection (multi-root only)', () => {
        it('should prioritize Telemetry folder in multi-root workspace', () => {
            mockFolders(['/App', '/Telemetry', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Telemetry');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Telemetry');
            expect(result!.configFilePath).toMatch(/Telemetry.*\.bctb-config\.json$/);
        });

        it('should prioritize Monitoring folder in multi-root workspace', () => {
            mockFolders(['/App', '/Monitoring', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Monitoring');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Monitoring');
            expect(result!.configFilePath).toMatch(/Monitoring.*\.bctb-config\.json$/);
        });

        it('should prioritize Analytics folder in multi-root workspace', () => {
            mockFolders(['/App', '/Analytics', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Analytics');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Analytics');
            expect(result!.configFilePath).toMatch(/Analytics.*\.bctb-config\.json$/);
        });

        it('should prioritize Insights folder in multi-root workspace', () => {
            mockFolders(['/App', '/Insights', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Insights');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Insights');
            expect(result!.configFilePath).toMatch(/Insights.*\.bctb-config\.json$/);
        });

        it('should match TELEMETRY (uppercase) in multi-root workspace', () => {
            mockFolders(['/App', '/TELEMETRY', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('TELEMETRY');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/TELEMETRY');
            expect(result!.configFilePath).toMatch(/TELEMETRY.*\.bctb-config\.json$/);
        });

        it('should match Monitoring (mixed case) in multi-root workspace', () => {
            mockFolders(['/App', '/MoNiToRiNg', '/Test']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('MoNiToRiNg');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/MoNiToRiNg');
        });

        it('should prefer Telemetry over Monitoring when both exist', () => {
            mockFolders(['/App', '/Monitoring', '/Telemetry', '/Test']);

            // Both have config
            mockedFs.existsSync.mockReturnValue(true);

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Telemetry');
        });

        it('should prefer Monitoring over Analytics when both exist', () => {
            mockFolders(['/App', '/Analytics', '/Monitoring', '/Test']);

            mockedFs.existsSync.mockReturnValue(true);

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Monitoring');
        });

        it('should fall back to first folder when priority folder has no config', () => {
            mockFolders(['/App', '/Telemetry', '/Test']);

            // Only App has config, Telemetry doesn't
            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('App');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/App');
        });

        it('should skip priority folders in PRIORITY 2 loop', () => {
            mockFolders(['/Telemetry', '/App', '/Monitoring']);

            // Only Monitoring has config (should find it in priority 1, not loop)
            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Monitoring');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Monitoring');
        });

        it('should return first folder with config when no priority folders exist', () => {
            mockFolders(['/App', '/Test', '/Database']);

            // App has config
            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('App');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/App');
        });

        it('should NOT apply priority logic in single-folder workspace', () => {
            mockFolders(['/Telemetry']);

            mockedFs.existsSync.mockReturnValue(true);

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Telemetry');
            // Should work, but priority logic doesn't activate (only 1 folder)
        });

        it('should handle priority folder as NOT first in list', () => {
            mockFolders(['/App', '/Test', '/Monitoring', '/Database']);

            mockedFs.existsSync.mockImplementation((p: fs.PathLike) => {
                return String(p).includes('Monitoring');
            });

            const result = findConfigWorkspace();
            expect(result!.workspacePath).toBe('/Monitoring');
        });
    });
});
