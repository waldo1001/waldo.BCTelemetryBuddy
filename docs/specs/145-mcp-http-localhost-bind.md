---
spec: 145-mcp-http-localhost-bind
issue: 145
status: approved
created: 2026-10-23
approved: 2026-10-23
plans: []
---

# MCP HTTP mode: bind to localhost by default

## Intent
The MCP server's HTTP mode calls `app.listen(port)` without a host, so it listens on every network interface. HTTP mode has no authentication and runs with the user's Application Insights access, so anyone on the same network who can reach the port can query the user's Business Central telemetry. Every known client connects through `localhost`. The server must listen on the loopback interface unless the user explicitly asks for something else.

## Actors & scope
Consumers: the VS Code extension's command-palette mode (spawns the bundled server on port 52346 and calls it through `bctb.mcp.url`, default `http://localhost:…`), users running `bctb-mcp start --http` or `BCTB_MODE=http`, and anyone who reaches HTTP mode from another machine or container (the only group whose behavior changes).
- IN: `packages/mcp` HTTP mode bind address; `BCTB_HOST` env var; `host` config key (wherever `port` is accepted: single-profile config, per profile); startup log line; non-loopback warning; telemetry.
- OUT: stdio mode (no network listener); the extension's own code (it keeps using `localhost` URLs).

## Behavior
- **Default:** HTTP mode binds to `127.0.0.1`. The startup line on stderr names the address: `✓ MCP Server v<version> listening on http://127.0.0.1:<port>`.
- **Clients using `localhost`** keep working: a request to `http://localhost:<port>` reaches the server (Node's dual-stack connect falls back from `::1` to `127.0.0.1`).
- **Opt-in:** the bind address comes from, in order: `BCTB_HOST` env var, then the `host` config key (profile value over top-level, the same way `port` resolves), then `127.0.0.1`. Empty or whitespace-only values count as unset. Example: `BCTB_HOST=0.0.0.0 bctb-mcp start --http` listens on all interfaces, as before this change.
- **Non-loopback warning:** when the resolved host is not a loopback address (`127.0.0.0/8`, `::1`, `localhost`), the server writes one warning line to stderr at startup, saying that HTTP mode has no authentication and is reachable from other machines on that interface. stdout is never written.
- **Invalid host:** if `listen` fails (for example `EADDRNOTAVAIL` for an address the machine doesn't have), the server reports the error on stderr naming the host and port, and the process exits non-zero instead of running without a listener.

## Acceptance criteria
- **AC1:** Given no `BCTB_HOST` and no `host` in config, When HTTP mode starts, Then the server listens on `127.0.0.1` only and not on any other interface.
- **AC2:** Given the default bind, When a client requests `http://localhost:<port>/health` (or an equivalent existing route), Then it gets a successful response.
- **AC3:** Given `BCTB_HOST` is set, When HTTP mode starts, Then it listens on that host, even if config has a different `host`.
- **AC4:** Given no `BCTB_HOST` and `host` in config (top-level or in the active profile), When HTTP mode starts, Then it listens on the config host, the profile value winning over the top-level one.
- **AC5:** Given an empty or whitespace-only `BCTB_HOST` or `host`, When HTTP mode starts, Then it is treated as unset.
- **AC6:** Given any resolved host, When HTTP mode is listening, Then the stderr startup line includes `http://<host>:<port>`.
- **AC7:** Given a non-loopback host (for example `0.0.0.0`), When HTTP mode starts, Then exactly one warning line about missing authentication and network exposure goes to stderr and the non-loopback telemetry event fires once; Given a loopback host, Then neither happens.
- **AC8:** Given a host the machine cannot bind, When HTTP mode starts, Then stderr names the host and port and the process exits with a non-zero code.
- **AC9:** Given stdio mode, When the server starts, Then nothing about host binding changes or is logged.

## Non-goals
- `Access-Control-Allow-Origin: *` on HTTP mode (a web page in the user's browser can still call `localhost`) and authentication for HTTP mode — separate issue.
- A `--host` CLI flag (env var and config cover it; can be added later).
- Changing the extension's `bctb.mcp.url` default.

## Telemetry (Rule 13)
- One event when HTTP mode starts bound to a non-loopback host, with whether the host came from the env var or config and whether it is a wildcard (`0.0.0.0` / `::`) or a specific address. The address itself is never sent.
- No event for the default loopback bind (the existing server-start event already covers it).

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

## Links
- Issue: #145
- Plan(s): (to be added)
- PR(s): (to be added)
- Found during: #144 (Node.js October 2026 CVE review)
