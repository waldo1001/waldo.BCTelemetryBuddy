---
topic: msal-node-v7
status: done
created: 2026-10-23
spec: spec-lite
---

# Plan: @azure/msal-node 3 → 7 (#141)

## Spec-lite
- Intent: clear the last 2 runtime npm-audit findings (moderate `uuid <11.1.1`, pulled in by `@azure/msal-node@3.8.10`) by moving the direct dependency to msal-node 7, which doesn't depend on `uuid`. Authentication behavior must not change.
- **AC1:** Given `packages/shared/package.json`, When it's read, Then `@azure/msal-node` is `^7.1.1`; And `npm audit --omit=dev` reports **0 vulnerabilities of any severity** in shared, mcp and extension.
- **AC2:** Given the existing `packages/shared/src/__tests__/auth.test.ts` (which mocks MSAL), When the suites run, Then all of them pass unchanged. The device_code and client_credentials flows build the same `PublicClientApplication` and `ConfidentialClientApplication` config and request shapes as before.
- **AC3:** Given the real msal-node 7 against the real Entra endpoint, When a smoke script starts a device-code request (Azure CLI public client `04b07795-…`, tenant `organizations`), Then `deviceCodeCallback` receives a `user_code` and `verification_uri`, and the request is cancelled before anyone logs in. **And** When a client-credentials request is made with a nonexistent client ID, Then Entra answers with an `AADSTS` error (`700016` or `90002`). That proves the request reaches Entra and is well formed, not rejected by the library.
- **AC4:** Given the build, When `npm run build` runs, Then shared, mcp and extension compile and bundle with no type errors.
- Eligibility: chore (dependency upgrade), blast radius `low-risk` (see below).

## Task
Bump `@azure/msal-node` to `^7.1.1` in `packages/shared` and prove that the two auth flows we use still work against the real library and endpoint.

## Scope boundary
- **IN:** the `packages/shared/package.json` range; the lockfile; a smoke script in the scratchpad (not committed); `dependency-debt.md` (Deferred #2: msal-node and uuid resolved); the CHANGELOGs.
- **OUT:** changes to auth flows; `@azure/identity`'s own msal-node 6 (owned by applicationinsights); the `vscode_auth` and `azure_cli` flows (they don't use MSAL).

## Files to create / touch
| Path | Change |
|---|---|
| `packages/shared/package.json` | `"@azure/msal-node": "^7.1.1"` |
| `package-lock.json` | regenerated: `npm install` without `--omit=dev`, followed by `npm ci` (lesson from #135) |
| `docs/security/dependency-debt.md` | the msal-node and uuid rows move from Deferred #2 to Remediated |
| `packages/mcp/CHANGELOG.md`, `packages/extension/CHANGELOG.md` | `### Security` |

## Interface
No code change. Breaking changes from v3 to v7, checked against `packages/shared/src/auth.ts`:
| Version | Breaking change | Do we use it? |
|---|---|---|
| v5 | drops Node ≤ 18 | no (our floor is ≥ 22.23.4) |
| v5 | removes `extraQueryParameters`, `claims`, deprecated APIs and internal exports | no: we only use `auth.{clientId, authority, clientSecret}`, `scopes` and `deviceCodeCallback` |
| v6 | `acquireTokenInteractive` responseMode default; removes `loopbackClient` | no |
| v7 | removes `responseMode` from `acquireTokenInteractive` | no |

## Dependencies
`auth.ts` (`authenticateDeviceCode` and `authenticateClientCredentials`); the esbuild bundles of mcp and the extension (msal-node gets bundled).

## RED test list
| AC | Check | RED today |
|---|---|---|
| AC1 | `npm audit --omit=dev` ×3 | ✅ 2 moderate (uuid via msal-node) |
| AC2 | `auth.test.ts` and the full suites | green baseline; must stay green |
| AC3 | the scratchpad smoke script `msal-smoke.js` (real endpoint) | run on v3 first as the baseline, then on v7: the same observable results |
| AC4 | `npm run build` | green baseline |

## Telemetry
None. No new feature surface, and the existing `AUTH.AUTHENTICATION_COMPLETED` and `AUTH.FAILED` events are unchanged.

## Open questions / assumptions
- **Assumption:** the smoke test against the real Entra endpoint is acceptable. It sends no credentials of yours: it uses the well-known public Azure CLI client ID that `auth.ts` already defaults to, a made-up confidential client ID, and the device code is cancelled before anyone signs in.
- **Assumption:** a token that's actually issued (a full sign-in) isn't covered here. If you want that, it's a one-time manual `device_code` login in the extension after release.

## Risks
- **Bundling:** msal-node 7 could pull in an ESM-only dependency that breaks the esbuild CJS bundle. AC4 plus the stdio smoke test from #135 would catch that.
- **Undocumented behavior changes in token caching between v3 and v7:** the server builds a new PCA or CCA per authentication and doesn't persist the MSAL cache, so the exposure is small.
- **Rollback:** revert one commit.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Authentication is a critical path, but the APIs we use didn't change across the four majors (checked above).
  - No config, tool, or on-disk changes.
- **Who/what could break:** users of the `device_code` and `client_credentials` auth flows (MCP and extension); the bundles.
- **Detection:**
  - The `auth.test.ts` suite.
  - The AC3 smoke test against the real Entra endpoint.
  - The build.
  - After release: `TB-AUTH` failure telemetry, and `AUTH.FAILED` exceptions with `authFlow: device_code` or `client_credentials`.

## Out-of-scope follow-ups
- None expected.

## Outcome (2026-10-23)
- AC1 ✅ `@azure/msal-node` ^7.1.1. `npm audit --omit=dev` reports 0 vulnerabilities of any severity in shared, mcp and extension, and `uuid` is gone from the tree.
- AC2 ✅ shared 329, mcp 833 and extension 470 tests pass with no test changes; coverage unchanged.
- AC3 ✅ real-endpoint smoke test, identical on v3.8.10 and v7.1.1: device code issued (`userCode`, `verificationUri` = login.microsoft.com/device), then `device_code_polling_cancelled`; client credentials with a made-up app get `unauthorized_client AADSTS700016`.
- AC4 ✅ `npm run build` clean; msal is bundled in `mcp/dist/server.js` and `extension/dist/extension.js`; the stdio smoke test returns the same 16 tools.
