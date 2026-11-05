---
topic: azure-cli-tenant
status: done
created: 2026-11-05
spec: docs/specs/150-azure-cli-tenant.md
---

# Plan: azure_cli auth honours the configured tenantId

## Spec
- Spec file: docs/specs/150-azure-cli-tenant.md (status: approved)
- AC IDs covered by this cycle: AC1 to AC11 (all)

## Task
Request the `azure_cli` token for the configured tenant on both token paths through one shared function, and name the tenant in errors without sending it to telemetry.

## Scope boundary
- IN: `az` token command, tenant validation, 401/403 messages, redaction in `RateLimitedUsageTelemetry`, stale docs and the `switch_profile` note.
- OUT: `device_code` prompt visibility and Test Connection for `device_code` / `client_credentials` (separate issues, drafted for the maintainer, not filed); retry without `--tenant`; `_validateAuth`; releasing; commenting on or relabelling #150.

## Files to create / touch
Create:
- `packages/shared/src/azureCliToken.ts`
- `packages/shared/src/__tests__/azure-cli-tenant.test.ts`
- `packages/extension/src/__tests__/setupWizard-tenant.test.ts`

Touch:
- `packages/shared/src/auth.ts`: `authenticateAzureCLI()` calls the new function; "az login" hint only when unscoped
- `packages/shared/src/kusto.ts`: 401/403 message
- `packages/shared/src/usageTelemetry.ts`, `usageTelemetryUtils.ts`: redaction
- `packages/shared/src/index.ts`: export
- `packages/extension/src/webviews/SetupWizardProvider.ts`: `_testConnection()`
- `packages/mcp/src/tools/toolHandlers.ts:1669`: note; `packages/mcp/src/tools/setupInstructions.ts:90`; `packages/mcp/src/config.ts:157` comment; `packages/shared/src/config.ts:250` comment
- Docs: `packages/mcp/README.md:287`, `packages/extension/README.md:136`, `docs/UserGuide.md:332`, both package `CHANGELOG.md` under `[Unreleased]`, `docs/PromptLog.md`, `docs/DesignWalkthrough.md`

## Interface
```ts
// packages/shared/src/azureCliToken.ts
export function resolveAzureCliTenant(tenantId?: string): string | undefined; // undefined = not configured; throws on invalid
export function buildAzureCliTokenCommand(tenant?: string): string;
export interface AzureCliToken { accessToken: string; expiresOn?: Date; subscription?: string; tenant?: string; requestedTenant?: string; }
export async function acquireAzureCliToken(tenantId?: string): Promise<AzureCliToken>;
export function tenantFromToken(accessToken: string): string | undefined; // `tid` claim, display only; undefined when undecodable

// packages/shared/src/usageTelemetryUtils.ts
export function registerTelemetryRedaction(value: string): void;
export function redactRegistered(text: string): string;
```

Behaviour notes:
- Failure wrapping (AC7) applies only to a configured tenant and only when `az` itself failed. "az not installed" and JSON parse errors are passed through unwrapped, so they don't suggest `az login --tenant`.
- The wizard keeps `exec` for `_validateAuth` and loses its token `exec`. It gains `PYTHONWARNINGS=ignore` from the shared function; stdout is unaffected.

### Redaction design
All three production telemetry stacks wrap their sink in `RateLimitedUsageTelemetry` (`server.ts:156`, `toolHandlers.ts:142`, `extension.ts:382`), so that is the single choke point:
- `trackException` forwards a copy of the error with scrubbed `message` and `stack` when either contains a GUID or a registered value. Otherwise it forwards the original object, which keeps the existing `expect(passedError).toBe(error)` test valid.
- `sanitizeStackTrace` gains GUID and registered-value scrubbing, and `sanitizeErrorMessage` gains registered-value scrubbing. `stackHash` is then computed on scrubbed text.
- String properties get registered-value scrubbing only, not generic GUID scrubbing, because `correlationId`, `sessionId` and `installationId` are GUIDs that must survive.
- Values are registered by `acquireAzureCliToken` (before `exec`), and wherever a tenant is read for display (`tenantFromToken` callers).

Deviation from the spec's prose, not from AC10: the spec says the MCP sink must forward a scrubbed copy. With the choke point the sink receives one and needs no change of its own.

## Dependencies
`child_process.exec`, `util.promisify`, existing `sanitizeErrorMessage` / `sanitizeStackTrace`, `axios` (wizard, Kusto).

## RED test list
Fake tenants only, so the security scan stays clean.

Shared unit tests, `azure-cli-tenant.test.ts`, seams: `child_process` mocked, `AuthService` real:
- AC1: "passes --tenant for a GUID tenantId"
- AC3: "command is byte-identical to today's for missing, empty, whitespace and zero GUID" (table)
- AC4: "passes --tenant for a domain tenantId"
- AC5: "starts no process and does not echo the value" (table: `x; calc`, `x & calc`, `$(id)`, `` `id` ``, `x|y`, `a b`, `--debug`, `-t`, `your-tenant-id`, `common`, `${TENANT}`, 254-character name, `a"b`, `%PATH%`, newline)
- AC7: "names the tenant and both fixes when az fails"; edge: "does not wrap az-not-installed or invalid JSON"
- AC8: "Kusto 401/403 names the token's tid" (fake unsigned JWT)
- AC9: "Kusto 401/403 message is exactly today's for an undecodable token" (existing `kusto.test.ts` also pins this); edge: payload with no `tid`, non-string `tid`
- AC10: "scrubs GUID and domain tenants from message, stack and properties at the inner sink, and keeps correlationId"; "the thrown error keeps the tenant"; "tenantScoped is a boolean-like property, never the value"

Extension tests, `setupWizard-tenant.test.ts`, seams: real `exec`, stub `az` on `PATH` (`az.cmd` on Windows, shell script elsewhere; both call a small Node script that records `argv` to a file and prints JSON), `axios` mocked, real built `@bctb/shared`:
- AC2: "Test Connection passes --tenant"
- AC3: "Test Connection omits --tenant for the zero GUID"
- AC4: "Test Connection passes a domain tenant"
- AC5: "Test Connection never starts az for an injection value", asserting no `argv` file and no marker file from the payload
- AC6: "the stub receives tenant and resource as separate, unaltered arguments, and its JSON becomes the token"; runs on all three OSes in `test-extension`
- AC8: "Test Connection 403 names the tenant"
- AC9: "Test Connection 403 is today's message when no tenant is known" (no `tenant` field, undecodable token)

AC11: `switch_profile` note test added to `packages/mcp/src/__tests__/profile-switching.test.ts` (asserts the "not used" text is gone); `setup-instructions.test.ts` extended for the new wording. README and UserGuide changes are reviewed by hand.

PROVE RED first on all of the above, against unchanged source, via stubs that keep today's behaviour.

## Mutation check
After green, one at a time, revert after each, and record which test fails:
1. Remove `--tenant` from the command builder
2. Remove the zero-GUID check
3. Loosen the allowlist to accept `;`
4. Allow a leading `-`
5. Skip wizard use of the shared function (restore its old `exec`)
6. Drop registered-value scrubbing
7. Drop stack scrubbing
8. Remove the tenant from the Kusto message

A surviving mutant means a missing test, which gets added before moving on.

## Telemetry (Rule 13)
- No new event ID: this is a bug fix with no new feature surface (the spec says so).
- `tenantScoped: 'true' | 'false'` on `TELEMETRY_EVENTS.AUTH.AUTHENTICATION_COMPLETED` and on `AUTH.FAILED` exceptions from `authenticateAzureCLI()`.
- In practice this reaches telemetry only from the MCP: the extension builds `new AuthService(this.config)` without telemetry (`telemetryService.ts:60`), and the wizard path has none. Accepted, not widened here.

## Open questions / assumptions
- Assumption: `az`'s error when the session cannot get a token for a real tenant contains useful text. Not observed: the one probe I expected to fail succeeded, because the session had access. AC7 wraps whatever `az` says, so the message holds either way; the manual check will try to capture a real example.
- Assumption: bad values fail closed (spec, approved).

## Risks
- A stub `az.cmd` test can be flaky on Windows CI through quoting or `PATH` casing. `process.env.PATH` is case-insensitive on Windows, and the shared function spreads `process.env`. If it fails, that is a real signal, not something to skip.
- Module-level redaction state persists across tests, so tests use distinct values and a reset helper.
- `sanitizeStackTrace` change could break a test that pins GUIDs in stacks; existing tests will show that.

## Blast radius / breakage prediction
- **Rating:** `risky`
  - Configs with a stale or wrong real `tenantId`, a non-GUID placeholder, or a managed identity / Cloud Shell session with `tenantId` set work today and will fail, each with an error saying how to fix it.
  - No config key, command, tool or on-disk format changes. Configs with no `tenantId` or the zero GUID get a byte-identical command.
  - Telemetry: exception messages and stacks lose GUIDs, so dashboards grouping on raw exception text or on `stackHash` may see new groups.
- **Who/what could break:** extension users and MCP clients on `azure_cli` with a non-empty, non-zero `tenantId`; telemetry queries on exception text. Not saved queries, KB cache or CI. Other flows don't touch the new function.
- **Migration path:** set `tenantId` to the resource's real tenant and run `az login --tenant <tenantId>` if needed, or remove `tenantId` (or use the zero GUID) to keep the default `az` tenant. Stated in the error, both changelogs and the UserGuide.
- **Version bump:** none in this PR. At the next release, recommend minor for both (Extension 3.6.0, MCP 3.9.0) with a "Changed" entry, not major: no public surface is removed. The maintainer decides at release.
- **Detection:** the new tests; `AUTH.FAILED` with `tenantScoped: true` rising after release; user reports quoting the new message.

## Verification beyond tests
With the maintainer's approved spec, using the local `az` session across its 8 tenants: request a token for a non-default tenant, compare the `tid` without printing the token, and run `print 1` against a resource there with and without `--tenant`, via the built code. `print 1` reads no telemetry. Windows gets stub coverage only, and the final report says so.

## Out-of-scope follow-ups
- Draft issue: `device_code` prompt only appears in the developer tools console.
- Draft issue: Test Connection doesn't test `device_code` / `client_credentials` credentials.
- `azure-cli-auth.test.ts` mostly asserts on local literals, not on the code. Left alone here; worth a cleanup later.
