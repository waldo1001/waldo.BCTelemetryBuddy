---
topic: node-runtime-security-floor
status: done
created: 2026-10-23
spec: docs/specs/134-node-runtime-security-floor.md
---

# Plan: Node.js runtime security floor

## Spec
[docs/specs/134-node-runtime-security-floor.md](../specs/134-node-runtime-security-floor.md) (approved 2026-10-23). This cycle covers **all ACs: AC1–AC7**.

## Task
Add a single-source Node.js security-floor module to the MCP server. It warns on stderr and fires telemetry when the server starts on an unpatched runtime. Alongside it, drop Node 20 from CI and limit `engines.node` to patched versions.

## Scope boundary
- **IN:** new `runtimeSecurity.ts` module (floor table, classifier, warning text, engines range); wiring into stdio (`startSdkStdioServer`) and HTTP (`MCPServer`) startup; one new telemetry event; `engines.node` on root and `packages/mcp`; Node versions in `.github/workflows/*.yml`; repo-consistency tests.
- **OUT:** extension UI/notification; Electron/VS Code runtime; changes to axios or `fetch` decompression; refusing to start; dynamic floor lookup (spec Non-goals).

## Files to create / touch
| Path | Change |
|---|---|
| `packages/mcp/src/runtimeSecurity.ts` | **new** — floor table, `classifyNodeRuntime`, `formatRuntimeWarning`, `enginesRangeFromFloor`, `reportRuntimeSecurity` |
| `packages/mcp/src/__tests__/runtime-security.test.ts` | **new** — AC1–AC5 unit tests + wiring tests |
| `packages/mcp/src/__tests__/node-floor-consistency.test.ts` | **new** — AC6 (workflows) + AC7 (engines ↔ floor) |
| `packages/mcp/src/mcpSdkServer.ts` | call `reportRuntimeSecurity` in `startSdkStdioServer` right after `initializeServices` |
| `packages/mcp/src/server.ts` | call `reportRuntimeSecurity` in the `MCPServer` HTTP path after usage telemetry is initialized (next to `Mcp.ServerStarted`, ~L170), HTTP mode only so stdio doesn't fire it twice |
| `packages/shared/src/telemetryEvents.ts` | add `MCP.RUNTIME_UNPATCHED: 'TB-MCP-007'` |
| `package.json` (root) | `engines.node` → `^22.23.4 \|\| ^24.22.1 \|\| >=26.12.1` |
| `packages/mcp/package.json` | add `engines.node` (same range) |
| `.github/workflows/ci.yml` | matrices `[20.x, 22.x]` → `[22.x, 24.x]`; single-version jobs `20.x` → `22.x` |
| `.github/workflows/release-extension.yml`, `release-mcp.yml`, `codeql.yml` | `20.x` → `22.x` |
| `packages/mcp/CHANGELOG.md`, `docs/UserGuide.md` (requirements note), `docs/PromptLog.md`, `docs/DesignWalkthrough.md` | Phase 9 |

## Interface
```ts
// packages/mcp/src/runtimeSecurity.ts
export const NODE_SECURITY_FLOOR: ReadonlyArray<{ major: number; minimum: string }> = [
    { major: 22, minimum: '22.23.4' },
    { major: 24, minimum: '24.22.1' },
    { major: 26, minimum: '26.12.1' },
];
export const NODE_SECURITY_ADVISORY_URL = 'https://nodejs.org/en/blog/vulnerability/october-2026-security-releases';

export type RuntimeClassification =
    | { status: 'patched' }
    | { status: 'unpatched'; reason: 'eol' | 'below-patched' }
    | { status: 'unknown' };

export function classifyNodeRuntime(version: string): RuntimeClassification;
export function formatRuntimeWarning(version: string, reason: 'eol' | 'below-patched'): string;
export function enginesRangeFromFloor(): string; // "^22.23.4 || ^24.22.1 || >=26.12.1"

/** Never throws. Returns the classification for testability. */
export function reportRuntimeSecurity(
    deps: {
        warn: (line: string) => void;                                   // stderr writer
        track: (name: string, props: Record<string, string>) => void;   // usageTelemetry.trackEvent wrapper
        commonProps: () => Record<string, string>;                      // createCommonProperties(... RUNTIME_UNPATCHED ...)
    },
    version: string = process.versions.node
): RuntimeClassification;
```
Classification rules (spec §Behavior): parse `X.Y.Z` (an optional leading `v` is allowed; anything else → `unknown`). Major below 22, or major 23/25 → `eol`. Major 22, 24 or 26 below its minimum → `below-patched`. Above its minimum, or major 27 or later → `patched`. The comparison is a hand-written three-part numeric compare, with no new `semver` dependency.

## Dependencies
- `TELEMETRY_EVENTS`, `createCommonProperties` and `cleanTelemetryProperties` from `@bctb/shared` (already used at both hook sites).
- `services.usageTelemetry` (stdio) and `this.usageTelemetry` (HTTP). `NoOpUsageTelemetry` when telemetry is off, so the warning still prints.
- stdio: `console.error` is already redirected to stderr with the `[MCP]` prefix (`mcpSdkServer.ts:472`). `warn` uses `console.error`.

## RED test list
| AC | File | Test | Seams / edge cases |
|---|---|---|---|
| AC1 | `runtime-security.test.ts` | `it.each` "AC1: classifies %s as %s" | `20.20.2`→eol, `23.11.0`→eol, `25.0.0`→eol, `22.23.3`/`24.14.0`/`26.10.0`→below-patched, `22.23.4`/`24.22.1`/`26.12.1`/`27.0.0`→patched, `v24.22.1`→patched, `garbage`/`''`→unknown |
| AC2 | `runtime-security.test.ts` | "AC2: unpatched runtime writes exactly one warning line to stderr and nothing to stdout" | `warn` spy called once with text containing running version + `22.23.4`, `24.22.1`, `26.12.1` + advisory URL; `process.stdout.write` spy not called; EOL wording variant |
| AC3 | `runtime-security.test.ts` | "AC3: unpatched runtime fires one Mcp.RuntimeUnpatched event with nodeVersion + reason only" | `track` spy called once with `'Mcp.RuntimeUnpatched'`, props include `eventId: 'TB-MCP-007'`, `nodeVersion`, `reason`; assert no keys beyond common props + those two |
| AC4 | `runtime-security.test.ts` | "AC4: patched runtime warns nothing and tracks nothing" | `warn`, `track` not called |
| AC5 | `runtime-security.test.ts` | "AC5: never throws — unknown version, throwing track, throwing warn" | `track`/`warn` throw → function returns, no exception; `unknown` → no warn/track |
| AC2/3 wiring | `runtime-security.test.ts` | "stdio startup calls reportRuntimeSecurity once" / "HTTP MCPServer calls it once; stdio-mode MCPServer does not" | `jest.mock('../runtimeSecurity')`, follows the existing mocking setup in `graceful-startup.test.ts` / `mcp-sdk-server.test.ts` |
| AC6 | `node-floor-consistency.test.ts` | "AC6: no workflow uses Node < 22; CI matrices are [22.x, 24.x]; release/codeql use 22.x" | reads `.github/workflows/*.yml` as text (repo root resolved from `__dirname`); regex on `node-version` |
| AC7 | `node-floor-consistency.test.ts` | "AC7: root and mcp engines.node equal enginesRangeFromFloor()" | reads both `package.json`; also asserts `enginesRangeFromFloor()` === the literal from the spec |

## Telemetry
- New: `TELEMETRY_EVENTS.MCP.RUNTIME_UNPATCHED = 'TB-MCP-007'` (next free ID in the `MCP` group; `TB-MCP-001..006` are taken).
- Event name `Mcp.RuntimeUnpatched`, fired from `reportRuntimeSecurity`, called once per start in stdio (`startSdkStdioServer`) or HTTP (`MCPServer`).
- Properties: common properties + `nodeVersion` (e.g. `24.14.0`, no PII) + `reason` (`eol` | `below-patched`). Nothing fires on a patched runtime (spec §Telemetry).

## Open questions / assumptions
- **Assumption:** the stdio warning goes through the existing `console.error` → stderr redirect, so it carries the `[MCP] ` prefix. That's fine for hosts that show stderr in their MCP log.
- **Assumption:** `MCPServer` is also constructed in stdio code paths (tests or legacy), so the HTTP hook is guarded by `!this.isStdioMode` to guarantee "exactly once" (AC2/AC3).
- **Assumption:** no MCP or extension version bump in this cycle. The CHANGELOG entry goes under `Unreleased`, and the next `/release` picks it up.
- **Assumption:** the extension's bundled MCP (`packages/extension/mcp/dist`) is rebuilt from `packages/mcp` at packaging time, so it inherits the check with no extension code change. To verify in Phase 7, I'll check that the bundle contains `TB-MCP-007` after `npm run build`.

## Risks
- **CI resolves `22.x` to a version below 22.23.4** (stale runner cache). The root `engines` would then warn but not fail, because engine-strict is off and there is no `.npmrc`. Harmless.
- **The workflow-text test is brittle** if workflows switch to `node-version-file`. The test would fail loudly, and the fix is to update it. Acceptable.
- **The warning could leak to stdout.** That would corrupt the stdio protocol. AC2 asserts stdout is untouched, and `stdio-logging.test.ts` already guards the redirect.
- **Rollback:** revert one commit. No config, on-disk format or tool schema changes.

## Blast radius / breakage prediction
- **Rating:** `low-risk`.
  - Users see new behavior: one stderr warning line, and an npm `EBADENGINE` warning when installing on unpatched Node. Both are warnings only. Startup, tool calls, configs, saved queries, KB cache and return shapes are unchanged.
  - Dropping Node 20 from CI is a support-policy change. Node 20 is EOL and affected by the advisory, and nothing stops Node 20 users from running the server.
- **Who/what could break:**
  - **CI:** a mistake in a workflow matrix fails the CI run.
  - **Telemetry pipeline:** gains one new event ID. It is additive, so no existing queries break.
  - **MCP tool consumers:** only if a warning byte ever reached stdout. AC2 guards against that.
- **Detection:**
  - The new AC tests plus the existing `stdio-logging.test.ts` and `graceful-startup.test.ts`.
  - A CI run on the PR exercising the 22.x/24.x matrices.
  - After merge: `TB-MCP-007` counts in usage telemetry, and user reports of an unexpected stderr line.

## Out-of-scope follow-ups
- #135: the runtime npm-audit findings (already on `main`) that the Phase 8 security scan surfaced. The user chose to resolve them in a separate cycle.
- A VS Code notification when the bundled MCP's `node` is unpatched (the extension could run `node --version` before spawning).
- Moving from a warning to refusing to start, once `TB-MCP-007` volume drops (spec §Telemetry rationale).
- A `node-version-file` (`.nvmrc`) as the single source for workflows.
