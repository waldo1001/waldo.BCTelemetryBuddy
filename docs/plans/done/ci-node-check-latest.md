---
topic: ci-node-check-latest
status: done
created: 2026-10-23
spec: spec-lite
---

# CI: always use the latest patched Node.js

## Spec-lite
- Intent: CI and release jobs request `22.x` / `24.x` without `check-latest`, so `actions/setup-node` uses the runner's cached version. CI run 39940336382 (2026-10-23) ran on **Node v22.23.3**, which lacks the October 2026 Node.js security fixes (CVE-2026-111497 Brotli, CVE-2026-105483/106069 TLS). Builds and releases must run on the patched floor that #134 set for users.
- **AC1:** Given any `actions/setup-node` step in `.github/workflows/*.yml`, When the workflow runs, Then it resolves the newest release of the requested line (`check-latest: true`), never a stale cached version.
- Eligibility: chore (CI hardening), blast radius `low-risk`.

## Task
Add `check-latest: true` to every `actions/setup-node@v7` step, guarded by a consistency test.

## Scope boundary
- IN: the 13 `setup-node` steps in `ci.yml`, `codeql.yml`, `release-extension.yml`, `release-mcp.yml`; one new test in `node-floor-consistency.test.ts`.
- OUT: pinning exact versions; root `@types/node ^18` (types only, no runtime effect); HTTP mode `app.listen(port)` binding all interfaces; product code (already warns on unpatched runtimes since MCP 3.7.1 / extension 3.4.4).

## Files to create / touch
- `.github/workflows/ci.yml` (steps at lines 24, 79, 130, 168, 211, 229)
- `.github/workflows/codeql.yml` (38)
- `.github/workflows/release-extension.yml` (27, 146, 209)
- `.github/workflows/release-mcp.yml` (38, 161, 230)
- `packages/mcp/src/__tests__/node-floor-consistency.test.ts`
- `docs/PromptLog.md`, `docs/DesignWalkthrough.md` (fast append)

## Interface
None (YAML `with: check-latest: true`).

## Dependencies
`actions/setup-node@v7` `check-latest` input (queries the Node.js dist manifest, downloads if the cache is older).

## RED test list
- AC1: every `uses: actions/setup-node` step has `check-latest: true` in its `with:` block
  - test file: packages/mcp/src/__tests__/node-floor-consistency.test.ts
  - test name: "AC8: every setup-node step sets check-latest: true"
  - seams touched: none (reads workflow files)
  - edge cases: setup-node step without `with:`; multiple steps per file

## Telemetry (Rule 13)
Not applicable: CI configuration only, no product behavior change. No new event IDs.

## Open questions / assumptions
- Assumption: the extra manifest lookup + possible download adds a few seconds per job; acceptable.

## Risks
- A Node.js release published mid-run could make jobs in one run use different patch versions. Harmless within a release line.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - No shipped code, config, or API changes; only which Node patch version CI/release jobs run on.
  - Rollback = revert one commit.
- **Who/what could break:** CI (a new Node patch could surface a test incompatibility earlier than before).
- **Detection:** CI run fails on the PR; "Setup Node.js" log must show `node: v22.23.4` or later instead of `Found in cache @ .../22.23.3`.

## Out-of-scope follow-ups
- Root `@types/node` `^18.0.0` → `^22.18.11` (cosmetic alignment).
- MCP HTTP mode `app.listen(port)` in `packages/mcp/src/server.ts:1489` binds all interfaces; consider `127.0.0.1` default.
