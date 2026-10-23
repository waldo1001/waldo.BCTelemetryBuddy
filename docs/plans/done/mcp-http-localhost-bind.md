---
topic: mcp-http-localhost-bind
status: done
created: 2026-10-23
spec: docs/specs/145-mcp-http-localhost-bind.md
---

# MCP HTTP mode: bind to localhost by default

## Spec
- Spec file: docs/specs/145-mcp-http-localhost-bind.md (status `approved`)
- AC IDs covered by this cycle: AC1–AC9 (all)

## Task
Resolve the HTTP-mode bind host (`BCTB_HOST` → config `host` → `127.0.0.1`), listen on it with proper error handling, and warn + track when it is not loopback.

## Scope boundary
- IN: new `packages/mcp/src/httpBind.ts`; `MCPServer.startHTTP()` in `server.ts`; `host` in `MCPConfig` + config loading (`config.ts`); `host` in `config-schema.json` (top-level and profile); telemetry ID; MCP CHANGELOG, MCP README, UserGuide.
- OUT: stdio mode; extension code; CORS / auth for HTTP mode; `--host` CLI flag; `packages/shared/src/config.ts` (the MCP server does not use its `MCPConfig`).

## Files to create / touch
- `packages/mcp/src/httpBind.ts` (new) — pure helpers, same shape as `runtimeSecurity.ts`
- `packages/mcp/src/server.ts` — `startHTTP()` (≈line 1486), new `httpServer` field
- `packages/mcp/src/config.ts` — `host?: string` on `MCPConfig`; `loadConfig()` (env, ≈121); profile merge (≈345, `resolvedProfile.host ?? rawConfig.host`); single config (≈376)
- `packages/mcp/config-schema.json` — `host` string next to `workspacePath` (≈59 and ≈308)
- `packages/shared/src/telemetryEvents.ts` — `HTTP_NON_LOOPBACK_BIND: 'TB-MCP-008'`
- `packages/mcp/src/__tests__/http-bind.test.ts` (new)
- `packages/mcp/CHANGELOG.md` (Unreleased, **Security** + **BREAKING** note), `packages/mcp/README.md`, `docs/UserGuide.md` (HTTP mode section), `docs/DesignWalkthrough.md`

## Interface
```ts
// httpBind.ts
export const DEFAULT_HTTP_HOST = '127.0.0.1';
export type HostSource = 'env' | 'config' | 'default';
export type HostKind = 'loopback' | 'wildcard' | 'specific';
export function resolveHttpHost(envHost: string | undefined, configHost: string | undefined): { host: string; source: HostSource };
export function classifyHost(host: string): HostKind;      // 127.0.0.0/8, ::1, localhost → loopback; 0.0.0.0, :: → wildcard
export function formatListenUrl(host: string, port: number): string;   // IPv6 in brackets: http://[::1]:52345
export function formatExposureWarning(url: string): string;
export function listenHttp(app: { listen: Function }, host: string, port: number): Promise<http.Server>; // rejects with Error naming host:port + code
export function reportHttpBind(deps: { warn; track; commonProps }, host: string, source: HostSource): HostKind; // never throws; warns + tracks only if not loopback
```
`startHTTP()`: resolve → `await listenHttp(...)` (store `this.httpServer`) → log `✓ MCP Server v<V> listening on <url>` → `reportHttpBind(...)` → existing auth block unchanged. A listen failure rejects out of `startHTTP()`; `startServer()`'s existing catch prints `error.message` and calls `process.exit(1)`.

## Dependencies
express app (`this.app`), `usageTelemetry.trackEvent`, `createCommonProperties` / `cleanTelemetryProperties` (same wiring as `reportRuntimeSecurity`, server.ts:189).

## RED test list
All in `packages/mcp/src/__tests__/http-bind.test.ts` unless noted.
- AC1: default bind is 127.0.0.1 only
  - test: "AC1: resolveHttpHost defaults to 127.0.0.1" + "AC1: startHTTP listens on 127.0.0.1 when no host is configured" (real `MCPServer(config,'http')` with port 0, assert `httpServer.address().address === '127.0.0.1'`)
  - seams: none (real socket, port 0); config without auth so startup auth is skipped
- AC2: `http://localhost:<port>` reaches the default bind
  - test: "AC2: a request to localhost reaches a 127.0.0.1 listener" (Node `http.get('http://localhost:<port>/…')` against the started server, any existing route returning 2xx)
  - edge: `::1`-first resolution (relies on Node ≥22 autoSelectFamily, our floor)
- AC3: env wins over config — "AC3: BCTB_HOST overrides config host" (source `env`)
- AC4: config host, profile over top-level — "AC4: resolveHttpHost uses config host" + config test in `config.test.ts`/`profile-switching.test.ts`: "AC4: profile host wins over top-level host" and "AC4: top-level host applies when profile has none"
- AC5: empty/whitespace = unset — `it.each(['', '  ', undefined])`
- AC6: startup line — "AC6: formatListenUrl" (`127.0.0.1`, `0.0.0.0`, `::1` → brackets) + startHTTP test asserts stderr line contains `http://127.0.0.1:<port>`
- AC7: non-loopback warning + telemetry — `reportHttpBind` with mocked deps: `0.0.0.0` → 1 warn, 1 track (`hostSource`, `hostKind: 'wildcard'`, no address in props); `192.168.1.10` → `specific`; `127.0.0.1`, `127.1.2.3`, `::1`, `localhost` → 0 warn, 0 track; throwing deps never throw out
- AC8: unbindable host — "AC8: listenHttp rejects naming host and port" (`192.0.2.1`, TEST-NET-1, never assigned → `EADDRNOTAVAIL`); message contains `192.0.2.1:` and the port
- AC9: stdio untouched — "AC9: stdio startServer never resolves or binds an HTTP host" (`jest.mock('../mcpSdkServer.js')`, spy on `httpBind` exports, assert not called)

## Telemetry (Rule 13)
- Event ID: `TELEMETRY_EVENTS.MCP.HTTP_NON_LOOPBACK_BIND` = `'TB-MCP-008'`, name `Mcp.HttpNonLoopbackBind`
- `trackEvent` call in: `server.ts` `startHTTP()` via `reportHttpBind`
- Properties: common props + `hostSource` (`env` | `config`), `hostKind` (`wildcard` | `specific`). The address is never sent.

## Open questions / assumptions
- Assumption: no client connects to HTTP mode through a LAN IP or hostname today (extension default and all docs use `localhost`).
- Assumption: `localhost` → `::1` first is handled by the client's dual-stack connect (Node ≥22 default `autoSelectFamily`; VS Code ≥1.96's Electron Node ≥20 also defaults to it). AC2 proves it for Node.

## Risks
- Someone running HTTP mode in Docker/WSL2/another machine loses access silently from the client side (the server itself starts fine). Mitigation: CHANGELOG BREAKING note with the `BCTB_HOST=0.0.0.0` one-liner; the startup line shows the bind address.
- AC8 test depends on 192.0.2.1 not being assigned on the CI runner (it is reserved documentation space; safe in practice).

## Blast radius / breakage prediction
- **Rating:** `risky`
  - New default bind address: observable for anyone reaching HTTP mode from outside the machine.
  - Documented migration: `BCTB_HOST=0.0.0.0` (or `"host": "0.0.0.0"` in `.bctb-config.json`) restores the old behavior, now with a warning.
  - **Version bump:** MCP minor (3.8.0) at release, CHANGELOG entry marked BREAKING for that group. Extension unchanged (bundles the new MCP at its next release; its localhost URLs keep working).
- **Who/what could break:** HTTP-mode users connecting from another host/container; MCP tool consumers via stdio: none; saved queries, KB cache, config files: none (new optional key only).
- **Detection:** AC1/AC2/AC8 tests fail in CI; user report "connection refused" from a remote client; TB-MCP-008 shows how many users opt in.

## Out-of-scope follow-ups
- HTTP mode CORS `Access-Control-Allow-Origin: *` and no authentication (browser pages can call `localhost`) — new issue.
- `--host` CLI flag.
