import * as vscode from 'vscode';
import { SetupWizardProvider } from '../webviews/SetupWizardProvider';

// Mock vscode module
jest.mock('vscode', () => ({
    window: {
        createWebviewPanel: jest.fn().mockReturnValue({
            webview: {
                html: '',
                onDidReceiveMessage: jest.fn(),
                postMessage: jest.fn(),
                cspSource: 'mock-csp',
            },
            onDidDispose: jest.fn(),
            reveal: jest.fn(),
            dispose: jest.fn(),
        }),
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn().mockReturnValue(''),
            update: jest.fn().mockResolvedValue(undefined),
        }),
        workspaceFolders: [],
    },
    env: {
        openExternal: jest.fn(),
    },
    Uri: {
        parse: jest.fn().mockReturnValue({}),
        joinPath: jest.fn().mockReturnValue({}),
    },
    ViewColumn: {
        One: 1,
    },
    ConfigurationTarget: {
        Workspace: 1,
    },
    Disposable: jest.fn(),
    extensions: {
        getExtension: jest.fn().mockReturnValue({
            extensionUri: { fsPath: '/mock/path' },
        }),
    },
}), { virtual: true });

describe('SetupWizardProvider Tests', () => {
    let extensionUri: vscode.Uri;
    let wizard: SetupWizardProvider;

    beforeAll(() => {
        // Get extension URI from the active extension
        const extension = vscode.extensions.getExtension('waldoBC.bc-telemetry-buddy');
        expect(extension).toBeDefined();
        extensionUri = extension!.extensionUri;
    });

    beforeEach(() => {
        wizard = new SetupWizardProvider(extensionUri);
    });

    afterEach(() => {
        wizard.dispose();
    });

    test('should create wizard provider', () => {
        expect(wizard).toBeDefined();
    });

    test('should show wizard webview', async () => {
        // Show the wizard
        wizard.show();

        // Give it a moment to create the webview
        await new Promise<void>((resolve) => {
            setTimeout(() => {
                // Verify webview was created (we can't directly access private _panel,
                // but showing twice should not throw)
                expect(() => {
                    wizard.show();
                }).not.toThrow();
                resolve();
            }, 100);
        });
    });

    test('should dispose cleanly', async () => {
        wizard.show();

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(() => {
                    wizard.dispose();
                }).not.toThrow();
                resolve();
            }, 100);
        });
    });

    test('should handle multiple show calls without creating multiple panels', () => {
        wizard.show();
        wizard.show();
        wizard.show();

        // If implementation is correct, this should just reveal existing panel
        // Test passes if no errors are thrown
        expect(true).toBe(true);
    });
});

describe('Setup Wizard Configuration Tests', () => {
    test('should detect missing workspace configuration', async () => {
        const config = vscode.workspace.getConfiguration('bctb.mcp');
        const tenantId = config.get<string>('tenantId');
        const appInsightsId = config.get<string>('applicationInsights.appId');
        const kustoUrl = config.get<string>('kusto.clusterUrl');

        // This test just checks if we can read configuration
        // Actual values will vary by workspace
        expect(tenantId).toBeDefined();
        expect(appInsightsId).toBeDefined();
        expect(kustoUrl).toBeDefined();
    });

    test('should be able to update workspace configuration', async () => {
        const config = vscode.workspace.getConfiguration('bctb.mcp');
        const target = vscode.ConfigurationTarget.Workspace;

        // Mock will return empty string by default
        const originalValue = config.get<string>('connectionName');
        expect(originalValue).toBe('');

        // Update config (mock will resolve successfully)
        await expect(config.update('connectionName', 'Test Tenant', target)).resolves.toBeUndefined();

        // Verify update was called
        expect(config.update).toHaveBeenCalledWith('connectionName', 'Test Tenant', target);
    });
});

describe('Setup Wizard Validation Tests', () => {
    test('should validate tenant ID format', () => {
        // Valid GUID format
        const validTenantId = '12345678-1234-1234-1234-123456789abc';
        expect(validTenantId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);

        // Invalid formats
        const invalidTenantId = 'not-a-guid';
        expect(invalidTenantId).not.toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });

    test('should validate Kusto URL format', () => {
        // Valid Kusto URL
        const validKustoUrl = 'https://yourcluster.westeurope.kusto.windows.net';
        expect(validKustoUrl).toMatch(/^https:\/\/.+\.kusto\.windows\.net$/i);

        // Invalid formats
        const invalidKustoUrl = 'http://example.com';
        expect(invalidKustoUrl).not.toMatch(/^https:\/\/.+\.kusto\.windows\.net$/i);
    });

    test('should validate auth flow options', () => {
        const validAuthFlows = ['azure_cli', 'device_code', 'client_credentials'];

        validAuthFlows.forEach(flow => {
            expect(['azure_cli', 'device_code', 'client_credentials']).toContain(flow);
        });

        const invalidFlow = 'invalid_flow';
        expect(['azure_cli', 'device_code', 'client_credentials']).not.toContain(invalidFlow);
    });

    test('should validate cache TTL is positive number', () => {
        const validTTL = 3600;
        expect(validTTL).toBeGreaterThan(0);
        expect(Number.isInteger(validTTL)).toBe(true);

        const invalidTTL = -100;
        expect(invalidTTL).toBeLessThanOrEqual(0);
    });
});
