import * as childProcess from 'child_process';
import * as vscode from 'vscode';
import {
    isMCPInstalled,
    isMCPInPath,
    getMCPVersion,
    getMCPPath,
    getMCPStatus,
    installMCP,
    checkMCPHealth,
    showFirstRunNotification,
    getLatestMCPVersion,
    isMCPUpdateAvailable
} from '../services/mcpInstaller';

// Mock child_process
jest.mock('child_process');
const mockExec = childProcess.exec as jest.MockedFunction<typeof childProcess.exec>;

// Mock vscode
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

describe('mcpInstaller', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('isMCPInstalled', () => {
        it('should return true when MCP is installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInstalled();
            expect(result).toBe(true);
            expect(mockExec).toHaveBeenCalledWith(
                'npm list -g bc-telemetry-buddy-mcp --depth=0',
                expect.any(Function)
            );
        });

        it('should return false when MCP is not installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Package not found'), { stdout: '', stderr: 'not found' });
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInstalled();
            expect(result).toBe(false);
        });

        it('should return false when npm command fails', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('npm not found'), null);
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInstalled();
            expect(result).toBe(false);
        });
    });

    describe('isMCPInPath', () => {
        const originalPlatform = process.platform;

        afterEach(() => {
            Object.defineProperty(process, 'platform', { value: originalPlatform });
        });

        it('should use "where.exe" on Windows', async () => {
            Object.defineProperty(process, 'platform', { value: 'win32' });

            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: 'C:\\Users\\user\\AppData\\Roaming\\npm\\bctb-mcp.cmd', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInPath();
            expect(result).toBe(true);
            expect(mockExec).toHaveBeenCalledWith('where.exe bctb-mcp', expect.any(Function));
        });

        it('should use "which" on Linux/macOS', async () => {
            Object.defineProperty(process, 'platform', { value: 'linux' });

            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: '/usr/local/bin/bctb-mcp', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInPath();
            expect(result).toBe(true);
            expect(mockExec).toHaveBeenCalledWith('which bctb-mcp', expect.any(Function));
        });

        it('should return false when command not in PATH', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Command not found'), null);
                return {} as childProcess.ChildProcess;
            });

            const result = await isMCPInPath();
            expect(result).toBe(false);
        });
    });

    describe('getMCPVersion', () => {
        it('should return version string when MCP is installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: '1.0.5\n', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPVersion();
            expect(result).toBe('1.0.5');
            expect(mockExec).toHaveBeenCalledWith('bctb-mcp --version', expect.any(Function));
        });

        it('should return null when MCP is not installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Command not found'), null);
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPVersion();
            expect(result).toBeNull();
        });

        it('should trim whitespace from version string', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: '  1.2.3  \n', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPVersion();
            expect(result).toBe('1.2.3');
        });
    });

    describe('getMCPPath', () => {
        it('should extract installation path from npm output', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                const output = `bc-telemetry-buddy-mcp@1.0.0 /usr/local/lib/node_modules/bc-telemetry-buddy-mcp`;
                callback(null, { stdout: output, stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPPath();
            expect(result).toBe('/usr/local/lib/node_modules/bc-telemetry-buddy-mcp');
        });

        it('should return null when package not found', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPPath();
            expect(result).toBeNull();
        });

        it('should return null when path cannot be parsed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: 'invalid output', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const result = await getMCPPath();
            expect(result).toBeNull();
        });
    });

    describe('getMCPStatus', () => {
        it('should return complete status when MCP is fully installed', async () => {
            let callCount = 0;
            mockExec.mockImplementation((cmd, callback: any) => {
                callCount++;
                if (cmd.includes('npm list -g bc-telemetry-buddy-mcp --depth=0') && !cmd.includes('--long')) {
                    callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0', stderr: '' });
                } else if (cmd.includes('where.exe') || cmd.includes('which')) {
                    callback(null, { stdout: '/usr/local/bin/bctb-mcp', stderr: '' });
                } else if (cmd.includes('--version')) {
                    callback(null, { stdout: '1.0.0', stderr: '' });
                } else if (cmd.includes('--long')) {
                    callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0 /usr/local/lib/node_modules/bc-telemetry-buddy-mcp', stderr: '' });
                }
                return {} as childProcess.ChildProcess;
            });

            const status = await getMCPStatus();
            expect(status.installed).toBe(true);
            expect(status.version).toBe('1.0.0');
            expect(status.inPath).toBe(true);
            expect(status.globalPath).toBe('/usr/local/lib/node_modules/bc-telemetry-buddy-mcp');
        });

        it('should return not installed status when MCP is missing', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            const status = await getMCPStatus();
            expect(status.installed).toBe(false);
            expect(status.version).toBeNull();
            expect(status.inPath).toBe(false);
            expect(status.globalPath).toBeNull();
        });

        it('should handle partial installation (installed but not in PATH)', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                if (cmd.includes('npm list -g bc-telemetry-buddy-mcp --depth=0')) {
                    callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0', stderr: '' });
                } else {
                    callback(new Error('Not in PATH'), null);
                }
                return {} as childProcess.ChildProcess;
            });

            const status = await getMCPStatus();
            expect(status.installed).toBe(true);
            expect(status.inPath).toBe(false);
        });
    });

    describe('installMCP', () => {
        it('should install MCP successfully', async () => {
            const mockOutputChannel = {
                show: jest.fn(),
                appendLine: jest.fn(),
                dispose: jest.fn()
            };
            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
            (vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
                const progress = { report: jest.fn() };
                return await task(progress, {} as any);
            });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            // Mock exec with proper callback handling for promisified version
            mockExec.mockImplementation((cmd, options: any, callback: any) => {
                // Handle both 2-arg and 3-arg forms of exec
                const cb = typeof options === 'function' ? options : callback;

                if (cmd.includes('npm install -g')) {
                    setTimeout(() => cb(null, { stdout: 'Successfully installed bc-telemetry-buddy-mcp@1.0.0', stderr: '' }), 0);
                } else if (cmd.includes('--version')) {
                    setTimeout(() => cb(null, { stdout: '1.0.0', stderr: '' }), 0);
                } else if (cmd.includes('where.exe') || cmd.includes('which')) {
                    setTimeout(() => cb(null, { stdout: '/usr/local/bin/bctb-mcp', stderr: '' }), 0);
                }
                return {} as childProcess.ChildProcess;
            });

            const result = await installMCP(false);
            expect(result).toBe(true);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Installing'));
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('installed successfully'),
                'Close'
            );
        });

        it('should update MCP when update flag is true', async () => {
            const mockOutputChannel = {
                show: jest.fn(),
                appendLine: jest.fn(),
                dispose: jest.fn()
            };
            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
            (vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
                const progress = { report: jest.fn() };
                return await task(progress, {} as any);
            });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            mockExec.mockImplementation((cmd, options: any, callback: any) => {
                const cb = typeof options === 'function' ? options : callback;

                if (cmd.includes('npm update -g')) {
                    setTimeout(() => cb(null, { stdout: 'Updated bc-telemetry-buddy-mcp@1.1.0', stderr: '' }), 0);
                } else if (cmd.includes('--version')) {
                    setTimeout(() => cb(null, { stdout: '1.1.0', stderr: '' }), 0);
                } else if (cmd.includes('where.exe') || cmd.includes('which')) {
                    setTimeout(() => cb(null, { stdout: '/usr/local/bin/bctb-mcp', stderr: '' }), 0);
                }
                return {} as childProcess.ChildProcess;
            });

            const result = await installMCP(true);
            expect(result).toBe(true);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(expect.stringContaining('Updating'));
        });

        it('should handle installation failure gracefully', async () => {
            const mockOutputChannel = {
                show: jest.fn(),
                appendLine: jest.fn(),
                dispose: jest.fn()
            };
            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
            (vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
                const progress = { report: jest.fn() };
                return await task(progress, {} as any);
            });
            (vscode.window.showErrorMessage as jest.Mock).mockResolvedValue(undefined);

            mockExec.mockImplementation((cmd, options: any, callback: any) => {
                const cb = typeof options === 'function' ? options : callback;

                if (cmd.includes('npm install -g')) {
                    setTimeout(() => cb(new Error('EACCES: permission denied'), null), 0);
                }
                return {} as childProcess.ChildProcess;
            });

            const result = await installMCP(false);
            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                expect.stringContaining('Permission denied'),
                expect.any(String),
                expect.any(String),
                expect.any(String)
            );
        });

        it('should show warning when installed but not in PATH', async () => {
            const mockOutputChannel = {
                show: jest.fn(),
                appendLine: jest.fn(),
                dispose: jest.fn()
            };
            (vscode.window.createOutputChannel as jest.Mock).mockReturnValue(mockOutputChannel);
            (vscode.window.withProgress as jest.Mock).mockImplementation(async (options, task) => {
                const progress = { report: jest.fn() };
                return await task(progress, {} as any);
            });
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            mockExec.mockImplementation((cmd, options: any, callback: any) => {
                const cb = typeof options === 'function' ? options : callback;

                if (cmd.includes('npm install -g')) {
                    setTimeout(() => cb(null, { stdout: 'Installed', stderr: '' }), 0);
                } else if (cmd.includes('--version')) {
                    setTimeout(() => cb(null, { stdout: '1.0.0', stderr: '' }), 0);
                } else if (cmd.includes('where.exe') || cmd.includes('which')) {
                    setTimeout(() => cb(new Error('Not found'), null), 0);
                }
                return {} as childProcess.ChildProcess;
            });

            await installMCP(false);
            expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                expect.stringContaining('not found in PATH')
            );
        });
    });

    describe('checkMCPHealth', () => {
        it('should show health report for installed MCP', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                if (cmd.includes('npm list -g bc-telemetry-buddy-mcp --depth=0')) {
                    callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0', stderr: '' });
                } else if (cmd.includes('--version')) {
                    callback(null, { stdout: '1.0.0', stderr: '' });
                } else if (cmd.includes('where.exe') || cmd.includes('which')) {
                    callback(null, { stdout: '/usr/local/bin/bctb-mcp', stderr: '' });
                } else if (cmd.includes('--long')) {
                    callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0 /usr/local/lib/node_modules/bc-telemetry-buddy-mcp', stderr: '' });
                }
                return {} as childProcess.ChildProcess;
            });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            await checkMCPHealth();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('✓ MCP is properly installed'),
                expect.any(Object),
                expect.any(String),
                expect.any(String)
            );
        });

        it('should offer to install when MCP is not installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            await checkMCPHealth();
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('✗ MCP is not installed'),
                expect.any(Object),
                'Install MCP',
                'Close'
            );
        });
    });

    describe('showFirstRunNotification', () => {
        const mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            }
        } as any;

        beforeEach(() => {
            (mockContext.globalState.get as jest.Mock).mockReturnValue(false);
        });

        it('should show notification when MCP is not installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Remind Me Later');

            await showFirstRunNotification(mockContext);
            expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                expect.stringContaining('MCP server not detected'),
                'Open Setup Wizard',
                'Remind Me Later',
                "Don't Ask Again"
            );
        });

        it('should not show notification when already dismissed', async () => {
            (mockContext.globalState.get as jest.Mock).mockReturnValue(true);

            await showFirstRunNotification(mockContext);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should not show notification when MCP is installed', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: 'bc-telemetry-buddy-mcp@1.0.0', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            await showFirstRunNotification(mockContext);
            expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
        });

        it('should open Setup Wizard when user clicks the button', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Open Setup Wizard');

            await showFirstRunNotification(mockContext);
            expect(vscode.commands.executeCommand).toHaveBeenCalledWith('bctb.setupWizard');
        });

        it('should remember dismissal when user clicks "Don\'t Ask Again"', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Not found'), null);
                return {} as childProcess.ChildProcess;
            });

            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue("Don't Ask Again");

            await showFirstRunNotification(mockContext);
            expect(mockContext.globalState.update).toHaveBeenCalledWith('mcpNotificationDismissed', true);
        });
    });

    describe('getLatestMCPVersion', () => {
        it('should return latest version from NPM registry', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: '1.2.5\n', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const version = await getLatestMCPVersion();
            expect(version).toBe('1.2.5');
            expect(mockExec).toHaveBeenCalledWith(
                'npm view bc-telemetry-buddy-mcp version',
                expect.any(Function)
            );
        });

        it('should return null when NPM registry is unreachable', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(new Error('Network error'), null);
                return {} as childProcess.ChildProcess;
            });

            const version = await getLatestMCPVersion();
            expect(version).toBeNull();
        });
    });

    describe('isMCPUpdateAvailable', () => {
        it('should return true when update is available', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                if (cmd.includes('--version')) {
                    callback(null, { stdout: '1.0.0', stderr: '' });
                } else if (cmd.includes('npm view')) {
                    callback(null, { stdout: '1.1.0', stderr: '' });
                }
                return {} as childProcess.ChildProcess;
            });

            const updateAvailable = await isMCPUpdateAvailable();
            expect(updateAvailable).toBe(true);
        });

        it('should return false when versions match', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                callback(null, { stdout: '1.0.0', stderr: '' });
                return {} as childProcess.ChildProcess;
            });

            const updateAvailable = await isMCPUpdateAvailable();
            expect(updateAvailable).toBe(false);
        });

        it('should return false when current version cannot be determined', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                if (cmd.includes('--version')) {
                    callback(new Error('Not found'), null);
                } else {
                    callback(null, { stdout: '1.1.0', stderr: '' });
                }
                return {} as childProcess.ChildProcess;
            });

            const updateAvailable = await isMCPUpdateAvailable();
            expect(updateAvailable).toBe(false);
        });

        it('should return false when latest version cannot be determined', async () => {
            mockExec.mockImplementation((cmd, callback: any) => {
                if (cmd.includes('--version')) {
                    callback(null, { stdout: '1.0.0', stderr: '' });
                } else {
                    callback(new Error('Network error'), null);
                }
                return {} as childProcess.ChildProcess;
            });

            const updateAvailable = await isMCPUpdateAvailable();
            expect(updateAvailable).toBe(false);
        });
    });
});
