import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * Migration service for converting old bcTelemetryBuddy.* settings to .bctb-config.json
 */
export class MigrationService {
    constructor(private readonly outputChannel: vscode.OutputChannel) { }

    /**
     * Check if old VSCode settings exist that need migration in ANY workspace folder
     */
    hasOldSettings(): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        // Check all workspace folders for old settings
        return workspaceFolders.some(folder => this.hasOldSettingsInFolder(folder));
    }

    /**
     * Check if old VSCode settings exist in a specific workspace folder
     */
    private hasOldSettingsInFolder(workspaceFolder: vscode.WorkspaceFolder): boolean {
        const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);

        // Check for both old bcTelemetryBuddy.* and bctb.mcp.* settings (both are deprecated in favor of .bctb-config.json)
        const oldKeys = [
            // Old namespace (v0.1.x) - newer variants
            'bcTelemetryBuddy.appInsights.appId',
            'bcTelemetryBuddy.kusto.clusterUrl',
            'bcTelemetryBuddy.kusto.database',
            'bcTelemetryBuddy.authFlow',
            'bcTelemetryBuddy.tenantId',
            'bcTelemetryBuddy.clientId',
            'bcTelemetryBuddy.cache.enabled',
            'bcTelemetryBuddy.cache.ttlSeconds',
            'bcTelemetryBuddy.sanitize.removePII',
            'bcTelemetryBuddy.workspace.queriesFolder',
            // Old namespace (v0.1.x) - legacy dotted variants
            'bcTelemetryBuddy.tenant.id',
            'bcTelemetryBuddy.tenant.name',
            'bcTelemetryBuddy.appInsights.id',
            'bcTelemetryBuddy.kusto.url',
            'bcTelemetryBuddy.kusto.cluster',
            'bcTelemetryBuddy.auth.flow',
            'bcTelemetryBuddy.queries.folder',
            'bcTelemetryBuddy.cache.ttl',
            'bcTelemetryBuddy.codelens.enable',
            // New namespace (v0.2.x) - also needs migration to .bctb-config.json
            'bctb.mcp.connectionName',
            'bctb.mcp.authFlow',
            'bctb.mcp.tenantId',
            'bctb.mcp.clientId',
            'bctb.mcp.applicationInsights.appId',
            'bctb.mcp.kusto.clusterUrl',
            'bctb.mcp.cache.enabled',
            'bctb.mcp.cache.ttlSeconds',
            'bctb.mcp.sanitize.removePII'
        ];

        const foundSettings: string[] = [];
        for (const key of oldKeys) {
            const value = config.inspect(key);
            // Debug: Log detailed inspection for bctb.mcp.* keys
            if (key.startsWith('bctb.mcp.')) {
                this.outputChannel.appendLine(`   - Inspecting ${key}:`);
                this.outputChannel.appendLine(`     workspace: ${value?.workspaceValue}, folder: ${value?.workspaceFolderValue}, global: ${value?.globalValue}`);
            }
            if (value?.workspaceValue !== undefined ||
                value?.workspaceFolderValue !== undefined ||
                value?.globalValue !== undefined) {
                foundSettings.push(key);
            }
        }

        if (foundSettings.length > 0) {
            this.outputChannel.appendLine(`   - Found ${foundSettings.length} old settings in ${workspaceFolder.name}: ${foundSettings.join(', ')}`);
        }

        return foundSettings.length > 0;
    }

    /**
     * Check if migration has already been completed
     */
    hasMigrated(context: vscode.ExtensionContext): boolean {
        return context.globalState.get<boolean>('bctb.migrationCompleted', false);
    }

    /**
     * Check if user has dismissed migration notification
     */
    hasDismissedMigration(context: vscode.ExtensionContext): boolean {
        return context.globalState.get<boolean>('bctb.migrationDismissed', false);
    }

    /**
     * Check if .bctb-config.json already exists in ANY workspace folder
     */
    hasConfigFile(): boolean {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return false;
        }

        return workspaceFolders.some(folder => {
            const configPath = path.join(folder.uri.fsPath, '.bctb-config.json');
            return fs.existsSync(configPath);
        });
    }

    /**
     * Check if .bctb-config.json exists in a specific workspace folder
     */
    private hasConfigFileInFolder(workspaceFolder: vscode.WorkspaceFolder): boolean {
        const configPath = path.join(workspaceFolder.uri.fsPath, '.bctb-config.json');
        return fs.existsSync(configPath);
    }

    /**
     * Convert old VSCode settings to .bctb-config.json format for a specific folder
     */
    convertSettings(workspaceFolder?: vscode.WorkspaceFolder): any {
        // Use provided folder or fall back to first folder for backward compatibility
        const folder = workspaceFolder || vscode.workspace.workspaceFolders?.[0];
        const config = vscode.workspace.getConfiguration(undefined, folder?.uri);

        // Read old settings (check v0.2.x bctb.mcp.*, v0.1.x bcTelemetryBuddy.*, and legacy dotted variants)
        const appInsightsId = config.get<string>('bctb.mcp.applicationInsights.appId') ||
            config.get<string>('bcTelemetryBuddy.appInsights.appId') ||
            config.get<string>('bcTelemetryBuddy.appInsights.id', '');
        const kustoUrl = config.get<string>('bctb.mcp.kusto.clusterUrl') ||
            config.get<string>('bcTelemetryBuddy.kusto.clusterUrl') ||
            config.get<string>('bcTelemetryBuddy.kusto.url', 'https://ade.applicationinsights.io');
        const kustoDatabase = config.get<string>('bctb.mcp.kusto.database') ||
            config.get<string>('bcTelemetryBuddy.kusto.database', '');
        const authFlow = config.get<string>('bctb.mcp.authFlow') ||
            config.get<string>('bcTelemetryBuddy.authFlow') ||
            config.get<string>('bcTelemetryBuddy.auth.flow', 'azure_cli');
        const tenantId = config.get<string>('bctb.mcp.tenantId') ||
            config.get<string>('bcTelemetryBuddy.tenantId') ||
            config.get<string>('bcTelemetryBuddy.tenant.id', '');
        const clientId = config.get<string>('bctb.mcp.clientId') ||
            config.get<string>('bcTelemetryBuddy.clientId', '');
        const clientSecret = config.get<string>('bctb.mcp.clientSecret') ||
            config.get<string>('bcTelemetryBuddy.clientSecret', '');
        const cacheEnabled = config.get<boolean>('bctb.mcp.cache.enabled') ??
            config.get<boolean>('bcTelemetryBuddy.cache.enabled', true);
        const cacheTTL = config.get<number>('bctb.mcp.cache.ttlSeconds') ??
            config.get<number>('bcTelemetryBuddy.cache.ttlSeconds') ??
            config.get<number>('bcTelemetryBuddy.cache.ttl', 3600);
        const removePII = config.get<boolean>('bctb.mcp.sanitize.removePII') ??
            config.get<boolean>('bcTelemetryBuddy.sanitize.removePII', false);
        const queriesFolder = config.get<string>('bctb.mcp.workspace.queriesFolder') ||
            config.get<string>('bcTelemetryBuddy.workspace.queriesFolder') ||
            config.get<string>('bcTelemetryBuddy.queries.folder', 'queries');
        const connectionName = config.get<string>('bctb.mcp.connectionName') ||
            config.get<string>('bcTelemetryBuddy.connectionName') ||
            config.get<string>('bcTelemetryBuddy.tenant.name', 'My BC Connection');        // Build new config structure (flat properties to match MCPConfig interface)
        const newConfig: any = {
            "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
            connectionName: connectionName || 'Migrated Connection',
            authFlow: authFlow as 'azure_cli' | 'device_code' | 'client_credentials'
        };

        // Add tenant ID if present
        if (tenantId) {
            newConfig.tenantId = tenantId;
        }

        // Add client credentials if present (use env vars for secrets)
        if (authFlow === 'client_credentials') {
            if (clientId) {
                newConfig.clientId = clientId;
            }
            if (clientSecret) {
                // Store secret as environment variable placeholder
                newConfig.clientSecret = '${BCTB_CLIENT_SECRET}';
                this.outputChannel.appendLine('⚠️  Client secret should be stored in environment variable BCTB_CLIENT_SECRET');
            }
        }

        // Application Insights (flat property)
        if (appInsightsId) {
            newConfig.applicationInsightsAppId = appInsightsId;
        }

        // Kusto (flat property)
        if (kustoUrl) {
            newConfig.kustoClusterUrl = kustoUrl;
        }
        // Keep kustoDatabase for compatibility with older tests and services
        if (kustoDatabase) {
            newConfig.kustoDatabase = kustoDatabase;
        }

        // Cache settings (flat properties)
        newConfig.cacheEnabled = cacheEnabled;
        newConfig.cacheTTLSeconds = cacheTTL;

        // Sanitization (flat property)
        newConfig.removePII = removePII;

        // Workspace settings (flat properties)
        newConfig.workspacePath = '${workspaceFolder}';
        newConfig.queriesFolder = queriesFolder;

        // References (empty array, can be populated later)
        newConfig.references = [];

        return newConfig;
    }

    /**
     * Perform migration: create .bctb-config.json from old settings in all workspace folders
     */
    async migrate(context: vscode.ExtensionContext): Promise<boolean> {
        try {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders || workspaceFolders.length === 0) {
                vscode.window.showErrorMessage('No workspace folder open');
                return false;
            }

            this.outputChannel.appendLine('Starting migration for all workspace folders...');

            const migratedFolders: vscode.WorkspaceFolder[] = [];
            const skippedFolders: vscode.WorkspaceFolder[] = [];

            // Migrate each workspace folder that has old settings
            for (const folder of workspaceFolders) {
                this.outputChannel.appendLine(`\n📁 Checking folder: ${folder.name}`);

                // Skip if already has config file
                if (this.hasConfigFileInFolder(folder)) {
                    this.outputChannel.appendLine(`   ⏭️  Skipping (already has .bctb-config.json)`);
                    skippedFolders.push(folder);
                    continue;
                }

                // Skip if no old settings
                if (!this.hasOldSettingsInFolder(folder)) {
                    this.outputChannel.appendLine(`   ⏭️  Skipping (no old settings found)`);
                    skippedFolders.push(folder);
                    continue;
                }

                // Convert settings for this folder
                const newConfig = this.convertSettings(folder);

                // Write to .bctb-config.json in this folder
                const configPath = path.join(folder.uri.fsPath, '.bctb-config.json');
                fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2), 'utf-8');

                this.outputChannel.appendLine(`   ✅ Created .bctb-config.json`);
                migratedFolders.push(folder);
            }

            if (migratedFolders.length === 0) {
                vscode.window.showInformationMessage('No folders needed migration');
                return false;
            }

            // Mark migration as completed
            await context.globalState.update('bctb.migrationCompleted', true);

            // Open the first migrated config file
            const firstConfigPath = path.join(migratedFolders[0].uri.fsPath, '.bctb-config.json');
            const document = await vscode.workspace.openTextDocument(firstConfigPath);
            await vscode.window.showTextDocument(document);

            // Show summary
            const summary = `✅ Migrated ${migratedFolders.length} folder(s): ${migratedFolders.map(f => f.name).join(', ')}`;
            this.outputChannel.appendLine(`\n${summary}`);

            // Ask to clean up old settings
            const cleanup = await vscode.window.showInformationMessage(
                `${summary}\n\nRemove old settings from .vscode/settings.json in all folders?`,
                { modal: true },
                'Yes, Remove Them',
                'No, Keep Them'
            );

            if (cleanup === 'Yes, Remove Them') {
                await this.cleanupOldSettings();
                vscode.window.showInformationMessage('✅ Old settings removed from all folders');
            }

            return true;
        } catch (error: any) {
            this.outputChannel.appendLine(`❌ Migration failed: ${error.message}`);
            vscode.window.showErrorMessage(`Migration failed: ${error.message}`);
            return false;
        }
    }

    /**
     * Show migration notification with Migrate button
     */
    async showMigrationNotification(context: vscode.ExtensionContext): Promise<void> {
        this.outputChannel.appendLine('🔍 Checking migration status...');

        // Check if ANY folder has config file - if not, reset migration state
        const hasConfig = this.hasConfigFile();
        this.outputChannel.appendLine(`   - Has .bctb-config.json in any folder: ${hasConfig}`);

        if (!hasConfig) {
            // Reset migration state if no config files found
            await context.globalState.update('bctb.migrationCompleted', undefined);
        }

        // Don't show if already migrated or dismissed
        const alreadyMigrated = this.hasMigrated(context);
        const dismissed = this.hasDismissedMigration(context);
        this.outputChannel.appendLine(`   - Already migrated: ${alreadyMigrated}`);
        this.outputChannel.appendLine(`   - Dismissed: ${dismissed}`);

        if (alreadyMigrated || dismissed) {
            this.outputChannel.appendLine('ℹ️  Migration already completed or dismissed, skipping notification');
            return;
        }

        // Don't show if no old settings exist
        const hasOld = this.hasOldSettings();
        this.outputChannel.appendLine(`   - Has old settings: ${hasOld}`);

        if (!hasOld) {
            this.outputChannel.appendLine('ℹ️  No old settings detected, skipping migration notification');
            return;
        }

        // If config file exists, mark as completed and skip
        if (hasConfig) {
            this.outputChannel.appendLine('ℹ️  .bctb-config.json already exists, skipping migration notification');
            await context.globalState.update('bctb.migrationCompleted', true);
            return;
        }

        this.outputChannel.appendLine('📋 Old settings detected, showing migration notification...');

        const action = await vscode.window.showInformationMessage(
            'BC Telemetry Buddy settings format has changed. Migrate to .bctb-config.json?',
            { modal: true },
            'Migrate Now',
            'Learn More',
            'Not Now'
        );

        if (action === 'Migrate Now') {
            await this.migrate(context);
        } else if (action === 'Learn More') {
            vscode.env.openExternal(vscode.Uri.parse('https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/MIGRATION.md'));
            // Show notification again after they read the guide
            const retry = await vscode.window.showInformationMessage(
                'Ready to migrate now?',
                'Migrate Now',
                'Not Now'
            );
            if (retry === 'Migrate Now') {
                await this.migrate(context);
            }
        } else if (action === 'Not Now') {
            await context.globalState.update('bctb.migrationDismissed', true);
            this.outputChannel.appendLine('ℹ️  Migration notification dismissed');
        }
    }

    /**
     * Preview what the migrated config will look like
     */
    previewMigration(): string {
        const newConfig = this.convertSettings();
        return JSON.stringify(newConfig, null, 2);
    }

    /**
     * Clean up old settings from VSCode settings.json in all workspace folders
     */
    async cleanupOldSettings(): Promise<void> {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders || workspaceFolders.length === 0) {
            return;
        }

        // Clean up settings in all workspace folders
        for (const folder of workspaceFolders) {
            await this.cleanupOldSettingsInFolder(folder);
        }
    }

    /**
     * Clean up old settings from a specific workspace folder
     */
    private async cleanupOldSettingsInFolder(workspaceFolder: vscode.WorkspaceFolder): Promise<void> {
        const config = vscode.workspace.getConfiguration(undefined, workspaceFolder.uri);

        // Remove both old namespaces (v0.1.x and v0.2.x) and legacy dotted variants
        const oldKeys = [
            // v0.1.x namespace - newer variants
            'bcTelemetryBuddy.appInsights.appId',
            'bcTelemetryBuddy.kusto.clusterUrl',
            'bcTelemetryBuddy.kusto.database',
            'bcTelemetryBuddy.authFlow',
            'bcTelemetryBuddy.tenantId',
            'bcTelemetryBuddy.clientId',
            'bcTelemetryBuddy.clientSecret',
            'bcTelemetryBuddy.cache.enabled',
            'bcTelemetryBuddy.cache.ttlSeconds',
            'bcTelemetryBuddy.sanitize.removePII',
            'bcTelemetryBuddy.workspace.queriesFolder',
            'bcTelemetryBuddy.connectionName',
            // v0.1.x namespace - legacy dotted variants
            'bcTelemetryBuddy.tenant.id',
            'bcTelemetryBuddy.tenant.name',
            'bcTelemetryBuddy.appInsights.id',
            'bcTelemetryBuddy.kusto.url',
            'bcTelemetryBuddy.kusto.cluster',
            'bcTelemetryBuddy.auth.flow',
            'bcTelemetryBuddy.queries.folder',
            'bcTelemetryBuddy.cache.ttl',
            'bcTelemetryBuddy.codelens.enable',
            // v0.2.x namespace
            'bctb.mcp.connectionName',
            'bctb.mcp.authFlow',
            'bctb.mcp.tenantId',
            'bctb.mcp.clientId',
            'bctb.mcp.clientSecret',
            'bctb.mcp.applicationInsights.appId',
            'bctb.mcp.kusto.clusterUrl',
            'bctb.mcp.kusto.database',
            'bctb.mcp.cache.enabled',
            'bctb.mcp.cache.ttlSeconds',
            'bctb.mcp.sanitize.removePII',
            'bctb.mcp.workspace.queriesFolder'
        ];

        try {
            this.outputChannel.appendLine(`Removing old settings from ${workspaceFolder.name}...`);
            for (const key of oldKeys) {
                await config.update(key, undefined, vscode.ConfigurationTarget.WorkspaceFolder);
            }
            this.outputChannel.appendLine(`✅ Removed ${oldKeys.length} old settings from ${workspaceFolder.name}`);
        } catch (error: any) {
            this.outputChannel.appendLine(`⚠️  Error cleaning up settings in ${workspaceFolder.name}: ${error.message}`);
        }
    }
}
