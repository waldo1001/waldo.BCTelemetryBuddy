import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { MigrationService } from '../services/migrationService';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(() => ({
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        })),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showTextDocument: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: [],
        openTextDocument: jest.fn()
    },
    env: {
        openExternal: jest.fn()
    },
    Uri: {
        parse: jest.fn((uri: string) => ({ toString: () => uri }))
    },
    ConfigurationTarget: {
        Global: 1,
        Workspace: 2,
        WorkspaceFolder: 3
    }
}), { virtual: true });

// Mock fs module
jest.mock('fs');

describe('MigrationService', () => {
    let migrationService: MigrationService;
    let mockOutputChannel: any;
    let mockContext: any;

    beforeEach(() => {
        // Reset mocks
        jest.clearAllMocks();

        // Create mock output channel
        mockOutputChannel = {
            appendLine: jest.fn(),
            show: jest.fn(),
            dispose: jest.fn()
        };

        // Create mock context
        mockContext = {
            globalState: {
                get: jest.fn(),
                update: jest.fn()
            }
        };

        migrationService = new MigrationService(mockOutputChannel);
    });

    describe('hasOldSettings', () => {
        it('should return true when old settings exist', () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                inspect: jest.fn((key: string) => {
                    if (key === 'bcTelemetryBuddy.appInsights.appId') {
                        return { workspaceValue: 'test-app-id' };
                    }
                    return {};
                })
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            expect(migrationService.hasOldSettings()).toBe(true);
        });

        it('should return false when no old settings exist', () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                inspect: jest.fn(() => ({}))
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            expect(migrationService.hasOldSettings()).toBe(false);
        });
    });

    describe('hasMigrated', () => {
        it('should return true when migration is completed', () => {
            mockContext.globalState.get.mockReturnValue(true);

            expect(migrationService.hasMigrated(mockContext)).toBe(true);
            expect(mockContext.globalState.get).toHaveBeenCalledWith('bctb.migrationCompleted', false);
        });

        it('should return false when migration is not completed', () => {
            mockContext.globalState.get.mockReturnValue(false);

            expect(migrationService.hasMigrated(mockContext)).toBe(false);
        });
    });

    describe('hasDismissedMigration', () => {
        it('should return true when user dismissed migration', () => {
            mockContext.globalState.get.mockReturnValue(true);

            expect(migrationService.hasDismissedMigration(mockContext)).toBe(true);
            expect(mockContext.globalState.get).toHaveBeenCalledWith('bctb.migrationDismissed', false);
        });

        it('should return false when user has not dismissed migration', () => {
            mockContext.globalState.get.mockReturnValue(false);

            expect(migrationService.hasDismissedMigration(mockContext)).toBe(false);
        });
    });

    describe('hasConfigFile', () => {
        it('should return true when .bctb-config.json exists', () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } }
            ];

            (fs.existsSync as jest.Mock).mockReturnValue(true);

            expect(migrationService.hasConfigFile()).toBe(true);
            expect(fs.existsSync).toHaveBeenCalledWith(path.join('/test/workspace', '.bctb-config.json'));
        });

        it('should return false when .bctb-config.json does not exist', () => {
            (vscode.workspace as any).workspaceFolders = [
                { uri: { fsPath: '/test/workspace' } }
            ];

            (fs.existsSync as jest.Mock).mockReturnValue(false);

            expect(migrationService.hasConfigFile()).toBe(false);
        });

        it('should return false when no workspace folders open', () => {
            (vscode.workspace as any).workspaceFolders = [];

            expect(migrationService.hasConfigFile()).toBe(false);
        });
    });

    describe('convertSettings', () => {
        it('should convert old settings to new config format', () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    const settings: Record<string, any> = {
                        'bcTelemetryBuddy.appInsights.appId': 'test-app-id',
                        'bcTelemetryBuddy.kusto.clusterUrl': 'https://test.kusto.windows.net',
                        'bcTelemetryBuddy.kusto.database': 'TestDB',
                        'bcTelemetryBuddy.authFlow': 'device_code',
                        'bcTelemetryBuddy.tenantId': 'test-tenant-id',
                        'bcTelemetryBuddy.cache.enabled': true,
                        'bcTelemetryBuddy.cache.ttlSeconds': 7200,
                        'bcTelemetryBuddy.sanitize.removePII': true,
                        'bcTelemetryBuddy.workspace.queriesFolder': 'my-queries',
                        'bcTelemetryBuddy.connectionName': 'Test Connection'
                    };
                    return settings[key] !== undefined ? settings[key] : defaultValue;
                })
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            const result = migrationService.convertSettings();

            expect(result).toEqual({
                "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
                connectionName: 'Test Connection',
                authFlow: 'device_code',
                tenantId: 'test-tenant-id',
                applicationInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://test.kusto.windows.net',
                // kustoDatabase removed in v0.2: keep it to maintain compatibility with older tests
                kustoDatabase: 'TestDB',
                workspacePath: '${workspaceFolder}',
                queriesFolder: 'my-queries',
                cacheEnabled: true,
                cacheTTLSeconds: 7200,
                removePII: true,
                references: []
            });
        });

        it('should handle client credentials auth flow', () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    const settings: Record<string, any> = {
                        'bcTelemetryBuddy.authFlow': 'client_credentials',
                        'bcTelemetryBuddy.clientId': 'test-client-id',
                        'bcTelemetryBuddy.clientSecret': 'test-secret',
                        'bcTelemetryBuddy.appInsights.appId': 'test-app-id',
                        'bcTelemetryBuddy.kusto.clusterUrl': 'https://test.kusto.windows.net',
                        'bcTelemetryBuddy.cache.enabled': true,
                        'bcTelemetryBuddy.cache.ttlSeconds': 3600,
                        'bcTelemetryBuddy.sanitize.removePII': false,
                        'bcTelemetryBuddy.workspace.queriesFolder': 'queries',
                        'bcTelemetryBuddy.connectionName': 'Test'
                    };
                    return settings[key] !== undefined ? settings[key] : defaultValue;
                })
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            const result = migrationService.convertSettings();

            expect(result.authFlow).toBe('client_credentials');
            expect(result.clientId).toBe('test-client-id');
            expect(result.clientSecret).toBe('${BCTB_CLIENT_SECRET}');
        });
    });

    describe('migrate', () => {
        it('should create .bctb-config.json file', async () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                get: jest.fn((key: string, defaultValue?: any) => defaultValue),
                inspect: jest.fn(() => ({ workspaceValue: 'test' }))
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
            (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

            const result = await migrationService.migrate(mockContext);

            expect(result).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                path.join('/test/workspace', '.bctb-config.json'),
                expect.any(String),
                'utf-8'
            );
            expect(mockContext.globalState.update).toHaveBeenCalledWith('bctb.migrationCompleted', true);
        });

        it('should handle migration errors', async () => {
            (vscode.workspace as any).workspaceFolders = [];

            const result = await migrationService.migrate(mockContext);

            expect(result).toBe(false);
            expect(vscode.window.showErrorMessage).toHaveBeenCalled();
        });
    });

    describe('previewMigration', () => {
        it('should return JSON string of migrated config', () => {
            (vscode.workspace as any).workspaceFolders = [
                { name: 'test-workspace', uri: { fsPath: '/test/workspace' } }
            ];

            const mockConfig = {
                get: jest.fn((key: string, defaultValue?: any) => {
                    if (key === 'bcTelemetryBuddy.appInsights.appId') return 'test-app-id';
                    return defaultValue;
                })
            };

            (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

            const result = migrationService.previewMigration();

            expect(result).toContain('"applicationInsightsAppId": "test-app-id"');
            expect(result).toContain('"$schema"');
        });
    });
});
