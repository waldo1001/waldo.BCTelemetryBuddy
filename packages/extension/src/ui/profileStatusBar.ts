/**
 * Profile Status Bar Provider
 * 
 * Shows current profile in status bar with clickable dropdown to switch profiles.
 * Integrates with ProfileManager for profile operations.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { ProfileManager } from '../services/profileManager';

export class ProfileStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private profileManager: ProfileManager;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;
        this.profileManager = new ProfileManager(outputChannel);

        // Create status bar item (priority 100 = left side)
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Left,
            100
        );

        this.statusBarItem.command = 'bctb.switchProfile';
        this.statusBarItem.tooltip = 'Click to switch BC Telemetry Buddy profile';

        this.updateStatusBar();
        this.statusBarItem.show();
    }

    /**
     * Update status bar text with current profile name
     */
    async updateStatusBar(): Promise<void> {
        try {
            const hasConfig = this.profileManager.hasConfigFile();

            if (!hasConfig) {
                // No config file - hide status bar
                this.statusBarItem.hide();
                return;
            }

            const isMulti = this.profileManager.isMultiProfile();

            if (!isMulti) {
                // Single profile mode - show connection name only
                const config = await this.profileManager.getCurrentConfig();
                this.statusBarItem.text = `$(plug) ${config.connectionName}`;
                this.statusBarItem.tooltip = 'BC Telemetry Buddy (single profile mode)';
                this.statusBarItem.show();
                return;
            }

            // Multi-profile mode - show current profile name
            const currentProfile = this.profileManager.getCurrentProfile();
            const config = await this.profileManager.getCurrentConfig();

            this.statusBarItem.text = `$(plug) ${config.connectionName}`;
            this.statusBarItem.tooltip = `BC Telemetry Buddy - Profile: ${currentProfile || 'default'}\nClick to switch profiles`;
            this.statusBarItem.show();
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            this.statusBarItem.text = '$(plug) BC Telemetry Buddy (error)';
            this.statusBarItem.tooltip = `Error loading profile: ${message}`;
            this.statusBarItem.show();
        }
    }

    /**
     * Show quick pick to select profile
     */
    async showProfilePicker(): Promise<string | undefined> {
        try {
            const isMulti = this.profileManager.isMultiProfile();

            if (!isMulti) {
                vscode.window.showInformationMessage(
                    'Single profile mode. Convert to multi-profile to enable profile switching.',
                    'Learn More'
                ).then(selection => {
                    if (selection === 'Learn More') {
                        vscode.env.openExternal(vscode.Uri.parse(
                            'https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/docs/UserGuide.md#multi-profile-configuration'
                        ));
                    }
                });
                return undefined;
            }

            const profilesInfo = this.profileManager.listProfiles();
            const currentProfile = this.profileManager.getCurrentProfile();

            if (profilesInfo.length === 0) {
                vscode.window.showWarningMessage('No profiles found in configuration.');
                return undefined;
            }

            // Build quick pick items
            const items: vscode.QuickPickItem[] = profilesInfo.map(info => {
                const isActive = info.name === currentProfile;
                return {
                    label: isActive ? `$(check) ${info.name}` : `$(pulse) ${info.name}`,
                    description: isActive ? '(active)' : '',
                    detail: isActive ? 'Currently active profile' : `Switch to ${info.name}`
                };
            });

            // Add management option at the end
            items.push({
                label: '$(gear) Manage Profiles...',
                description: '',
                detail: 'Create, edit, or delete profiles'
            });

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a profile to switch to',
                title: 'BC Telemetry Buddy - Profile Selector'
            });

            if (!selected) {
                return undefined;
            }

            // Handle management option
            if (selected.label.includes('Manage Profiles')) {
                vscode.commands.executeCommand('bctb.manageProfiles');
                return undefined;
            }

            // Extract profile name (remove checkmark or pulse icon if present)
            const profileName = selected.label.replace(/^\$\((check|pulse)\)\s+/, '');

            if (profileName === currentProfile) {
                vscode.window.showInformationMessage(`Already using profile: ${profileName}`);
                return undefined;
            }

            return profileName;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to show profile picker: ${message}`);
            return undefined;
        }
    }

    /**
     * Switch to a different profile
     */
    async switchProfile(profileName?: string): Promise<boolean> {
        try {
            // If no profile name provided, show picker
            if (!profileName) {
                profileName = await this.showProfilePicker();
                if (!profileName) {
                    return false;
                }
            }

            // Perform the switch
            await this.profileManager.switchProfile(profileName);
            await this.updateStatusBar();

            vscode.window.showInformationMessage(`Switched to profile: ${profileName}`);
            return true;
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to switch profile: ${message}`);
            return false;
        }
    }

    /**
     * Get current profile name (for external consumers)
     */
    getCurrentProfile(): string | null {
        return this.profileManager.getCurrentProfile();
    }

    /**
     * Refresh status bar (call after config changes)
     */
    async refresh(): Promise<void> {
        await this.updateStatusBar();
    }

    /**
     * Dispose status bar item
     */
    dispose(): void {
        this.statusBarItem.dispose();
    }
}
