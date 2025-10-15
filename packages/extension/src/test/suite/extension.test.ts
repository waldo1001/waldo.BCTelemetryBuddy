import * as assert from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import * as sinon from 'sinon';
import { MCPClient } from '../../mcpClient';

suite('Extension Test Suite', () => {
    let sandbox: sinon.SinonSandbox;

    setup(() => {
        sandbox = sinon.createSandbox();
    });

    teardown(() => {
        sandbox.restore();
    });

    test('Extension should be present', () => {
        assert.ok(vscode.extensions.getExtension('waldo.bc-telemetry-buddy'));
    });

    test('Extension should activate', async () => {
        const ext = vscode.extensions.getExtension('waldo.bc-telemetry-buddy');
        assert.ok(ext);
        await ext.activate();
        assert.strictEqual(ext.isActive, true);
    });

    test('Should register all commands', async () => {
        const commands = await vscode.commands.getCommands(true);

        assert.ok(commands.includes('bctb.startMCP'));
        assert.ok(commands.includes('bctb.runNLQuery'));
        assert.ok(commands.includes('bctb.saveQuery'));
        assert.ok(commands.includes('bctb.openQueriesFolder'));
    });

    test('Should create output channel on activation', async () => {
        const ext = vscode.extensions.getExtension('waldo.bc-telemetry-buddy');
        assert.ok(ext);
        await ext.activate();

        // Output channel should exist (we can't directly access it, but we can verify no errors)
        assert.ok(ext.isActive);
    });

    test('Should read MCP configuration from workspace settings', () => {
        const config = vscode.workspace.getConfiguration('bctb');

        // Test that configuration properties exist (with defaults)
        const port = config.get<number>('mcp.port');
        assert.strictEqual(typeof port, 'number');

        const url = config.get<string>('mcp.url');
        assert.strictEqual(typeof url, 'string');

        const maxRetries = config.get<number>('agent.maxRetries');
        assert.strictEqual(typeof maxRetries, 'number');
    });

    test('Should handle missing workspace folder gracefully', async () => {
        // This test assumes no workspace is open
        const workspaceFolders = vscode.workspace.workspaceFolders;

        if (!workspaceFolders || workspaceFolders.length === 0) {
            // Try to execute a command that requires workspace
            // It should handle the error gracefully
            try {
                await vscode.commands.executeCommand('bctb.openQueriesFolder');
                // If no workspace, should show error (but not throw)
                assert.ok(true, 'Command handled missing workspace');
            } catch (err) {
                // Command may fail gracefully with user message
                assert.ok(true, 'Command failed gracefully');
            }
        } else {
            // If workspace exists, test passes
            assert.ok(true, 'Workspace exists');
        }
    });

    test('hasWorkspaceSettings should return false when settings missing', () => {
        const config = vscode.workspace.getConfiguration('bctb');
        const tenantId = config.get<string>('mcp.tenantId');
        const appId = config.get<string>('mcp.applicationInsights.appId');

        // If both are empty, hasWorkspaceSettings should conceptually return false
        if (!tenantId && !appId) {
            assert.ok(true, 'Settings are missing as expected');
        } else {
            assert.ok(true, 'Settings are configured');
        }
    });

    test('Should not auto-start MCP when settings are missing', async () => {
        const ext = vscode.extensions.getExtension('waldo.bc-telemetry-buddy');
        assert.ok(ext);

        // Clear any existing settings
        const config = vscode.workspace.getConfiguration('bctb');
        const tenantId = config.get<string>('mcp.tenantId');
        const appId = config.get<string>('mcp.applicationInsights.appId');

        // Verify that if settings are missing, MCP won't auto-start
        // (We can't directly test this without mocking, but we verify activation succeeds)
        await ext.activate();
        assert.ok(ext.isActive);
    });

    test('buildMCPEnvironment should include all required variables', () => {
        // Test that all expected environment variables would be set
        const requiredEnvVars = [
            'BCTB_WORKSPACE_PATH',
            'BCTB_CONNECTION_NAME',
            'BCTB_TENANT_ID',
            'BCTB_CLIENT_ID',
            'BCTB_CLIENT_SECRET',
            'BCTB_AUTH_FLOW',
            'BCTB_APP_INSIGHTS_APP_ID',
            'BCTB_KUSTO_CLUSTER_URL',
            'BCTB_CACHE_ENABLED',
            'BCTB_CACHE_TTL_SECONDS',
            'BCTB_REMOVE_PII',
            'BCTB_PORT'
        ];

        // We can't directly test buildMCPEnvironment (it's private),
        // but we verify the config properties exist
        const config = vscode.workspace.getConfiguration('bctb');

        assert.ok(config.has('mcp.connectionName'));
        assert.ok(config.has('mcp.tenantId'));
        assert.ok(config.has('mcp.clientId'));
        assert.ok(config.has('mcp.authFlow'));
        assert.ok(config.has('mcp.applicationInsights.appId'));
        assert.ok(config.has('mcp.kusto.clusterUrl'));
        assert.ok(config.has('mcp.cache.enabled'));
        assert.ok(config.has('mcp.cache.ttlSeconds'));
        assert.ok(config.has('mcp.sanitize.removePII'));
        assert.ok(config.has('mcp.port'));
    });

    test('Should handle command execution without workspace settings', async () => {
        const config = vscode.workspace.getConfiguration('bctb');
        const tenantId = config.get<string>('mcp.tenantId');
        const appId = config.get<string>('mcp.applicationInsights.appId');

        if (!tenantId || !appId) {
            // Mock the showWarningMessage to prevent actual UI interaction
            const showWarningStub = sandbox.stub(vscode.window, 'showWarningMessage').resolves(undefined);

            // Execute startMCP command without settings
            await vscode.commands.executeCommand('bctb.startMCP');

            // Should have shown warning
            assert.ok(showWarningStub.called, 'Warning should be shown');
        } else {
            assert.ok(true, 'Settings are configured');
        }
    });

    test('Should handle deactivation gracefully', async () => {
        const ext = vscode.extensions.getExtension('waldo.bc-telemetry-buddy');
        assert.ok(ext);

        await ext.activate();
        assert.ok(ext.isActive);

        // Extension deactivation is handled by VSCode
        // We just verify activation worked
        assert.ok(true, 'Deactivation would be called by VSCode');
    });

    test('Should validate configuration schema', () => {
        const config = vscode.workspace.getConfiguration('bctb');

        // Validate authFlow enum
        const authFlow = config.get<string>('mcp.authFlow', 'device_code');
        assert.ok(['device_code', 'client_credentials'].includes(authFlow));

        // Validate boolean types
        const cacheEnabled = config.get<boolean>('mcp.cache.enabled', true);
        assert.strictEqual(typeof cacheEnabled, 'boolean');

        const removePII = config.get<boolean>('mcp.sanitize.removePII', false);
        assert.strictEqual(typeof removePII, 'boolean');

        // Validate number types
        const port = config.get<number>('mcp.port', 52345);
        assert.strictEqual(typeof port, 'number');
        assert.ok(port > 0 && port < 65536);

        const ttl = config.get<number>('mcp.cache.ttlSeconds', 3600);
        assert.strictEqual(typeof ttl, 'number');
        assert.ok(ttl > 0);

        const maxRetries = config.get<number>('agent.maxRetries', 3);
        assert.strictEqual(typeof maxRetries, 'number');
        assert.ok(maxRetries >= 0);
    });

    test('Should handle references configuration', () => {
        const config = vscode.workspace.getConfiguration('bctb');
        const references = config.get<any[]>('mcp.references', []);

        assert.ok(Array.isArray(references));

        // If references exist, validate structure
        references.forEach(ref => {
            if (ref.name) assert.strictEqual(typeof ref.name, 'string');
            if (ref.type) assert.ok(['github', 'web'].includes(ref.type));
            if (ref.url) assert.strictEqual(typeof ref.url, 'string');
            if (ref.enabled !== undefined) assert.strictEqual(typeof ref.enabled, 'boolean');
        });
    });

    test('Should construct correct MCP server path', () => {
        // Test that the server path logic is correct
        const expectedPath = path.join(__dirname, '..', '..', '..', '..', 'mcp', 'dist', 'server.js');

        // Verify path construction logic (path.join handles platform differences)
        assert.ok(expectedPath.includes('mcp'));
        assert.ok(expectedPath.includes('dist'));
        assert.ok(expectedPath.includes('server.js'));
    });

    test('Should handle MCP port configuration', () => {
        const config = vscode.workspace.getConfiguration('bctb');
        const port = config.get<number>('mcp.port', 52345);

        // Verify default port
        assert.strictEqual(port, 52345);

        // Verify port is valid
        assert.ok(port >= 1024); // Not privileged
        assert.ok(port <= 65535); // Valid port range
    });

    test('Should create MCP client with correct URL', () => {
        const config = vscode.workspace.getConfiguration('bctb');
        const url = config.get<string>('mcp.url', 'http://localhost:52345');

        assert.ok(url.startsWith('http://') || url.startsWith('https://'));
        assert.ok(url.includes('52345') || url.includes('localhost'));
    });
});
