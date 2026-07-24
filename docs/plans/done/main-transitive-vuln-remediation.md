---
topic: main-transitive-vuln-remediation
status: done
created: 2026-07-21
spec: spec-lite
---

## Spec-lite
- Intent: Reduce `main`'s latent transitive-dependency advisories by pinning the **cleanly-fixable leaf packages** (a patched version exists in the same major line) via a root npm `overrides` block, and **document the remainder** (the OpenTelemetry / Azure Monitor / applicationinsights cluster and major-bump-only deps) as upstream-pending accepted risk. No application code changes.
- **AC1:** Given `main`'s current tree, When the `overrides` block below is added and `npm install` regenerates the lockfile, Then each targeted package resolves to a patched version and `npm audit` no longer flags any of the 8 targeted packages.
- **AC2:** Given the change, When `npm ci`, `npm run build`, and `npm test` run, Then they pass (no regression in load-bearing deps — axios, gRPC, protobufjs, markdown-it).
- **AC3:** Given the excluded advisories, When the remediation lands, Then a security-debt doc records every remaining moderate+ advisory, its fixability, and why it is deferred (upstream-pending or major-bump breakage risk).
- Eligibility: chore, blast radius `low-risk`.

## Task
Add a root `package.json` npm `overrides` block pinning 8 cleanly-fixable leaf transitive deps to patched versions on `main`, verify build+tests, and document the deferred remainder.

## Scope boundary
- IN: root `package.json` (`overrides`), `package-lock.json` (regenerated), a new security-debt doc, this plan file.
- OUT: any `packages/**/src` source. The OTel / Azure Monitor / applicationinsights cluster (no clean forward fix — would need an `applicationinsights` major downgrade). Major-bump / multi-major-line deps (uuid, undici, fast-uri, linkify-it, @nevware21/ts-utils, brace-expansion, js-yaml) — breakage risk, deferred. No `applicationinsights` downgrade. No workflow changes.

## Files to create / touch
- `package.json` (add `overrides`)
- `package-lock.json` (regenerated — not hand-edited)
- `docs/security/dependency-debt.md` (new — deferred-advisory register)
- `docs/plans/main-transitive-vuln-remediation.md` (this file)

## Interface
No public interface change. New `package.json` field:
```json
"overrides": {
  "hono": "^4.12.31",
  "protobufjs": "^7.6.5",
  "form-data": "^4.0.6",
  "tmp": "^0.2.7",
  "qs": "^6.15.3",
  "@grpc/grpc-js": "^1.14.4",
  "markdown-it": "^14.3.0",
  "axios": "^1.18.1"
}
```
Each target is a patch/minor bump within the package's existing major (advisory minimums: hono <=4.12.24, protobufjs <=7.6.4, form-data 4.0.0-4.0.5, tmp <0.2.6, qs 6.11.1-6.15.1, @grpc/grpc-js 1.14.0-1.14.3, markdown-it <=14.1.1, axios 1.0.0-1.17.0). `markdown-it@^14.3.0` is expected to also clear the `linkify-it` advisory transitively; if it does not, `linkify-it` moves to the deferred register (no same-major patch).

## Dependencies
- `@grpc/proto-loader` requires `protobufjs: ^7.5.5` → `^7.6.5` satisfies it (stay in 7.x; do NOT force 8.x). `main` has no protobufjs 8.x consumer.
- All other overrides stay within the consumers' declared major ranges.

## RED test list
No new unit test — dependency-resolution change. Verification is external:
- **AC1:** `npm audit --json` shows none of the 8 targeted packages flagged; `npm ls <pkg>` shows the patched version, no `invalid`. — seams: none
- **AC2:** `npm ci` exit 0 (lockfile in sync) + `npm run build` exit 0 + `npm test` all suites pass. — seams: none
- **AC3:** `docs/security/dependency-debt.md` exists and lists every remaining moderate+ advisory with fixability + deferral reason. — seams: none

## Telemetry (Rule 13)
N/A — no new feature/tool, no code path added.

## Open questions / assumptions
- Assumption: global overrides are safe on `main` because no current consumer needs a conflicting major (verified for protobufjs). If any override yields `ELSPROBLEMS`/`invalid` or fails tests, it is dropped to the deferred register and reported — never forced.
- Assumption: lands on branch `chore/deps-main-vuln-remediation` → PR to `main` (not a direct push to `main`).

## Risks
- axios / @grpc/grpc-js / protobufjs are load-bearing (HTTP client, telemetry export). Mitigated: all are patch/minor within-major bumps; full build + test suite gates them; any failure drops that override.
- `npm install` could pull incidental transitive churn. Mitigated: review the lockfile diff; keep it to the targeted packages + their strict requirements.
- markdown-it 14.1.1 → 14.3.0 could alter KB/doc rendering. Mitigated: within-14.x minor; existing tests + KB-index validation guard it.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Only patch/minor within-major bumps of transitive deps; no API/schema/config/on-disk-format change. Rollback = revert one commit.
  - Load-bearing deps (axios, gRPC, protobufjs) are gated by the full test suite; any regression fails CI before merge.
- **Who/what could break:** CI build/test; in the worst case the MCP HTTP client (axios) or telemetry export (gRPC/protobufjs). Not: MCP tool contracts, extension users, saved queries, KB cache, on-disk formats.
- **Detection:** `npm ci` + build + test on the PR; post-merge, an MCP query failure (axios) or missing telemetry (gRPC) would surface it.

## Out-of-scope follow-ups
- **Deferred advisories** (recorded in `docs/security/dependency-debt.md`): the OTel/Azure Monitor/applicationinsights cluster (~30, upstream-pending) and major-bump deps (uuid, undici, fast-uri, linkify-it, @nevware21/ts-utils, brace-expansion, js-yaml). Revisit when OTel/appinsights ship patched releases, or in a dedicated major-bump cycle with per-dep testing.
- Add a scheduled `npm audit` / Dependabot job so `main`'s transitive vulns surface continuously.
