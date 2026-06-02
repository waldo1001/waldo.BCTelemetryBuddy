---
topic: mcp-bin-package-name-alias
status: done
created: 2026-06-02
---

## Task
Restore `npx -y bc-telemetry-buddy-mcp start` by adding a `bin` entry named after the package, broken in v3.5.0 when multiple bins were introduced.

## Scope boundary
- IN: add `"bc-telemetry-buddy-mcp": "./dist/cli.js"` to the `bin` map in `packages/mcp/package.json`; add a regression test asserting the package-name bin exists and points to the CLI entry; CHANGELOG entry.
- OUT: changing how the server launches, fixing the cache-dir ENOENT issue, silencing the App Insights metrics-quota log spam (separate follow-ups). No version bump performed in this cycle (handled by the `/release` flow afterward).

## Root cause (confirmed by reproduction)
- v3.3.x exposed a single bin (`bctb-mcp`), so `npx bc-telemetry-buddy-mcp` auto-ran it.
- v3.5.0 (commit `d3f7c55`) added `bctb-setup`, `bctb-setup-endpoints`, `bctb-setup-write-config`. With **multiple** bins and **none matching the package name**, `npx <pkg>` errors `could not determine executable to run` and exits 1 → Claude Desktop reports "Server disconnected / could not attach."
- Verified: `npx -y bc-telemetry-buddy-mcp start …` → exit 1; `npx -y -p bc-telemetry-buddy-mcp bctb-mcp start …` → exit 0, clean JSON-RPC on stdout.

## Files to create / touch
- packages/mcp/package.json — add the package-name bin alias.
- packages/mcp/src/__tests__/package-bin.test.ts — new regression test (reads package.json).
- packages/mcp/CHANGELOG.md — fix entry.

## Interface
`package.json` `bin` map becomes:
```json
"bin": {
  "bc-telemetry-buddy-mcp": "./dist/cli.js",
  "bctb-mcp": "./dist/cli.js",
  "bctb-setup": "./dist/scripts/setup.js",
  "bctb-setup-endpoints": "./dist/scripts/list-endpoints.js",
  "bctb-setup-write-config": "./dist/scripts/write-config.js"
}
```
No runtime/TypeScript interface change. `dist/cli.js` already carries the `#!/usr/bin/env node` shebang (build:cli banner), so it is a valid bin target.

## Dependencies
None new. Relies on existing `build:cli` esbuild step that emits `dist/cli.js` with a shebang.

## RED test list
- AC1: the `bin` map contains a key exactly equal to the package `name`, so `npx <pkg>` resolves.
  - test file: packages/mcp/src/__tests__/package-bin.test.ts
  - test name: "exposes a bin named after the package so `npx bc-telemetry-buddy-mcp` resolves"
  - seams touched: none (reads package.json from disk)
  - edge cases: bin map present but missing the package-name key (the v3.5.0 regression state)
- AC2: the package-name bin points to the same CLI entry as `bctb-mcp` (`./dist/cli.js`).
  - test file: packages/mcp/src/__tests__/package-bin.test.ts
  - test name: "package-name bin points to the CLI entry (dist/cli.js)"
  - seams touched: none
  - edge cases: alias accidentally pointed at a setup script instead of the CLI

## Telemetry (Rule 13)
N/A — packaging metadata fix, not a new feature, tool, or command. No event ID or `trackEvent` call applies. (Confirmed against Rule 13 scope: telemetry is required for new features/tools, not for `package.json` bin metadata.)

## Open questions / assumptions
- Assumption: keeping `bctb-mcp` is required — existing globally-installed users and the agent CI templates call `bctb-mcp` directly (`bctb-mcp --version`, `bctb-mcp start`), so it must stay.
- Assumption: this ships as a patch release (3.5.1) via the normal `/release` flow after the cycle; no major bump (additive, backward compatible).

## Risks
- Low. Adding a bin key is purely additive; no existing bin name changes. Worst case a stale npx cache keeps serving the broken 3.5.0 until users get the new patch — mitigated by the immediate workaround (`-p bc-telemetry-buddy-mcp bctb-mcp`).

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Additive `bin` entry; no existing bin renamed or removed, no runtime code touched.
  - Restores previously-working behavior (`npx <pkg> start`) that v3.5.0 regressed; cannot make the current broken state worse.
  - Backward compatible: `bctb-mcp` and the `bctb-setup*` bins are unchanged, so global installs and CI templates keep working.
- **Who/what could break:** none expected. The only consumers of the `bin` map are npx/global-install resolution; adding a name can't shadow an existing one.
- **Detection:** the new `package-bin.test.ts` fails if the alias is ever dropped again; in the field, a regression resurfaces as Claude Desktop "Server disconnected" + `npm error could not determine executable to run` in `~/Library/Logs/Claude/mcp-server-*.log`.

## Out-of-scope follow-ups
- Cache dir resolving to `/.vscode/.bctb/cache` when `BCTB_WORKSPACE_PATH` is unset (cwd = `/`) — fall back to a writable dir.
- App Insights `PeriodicExportingMetricReader` "Daily quota exceeded" stderr flood — disable pre-aggregated/standard metrics or quiet the OTel diag logger.
- **Pre-existing `npm audit` high findings (not introduced by this cycle):** 4 high in the `applicationinsights` → OpenTelemetry runtime chain — `@opentelemetry/sdk-node`, `@opentelemetry/exporter-prometheus` (Prometheus exporter crash), `@azure/monitor-opentelemetry`, and `fast-uri` (path traversal / host confusion). Same OTel chain as the metrics-flood follow-up above; addressing both together (bump/replace `applicationinsights@^3.12.0` or trim the OTel exporters) is the natural fix. Confirmed baseline via `git diff HEAD` — no deps changed in this cycle.
