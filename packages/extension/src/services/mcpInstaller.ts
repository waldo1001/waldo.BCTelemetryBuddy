import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import * as vscode from 'vscode';

const exec = promisify(execCallback);

export interface MCPStatus {
    installed: boolean;
    version: string | null;
    inPath: boolean;
    globalPath: string | null;
}

/**
 * Check if BC Telemetry Buddy MCP is installed globally
 */
export async function isMCPInstalled(): Promise<boolean> {
    try {
        const { stdout } = await exec('npm list -g bc-telemetry-buddy-mcp --depth=0');
        return stdout.includes('bc-telemetry-buddy-mcp@');
    } catch {
        return false;
    }
}

/**
 * Check if bctb-mcp CLI command is in PATH
 */
export async function isMCPInPath(): Promise<boolean> {
    try {
        const command = process.platform === 'win32' ? 'where.exe' : 'which';
        await exec(`${command} bctb-mcp`);
        return true;
    } catch {
        return false;
    }
}

/**
 * Get the installed MCP version
 */
export async function getMCPVersion(): Promise<string | null> {
    try {
        // First try the CLI command if MCP is in PATH
        const { stdout } = await exec('bctb-mcp --version');
        return stdout.trim();
    } catch {
        // Fallback: Extract version from npm list output (works even if not in PATH)
        try {
            const { stdout } = await exec('npm list -g bc-telemetry-buddy-mcp --depth=0');
            const match = stdout.match(/bc-telemetry-buddy-mcp@([\d.]+)/);
            return match ? match[1] : null;
        } catch {
            return null;
        }
    }
}

/**
 * Get the global installation path of MCP
 */
export async function getMCPPath(): Promise<string | null> {
    try {
        const { stdout } = await exec('npm list -g bc-telemetry-buddy-mcp --depth=0 --long');
        const match = stdout.match(/bc-telemetry-buddy-mcp@[\d.]+\s+(.+)/);
        return match ? match[1].trim() : null;
    } catch {
        return null;
    }
}

/**
 * Get comprehensive MCP status
 */
export async function getMCPStatus(): Promise<MCPStatus> {
    const [installed, inPath, version, globalPath] = await Promise.all([
        isMCPInstalled(),
        isMCPInPath(),
        getMCPVersion(),
        getMCPPath()
    ]);

    return {
        installed,
        version,
        inPath,
        globalPath
    };
}

/**
 * Uninstall BC Telemetry Buddy MCP globally
 */
async function uninstallMCP(outputChannel: vscode.OutputChannel): Promise<void> {
    outputChannel.appendLine('Removing existing MCP installation...');
    const command = 'npm uninstall -g bc-telemetry-buddy-mcp';
    outputChannel.appendLine(`Running: ${command}\n`);

    try {
        const { stdout, stderr } = await exec(command, {
            timeout: 60000 // 1 minute timeout
        });

        if (stdout) {
            outputChannel.appendLine(stdout);
        }
        if (stderr && !stderr.includes('npm WARN')) {
            outputChannel.appendLine(`stderr: ${stderr}`);
        }
        outputChannel.appendLine('✓ Existing installation removed\n');
    } catch (error: any) {
        // If uninstall fails, log but continue with install
        outputChannel.appendLine(`⚠ Warning: Uninstall failed (${error.message}), continuing with install...\n`);
    }
}

/**
 * Install or update BC Telemetry Buddy MCP globally
 */
export async function installMCP(update: boolean = false): Promise<boolean> {
    const outputChannel = vscode.window.createOutputChannel('BC Telemetry Buddy - MCP Installation');
    outputChannel.show();

    const operationType = update ? 'Updating' : 'Installing';
    outputChannel.appendLine(`${operationType} BC Telemetry Buddy MCP Server...\n`);

    // If updating, uninstall first for a clean reinstall (especially important for PATH issues)
    if (update) {
        const isInstalled = await isMCPInstalled();
        if (isInstalled) {
            await uninstallMCP(outputChannel);
        }
    }

    // Install the latest version
    const command = 'npm install -g bc-telemetry-buddy-mcp@latest';
    outputChannel.appendLine(`Running: ${command}\n`);

    try {
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: `${operationType} MCP server...`,
            cancellable: false
        }, async (progress) => {
            progress.report({ increment: 0, message: 'Downloading package...' });

            try {
                const { stdout, stderr } = await exec(command, {
                    timeout: 120000 // 2 minute timeout
                });

                if (stdout) {
                    outputChannel.appendLine(stdout);
                }
                if (stderr && !stderr.includes('npm WARN')) {
                    outputChannel.appendLine(`stderr: ${stderr}`);
                }

                progress.report({ increment: 100 });
                return true;
            } catch (error: any) {
                outputChannel.appendLine(`\n✗ Error: ${error.message}`);
                if (error.stderr) {
                    outputChannel.appendLine(`stderr: ${error.stderr}`);
                }
                throw error;
            }
        });

        // Verify installation
        const version = await getMCPVersion();
        const inPath = await isMCPInPath();

        if (version) {
            outputChannel.appendLine(`\n✓ Success! MCP v${version} ${update ? 'updated' : 'installed'}.`);

            if (!inPath) {
                outputChannel.appendLine('\n⚠ Warning: bctb-mcp command not found in PATH.');

                // Diagnose why it's not in PATH
                try {
                    const { stdout: npmPrefix } = await exec('npm config get prefix');
                    const globalBinPath = npmPrefix.trim();

                    outputChannel.appendLine(`\n📍 npm installs global packages to: ${globalBinPath}`);
                    outputChannel.appendLine(`\n⚠ This directory is not in your PATH environment variable.`);
                    outputChannel.appendLine(`\nTo fix this permanently:`);

                    if (process.platform === 'win32') {
                        outputChannel.appendLine(`1. Press Win + X, select "System"`);
                        outputChannel.appendLine(`2. Click "Advanced system settings" → "Environment Variables"`);
                        outputChannel.appendLine(`3. Under "User variables", find "Path" and click "Edit"`);
                        outputChannel.appendLine(`4. Click "New" and add: ${globalBinPath}`);
                        outputChannel.appendLine(`5. Click OK on all dialogs`);
                        outputChannel.appendLine(`6. Restart VS Code completely (close all windows)`);
                    } else {
                        outputChannel.appendLine(`1. Add this line to your ~/.bashrc or ~/.zshrc:`);
                        outputChannel.appendLine(`   export PATH="${globalBinPath}:$PATH"`);
                        outputChannel.appendLine(`2. Restart your terminal or run: source ~/.bashrc`);
                        outputChannel.appendLine(`3. Restart VS Code`);
                    }

                    outputChannel.appendLine(`\nAlternatively, you can use MCP features through VS Code without the CLI.`);
                } catch (error) {
                    outputChannel.appendLine('Please restart VS Code to update your environment PATH.');
                }

                // Offer to view instructions or restart
                const choice = await vscode.window.showWarningMessage(
                    `✓ MCP v${version} installed, but PATH setup required. See Output for instructions.`,
                    'View Instructions',
                    'Restart VS Code',
                    'Later'
                );

                if (choice === 'View Instructions') {
                    outputChannel.show();
                } else if (choice === 'Restart VS Code') {
                    await vscode.commands.executeCommand('workbench.action.reloadWindow');
                }
            } else {
                outputChannel.appendLine('✓ MCP command available in PATH.');

                vscode.window.showInformationMessage(
                    `✓ MCP v${version} ${update ? 'updated' : 'installed'} successfully!`,
                    'Close'
                );
            }

            return true;
        } else {
            throw new Error('Installation completed but MCP version could not be verified');
        }

    } catch (error: any) {
        outputChannel.appendLine(`\n✗ Installation failed: ${error.message}`);

        // Provide helpful error messages based on common issues
        let errorMessage = `MCP installation failed: ${error.message}`;
        let actions: string[] = ['View Log', 'Retry'];

        if (error.message.includes('EACCES') || error.message.includes('permission denied')) {
            errorMessage = 'Permission denied. Try running with elevated privileges.';
            actions = ['View Log', 'Show Instructions', 'Retry'];

            outputChannel.appendLine('\nPossible solutions:');
            outputChannel.appendLine('• Windows: Run VS Code as Administrator');
            outputChannel.appendLine('• macOS/Linux: Use sudo: sudo npm install -g bc-telemetry-buddy-mcp');
            outputChannel.appendLine('• Or install in user directory: npm install -g --prefix ~/.npm-global bc-telemetry-buddy-mcp');
        } else if (error.message.includes('ETIMEDOUT') || error.message.includes('ENOTFOUND')) {
            errorMessage = 'Network error. Check your internet connection.';
        }

        const choice = await vscode.window.showErrorMessage(errorMessage, ...actions);

        if (choice === 'View Log') {
            outputChannel.show();
        } else if (choice === 'Show Instructions') {
            await showPermissionInstructions(outputChannel);
        } else if (choice === 'Retry') {
            return installMCP(update);
        }

        return false;
    }
}

/**
 * Show instructions for fixing permission issues
 */
async function showPermissionInstructions(outputChannel: vscode.OutputChannel) {
    const platform = process.platform;

    let instructions = '';
    if (platform === 'win32') {
        instructions = `
To install MCP globally on Windows:

1. Close VS Code
2. Right-click VS Code icon → "Run as administrator"
3. Re-run the MCP installation

Or install manually:
1. Open PowerShell as Administrator
2. Run: npm install -g bc-telemetry-buddy-mcp
        `;
    } else {
        instructions = `
To install MCP globally on ${platform === 'darwin' ? 'macOS' : 'Linux'}:

Option 1 - Use sudo:
1. Open Terminal
2. Run: sudo npm install -g bc-telemetry-buddy-mcp

Option 2 - Install in user directory:
1. Create directory: mkdir -p ~/.npm-global
2. Configure npm: npm config set prefix '~/.npm-global'
3. Add to PATH: echo 'export PATH=~/.npm-global/bin:$PATH' >> ~/.bashrc
4. Reload shell: source ~/.bashrc
5. Install: npm install -g bc-telemetry-buddy-mcp
        `;
    }

    outputChannel.appendLine(instructions);
    outputChannel.show();

    await vscode.window.showInformationMessage(
        'Installation instructions written to output panel',
        'OK'
    );
}

/**
 * Check MCP health and show detailed report
 */
export async function checkMCPHealth(): Promise<void> {
    const status = await getMCPStatus();

    const report = `
BC Telemetry Buddy - MCP Health Check
=====================================

Installed: ${status.installed ? '✓ Yes' : '✗ No'}
Version: ${status.version || 'N/A'}
In PATH: ${status.inPath ? '✓ Yes' : '✗ No'}
CLI Command: ${status.inPath ? '✓ bctb-mcp available' : '✗ Not found'}
${status.globalPath ? `Install Path: ${status.globalPath}` : ''}

${status.installed && status.inPath
            ? '✓ MCP is properly installed and ready for Copilot Chat!'
            : status.installed && !status.inPath
                ? '⚠ MCP is installed but not in PATH. Restart VS Code to update PATH.'
                : '✗ MCP is not installed. Install it to enable Copilot Chat features.'
        }
    `;

    const buttons = [];
    if (!status.installed) {
        buttons.push('Install MCP');
    } else if (status.version) {
        buttons.push('Update MCP');
    }
    buttons.push('Close');

    const choice = await vscode.window.showInformationMessage(
        report,
        { modal: true },
        ...buttons
    );

    if (choice === 'Install MCP') {
        await installMCP(false);
    } else if (choice === 'Update MCP') {
        await installMCP(true);
    }
}

/**
 * Show first-run notification if MCP is not installed
 */
export async function showFirstRunNotification(context: vscode.ExtensionContext): Promise<void> {
    // Check if user has dismissed this notification
    const dismissed = context.globalState.get('mcpNotificationDismissed', false);
    if (dismissed) {
        return;
    }

    const installed = await isMCPInstalled();
    if (installed) {
        return;
    }

    const choice = await vscode.window.showInformationMessage(
        'BC Telemetry Buddy: MCP server not detected. Install now for full Copilot Chat integration?\n\n' +
        '✓ You can still use Command Palette commands without MCP',
        'Open Setup Wizard',
        'Remind Me Later',
        "Don't Ask Again"
    );

    if (choice === 'Open Setup Wizard') {
        await vscode.commands.executeCommand('bctb.setupWizard');
    } else if (choice === "Don't Ask Again") {
        await context.globalState.update('mcpNotificationDismissed', true);
    }
}

/**
 * Get latest available MCP version from NPM registry
 */
export async function getLatestMCPVersion(): Promise<string | null> {
    try {
        const { stdout } = await exec('npm view bc-telemetry-buddy-mcp version');
        return stdout.trim();
    } catch {
        return null;
    }
}

/**
 * Check if MCP update is available
 */
export async function isMCPUpdateAvailable(): Promise<boolean> {
    const [currentVersion, latestVersion] = await Promise.all([
        getMCPVersion(),
        getLatestMCPVersion()
    ]);

    if (!currentVersion || !latestVersion) {
        return false;
    }

    // Simple version comparison (assumes semver format)
    return currentVersion !== latestVersion;
}

/**
 * Check for MCP updates and notify user if available
 */
export async function checkForMCPUpdates(
    context: vscode.ExtensionContext,
    silent: boolean = false
): Promise<void> {
    try {
        // Check if MCP is installed
        const installed = await isMCPInstalled();
        if (!installed) {
            if (!silent) {
                const choice = await vscode.window.showInformationMessage(
                    'BC Telemetry Buddy MCP is not installed. Install now for full Copilot Chat integration?',
                    'Install',
                    'Not Now'
                );
                if (choice === 'Install') {
                    await installMCP(false);
                }
            }
            return;
        }

        // Check if update is available
        const updateAvailable = await isMCPUpdateAvailable();
        if (!updateAvailable) {
            if (!silent) {
                const version = await getMCPVersion();
                vscode.window.showInformationMessage(
                    `BC Telemetry Buddy MCP is up to date (v${version})`,
                    'OK'
                );
            }
            return;
        }

        // Update is available - get versions
        const [currentVersion, latestVersion] = await Promise.all([
            getMCPVersion(),
            getLatestMCPVersion()
        ]);

        // Always show update notification when update is available
        const choice = await vscode.window.showInformationMessage(
            `BC Telemetry Buddy MCP update available: v${currentVersion} → v${latestVersion}`,
            'Update Now',
            'View Changes',
            'Remind Me Later'
        );

        if (choice === 'Update Now') {
            await installMCP(true);
        } else if (choice === 'View Changes') {
            vscode.env.openExternal(vscode.Uri.parse(
                'https://www.npmjs.com/package/bc-telemetry-buddy-mcp?activeTab=versions'
            ));
        }
    } catch (error: any) {
        if (!silent) {
            vscode.window.showErrorMessage(
                `Failed to check for MCP updates: ${error.message}`,
                'OK'
            );
        }
    }
}

/**
 * Start periodic MCP update checks
 */
export function startPeriodicUpdateChecks(
    context: vscode.ExtensionContext
): vscode.Disposable {
    // Check for updates immediately on activation
    setTimeout(() => {
        checkForMCPUpdates(context, true).catch(() => { });
    }, 2000); // Wait 2 seconds after activation for extension to fully initialize

    // Then check daily
    const intervalId = setInterval(() => {
        checkForMCPUpdates(context, true).catch(() => { });
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    return {
        dispose: () => {
            clearInterval(intervalId);
        }
    };
}
