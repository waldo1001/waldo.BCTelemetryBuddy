---
topic: runtime-dependency-remediation-oct-2026
status: done
created: 2026-10-23
spec: spec-lite
---

# Plan: Remediate runtime npm-audit findings (#135)

## Spec-lite
- Intent: clear the high and critical npm advisories in dependencies that ship in the MCP server and the extension. They are already on `main` and were found by the #134 security scan. All of them have fixes within the current major versions.
- **AC1:** Given `packages/shared`, `packages/mcp` and `packages/extension`, When `npm audit --omit=dev --audit-level=high` runs in each, Then it reports 0 high and 0 critical findings. If an advisory turns out to have no fix within its major, it is listed by name in `docs/security/dependency-debt.md` with the reason, and that is the only exception.
- **AC2:** Given the direct dependency ranges, When `package.json` files are read, Then `axios` is `^1.20.0` (shared, extension), `@modelcontextprotocol/sdk` is `^1.32.1` (mcp), and `express` is `^4.22.3` (mcp). No dependency changes major version.
- **AC3:** Given the updated lockfile, When `npm run build` and `npm test` run (all three packages), Then everything is green with coverage at its thresholds. And the built stdio MCP server, smoke-tested by piping `initialize` + `tools/list` JSON-RPC into `node packages/mcp/dist/launcher.js`, answers both with the same tool list as before (tool names diffed).
- **AC4:** Given the PR, When CI runs, Then `Dependency Review` passes (the bumps remove advisories rather than add them).
- **AC5:** Given `docs/security/dependency-debt.md`, When it is read, Then the "Open — tracked in #135" section has moved to "Remediated", with versions before and after. OpenTelemetry "Deferred #1" is marked resolved, or narrowed to what remains.
- Eligibility: chore (dependency remediation), blast radius `low-risk` (see below).

## Task
Bump three direct dependency ranges and refresh transitive dependencies within their ranges, so the runtime npm audit is clean.

## Scope boundary
- **IN:** `package.json` ranges for axios, @modelcontextprotocol/sdk and express; root `package-lock.json` plus the per-package lockfiles; in-range transitive updates (follow-redirects 1.16.1, proxy-addr 2.0.8, fast-uri ≥3.1.8 within 3.x, ip-address 10.7.4, @grpc/grpc-js 1.14.6, the OpenTelemetry / @azure/monitor-opentelemetry cluster as `npm audit fix` resolves it without `--force`); `dependency-debt.md`; CHANGELOGs.
- **OUT:** dev-only findings (the jest 29 chain, handlebars, @vscode/vsce, secretlint, markdown-it, undici). Those need major bumps and don't ship. Also out: express 5 and fast-uri 4 (major versions), and any `npm audit fix --force`.

## Files to create / touch
| Path | Change |
|---|---|
| `packages/shared/package.json`, `packages/extension/package.json` | `axios` → `^1.20.0` |
| `packages/mcp/package.json` | `@modelcontextprotocol/sdk` → `^1.32.1`, `express` → `^4.22.3` |
| `package-lock.json` (+ `packages/*/package-lock.json` if npm updates them) | regenerated |
| root `package.json` `overrides` | **only if** a transitive dependency stays vulnerable after the refresh. It is pinned within the same major, using `npm update <pkg> --package-lock-only` and then `npm ci`, per the lockfile-v2 gotcha. |
| `docs/security/dependency-debt.md`, `packages/mcp/CHANGELOG.md`, `packages/extension/CHANGELOG.md` | Phase 9 |

## Interface
No source code changes expected. If the MCP SDK minor bumps (1.26 → 1.32) change a type the code uses, the compile error will say where, and the fix stays minimal and type-only.

## Dependencies
npm 10/11 workspaces; the existing Jest suites; the `esbuild` bundles (the MCP SDK and axios are bundled into `dist/server.js` and `dist/cli.js`, and into the extension).

## RED test list
This is dependency remediation, so it adds no new behavior to test. The checks before and after are:
| AC | Check | RED today |
|---|---|---|
| AC1 | `npm audit --omit=dev --audit-level=high` ×3 | ✅ fails now: 1 critical, 11 high (mcp); 3 high (shared, extension) |
| AC2 | read `package.json` ranges | ✅ the old ranges |
| AC3 | full `npm test` + build + stdio smoke (`initialize`, `tools/list`) | the baseline is green now; it must stay green |
| AC4 | Dependency Review on the PR | checked in CI |
| AC5 | debt doc review | — |

The existing `mcp-sdk-server.test.ts`, `stdio-logging.test.ts` and `toolHandlers.test.ts` are the guard against changes in MCP SDK behavior.

## Telemetry
No new events: there is no new feature surface. The OpenTelemetry and Azure Monitor bump does touch the **usage-telemetry transport**, so as a regression guard the smoke run confirms the server starts with telemetry initialized and that `Mcp.ServerStarted` reaches `trackEvent`. The existing `mcpTelemetry.test.ts` must stay green.

## Open questions / assumptions
- **Assumption:** `npm audit fix --omit=dev` without `--force` is enough. The dry run on 2026-10-23 showed in-range fixes for every runtime finding, including the OpenTelemetry cluster (sdk-node 0.208 → 0.221, core 2.1/2.2 → 2.10/2.12). If it leaves something, I'll use overrides within the same major, and anything still left goes into the debt doc under AC1.
- **Assumption:** this cycle bumps no version. The release happens after #137, so that the first OIDC publish ships these fixes.

## Risks
- **The MCP SDK goes from 1.26 to 1.32**, six minor versions. Protocol negotiation, `oninitialized` hooks or resource templates could behave differently. AC3's smoke test and the SDK tests catch that.
- **The OpenTelemetry jump** (about 13 minor versions in the experimental 0.x packages) could change what usage telemetry exports, or fail silently. The smoke test checks that telemetry initializes. After release, watch the `TB-MCP-001` volume in usage telemetry for a drop.
- **Lockfile churn makes Dependency Review flag** a newly pulled-in transitive dependency. AC4 catches it; fix with an override.
- **Rollback:** revert one commit (manifests and lockfile only).

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Every change stays within its current major. No config, tool schema, on-disk format or command changes.
  - Users only see different behavior if a minor version of the MCP SDK, axios or OpenTelemetry has a regression.
- **Who/what could break:**
  - MCP tool consumers, through MCP SDK behavior changes.
  - The telemetry pipeline, through the OpenTelemetry/Azure Monitor transport.
  - Extension users, through axios on HTTP calls.
  - CI (Dependency Review).
- **Detection:**
  - The full test suites.
  - The stdio smoke test diffing the tool list.
  - The CI matrix on 22.x/24.x and three operating systems.
  - Dependency Review.
  - After release: the volume of `TB-MCP-001`/`TB-EXT-*` events in usage telemetry, and user reports of failing queries.

## Out-of-scope follow-ups
- Dev-only advisories (jest 30, `@vscode/vsce`, etc.): a separate dev-tooling cycle.
- A scheduled `npm audit` job, so findings on `main` show up continuously (already listed as a recommendation in `dependency-debt.md`).

## Outcome (2026-10-23)
- AC1 ✅ `npm audit --omit=dev`: 0 high, 0 critical in shared, mcp and extension. The 2 moderate findings left (`uuid` via `@azure/msal-node`, which needs a major) stay under Deferred #2.
- AC2 ✅ axios ^1.20.0, @modelcontextprotocol/sdk ^1.32.1, express ^4.22.3.
- AC3 ✅ build clean; shared 329, mcp 826 and extension 470 tests pass, coverage unchanged; the stdio smoke test returns protocol 2025-06-18 and the same 16 tools. `applicationinsights` 3.17.0 runs setup and trackEvent with no errors.
- AC4 verified by Dependency Review on the PR.
- AC5 ✅ `dependency-debt.md`: new "Remediated (2026-10-23 pass, #135)" section; Deferred #1 marked resolved.
- Gotcha: `npm audit fix --omit=dev` *prunes devDependencies from node_modules* (jest/tsc/esbuild vanish), though the lockfile stays intact. Run `npm ci` afterwards.
