import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MCPConfig, ProfiledConfig, resolveProfileInheritance, expandEnvironmentVariables } from '@bctb/shared';

/**
 * Manages profile switching and configuration for multi-customer setups
 */
export class ProfileManager {
    private currentProfile: string | null = null;
    private configFilePath: string;
    private outputChannel: vscode.OutputChannel;

    constructor(outputChannel: vscode.OutputChannel) {
        this.outputChannel = outputChannel;

        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            throw new Error('No workspace folder open');
        }

        this.configFilePath = path.join(workspaceFolders[0].uri.fsPath, '.bctb-config.json');

        // Load current profile from workspace settings
        const savedProfile = vscode.workspace.getConfiguration('bctb').get<string>('currentProfile');
        this.currentProfile = savedProfile || null;
    }

    /**
     * Check if config file exists
     */
    hasConfigFile(): boolean {
        return fs.existsSync(this.configFilePath);
    }

    /**
     * Load configuration from file
     */
    private loadConfigFile(): ProfiledConfig {
        if (!this.hasConfigFile()) {
            throw new Error('.bctb-config.json not found. Run Setup Wizard to create it.');
        }

        const fileContent = fs.readFileSync(this.configFilePath, 'utf-8');
        return JSON.parse(fileContent);
    }

    /**
     * Check if config uses multi-profile format
     */
    isMultiProfile(): boolean {
        if (!this.hasConfigFile()) {
            return false;
        }

        const config = this.loadConfigFile();
        return config.profiles !== undefined && Object.keys(config.profiles).length > 0;
    }

    /**
     * Get list of all available profiles
     * @returns Array of profile names and their configs
     */
    listProfiles(): Array<{ name: string; config: MCPConfig }> {
        const config = this.loadConfigFile();

        if (!config.profiles) {
            // Single profile mode (backward compatible)
            return [{
                name: 'default',
                config: this.convertToMCPConfig(config)
            }];
        }

        // Filter out base profiles (starting with _)
        return Object.entries(config.profiles)
            .filter(([name]) => !name.startsWith('_'))
            .map(([name, profileConfig]) => ({
                name,
                config: resolveProfileInheritance(config.profiles!, name)
            }));
    }

    /**
     * Get current active profile
     */
    getCurrentProfile(): string | null {
        return this.currentProfile;
    }

    /**
     * Get current profile configuration
     */
    getCurrentConfig(): MCPConfig {
        const config = this.loadConfigFile();

        // Multi-profile mode
        if (config.profiles) {
            const profileName = this.currentProfile || config.defaultProfile || 'default';

            if (!config.profiles[profileName]) {
                throw new Error(`Profile '${profileName}' not found`);
            }

            const resolved = resolveProfileInheritance(config.profiles, profileName);

            // Merge global settings
            return {
                ...resolved,
                cacheEnabled: resolved.cacheEnabled ?? config.cache?.enabled ?? true,
                cacheTTLSeconds: resolved.cacheTTLSeconds ?? config.cache?.ttlSeconds ?? 3600,
                removePII: resolved.removePII ?? config.sanitize?.removePII ?? false,
                references: resolved.references || config.references || []
            };
        }

        // Single profile mode (backward compatible)
        return this.convertToMCPConfig(config);
    }

    /**
     * Convert ProfiledConfig to MCPConfig (for single-profile mode)
     */
    private convertToMCPConfig(config: ProfiledConfig): MCPConfig {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        const workspacePath = workspaceFolders?.[0].uri.fsPath || '';

        return expandEnvironmentVariables({
            connectionName: config.connectionName || 'Default',
            tenantId: config.tenantId || '',
            clientId: config.clientId,
            clientSecret: config.clientSecret,
            authFlow: config.authFlow || 'azure_cli',
            applicationInsightsAppId: config.applicationInsightsAppId || '',
            kustoClusterUrl: config.kustoClusterUrl || '',
            cacheEnabled: config.cacheEnabled ?? config.cache?.enabled ?? true,
            cacheTTLSeconds: config.cacheTTLSeconds ?? config.cache?.ttlSeconds ?? 3600,
            removePII: config.removePII ?? config.sanitize?.removePII ?? false,
            port: config.port || 52345,
            workspacePath,
            queriesFolder: config.queriesFolder || 'queries',
            references: config.references || []
        });
    }

    /**
     * Switch to a different profile
     */
    async switchProfile(profileName: string): Promise<void> {
        const config = this.loadConfigFile();

        if (!config.profiles) {
            throw new Error('Config file is not in multi-profile format');
        }

        if (!config.profiles[profileName]) {
            throw new Error(`Profile '${profileName}' not found`);
        }

        this.outputChannel.appendLine(`[ProfileManager] Switching to profile: ${profileName}`);

        // Update current profile
        this.currentProfile = profileName;

        // Save to workspace settings
        await vscode.workspace.getConfiguration('bctb').update(
            'currentProfile',
            profileName,
            vscode.ConfigurationTarget.Workspace
        );

        this.outputChannel.appendLine(`[ProfileManager] Profile switched successfully`);
    }

    /**
     * Create a new profile
     */
    async createProfile(name: string, profileConfig: Partial<MCPConfig>): Promise<void> {
        const config = this.loadConfigFile();

        // Initialize profiles if not exists
        if (!config.profiles) {
            config.profiles = {};
        }

        if (config.profiles[name]) {
            throw new Error(`Profile '${name}' already exists`);
        }

        // Add new profile
        config.profiles[name] = profileConfig as MCPConfig;

        // Save to file
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');

        this.outputChannel.appendLine(`[ProfileManager] Created profile: ${name}`);
    }

    /**
     * Update an existing profile
     */
    async updateProfile(name: string, profileConfig: Partial<MCPConfig>): Promise<void> {
        const config = this.loadConfigFile();

        if (!config.profiles || !config.profiles[name]) {
            throw new Error(`Profile '${name}' not found`);
        }

        // Merge with existing profile
        config.profiles[name] = {
            ...config.profiles[name],
            ...profileConfig
        } as MCPConfig;

        // Save to file
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');

        this.outputChannel.appendLine(`[ProfileManager] Updated profile: ${name}`);
    }

    /**
     * Delete a profile
     */
    async deleteProfile(name: string): Promise<void> {
        const config = this.loadConfigFile();

        if (!config.profiles || !config.profiles[name]) {
            throw new Error(`Profile '${name}' not found`);
        }

        // Prevent deleting the current profile
        if (this.currentProfile === name) {
            throw new Error('Cannot delete the currently active profile. Switch to another profile first.');
        }

        // Delete profile
        delete config.profiles[name];

        // Save to file
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');

        this.outputChannel.appendLine(`[ProfileManager] Deleted profile: ${name}`);
    }

    /**
     * Set default profile (used on startup)
     */
    async setDefaultProfile(name: string): Promise<void> {
        const config = this.loadConfigFile();

        if (!config.profiles) {
            throw new Error('Config file is not in multi-profile format');
        }

        if (!config.profiles[name]) {
            throw new Error(`Profile '${name}' not found`);
        }

        config.defaultProfile = name;

        // Save to file
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');

        this.outputChannel.appendLine(`[ProfileManager] Set default profile: ${name}`);
    }

    /**
     * Get default profile name
     */
    getDefaultProfile(): string | null {
        const config = this.loadConfigFile();
        return config.defaultProfile || null;
    }

    /**
     * Duplicate a profile (useful for creating similar profiles)
     */
    async duplicateProfile(sourceName: string, targetName: string): Promise<void> {
        const config = this.loadConfigFile();

        if (!config.profiles || !config.profiles[sourceName]) {
            throw new Error(`Profile '${sourceName}' not found`);
        }

        if (config.profiles[targetName]) {
            throw new Error(`Profile '${targetName}' already exists`);
        }

        // Copy profile
        config.profiles[targetName] = {
            ...config.profiles[sourceName],
            connectionName: `${config.profiles[sourceName].connectionName} (Copy)`
        };

        // Save to file
        fs.writeFileSync(this.configFilePath, JSON.stringify(config, null, 2), 'utf-8');

        this.outputChannel.appendLine(`[ProfileManager] Duplicated profile: ${sourceName} → ${targetName}`);
    }
}
