/**
 * Shared package import tests
 * 
 * Validates that @bctb/shared package exports are accessible from both
 * MCP and extension packages. This ensures Phase 1 and Phase 3 integration works.
 */

describe('Shared Package Integration', () => {
    describe('Phase 1: Package Structure', () => {
        it('should have correct package.json exports', () => {
            const packageJson = require('../../../../shared/package.json');

            expect(packageJson.name).toBe('@bctb/shared');
            expect(packageJson.main).toBe('./dist/index.js');
            expect(packageJson.types).toBe('./dist/index.d.ts');
        });

        it('should export all required services', () => {
            const shared = require('@bctb/shared');

            // Core services that must be exported
            expect(shared.AuthService).toBeDefined();
            expect(shared.KustoService).toBeDefined();
            expect(shared.CacheService).toBeDefined();
            expect(shared.QueriesService).toBeDefined();
            expect(shared.ReferencesService).toBeDefined();
            expect(shared.SanitizeService).toBeDefined();

            // Config type
            expect(shared.MCPConfig).toBeDefined();
        });

        it('should have compiled TypeScript output', () => {
            const fs = require('fs');
            const path = require('path');

            const distPath = path.join(__dirname, '..', '..', '..', '..', 'shared', 'dist');
            const indexPath = path.join(distPath, 'index.js');
            const typesPath = path.join(distPath, 'index.d.ts');

            expect(fs.existsSync(indexPath)).toBe(true);
            expect(fs.existsSync(typesPath)).toBe(true);
        });
    });

    describe('Phase 1: Service Instantiation from Extension', () => {
        it('should instantiate AuthService from @bctb/shared in extension context', () => {
            const { AuthService } = require('@bctb/shared');

            const mockConfig = {
                tenantId: 'test-tenant',
                clientId: 'test-client',
                clientSecret: '',
                authFlow: 'device_code' as const
            };

            const service = new AuthService(mockConfig);
            expect(service).toBeInstanceOf(AuthService);
        });

        it('should instantiate KustoService from @bctb/shared in extension context', () => {
            const { KustoService } = require('@bctb/shared');

            const mockConfig = {
                kustoClusterUrl: 'https://test.kusto.windows.net',
                kustoDatabase: 'test-db'
            };
            const mockAuthService = {};

            const service = new KustoService(mockConfig.kustoClusterUrl, mockConfig.kustoDatabase, mockAuthService as any);
            expect(service).toBeInstanceOf(KustoService);
        });

        it('should instantiate CacheService from @bctb/shared in extension context', () => {
            const { CacheService } = require('@bctb/shared');

            const mockConfig = {
                cacheEnabled: true,
                cacheTTL: 3600,
                workspacePath: '/test/workspace'
            };

            const service = new CacheService(mockConfig.workspacePath, mockConfig.cacheTTL, mockConfig.cacheEnabled);
            expect(service).toBeInstanceOf(CacheService);
        });

        it('should instantiate QueriesService from @bctb/shared in extension context', () => {
            const { QueriesService } = require('@bctb/shared');

            const service = new QueriesService('/test/workspace');
            expect(service).toBeInstanceOf(QueriesService);
        });
    });

    describe('Phase 1: Service Instantiation from MCP', () => {
        it('should verify MCP can import from @bctb/shared', () => {
            // Simulate MCP import
            const shared = require('@bctb/shared');

            expect(shared.AuthService).toBeDefined();
            expect(shared.KustoService).toBeDefined();
            expect(shared.CacheService).toBeDefined();

            // MCP should be able to create instances
            const authService = new shared.AuthService({
                tenantId: 'test',
                clientId: 'test',
                clientSecret: '',
                authFlow: 'device_code'
            });

            expect(authService).toBeInstanceOf(shared.AuthService);
        });
    });

    describe('Phase 3: Extension Independence', () => {
        it('should NOT depend on bundled MCP files', () => {
            const fs = require('fs');
            const path = require('path');

            // Verify packages/extension/mcp/ does NOT exist
            const mcpBundlePath = path.join(__dirname, '..', '..', 'mcp');

            if (fs.existsSync(mcpBundlePath)) {
                // If it exists, it should be empty or gitignored
                const files = fs.readdirSync(mcpBundlePath);
                expect(files.length).toBe(0);
            } else {
                // Preferably, it should not exist at all
                expect(fs.existsSync(mcpBundlePath)).toBe(false);
            }
        });

        it('should import services directly from @bctb/shared not from bundled MCP', () => {
            // Extension should import from @bctb/shared
            const extensionImport = () => require('@bctb/shared');

            expect(extensionImport).not.toThrow();

            const shared = extensionImport();
            expect(shared.AuthService).toBeDefined();

            // Verify it's coming from the shared package, not a bundled copy
            const sharedPackagePath = require.resolve('@bctb/shared');
            expect(sharedPackagePath).toContain('packages/shared');
            expect(sharedPackagePath).not.toContain('packages/extension/mcp');
        });

        it('should have @bctb/shared as dependency in package.json', () => {
            const packageJson = require('../../package.json');

            expect(packageJson.dependencies).toHaveProperty('@bctb/shared');
            expect(packageJson.dependencies['@bctb/shared']).toBe('file:../shared');
        });

        it('should exclude @bctb/shared from esbuild bundling', () => {
            const packageJson = require('../../package.json');

            // Verify build script uses --external:@bctb/shared
            expect(packageJson.scripts.build).toContain('--external:@bctb/shared');
        });
    });

    describe('Type Safety', () => {
        it('should have TypeScript types available for all exports', () => {
            const shared = require('@bctb/shared');

            // Types should be available (this is a compile-time check, but we can verify exports)
            const services = [
                'AuthService',
                'KustoService',
                'CacheService',
                'QueriesService',
                'ReferencesService',
                'SanitizeService'
            ];

            services.forEach(serviceName => {
                expect(shared[serviceName]).toBeDefined();
                expect(typeof shared[serviceName]).toBe('function');
            });
        });

        it('should have MCPConfig interface exported', () => {
            const shared = require('@bctb/shared');

            // MCPConfig should be exported (as a type it won't exist at runtime, but constructor should)
            expect(shared.MCPConfig).toBeDefined();
        });
    });

    describe('Module Resolution', () => {
        it('should resolve @bctb/shared from extension node_modules', () => {
            const path = require('path');
            const resolvedPath = require.resolve('@bctb/shared');

            // Should resolve to packages/shared/dist/index.js
            expect(resolvedPath).toContain('shared');
            expect(resolvedPath).toContain('dist');
            expect(resolvedPath.endsWith('index.js')).toBe(true);
        });

        it('should have symlink from extension to shared package', () => {
            const fs = require('fs');
            const path = require('path');

            const extensionNodeModules = path.join(__dirname, '..', '..', 'node_modules', '@bctb');
            const sharedSymlink = path.join(extensionNodeModules, 'shared');

            // npm workspaces creates symlinks
            if (fs.existsSync(sharedSymlink)) {
                const stats = fs.lstatSync(sharedSymlink);
                expect(stats.isSymbolicLink() || stats.isDirectory()).toBe(true);
            } else {
                // Alternative: packages/shared is in node_modules via hoisting
                const rootNodeModules = path.join(__dirname, '..', '..', '..', '..', 'node_modules', '@bctb', 'shared');
                expect(fs.existsSync(rootNodeModules) || fs.existsSync(sharedSymlink)).toBe(true);
            }
        });
    });

    describe('Runtime Behavior', () => {
        it('should allow services to work with shared config types', () => {
            const { AuthService, MCPConfig } = require('@bctb/shared');

            const config: typeof MCPConfig = {
                tenantId: 'test-tenant',
                clientId: 'test-client',
                clientSecret: 'test-secret',
                authFlow: 'client_credentials',
                appInsightsAppId: 'test-app-id',
                kustoClusterUrl: 'https://test.kusto.windows.net',
                kustoDatabase: 'test-db',
                cacheEnabled: true,
                cacheTTL: 3600,
                removePII: false,
                workspacePath: '/test'
            };

            const authService = new AuthService(config);
            expect(authService).toBeInstanceOf(AuthService);
        });

        it('should allow extension and MCP to share the same service instances via config', () => {
            const { AuthService } = require('@bctb/shared');

            // Both extension and MCP create instances from the same class
            const extensionAuth = new AuthService({
                tenantId: 'ext-tenant',
                clientId: 'ext-client',
                clientSecret: '',
                authFlow: 'device_code'
            });

            const mcpAuth = new AuthService({
                tenantId: 'mcp-tenant',
                clientId: 'mcp-client',
                clientSecret: 'secret',
                authFlow: 'client_credentials'
            });

            // Both should be instances of the same class
            expect(extensionAuth.constructor).toBe(mcpAuth.constructor);
            expect(extensionAuth).toBeInstanceOf(AuthService);
            expect(mcpAuth).toBeInstanceOf(AuthService);
        });
    });
});
