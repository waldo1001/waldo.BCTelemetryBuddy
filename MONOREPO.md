# Monorepo Structure

This document provides an overview of the BC Telemetry Buddy monorepo structure.

## Directory Layout

```
waldo.BCTelemetryBuddy/
├── .github/
│   └── copilot-instructions.md      # Copilot AI instructions
├── docs/
│   ├── DesignWalkthrough.md         # Design evolution for presentation
│   ├── CHANGELOG.md                 # Overall project changes
│   └── PromptLog.md                 # Sequential prompt history
├── Instructions/
│   └── Instructions.md              # Technical implementation reference
├── packages/
│   ├── mcp/                         # MCP Backend Server
│   │   ├── src/                     # Source files (to be implemented)
│   │   ├── package.json             # MCP dependencies (Express, MSAL, Jest)
│   │   ├── tsconfig.json            # TypeScript config (ES2022 + ESM)
│   │   ├── jest.config.js           # Jest test configuration
│   │   └── CHANGELOG.md             # MCP version history
│   └── extension/                   # VSCode Extension
│       ├── src/                     # Source files (to be implemented)
│       ├── package.json             # Extension manifest + dependencies
│       ├── tsconfig.json            # TypeScript config (CommonJS for VSCode)
│       └── CHANGELOG.md             # Extension version history
├── package.json                     # Root package with npm workspaces
├── tsconfig.json                    # Root TypeScript config
├── .gitignore                       # Git ignore rules
└── README.md                        # Project overview

```

## Key Files

### Root Configuration

- **package.json**: Defines npm workspaces, build scripts, and shared dev dependencies
- **tsconfig.json**: Base TypeScript config (ES2022 + ESM) extended by packages
- **.gitignore**: Excludes node_modules, dist, cache, secrets, and telemetry data

### MCP Backend (`packages/mcp/`)

- **Type**: ES Module (ESM)
- **Target**: ES2022
- **Dependencies**: Express, @azure/msal-node, axios, lru-cache
- **Test Framework**: Jest with ts-jest
- **Scripts**: `build`, `dev` (watch mode), `start`, `test`, `clean`

### VSCode Extension (`packages/extension/`)

- **Type**: CommonJS (VSCode requirement)
- **Target**: ES2022
- **Dependencies**: axios, @types/vscode
- **Test Framework**: VSCode test-electron
- **Scripts**: `build`, `dev` (watch mode), `test`, `package` (vsce), `clean`
- **Extension Manifest**: Includes all commands and configuration settings

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

## Next Steps

1. ✅ Monorepo structure created
2. ⏭️ Create UserGuide.md (user documentation)
3. ⏭️ Implement MCP backend source files
4. ⏭️ Implement VSCode extension source files
5. ⏭️ Write tests for both packages
6. ⏭️ Package extension for marketplace

## Documentation

All changes are logged to:
- `docs/PromptLog.md` - Every prompt (#1-27)
- `docs/DesignWalkthrough.md` - Design decisions with [Prompt #N] references
- `docs/CHANGELOG.md` - Timestamped overall changes
- `packages/mcp/CHANGELOG.md` - MCP version history (semantic versioning)
- `packages/extension/CHANGELOG.md` - Extension version history (semantic versioning)
