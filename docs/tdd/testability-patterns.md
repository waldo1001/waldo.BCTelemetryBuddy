# Testability Patterns — BC Telemetry Buddy

> **Source of truth for rules:** [.github/copilot-instructions.md](../../.github/copilot-instructions.md).
> This file is the **how** of making BCTB testable — mocking patterns, seams, package conventions.

BCTB has three packages with different testing constraints. This doc is the reference you reach for when Phase 3 or Phase 5 of the [TDD cycle](methodology.md) needs a mock you haven't written yet.

---

## Package-specific patterns

| Package | Module patterns | Test patterns |
|---|---|---|
| `packages/shared` | Export from `src/index.ts`; services as classes with DI | Mock external deps (axios, fs, MSAL) |
| `packages/mcp` | Tools in `toolDefinitions.ts` + `toolHandlers.ts`; single-responsibility handler per tool | Mock `@bctb/shared` services |
| `packages/extension` | Commands in `extension.ts`, logic in `services/`, UI in `webviews/` | Mock `vscode` namespace + `@bctb/shared` |

---

## Seams you should inject, not import directly

BCTB's business logic talks to the outside world through a small number of seams. Keep each one injectable so tests can replace it with a fake.

- **Auth** — `AuthService` (MSAL, Azure CLI, VSCode auth, device code, client credentials). Never import MSAL directly from business logic.
- **Kusto / App Insights** — `KustoService`. HTTP calls live here; nothing else should talk to the API endpoint.
- **Cache** — `CacheService`. Filesystem reads/writes for query result caching live here.
- **Queries** — `QueryService`. Reading/writing `.kql` files under the workspace's queries folder.
- **Knowledge base** — `KnowledgeBaseService`. Reads `knowledge-base/` markdown files.
- **Config** — `loadConfig()` returning an `MCPConfig`. Never read env vars directly from business logic.
- **Telemetry** — `usageTelemetry`. All `trackEvent` calls go through the injected service, never a module-level singleton.
- **Logger** — whatever logger is wired in. Never `console.log` from business logic — tests have no way to inspect it.

Rule of thumb: if you would reach for `process.env`, `fs.readFileSync`, `new Date()`, or `fetch` from inside a handler, stop. Inject the seam instead.

---

## Mocking patterns — the catalog

### Mock `@bctb/shared` (MCP or extension tests)

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

### Mock the `vscode` namespace (extension tests)

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

Note the `virtual: true` flag — the `vscode` module is only resolvable inside a running extension host.

### Mock `fs` / `path` (shared tests)

```typescript
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    readFileSync: jest.fn(),
    writeFileSync: jest.fn(),
    mkdirSync: jest.fn(),
    readdirSync: jest.fn(),
}));
```

### Mock telemetry (any test that touches a handler)

Rule 13 says every feature must call `trackEvent`. To verify it in a test, mock the telemetry service and assert on the call:

```typescript
const mockTrackEvent = jest.fn();
const mockUsageTelemetry = { trackEvent: mockTrackEvent };

// after exercising the handler:
expect(mockTrackEvent).toHaveBeenCalledWith(
    'Mcp.SaveKnowledge',
    expect.objectContaining({ toolName: 'save_knowledge' })
);
```

### Mock MSAL (shared auth tests)

Inject a fake `ConfidentialClientApplication` / `PublicClientApplication` via constructor rather than mocking the module. MSAL's types are large and brittle when mocked with `jest.mock`.

---

## Test structure conventions

```typescript
describe('ClassUnderTest', () => {
    beforeEach(() => { jest.clearAllMocks(); });

    describe('methodName', () => {
        it('should handle normal case', async () => { /* ... */ });
        it('should handle error case', async () => { /* ... */ });
        it('should handle edge case', async () => { /* ... */ });
    });
});
```

- One `describe` per class or module. If a file hits ~300 lines, split by sub-concern.
- `beforeEach(jest.clearAllMocks)` — do not share state between tests.
- Test names read like a spec line: `"should return empty array when cache is cold"`.
- No test should import from another test file.

---

## Anti-patterns

1. **Writing implementation before tests.** Phase 3 comes before Phase 6 for a reason.
2. **Skipping Phase 4 (PROVE RED).** A test that passes before implementation tests nothing.
3. **Fixing tests to match broken implementation.** Tests define expected behavior.
4. **Testing implementation details.** Test behavior and outcomes, not internal method names.
5. **Giant test files.** One `describe` per class/module; split at ~300 lines.
6. **Mocking everything.** If every dependency is mocked, you're testing mocks, not code. Use real `@bctb/shared` services where they're cheap and pure.
7. **Ignoring cross-package builds.** Always `npm run build` from root after changes — TypeScript project references catch interface mismatches that unit tests miss.
8. **Module-level singletons.** Anything a test can't replace is a test-hostile pattern. Export a factory or a class with DI.
