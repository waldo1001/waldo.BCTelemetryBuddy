# Dependency Security Debt

Register of known transitive-dependency advisories on `main` that are **not** currently
remediated, why they're deferred, and when to revisit. Companion to the remediation in
[docs/plans/done/main-transitive-vuln-remediation.md](../plans/done/main-transitive-vuln-remediation.md).

- **Last reviewed:** 2026-07-24 (`npm audit`, pre-release scan for extension v3.4.3)
- **Snapshot at review:** 44 advisories remaining (4 high, 36 moderate, 4 low across the three packages, with overlap) — all four highs are the deferred OpenTelemetry cluster below; `packages/shared` and `packages/extension` have **zero high**.
- Previous review 2026-07-21: 40 moderate+ (8 high, 30 moderate, 2 low) — down from 50 before remediation.
- These are **latent**: `dependency-review-action` only runs on PRs and only flags the PR *diff*, so `main`'s unchanged transitive deps block no CI. A PR that regenerates the lockfile can surface any of these (that is exactly what happened on PR #127).

## Remediated (this pass)

Pinned to patched versions within the existing major line — see the `overrides` block in the root
[package.json](../../package.json) plus the `axios` direct-dependency bump in
`packages/shared` and `packages/extension`:

| Package | → Version | Advisory range cleared |
|---|---|---|
| hono | ^4.12.31 | ≤4.12.24 |
| protobufjs | ^7.6.5 | ≤7.6.4 |
| form-data | ^4.0.6 | 4.0.0–4.0.5 |
| tmp | ^0.2.7 | <0.2.6 |
| qs | ^6.15.3 | 6.11.1–6.15.1 |
| @grpc/grpc-js | ^1.14.4 | 1.14.0–1.14.3 |
| markdown-it | ^14.3.0 | ≤14.1.1 (also cleared `linkify-it` transitively) |
| axios | ^1.18.1 (direct-dep bump) | 1.0.0–1.17.0 |

## Remediated (2026-07-24 pass, pre-release v3.4.3)

New high advisories published after the 2026-07-21 review, cleared with in-range lockfile
bumps (`npm update <pkg> --package-lock-only`, no overrides needed):

| Package | → Version | Path (runtime?) |
|---|---|---|
| @nevware21/ts-utils | 0.16.0 | @vscode/extension-telemetry → extension **runtime** (ships in .vsix) |
| fast-uri | 3.1.4 | @modelcontextprotocol/sdk → MCP **runtime** |
| undici | 7.28.0 | @vscode/vsce (dev-only) — in-range fix landed, removed from deferred table below |
| js-yaml | 3.15.0 / 4.3.0 | ts-jest, @vscode/vsce (dev-only) |
| brace-expansion | 1.1.16 / 5.0.8 | rimraf, @vscode/vsce (dev-only) |

## Deferred

### 1. OpenTelemetry / Azure Monitor / applicationinsights cluster (~30)

All pulled transitively by the direct dependency `applicationinsights@^3.12.0`
(`packages/mcp`, required for Rule 13 telemetry). Advisories:

- `@azure/monitor-opentelemetry` (high, ≤1.18.1), `@opentelemetry/sdk-node` (high, ≤0.218.0),
  `@opentelemetry/exporter-prometheus` (high, ≤0.218.0), plus ~27 moderate `@opentelemetry/*`,
  `@azure/monitor-opentelemetry-exporter`, `@azure/opentelemetry-instrumentation-azure-sdk`,
  `@azure/functions`, and `applicationinsights` itself.

**Why deferred:** the advisory ranges (`<=0.218.0`, `<=2.7.1`, `<2.8.0`) reach the *current
latest* releases — there is no forward-patched version to move to. `npm audit`'s only concrete
"fix" is downgrading `applicationinsights` to **2.9.8 (a major downgrade)**, which would regress
the telemetry pipeline. Several entries report `fixAvailable: true`, but that reflects a
dependency-graph rearrangement npm cannot actually satisfy from the registry — not an available
patched release.

**Revisit when:** the OpenTelemetry JS ecosystem and `@azure/monitor-opentelemetry` /
`applicationinsights` ship releases outside these ranges. Then bump `applicationinsights` and let
the stack update; no override needed.

### 2. Major-bump / multi-line deps (deferred — breakage risk)

Fixing these safely needs a new major or a multi-major-line scoped override, each requiring
per-dependency testing beyond this pass's scope (the "safe subset" was chosen deliberately):

| Package | Advisory range | Note |
|---|---|---|
| uuid | <11.1.1 | in-tree 8.3.2; v10+ is ESM-only — API-breaking bump |
| @azure/msal-node | ≤5.1.4 | fix is msal-node 5.4.1 (major); it's a direct dep of `packages/shared` |
| fast-uri | ≤3.1.1 | under `ajv`; fix may require 4.x (major) |
| brace-expansion | <1.1.16 \|\| ≥3.0.0 <5.0.7 | two separate major lines in-tree (1.x + 5.x) |
| js-yaml | ≤3.14.2 \|\| 4.0.0–4.2.0 | two major lines in-tree (3.x + 4.x) |
| @nevware21/ts-utils | ≤0.13.0 | pre-1.0; under applicationinsights |
| @azure/identity | broad range | large advisory span; needs targeted version check |

Some of these report `npm fix: true` (in-range) and may turn out to be cleanly fixable — they are
**candidates for a follow-up "aggressive" pass** with per-dep build+test verification, not fixed
here by design.

## Recommended follow-ups
- Add a scheduled `npm audit` (or Dependabot) job so `main`'s transitive advisories surface
  continuously instead of only when a PR happens to regenerate the lockfile.
- Re-run this review when `applicationinsights` publishes a release on patched OpenTelemetry, to
  clear the bulk of the cluster in one bump.
