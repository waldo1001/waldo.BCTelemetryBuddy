---
topic: mcp-http-origin-host-token
status: done
created: 2026-10-23
spec: docs/specs/147-mcp-http-origin-host-token.md
---

# MCP HTTP mode: Origin / Host / token guard

## Spec
- Spec file: docs/specs/147-mcp-http-origin-host-token.md (status `approved`)
- AC IDs covered by this cycle: AC1–AC12 (all)

## Task
Replace the wildcard CORS middleware with a guard that refuses browser (`Origin`), rebinding (`Host`) and unauthenticated (`BCTB_HTTP_TOKEN`) requests, and make the extension create, pass and send the token.

## Scope boundary
- IN: new `packages/mcp/src/httpGuard.ts`; `server.ts` `setupMiddleware()` + `startHTTP()`; new `packages/extension/src/services/httpToken.ts`; `mcpClient.ts` constructor; `extension.ts` two `new MCPClient(...)` sites + spawn env; telemetry IDs; CHANGELOGs (MCP + extension), MCP README.
- OUT: stdio mode; a `bctb.mcp.token` setting; TLS.

## Branching
Builds on #145's `httpBind.ts` (`classifyHost`). PR #146 is green but unmerged, so this branch starts from `feat/145-mcp-http-localhost-bind` and the PR targets `main` once #146 is merged (until then it shows #146's commits too).

## Files to create / touch
- `packages/mcp/src/httpGuard.ts` (new)
- `packages/mcp/src/server.ts` — `setupMiddleware()` (≈line 220: delete CORS block, mount guard **before** `express.json()` so rejected bodies are never parsed); `startHTTP()` sets the bind kind + token the guard reads, logs the "no token required" line, tracks start event
- `packages/mcp/src/httpBind.ts` — exposure warning mentions `BCTB_HTTP_TOKEN` when no token
- `packages/shared/src/telemetryEvents.ts` — `HTTP_REQUEST_REJECTED: 'TB-MCP-009'`, `HTTP_MODE_STARTED: 'TB-MCP-010'`
- `packages/extension/src/services/httpToken.ts` (new)
- `packages/extension/src/mcpClient.ts` — optional `token` constructor arg → `Authorization` default header
- `packages/extension/src/extension.ts` — spawn env (≈line 978) via `withHttpToken`; `new MCPClient(..., token)` at ≈519 (re-created once the token resolves; `activate` stays sync) and ≈1041
- tests: `packages/mcp/src/__tests__/http-guard.test.ts` (new), `packages/extension/src/__tests__/httpToken.test.ts` (new), `packages/extension/src/__tests__/mcpClient.test.ts` (extend)
- docs: `packages/mcp/CHANGELOG.md`, `packages/extension/CHANGELOG.md`, `packages/mcp/README.md`, `docs/DesignWalkthrough.md`, spec Verification table

## Interface
```ts
// packages/mcp/src/httpGuard.ts
export type RejectReason = 'origin' | 'host' | 'token';
export function isLoopbackHostHeader(hostHeader: string | undefined): boolean;   // localhost | 127.0.0.0/8 | [::1], port optional, case-insensitive
export function tokenMatches(header: string | undefined, token: string): boolean; // "Bearer <t>", sha256 + crypto.timingSafeEqual
export function normalizeToken(value: string | undefined): string | undefined;   // trim, empty → undefined
export interface HttpGuardOptions {
    bindKind: () => HostKind;            // from httpBind; 'loopback' until startHTTP sets it (strictest)
    token: () => string | undefined;
    log: (line: string) => void;         // stderr
    onReject: (reason: RejectReason) => void; // telemetry, called at most once per reason
}
export function createHttpGuard(opts: HttpGuardOptions): RequestHandler;   // 403 {error:'origin_not_allowed'|'host_not_allowed'}, 401 {error:'unauthorized'}

// packages/extension/src/services/httpToken.ts
export const HTTP_TOKEN_SECRET_KEY = 'bctb.mcp.httpToken';
export function generateHttpToken(): string;                          // 32 random bytes, base64url
export async function getOrCreateHttpToken(secrets: Pick<vscode.SecretStorage, 'get' | 'store'>): Promise<string>;
export function withHttpToken(env: Record<string, string>, token: string): Record<string, string>; // adds BCTB_HTTP_TOKEN

// mcpClient.ts
constructor(baseUrl: string, outputChannel: vscode.OutputChannel, token?: string)
```

## Dependencies
`classifyHost` / `HostKind` (`httpBind.ts`, #145); Node `crypto`; express `RequestHandler`; VS Code `ExtensionContext.secrets`; existing `usageTelemetry.trackEvent` + `createCommonProperties` wiring.

## RED test list
- AC1: no `Access-Control-Allow-*` header — `http-guard.test.ts` "AC1: responses carry no CORS headers" (real `MCPServer` HTTP on port 0, `GET /health`)
- AC2: `Origin` → 403 `origin_not_allowed`, route not run — "AC2: a request with Origin is refused" (`POST /rpc`, `OPTIONS /rpc`; spy that route handler is not reached via `/cache/clear` side effect mock)
- AC3: loopback Host names pass — `it.each` over `localhost:1`, `LOCALHOST:1`, `127.0.0.1:1`, `127.5.6.7:1`, `[::1]:1`, `localhost` (no port)
- AC4: other/missing Host → 403 `host_not_allowed` — `it.each` over `attacker.example:52346`, `192.168.1.10:52346`, `[::2]:1`, `127.0.0.1.attacker.example`, `undefined`
- AC5: non-loopback bind skips Host check — guard with `bindKind: () => 'wildcard'` and Host `attacker.example` passes; Origin still refused
- AC6: token required — no header / `Basic x` / `Bearer wrong` / `Bearer <token>x` → 401; `Bearer <token>` → passes; also on `/health`
- AC7: no token → normal response + one startup line — guard with `token: () => undefined`; `normalizeToken('  ') === undefined`; startHTTP stderr contains the "no token required" line once
- AC8: rejection log line has method, path, reason, never the token/Authorization — assert on `log` calls
  - plus telemetry: `onReject` called once per reason across repeated rejections
- AC9: `getOrCreateHttpToken` — empty store → generates 43-char base64url, stores under key; stored → returns it, no store call; two `generateHttpToken()` differ
- AC10: `withHttpToken` adds `BCTB_HTTP_TOKEN`, keeps other keys, does not mutate input
- AC11: `mcpClient.test.ts` "AC11: sends Authorization when created with a token" / "AC11: no Authorization header without a token" (assert `axios.create` headers)
- AC12: "AC12: error logging never contains the token" — rejected post with `err.config.headers.Authorization`, assert no `appendLine` arg contains the token

## Telemetry (Rule 13)
- `TELEMETRY_EVENTS.MCP.HTTP_REQUEST_REJECTED` = `'TB-MCP-009'`, name `Mcp.HttpRequestRejected`, prop `reason` (`origin` | `host` | `token`); fired from the guard's `onReject`, at most once per reason per process.
- `TELEMETRY_EVENTS.MCP.HTTP_MODE_STARTED` = `'TB-MCP-010'`, name `Mcp.HttpModeStarted`, props `tokenRequired` (bool), `hostKind`; fired once in `startHTTP()`.
- Extension: none (spec: token is never tracked).

## Open questions / assumptions
- Assumption: no VS Code webview or other browser context calls the HTTP server (grep: webviews only fetch external URLs).
- Assumption: axios/Node `http` never send `Origin` (verified by AC2's companion test: a Node `http.get` without Origin reaches the route).
- The `bctb.mcp.url` path gets the installation token too; a hand-started server without `BCTB_HTTP_TOKEN` ignores the header.

## Risks
- A user who scripted calls to HTTP mode from a browser page, or reaches a loopback-bound server through another hostname (e.g. a hosts-file alias), gets 403. Mitigation: CHANGELOG BREAKING note; use `localhost`, or opt in with `BCTB_HOST`.
- Two VS Code windows: second window reuses the first window's server on `EADDRINUSE`; same installation token → works. A server spawned by an older extension version (no token) accepts the header → works.
- SecretStorage unavailable (keyring locked on Linux): `getOrCreateHttpToken` rejects → extension falls back to an in-memory token for this session and logs one line (no token value). Covered by a test.

## Blast radius / breakage prediction
- **Rating:** `risky`
  - Refuses requests that worked before (any `Origin`, non-loopback `Host` on a loopback bind, and missing token when `BCTB_HTTP_TOKEN` is set).
  - Migration: call through `http://localhost:<port>` from Node, not a browser; for remote access keep `BCTB_HOST` and add `BCTB_HTTP_TOKEN`.
  - **Version bump:** MCP minor (with #145 → 3.8.0), extension minor (new token flow). Both CHANGELOGs mark it BREAKING for browser/alias callers.
- **Who/what could break:** extension command-palette queries if the token wiring is wrong (most likely regression); hand-written browser/alias clients; stdio MCP consumers: none.
- **Detection:** `http-guard.test.ts` + `mcpClient.test.ts` in CI; a smoke test against the built server (curl with/without Origin, Host, token); in the field TB-MCP-009 `reason=token` spikes would mean the extension isn't sending its token.

## Out-of-scope follow-ups
- `bctb.mcp.token` setting for hand-started servers reached through `bctb.mcp.url`.
- Consider retiring HTTP mode once command-palette commands use stdio.
