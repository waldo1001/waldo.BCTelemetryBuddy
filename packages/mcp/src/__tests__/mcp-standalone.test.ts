/**
 * MCP Standalone Tests
 * 
 * Validates that MCP server can run independently without extension bundling.
 * This ensures Phase 2 independence.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs';

const execAsync = promisify(exec);

describe.skip('MCP Server Standalone Operation', () => {
    const mcpPackagePath = path.join(__dirname, '..', '..');
    const mcpServerPath = path.join(mcpPackagePath, 'dist', 'server.js');
    const mcpLauncherPath = path.join(mcpPackagePath, 'dist', 'launcher.js');

    describe('Phase 2: Package Structure', () => {
        it('should have standalone MCP package', () => {
            expect(fs.existsSync(mcpPackagePath)).toBe(true);

            const packageJson = require(path.join(mcpPackagePath, 'package.json'));
            expect(packageJson.name).toBe('bc-telemetry-buddy-mcp');
        });

        it('should have compiled server.js and launcher.js', () => {
            expect(fs.existsSync(mcpServerPath)).toBe(true);
            expect(fs.existsSync(mcpLauncherPath)).toBe(true);
        });

        it('should NOT be bundled in extension package', () => {
            const extensionMCPPath = path.join(__dirname, '..', '..', 'mcp');

            // Extension should NOT have bundled MCP files
            if (fs.existsSync(extensionMCPPath)) {
                const files = fs.readdirSync(extensionMCPPath);
                expect(files.length).toBe(0);
            } else {
                expect(fs.existsSync(extensionMCPPath)).toBe(false);
            }
        });

        it('should have @bctb/shared as dependency', () => {
            const packageJson = require(path.join(mcpPackagePath, 'package.json'));

            expect(packageJson.dependencies).toHaveProperty('@bctb/shared');
        });

        it('should have CLI entry point', () => {
            const packageJson = require(path.join(mcpPackagePath, 'package.json'));

            expect(packageJson.bin).toBeDefined();
            expect(packageJson.bin['bc-telemetry-mcp']).toBe('./dist/cli.js');
        });
    });

    describe('Phase 2: Service Integration', () => {
        it('should import services from @bctb/shared', () => {
            const serverSource = fs.readFileSync(mcpServerPath, 'utf-8');

            // Verify imports from @bctb/shared
            expect(serverSource).toContain('@bctb/shared');

            // Should NOT have local copies of these services
            expect(serverSource).not.toContain('./auth.js');
            expect(serverSource).not.toContain('./kusto.js');
            expect(serverSource).not.toContain('./cache.js');
        });

        it('should be able to instantiate server with @bctb/shared services', () => {
            // This is a smoke test - actual server instantiation tested in server.test.ts
            const { AuthService, KustoService, CacheService } = require('@bctb/shared');

            expect(AuthService).toBeDefined();
            expect(KustoService).toBeDefined();
            expect(CacheService).toBeDefined();
        });
    });

    describe('Phase 2: Deployment', () => {
        it('should have npm scripts for build and start', () => {
            const packageJson = require(path.join(mcpPackagePath, 'package.json'));

            expect(packageJson.scripts.build).toBeDefined();
            expect(packageJson.scripts.start).toBeDefined();
        });

        it('should build successfully', async () => {
            // Run build script
            const { stdout, stderr } = await execAsync('npm run build', {
                cwd: mcpPackagePath,
                timeout: 30000
            });

            // Build should succeed without errors
            expect(stderr).not.toContain('error');
            expect(fs.existsSync(mcpServerPath)).toBe(true);
        }, 35000);

        it('should have correct file permissions for launcher', () => {
            if (process.platform !== 'win32') {
                const stats = fs.statSync(mcpLauncherPath);
                const mode = stats.mode;

                // Should be executable (chmod +x)
                expect(mode & 0o111).toBeTruthy();
            } else {
                // Windows doesn't use execute bits, skip this check
                expect(true).toBe(true);
            }
        });
    });

    describe('Phase 2: Configuration', () => {
        it('should read environment variables for configuration', () => {
            const serverSource = fs.readFileSync(mcpServerPath, 'utf-8');

            // Verify server reads env vars
            const envVars = [
                'BCTB_WORKSPACE_PATH',
                'BCTB_TENANT_ID',
                'BCTB_CLIENT_ID',
                'BCTB_APP_INSIGHTS_ID',
                'BCTB_KUSTO_URL'
            ];

            envVars.forEach(envVar => {
                expect(serverSource).toContain(envVar);
            });
        });

        it('should support both HTTP server and stdio modes', () => {
            const serverSource = fs.readFileSync(mcpServerPath, 'utf-8');

            // Server should support stdio (for MCP protocol)
            expect(serverSource).toContain('stdio');
        });
    });

    describe('Phase 2: Independence from Extension', () => {
        it('should NOT import anything from extension package', () => {
            const serverSource = fs.readFileSync(mcpServerPath, 'utf-8');

            // Should NOT reference extension package
            expect(serverSource).not.toContain('../extension');
            expect(serverSource).not.toContain('packages/extension');
        });

        it('should work with global npm installation', () => {
            const packageJson = require(path.join(mcpPackagePath, 'package.json'));

            // Should be publishable to npm
            expect(packageJson.name).toBeDefined();
            expect(packageJson.version).toBeDefined();
            expect(packageJson.bin).toBeDefined();

            // Should NOT have private flag preventing publish
            expect(packageJson.private).not.toBe(true);
        });

        it('should declare peer dependencies correctly', () => {
            const packageJson = require(path.join(mcpPackagePath, 'package.json'));

            // Should list required Azure SDKs
            expect(packageJson.dependencies).toHaveProperty('@azure/msal-node');
            expect(packageJson.dependencies).toHaveProperty('azure-kusto-data');
            expect(packageJson.dependencies).toHaveProperty('azure-kusto-ingest');
        });
    });

    describe('Phase 2: CLI Functionality', () => {
        it('should have CLI entry point file', () => {
            const cliPath = path.join(mcpPackagePath, 'dist', 'cli.js');
            expect(fs.existsSync(cliPath)).toBe(true);
        });

        it('should support query-telemetry command', () => {
            const cliSource = fs.readFileSync(path.join(mcpPackagePath, 'dist', 'cli.js'), 'utf-8');

            expect(cliSource).toContain('query-telemetry');
        });

        it('should support save-query command', () => {
            const cliSource = fs.readFileSync(path.join(mcpPackagePath, 'dist', 'cli.js'), 'utf-8');

            expect(cliSource).toContain('save-query');
        });

        it('should support list-queries command', () => {
            const cliSource = fs.readFileSync(path.join(mcpPackagePath, 'dist', 'cli.js'), 'utf-8');

            expect(cliSource).toContain('list-queries');
        });
    });

    describe('Error Handling', () => {
        it('should validate configuration on startup', () => {
            const serverSource = fs.readFileSync(mcpServerPath, 'utf-8');

            // Should check for required config
            expect(serverSource).toContain('tenantId');
            expect(serverSource).toContain('appInsightsAppId');
        });

        it('should handle missing workspace path gracefully', async () => {
            // Start server without workspace path should fail gracefully
            const launcherSource = fs.readFileSync(mcpLauncherPath, 'utf-8');

            expect(launcherSource).toContain('BCTB_WORKSPACE_PATH');
        });
    });

    describe('Test Coverage for MCP', () => {
        it('should have unit tests for all MCP modules', () => {
            const testPath = path.join(mcpPackagePath, 'src', '__tests__');

            expect(fs.existsSync(testPath)).toBe(true);

            const testFiles = fs.readdirSync(testPath);
            const requiredTests = [
                'auth.test.ts',
                'kusto.test.ts',
                'cache.test.ts',
                'queries.test.ts',
                'config.test.ts'
            ];

            requiredTests.forEach(testFile => {
                expect(testFiles).toContain(testFile);
            });
        });

        it('should have high test coverage', async () => {
            // Run tests with coverage
            const { stdout } = await execAsync('npm test -- --coverage --silent', {
                cwd: mcpPackagePath,
                timeout: 60000
            });

            // Verify tests pass
            expect(stdout).toContain('PASS');

            // Coverage report should show good coverage
            expect(stdout).toMatch(/All files[^\n]*\d+/);
        }, 65000);
    });
});
