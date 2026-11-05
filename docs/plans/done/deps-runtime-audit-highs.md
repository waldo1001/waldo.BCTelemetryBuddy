---
topic: deps-runtime-audit-highs
status: done
created: 2026-11-05
spec: spec-lite
---

# Plan: clear the runtime npm audit highs on main

## Spec-lite
- Intent: `npm audit --omit=dev` reports 4 high advisories in dependencies that ship in the MCP server and the extension. This blocks the security scan for every cycle, currently #150. Clear them within current majors.
- **AC1:** Given the updated lockfile, When `npm audit --omit=dev` runs at the root, Then it reports 0 high and 0 critical.
- **AC2:** Given the updated dependencies, When the build and all package test suites run, Then they pass with the same test counts as `main`.
- **AC3:** Given the zod bump, When the MCP server lists its tools, Then each tool's input schema, as sent to clients, is the same as on `main`.
- Eligibility: chore, blast radius low-risk

## Task
Bump `zod`, `follow-redirects` and `@azure/identity` to patched versions within their current majors.

## Scope boundary
- IN: the three bumps, the lockfile, the debt register, changelogs.
- OUT: dev-only findings (5 high, 1 critical remain, none ship; see Out-of-scope follow-ups); a CI audit gate; `--force`; major upgrades; any #150 file; releasing.

## Files to create / touch
| File | Change |
|---|---|
| `packages/mcp/package.json` | `zod` `^4.3.6` to `^4.6.7` (direct) |
| `package-lock.json` | see below |
| `docs/security/dependency-debt.md` | new "Remediated" section, review date |
| `packages/mcp/CHANGELOG.md`, `packages/extension/CHANGELOG.md` | `[Unreleased]` entries |
| `docs/PromptLog.md`, `docs/DesignWalkthrough.md` | Rule 2 appends |

| Package | From | To | Advisory | Runtime path |
|---|---|---|---|---|
| zod | 4.3.6 | 4.6.7 | GHSA-mrhx-c7xc-m3w5 (<4.6.6) | MCP directly, and through the MCP SDK |
| follow-redirects | 1.16.1 | 1.16.2 | GHSA-mrwp-f3q8-3g9p (>=1.16.0 <=1.16.1) | axios, in MCP and extension |
| @azure/identity | 4.14.0 | 4.14.1 | carries the next row | applicationinsights, in MCP |
| @azure/msal-node (nested) | 6.0.1 | removed | GHSA-xcx6-jx8p-x3h5 (>=5.0.0-beta.0 <7.1.0) | identity 4.14.1 needs `^7.1.0`, satisfied by the existing top-level 7.1.1 |

No `overrides` needed: follow-redirects and identity are in-range lockfile updates.

## Interface
None. No source changes are expected. If zod's type changes require one, I stop and report rather than widening this PR.

## Dependencies
`mcpSdkServer.ts` is the only zod consumer: it builds Zod shapes from `TOOL_DEFINITIONS` (string, number, boolean, enum, array, record, unknown, plus `.optional()`), and the MCP SDK converts them to JSON Schema for clients. `@modelcontextprotocol/sdk` 1.32.1 accepts `^3.25 || ^4.0`.

## RED test list
There is no failing unit test to write for a dependency bump. The red state is measured instead:
- AC1: red now, 4 high on `npm audit --omit=dev`. Simulated on a scratch copy of `main`'s manifests and lockfile: 0 of any severity, 83-line lockfile diff.
- AC2: existing suites. Baseline on `main`: 329 shared, 949 MCP, 482 extension.
- AC3: one-off comparison, not committed. Dump every tool's listed input schema on `main`'s zod and on 4.6.7, then diff. Differences get reported, not explained away.
- seams touched: none

## Telemetry (Rule 13)
None: dependency chore with no feature surface.

## Open questions / assumptions
- Assumption: msal-node's advisory concerns the authorization code flow, which the identity path here doesn't use. This doesn't change the fix.
- `npm audit fix --omit=dev` prunes devDependencies from `node_modules`, so I edit the manifest and use `npm update --package-lock-only`, then `npm ci`.

## Risks
- Zod 4.3 to 4.6 is a minor bump across three releases and could change generated JSON Schema. AC3 checks this directly, because a change would reach every MCP client.
- `npm ci` replaces `node_modules`, and #150's branch needs another `npm ci` when I return to it.
- `@azure/identity` now shares `msal-node` 7 with `packages/shared`, where it had its own 6.x copy. It's only used by App Insights telemetry through `applicationinsights`. A break would surface in telemetry startup. The suites cover startup with telemetry mocked, so a live MCP smoke run is included in verification.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - No config, tool, command or file-format change. Observable behaviour only changes if a bump regresses something.
  - Rollback is reverting one commit.
- **Who/what could break:** MCP clients, if tool schemas shift (AC3); MCP telemetry, if identity misbehaves on msal 7. Not saved queries or KB cache. The extension only takes follow-redirects through axios.
- **Detection:** AC1 to AC3, Dependency Review on the PR, the MCP smoke run, and after release a drop in MCP telemetry volume.
- **Version bump:** none in this PR. Patch-level at next release, alongside whatever else ships.

## Verification
1. `npm ci`, then `npm audit --omit=dev`
2. `npm run build`, then tests with coverage for all three packages
3. AC3 schema diff
4. Start the built MCP server over stdio, list tools, confirm it starts cleanly
5. `/security-scan`

## Out-of-scope follow-ups
- Dev-only `npm audit` findings: 5 high and 1 critical remain, including `handlebars`, in tools that don't ship. Recorded in the debt register.
- CI has no audit gate: Dependency Review only sees a PR's diff, which is how these reached `main` unnoticed. A scheduled `npm audit --omit=dev` would catch them early.
