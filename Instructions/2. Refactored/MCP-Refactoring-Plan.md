# BC Telemetry Buddy - MCP Refactoring Plan

## Overview

This document outlines the architectural redesign to transform BC Telemetry Buddy into a truly modular system with:

1. **Shared Core Library** (`@bctb/shared`) - Common business logic
2. **Standalone MCP Server** (NPM package) - AI/Copilot integration layer
3. **Independent VSCode Extension** - Full-featured UI with direct KQL execution

## Critical Design Decisions

### 1. Bundling Strategy
✅ **Decision:** `@bctb/shared` code gets bundled into both MCP and extension via esbuild during build process.
- Users never see `@bctb/shared` as a dependency
- Single source of truth for business logic
- Smooth installation experience (no extra packages to install)

### 2. NPM Package Naming
✅ **Decision:** Unscoped package name `bc-telemetry-buddy-mcp`
- Installation: `npm install -g bc-telemetry-buddy-mcp`
- Published at: https://www.npmjs.com/package/bc-telemetry-buddy-mcp
- Simpler for users (no org scope required)

### 3. Configuration Architecture
✅ **Decision:** Extension reads MCP config file (`.bctb-config.json`)
- **Single source of truth:** `.bctb-config.json` in workspace root
- **Extension behavior:** Extension's TelemetryService reads `.bctb-config.json` (same file as MCP)
- **Setup Wizard:** Saves to `.bctb-config.json` (used by both extension and MCP)
- **VSCode Settings:** Renamed to align with MCP config keys for consistency
- **Migration:** Settings migrate from old `bcTelemetryBuddy.*` namespace to new `.bctb-config.json` file

**Config Discovery Order (for both Extension and MCP):**
1. `--config` CLI argument (MCP only)
2. `.bctb-config.json` in current directory
3. `.bctb-config.json` in workspace root
4. `.bctb-config.json` in user home directory
5. Environment variables (fallback)

### 4. Extension Independence
✅ **Decision:** Extension NEVER uses MCP for execution - always uses its own TelemetryService
- Extension has full KQL execution capability via `@bctb/shared` (bundled)
- MCP is optional - only needed for AI chat participants and external tools (Claude Desktop, Copilot Studio)
- Extension works completely standalone without MCP installed

### 5. MCP CLI Commands
✅ **Decision:** Add `bctb-mcp init` and `bctb-mcp validate` commands
- `bctb-mcp start` - Start MCP server (stdio or HTTP mode)
- `bctb-mcp init` - Generate `.bctb-config.json` template with prompts
- `bctb-mcp validate` - Check config file validity and test connection
- `bctb-mcp --version` - Show version
- `bctb-mcp --help` - Show usage

### 6. Authentication Flow
✅ **Decision:** Default to `azure_cli`, support all three flows
- Primary: `azure_cli` (uses `az login` credentials, no re-auth needed)
- Fallback: `device_code` (interactive browser flow)
- Advanced: `client_credentials` (service principal for automation)
- All three flows work identically in both Extension and MCP

### 7. Copilot Studio Compatibility
✅ **Decision:** stdio mode (JSON-RPC over stdin/stdout) will work in Copilot Studio
- MCP supports stdio mode (current implementation)
- Users configure connection in Copilot Studio settings
- No special Copilot Studio code needed - standard MCP protocol

### 8. User Migration
✅ **Decision:** Show migration notification with "Migrate Settings" button
- On first launch after upgrade, detect old `bcTelemetryBuddy.*` settings
- Show notification: "BC Telemetry Buddy settings format changed. Migrate to new format?"
- Button: "Migrate Settings" → creates `.bctb-config.json` from old settings
- Optional: "Dismiss" (user can migrate manually later)

### 9. Settings Namespace Alignment
✅ **Decision:** Rename extension settings to align with MCP config keys
- **Old:** `bcTelemetryBuddy.appInsights.appId`, `bcTelemetryBuddy.kusto.clusterUrl`
- **New:** Read from `.bctb-config.json` with keys: `appInsightsId`, `kustoUrl`, `kustoDatabase`
- Migration handles conversion automatically

### 10. TypeScript Version
✅ **Decision:** Upgrade to TypeScript 5.6.x (latest stable)
- Better performance and type inference
- Project references still supported
- Composite projects work as expected

### 11. MCP Initial Version
✅ **Decision:** MCP starts at version `1.0.0` when published to NPM
- Breaking change from bundled architecture (v0.2.x)
- Extension can stay on 0.3.0 (minor bump for new features)
- Versions are independent going forward

### 12. MCP Installation UX
✅ **Decision:** Extension offers automatic installation
- MCPInstaller checks if `bctb-mcp` is installed globally
- If missing: Show notification with "Install MCP Server" button
- Button click: Spawn `npm install -g bc-telemetry-buddy-mcp` in background (not terminal)
- Progress indicator during install
- Success notification when complete

### 13. Multi-Profile Support (Multiple Customers/Endpoints)
✅ **Decision:** Single MCP instance with named config profiles and profile switching
- **Architecture:** Named profiles in single `.bctb-config.json` file
- **Profile Structure:** Each profile = complete telemetry endpoint configuration (customer-specific App Insights, Kusto, auth)
- **Profile Switching:** Extension changes active profile and restarts MCP server with new profile
- **Profile Inheritance:** Support `"extends"` to share common settings (DRY principle)
- **Default Profile:** `defaultProfile` key specifies startup profile
- **Extension UI:** Status bar dropdown for quick profile switching
- **MCP Usage:** Single MCP server, profile passed via `BCTB_PROFILE` environment variable
- **Chat Limitation:** One customer at a time (switching requires MCP restart ~2 seconds)
- **Alternative Rejected:** Multiple MCP instances (more complex, higher memory, less clear UX)

**Rationale:**
- Simple for users with 2-10 customers (single file to manage)
- Clear profile selection in UI (dropdown with descriptive names)
- Version control friendly (all configs in one file)
- DRY with inheritance (avoid duplicating auth settings across customers)
- Environment variables for secrets (keep credentials out of config)
- Backward compatible (no profiles = single config)

## Current Architecture Problems

- ❌ MCP bundled with extension (tight coupling)
- ❌ Extension depends on MCP for KQL execution
- ❌ Cannot use MCP without extension
- ❌ Code duplication between packages
- ❌ Complex build process (bundling, copying)
- ❌ Hard to version independently

## Target Architecture

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     @bctb/shared (private)                  │
│  ┌──────────┬──────────┬────────┬──────────┬──────────┐    │
│  │ auth.ts  │ kusto.ts │ cache  │ queries  │ sanitize │    │
│  └──────────┴──────────┴────────┴──────────┴──────────┘    │
└──────────────────────┬────────────────────┬─────────────────┘
                       │                    │
        ┌──────────────┴────────┐  ┌────────┴──────────────┐
        │                       │  │                       │
┌───────▼────────────┐   ┌──────▼──────────┐              │
│  MCP Server (NPM)  │   │  VSCode Ext     │              │
│                    │   │                 │              │
│  • Standalone      │   │  • Direct KQL   │              │
│  • CLI tool        │   │  • Commands     │              │
│  • AI integration  │   │  • UI           │              │
│  • File config     │   │  • Settings     │              │
└────────┬───────────┘   └─────────────────┘              │
         │                         │                       │
         │                         └───────────────────────┘
         │                                    │
         │                                    │
    ┌────▼────────┐                    ┌─────▼──────┐
    │ Claude      │                    │ Chat       │
    │ Desktop     │                    │ Participant│
    │             │                    │ (via MCP)  │
    └─────────────┘                    └────────────┘
    
    ┌─────────────┐
    │ Copilot     │
    │ Studio      │
    └─────────────┘
```

### Key Principles

1. **Separation of Concerns**
   - Core logic in `@bctb/shared`
   - MCP = thin AI tool wrapper
   - Extension = full-featured app with direct execution

2. **Runtime Independence**
   - Extension works without MCP installed
   - MCP works without extension
   - Shared code only at build time

3. **Configuration**
   - MCP: File-based (`.bctb-config.json`)
   - Extension: VSCode settings
   - Setup Wizard can configure both

4. **Publishing**
   - MCP: Published to NPM (`bc-telemetry-buddy-mcp`)
   - Extension: Published to Marketplace
   - Shared: Private package (not published)

## New Package Structure

```
packages/
├── shared/                           # NEW: Shared core library
│   ├── src/
│   │   ├── auth.ts                  # Moved from mcp/
│   │   ├── kusto.ts                 # Moved from mcp/
│   │   ├── cache.ts                 # Moved from mcp/
│   │   ├── queries.ts               # Moved from mcp/
│   │   ├── sanitize.ts              # Moved from mcp/
│   │   ├── eventLookup.ts           # Moved from mcp/
│   │   └── types.ts                 # Common types/interfaces
│   ├── package.json                 # private: true (not published)
│   ├── tsconfig.json
│   └── README.md
│
├── mcp/                              # REFACTORED: Standalone NPM package
│   ├── src/
│   │   ├── cli.ts                   # NEW: CLI entry point
│   │   ├── server.ts                # UPDATED: Thin wrapper using @bctb/shared
│   │   ├── config.ts                # UPDATED: File-based config
│   │   └── __tests__/
│   ├── dist/
│   │   ├── cli.js                   # Built CLI (bin entry point)
│   │   └── server.js                # Built server
│   ├── config-schema.json           # NEW: JSON schema for .bctb-config.json
│   ├── package.json                 # UPDATED: NPM publishing config
│   ├── README.md                    # UPDATED: Standalone docs
│   └── LICENSE
│
└── extension/                        # REFACTORED: Independent VSCode extension
    ├── src/
    │   ├── services/
    │   │   └── telemetryService.ts  # NEW: Direct KQL execution
    │   ├── chatParticipant.ts       # UPDATED: MCP client (optional)
    │   ├── mcpInstaller.ts          # NEW: Install/manage MCP
    │   ├── setupWizard.ts           # UPDATED: Configure extension + MCP
    │   ├── extension.ts             # UPDATED: Direct commands
    │   └── __tests__/
    ├── package.json                 # UPDATED: No MCP bundling
    └── README.md                    # UPDATED: Extension-focused docs
```

## Implementation Phases

### Phase 1: Create Shared Package ✅

**Goal:** Extract common code into reusable package

**Steps:**
1. Create `packages/shared/` directory structure
2. Move core files from `packages/mcp/src/`:
   - `auth.ts` → `packages/shared/src/auth.ts`
   - `kusto.ts` → `packages/shared/src/kusto.ts`
   - `cache.ts` → `packages/shared/src/cache.ts`
   - `queries.ts` → `packages/shared/src/queries.ts`
   - `sanitize.ts` → `packages/shared/src/sanitize.ts`
   - `eventLookup.ts` → `packages/shared/src/eventLookup.ts`
3. Create `packages/shared/package.json`:
   ```json
   {
     "name": "@bctb/shared",
     "version": "1.0.0",
     "private": true,
     "type": "commonjs",
     "main": "./dist/index.js",
     "types": "./dist/index.d.ts"
   }
   ```
4. Create `packages/shared/src/index.ts` (export all modules)
5. Move shared tests to `packages/shared/src/__tests__/`
6. Configure TypeScript project references

**Validation:**
- All tests pass in shared package
- Build produces clean dist/

---

### Phase 2: Refactor MCP to Use Shared ✅

**Goal:** Make MCP a thin wrapper using shared code

**Steps:**
1. Update `packages/mcp/package.json`:
   ```json
   {
     "name": "bc-telemetry-buddy-mcp",
     "version": "1.0.0",
     "description": "Model Context Protocol server for Business Central telemetry",
     "type": "commonjs",
     "bin": {
       "bctb-mcp": "./dist/cli.js"
     },
     "files": ["dist/", "config-schema.json", "README.md", "LICENSE"],
     "publishConfig": {
       "access": "public"
     },
     "dependencies": {
       "@bctb/shared": "workspace:*"
     }
   }
   ```

2. Create `packages/mcp/src/cli.ts`:
   ```typescript
   #!/usr/bin/env node
   
   import { Command } from 'commander';
   import { MCPServer } from './server.js';
   import { loadConfig, validateConfig, initConfig } from './config.js';
   
   const program = new Command();
   
   program
     .name('bctb-mcp')
     .description('BC Telemetry Buddy MCP Server')
     .version('1.0.0');
   
   program
     .command('start')
     .description('Start the MCP server')
     .option('-c, --config <path>', 'Path to config file')
     .option('--stdio', 'Use stdio mode (default)')
     .option('--http', 'Use HTTP mode')
     .action(async (options) => {
       const config = loadConfig(options.config);
       const errors = validateConfig(config);
       
       if (errors.length > 0) {
         console.error('Configuration errors:');
         errors.forEach(err => console.error(`  - ${err}`));
         process.exit(1);
       }
       
       const server = new MCPServer(config);
       
       if (options.http) {
         await server.startHTTP();
       } else {
         await server.startStdio();
       }
     });
   
   program
     .command('init')
     .description('Create a config file template')
     .option('-o, --output <path>', 'Output path', '.bctb-config.json')
     .action((options) => {
       initConfig(options.output);
       console.log(`Created config template: ${options.output}`);
     });
   
   program
     .command('validate')
     .description('Validate a config file')
     .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
     .action((options) => {
       const config = loadConfig(options.config);
       const errors = validateConfig(config);
       
       if (errors.length === 0) {
         console.log('✓ Configuration is valid');
       } else {
         console.error('Configuration errors:');
         errors.forEach(err => console.error(`  - ${err}`));
         process.exit(1);
       }
     });
   
   program
     .command('test-auth')
     .description('Test authentication')
     .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
     .action(async (options) => {
       const config = loadConfig(options.config);
       const { AuthService } = await import('@bctb/shared');
       const auth = new AuthService(config);
       
       try {
         await auth.authenticate();
         console.log('✓ Authentication successful');
       } catch (error: any) {
         console.error('✗ Authentication failed:', error.message);
         process.exit(1);
       }
     });
   
   program
     .command('list-profiles')
     .description('List all available profiles')
     .option('-c, --config <path>', 'Path to config file', '.bctb-config.json')
     .action((options) => {
       const config = loadConfig(options.config);
       
       if (!config.profiles) {
         console.log('No profiles found (single config mode)');
         return;
       }
       
       console.log('Available profiles:');
       Object.entries(config.profiles).forEach(([name, profile]: [string, any]) => {
         const isDefault = name === config.defaultProfile;
         const marker = isDefault ? '✓' : ' ';
         const baseMarker = name.startsWith('_') ? '(base)' : '';
         console.log(`  [${marker}] ${name} - ${profile.connectionName || 'Unnamed'} ${baseMarker}`);
       });
       
       if (config.defaultProfile) {
         console.log(`\nDefault profile: ${config.defaultProfile}`);
       }
     });
   
   program.parse();
   ```

3. Update `packages/mcp/src/config.ts` to add:
   ```typescript
   import * as fs from 'fs';
   import * as path from 'path';
   import * as os from 'os';

   export interface ProfiledConfig {
     profiles?: Record<string, MCPConfig>;
     defaultProfile?: string;
     // ... other top-level settings
   }

   /**
    * Load config from file with discovery and profile support
    */
   export function loadConfigFromFile(configPath?: string, profileName?: string): MCPConfig {
     let filePath: string | null = null;
     
     // Discovery order
     if (configPath) {
       filePath = path.resolve(configPath);
     } else if (fs.existsSync('.bctb-config.json')) {
       filePath = path.resolve('.bctb-config.json');
     } else if (process.env.BCTB_WORKSPACE) {
       const workspacePath = path.join(process.env.BCTB_WORKSPACE, '.bctb-config.json');
       if (fs.existsSync(workspacePath)) {
         filePath = workspacePath;
       }
     } else {
       const homePath = path.join(os.homedir(), '.bctb', 'config.json');
       if (fs.existsSync(homePath)) {
         filePath = homePath;
       }
     }
     
     if (!filePath) {
       throw new Error('No config file found. Run: bctb-mcp init');
     }
     
     const fileContent = fs.readFileSync(filePath, 'utf-8');
     const rawConfig = JSON.parse(fileContent);
     
     // Handle multi-profile configs
     if (rawConfig.profiles) {
       const profile = profileName || process.env.BCTB_PROFILE || rawConfig.defaultProfile;
       
       if (!profile) {
         throw new Error('No profile specified. Use --profile <name> or set BCTB_PROFILE env var');
       }
       
       if (!rawConfig.profiles[profile]) {
         throw new Error(`Profile '${profile}' not found in config`);
       }
       
       // Resolve profile inheritance
       const resolvedProfile = resolveProfileInheritance(rawConfig.profiles, profile);
       
       // Merge with top-level settings (cache, sanitize, references)
       return {
         ...resolvedProfile,
         cache: resolvedProfile.cache || rawConfig.cache,
         sanitize: resolvedProfile.sanitize || rawConfig.sanitize,
         references: resolvedProfile.references || rawConfig.references
       };
     }
     
     // Single profile config (backward compatible)
     return expandEnvironmentVariables(rawConfig as MCPConfig);
   }
   
   /**
    * Resolve profile inheritance (supports 'extends' key)
    */
   function resolveProfileInheritance(profiles: Record<string, any>, profileName: string, visited: Set<string> = new Set()): MCPConfig {
     if (visited.has(profileName)) {
       throw new Error(`Circular profile inheritance detected: ${profileName}`);
     }
     visited.add(profileName);
     
     const profile = profiles[profileName];
     if (!profile) {
       throw new Error(`Profile '${profileName}' not found`);
     }
     
     // No inheritance
     if (!profile.extends) {
       return expandEnvironmentVariables(profile);
     }
     
     // Resolve parent profile
     const parentProfile = resolveProfileInheritance(profiles, profile.extends, visited);
     
     // Deep merge child over parent
     const merged = deepMerge(parentProfile, profile);
     delete merged.extends; // Remove extends key from final config
     
     return expandEnvironmentVariables(merged);
   }
   
   /**
    * Deep merge objects (child overrides parent)
    */
   function deepMerge(parent: any, child: any): any {
     const result = { ...parent };
     
     for (const key in child) {
       if (key === 'extends') continue; // Skip extends key
       
       if (typeof child[key] === 'object' && !Array.isArray(child[key]) && child[key] !== null) {
         result[key] = deepMerge(parent[key] || {}, child[key]);
       } else {
         result[key] = child[key];
       }
     }
     
     return result;
   }
   
   /**
    * Expand environment variables in config (${VAR_NAME})
    */
   function expandEnvironmentVariables(config: any): any {
     const result: any = Array.isArray(config) ? [] : {};
     
     for (const key in config) {
       const value = config[key];
       
       if (typeof value === 'string') {
         // Replace ${VAR_NAME} with process.env.VAR_NAME
         result[key] = value.replace(/\$\{([^}]+)\}/g, (_, varName) => {
           return process.env[varName] || '';
         });
       } else if (typeof value === 'object' && value !== null) {
         result[key] = expandEnvironmentVariables(value);
       } else {
         result[key] = value;
       }
     }
     
     return result;
   }

   /**
    * Initialize config file template
    */
   export function initConfig(outputPath: string): void {
     const template: ProfiledConfig = {
       profiles: {
         default: {
           connectionName: 'My BC Production',
           authFlow: 'azure_cli',
           applicationInsights: {
             appId: 'your-app-insights-id'
           },
           kusto: {
             clusterUrl: 'https://ade.applicationinsights.io'
           },
           workspace: {
             path: '${workspaceFolder}',
             queriesFolder: 'queries'
           }
         }
       },
       defaultProfile: 'default',
       cache: {
         enabled: true,
         ttlSeconds: 3600
       },
       sanitize: {
         removePII: false
       },
       references: [
         {
           name: 'Microsoft BC Telemetry Samples',
           type: 'github',
           url: 'https://github.com/microsoft/BCTech',
           enabled: true
         }
       ]
     };
     
     fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
   }
   ```

4. Update `packages/mcp/src/server.ts`:
   - Import from `@bctb/shared`
   - Remove duplicated business logic
   - Keep only MCP protocol handling

5. Create `packages/mcp/config-schema.json` (JSON schema)

6. Create comprehensive `packages/mcp/README.md`:
   - Installation: `npm install -g bc-telemetry-buddy-mcp`
   - Configuration guide
   - Usage with Claude Desktop
   - Usage with Copilot Studio
   - Usage with VSCode (manual setup)
   - CLI commands reference
   - Troubleshooting

**Validation:**
- `npm link` works (local testing)
- CLI commands work: `bctb-mcp init`, `bctb-mcp validate`, `bctb-mcp start`
- All MCP tests pass
- Can start server with config file

---

### Phase 3: Refactor Extension for Independence ✅

**Goal:** Make extension fully functional without MCP

**Steps:**
1. Update `packages/extension/package.json`:
   ```json
   {
     "dependencies": {
       "@bctb/shared": "workspace:*"
     }
   }
   ```

2. Create `packages/extension/src/services/telemetryService.ts`:
   ```typescript
   import { AuthService, KustoService, CacheService, QueriesService } from '@bctb/shared';
   import * as vscode from 'vscode';
   
   /**
    * Direct telemetry service - no MCP required
    * Used by VSCode commands (Run KQL, etc.)
    */
   export class TelemetryService {
     private auth: AuthService;
     private kusto: KustoService;
     private cache: CacheService;
     private queries: QueriesService;
     
     constructor() {
       // Load from VSCode settings
       const config = vscode.workspace.getConfiguration('bctb.mcp');
       
       this.auth = new AuthService({
         tenantId: config.get('tenantId') || '',
         clientId: config.get('clientId'),
         authFlow: config.get('authFlow') || 'azure_cli',
         // ... other config
       });
       
       this.kusto = new KustoService(
         config.get('applicationInsights.appId') || '',
         config.get('kusto.clusterUrl') || ''
       );
       
       // ... initialize other services
     }
     
     async executeKQL(kql: string): Promise<QueryResult> {
       const token = await this.auth.getAccessToken();
       const result = await this.kusto.executeQuery(kql, token);
       return this.kusto.parseResult(result);
     }
     
     // ... other methods
   }
   ```

3. Update `packages/extension/src/extension.ts`:
   - Create `TelemetryService` instance
   - Use it for all direct commands
   - Keep `MCPClient` only for chat participant

4. Create `packages/extension/src/mcpInstaller.ts`:
   ```typescript
   import * as vscode from 'vscode';
   import { exec } from 'child_process';
   import { promisify } from 'util';
   
   const execAsync = promisify(exec);
   
   export class MCPInstaller {
     async isInstalled(): Promise<boolean> {
       try {
         await execAsync('bctb-mcp --version');
         return true;
       } catch {
         return false;
       }
     }
     
     async getVersion(): Promise<string | null> {
       try {
         const { stdout } = await execAsync('bctb-mcp --version');
         return stdout.trim();
       } catch {
         return null;
       }
     }
     
     async install(): Promise<void> {
       const terminal = vscode.window.createTerminal('BC Telemetry Buddy - Install MCP');
       terminal.show();
       terminal.sendText('npm install -g bc-telemetry-buddy-mcp');
       
       // Wait for user to confirm installation
       await vscode.window.showInformationMessage(
         'Installing MCP server... Please wait for the terminal command to complete.',
         { modal: false }
       );
     }
     
     async update(): Promise<void> {
       const terminal = vscode.window.createTerminal('BC Telemetry Buddy - Update MCP');
       terminal.show();
       terminal.sendText('npm update -g bc-telemetry-buddy-mcp');
     }
   }
   ```

5. Update `packages/extension/src/setupWizard.ts`:
   - Add profile management UI (list, add, edit, delete profiles)
   - Profile creation wizard (step-by-step profile setup)
   - Check if MCP installed, offer to install
   - Generate `.bctb-config.json` in workspace (single profile or multi-profile)
   - Configure VSCode settings
   - Configure VSCode MCP settings (`.vscode/settings.json`) with `BCTB_PROFILE` env var
   - Test connection for each profile
   - Set default profile

6. Create `packages/extension/src/services/profileManager.ts`:
   ```typescript
   import * as vscode from 'vscode';
   import { ProfiledConfig, MCPConfig } from '@bctb/shared';
   
   /**
    * Manages profile switching and configuration
    */
   export class ProfileManager {
     private currentProfile: string;
     private config: ProfiledConfig;
     
     constructor() {
       this.currentProfile = vscode.workspace.getConfiguration('bctb').get('currentProfile') || 'default';
       this.config = this.loadConfig();
     }
     
     async switchProfile(profileName: string): Promise<void> {
       // Validate profile exists
       if (!this.config.profiles[profileName]) {
         throw new Error(`Profile '${profileName}' not found`);
       }
       
       // Update current profile
       this.currentProfile = profileName;
       await vscode.workspace.getConfiguration('bctb').update(
         'currentProfile',
         profileName,
         vscode.ConfigurationTarget.Workspace
       );
       
       // Update MCP environment variable
       await this.updateMCPProfile(profileName);
       
       // Restart MCP server if running
       await this.restartMCP();
       
       // Update status bar
       this.updateStatusBar();
       
       // Notify user
       vscode.window.showInformationMessage(
         `Switched to profile: ${this.config.profiles[profileName].connectionName}`
       );
     }
     
     async listProfiles(): Promise<Array<{name: string; config: MCPConfig}>> {
       return Object.entries(this.config.profiles)
         .filter(([name]) => !name.startsWith('_')) // Filter out base profiles
         .map(([name, config]) => ({ name, config }));
     }
     
     getCurrentProfile(): MCPConfig {
       return this.config.profiles[this.currentProfile] || this.config.profiles[this.config.defaultProfile || 'default'];
     }
     
     async createProfile(name: string, config: MCPConfig): Promise<void> {
       // Add to config
       this.config.profiles[name] = config;
       await this.saveConfig();
     }
     
     async deleteProfile(name: string): Promise<void> {
       // Confirm deletion
       const confirm = await vscode.window.showWarningMessage(
         `Delete profile '${name}'?`,
         { modal: true },
         'Delete'
       );
       
       if (confirm === 'Delete') {
         delete this.config.profiles[name];
         await this.saveConfig();
         
         // Switch to default if deleted current profile
         if (this.currentProfile === name) {
           await this.switchProfile(this.config.defaultProfile || 'default');
         }
       }
     }
     
     private async updateMCPProfile(profileName: string): Promise<void> {
       const mcpConfig = vscode.workspace.getConfiguration('mcp');
       const servers = mcpConfig.get<any>('servers') || {};
       
       if (servers['bc-telemetry-buddy']) {
         servers['bc-telemetry-buddy'].env = servers['bc-telemetry-buddy'].env || {};
         servers['bc-telemetry-buddy'].env.BCTB_PROFILE = profileName;
         
         await mcpConfig.update(
           'servers',
           servers,
           vscode.ConfigurationTarget.Workspace
         );
       }
     }
     
     private loadConfig(): ProfiledConfig {
       // Load from .bctb-config.json
       const configPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath + '/.bctb-config.json';
       // ... implementation
     }
     
     private async saveConfig(): Promise<void> {
       // Save to .bctb-config.json
       // ... implementation
     }
   }
   ```

7. Create `packages/extension/src/ui/profileStatusBar.ts`:
   ```typescript
   import * as vscode from 'vscode';
   import { ProfileManager } from '../services/profileManager.js';
   
   export class ProfileStatusBar {
     private statusBarItem: vscode.StatusBarItem;
     
     constructor(private profileManager: ProfileManager) {
       this.statusBarItem = vscode.window.createStatusBarItem(
         vscode.StatusBarAlignment.Right,
         100
       );
       this.statusBarItem.command = 'bctb.switchProfile';
       this.updateDisplay();
       this.statusBarItem.show();
     }
     
     updateDisplay(): void {
       const currentProfile = this.profileManager.getCurrentProfile();
       this.statusBarItem.text = `🔌 ${currentProfile.connectionName}`;
       this.statusBarItem.tooltip = `Click to switch profile\nCurrent: ${currentProfile.connectionName}`;
     }
     
     dispose(): void {
       this.statusBarItem.dispose();
     }
   }
   ```

8. Add new commands to `package.json`:
   ```json
   {
     "contributes": {
       "commands": [
         {
           "command": "bctb.installMCP",
           "title": "BC Telemetry Buddy: Install/Update MCP Server"
         },
         {
           "command": "bctb.checkMCPStatus",
           "title": "BC Telemetry Buddy: Check MCP Server Status"
         },
         {
           "command": "bctb.createConfigFile",
           "title": "BC Telemetry Buddy: Create MCP Config File"
         },
         {
           "command": "bctb.switchProfile",
           "title": "BC Telemetry Buddy: Switch Profile"
         },
         {
           "command": "bctb.manageProfiles",
           "title": "BC Telemetry Buddy: Manage Profiles"
         },
         {
           "command": "bctb.createProfile",
           "title": "BC Telemetry Buddy: Create Profile"
         },
         {
           "command": "bctb.editProfile",
           "title": "BC Telemetry Buddy: Edit Profile"
         },
         {
           "command": "bctb.deleteProfile",
           "title": "BC Telemetry Buddy: Delete Profile"
         },
         {
           "command": "bctb.setDefaultProfile",
           "title": "BC Telemetry Buddy: Set Default Profile"
         },
         {
           "command": "bctb.duplicateProfile",
           "title": "BC Telemetry Buddy: Duplicate Profile"
         }
       ],
       "configuration": {
         "title": "BC Telemetry Buddy",
         "properties": {
           "bctb.currentProfile": {
             "type": "string",
             "default": "",
             "description": "Current active profile name (for multi-profile setups)"
           }
         }
       }
     }
   }
   ```

9. Update `packages/extension/src/chatParticipant.ts`:
   - Keep MCP client integration
   - Show helpful message if MCP not installed
   - Offer to install MCP when user first uses chat

8. Remove MCP bundling:
   - Delete `copy-mcp` script from `package.json`
   - Delete `packages/extension/mcp/` directory
   - Update build scripts

**Validation:**
- Extension activates without MCP installed
- Commands work: Run KQL, Save Query, etc.
- Chat participant gracefully handles missing MCP
- Setup wizard creates both VSCode settings and `.bctb-config.json`
- MCP installer detects and installs correctly

---

### Phase 4: Update Build System ✅

**Goal:** Configure npm workspaces and TypeScript project references

**Steps:**
1. Update root `package.json`:
   ```json
   {
     "name": "bc-telemetry-buddy-monorepo",
     "private": true,
     "workspaces": [
       "packages/*"
     ],
     "scripts": {
       "build": "npm run build --workspaces",
       "test": "npm run test --workspaces",
       "clean": "npm run clean --workspaces"
     }
   }
   ```

2. Update `tsconfig.json` (root):
   ```json
   {
     "compilerOptions": {
       "composite": true,
       "declaration": true,
       "declarationMap": true
     },
     "references": [
       { "path": "./packages/shared" },
       { "path": "./packages/mcp" },
       { "path": "./packages/extension" }
     ]
   }
   ```

3. Update each package's `tsconfig.json` to reference dependencies

4. Update GitHub Actions workflow:
   - Install dependencies with `npm ci` (workspace-aware)
   - Build shared first, then MCP and extension
   - Publish MCP to NPM
   - Publish extension to Marketplace

**Validation:**
- `npm install` at root installs all packages
- `npm run build` builds in correct order
- `npm run test` runs all tests
- TypeScript project references work
- GitHub Actions workflow succeeds

---

### Phase 5: Documentation Updates ✅

**Goal:** Update all documentation for new architecture

**Steps:**
1. Create `packages/mcp/README.md` (standalone):
   - Installation
   - Configuration
   - Usage with different clients
   - CLI reference
   - Troubleshooting

2. Update `packages/extension/README.md`:
   - Focus on extension features
   - Link to MCP docs for AI features
   - Setup wizard guide
   - Command reference

3. Update `docs/UserGuide.md`:
   - Quick start (install extension → setup wizard)
   - Using without MCP (direct commands)
   - Using with MCP (chat participant)
   - Advanced: Manual MCP setup

4. Update `docs/DesignWalkthrough.md`:
   - Add section on architecture redesign
   - Explain shared package approach
   - Document independence goals

5. Create `packages/shared/README.md`:
   - Explain purpose (shared core)
   - Not published to NPM
   - Developer documentation

**Validation:**
- All docs are consistent
- No broken links
- Clear for both new and existing users

---

### Phase 6: Migration & Rollout ✅

**Goal:** Smooth transition for existing users

**Steps:**
1. Add migration logic to extension:
   ```typescript
   async function migrateFromBundledMCP() {
     const config = vscode.workspace.getConfiguration('bctb.mcp');
     
     // Check if user has old bundled setup
     const hasOldSetup = config.get('port') !== undefined;
     
     if (hasOldSetup) {
       const choice = await vscode.window.showInformationMessage(
         'BC Telemetry Buddy now uses a standalone MCP server. Would you like to install it?',
         'Install', 'Learn More', 'Dismiss'
       );
       
       if (choice === 'Install') {
         await mcpInstaller.install();
         await setupWizard.createConfigFile();
       }
     }
   }
   ```

2. Add status bar item:
   - Show MCP version if installed
   - Show "Install MCP" button if not installed
   - Show connection status

3. Create `MIGRATION.md` guide:
   - What changed
   - Why it changed
   - How to upgrade
   - Troubleshooting

4. Update CHANGELOG with breaking changes

**Validation:**
- Existing users see migration prompt
- Migration preserves their settings
- Old settings still work (backward compatibility)

---

## Configuration Files

### MCP Config File (`.bctb-config.json`)

#### Single Profile Configuration (Backward Compatible)
```json
{
  "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
  "connectionName": "My BC Production",
  "authFlow": "azure_cli",
  "tenantId": "optional-for-azure-cli",
  "clientId": "optional-for-client-credentials",
  "applicationInsights": {
    "appId": "your-app-insights-id"
  },
  "kusto": {
    "clusterUrl": "https://ade.applicationinsights.io"
  },
  "workspace": {
    "path": "${workspaceFolder}",
    "queriesFolder": "queries"
  },
  "cache": {
    "enabled": true,
    "ttlSeconds": 3600
  },
  "sanitize": {
    "removePII": false
  },
  "references": [
    {
      "name": "Microsoft BC Telemetry Samples",
      "type": "github",
      "url": "https://github.com/microsoft/BCTech",
      "enabled": true
    }
  ]
}
```

#### Multi-Profile Configuration (Multiple Customers)
```json
{
  "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
  "profiles": {
    "_base_azure_cli": {
      "authFlow": "azure_cli",
      "tenantId": "common-tenant-id",
      "kusto": {
        "clusterUrl": "https://ade.applicationinsights.io"
      },
      "cache": {
        "enabled": true,
        "ttlSeconds": 3600
      }
    },
    "customer-a-prod": {
      "extends": "_base_azure_cli",
      "connectionName": "Customer A Production",
      "applicationInsights": {
        "appId": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
      },
      "workspace": {
        "path": "${workspaceFolder}/customers/customer-a",
        "queriesFolder": "queries"
      }
    },
    "customer-a-test": {
      "extends": "_base_azure_cli",
      "connectionName": "Customer A Test",
      "applicationInsights": {
        "appId": "yyyyyyyy-yyyy-yyyy-yyyy-yyyyyyyyyyyy"
      },
      "workspace": {
        "path": "${workspaceFolder}/customers/customer-a-test",
        "queriesFolder": "queries"
      }
    },
    "customer-b-prod": {
      "authFlow": "client_credentials",
      "tenantId": "customer-b-tenant-id",
      "clientId": "${CUSTOMER_B_CLIENT_ID}",
      "clientSecret": "${CUSTOMER_B_CLIENT_SECRET}",
      "connectionName": "Customer B Production",
      "applicationInsights": {
        "appId": "zzzzzzzz-zzzz-zzzz-zzzz-zzzzzzzzzzzz"
      },
      "kusto": {
        "clusterUrl": "https://ade.applicationinsights.io"
      },
      "workspace": {
        "path": "${workspaceFolder}/customers/customer-b",
        "queriesFolder": "queries"
      }
    }
  },
  "defaultProfile": "customer-a-prod",
  "sanitize": {
    "removePII": false
  },
  "references": [
    {
      "name": "Microsoft BC Telemetry Samples",
      "type": "github",
      "url": "https://github.com/microsoft/BCTech",
      "enabled": true
    }
  ]
}
```

**Profile Features:**
- **Inheritance:** Use `"extends": "profile-name"` to inherit settings (DRY)
- **Environment Variables:** Use `${ENV_VAR_NAME}` for secrets (e.g., `${CUSTOMER_B_CLIENT_SECRET}`)
- **Base Profiles:** Prefix with `_` for reusable templates (e.g., `_base_azure_cli`)
- **Default Profile:** `defaultProfile` key specifies which profile loads on startup
- **Workspace Paths:** Each profile can have its own queries folder (organized by customer)
- **Mixed Auth:** Different profiles can use different auth flows (azure_cli, client_credentials, device_code)

**Config file discovery order:**
1. `--config <path>` CLI argument (highest priority)
2. `.bctb-config.json` in current directory
3. `.bctb-config.json` in workspace root (if `BCTB_WORKSPACE` env var set)
4. `~/.bctb/config.json` (user home directory)
5. Environment variables (fallback)

### VSCode MCP Settings (`.vscode/settings.json`)

#### Single Profile Setup
```json
{
  "mcp.servers": {
    "bc-telemetry-buddy": {
      "command": "bctb-mcp",
      "args": ["start", "--config", "${workspaceFolder}/.bctb-config.json", "--stdio"],
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

#### Multi-Profile Setup (Profile Switching)
```json
{
  "bctb.currentProfile": "customer-a-prod",
  "mcp.servers": {
    "bc-telemetry-buddy": {
      "command": "bctb-mcp",
      "args": ["start", "--config", "${workspaceFolder}/.bctb-config.json", "--stdio"],
      "env": {
        "NODE_ENV": "production",
        "BCTB_PROFILE": "customer-a-prod"
      }
    }
  }
}
```

**How Profile Switching Works:**
1. Extension reads `bctb.currentProfile` setting (current active profile)
2. When user switches profile via status bar dropdown:
   - Extension updates `BCTB_PROFILE` environment variable in MCP server config
   - Extension restarts MCP server (takes ~2 seconds)
   - Chat participant now uses new customer's telemetry data
3. MCP server reads `BCTB_PROFILE` env var and loads that profile from `.bctb-config.json`
4. If `BCTB_PROFILE` not set, MCP uses `defaultProfile` from config file

---

## Profile Management and Switching

### Overview

BC Telemetry Buddy supports multiple telemetry endpoints (profiles) in a single configuration file. This is essential for users who work with multiple customers, each with their own Application Insights instance.

**Key Concepts:**
- **Profile:** A complete telemetry endpoint configuration (App Insights ID, Kusto cluster, auth settings, workspace path)
- **Profile Switching:** Changing the active profile to query a different customer's telemetry
- **Profile Inheritance:** Reusing common settings across profiles to avoid duplication
- **Single MCP Instance:** One MCP server switches profiles dynamically (not multiple MCP processes)

### Creating Profiles

#### Method 1: Setup Wizard (Recommended)

1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `BC Telemetry Buddy: Setup Wizard`
3. Select: `Manage Profiles`
4. Click: `Add Profile`
5. Fill in:
   - Profile Name: `customer-a-prod` (use lowercase-with-dashes)
   - Connection Name: `Customer A Production` (display name)
   - App Insights ID: `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`
   - Auth Flow: `azure_cli` (or `device_code`, `client_credentials`)
   - Workspace Path: `customers/customer-a` (optional, for customer-specific queries)
6. Click: `Save Profile`
7. Repeat for other customers
8. Set default profile (loads on startup)
9. Wizard saves to `.bctb-config.json`

#### Method 2: Manual Editing

Edit `.bctb-config.json` directly:

```json
{
  "profiles": {
    "customer-a-prod": {
      "connectionName": "Customer A Production",
      "authFlow": "azure_cli",
      "applicationInsights": { "appId": "xxx" },
      "kusto": { "clusterUrl": "https://ade.applicationinsights.io" }
    },
    "customer-b-prod": {
      "connectionName": "Customer B Production",
      "authFlow": "device_code",
      "applicationInsights": { "appId": "yyy" }
    }
  },
  "defaultProfile": "customer-a-prod"
}
```

### Switching Profiles

#### In VSCode Extension

**Status Bar Method (Fastest):**
1. Look at status bar (bottom right)
2. Click on current profile name (e.g., `🔌 Customer A Production`)
3. Select new profile from dropdown
4. Extension switches immediately (no MCP restart for direct commands)
5. If using chat, MCP restarts with new profile (~2 seconds)

**Command Palette Method:**
1. Open Command Palette (`Ctrl+Shift+P`)
2. Run: `BC Telemetry Buddy: Switch Profile`
3. Select profile from list
4. Confirm switch

**What Happens When Switching:**
- ✅ Direct commands (`Run KQL`, `Save Query`) use new profile immediately
- ✅ Extension updates `bctb.currentProfile` setting
- ✅ Status bar updates to show new profile name
- ✅ If MCP is running for chat, extension restarts it with new `BCTB_PROFILE` env var
- ✅ Chat participant now queries new customer's telemetry

#### In MCP (Standalone)

**CLI Method:**
```bash
# Start with specific profile
bctb-mcp start --profile customer-b-prod

# Or use environment variable
export BCTB_PROFILE=customer-b-prod
bctb-mcp start
```

**Config Method:**
MCP reads `BCTB_PROFILE` environment variable. If not set, uses `defaultProfile` from config.

### Profile Inheritance (DRY)

**Problem:** Multiple customers use same auth settings (e.g., same Azure tenant, same Kusto cluster)

**Solution:** Create a base profile and extend it

```json
{
  "profiles": {
    "_base_azure_cli": {
      "authFlow": "azure_cli",
      "tenantId": "common-tenant-id",
      "kusto": { "clusterUrl": "https://ade.applicationinsights.io" },
      "cache": { "enabled": true, "ttlSeconds": 3600 }
    },
    "customer-a-prod": {
      "extends": "_base_azure_cli",
      "connectionName": "Customer A Production",
      "applicationInsights": { "appId": "xxx" }
    },
    "customer-a-test": {
      "extends": "_base_azure_cli",
      "connectionName": "Customer A Test",
      "applicationInsights": { "appId": "yyy" }
    }
  }
}
```

**Inheritance Rules:**
1. Child profile inherits all settings from parent (`extends`)
2. Child can override any inherited setting
3. Deep merge for nested objects (e.g., `applicationInsights`, `kusto`)
4. Profiles prefixed with `_` are templates (not shown in UI profile picker)
5. Multiple levels supported: `customer-a-prod` → `_base_azure_cli` → `_base_common`

### Environment Variables for Secrets

**Problem:** Don't want to commit client secrets to git

**Solution:** Use environment variable substitution

```json
{
  "profiles": {
    "customer-b-prod": {
      "authFlow": "client_credentials",
      "clientId": "${CUSTOMER_B_CLIENT_ID}",
      "clientSecret": "${CUSTOMER_B_CLIENT_SECRET}",
      "applicationInsights": { "appId": "zzz" }
    }
  }
}
```

**Set environment variables:**
```bash
# Windows (PowerShell)
$env:CUSTOMER_B_CLIENT_ID = "your-client-id"
$env:CUSTOMER_B_CLIENT_SECRET = "your-client-secret"

# Linux/Mac
export CUSTOMER_B_CLIENT_ID="your-client-id"
export CUSTOMER_B_CLIENT_SECRET="your-client-secret"
```

**Best Practices:**
- Commit `.bctb-config.json` to git with `${ENV_VAR}` placeholders
- Store actual secrets in:
  - `.env` file (add to `.gitignore`)
  - Azure Key Vault (for CI/CD)
  - System environment variables
- Document required env vars in `README.md`

### Profile-Specific Workspace Paths

**Use Case:** Each customer has their own queries folder

**Folder Structure:**
```
workspace-root/
├── .bctb-config.json
└── customers/
    ├── customer-a/
    │   └── queries/
    │       ├── errors.kql
    │       └── performance.kql
    └── customer-b/
        └── queries/
            ├── errors.kql
            └── usage.kql
```

**Config:**
```json
{
  "profiles": {
    "customer-a-prod": {
      "connectionName": "Customer A",
      "applicationInsights": { "appId": "xxx" },
      "workspace": {
        "path": "${workspaceFolder}/customers/customer-a",
        "queriesFolder": "queries"
      }
    },
    "customer-b-prod": {
      "connectionName": "Customer B",
      "applicationInsights": { "appId": "yyy" },
      "workspace": {
        "path": "${workspaceFolder}/customers/customer-b",
        "queriesFolder": "queries"
      }
    }
  }
}
```

**Behavior:**
- When you switch to `customer-a-prod`, `Save Query` saves to `customers/customer-a/queries/`
- When you switch to `customer-b-prod`, `Save Query` saves to `customers/customer-b/queries/`
- Each customer's queries are isolated and organized

### Profile Management Commands

**Extension Commands:**
- `BC Telemetry Buddy: Switch Profile` - Change active profile
- `BC Telemetry Buddy: Manage Profiles` - Open profile manager UI
- `BC Telemetry Buddy: Create Profile` - Add new profile via wizard
- `BC Telemetry Buddy: Edit Profile` - Modify existing profile
- `BC Telemetry Buddy: Delete Profile` - Remove profile (with confirmation)
- `BC Telemetry Buddy: Set Default Profile` - Change startup profile
- `BC Telemetry Buddy: Duplicate Profile` - Copy profile as template

**MCP CLI Commands:**
```bash
# List all profiles
bctb-mcp list-profiles

# Validate all profiles
bctb-mcp validate --all-profiles

# Test specific profile auth
bctb-mcp test-auth --profile customer-a-prod

# Start with specific profile
bctb-mcp start --profile customer-b-prod
```

### Troubleshooting Profiles

#### Profile Not Found
**Error:** `Profile 'customer-xyz' not found in config`

**Solution:**
1. Check profile name spelling in `.bctb-config.json`
2. Ensure profile is under `profiles` object
3. Reload VSCode window (`Developer: Reload Window`)

#### Profile Inheritance Not Working
**Error:** Settings from base profile not applied

**Solution:**
1. Check `extends` key points to existing profile
2. Ensure base profile is defined before child profile (order matters)
3. Validate config: `bctb-mcp validate`

#### Environment Variables Not Expanding
**Error:** `${CUSTOMER_B_CLIENT_ID}` appears as literal string

**Solution:**
1. Check environment variable is set: `echo $env:CUSTOMER_B_CLIENT_ID` (PowerShell)
2. Restart VSCode after setting env vars
3. Use proper syntax: `${VAR_NAME}` (not `$VAR_NAME` or `%VAR_NAME%`)

#### MCP Not Using New Profile After Switch
**Error:** Chat participant still uses old customer data

**Solution:**
1. Wait 2-3 seconds for MCP restart to complete
2. Check status bar shows correct profile name
3. Manually restart MCP: `BC Telemetry Buddy: Restart MCP Server`
4. Check `.vscode/settings.json` has correct `BCTB_PROFILE` env var

### Profile Best Practices

1. **Naming Convention:**
   - Use lowercase-with-dashes: `customer-a-prod`, `customer-b-test`
   - Include environment suffix: `-prod`, `-test`, `-dev`
   - Use descriptive names: `acme-corp-prod` (not `profile1`)

2. **Organization:**
   - Group by customer: `acme-*`, `contoso-*`
   - Use base profiles for shared settings: `_base_azure_cli`
   - Keep `defaultProfile` as your most-used customer

3. **Security:**
   - Never commit secrets directly in config
   - Use `${ENV_VAR}` for client secrets, passwords, tokens
   - Add `.env` to `.gitignore`
   - Document required env vars in `README.md`

4. **Testing:**
   - Create separate `-test` profiles for each customer
   - Use different App Insights instances for test environments
   - Test profile switching before deploying to production

5. **Documentation:**
   - Add comments (as `_comment` keys) to explain profile purpose
   - Document which customers use which auth flows
   - Keep a profile inventory in your project README

---

## NPM Publishing

### MCP Package

**Package name:** `bc-telemetry-buddy-mcp` (or `@waldobc/bc-telemetry-buddy-mcp`)

**Publishing steps:**
```bash
cd packages/mcp
npm version patch  # or minor, major
npm run build
npm publish --access public
```

**What gets published:**
- `dist/` (compiled code)
- `config-schema.json`
- `README.md`
- `LICENSE`

**What's excluded:**
- `src/` (source code)
- `__tests__/` (tests)
- `node_modules/`

---

## Usage Scenarios

### Scenario 1: VSCode Extension User (No AI)

**User wants:** Execute KQL queries directly in VSCode

**Flow:**
1. Install extension from Marketplace
2. Run Setup Wizard (`Ctrl+Shift+P` → "BC Telemetry Buddy: Setup Wizard")
3. Configure Azure credentials
4. Use commands: "Run KQL Query", "Save Query", etc.

**MCP required?** ❌ No

---

### Scenario 2: VSCode Extension User (With Copilot)

**User wants:** Ask Copilot to analyze telemetry

**Flow:**
1. Install extension from Marketplace
2. Extension detects MCP not installed
3. User clicks "Install MCP" notification
4. Extension runs `npm install -g bc-telemetry-buddy-mcp`
5. Setup Wizard creates `.bctb-config.json` and VSCode MCP settings
6. User asks Copilot: `@bc-telemetry-buddy show errors from last hour`

**MCP required?** ✅ Yes (extension helps install)

---

### Scenario 3: Claude Desktop User

**User wants:** Use Claude to query BC telemetry

**Flow:**
1. Install MCP: `npm install -g bc-telemetry-buddy-mcp`
2. Create config: `bctb-mcp init`
3. Edit `.bctb-config.json` with credentials
4. Test: `bctb-mcp test-auth --config .bctb-config.json`
5. Add to Claude Desktop config:
   ```json
   {
     "mcpServers": {
       "bc-telemetry": {
         "command": "bctb-mcp",
         "args": ["start", "--config", "/path/to/.bctb-config.json"]
       }
     }
   }
   ```
6. Restart Claude Desktop
7. Ask Claude: "Show me performance issues from the last 24 hours"

**Extension required?** ❌ No

---

### Scenario 4: Copilot Studio Integration

**User wants:** Use Copilot Studio to analyze BC telemetry

**Flow:**
1. Install MCP: `npm install -g bc-telemetry-buddy-mcp`
2. Create config: `bctb-mcp init --output /opt/copilot/bctb-config.json`
3. Configure authentication (service principal recommended)
4. Register in Copilot Studio as Custom Action:
   - Command: `bctb-mcp`
   - Args: `["start", "--config", "/opt/copilot/bctb-config.json", "--stdio"]`
   - Transport: `stdio`
5. Copilot Studio can now use tools: `get_event_catalog`, `query_telemetry`, etc.

**Extension required?** ❌ No

---

### Scenario 5: Multiple Customers with Profile Switching

**User wants:** Work with 5 different customers, switch between them easily

**Setup Flow:**
1. Install extension from Marketplace
2. Run Setup Wizard (`Ctrl+Shift+P` → "BC Telemetry Buddy: Setup Wizard")
3. Select: "Manage Profiles" → "Add Profile"
4. Add profiles for each customer:
   - `customer-a-prod` (Customer A Production)
   - `customer-a-test` (Customer A Test)
   - `customer-b-prod` (Customer B Production)
   - `customer-c-prod` (Customer C Production)
   - `internal-dev` (Internal Development)
5. Set `customer-a-prod` as default profile
6. Wizard creates `.bctb-config.json` with all profiles
7. Extension shows "🔌 Customer A Production" in status bar

**Daily Usage Flow:**
1. Morning: Working on Customer A production issue
   - Status bar shows: `🔌 Customer A Production`
   - Run KQL query: `Run KQL Query` command → queries Customer A data
   - Save query: Saves to `customers/customer-a/queries/`

2. Afternoon: Need to check Customer B performance
   - Click status bar: Select `customer-b-prod` from dropdown
   - Status bar updates: `🔌 Customer B Production`
   - Run same KQL query → now queries Customer B data
   - Results show Customer B telemetry

3. End of day: Compare with test environment
   - Switch to `customer-a-test` profile
   - Run comparison queries
   - Switch back to `customer-a-prod` for final check

**With Chat (Optional):**
1. Install MCP: Extension offers "Install MCP Server" button
2. Extension configures MCP with profile support
3. Ask Copilot: `@bc-telemetry-buddy show errors from last hour`
4. Copilot queries current profile (Customer A Production)
5. Switch profile in status bar → Copilot now uses Customer B data
6. **Note:** MCP restarts when switching (~2 seconds)

**Key Benefits:**
- ✅ Single workspace for all customers
- ✅ Fast profile switching (click status bar)
- ✅ Customer-specific queries organized in folders
- ✅ No need to remember different App Insights IDs
- ✅ Environment variables keep secrets out of git
- ✅ Profile inheritance reduces config duplication

**MCP required?** ❌ No (for direct commands), ✅ Yes (for chat participant)

---

## Testing Strategy

### Shared Package Tests
- Unit tests for auth, kusto, cache, queries
- Mock external dependencies (MSAL, axios)
- 90%+ code coverage

### MCP Tests
- CLI command tests
- Config file loading/validation
- Server startup (stdio, HTTP)
- JSON-RPC protocol handling
- Integration tests with real Application Insights (optional)

### Extension Tests
- Direct KQL execution (without MCP)
- MCP installer logic
- Setup wizard
- Chat participant (with MCP mock)
- VSCode commands

### End-to-End Tests
- Extension + MCP integration
- Config file generation and usage
- Migration from old architecture

---

## Rollout Plan

### Version 2.0.0 (Breaking Changes)

**What's changing:**
- MCP no longer bundled with extension
- Extension can work without MCP
- Configuration split (VSCode settings + `.bctb-config.json`)

**Migration path:**
- Extension shows migration prompt on first launch
- Offers to install MCP globally
- Migrates old settings to new format
- Creates `.bctb-config.json` automatically

**Communication:**
- Update README with migration guide
- Create `MIGRATION.md` document
- Update docs/UserGuide.md
- Release notes in CHANGELOG

---

## Future Enhancements

### Phase 7: Enhanced MCP Features
- Support for multiple config profiles
- Config encryption for secrets
- MCP server health monitoring
- Performance metrics/telemetry
- Interactive config wizard (CLI)

### Phase 8: Advanced Extension Features
- Query history viewer
- Visual query builder
- Telemetry dashboards
- Saved query library UI
- Export to Excel/CSV

### Phase 9: Additional AI Clients
- JetBrains IDE integration
- Emacs integration
- Vim/Neovim integration
- Web-based chat interface

---

## Success Criteria

### Technical Goals
- ✅ Shared package builds successfully
- ✅ MCP publishes to NPM
- ✅ Extension works without MCP
- ✅ All tests pass
- ✅ Zero regression in functionality

### User Experience Goals
- ✅ Existing users migrate smoothly
- ✅ New users can install in < 5 minutes
- ✅ Clear documentation for all scenarios
- ✅ Helpful error messages
- ✅ No breaking changes for end users (seamless migration)

### Business Goals
- ✅ MCP available on NPM (discoverability)
- ✅ Extension independent (can be used standalone)
- ✅ Broader reach (Claude, Copilot Studio, etc.)
- ✅ Easier maintenance (shared code)
- ✅ Better versioning (independent releases)

---

## Known Issues & Limitations

### Build System
- TypeScript project references require `tsc --build` (not `tsc`)
- Workspace packages must be built in order (shared → mcp/extension)

### MCP Configuration
- Config file must be valid JSON (no comments)
- Secrets in config file (need to document security best practices)
- Config file paths must be absolute or relative to current directory

### Extension
- First-time setup requires internet connection (npm install)
- MCP installation requires Node.js/npm on user's machine
- Migration detection only works on first launch after upgrade

---

## Open Questions

1. **Package naming:**
   - `bc-telemetry-buddy-mcp` (simple)
   - `@waldobc/bc-telemetry-buddy-mcp` (scoped)

2. **Config file location preference:**
   - Project-specific (`.bctb-config.json` in workspace)
   - User-global (`~/.bctb/config.json`)
   - Both (with priority order)

3. **Backward compatibility:**
   - Support old env var config indefinitely?
   - Deprecation timeline?

4. **MCP versioning:**
   - Independent versioning from extension?
   - Require minimum MCP version in extension?

---

## Resources

### Documentation
- [Model Context Protocol Spec](https://modelcontextprotocol.io/)
- [NPM Publishing Guide](https://docs.npmjs.com/packages-and-modules/contributing-packages-to-the-registry)
- [VSCode Extension API](https://code.visualstudio.com/api)
- [TypeScript Project References](https://www.typescriptlang.org/docs/handbook/project-references.html)

### Related Projects
- [Claude Desktop MCP Config](https://modelcontextprotocol.io/quickstart/user)
- [GitHub Copilot Chat Extension](https://github.com/github/copilot-chat)

---

## Appendix

### JSON Schema for Config File

See `packages/mcp/config-schema.json` for complete schema.

### CLI Command Reference

```bash
# Install globally
npm install -g bc-telemetry-buddy-mcp

# Initialize config
bctb-mcp init [--output <path>]

# Validate config
bctb-mcp validate [--config <path>]

# Test authentication
bctb-mcp test-auth [--config <path>]

# Start server (stdio mode, default)
bctb-mcp start [--config <path>]

# Start server (HTTP mode)
bctb-mcp start --http [--config <path>]

# Show version
bctb-mcp --version

# Show help
bctb-mcp --help
```

---

## Refactoring Workflow with Testable Steps

This section provides a detailed, step-by-step workflow that can be executed and tested incrementally. Each step has clear validation criteria to ensure the refactoring progresses correctly.

### Workflow Overview

```
Phase 1: Setup Workspace Structure (30 min)
   ↓
Phase 2: Create Shared Package (2 hours)
   ↓
Phase 3: Refactor MCP (4 hours)
   ↓
Phase 4: Refactor Extension (4 hours)
   ↓
Phase 5: Configure Build System (2 hours)
   ↓
Phase 6: Update Documentation (2 hours)
   ↓
Phase 7: Test & Validate (2 hours)
   ↓
Phase 8: Publish & Deploy (1 hour)
```

**Total estimated time:** 17-20 hours

---

### Phase 1: Setup Workspace Structure (30 minutes)

#### Step 1.1: Update Root package.json for Workspaces
**Action:**
```bash
# Edit package.json at root
```

Add workspace configuration:
```json
{
  "name": "bc-telemetry-buddy-monorepo",
  "private": true,
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "build": "npm run build --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "clean": "npm run clean --workspaces --if-present"
  },
  "devDependencies": {
    "typescript": "^5.3.0"
  }
}
```

**Test:**
```bash
npm install
# Should complete without errors
# node_modules/ should be created at root
```

**Success Criteria:**
- ✅ Root `node_modules/` exists
- ✅ No installation errors
- ✅ `npm run build` recognizes workspace structure (even if packages don't exist yet)

---

#### Step 1.2: Create Shared Package Directory
**Action:**
```bash
mkdir -p packages/shared/src/__tests__
```

**Test:**
```bash
ls packages/shared/src/__tests__
# Should show the directory exists
```

**Success Criteria:**
- ✅ Directory structure created
- ✅ No errors

---

#### Step 1.3: Initialize Shared Package
**Action:**
Create `packages/shared/package.json`:
```json
{
  "name": "@bctb/shared",
  "version": "1.0.0",
  "private": true,
  "description": "Shared core library for BC Telemetry Buddy",
  "type": "commonjs",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "scripts": {
    "build": "tsc --build",
    "dev": "tsc --build --watch",
    "clean": "rimraf dist",
    "test": "jest"
  },
  "dependencies": {
    "@azure/msal-node": "^3.8.0",
    "axios": "^1.6.0",
    "lru-cache": "^10.1.0"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^22.18.11",
    "jest": "^30.2.0",
    "rimraf": "^6.0.1",
    "ts-jest": "^29.4.5",
    "typescript": "^5.3.0"
  }
}
```

Create `packages/shared/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "declaration": true,
    "declarationMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["src/**/*.test.ts", "src/__tests__"]
}
```

Create `packages/shared/jest.config.js`:
```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/__tests__/**'
  ]
};
```

**Test:**
```bash
cd packages/shared
npm install
# Should install dependencies
```

**Success Criteria:**
- ✅ `packages/shared/node_modules/` created
- ✅ Dependencies installed
- ✅ No errors

---

### Phase 2: Create Shared Package (2 hours)

#### Step 2.1: Move auth.ts to Shared
**Action:**
```bash
# Copy (don't move yet) to preserve MCP functionality during refactoring
cp packages/mcp/src/auth.ts packages/shared/src/auth.ts
```

**Test:**
```bash
# Check file exists
cat packages/shared/src/auth.ts | head -n 5
# Should show the file content
```

**Success Criteria:**
- ✅ File copied successfully
- ✅ No syntax errors when viewing

---

#### Step 2.2: Move kusto.ts to Shared
**Action:**
```bash
cp packages/mcp/src/kusto.ts packages/shared/src/kusto.ts
```

**Test:**
```bash
cat packages/shared/src/kusto.ts | head -n 5
```

**Success Criteria:**
- ✅ File copied successfully

---

#### Step 2.3: Move cache.ts to Shared
**Action:**
```bash
cp packages/mcp/src/cache.ts packages/shared/src/cache.ts
```

**Test:**
```bash
cat packages/shared/src/cache.ts | head -n 5
```

**Success Criteria:**
- ✅ File copied successfully

---

#### Step 2.4: Move queries.ts to Shared
**Action:**
```bash
cp packages/mcp/src/queries.ts packages/shared/src/queries.ts
```

**Test:**
```bash
cat packages/shared/src/queries.ts | head -n 5
```

**Success Criteria:**
- ✅ File copied successfully

---

#### Step 2.5: Move sanitize.ts to Shared
**Action:**
```bash
cp packages/mcp/src/sanitize.ts packages/shared/src/sanitize.ts
```

**Test:**
```bash
cat packages/shared/src/sanitize.ts | head -n 5
```

**Success Criteria:**
- ✅ File copied successfully

---

#### Step 2.6: Move eventLookup.ts to Shared
**Action:**
```bash
cp packages/mcp/src/eventLookup.ts packages/shared/src/eventLookup.ts
```

**Test:**
```bash
cat packages/shared/src/eventLookup.ts | head -n 5
```

**Success Criteria:**
- ✅ File copied successfully

---

#### Step 2.7: Create Shared Index (Barrel Export)
**Action:**
Create `packages/shared/src/index.ts`:
```typescript
// Core services
export * from './auth.js';
export * from './kusto.js';
export * from './cache.js';
export * from './queries.js';
export * from './sanitize.js';
export * from './eventLookup.js';

// Re-export types that consumers need
export type { MCPConfig, Reference } from './config.js';
```

**Test:**
```bash
cat packages/shared/src/index.ts
# Should show all exports
```

**Success Criteria:**
- ✅ All modules exported
- ✅ No syntax errors

---

#### Step 2.8: Copy Shared Tests
**Action:**
```bash
# Copy tests for modules we moved
cp packages/mcp/src/__tests__/auth.test.ts packages/shared/src/__tests__/
cp packages/mcp/src/__tests__/kusto.test.ts packages/shared/src/__tests__/
cp packages/mcp/src/__tests__/cache.test.ts packages/shared/src/__tests__/
cp packages/mcp/src/__tests__/queries.test.ts packages/shared/src/__tests__/
cp packages/mcp/src/__tests__/sanitize.test.ts packages/shared/src/__tests__/
cp packages/mcp/src/__tests__/event-lookup.test.ts packages/shared/src/__tests__/
```

**Test:**
```bash
ls packages/shared/src/__tests__/*.test.ts
# Should list all test files
```

**Success Criteria:**
- ✅ Test files copied
- ✅ All expected tests present

---

#### Step 2.9: Build Shared Package
**Action:**
```bash
cd packages/shared
npm run build
```

**Test:**
```bash
ls dist/
# Should show compiled .js and .d.ts files
cat dist/index.d.ts
# Should show TypeScript declarations
```

**Success Criteria:**
- ✅ Build completes without errors
- ✅ `dist/` directory created
- ✅ `.js` and `.d.ts` files generated
- ✅ No TypeScript errors

---

#### Step 2.10: Run Shared Package Tests
**Action:**
```bash
cd packages/shared
npm test
```

**Test:**
The tests should run (may have some failures due to config differences, we'll fix in next phase)

**Success Criteria:**
- ✅ Jest runs successfully
- ✅ Test framework works
- ✅ At least 50% of tests pass (acceptable at this stage)

---

### Phase 3: Refactor MCP to Use Shared (4 hours)

#### Step 3.1: Update MCP package.json Dependencies
**Action:**
Edit `packages/mcp/package.json`, add dependency:
```json
{
  "dependencies": {
    "@bctb/shared": "workspace:*",
    "express": "^4.18.2",
    "commander": "^12.0.0"
  }
}
```

**Test:**
```bash
cd packages/mcp
npm install
# Check that @bctb/shared is symlinked
ls -la node_modules/@bctb/
```

**Success Criteria:**
- ✅ Installation succeeds
- ✅ `@bctb/shared` appears in `node_modules/`
- ✅ It's a symlink to `../../shared`

---

#### Step 3.2: Create MCP CLI Entry Point
**Action:**
Create `packages/mcp/src/cli.ts` with the CLI code from the plan (see Phase 2, Step 2 in main plan)

**Test:**
```bash
cat packages/mcp/src/cli.ts | head -n 20
# Should show the CLI code
```

**Success Criteria:**
- ✅ File created
- ✅ Imports from commander
- ✅ Has command definitions

---

#### Step 3.3: Update MCP server.ts to Import from Shared
**Action:**
Edit `packages/mcp/src/server.ts`, replace local imports:
```typescript
// OLD:
// import { AuthService } from './auth.js';
// import { KustoService } from './kusto.js';
// etc.

// NEW:
import { 
  AuthService, 
  KustoService, 
  CacheService, 
  QueriesService,
  sanitizeObject,
  lookupEventCategory
} from '@bctb/shared';
```

**Test:**
```bash
cd packages/mcp
npm run build
# Should compile without errors
```

**Success Criteria:**
- ✅ TypeScript compilation succeeds
- ✅ No import errors
- ✅ `dist/server.js` created

---

#### Step 3.4: Update MCP config.ts for File-Based Config
**Action:**
Edit `packages/mcp/src/config.ts` to add:
```typescript
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Load config from file with discovery
 */
export function loadConfigFromFile(configPath?: string): MCPConfig {
  let filePath: string | null = null;

  if (configPath) {
    // Explicit config path provided
    filePath = path.resolve(configPath);
  } else {
    // Auto-discovery
    const candidates = [
      path.join(process.cwd(), '.bctb-config.json'),
      process.env.BCTB_WORKSPACE ? path.join(process.env.BCTB_WORKSPACE, '.bctb-config.json') : null,
      path.join(os.homedir(), '.bctb', 'config.json')
    ].filter(Boolean) as string[];

    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        filePath = candidate;
        break;
      }
    }
  }

  if (!filePath) {
    throw new Error('No config file found. Run: bctb-mcp init');
  }

  const fileContent = fs.readFileSync(filePath, 'utf-8');
  const fileConfig = JSON.parse(fileContent);

  // Resolve ${workspaceFolder} variable
  if (fileConfig.workspace?.path?.includes('${workspaceFolder}')) {
    const workspaceFolder = process.env.BCTB_WORKSPACE || process.cwd();
    fileConfig.workspace.path = fileConfig.workspace.path.replace('${workspaceFolder}', workspaceFolder);
  }

  return fileConfig as MCPConfig;
}

/**
 * Initialize config file template
 */
export function initConfig(outputPath: string): void {
  const template = {
    "$schema": "https://raw.githubusercontent.com/waldo1001/waldo.BCTelemetryBuddy/main/packages/mcp/config-schema.json",
    "connectionName": "My BC Production",
    "authFlow": "azure_cli",
    "tenantId": "your-tenant-id",
    "applicationInsights": {
      "appId": "your-app-insights-id"
    },
    "kusto": {
      "clusterUrl": "https://ade.applicationinsights.io"
    },
    "workspace": {
      "path": "${workspaceFolder}",
      "queriesFolder": "queries"
    },
    "cache": {
      "enabled": true,
      "ttlSeconds": 3600
    },
    "sanitize": {
      "removePII": false
    },
    "references": []
  };

  fs.writeFileSync(outputPath, JSON.stringify(template, null, 2));
}
```

Update `loadConfig()` to try file first, then fall back to env vars:
```typescript
export function loadConfig(configPath?: string): MCPConfig {
  // Try file-based config first
  try {
    return loadConfigFromFile(configPath);
  } catch (error) {
    console.warn('No config file found, using environment variables');
    // Fall back to existing env var logic
    return loadConfigFromEnv();
  }
}

function loadConfigFromEnv(): MCPConfig {
  // Existing loadConfig() code goes here
  const workspacePath = process.env.BCTB_WORKSPACE_PATH;
  // ... rest of existing code
}
```

**Test:**
```bash
cd packages/mcp
npm run build
# Should compile successfully
```

**Success Criteria:**
- ✅ Compiles without errors
- ✅ Has file loading functions
- ✅ Has fallback to env vars

---

#### Step 3.5: Create Config Schema
**Action:**
Create `packages/mcp/config-schema.json`:
```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "BC Telemetry Buddy MCP Configuration",
  "type": "object",
  "properties": {
    "connectionName": {
      "type": "string",
      "description": "Friendly name for this connection"
    },
    "authFlow": {
      "type": "string",
      "enum": ["azure_cli", "device_code", "client_credentials"],
      "description": "Authentication flow to use"
    },
    "tenantId": {
      "type": "string",
      "description": "Azure AD tenant ID"
    },
    "clientId": {
      "type": "string",
      "description": "Azure AD client ID (for client_credentials)"
    },
    "applicationInsights": {
      "type": "object",
      "properties": {
        "appId": {
          "type": "string",
          "description": "Application Insights application ID"
        }
      },
      "required": ["appId"]
    },
    "kusto": {
      "type": "object",
      "properties": {
        "clusterUrl": {
          "type": "string",
          "description": "Kusto cluster URL"
        }
      },
      "required": ["clusterUrl"]
    },
    "workspace": {
      "type": "object",
      "properties": {
        "path": {
          "type": "string",
          "description": "Workspace path (supports ${workspaceFolder} variable)"
        },
        "queriesFolder": {
          "type": "string",
          "description": "Folder for saved queries"
        }
      }
    },
    "cache": {
      "type": "object",
      "properties": {
        "enabled": {
          "type": "boolean"
        },
        "ttlSeconds": {
          "type": "number"
        }
      }
    }
  },
  "required": ["authFlow", "applicationInsights", "kusto"]
}
```

**Test:**
```bash
cat packages/mcp/config-schema.json | jq .
# Should show valid JSON
```

**Success Criteria:**
- ✅ Valid JSON
- ✅ Schema structure correct

---

#### Step 3.6: Update MCP Build to Include CLI
**Action:**
Edit `packages/mcp/package.json`:
```json
{
  "bin": {
    "bctb-mcp": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc --build && node -e \"const fs=require('fs');const path=require('path');const cliPath=path.join(__dirname,'dist','cli.js');let content=fs.readFileSync(cliPath,'utf8');if(!content.startsWith('#!/usr/bin/env node')){content='#!/usr/bin/env node\\n'+content;fs.writeFileSync(cliPath,content);}\"",
    "dev": "tsc --build --watch",
    "test": "jest",
    "clean": "rimraf dist"
  }
}
```

**Test:**
```bash
cd packages/mcp
npm run build
ls -la dist/cli.js
# Should show executable permissions and shebang
head -n 1 dist/cli.js
# Should show: #!/usr/bin/env node
```

**Success Criteria:**
- ✅ Build succeeds
- ✅ `dist/cli.js` exists
- ✅ Shebang line present

---

#### Step 3.7: Test MCP CLI Commands Locally
**Action:**
```bash
cd packages/mcp
npm link
# This makes bctb-mcp available globally
```

**Test:**
```bash
bctb-mcp --version
# Should show version

bctb-mcp init --output /tmp/test-config.json
# Should create config file

cat /tmp/test-config.json
# Should show config template

bctb-mcp validate --config /tmp/test-config.json
# Should show validation errors (expected - template has placeholders)
```

**Success Criteria:**
- ✅ `bctb-mcp` command works
- ✅ `init` creates config file
- ✅ `validate` runs (errors expected with template)

---

#### Step 3.8: Run MCP Tests
**Action:**
```bash
cd packages/mcp
npm test
```

**Test:**
Tests should run. Some may fail due to refactoring - that's OK at this stage.

**Success Criteria:**
- ✅ Jest runs
- ✅ Most server tests pass
- ✅ No import/module errors

---

### Phase 4: Refactor Extension for Independence (4 hours)

#### Step 4.1: Update Extension package.json
**Action:**
Edit `packages/extension/package.json`:
```json
{
  "dependencies": {
    "@bctb/shared": "workspace:*",
    "@azure/msal-node": "^3.8.0",
    "axios": "^1.6.0"
  }
}
```

Remove the `copy-mcp` script.

**Test:**
```bash
cd packages/extension
npm install
ls -la node_modules/@bctb/
# Should show symlink to shared package
```

**Success Criteria:**
- ✅ `@bctb/shared` installed
- ✅ Symlinked correctly

---

#### Step 4.2: Create TelemetryService
**Action:**
Create `packages/extension/src/services/telemetryService.ts` (see Phase 3, Step 2 in main plan for full code)

**Test:**
```bash
cat packages/extension/src/services/telemetryService.ts | head -n 30
# Should show the service code
```

**Success Criteria:**
- ✅ File created
- ✅ Imports from `@bctb/shared`

---

#### Step 4.3: Create MCPInstaller
**Action:**
Create `packages/extension/src/mcpInstaller.ts` (see Phase 3, Step 4 in main plan for full code)

**Test:**
```bash
cat packages/extension/src/mcpInstaller.ts | head -n 30
```

**Success Criteria:**
- ✅ File created
- ✅ Has install/check methods

---

#### Step 4.4: Update Extension Main File
**Action:**
Edit `packages/extension/src/extension.ts` to:
1. Import `TelemetryService`
2. Import `MCPInstaller`
3. Create instances on activation
4. Check for MCP on first run

**Test:**
```bash
cd packages/extension
npm run build
# Should compile successfully
```

**Success Criteria:**
- ✅ Compiles without errors
- ✅ No import errors

---

#### Step 4.5: Remove Bundled MCP Directory
**Action:**
```bash
rm -rf packages/extension/mcp/
```

**Test:**
```bash
ls packages/extension/mcp/
# Should show: No such file or directory
```

**Success Criteria:**
- ✅ Directory removed
- ✅ Build still works

---

#### Step 4.6: Build Extension
**Action:**
```bash
cd packages/extension
npm run build
```

**Test:**
```bash
ls dist/extension.js
# Should exist
```

**Success Criteria:**
- ✅ Build succeeds
- ✅ No errors about missing MCP

---

#### Step 4.7: Run Extension Tests
**Action:**
```bash
cd packages/extension
npm test
```

**Test:**
Unit tests should run (integration tests may fail without MCP installed)

**Success Criteria:**
- ✅ Jest runs
- ✅ Unit tests pass
- ✅ No import errors

---

### Phase 5: Configure Build System (2 hours)

#### Step 5.1: Update Root TypeScript Config
**Action:**
Edit root `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "references": [
    { "path": "./packages/shared" },
    { "path": "./packages/mcp" },
    { "path": "./packages/extension" }
  ],
  "files": []
}
```

**Test:**
```bash
tsc --build --dry
# Should show build order
```

**Success Criteria:**
- ✅ No syntax errors
- ✅ Shows shared → mcp + extension build order

---

#### Step 5.2: Update Package TypeScript Configs
**Action:**
Each package's `tsconfig.json` should reference dependencies:

`packages/mcp/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../shared" }
  ],
  "include": ["src/**/*"]
}
```

`packages/extension/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "composite": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "references": [
    { "path": "../shared" }
  ],
  "include": ["src/**/*"]
}
```

**Test:**
```bash
cd packages/mcp
tsc --build --dry
# Should show dependency on shared

cd ../extension
tsc --build --dry
# Should show dependency on shared
```

**Success Criteria:**
- ✅ TypeScript recognizes project references
- ✅ Build order correct

---

#### Step 5.3: Test Monorepo Build
**Action:**
```bash
cd <root>
npm run clean
npm run build
```

**Test:**
All packages should build in order: shared → mcp + extension

**Success Criteria:**
- ✅ Shared builds first
- ✅ MCP builds successfully
- ✅ Extension builds successfully
- ✅ No errors

---

#### Step 5.4: Test Monorepo Tests
**Action:**
```bash
npm run test
```

**Test:**
All test suites should run

**Success Criteria:**
- ✅ Shared tests pass
- ✅ MCP tests pass (or mostly pass)
- ✅ Extension tests pass (or mostly pass)
- ✅ No fatal errors

---

### Phase 5.5: Update CI/CD Pipelines (1-2 hours)

**Goal:** Update GitHub Actions workflows to build shared package, publish MCP to NPM, and maintain correct build order.

#### Current State
- `.github/workflows/ci.yml` - Runs tests for MCP and extension
- `.github/workflows/release.yml` - Publishes extension to VS Code Marketplace on version tags

#### Required Changes

##### Step 5.5.1: Update CI Workflow (`.github/workflows/ci.yml`)

**Action:**
- Add `@bctb/shared` package to build matrix
- Update build order: shared → mcp → extension
- Add shared package tests

**Changes:**
```yaml
jobs:
  test-shared:
    name: Test Shared Package
    runs-on: ubuntu-latest
    
    strategy:
      matrix:
        node-version: [20.x, 22.x]
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}
          cache: 'npm'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build Shared Package
        run: npm run build --workspace=packages/shared
      
      - name: Run Shared tests
        run: npm test --workspace=packages/shared
      
      - name: Run Shared tests with coverage
        run: npm run test:coverage --workspace=packages/shared
      
      - name: Upload Shared coverage to Codecov
        uses: codecov/codecov-action@v4
        with:
          files: ./packages/shared/coverage/coverage-final.json
          flags: shared
          name: shared-${{ matrix.node-version }}
        env:
          CODECOV_TOKEN: ${{ secrets.CODECOV_TOKEN }}

  test-mcp:
    name: Test MCP Backend
    runs-on: ubuntu-latest
    needs: test-shared  # MCP depends on shared
    
    # ... existing steps, but update build step:
      - name: Build Shared (required by MCP)
        run: npm run build --workspace=packages/shared
      
      - name: Build MCP
        run: npm run build --workspace=packages/mcp

  test-extension:
    name: Test VSCode Extension
    runs-on: ${{ matrix.os }}
    needs: test-shared  # Extension depends on shared
    
    # ... existing steps, but update build steps:
      - name: Build Shared (required by extension)
        run: npm run build --workspace=packages/shared
      
      - name: Build MCP (optional, for bundled scenario testing)
        run: npm run build --workspace=packages/mcp
        continue-on-error: true
      
      - name: Build Extension
        run: npm run build --workspace=packages/extension
```

**Test:**
```powershell
# Trigger CI workflow manually
git push origin feature/refactor-mcp
# Check GitHub Actions tab for green build
```

**Success Criteria:**
- ✅ All three packages (shared, mcp, extension) build successfully
- ✅ Shared package tests run before mcp/extension tests
- ✅ Code coverage uploaded for all three packages

##### Step 5.5.2: Add NPM Publishing Workflow (`.github/workflows/publish-npm.yml`)

**Action:**
- Create new workflow for publishing MCP package to NPM
- Trigger on tags matching `mcp-v*.*.*` pattern

**Create file `.github/workflows/publish-npm.yml`:**
```yaml
name: Publish MCP to NPM

on:
  push:
    tags:
      - 'mcp-v*.*.*'  # Trigger on MCP version tags (e.g., mcp-v1.0.0)
  workflow_dispatch:
    inputs:
      version:
        description: 'MCP version to publish (e.g., 1.0.0)'
        required: true
      tag:
        description: 'NPM dist-tag (latest, beta, next)'
        default: 'latest'
        required: true

jobs:
  build-and-test:
    name: Build and Test MCP
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build Shared Package
        run: npm run build --workspace=packages/shared
      
      - name: Build MCP Package
        run: npm run build --workspace=packages/mcp
      
      - name: Run MCP tests with coverage
        run: npm run test:coverage --workspace=packages/mcp
      
      - name: Verify package contents
        run: |
          cd packages/mcp
          npm pack --dry-run
          echo "Package contents preview above ☝️"
      
      - name: Upload MCP build artifacts
        uses: actions/upload-artifact@v4
        with:
          name: mcp-package
          path: |
            packages/mcp/dist/
            packages/mcp/package.json
            packages/mcp/README.md
            packages/mcp/LICENSE
          retention-days: 30

  publish-npm:
    name: Publish to NPM
    runs-on: ubuntu-latest
    needs: build-and-test
    permissions:
      contents: write
      id-token: write  # Required for NPM provenance
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20.x
          cache: 'npm'
          registry-url: 'https://registry.npmjs.org'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Build packages (shared + mcp)
        run: |
          npm run build --workspace=packages/shared
          npm run build --workspace=packages/mcp
      
      - name: Extract version from tag or input
        id: version
        run: |
          if [ "${{ github.event_name }}" = "workflow_dispatch" ]; then
            VERSION="${{ github.event.inputs.version }}"
            TAG="${{ github.event.inputs.tag }}"
          else
            VERSION="${GITHUB_REF#refs/tags/mcp-v}"
            TAG="latest"
          fi
          echo "version=$VERSION" >> $GITHUB_OUTPUT
          echo "tag=$TAG" >> $GITHUB_OUTPUT
      
      - name: Publish to NPM
        env:
          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}
        run: |
          cd packages/mcp
          npm publish --access public --tag ${{ steps.version.outputs.tag }} --provenance
      
      - name: Create GitHub Release
        uses: softprops/action-gh-release@v1
        with:
          tag_name: mcp-v${{ steps.version.outputs.version }}
          name: MCP Release ${{ steps.version.outputs.version }}
          body: |
            MCP package published to NPM 🚀
            
            📦 **Install:** `npm install -g bc-telemetry-buddy-mcp@${{ steps.version.outputs.version }}`
            
            See [CHANGELOG.md](https://github.com/waldo1001/waldo.BCTelemetryBuddy/blob/main/packages/mcp/CHANGELOG.md) for details.
          draft: false
          prerelease: ${{ steps.version.outputs.tag != 'latest' }}
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**Test:**
```powershell
# Test workflow manually (dry run)
git tag mcp-v0.1.0-test
git push origin mcp-v0.1.0-test
# Check GitHub Actions - should build but fail at publish (no NPM token yet)
git tag -d mcp-v0.1.0-test
git push origin :refs/tags/mcp-v0.1.0-test
```

**Success Criteria:**
- ✅ Workflow triggers on `mcp-v*.*.*` tags
- ✅ Shared and MCP packages build successfully
- ✅ Package contents validated with `npm pack --dry-run`
- ✅ Ready to publish to NPM (will work once NPM_TOKEN secret configured)

##### Step 5.5.3: Update Extension Release Workflow (`.github/workflows/release.yml`)

**Action:**
- Ensure extension workflow builds shared package first
- Keep existing marketplace publishing logic

**Changes:**
```yaml
jobs:
  build-and-test:
    name: Build and Test
    runs-on: ubuntu-latest
    
    steps:
      # ... existing checkout/setup steps ...
      
      - name: Run all tests
        run: |
          npm run test:coverage --workspace=packages/shared
          npm run test:coverage --workspace=packages/mcp
          npm run test:coverage --workspace=packages/extension
      
      - name: Build all packages
        run: |
          npm run build --workspace=packages/shared
          npm run build --workspace=packages/mcp  # Still build MCP for potential bundling tests
          npm run build --workspace=packages/extension
      
      # ... rest of workflow unchanged ...
```

**Test:**
```powershell
# Verify extension still publishes correctly
git tag v0.2.18-test
git push origin v0.2.18-test
# Check GitHub Actions - extension should build with shared package
git tag -d v0.2.18-test
git push origin :refs/tags/v0.2.18-test
```

**Success Criteria:**
- ✅ Extension builds with shared package dependency
- ✅ Extension publishes to marketplace as before
- ✅ No breaking changes to existing release process

##### Step 5.5.4: Configure GitHub Secrets

**Action:**
- Add NPM_TOKEN secret for publishing MCP to NPM registry

**Steps:**
1. Create NPM access token:
   - Go to https://www.npmjs.com/settings/{your-username}/tokens
   - Click "Generate New Token" → "Classic Token"
   - Select "Automation" type (for CI/CD publishing)
   - Copy the token (starts with `npm_...`)

2. Add to GitHub repository:
   - Go to https://github.com/waldo1001/waldo.BCTelemetryBuddy/settings/secrets/actions
   - Click "New repository secret"
   - Name: `NPM_TOKEN`
   - Value: paste the npm token
   - Click "Add secret"

3. Verify existing secrets:
   - `VSCE_PAT` - VS Code Marketplace token (already exists)
   - `CODECOV_TOKEN` - Codecov token (already exists)
   - `NPM_TOKEN` - NPM registry token (new)

**Test:**
```powershell
# Verify secret is accessible (doesn't print value)
# Trigger publish-npm workflow manually to test authentication
```

**Success Criteria:**
- ✅ NPM_TOKEN secret configured in GitHub repository
- ✅ Workflow can authenticate to NPM registry
- ✅ No tokens leaked in workflow logs

##### Step 5.5.5: Add Separate Tagging Strategy Documentation

**Action:**
- Document new tagging strategy for monorepo with multiple publishable packages

**Update `docs/CI-CD-Setup.md`:**
```markdown
## Tagging Strategy

This monorepo publishes two separate packages with different tag patterns:

### Extension Tags (VS Code Marketplace)
- **Pattern:** `v*.*.*` (e.g., `v0.2.17`, `v1.0.0`)
- **Triggers:** `.github/workflows/release.yml`
- **Publishes:** VSCode extension to marketplace
- **Example:**
  ```bash
  git tag v0.2.17
  git push origin v0.2.17
  ```

### MCP Tags (NPM Registry)
- **Pattern:** `mcp-v*.*.*` (e.g., `mcp-v1.0.0`, `mcp-v1.1.2`)
- **Triggers:** `.github/workflows/publish-npm.yml`
- **Publishes:** MCP package to NPM
- **Example:**
  ```bash
  git tag mcp-v1.0.0
  git push origin mcp-v1.0.0
  ```

### Manual Releases
Both workflows support manual triggering via `workflow_dispatch`:

**Extension:**
```bash
# Go to GitHub Actions → Release → Run workflow
# Input: version (e.g., 0.2.17), prerelease (true/false)
```

**MCP:**
```bash
# Go to GitHub Actions → Publish MCP to NPM → Run workflow
# Input: version (e.g., 1.0.0), tag (latest/beta/next)
```

### Version Coordination
- Extension and MCP versions are **independent**
- Extension version lives in `packages/extension/package.json`
- MCP version lives in `packages/mcp/package.json`
- Shared package is **private** (not published), version in `packages/shared/package.json`
```

**Test:**
- Read documentation to verify clarity

**Success Criteria:**
- ✅ Clear tagging patterns documented
- ✅ Manual release instructions provided
- ✅ Version independence explained

---

### Phase 6: Update Documentation (2 hours)

#### Step 6.1: Create MCP README
**Action:**
Create `packages/mcp/README.md` with installation, configuration, and usage instructions (see main plan for template)

**Test:**
```bash
cat packages/mcp/README.md | head -n 50
# Should show installation instructions
```

**Success Criteria:**
- ✅ README created
- ✅ Installation section present
- ✅ Configuration examples present
- ✅ Usage scenarios documented

---

#### Step 6.2: Update Extension README
**Action:**
Edit `packages/extension/README.md` to focus on extension features and link to MCP docs for AI features

**Test:**
```bash
cat packages/extension/README.md | grep -i "mcp"
# Should mention MCP is optional
```

**Success Criteria:**
- ✅ README updated
- ✅ Mentions MCP is optional
- ✅ Links to MCP package

---

#### Step 6.3: Create Shared Package README
**Action:**
Create `packages/shared/README.md`:
```markdown
# BC Telemetry Buddy - Shared Core

This package contains shared business logic used by both the MCP server and VSCode extension.

**Note:** This is a private package, not published to NPM.

## Purpose

- Authentication (Azure AD flows)
- Kusto query execution
- Caching
- Query management
- Data sanitization
- Event lookup

## Usage

Only used internally by `@bctb/mcp` and `bc-telemetry-buddy` extension.

## Development

```bash
npm run build    # Build
npm test         # Run tests
npm run dev      # Watch mode
```
```

**Test:**
```bash
cat packages/shared/README.md
```

**Success Criteria:**
- ✅ README explains purpose
- ✅ Mentions it's private

---

### Phase 7: Test & Validate (2 hours)

#### Step 7.1: End-to-End Test - MCP Standalone
**Action:**
```bash
# Create a test config
cd /tmp
bctb-mcp init
# Edit .bctb-config.json with real credentials

# Test auth
bctb-mcp test-auth

# Start server (in separate terminal)
bctb-mcp start --http
```

**Test:**
In another terminal:
```bash
curl http://localhost:52345/health
# Should return: {"status":"ok"}
```

**Success Criteria:**
- ✅ MCP starts successfully
- ✅ Health endpoint responds
- ✅ Authentication works

---

#### Step 7.2: End-to-End Test - Extension Without MCP
**Action:**
1. Open VSCode
2. Press F5 to launch Extension Development Host
3. Run command: "BC Telemetry Buddy: Run KQL Query"
4. Enter a simple KQL query

**Test:**
Query should execute directly (without MCP)

**Success Criteria:**
- ✅ Extension activates
- ✅ Commands work without MCP
- ✅ Can execute KQL directly

---

#### Step 7.3: End-to-End Test - Extension With MCP
**Action:**
1. In Extension Development Host, check if MCP installed
2. If not, extension should offer to install
3. After installing, test chat participant: `@bc-telemetry-buddy show errors`

**Test:**
Chat participant should communicate with MCP

**Success Criteria:**
- ✅ MCP installer works
- ✅ Chat participant connects to MCP
- ✅ Can query via chat

---

#### Step 7.4: Regression Testing
**Action:**
Run all existing tests:
```bash
npm run test
```

Check coverage:
```bash
cd packages/shared && npm run test:coverage
cd ../mcp && npm run test:coverage
cd ../extension && npm run test:coverage
```

**Test:**
Review coverage reports

**Success Criteria:**
- ✅ All tests pass (or ≥95% pass)
- ✅ Coverage ≥80% for shared package
- ✅ No critical regressions

---

### Phase 8: Local Testing Without Publishing (1 hour)

**CRITICAL:** Test everything locally before publishing to npm/marketplace!

#### Step 8.1: Test MCP as Global Package (npm link)
**Action:**
```bash
cd packages/mcp
npm run build

# Link globally (simulates global npm install without publishing)
npm link
```

**Test:**
```bash
# Check that bctb-mcp is now available globally
which bctb-mcp  # On Mac/Linux
where bctb-mcp  # On Windows

# Test all CLI commands
bctb-mcp --version
bctb-mcp --help

# Create test config in temp directory
cd /tmp  # or C:\Temp on Windows
bctb-mcp init --output test-config.json
cat test-config.json

# Validate config
bctb-mcp validate --config test-config.json
# Expected: validation errors (template has placeholders)
```

**Success Criteria:**
- ✅ `bctb-mcp` command available globally
- ✅ All CLI commands work
- ✅ Config file creation works
- ✅ Validation works

---

#### Step 8.2: Test MCP Server Startup (Local)
**Action:**
Edit the test config file created in previous step with real credentials:
```bash
# Edit /tmp/test-config.json or C:\Temp\test-config.json
# Add your real Azure credentials
```

Start MCP server in HTTP mode (easier to test):
```bash
bctb-mcp start --http --config /tmp/test-config.json
```

**Test:**
In another terminal:
```bash
# Health check
curl http://localhost:52345/health

# Test auth status
curl http://localhost:52345/auth/status

# Test tools list (JSON-RPC)
curl -X POST http://localhost:52345/rpc \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"tools/list","id":1}'

# Should return list of MCP tools
```

**Success Criteria:**
- ✅ Server starts without errors
- ✅ Health endpoint responds
- ✅ Auth status works
- ✅ Tools list returns all MCP tools
- ✅ No authentication errors (if credentials correct)

Stop the server (Ctrl+C) before continuing.

---

#### Step 8.3: Test Extension Loading MCP (Local)
**Action:**
1. Open VSCode
2. Press F5 to launch Extension Development Host
3. Open Command Palette (`Ctrl+Shift+P`)
4. Run: "BC Telemetry Buddy: Check MCP Server Status"

**Test:**
Should detect that `bctb-mcp` is installed (via `npm link`)

**Success Criteria:**
- ✅ Extension recognizes globally linked MCP
- ✅ Shows correct version
- ✅ Status command works

---

#### Step 8.4: Test Extension Direct KQL (Without MCP)
**Action:**
In Extension Development Host:
1. Stop any running MCP servers
2. Temporarily unlink MCP: `npm unlink -g bc-telemetry-buddy-mcp`
3. Run command: "BC Telemetry Buddy: Run KQL Query"
4. Enter a simple query: `traces | take 10`

**Test:**
Query should execute directly using extension's TelemetryService (no MCP)

**Success Criteria:**
- ✅ Extension works without MCP installed
- ✅ Can execute KQL directly
- ✅ Results display correctly
- ✅ No MCP-related errors

After testing, re-link MCP: `cd packages/mcp && npm link`

---

#### Step 8.5: Test Extension Chat Participant with MCP (Local)
**Action:**
1. Make sure MCP is linked globally: `cd packages/mcp && npm link`
2. Start MCP server in background:
   ```bash
   bctb-mcp start --http --config /tmp/test-config.json &
   ```
3. In Extension Development Host, open Copilot Chat
4. Ask: `@bc-telemetry-buddy show me available events`

**Test:**
Chat participant should communicate with locally running MCP server

**Success Criteria:**
- ✅ Chat participant connects to MCP
- ✅ Can execute MCP tools
- ✅ Returns results from telemetry
- ✅ No connection errors

---

#### Step 8.6: Test MCP with Claude Desktop (Local)
**Action:**
Configure Claude Desktop to use your local MCP:

Edit Claude Desktop config:
- Mac: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Add:
```json
{
  "mcpServers": {
    "bc-telemetry-local": {
      "command": "bctb-mcp",
      "args": ["start", "--config", "/tmp/test-config.json", "--stdio"]
    }
  }
}
```

Restart Claude Desktop.

**Test:**
Ask Claude: "What MCP tools do you have available?"
Should list BC Telemetry Buddy tools.

Ask Claude: "Show me telemetry events from the last hour"

**Success Criteria:**
- ✅ Claude Desktop recognizes local MCP
- ✅ Can use MCP tools
- ✅ Returns telemetry data
- ✅ No errors in Claude

---

#### Step 8.7: Test npm pack (Simulates Publishing)
**Action:**
```bash
cd packages/mcp
npm pack
```

This creates a `.tgz` file that simulates what would be published to npm.

**Test:**
```bash
# Extract and inspect
tar -tzf bc-telemetry-buddy-mcp-1.0.0.tgz

# Should show:
# package/dist/
# package/config-schema.json
# package/README.md
# package/LICENSE
# package/package.json

# Should NOT show:
# package/src/
# package/__tests__/
# package/node_modules/
```

**Success Criteria:**
- ✅ Only dist/ and documentation files included
- ✅ No source code or tests
- ✅ Package size reasonable (<500KB)

---

#### Step 8.8: Test Installing from Local Package
**Action:**
```bash
# Unlink global MCP first
npm unlink -g bc-telemetry-buddy-mcp

# Install from the .tgz file
npm install -g ./bc-telemetry-buddy-mcp-1.0.0.tgz
```

**Test:**
```bash
# Should work exactly like before
bctb-mcp --version
bctb-mcp init --output /tmp/test2.json
bctb-mcp start --config /tmp/test-config.json --http
```

**Success Criteria:**
- ✅ Installs successfully from .tgz
- ✅ All commands work
- ✅ Identical to npm linked version

Clean up:
```bash
npm uninstall -g bc-telemetry-buddy-mcp
cd packages/mcp && npm link  # Re-link for development
```

---

#### Step 8.9: Test Extension .vsix Package (Local Install)
**Action:**
```bash
cd packages/extension
npm run build

# Package extension (creates .vsix file)
npx @vscode/vsce package
```

**Test:**
```bash
# Install the .vsix file in VSCode
code --install-extension bc-telemetry-buddy-*.vsix

# Or manually: VSCode → Extensions → ... → Install from VSIX
```

Restart VSCode, then:
1. Extension should activate automatically
2. Check output panel: "BC Telemetry Buddy"
3. Run command: "BC Telemetry Buddy: Setup Wizard"
4. Test KQL execution
5. Test chat participant

**Success Criteria:**
- ✅ `.vsix` file created
- ✅ Extension installs successfully
- ✅ Extension activates
- ✅ All commands available
- ✅ Direct KQL works
- ✅ Chat participant works (with MCP)

Uninstall test version:
```bash
code --uninstall-extension waldoBC.bc-telemetry-buddy
```

---

#### Step 8.10: Full Integration Test (All Components)
**FINAL TEST:** Test complete workflow as an end user would experience it.

**Scenario 1: Fresh Install (MCP not installed)**
```bash
# Unlink/uninstall MCP
npm unlink -g bc-telemetry-buddy-mcp

# Install extension from .vsix
code --install-extension bc-telemetry-buddy-*.vsix
```

1. Open VSCode (new window)
2. Extension should show: "MCP not installed" notification
3. Click "Install MCP"
4. Verify extension runs `npm install -g bc-telemetry-buddy-mcp`
5. Run Setup Wizard
6. Test direct KQL (should work)
7. Test chat participant (should work after MCP installed)

**Scenario 2: Existing User (Migration)**
Simulate upgrade from old version:
1. Keep old VSCode settings (port, credentials)
2. Install new extension
3. Should show migration prompt
4. Should offer to install MCP
5. Should migrate settings to `.bctb-config.json`

**Scenario 3: Claude Desktop User**
1. No VSCode extension
2. Install MCP globally: `npm install -g ./bc-telemetry-buddy-mcp-1.0.0.tgz`
3. Create config: `bctb-mcp init`
4. Configure Claude Desktop
5. Test in Claude

**Success Criteria:**
- ✅ All three scenarios work end-to-end
- ✅ No errors in any scenario
- ✅ User experience smooth
- ✅ Migration preserves functionality

---

### Phase 9: Publish & Deploy (Only After Local Testing Succeeds)

**PREREQUISITES:**
- ✅ All Phase 8 tests passed
- ✅ Final validation checklist complete
- ✅ Documentation reviewed
- ✅ CHANGELOG updated

#### Step 9.1: Publish MCP to NPM (Real)
**Action:**
```bash
cd packages/mcp

# Double-check version
npm version

# Build clean
npm run clean
npm run build

# Publish
npm publish --access public
```

**Test:**
```bash
# Wait 1-2 minutes for npm to index
npm view bc-telemetry-buddy-mcp

# Install globally from npm (clean test)
npm unlink -g bc-telemetry-buddy-mcp
npm install -g bc-telemetry-buddy-mcp

# Verify
bctb-mcp --version
```

**Success Criteria:**
- ✅ Published successfully
- ✅ Visible on npmjs.com
- ✅ Can be installed globally
- ✅ Works identically to local version

---

#### Step 9.2: Publish Extension to Marketplace
**Action:**
```bash
cd packages/extension

# Ensure clean build
npm run clean
npm run build

# Package
npx @vscode/vsce package

# Publish
npx @vscode/vsce publish
```

**Test:**
1. Wait 5-10 minutes for marketplace processing
2. Search VSCode marketplace for "BC Telemetry Buddy"
3. Install from marketplace
4. Verify functionality

**Success Criteria:**
- ✅ Extension appears in marketplace
- ✅ Can be installed via marketplace
- ✅ Works identically to .vsix version

---

#### Step 9.3: Create GitHub Release
**Action:**
```bash
# Tag release
git tag v2.0.0
git push origin v2.0.0
```

Create GitHub release with:
- Release notes from CHANGELOG
- Link to npm package
- Link to marketplace
- Migration guide

**Success Criteria:**
- ✅ GitHub release created
- ✅ Assets uploaded (optional: .vsix file)
- ✅ Release notes complete

---

### Final Validation Checklist

Before considering the refactoring complete, verify:

**Functional Requirements:**
- [ ] MCP can be installed globally via npm
- [ ] MCP works standalone (Claude Desktop, etc.)
- [ ] Extension works without MCP (direct KQL)
- [ ] Extension can install MCP for users
- [ ] Extension + MCP integration works (chat participant)
- [ ] Configuration via `.bctb-config.json` works
- [ ] Configuration via VSCode settings works
- [ ] All authentication flows work (azure_cli, device_code, client_credentials)

**Technical Requirements:**
- [ ] Shared package builds successfully
- [ ] MCP package builds successfully
- [ ] Extension package builds successfully
- [ ] All tests pass (≥95%)
- [ ] TypeScript project references work
- [ ] npm workspaces configured correctly
- [ ] No code duplication (DRY principle)

**Documentation Requirements:**
- [ ] MCP README complete with examples
- [ ] Extension README updated
- [ ] Shared package README created
- [ ] User guide updated
- [ ] Migration guide created
- [ ] CHANGELOG updated

**Publishing Requirements:**
- [ ] MCP published to npm
- [ ] Extension packaged as .vsix
- [ ] Extension published to marketplace
- [ ] GitHub release created
- [ ] Release notes published

---

### Rollback Plan

If critical issues are discovered after deployment:

**Rollback MCP:**
```bash
npm unpublish bc-telemetry-buddy-mcp@1.0.0
# Requires npm ownership and within 72 hours
```

**Rollback Extension:**
1. Unpublish from marketplace (contact VS Code team)
2. Republish previous version

**Rollback Code:**
```bash
git revert <commit-hash>
git push
```

---

### Post-Refactoring Monitoring

After deployment, monitor:

1. **NPM Download Stats:**
   ```bash
   npm info bc-telemetry-buddy-mcp
   ```

2. **Extension Installation Stats:**
   Check VS Code Marketplace analytics

3. **GitHub Issues:**
   Monitor for user-reported issues

4. **Error Telemetry:**
   Check extension error logs (if implemented)

---

## Feasibility Review Corrections

**Review Date:** 2025-11-17  
**Status:** ✅ FEASIBLE WITH CORRECTIONS APPLIED

### Critical Issues Fixed

#### 1. ✅ Config Types Moved to Shared Package (CRITICAL)

**Problem:** Step 2.7 barrel export referenced non-existent `./config.js` file in shared package

**Solution Applied:** Updated Step 2.1 to create `types.ts` first with MCPConfig and ProfiledConfig interfaces

**Changes:**
- Created `packages/shared/src/types.ts` with config interfaces (single source of truth)
- Updated Step 2.7 barrel export to `export * from './types.js'` instead of `config.js`
- MCP and Extension both import types from `@bctb/shared`

**Impact:** Prevents build failure in Phase 2 Step 2.7

---

#### 2. ✅ MCP Restart Mechanism Clarified (MODERATE)

**Problem:** ProfileManager.restartMCP() method had no implementation details

**Solution Applied:** Kill/Spawn Process Approach (Cleanest Option)

**Implementation Added:**
```typescript
/**
 * Restart MCP process with new profile
 * Implementation: Kill existing process and spawn new one with updated env var
 * 
 * CLEANEST APPROACH: Kill/Spawn Process
 * - Extension maintains reference to MCP child process
 * - On profile switch: kill process, spawn new one with BCTB_PROFILE env var
 * - VSCode MCP client automatically reconnects when process restarts
 * - Restart time: 2-10 seconds depending on auth flow
 */
private async restartMCP(): Promise<void> {
  // Step 1: Kill existing MCP process (SIGTERM with fallback to SIGKILL)
  // Step 2: Spawn new process with updated BCTB_PROFILE env var
  // Step 3: Wait for initialization message on stdout
  // VSCode reconnects automatically
}
```

**Changes:**
- Added full `restartMCP()` implementation in ProfileManager
- Extension maintains child_process reference
- Graceful shutdown with 2-second timeout, force kill if needed
- Wait for MCP initialization message (max 10 seconds)
- VSCode MCP client auto-reconnects to new process

**Impact:** Clear implementation path for profile switching, realistic 2-10 second restart time

---

#### 3. ✅ Config Conflict Detection Added (MODERATE)

**Problem:** No warning when both `.bctb-config.json` and VSCode settings exist

**Solution Applied:** Added `checkConfigConflicts()` method to ProfileManager

**Implementation Added:**
```typescript
/**
 * Detect and warn about dual config source conflicts
 * Shows warning if both .bctb-config.json and VSCode settings exist
 */
private checkConfigConflicts(): void {
  const hasConfigFile = fs.existsSync(this.configPath);
  const hasVSCodeSettings = vscode.workspace.getConfiguration('bcTelemetryBuddy').has('tenantId');
  
  if (hasConfigFile && hasVSCodeSettings) {
    vscode.window.showWarningMessage(
      '⚠️ Dual configuration detected! Using .bctb-config.json (file takes precedence). ' +
      'Consider removing VSCode settings to avoid confusion.',
      'View Docs', 'Dismiss'
    );
  }
}
```

**Changes:**
- Added conflict detection on config load
- Shows warning banner with "View Docs" link
- Documents precedence rules clearly
- Called automatically from `loadConfig()`

**Impact:** Users warned about conflicting configurations, can take action to clean up

---

#### 4. ✅ Config Precedence Rules Documented (MODERATE)

**Problem:** No clear precedence when multiple config sources exist

**Solution Applied:** Added detailed precedence section to Configuration Architecture

**Documentation Added:**

**Configuration Source Precedence:**
1. `.bctb-config.json` file (WINS) - Primary source of truth
   - Workspace file > User file
2. VSCode Settings - Legacy fallback (deprecated)
   - Only used if no config file exists
3. Environment Variables - Override specific values
   - `BCTB_PROFILE`, `AZURE_TENANT_ID`, etc.

**Conflict Detection:** Extension warns when dual sources exist

**Impact:** Clear, unambiguous rules for which config source wins

---

### Testing Gaps Filled

#### 5. ✅ Profile Switching Race Condition Test (MINOR)

**Added to Phase 7 Extension Tests:**
```typescript
it('should handle profile switch during active query', async () => {
  // Start long-running query
  const queryPromise = telemetryService.executeQuery('traces | where timestamp > ago(30d)', 'production');
  
  // Switch profile mid-query
  await manager.switchProfile('staging');
  
  // Original query cancelled
  await expect(queryPromise).rejects.toThrow('Query cancelled: profile switched');
  
  // New queries use new profile
  const newResult = await telemetryService.executeQuery('traces | count', 'staging');
  expect(newResult.profile).toBe('staging');
});
```

**Impact:** Ensures queries don't leak across profile switches

---

#### 6. ✅ Circular Dependency Detection Test (MINOR)

**Added to Phase 7 MCP Tests:**
```typescript
it('should detect circular profile inheritance', () => {
  const config = {
    profiles: {
      a: { extends: 'b', cluster: 'https://a.kusto.windows.net' },
      b: { extends: 'c', database: 'bdb' },
      c: { extends: 'a', tenantId: 'tenant-c' } // Circular!
    }
  };
  
  expect(() => resolveProfile('a', config))
    .toThrow('Circular dependency detected in profile inheritance: a -> b -> c -> a');
});
```

**Impact:** Prevents infinite loops in profile resolution

---

#### 7. ✅ Deep Merge Test (MINOR)

**Added to Phase 7 MCP Tests:**
```typescript
it('should deep merge nested profile objects', () => {
  const config = {
    profiles: {
      base: {
        cluster: 'https://base.kusto.windows.net',
        advanced: { cacheTTL: 3600, retryAttempts: 3, timeout: 30000 }
      },
      derived: {
        extends: 'base',
        advanced: { cacheTTL: 7200, customOption: true }
      }
    }
  };
  
  const resolved = resolveProfile('derived', config);
  expect(resolved.advanced).toEqual({
    cacheTTL: 7200,        // Overridden
    retryAttempts: 3,      // Inherited
    timeout: 30000,        // Inherited
    customOption: true     // Added
  });
});
```

**Impact:** Validates deep merge algorithm works correctly

---

### Time Estimate Updated

**Original:** 17-20 hours  
**Revised:** 22-28 hours

**Breakdown with Corrections:**
- Phase 1: 30 minutes
- Phase 2: 3-4 hours (includes config types setup)
- Phase 3: 4-5 hours (includes MCP restart + conflict detection)
- Phase 4: 2-3 hours
- Phase 5: 1-2 hours
- Phase 6: 2-3 hours
- Phase 7: 4-5 hours (includes 3 new test cases)
- Phase 8: 2-3 hours

**Why Revised:**
- +1 hour: Config types moved to shared (Step 2.1)
- +1 hour: MCP restart mechanism implementation (ProfileManager)
- +0.5 hour: Config conflict detection (checkConfigConflicts)
- +1.5 hours: Three additional test cases (race condition, circular deps, deep merge)
- +1 hour: Documentation updates (precedence rules, restart timing)

**Total Added:** +5 hours (reasonable buffer for corrections)

---

### All Corrections Applied ✅

1. ✅ **Config types** → Moved to `packages/shared/src/types.ts` (Phase 2 Step 2.1)
2. ✅ **MCP restart** → Kill/spawn process implementation with child_process (Phase 3 Step 3.6)
3. ✅ **Config conflicts** → `checkConfigConflicts()` warns on dual sources (Phase 3 ProfileManager)
4. ✅ **Config precedence** → Documented file > settings > env vars (Configuration Architecture)
5. ✅ **Testing gaps** → Added race condition, circular deps, deep merge tests (Phase 7)
6. ✅ **Time estimate** → Updated to 22-28 hours (+5 hours for corrections)

**Verdict:** Plan is now ready for implementation. All blocking issues resolved.

---

**Last Updated:** 2025-11-17  
**Status:** ✅ Planning Complete - Ready for Implementation  
**Next Steps:** Begin Phase 1 - Create Workspace Structure
