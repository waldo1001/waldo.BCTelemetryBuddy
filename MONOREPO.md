# Monorepo Structure

This document provides an overview of the BC Telemetry Buddy monorepo structure.

## Directory Layout

```
waldo.BCTelemetryBuddy/
├── .github/
│   ├── copilot-instructions.md      # Copilot AI instructions and development rules
│   └── workflows/                   # GitHub Actions CI/CD pipelines
├── docs/
│   ├── BADGES.md                    # GitHub Actions badge documentation
│   ├── CHANGELOG.md                 # Overall project changes (release-focused)
│   ├── CI-CD-Setup.md               # CI/CD pipeline documentation
│   ├── DesignWalkthrough.md         # Design evolution for presentation
│   ├── E2E-Copilot-TestScript.md    # End-to-end Copilot testing guide
│   ├── PromptLog.md                 # Sequential prompt history (all prompts)
│   ├── TODO.md                      # Project backlog and future enhancements
│   └── UserGuide.md                 # Complete user documentation (installation, setup, usage)
├── Instructions/
│   ├── Instructions.md              # Technical implementation reference (current)
│   └── Instructions.original.md     # Original implementation spec (archived)
├── packages/
│   ├── mcp/                         # MCP Backend Server
│   │   ├── src/
│   │   │   ├── auth.ts              # MSAL authentication (Azure CLI, Device Code, Client Creds)
│   │   │   ├── cache.ts             # File-based result caching with TTL
│   │   │   ├── config.ts            # Configuration loading and validation
│   │   │   ├── kusto.ts             # Application Insights/Kusto query execution
│   │   │   ├── queries.ts           # Query library management (save/load/search)
│   │   │   ├── references.ts        # External reference fetching (GitHub, web)
│   │   │   ├── sanitize.ts          # Optional PII sanitization
│   │   │   ├── server.ts            # MCP server (JSON-RPC + HTTP modes)
│   │   │   └── __tests__/           # 311 unit tests (83%+ coverage)
│   │   ├── coverage/                # Test coverage reports (codecov.io)
│   │   ├── package.json             # MCP dependencies (Express, MSAL, Jest)
│   │   ├── tsconfig.json            # TypeScript config (ES2022 + ESM)
│   │   ├── jest.config.js           # Jest test configuration
│   │   ├── launcher.js              # MCP process launcher
│   │   ├── CHANGELOG.md             # MCP version history (semantic versioning)
│   │   └── README.md                # MCP backend documentation
│   └── extension/                   # VSCode Extension
│       ├── src/
│       │   ├── extension.ts         # Extension entry point and command registration
│       │   ├── mcpClient.ts         # MCP HTTP client (JSON-RPC)
│       │   ├── resultsWebview.ts    # Rich query results display
│       │   ├── webviews/
│       │   │   └── SetupWizardProvider.ts  # 5-step setup wizard
│       │   ├── __tests__/           # Extension unit tests
│       │   └── test/                # VSCode integration tests
│       ├── coverage/                # Test coverage reports
│       ├── images/                  # Extension icons and assets
│       ├── mcp/dist/                # Bundled MCP server (copied during build)
│       ├── package.json             # Extension manifest + dependencies (10 MCP tools)
│       ├── tsconfig.json            # TypeScript config (CommonJS for VSCode)
│       ├── jest.config.js           # Jest test configuration
│       ├── language-configuration.json  # KQL syntax highlighting
│       ├── CHANGELOG.md             # Extension version history (semantic versioning)
│       └── README.md                # Extension documentation
├── scripts/
│   └── release.ps1                  # Automated release workflow (version bump, tag, push)
├── package.json                     # Root package with npm workspaces
├── tsconfig.json                    # Root TypeScript config
├── .gitignore                       # Git ignore rules (cache, secrets, node_modules)
├── LICENSE                          # MIT License
├── MONOREPO.md                      # This file - monorepo documentation
└── README.md                        # Project overview (badges, features, quick start)

```

## Key Files

### Root Configuration

- **package.json**: Defines npm workspaces, build scripts, and shared dev dependencies
- **tsconfig.json**: Base TypeScript config (ES2022 + ESM) extended by packages
- **.gitignore**: Excludes node_modules, dist, cache, secrets, and telemetry data

### MCP Backend (`packages/mcp/`)

- **Type**: ES Module (ESM)
- **Target**: ES2022
- **Dependencies**: Express, @azure/msal-node, axios, and more
- **Test Framework**: Jest with ts-jest (311 tests, 83%+ coverage)
- **Implements**: 10 MCP tools for Copilot (event discovery, query execution, query library, cache management)
- **Features**: 
  - Azure CLI / Device Code / Client Credentials authentication
  - Event Catalog & Schema Discovery
  - Tenant mapping (company name → Azure tenant ID)
  - File-based caching with TTL
  - External reference fetching (GitHub repos)
  - Optional PII sanitization
- **Scripts**: `build`, `dev` (watch mode), `start`, `test`, `test:coverage`, `clean`

### VSCode Extension (`packages/extension/`)

- **Type**: CommonJS (VSCode requirement)
- **Target**: ES2022
- **Version**: 0.2.10 (published to marketplace)
- **Publisher**: waldoBC
- **Dependencies**: axios, @azure/msal-node, @types/vscode
- **Test Framework**: Jest + VSCode test-electron
- **Features**:
  - 🧙 Setup Wizard (5-step guided configuration)
  - 8 commands (Setup, Run Query, Save Query, Cache Management, etc.)
  - CodeLens support for .kql files ("▶ Run Query")
  - Rich results webview with tables and recommendations
  - 13 Language Model Tools exposed to Copilot
  - KQL syntax highlighting
- **Scripts**: `build`, `dev` (watch mode), `test`, `test:coverage`, `package` (vsce), `clean`, `copy-mcp`
- **Extension Manifest**: Complete with commands, settings, MCP tools, and language support

## Build Commands

From root directory:

```powershell
# Install all dependencies
npm install

# Build both packages
npm run build

# Run all tests
npm test

# Clean all build outputs
npm run clean

# Development (watch mode)
npm run dev:mcp        # MCP backend only
npm run dev:extension  # Extension only
```

## Project Status

### Completed ✅
1. ✅ Monorepo structure created
2. ✅ UserGuide.md (comprehensive user documentation)
3. ✅ MCP backend fully implemented (8 source files, 311 tests, 83%+ coverage)
4. ✅ VSCode extension fully implemented (commands, webviews, MCP integration)
5. ✅ Tests for both packages (unit + integration)
6. ✅ Extension packaged and published to marketplace (v0.2.10)
7. ✅ CI/CD pipelines (GitHub Actions: CI, Release, CodeQL, CodeCov)
8. ✅ Setup Wizard (5-step guided configuration with validation)
9. ✅ 10 MCP tools exposed to GitHub Copilot
10. ✅ Event Catalog & Schema Discovery features
11. ✅ Tenant Mapping (customer-specific queries)
12. ✅ Comprehensive documentation (README, UserGuide, component docs)

### Active Features
- **Authentication**: Azure CLI (default), Device Code, Client Credentials
- **Discovery**: Event Catalog, Event Schema, Tenant Mapping
- **Query Execution**: Natural language (via Copilot) and direct KQL
- **Query Library**: Save, search, organize by category and customer
- **CodeLens**: One-click query execution in .kql files
- **Caching**: File-based with configurable TTL and management commands
- **Results**: Rich webview with tables, charts, and recommendations

## Documentation

### User Documentation
- **`README.md`** - Project overview, quick start, features, development setup
- **`docs/UserGuide.md`** - Complete user guide (installation, setup wizard, authentication, querying, Copilot integration, troubleshooting)
- **`packages/extension/README.md`** - Extension-specific documentation for marketplace
- **`packages/mcp/README.md`** - MCP backend documentation (tools, workflow, configuration)

### Developer Documentation
- **`Instructions/Instructions.md`** - Technical implementation specifications
- **`docs/DesignWalkthrough.md`** - Design evolution and decisions with [Entry: GUID] references
- **`docs/E2E-Copilot-TestScript.md`** - End-to-end testing guide for Copilot integration
- **`docs/CI-CD-Setup.md`** - CI/CD pipeline documentation
- **`.github/copilot-instructions.md`** - Development rules and logging workflow for AI assistance

### Change Tracking
- **`docs/PromptLog.md`** - Every user prompt logged with GUID-based Entry IDs (chronological record)
- **`docs/CHANGELOG.md`** - Project-level changes (release-focused)
- **`packages/mcp/CHANGELOG.md`** - MCP version history (semantic versioning)
- **`packages/extension/CHANGELOG.md`** - Extension version history (semantic versioning)

### Additional Documentation
- **`docs/TODO.md`** - Project backlog and future enhancements
- **`docs/BADGES.md`** - GitHub Actions badge documentation
- **`MONOREPO.md`** - This file - monorepo structure and organization
