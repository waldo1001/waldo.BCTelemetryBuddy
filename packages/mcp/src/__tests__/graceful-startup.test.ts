import { loadConfig, validateConfig } from '../config.js';

/**
 * Test graceful startup behavior with incomplete configuration
 */
describe('Graceful Startup', () => {
    const originalEnv = process.env;
    let consoleErrorSpy: jest.SpyInstance;

    beforeEach(() => {
        // Mock console.error to suppress output during tests
        consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();

        // Clear environment to simulate fresh workspace
        process.env = { ...originalEnv };
        delete process.env.BCTB_WORKSPACE_PATH;
        delete process.env.BCTB_TENANT_ID;
        delete process.env.BCTB_APP_INSIGHTS_ID;
        delete process.env.BCTB_KUSTO_URL;
        delete process.env.BCTB_CLIENT_ID;
        delete process.env.BCTB_CLIENT_SECRET;
    });

    afterEach(() => {
        process.env = originalEnv;
        consoleErrorSpy.mockRestore();
    });

    describe('with no configuration at all', () => {
        it('should load config without throwing error', () => {
            expect(() => loadConfig()).not.toThrow();
        });

        it('should use current directory as workspace path fallback', () => {
            const config = loadConfig();
            expect(config.workspacePath).toBe(process.cwd());
        });

        it('should report all required configuration missing', () => {
            const config = loadConfig();
            const errors = validateConfig(config);

            // Note: workspacePath defaults to process.cwd() in loadConfig, so it won't be in errors
            expect(errors).toContain('BCTB_APP_INSIGHTS_ID is required');
            expect(errors).toContain('BCTB_KUSTO_URL is required');
            expect(errors.length).toBeGreaterThan(0);
        });
    });

    describe('with partial configuration', () => {
        it('should load successfully with only workspace path', () => {
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';

            expect(() => loadConfig()).not.toThrow();

            const config = loadConfig();
            expect(config.workspacePath).toBe('/test/workspace');

            const errors = validateConfig(config);
            expect(errors.length).toBeGreaterThan(0); // Still missing other required settings
            expect(errors).not.toContain('workspacePath is required');
        });

        it('should use azure_cli auth flow by default', () => {
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';

            const config = loadConfig();
            expect(config.authFlow).toBe('azure_cli');

            const errors = validateConfig(config);
            // Should not require client credentials for azure_cli flow
            expect(errors).not.toContain('BCTB_CLIENT_ID is required for client_credentials auth flow');
            expect(errors).not.toContain('BCTB_CLIENT_SECRET is required for client_credentials auth flow');
            // Should not require tenant ID for azure_cli flow
            expect(errors).not.toContain('BCTB_TENANT_ID is required (unless using azure_cli auth flow)');
        });
    });

    describe('validation error messages', () => {
        it('should provide helpful error messages for incomplete configuration', () => {
            const config = loadConfig();
            const errors = validateConfig(config);

            // Note: workspacePath defaults to process.cwd() in loadConfig, so it won't be in errors
            expect(errors).toEqual(expect.arrayContaining([
                expect.stringContaining('BCTB_APP_INSIGHTS_ID'),
                expect.stringContaining('BCTB_KUSTO_URL')
            ]));
        });

        it('should provide specific error for client_credentials auth without credentials', () => {
            process.env.BCTB_WORKSPACE_PATH = '/test/workspace';
            process.env.BCTB_AUTH_FLOW = 'client_credentials';

            const config = loadConfig();
            const errors = validateConfig(config);

            expect(errors).toEqual(expect.arrayContaining([
                expect.stringContaining('BCTB_CLIENT_ID is required for client_credentials auth flow'),
                expect.stringContaining('BCTB_CLIENT_SECRET is required for client_credentials auth flow')
            ]));
        });
    });
});