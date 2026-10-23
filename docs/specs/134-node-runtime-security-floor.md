---
spec: 134-node-runtime-security-floor
issue: 134
status: draft
created: 2026-10-23
approved:
plans: []
---

# Spec: Node.js runtime security floor (drop EOL Node 20, warn on unpatched runtimes)

## Intent
The [Node.js October 21, 2026 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases) fixes 10 CVEs. Four are rated high, including CVE-2026-111497: an out-of-bounds write in the Brotli decoder that can lead to remote code execution. Two others bypass TLS hostname verification. The fixed versions are 22.23.4, 24.22.1 and 26.12.1, and End-of-Life lines are always affected. BC Telemetry Buddy's own code is not vulnerable. It does run on the user's Node runtime, though, and it uses the affected areas: axios and `fetch` decompress Brotli HTTP responses automatically. Today the repo still builds and tests on EOL Node 20, declares no supported Node range for the published MCP package, and never tells a user when their runtime is unpatched.

## Actors & scope
- Maintainers and CI: GitHub Actions workflows.
- MCP users: anyone running `bc-telemetry-buddy-mcp` through the extension (bundled `node` from PATH, or global `bctb-mcp`), `npx`, or an MCP host config.
- Packages: `mcp` (startup check, telemetry, `engines`), root `package.json` (`engines`), `.github/workflows/*`.
- IN: CI/release Node matrix, `engines.node` declarations, an MCP startup runtime check (warning plus telemetry).
- OUT: see Non-goals.

## Behavior

### Supported runtime floor
One minimum-version table defines the "security floor", per release line:

| Line | Minimum patched |
|---|---|
| 22.x | 22.23.4 |
| 24.x | 24.22.1 |
| 26.x | 26.12.1 |

A runtime is **unpatched** when it is:
- below 22 (EOL);
- on an odd, non-LTS line (23, 25), which is EOL;
- on 22, 24 or 26 but below that line's minimum.

Lines above 26 (27 and later) count as patched, because they shipped after the fix. The table lives in one place, so a future advisory changes one constant plus the `engines` strings.

### CI and release
- CI test matrices run on `22.x` and `24.x`. `20.x` is removed everywhere.
- Release workflows (extension and MCP) and CodeQL build on `22.x`.
- `actions/setup-node` with an `xx.x` spec resolves to the latest patch, so future security releases are picked up without a workflow change.

### `engines`
- Root `package.json` and `packages/mcp/package.json` declare `"node": "^22.23.4 || ^24.22.1 || >=26.12.1"`.
- Installing on Node 20 or on an unpatched 22/24/26 produces npm's standard `EBADENGINE` warning. npm does not block the install by default, and that is intended.
- The extension's `engines.vscode` is unchanged. The extension host's Node belongs to VS Code.

### MCP startup check
When the MCP server starts, in stdio or HTTP mode, through `cli.ts` or the bundled launcher:
1. It reads `process.versions.node` and checks it against the floor.
2. **Unpatched:** it writes one warning line to **stderr**. stdout is never used, because in stdio mode stdout carries the MCP protocol and any stray byte breaks the session. Example:
   `⚠️  Node.js v24.14.0 is missing security fixes (Node.js Oct 2026 security release, incl. CVE-2026-111497). Upgrade to 22.23.4, 24.22.1 or 26.12.1 or later: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases`
   For an EOL line, the wording says the line is end-of-life and no longer receives fixes.
3. **Unpatched:** it fires one telemetry event (see Telemetry).
4. **Patched:** nothing is logged and no extra event fires.
5. In every case startup continues normally. The check never throws, never delays startup in any noticeable way, and never changes exit codes. If the version string cannot be parsed, the check treats it as "unknown": no warning and no crash.

## Acceptance criteria
- **AC1:** Given the floor table, When a runtime version is classified, Then `20.20.2`, `23.11.0`, `25.0.0`, `22.23.3`, `24.14.0` and `26.10.0` are unpatched, and `22.23.4`, `24.22.1`, `26.12.1` and `27.0.0` are patched.
- **AC2:** Given the MCP server starts on an unpatched runtime, When startup completes, Then exactly one warning line naming the running version and the minimum versions is written to stderr, and nothing extra is written to stdout.
- **AC3:** Given the MCP server starts on an unpatched runtime, When startup completes, Then exactly one runtime-security telemetry event fires with properties `nodeVersion` and `reason` (`eol` | `below-patched`), and no other user, tenant or path data.
- **AC4:** Given the MCP server starts on a patched runtime, When startup completes, Then no runtime-security warning is written and no runtime-security telemetry event fires.
- **AC5:** Given an unpatched or unparseable runtime version, When the MCP server starts, Then it finishes starting and serves requests exactly as on a patched runtime. The check never throws and never sets a non-zero exit code.
- **AC6:** Given the repo's GitHub workflows, When their Node versions are inspected, Then no workflow references `20.x` (or any Node below 22), CI test matrices are exactly `[22.x, 24.x]`, and release and CodeQL jobs use `22.x`.
- **AC7:** Given root `package.json` and `packages/mcp/package.json`, When `engines.node` is read, Then both equal `^22.23.4 || ^24.22.1 || >=26.12.1`, and that range agrees with the startup check's floor table (one test asserts both together, so they cannot drift).

## Non-goals
- Refusing to start, or hard-failing, on an unpatched runtime. The check only warns.
- A VS Code notification or UI surface in the extension for the runtime warning. The warning is visible in the MCP server's output and log. A possible follow-up.
- Checking or influencing the Node.js runtime embedded in VS Code (Electron extension host).
- Disabling Brotli or HTTP decompression in axios or `fetch`. Patching the runtime is the fix, and turning off compression would only hide the exposure.
- Fetching the floor dynamically from nodejs.org (no network call at startup).
- Bumping `@types/node` or changing TypeScript targets.

## Telemetry (Rule 13)
- A new MCP event for "runtime security floor violated", fired once per server start when the runtime is unpatched, with `nodeVersion` and `reason`. The exact event ID is assigned in the plan.
- No event when the runtime is patched. The existing `SERVER_STARTED` already marks a start, so a second "ok" event would only add noise.
- This tells the maintainer how many real installs run unpatched Node, which helps decide when to raise the floor or move it from a warning to a refusal.

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

## Links
- Issue: #134
- Advisory: https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- Plan(s): (to be added)
- PR(s): (to be added)
