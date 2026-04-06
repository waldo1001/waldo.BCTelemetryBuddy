---
name: tdd-workflow
description: 'Test-Driven Development workflow for BC Telemetry Buddy. Enforces design-first, test-first development cycle. Use when: adding features, fixing bugs, refactoring code, or implementing new MCP tools/handlers/services.'
---

# TDD Workflow for BC Telemetry Buddy

## When to Use
- Implementing new MCP tools (toolDefinitions + toolHandlers)
- Adding extension commands or services
- Adding shared library functionality
- Fixing bugs (reproduce with test first)
- Refactoring existing code
- Any code change that touches packages/shared, packages/mcp, or packages/extension

## HARD GATE — Read this before touching any file

**DO NOT write or edit any source code until you have output a DESIGN block and received explicit user approval.**

This means: read the relevant files, understand the problem, form your plan — then output the DESIGN block and stop. Wait for the user to say "yes", "looks good", "proceed", or equivalent. Only then move to Phase 2.

No exceptions for small changes. No exceptions for "obvious" fixes. The design phase is the cheapest point at which to catch a wrong approach.

## The 6-Phase TDD Cycle

### Phase 1: DESIGN (output this, then STOP)
Before writing ANY code, produce a brief design document covering:

1. **What** — One-line description of the feature/fix
2. **Why** — User need or bug being addressed
3. **Where** — Which package(s) and files will be affected
4. **Interface** — Public API surface (function signatures, types, tool schemas)
5. **Dependencies** — What existing services/modules are needed
6. **Test Strategy** — What to test, what to mock, edge cases

**Output:** Present the design to the user for approval before proceeding.

**Package-specific design considerations:**

| Package | Module patterns | Test patterns |
|---------|----------------|---------------|
| `packages/shared` | Export from `src/index.ts`, services as classes | Mock external deps (axios, fs, MSAL) |
| `packages/mcp` | Tools: `toolDefinitions.ts` + `toolHandlers.ts` | Mock `@bctb/shared` services |
| `packages/extension` | Commands in `extension.ts`, services in `services/` | Mock `vscode` namespace + shared |

### Phase 2: WRITE TESTS
Write failing tests FIRST. Tests go in `__tests__/` directories.

**Test file conventions:**
```
packages/shared/src/__tests__/<module>.test.ts
packages/mcp/src/__tests__/<feature>.test.ts
packages/extension/src/__tests__/<feature>.test.ts
```

**Test structure pattern (from this project):**
```typescript
// 1. Mock dependencies at top level
jest.mock('@bctb/shared', () => ({
    ServiceName: jest.fn().mockImplementation(() => ({
        method: jest.fn().mockResolvedValue(result)
    }))
}));

// 2. Import after mocks
import { ClassUnderTest } from '../module.js';

// 3. Describe blocks matching class/function structure
describe('ClassUnderTest', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    describe('methodName', () => {
        it('should handle normal case', async () => { /* ... */ });
        it('should handle error case', async () => { /* ... */ });
        it('should handle edge case', async () => { /* ... */ });
    });
});
```

**What to test (in priority order):**
1. Happy path — normal inputs produce expected outputs
2. Error paths — invalid inputs, network failures, auth failures
3. Edge cases — empty arrays, null values, boundary values
4. Integration points — cross-package imports work correctly

**What NOT to test:**
- VSCode UI components requiring full extension host (`extension.ts`, `SetupWizardProvider.ts`)
- Pure data files (`agentDefinitions.ts`)
- Auto-generated files (`version.ts`, `telemetryConfig.generated.ts`)
- CLI entry points (`cli.ts`, `server.ts`)

### Phase 3: VERIFY TESTS FAIL
Run the tests and confirm they fail for the RIGHT reason (missing implementation, not broken test).

```bash
# Run specific test file
cd packages/<package> && npx jest --no-coverage src/__tests__/<test-file>.test.ts

# Run all tests for a package
cd packages/<package> && npm test
```

**If tests fail for wrong reason:** Fix the test, not the implementation.
**If scaffolding is needed:** Create minimal stubs (empty functions, interface-only files) so tests compile but fail on assertions.

### Phase 4: IMPLEMENT
Write the minimum code to make tests pass. Follow these project conventions:

**TypeScript conventions:**
- ES2022 + ESM modules in shared/mcp (`import/export`)
- CommonJS in extension (VSCode requirement)
- Use `@bctb/shared` for cross-package imports
- Dependency injection via constructor parameters
- Single Responsibility: one class/module per concern

**Project-specific patterns:**
- MCP tools: add to `TOOL_DEFINITIONS` array in `toolDefinitions.ts`, implement handler in `toolHandlers.ts`
- Shared services: export from `src/index.ts`, use dependency injection
- Extension commands: register in `extension.ts`, implement in service classes
- Config: use `MCPConfig` type from shared, loaded via `loadConfig()`

**Code quality (from copilot-instructions.md):**
- SOLID principles (especially SRP and DIP)
- Functions < 20 lines
- Meaningful names revealing intent
- `const` over `let`, avoid `any`
- Proper error handling with logging

### Phase 5: VERIFY TESTS PASS
Run ALL tests for affected packages, with coverage.

```bash
# Package-level with coverage
cd packages/<package> && npm run test:coverage

# All packages from root
npm test
```

**Coverage thresholds (enforced by Jest):**

| Metric | shared | mcp | extension |
|--------|--------|-----|-----------|
| Statements | 70% | 70% | 70% |
| Branches | 60% | 60% | 60% |
| Functions | 65% | 65% | 70% |
| Lines | 70% | 70% | 70% |

**If tests fail:** Fix implementation, NOT the tests (unless the test itself is wrong).
**If coverage drops:** Add more tests for uncovered paths.

### Phase 6: DOCUMENT
Update documentation to reflect changes:

1. **Always update** (per copilot-instructions.md):
   - `docs/PromptLog.md` — Log the user prompt (GUID-based entry)
   - `docs/DesignWalkthrough.md` — Short narrative with Why/How

2. **Update when user-facing features change:**
   - `docs/UserGuide.md` — Installation, configuration, usage
   - `packages/<component>/CHANGELOG.md` — Version history
   - `packages/<component>/README.md` — Component documentation

3. **Update when test patterns change:**
   - `docs/TestingGuide.md` — Testing philosophy and instructions

## MCP Tool Development Checklist

When adding a new MCP tool, follow this exact sequence:

- [ ] **Design:** Define tool name, description, inputSchema, annotations
- [ ] **Test toolDefinition:** Verify tool appears in TOOL_DEFINITIONS array
- [ ] **Test toolHandler:** Write tests for handler dispatch + business logic
- [ ] **Test telemetry:** Write tests verifying `usageTelemetry.trackEvent` is called with correct event name/properties
- [ ] **Scaffold:** Add tool to TOOL_DEFINITIONS, add empty handler case
- [ ] **Add telemetry event ID:** Add `TOOL_NAME: 'TB-MCP-1xx'` to `TELEMETRY_EVENTS.MCP_TOOLS` in `packages/shared/src/telemetryEvents.ts`
- [ ] **Verify fail:** Tests should fail on missing logic (not compile errors)
- [ ] **Implement handler:** Write business logic in toolHandlers.ts
- [ ] **Add telemetry call:** Call `usageTelemetry.trackEvent` inside the handler case for meaningful outcomes (in addition to the generic `Mcp.ToolCompleted` that fires automatically)
- [ ] **Verify pass:** All tests green, coverage meets threshold
- [ ] **Integration check:** Run `npm run build` from root
- [ ] **Document:** Update CHANGELOG, tool descriptions, UserGuide if needed

## Extension Service Development Checklist

When adding a new extension service or command:

- [ ] **Design:** Define service interface, dependencies, command palette entry
- [ ] **Test service:** Write tests mocking vscode namespace + @bctb/shared
- [ ] **Test telemetry:** Write tests verifying `usageTelemetry.trackEvent` or `trackOperationWithTelemetry` is called for key operations
- [ ] **Scaffold:** Create service file with empty class/methods
- [ ] **Verify fail:** Tests fail on assertions
- [ ] **Implement:** Fill in service logic
- [ ] **Add telemetry:** Use `trackOperationWithTelemetry` for async operations, or `usageTelemetry.trackEvent` for simple events; add event ID constants to `TELEMETRY_EVENTS.EXTENSION` if significant
- [ ] **Verify pass:** All tests green
- [ ] **Wire up:** Register command in extension.ts, add to package.json
- [ ] **Build check:** `npm run build` from root
- [ ] **Document:** Update CHANGELOG, UserGuide

## Shared Library Development Checklist

When adding to @bctb/shared:

- [ ] **Design:** Define types, interfaces, function signatures
- [ ] **Test:** Write tests mocking external dependencies (axios, fs, MSAL)
- [ ] **Export:** Add to src/index.ts
- [ ] **Scaffold:** Create module with type stubs
- [ ] **Verify fail:** Tests fail on logic
- [ ] **Implement:** Fill in module
- [ ] **Verify pass:** All tests green, coverage meets 70%
- [ ] **Build check:** `npm run build` from root (shared must build first)
- [ ] **Consumer check:** Verify MCP and extension can import new exports

## Common Mocking Patterns

### Mock @bctb/shared (in MCP or extension tests)
```typescript
jest.mock('@bctb/shared', () => ({
    AuthService: jest.fn().mockImplementation(() => ({
        authenticate: jest.fn().mockResolvedValue(undefined),
        getAccessToken: jest.fn().mockResolvedValue('mock-token'),
    })),
    KustoService: jest.fn().mockImplementation(() => ({
        executeQuery: jest.fn(),
    })),
    CacheService: jest.fn().mockImplementation(() => ({
        get: jest.fn().mockReturnValue(null),
        set: jest.fn(),
    })),
}));
```

### Mock vscode namespace (in extension tests)
```typescript
jest.mock('vscode', () => ({
    window: {
        showInformationMessage: jest.fn(),
        showErrorMessage: jest.fn(),
        createOutputChannel: jest.fn(() => ({ appendLine: jest.fn(), show: jest.fn() })),
    },
    workspace: {
        getConfiguration: jest.fn().mockReturnValue({
            get: jest.fn(),
            update: jest.fn(),
        }),
        workspaceFolders: [{ uri: { fsPath: '/test' } }],
    },
    commands: { registerCommand: jest.fn() },
    Uri: { file: jest.fn((f: string) => ({ fsPath: f })) },
}), { virtual: true });
```

### Mock fs/path (in shared tests)
```typescript
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
}));
```

## Anti-Patterns to Avoid

1. **Writing implementation before tests** — Always write the test first
2. **Skipping Phase 3 (verify fail)** — If tests pass before implementation, they test nothing
3. **Fixing tests to match broken implementation** — Tests define expected behavior
4. **Testing implementation details** — Test behavior and outcomes, not internal methods
5. **Giant test files** — One describe block per class/module, split if > 300 lines
6. **Skipping coverage check** — CI will catch it, but catching locally saves time
7. **Mocking too much** — If everything is mocked, you're testing mocks not code
8. **Ignoring cross-package builds** — Always `npm run build` from root after changes
