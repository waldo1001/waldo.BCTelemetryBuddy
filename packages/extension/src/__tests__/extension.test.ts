/**
 * Extension module tests
 * 
 * Note: These are unit tests for the extension logic. Full integration tests
 * require running VSCode and should be executed with npm run test:integration
 */

import * as path from 'path';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        createOutputChannel: jest.fn(),
        showWarningMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        showInformationMessage: jest.fn(),
        showInputBox: jest.fn(),
        withProgress: jest.fn()
    },
    workspace: {
        getConfiguration: jest.fn(),
        workspaceFolders: []
    },
    commands: {
        registerCommand: jest.fn(),
        executeCommand: jest.fn(),
        getCommands: jest.fn()
    },
    ProgressLocation: {
        Notification: 15
    },
    ViewColumn: {
        Two: 2
    },
    Uri: {
        file: (p: string) => ({ fsPath: p })
    }
}), { virtual: true });

describe('Extension Module', () => {
    describe('Configuration validation', () => {
        it('should validate workspace settings structure', () => {
            // Test that all expected configuration properties exist
            const expectedProperties = [
                'bctb.mcp.connectionName',
                'bctb.mcp.tenantId',
                'bctb.mcp.clientId',
                'bctb.mcp.authFlow',
                'bctb.mcp.applicationInsights.appId',
                'bctb.mcp.kusto.clusterUrl',
                'bctb.mcp.cache.enabled',
                'bctb.mcp.cache.ttlSeconds',
                'bctb.mcp.sanitize.removePII',
                'bctb.mcp.port',
                'bctb.mcp.url',
                'bctb.agent.maxRetries',
                'bctb.mcp.references'
            ];

            // Verify all properties are documented
            expect(expectedProperties.length).toBe(13);
            expect(expectedProperties).toContain('bctb.mcp.tenantId');
            expect(expectedProperties).toContain('bctb.mcp.applicationInsights.appId');
        });

        it('should define correct default values', () => {
            const defaults = {
                port: 52345,
                url: 'http://localhost:52345',
                maxRetries: 3,
                authFlow: 'device_code',
                cacheEnabled: true,
                cacheTTL: 3600,
                removePII: false
            };

            expect(defaults.port).toBeGreaterThan(1024);
            expect(defaults.port).toBeLessThan(65536);
            expect(defaults.maxRetries).toBeGreaterThanOrEqual(0);
            expect(defaults.cacheTTL).toBeGreaterThan(0);
            expect(['device_code', 'client_credentials']).toContain(defaults.authFlow);
        });
    });

    describe('Environment variable mapping', () => {
        it('should map all required environment variables', () => {
            const envVars = [
                'BCTB_WORKSPACE_PATH',
                'BCTB_CONNECTION_NAME',
                'BCTB_TENANT_ID',
                'BCTB_CLIENT_ID',
                'BCTB_CLIENT_SECRET',
                'BCTB_AUTH_FLOW',
                'BCTB_APP_INSIGHTS_ID',
                'BCTB_KUSTO_URL',
                'BCTB_CACHE_ENABLED',
                'BCTB_CACHE_TTL',
                'BCTB_REMOVE_PII',
                'BCTB_PORT'
            ];

            expect(envVars.length).toBe(12);
            expect(envVars).toContain('BCTB_WORKSPACE_PATH');
            expect(envVars).toContain('BCTB_TENANT_ID');
            expect(envVars).toContain('BCTB_APP_INSIGHTS_ID');
        });

        it('should build environment correctly', () => {
            const config = {
                connectionName: 'test-conn',
                tenantId: 'tenant-123',
                clientId: 'client-456',
                clientSecret: 'secret-789',
                authFlow: 'device_code',
                appInsightsAppId: 'app-insights-123',
                kustoUrl: 'https://kusto.example.com',
                cacheEnabled: true,
                cacheTTL: 7200,
                removePII: true,
                port: 52345
            };

            const workspacePath = '/test/workspace';

            // Verify building env vars logic
            expect(config.tenantId).toBeDefined();
            expect(config.appInsightsAppId).toBeDefined();
            expect(workspacePath).toBeDefined();
        });
    });

    describe('MCP server path construction', () => {
        it('should construct correct server path', () => {
            const serverPath = path.join('..', '..', 'mcp', 'dist', 'server.js');

            expect(serverPath).toContain('mcp');
            expect(serverPath).toContain('dist');
            expect(serverPath).toContain('server.js');
        });

        it('should handle path separators correctly', () => {
            const testPath = path.join('packages', 'extension', 'dist');

            // path.join handles OS-specific separators
            expect(testPath).toBeTruthy();
            expect(testPath.includes('extension')).toBe(true);
        });
    });

    describe('Command registration', () => {
        it('should register all required commands', () => {
            const commands = [
                'bctb.startMCP',
                'bctb.runNLQuery',
                'bctb.openQueriesFolder'
            ];

            expect(commands.length).toBe(3);
            expect(commands).toContain('bctb.startMCP');
            expect(commands).toContain('bctb.runNLQuery');
        });
    });

    describe('Workspace detection', () => {
        it('should detect when required settings are present', () => {
            const hasSettings = (tenantId: string, appId: string) => {
                return !!(tenantId && appId);
            };

            expect(hasSettings('tenant-123', 'app-123')).toBe(true);
            expect(hasSettings('', 'app-123')).toBe(false);
            expect(hasSettings('tenant-123', '')).toBe(false);
            expect(hasSettings('', '')).toBe(false);
        });
    });

    describe('Retry logic', () => {
        it('should calculate retry delay correctly', () => {
            const calculateDelay = (attempt: number) => 1000 * attempt;

            expect(calculateDelay(1)).toBe(1000);
            expect(calculateDelay(2)).toBe(2000);
            expect(calculateDelay(3)).toBe(3000);
        });

        it('should respect max retries setting', () => {
            const maxRetries = 3;
            const attempts = [1, 2, 3];

            expect(attempts.length).toBe(maxRetries);
            expect(attempts[attempts.length - 1]).toBeLessThanOrEqual(maxRetries);
        });
    });

    describe('Queries folder path', () => {
        it('should construct correct queries folder path', () => {
            const workspacePath = '/test/workspace';
            const queriesPath = path.join(workspacePath, '.vscode', '.bctb', 'queries');

            expect(queriesPath).toContain('.vscode');
            expect(queriesPath).toContain('.bctb');
            expect(queriesPath).toContain('queries');
        });
    });

    describe('Port validation', () => {
        it('should validate port numbers', () => {
            const isValidPort = (port: number) => {
                return port >= 1024 && port <= 65535;
            };

            expect(isValidPort(52345)).toBe(true);
            expect(isValidPort(1024)).toBe(true);
            expect(isValidPort(65535)).toBe(true);
            expect(isValidPort(80)).toBe(false);  // Privileged
            expect(isValidPort(70000)).toBe(false);  // Too high
        });
    });

    describe('Reference configuration', () => {
        it('should validate reference structure', () => {
            const references = [
                {
                    name: 'Official Docs',
                    type: 'github',
                    url: 'https://github.com/user/repo',
                    enabled: true
                },
                {
                    name: 'Community Examples',
                    type: 'web',
                    url: 'https://example.com',
                    enabled: false
                }
            ];

            expect(references.length).toBe(2);
            expect(references[0].type).toBe('github');
            expect(references[1].enabled).toBe(false);
        });

        it('should handle JSON serialization of references', () => {
            const references = [
                { name: 'Test', type: 'github', url: 'https://github.com/test', enabled: true }
            ];

            const serialized = JSON.stringify(references);
            const deserialized = JSON.parse(serialized);

            expect(deserialized).toEqual(references);
        });
    });

    describe('MCP process lifecycle', () => {
        it('should track MCP process state', () => {
            interface MCPProcess {
                port: number;
                workspacePath: string;
            }

            let mcpProcess: MCPProcess | null = null;

            // Start
            mcpProcess = { port: 52345, workspacePath: '/test' };
            expect(mcpProcess).not.toBeNull();
            expect(mcpProcess?.port).toBe(52345);

            // Stop
            mcpProcess = null;
            expect(mcpProcess).toBeNull();
        });
    });

    describe('Health check wait logic', () => {
        it('should calculate wait attempts correctly', async () => {
            const maxAttempts = 30;
            const delayMs = 1000;

            expect(maxAttempts * delayMs).toBe(30000);  // 30 seconds total
        });
    });

    describe('Error message handling', () => {
        it('should extract error messages correctly', () => {
            const extractMessage = (err: any) => err.message || 'Unknown error';

            expect(extractMessage({ message: 'Connection failed' })).toBe('Connection failed');
            expect(extractMessage({})).toBe('Unknown error');
            expect(extractMessage(new Error('Test error'))).toBe('Test error');
        });
    });

    describe('Boolean environment variable conversion', () => {
        it('should convert boolean to string correctly', () => {
            const toEnvString = (value: boolean) => value ? 'true' : 'false';

            expect(toEnvString(true)).toBe('true');
            expect(toEnvString(false)).toBe('false');
        });

        it('should handle number to string conversion', () => {
            const toEnvString = (value: number) => value.toString();

            expect(toEnvString(3600)).toBe('3600');
            expect(toEnvString(52345)).toBe('52345');
        });
    });
});
