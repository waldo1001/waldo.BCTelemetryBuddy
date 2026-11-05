---
topic: codeql-azure-cli-token
status: done
created: 2026-11-05
spec: spec-lite
---

# Plan: resolve the CodeQL findings on the azure_cli token code

## Spec-lite
- Intent: #152 added 5 CodeQL alerts on `main` (379 to 383). Remove the two causes that are real code issues: a public function that builds a shell command from an unchecked string, and a dynamic `RegExp` in telemetry scrubbing that doesn't need to exist.
- **AC1:** Given `@bctb/shared`'s public exports, When a consumer imports it, Then no export builds an `az` command from a raw string, and `acquireAzureCliToken`, `tenantFromToken` and `tokenTenantHint` remain available.
- **AC2:** Given a registered value, When `redactRegistered` runs, Then every occurrence is replaced in any casing, and characters in the value are matched literally, so `a.b.example` does not match `axb.example`.
- **AC3:** Given text with characters whose lower-case form has a different length, such as `İ`, When `redactRegistered` runs, Then the registered value is still fully replaced and the rest of the text is unchanged.
- **AC4:** Given the existing #150 acceptance tests, When they run, Then they all still pass unchanged.
- Eligibility: chore, blast radius low-risk

## Task
Make the command builder private to its module and replace the dynamic `RegExp` in `redactRegistered` with a literal, case-insensitive string replace.

## Scope boundary
- IN: `azureCliToken.ts` export, `index.ts` exports, `redactRegistered`, tests.
- OUT:
  - Removing the shell. `az` is `az.cmd` on Windows and Node refuses `.cmd` without a shell, so the allowlist stays the control.
  - The older open CodeQL alerts (`js/file-access-to-http`, unused variables).
  - The two drafted #150 issues, the reply to the reporter, releasing.

## Files to create / touch
| File | Change |
|---|---|
| `packages/shared/src/azureCliToken.ts` | `buildAzureCliTokenCommand` no longer exported |
| `packages/shared/src/index.ts` | named exports instead of `export *` for this module: `acquireAzureCliToken`, `tenantFromToken`, `tokenTenantHint`, type `AzureCliToken` |
| `packages/shared/src/usageTelemetryUtils.ts` | `redactRegistered` without `RegExp` |
| `packages/shared/src/__tests__/azure-cli-tenant.test.ts` | new tests |
| `docs/PromptLog.md`, `docs/DesignWalkthrough.md` | Rule 2 appends |

`resolveAzureCliTenant` stays exported from its module because `auth.ts` uses it, but leaves the package's public surface. `@bctb/shared` is `private: true` and bundled, and nothing outside the module calls either function, so no consumer changes.

No CHANGELOG entry: there is no user-visible change.

## Interface
`redactRegistered(text: string): string` keeps its signature.

The obvious replacement, searching `text.toLowerCase()` and slicing `text` at the found index, is wrong: some characters change length when lower-cased (`İ` becomes 2 code units), so the offsets drift and a tenant could leak. Instead, compare `text.slice(i, i + value.length).toLowerCase()` at each position of the original text. Registered values are ASCII: a validated tenant, or a GUID `tid`.

## Dependencies
None new.

## RED test list
Test file: `packages/shared/src/__tests__/azure-cli-tenant.test.ts`. Seams: none.
- AC1: "the package does not export a raw command builder". Red today: `buildAzureCliTokenCommand` and `resolveAzureCliTenant` are on the index.
- AC1: "the package still exports the token functions". Green today, pins the surface.
- AC2: "matches a registered value's dots literally". Green today, since the current code escapes; it pins behaviour across the rewrite.
- AC2: "replaces every occurrence in any casing". Green today, pins.
- AC3: "scrubs correctly after a character that changes length when lower-cased". Green today, and it is what kills the naive implementation.
- AC4: existing suite.

The AC2 and AC3 tests can't be red, because this is a behaviour-preserving rewrite. The mutation check below proves they bite.

## Mutation check
1. Re-export the builder from the index
2. Naive `toLowerCase().indexOf` slicing on `text` (must fail AC3)
3. Case-sensitive compare
4. Replace only the first occurrence
5. Re-introduce an unescaped `RegExp` (must fail AC2)

## Telemetry (Rule 13)
None: no feature surface, and no event changes.

## Open questions / assumptions
What I expect from CodeQL, as a prediction to check on the PR's scan, not a promise:
- **379** closes, because no `RegExp` is left for the value to flow into.
- **381, 382** may not close. `acquireAzureCliToken` is still public and still passes its validated input to the builder, and CodeQL doesn't treat the allowlist as a sanitiser. The footgun is gone either way.
- **380, 383** stay, as expected.

Alerts still open after the scan need dismissing in GitHub as false positives, referring to the allowlist and its tests. I report which ones and ask first, because that changes the repo's security state. CodeQL isn't a required check, so they don't block this PR.

## Risks
- The new scrub is O(text × value) per registered value. Exception text is short and the set holds few values, so this is negligible.
- A registered value containing non-ASCII wouldn't be matched by length-preserving comparison in every casing. Today's registrations can't contain any: `resolveAzureCliTenant` and `tenantFromToken` both reject it.

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - No config, command, tool or format change. Scrubbing output is meant to be identical.
  - Rollback is reverting one commit.
- **Who/what could break:** the telemetry scrub, if the rewrite were wrong: a tenant could reach usage telemetry. The extension and MCP use neither removed export.
- **Detection:** the #150 AC10 tests, the new AC2 and AC3 tests, the mutation check; `tsc` for any consumer of a removed export.

## Verification
1. `npm run build`, all three suites with coverage
2. Mutation check
3. `/security-scan`
4. Read CodeQL's alert list for the PR ref and report the actual result

## Out-of-scope follow-ups
- A scheduled `npm audit --omit=dev` job, already on the debt register's follow-up list.
- Making CodeQL a required check, since it failed on #152 without blocking the merge. That's a repo settings decision.
