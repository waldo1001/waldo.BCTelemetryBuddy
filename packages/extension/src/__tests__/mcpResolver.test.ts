import * as fs from 'fs';
import * as path from 'path';
import { resolveMcpServer } from '../services/mcpResolver';

// Mock fs
jest.mock('fs');
const mockExistsSync = fs.existsSync as jest.MockedFunction<typeof fs.existsSync>;

// Mock mcpInstaller (only isMCPInPath is used by mcpResolver)
jest.mock('../services/mcpInstaller', () => ({
    isMCPInPath: jest.fn()
}));
import { isMCPInPath } from '../services/mcpInstaller';
const mockIsMCPInPath = isMCPInPath as jest.MockedFunction<typeof isMCPInPath>;

describe('mcpResolver', () => {
    const extensionPath = '/mock/extension';
    const expectedBundledPath = path.join(extensionPath, 'mcp', 'dist', 'launcher.js');

    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('resolveMcpServer', () => {
        it('should use global when preferGlobal is true, even if bundled exists', async () => {
            mockExistsSync.mockReturnValue(true); // bundled exists
            const result = await resolveMcpServer(extensionPath, true);
            expect(result.mode).toBe('global');
            expect(result.bundledPath).toBeUndefined();
            // Should not even check PATH when preferGlobal is set
            expect(mockIsMCPInPath).not.toHaveBeenCalled();
        });

        it('should use global when preferGlobal is true and bundled does not exist', async () => {
            mockExistsSync.mockReturnValue(false);
            const result = await resolveMcpServer(extensionPath, true);
            expect(result.mode).toBe('global');
        });

        it('should use global when global is in PATH and bundled exists', async () => {
            mockExistsSync.mockReturnValue(true);
            mockIsMCPInPath.mockResolvedValue(true);
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('global');
            expect(result.bundledPath).toBeUndefined();
        });

        it('should use global when global is in PATH and bundled does not exist', async () => {
            mockExistsSync.mockReturnValue(false);
            mockIsMCPInPath.mockResolvedValue(true);
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('global');
        });

        it('should fall back to bundled when global is NOT in PATH and bundled exists', async () => {
            mockExistsSync.mockReturnValue(true);
            mockIsMCPInPath.mockResolvedValue(false);
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('bundled');
            expect(result.bundledPath).toBe(expectedBundledPath);
        });

        it('should fall back to global when nothing is available (no PATH, no bundled)', async () => {
            mockExistsSync.mockReturnValue(false);
            mockIsMCPInPath.mockResolvedValue(false);
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('global');
            // No bundled path since file doesn't exist
            expect(result.bundledPath).toBeUndefined();
        });

        it('should fall back to bundled when isMCPInPath throws an error', async () => {
            mockExistsSync.mockReturnValue(true);
            mockIsMCPInPath.mockRejectedValue(new Error('command not found'));
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('bundled');
            expect(result.bundledPath).toBe(expectedBundledPath);
        });

        it('should fall back to global when isMCPInPath throws and no bundled exists', async () => {
            mockExistsSync.mockReturnValue(false);
            mockIsMCPInPath.mockRejectedValue(new Error('command not found'));
            const result = await resolveMcpServer(extensionPath, false);
            expect(result.mode).toBe('global');
        });

        describe('with isGlobalInPath override (testability)', () => {
            it('should use global when override says true', async () => {
                mockExistsSync.mockReturnValue(true);
                const result = await resolveMcpServer(extensionPath, false, true);
                expect(result.mode).toBe('global');
                // Should NOT call the real isMCPInPath when override is provided
                expect(mockIsMCPInPath).not.toHaveBeenCalled();
            });

            it('should use bundled when override says false and bundled exists', async () => {
                mockExistsSync.mockReturnValue(true);
                const result = await resolveMcpServer(extensionPath, false, false);
                expect(result.mode).toBe('bundled');
                expect(mockIsMCPInPath).not.toHaveBeenCalled();
            });
        });

        describe('resolution priority order', () => {
            it('preferGlobal trumps everything - even when global is NOT in PATH', async () => {
                mockExistsSync.mockReturnValue(true); // bundled exists
                // Don't even need to set up isMCPInPath - preferGlobal shortcuts
                const result = await resolveMcpServer(extensionPath, true);
                expect(result.mode).toBe('global');
            });

            it('global in PATH takes priority over bundled', async () => {
                mockExistsSync.mockReturnValue(true); // bundled exists
                mockIsMCPInPath.mockResolvedValue(true); // global exists too
                const result = await resolveMcpServer(extensionPath, false);
                // Global wins even though bundled is available
                expect(result.mode).toBe('global');
            });

            it('bundled is only used when global is not available', async () => {
                mockExistsSync.mockReturnValue(true); // bundled exists
                mockIsMCPInPath.mockResolvedValue(false); // no global
                const result = await resolveMcpServer(extensionPath, false);
                expect(result.mode).toBe('bundled');
            });
        });
    });
});
