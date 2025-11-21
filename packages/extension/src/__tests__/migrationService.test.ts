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

    describe('Edge Cases and Error Handling', () => {
        describe('hasOldSettings - edge cases', () => {
            it('should return false when no workspace folders exist', () => {
                (vscode.workspace as any).workspaceFolders = undefined;
                expect(migrationService.hasOldSettings()).toBe(false);
            });

            it('should return false when workspace folders is empty array', () => {
                (vscode.workspace as any).workspaceFolders = [];
                expect(migrationService.hasOldSettings()).toBe(false);
            });

            it('should check all workspace folders and return true if any has old settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'folder1', uri: { fsPath: '/test/folder1' } },
                    { name: 'folder2', uri: { fsPath: '/test/folder2' } }
                ];

                const mockConfig1 = { inspect: jest.fn(() => ({})) };
                const mockConfig2 = {
                    inspect: jest.fn((key: string) => {
                        if (key === 'bctb.mcp.tenantId') {
                            return { workspaceValue: 'test-tenant' };
                        }
                        return {};
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock)
                    .mockReturnValueOnce(mockConfig1)
                    .mockReturnValueOnce(mockConfig2);

                expect(migrationService.hasOldSettings()).toBe(true);
            });

            it('should detect bctb.mcp.* namespace settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    inspect: jest.fn((key: string) => {
                        if (key === 'bctb.mcp.authFlow') {
                            return { globalValue: 'device_code' };
                        }
                        return {};
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                expect(migrationService.hasOldSettings()).toBe(true);
            });

            it('should detect legacy dotted variant settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    inspect: jest.fn((key: string) => {
                        if (key === 'bcTelemetryBuddy.tenant.id') {
                            return { workspaceFolderValue: 'legacy-tenant' };
                        }
                        return {};
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                expect(migrationService.hasOldSettings()).toBe(true);
            });
        });

        describe('hasConfigFile - edge cases', () => {
            it('should return false when no workspace folders exist', () => {
                (vscode.workspace as any).workspaceFolders = undefined;
                expect(migrationService.hasConfigFile()).toBe(false);
            });

            it('should return false when workspace folders is empty array', () => {
                (vscode.workspace as any).workspaceFolders = [];
                expect(migrationService.hasConfigFile()).toBe(false);
            });

            it('should check all workspace folders for config files', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'folder1', uri: { fsPath: '/test/folder1' } },
                    { name: 'folder2', uri: { fsPath: '/test/folder2' } }
                ];

                (fs.existsSync as jest.Mock)
                    .mockReturnValueOnce(false)
                    .mockReturnValueOnce(true);

                expect(migrationService.hasConfigFile()).toBe(true);
            });
        });

        describe('convertSettings - comprehensive coverage', () => {
            it('should convert all v0.2.x bctb.mcp.* settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        const values: Record<string, any> = {
                            'bctb.mcp.applicationInsights.appId': 'bctb-app-id',
                            'bctb.mcp.kusto.clusterUrl': 'https://bctb.kusto.windows.net',
                            'bctb.mcp.kusto.database': 'bctb-db',
                            'bctb.mcp.authFlow': 'device_code',
                            'bctb.mcp.tenantId': 'bctb-tenant',
                            'bctb.mcp.connectionName': 'BCTB Connection',
                            'bctb.mcp.cache.enabled': false,
                            'bctb.mcp.cache.ttlSeconds': 7200,
                            'bctb.mcp.sanitize.removePII': true,
                            'bctb.mcp.workspace.queriesFolder': 'bctb-queries'
                        };
                        return values[key] ?? defaultValue;
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.applicationInsightsAppId).toBe('bctb-app-id');
                expect(result.kustoClusterUrl).toBe('https://bctb.kusto.windows.net');
                expect(result.kustoDatabase).toBe('bctb-db');
                expect(result.authFlow).toBe('device_code');
                expect(result.tenantId).toBe('bctb-tenant');
                expect(result.connectionName).toBe('BCTB Connection');
                expect(result.cacheEnabled).toBe(false);
                expect(result.cacheTTLSeconds).toBe(7200);
                expect(result.removePII).toBe(true);
                expect(result.queriesFolder).toBe('bctb-queries');
            });

            it('should fallback to legacy bcTelemetryBuddy.* settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        const values: Record<string, any> = {
                            'bcTelemetryBuddy.appInsights.appId': 'legacy-app-id',
                            'bcTelemetryBuddy.kusto.clusterUrl': 'https://legacy.kusto.windows.net',
                            'bcTelemetryBuddy.authFlow': 'azure_cli',
                            'bcTelemetryBuddy.tenantId': 'legacy-tenant'
                        };
                        return values[key] ?? defaultValue;
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.applicationInsightsAppId).toBe('legacy-app-id');
                expect(result.kustoClusterUrl).toBe('https://legacy.kusto.windows.net');
                expect(result.authFlow).toBe('azure_cli');
                expect(result.tenantId).toBe('legacy-tenant');
            });

            it('should fallback to legacy dotted variant settings', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        const values: Record<string, any> = {
                            'bcTelemetryBuddy.appInsights.id': 'dotted-app-id',
                            'bcTelemetryBuddy.kusto.url': 'https://dotted.kusto.windows.net',
                            'bcTelemetryBuddy.auth.flow': 'device_code',
                            'bcTelemetryBuddy.tenant.id': 'dotted-tenant',
                            'bcTelemetryBuddy.tenant.name': 'Dotted Connection',
                            'bcTelemetryBuddy.queries.folder': 'dotted-queries',
                            'bcTelemetryBuddy.cache.ttl': 1800
                        };
                        return values[key] ?? defaultValue;
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.applicationInsightsAppId).toBe('dotted-app-id');
                expect(result.kustoClusterUrl).toBe('https://dotted.kusto.windows.net');
                expect(result.authFlow).toBe('device_code');
                expect(result.tenantId).toBe('dotted-tenant');
                expect(result.connectionName).toBe('Dotted Connection');
                expect(result.queriesFolder).toBe('dotted-queries');
                expect(result.cacheTTLSeconds).toBe(1800);
            });

            it('should handle client_credentials auth flow with client secret', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        const values: Record<string, any> = {
                            'bctb.mcp.authFlow': 'client_credentials',
                            'bctb.mcp.clientId': 'test-client-id',
                            'bctb.mcp.clientSecret': 'test-secret'
                        };
                        return values[key] ?? defaultValue;
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.authFlow).toBe('client_credentials');
                expect(result.clientId).toBe('test-client-id');
                expect(result.clientSecret).toBe('${BCTB_CLIENT_SECRET}');
                expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                    expect.stringContaining('Client secret should be stored in environment variable')
                );
            });

            it('should use defaults when no settings are configured', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => defaultValue)
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.kustoClusterUrl).toBe('https://ade.applicationinsights.io');
                expect(result.authFlow).toBe('azure_cli');
                // Default is 'My BC Connection' from bcTelemetryBuddy.tenant.name default
                expect(result.connectionName).toBe('My BC Connection');
                expect(result.cacheEnabled).toBe(true);
                expect(result.cacheTTLSeconds).toBe(3600);
                expect(result.removePII).toBe(false);
                expect(result.queriesFolder).toBe('queries');
            });

            it('should handle boolean cache settings with nullish coalescing', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        if (key === 'bctb.mcp.cache.enabled') return false;
                        if (key === 'bctb.mcp.sanitize.removePII') return false;
                        return defaultValue;
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.cacheEnabled).toBe(false);
                expect(result.removePII).toBe(false);
            });

            it('should always include schema and references', () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => defaultValue)
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.convertSettings();

                expect(result.$schema).toContain('config-schema.json');
                expect(result.references).toEqual([]);
                expect(result.workspacePath).toBe('${workspaceFolder}');
            });
        });

        describe('migrate - error scenarios', () => {
            it('should handle fs.writeFileSync errors gracefully', async () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'test', uri: { fsPath: '/test' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        if (key === 'bcTelemetryBuddy.appInsights.appId') return 'test-id';
                        return defaultValue;
                    }),
                    inspect: jest.fn((key: string) => {
                        if (key === 'bcTelemetryBuddy.appInsights.appId') {
                            return { workspaceValue: 'test-id' };
                        }
                        return {};
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
                (fs.existsSync as jest.Mock).mockReturnValue(false);
                (fs.writeFileSync as jest.Mock).mockImplementation(() => {
                    throw new Error('EACCES: permission denied');
                });
                (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

                const result = await migrationService.migrate(mockContext);

                expect(result).toBe(false);
                expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
                    expect.stringContaining('permission denied')
                );
            });

            it('should skip folders that already have config files but migrate others', async () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'folder1', uri: { fsPath: '/test/folder1' } },
                    { name: 'folder2', uri: { fsPath: '/test/folder2' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => {
                        if (key === 'bcTelemetryBuddy.appInsights.appId') return 'test-id';
                        return defaultValue;
                    }),
                    inspect: jest.fn((key: string) => {
                        if (key === 'bcTelemetryBuddy.appInsights.appId') {
                            return { workspaceValue: 'test-id' };
                        }
                        return {};
                    })
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
                (fs.existsSync as jest.Mock)
                    .mockReturnValueOnce(true)  // folder1 has config (skip)
                    .mockReturnValueOnce(false); // folder2 doesn't (migrate)
                (fs.writeFileSync as jest.Mock).mockImplementation(() => { }); // Success
                (vscode.workspace.openTextDocument as jest.Mock).mockResolvedValue({});
                (vscode.window.showTextDocument as jest.Mock).mockResolvedValue({});
                (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('No, Keep Them');

                const result = await migrationService.migrate(mockContext);

                // Returns true because folder2 was migrated
                expect(result).toBe(true);
                expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                    expect.stringContaining('Skipping')
                );
                expect(mockContext.globalState.update).toHaveBeenCalledWith('bctb.migrationCompleted', true);
            });

            it('should skip folders without old settings and return false if all skipped', async () => {
                (vscode.workspace as any).workspaceFolders = [
                    { name: 'folder1', uri: { fsPath: '/test/folder1' } }
                ];

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => defaultValue),
                    inspect: jest.fn(() => ({}))
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);
                (fs.existsSync as jest.Mock).mockReturnValue(false);
                (vscode.window.showInformationMessage as jest.Mock).mockResolvedValue('Close');

                const result = await migrationService.migrate(mockContext);

                // When all folders are skipped (no migration performed), returns false
                expect(result).toBe(false);
                expect(mockOutputChannel.appendLine).toHaveBeenCalledWith(
                    expect.stringContaining('no old settings')
                );
                expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
                    'No folders needed migration'
                );
            });
        });

        describe('previewMigration - edge cases', () => {
            it('should handle missing workspace folders gracefully', () => {
                (vscode.workspace as any).workspaceFolders = undefined;

                const mockConfig = {
                    get: jest.fn((key: string, defaultValue?: any) => defaultValue)
                };

                (vscode.workspace.getConfiguration as jest.Mock).mockReturnValue(mockConfig);

                const result = migrationService.previewMigration();

                expect(result).toContain('"$schema"');
                // Default connection name is 'My BC Connection' from bcTelemetryBuddy.tenant.name default
                expect(result).toContain('"connectionName": "My BC Connection"');
            });
        });
    });
});
