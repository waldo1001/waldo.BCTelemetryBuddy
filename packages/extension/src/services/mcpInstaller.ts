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
        const { stdout } = await exec('bctb-mcp --version');
        return stdout.trim();
    } catch {
        return null;
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
 * Install or update BC Telemetry Buddy MCP globally
 */
export async function installMCP(update: boolean = false): Promise<boolean> {
    const outputChannel = vscode.window.createOutputChannel('BC Telemetry Buddy - MCP Installation');
    outputChannel.show();

    const command = update
        ? 'npm update -g bc-telemetry-buddy-mcp'
        : 'npm install -g bc-telemetry-buddy-mcp';

    const operationType = update ? 'Updating' : 'Installing';
    outputChannel.appendLine(`${operationType} BC Telemetry Buddy MCP Server...`);
    outputChannel.appendLine(`Running: ${command}\n`);

    try {
        const success = await vscode.window.withProgress({
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
                outputChannel.appendLine('You may need to restart VS Code or your terminal.');
            }

            vscode.window.showInformationMessage(
                `✓ MCP v${version} ${update ? 'updated' : 'installed'} successfully!`,
                'Close'
            );

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
