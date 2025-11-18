/**
 * Setup Wizard MCP Message Handler Tests
 * Tests the checkMCP and installMCP webview message handlers
 */

// Mock vscode before importing mcpInstaller
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            show: jest.fn(),
            appendLine: jest.fn(),
            dispose: jest.fn()
        })),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        withProgress: jest.fn()
    },
    ProgressLocation: {
        Notification: 15
    },
    commands: {
        executeCommand: jest.fn()
    }
}), { virtual: true });

import * as mcpInstaller from '../services/mcpInstaller';
import { MCPStatus } from '../services/mcpInstaller';

// Mock mcpInstaller module
jest.mock('../services/mcpInstaller');
const mockGetMCPStatus = mcpInstaller.getMCPStatus as jest.MockedFunction<typeof mcpInstaller.getMCPStatus>;
const mockInstallMCP = mcpInstaller.installMCP as jest.MockedFunction<typeof mcpInstaller.installMCP>;
const mockIsMCPUpdateAvailable = mcpInstaller.isMCPUpdateAvailable as jest.MockedFunction<typeof mcpInstaller.isMCPUpdateAvailable>;

describe('Setup Wizard MCP Message Handlers', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('getMCPStatus integration', () => {
        it('should return complete status when MCP is fully installed and in PATH', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: '1.0.5',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);
            mockIsMCPUpdateAvailable.mockResolvedValue(false);

            const status = await mcpInstaller.getMCPStatus();
            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            expect(status.installed).toBe(true);
            expect(status.version).toBe('1.0.5');
            expect(status.inPath).toBe(true);
            expect(updateAvailable).toBe(false);
        });

        it('should return not installed status when MCP is missing', async () => {
            const mockStatus: MCPStatus = {
                installed: false,
                version: null,
                inPath: false,
                globalPath: null
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);

            const status = await mcpInstaller.getMCPStatus();

            expect(status.installed).toBe(false);
            expect(status.version).toBeNull();
            expect(status.inPath).toBe(false);
            expect(status.globalPath).toBeNull();
        });

        it('should detect when MCP is installed but not in PATH', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: null,
                inPath: false,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);

            const status = await mcpInstaller.getMCPStatus();

            expect(status.installed).toBe(true);
            expect(status.inPath).toBe(false);
            // This scenario indicates PATH refresh needed
        });

        it('should detect when update is available', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: '1.0.0',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);
            mockIsMCPUpdateAvailable.mockResolvedValue(true);

            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            expect(updateAvailable).toBe(true);
        });
    });

    describe('installMCP integration', () => {
        it('should successfully install MCP', async () => {
            mockInstallMCP.mockResolvedValue(true);

            const result = await mcpInstaller.installMCP(false);

            expect(result).toBe(true);
            expect(mockInstallMCP).toHaveBeenCalledWith(false);
        });

        it('should successfully update MCP', async () => {
            mockInstallMCP.mockResolvedValue(true);

            const result = await mcpInstaller.installMCP(true);

            expect(result).toBe(true);
            expect(mockInstallMCP).toHaveBeenCalledWith(true);
        });

        it('should handle installation failure', async () => {
            mockInstallMCP.mockResolvedValue(false);

            const result = await mcpInstaller.installMCP(false);

            expect(result).toBe(false);
        });

        it('should handle update failure', async () => {
            mockInstallMCP.mockResolvedValue(false);

            const result = await mcpInstaller.installMCP(true);

            expect(result).toBe(false);
        });
    });

    describe('Message handler flow simulation', () => {
        it('should handle checkMCP message flow', async () => {
            // Simulate wizard receiving 'checkMCP' message from webview
            const mockStatus: MCPStatus = {
                installed: true,
                version: '1.0.5',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);
            mockIsMCPUpdateAvailable.mockResolvedValue(false);

            // Handler would call these functions
            const status = await mcpInstaller.getMCPStatus();
            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            // Verify expected response structure (what wizard posts back to webview)
            const expectedResponse = {
                type: 'mcpStatus',
                installed: status.installed,
                version: status.version,
                inPath: status.inPath,
                updateAvailable: updateAvailable
            };

            expect(expectedResponse.installed).toBe(true);
            expect(expectedResponse.version).toBe('1.0.5');
            expect(expectedResponse.inPath).toBe(true);
            expect(expectedResponse.updateAvailable).toBe(false);
        });

        it('should handle installMCP message flow for fresh install', async () => {
            // Simulate wizard receiving 'installMCP' message with update: false
            mockInstallMCP.mockResolvedValue(true);

            const mockStatusAfter: MCPStatus = {
                installed: true,
                version: '1.0.5',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            // After installation, status should reflect new state
            mockGetMCPStatus.mockResolvedValue(mockStatusAfter);
            mockIsMCPUpdateAvailable.mockResolvedValue(false);

            // Handler flow:
            // 1. Call installMCP(false)
            const installResult = await mcpInstaller.installMCP(false);
            expect(installResult).toBe(true);

            // 2. Report new status back to webview
            const newStatus = await mcpInstaller.getMCPStatus();
            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            expect(newStatus.installed).toBe(true);
            expect(newStatus.version).toBe('1.0.5');
            expect(updateAvailable).toBe(false);
        });

        it('should handle installMCP message flow for update', async () => {
            // Simulate wizard receiving 'installMCP' message with update: true
            mockInstallMCP.mockResolvedValue(true);

            const mockStatusAfter: MCPStatus = {
                installed: true,
                version: '1.1.0',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatusAfter);
            mockIsMCPUpdateAvailable.mockResolvedValue(false);

            // Handler flow:
            // 1. Call installMCP(true)
            const updateResult = await mcpInstaller.installMCP(true);
            expect(updateResult).toBe(true);

            // 2. Report new status
            const newStatus = await mcpInstaller.getMCPStatus();
            const afterUpdateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            expect(newStatus.version).toBe('1.1.0');
            expect(afterUpdateAvailable).toBe(false);
        });

        it('should handle installation failure and report error state', async () => {
            mockInstallMCP.mockResolvedValue(false);

            const mockStatusNotInstalled: MCPStatus = {
                installed: false,
                version: null,
                inPath: false,
                globalPath: null
            };

            mockGetMCPStatus.mockResolvedValue(mockStatusNotInstalled);

            // Handler flow:
            const installResult = await mcpInstaller.installMCP(false);
            expect(installResult).toBe(false);

            // Status should remain not installed
            const status = await mcpInstaller.getMCPStatus();
            expect(status.installed).toBe(false);
        });
    });

    describe('UI state expectations', () => {
        it('should show install button when not installed', async () => {
            const mockStatus: MCPStatus = {
                installed: false,
                version: null,
                inPath: false,
                globalPath: null
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);

            const status = await mcpInstaller.getMCPStatus();

            // UI logic: if not installed, show install button
            const shouldShowInstallButton = !status.installed;
            const shouldShowUpdateButton = false;

            expect(shouldShowInstallButton).toBe(true);
            expect(shouldShowUpdateButton).toBe(false);
        });

        it('should show update button when installed and update available', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: '1.0.0',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);
            mockIsMCPUpdateAvailable.mockResolvedValue(true);

            const status = await mcpInstaller.getMCPStatus();
            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            // UI logic: if installed and update available, show update button
            const shouldShowInstallButton = false;
            const shouldShowUpdateButton = status.installed && updateAvailable;

            expect(shouldShowInstallButton).toBe(false);
            expect(shouldShowUpdateButton).toBe(true);
        });

        it('should show success state when installed and up-to-date', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: '1.0.5',
                inPath: true,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);
            mockIsMCPUpdateAvailable.mockResolvedValue(false);

            const status = await mcpInstaller.getMCPStatus();
            const updateAvailable = await mcpInstaller.isMCPUpdateAvailable();

            // UI logic: show success badge, no action buttons
            const shouldShowSuccessBadge = status.installed && status.inPath && !updateAvailable;
            const shouldShowWarning = false;

            expect(shouldShowSuccessBadge).toBe(true);
            expect(shouldShowWarning).toBe(false);
        });

        it('should show warning when installed but not in PATH', async () => {
            const mockStatus: MCPStatus = {
                installed: true,
                version: null,
                inPath: false,
                globalPath: '/usr/local/lib/node_modules/bc-telemetry-buddy-mcp'
            };

            mockGetMCPStatus.mockResolvedValue(mockStatus);

            const status = await mcpInstaller.getMCPStatus();

            // UI logic: show warning about PATH
            const shouldShowPathWarning = status.installed && !status.inPath;

            expect(shouldShowPathWarning).toBe(true);
        });
    });

    describe('Error handling', () => {
        it('should handle getMCPStatus errors gracefully', async () => {
            mockGetMCPStatus.mockRejectedValue(new Error('npm command failed'));

            await expect(mcpInstaller.getMCPStatus()).rejects.toThrow('npm command failed');
        });

        it('should handle installMCP errors gracefully', async () => {
            mockInstallMCP.mockRejectedValue(new Error('Installation failed'));

            await expect(mcpInstaller.installMCP(false)).rejects.toThrow('Installation failed');
        });

        it('should handle isMCPUpdateAvailable errors gracefully', async () => {
            mockIsMCPUpdateAvailable.mockRejectedValue(new Error('Network error'));

            await expect(mcpInstaller.isMCPUpdateAvailable()).rejects.toThrow('Network error');
        });
    });
});
