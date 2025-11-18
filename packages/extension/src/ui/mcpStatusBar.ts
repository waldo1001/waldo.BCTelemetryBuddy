/**
 * MCP Status Bar Provider
 * 
 * Shows MCP installation status in status bar with clickable actions.
 */

import * as vscode from 'vscode';
import { getMCPStatus, installMCP, checkMCPHealth } from '../services/mcpInstaller';

export class MCPStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private updateInterval: NodeJS.Timeout | null = null;

    constructor() {
        // Create status bar item (priority 90 = left side, after profile)
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            90
        );

        this.statusBarItem.command = 'bctb.mcpStatusClick';
        this.updateStatusBar();
        this.statusBarItem.show();

        // Update status every 30 seconds
        this.updateInterval = setInterval(() => {
            this.updateStatusBar();
        }, 30000);
    }

    /**
     * Update status bar text with current MCP status
     */
    async updateStatusBar(): Promise<void> {
        try {
            const status = await getMCPStatus();

            if (status.installed && status.inPath && status.version) {
                // MCP installed and working
                this.statusBarItem.text = `$(server) MCP: ${status.version}`;
                this.statusBarItem.tooltip = new vscode.MarkdownString(
                    `BC Telemetry Buddy MCP Server\n\n` +
                    `✓ Installed: v${status.version}\n` +
                    `✓ CLI Available: \`bctb-mcp\`\n` +
                    `✓ Ready for Copilot Chat\n\n` +
                    `Click for health check`
                );
                this.statusBarItem.backgroundColor = undefined;
            } else if (status.installed && status.version) {
                // Installed but not in PATH (needs reload)
                this.statusBarItem.text = `$(warning) MCP: ${status.version}`;
                this.statusBarItem.tooltip = new vscode.MarkdownString(
                    `BC Telemetry Buddy MCP Server\n\n` +
                    `✓ Installed: v${status.version}\n` +
                    `⚠ Not in PATH (restart VS Code)\n\n` +
                    `Click for details`
                );
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            } else {
                // Not installed
                this.statusBarItem.text = '$(cloud-download) Install MCP';
                this.statusBarItem.tooltip = new vscode.MarkdownString(
                    `BC Telemetry Buddy MCP Server\n\n` +
                    `✗ Not installed\n\n` +
                    `MCP is required for:\n` +
                    `• GitHub Copilot Chat integration\n` +
                    `• Event discovery tools\n` +
                    `• Schema analysis\n\n` +
                    `✓ Command Palette works without MCP\n\n` +
                    `Click to install`
                );
                this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            }
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.statusBarItem.text = '$(error) MCP: Error';
            this.statusBarItem.tooltip = `Error checking MCP status: ${message}\n\nClick for help`;
            this.statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
        }
    }

    /**
     * Handle status bar click
     */
    async handleClick(): Promise<void> {
        const status = await getMCPStatus();

        if (status.installed && status.inPath) {
            // Show health check
            await checkMCPHealth();
        } else if (status.installed && !status.inPath) {
            // Show reload prompt
            const choice = await vscode.window.showWarningMessage(
                'MCP is installed but not available in PATH. Restart VS Code to update PATH.',
                'Reload Window',
                'Health Check'
            );

            if (choice === 'Reload Window') {
                await vscode.commands.executeCommand('workbench.action.reloadWindow');
            } else if (choice === 'Health Check') {
                await checkMCPHealth();
            }
        } else {
            // Show install prompt
            const choice = await vscode.window.showInformationMessage(
                'BC Telemetry Buddy MCP server is not installed.\n\n' +
                'Install now for full Copilot Chat integration?\n\n' +
                '✓ You can still use Command Palette commands without MCP',
                'Install MCP',
                'More Info',
                'Cancel'
            );

            if (choice === 'Install MCP') {
                await installMCP(false);
                // Refresh status after installation
                await this.updateStatusBar();
            } else if (choice === 'More Info') {
                vscode.env.openExternal(vscode.Uri.parse(
                    'https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#installation'
                ));
            }
        }
    }

    /**
     * Refresh status bar (call after MCP install/update)
     */
    async refresh(): Promise<void> {
        await this.updateStatusBar();
    }

    /**
     * Dispose status bar item and interval
     */
    dispose(): void {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
        }
        this.statusBarItem.dispose();
    }
}
