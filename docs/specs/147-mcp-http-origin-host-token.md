---
spec: 147-mcp-http-origin-host-token
issue: 147
status: implemented
created: 2026-10-23
approved: 2026-10-23
plans: [docs/plans/done/mcp-http-origin-host-token.md]
---

# MCP HTTP mode: block browser callers and add a local auth token

## Intent
HTTP mode sends `Access-Control-Allow-Origin: *`, answers every CORS preflight and has no authentication. Even listening on 127.0.0.1 only (#145), any web page open in the user's browser can call `http://localhost:52346/rpc`, run KQL with the user's Application Insights access and read the results; a DNS-rebinding page can do it without CORS. Routes also write files (`POST /saved`) and clear the cache. The only legitimate client is the VS Code extension's `MCPClient` (Node, no browser origin). HTTP mode must refuse browser-originated and rebinding requests, and the extension's own server must only answer the extension.

## Actors & scope
Consumers: the extension's `MCPClient` (spawned command-palette server on port 52346, a reused server on `EADDRINUSE`, or `bctb.mcp.url`); people running `bctb-mcp start --http` or the repo's Debug MCP Server launch configs by hand; a browser page (the attacker; must be refused).
- IN: `packages/mcp` HTTP-mode middleware (CORS removal, Origin check, Host check, token check); `packages/extension` token generation and storage, passing it to the spawned server, sending it from `MCPClient`.
- OUT: stdio mode; the `bctb.mcp.url` path getting its own token setting; TLS.

## Behavior
Checks run before any route, in this order, and every rejection answers with a JSON body `{ "error": "<reason>" }`, logs one line to stderr (method, sanitized path, reason; never the token) and does not reach the route:
1. **No CORS.** The server sends no `Access-Control-Allow-*` headers. `OPTIONS` requests are refused like any other browser request (they carry `Origin`).
2. **Origin.** A request with an `Origin` header gets `403 { "error": "origin_not_allowed" }`. Node clients (axios, `http`) do not send `Origin`.
3. **Host (loopback bind only).** When the server listens on a loopback address (#145 default), the `Host` header's hostname must be `localhost`, an address in `127.0.0.0/8`, or `[::1]` (any port, case-insensitive). Anything else gets `403 { "error": "host_not_allowed" }` (a missing `Host` is refused by Node with `400` before the guard runs). When the user opted in to a non-loopback bind (`BCTB_HOST`), the Host check is skipped (we can't know the names they use) and the Origin and token checks still apply.
4. **Token.** When `BCTB_HTTP_TOKEN` is set and non-empty, every request (including `/health`) needs `Authorization: Bearer <token>`, compared in constant time. Missing or wrong → `401 { "error": "unauthorized" }`. When it is unset, no token is required (hand-started servers and the Debug launch configs keep working), and the startup output says so in one line.
- **Non-loopback warning (#145)** adds: "set BCTB_HTTP_TOKEN" when no token is configured.
- **Extension token.** On first need the extension generates a token (32 random bytes, base64url) and stores it in VS Code SecretStorage, so it is the same for every window and survives restarts. It passes it as `BCTB_HTTP_TOKEN` to the command-palette server it spawns, and `MCPClient` sends `Authorization: Bearer <token>` on every request in both connection paths, so a server reused on `EADDRINUSE` (spawned by another window) accepts it, and a server without a token ignores the header. The token never appears in the output channel, logs or telemetry.

## Acceptance criteria
- **AC1:** Given HTTP mode, When any request is answered, Then no `Access-Control-Allow-*` header is present.
- **AC2:** Given HTTP mode, When a request carries an `Origin` header (including `OPTIONS` preflights), Then the response is `403` with `origin_not_allowed` and the route does not run.
- **AC3:** Given a loopback bind, When `Host` is `localhost:<port>`, `127.0.0.1:<port>`, `127.5.6.7:<port>` or `[::1]:<port>` (any case), Then the request passes the Host check.
- **AC4:** Given a loopback bind, When `Host` is anything else (for example `attacker.example:52346`, `192.168.1.10:52346`), Then the response is `403` with `host_not_allowed`; When `Host` is missing, Then Node's HTTP server refuses it with `400` before any route runs (amended 2026-10-23: Node rejects Host-less HTTP/1.1 requests itself, so the guard never sees them).
- **AC5:** Given a non-loopback bind, When `Host` is any value, Then the Host check does not reject it (Origin and token checks still apply).
- **AC6:** Given `BCTB_HTTP_TOKEN` is set, When a request has no `Authorization` header, a different scheme, or a wrong token, Then the response is `401` with `unauthorized`; When it has `Authorization: Bearer <token>`, Then it reaches the route.
- **AC7:** Given `BCTB_HTTP_TOKEN` is unset or whitespace-only, When a Node client calls a route without `Authorization`, Then it gets the normal response, and the startup output has one line saying no token is required.
- **AC8:** Given any rejection, When it is logged, Then the stderr line has the method, path and reason and never the token or the `Authorization` value.
- **AC9:** Given the extension has no stored token, When it needs one, Then it generates a 32-byte random base64url token and stores it in SecretStorage; Given one is stored, Then it reuses it.
- **AC10:** Given the extension spawns the command-palette server, When it starts the process, Then the process env contains `BCTB_HTTP_TOKEN` with the stored token.
- **AC11:** Given `MCPClient` is created with a token, When it sends any request (`/rpc`, `/health`, …), Then it sends `Authorization: Bearer <token>`; Given no token, Then it sends no `Authorization` header.
- **AC12:** Given the token, When the extension logs to its output channel, Then the token value never appears.

## Non-goals
- A `bctb.mcp.token` setting for servers started outside the extension (the `bctb.mcp.url` path sends the stored token; a server started by hand can be given the same token later).
- TLS for HTTP mode.
- Retiring HTTP mode in favour of stdio.

## Telemetry (Rule 13)
- MCP: an event when a request is rejected, with the reason (`origin`, `host`, `token`), at most once per reason per server process (so an attacking page cannot flood telemetry). No path, host, origin or token values.
- MCP: whether HTTP mode started with a token required (a property on the HTTP start, or a dedicated event).
- Extension: none beyond existing events. The token is generated silently and never leaves the machine; nothing about it is worth tracking, and its value must never be tracked.

## Verification
| AC | Test | Status |
|---|---|---|
| AC1 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC1: rejections carry no CORS headers", "AC1: /health carries no CORS headers" | verified |
| AC2 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC2: %s with Origin is refused with 403 origin_not_allowed", "AC2: POST /rpc with Origin is refused before the body is handled" | verified |
| AC3 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC3: Host %s is loopback", "AC3: loopback bind accepts Host %s:<port>" | verified |
| AC4 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC4: Host %p is not loopback", "AC4: loopback bind refuses Host %s with 403 host_not_allowed", "AC4: a request without Host is refused (by Node, 400) before any route runs", "AC4: a rebinding Host on the default bind is refused" | verified |
| AC5 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC5: non-loopback bind skips the Host check but still refuses Origin" | verified |
| AC6 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC6: Authorization %p matches = %p", "AC6: token set, Authorization %p is refused with 401", "AC6: token set, the right Bearer token reaches the route", "AC6: BCTB_HTTP_TOKEN makes /health require the token" | verified |
| AC7 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC7: normalizeToken(%p) = %p", "AC7: without a token the startup output says so once", "AC7: with a token the startup output does not claim no token is required" | verified |
| AC8 | `packages/mcp/src/__tests__/http-guard.test.ts` — "AC8: rejection log names method, path and reason, never the token", "AC8: telemetry onReject fires at most once per reason" | verified |
| AC9 | `packages/extension/src/__tests__/httpToken.test.ts` — "AC9: generates and stores a token when none is stored", "AC9: reuses a stored token without storing again", "AC9: falls back to an in-memory token when SecretStorage fails" | verified |
| AC10 | `packages/extension/src/__tests__/httpToken.test.ts` — "AC10: withHttpToken adds BCTB_HTTP_TOKEN and keeps the rest without mutating" | verified |
| AC11 | `packages/extension/src/__tests__/mcpClient.test.ts` — "AC11: sends Authorization: Bearer <token> when created with a token", "AC11: no Authorization header without a token" | verified |
| AC12 | `packages/extension/src/__tests__/mcpClient.test.ts` — "AC12: error logging never contains the token" | verified |

## Links
- Issue: #147
- Depends on: #145 (loopback bind, `httpBind.ts`), PR #146
- Plan(s): docs/plans/done/mcp-http-origin-host-token.md
- PR(s): (to be added)
