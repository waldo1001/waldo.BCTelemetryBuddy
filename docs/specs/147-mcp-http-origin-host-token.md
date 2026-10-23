---
spec: 147-mcp-http-origin-host-token
issue: 147
status: draft
created: 2026-10-23
approved:
plans: []
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
3. **Host (loopback bind only).** When the server listens on a loopback address (#145 default), the `Host` header's hostname must be `localhost`, an address in `127.0.0.0/8`, or `[::1]` (any port, case-insensitive). Anything else, or a missing `Host`, gets `403 { "error": "host_not_allowed" }`. When the user opted in to a non-loopback bind (`BCTB_HOST`), the Host check is skipped (we can't know the names they use) and the Origin and token checks still apply.
4. **Token.** When `BCTB_HTTP_TOKEN` is set and non-empty, every request (including `/health`) needs `Authorization: Bearer <token>`, compared in constant time. Missing or wrong → `401 { "error": "unauthorized" }`. When it is unset, no token is required (hand-started servers and the Debug launch configs keep working), and the startup output says so in one line.
- **Non-loopback warning (#145)** adds: "set BCTB_HTTP_TOKEN" when no token is configured.
- **Extension token.** On first need the extension generates a token (32 random bytes, base64url) and stores it in VS Code SecretStorage, so it is the same for every window and survives restarts. It passes it as `BCTB_HTTP_TOKEN` to the command-palette server it spawns, and `MCPClient` sends `Authorization: Bearer <token>` on every request in both connection paths, so a server reused on `EADDRINUSE` (spawned by another window) accepts it, and a server without a token ignores the header. The token never appears in the output channel, logs or telemetry.

## Acceptance criteria
- **AC1:** Given HTTP mode, When any request is answered, Then no `Access-Control-Allow-*` header is present.
- **AC2:** Given HTTP mode, When a request carries an `Origin` header (including `OPTIONS` preflights), Then the response is `403` with `origin_not_allowed` and the route does not run.
- **AC3:** Given a loopback bind, When `Host` is `localhost:<port>`, `127.0.0.1:<port>`, `127.5.6.7:<port>` or `[::1]:<port>` (any case), Then the request passes the Host check.
- **AC4:** Given a loopback bind, When `Host` is anything else (for example `attacker.example:52346`, `192.168.1.10:52346`) or missing, Then the response is `403` with `host_not_allowed`.
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
| AC1 | planned | planned |
| AC2 | planned | planned |
| AC3 | planned | planned |
| AC4 | planned | planned |
| AC5 | planned | planned |
| AC6 | planned | planned |
| AC7 | planned | planned |
| AC8 | planned | planned |
| AC9 | planned | planned |
| AC10 | planned | planned |
| AC11 | planned | planned |
| AC12 | planned | planned |

## Links
- Issue: #147
- Depends on: #145 (loopback bind, `httpBind.ts`), PR #146
- Plan(s): (to be added)
- PR(s): (to be added)
