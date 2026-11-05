---
spec: 150-azure-cli-tenant
issue: 150
status: approved
created: 2026-11-05
approved: 2026-11-05
plans: [docs/plans/azure-cli-tenant.md]
---

# azure_cli auth honours the configured tenantId

## Intent

With `authFlow: azure_cli`, `tenantId` from `.bctb-config.json` is ignored. `az` issues the token for its default tenant, so an App Insights resource in another tenant fails with 403 `InvalidAuthenticationTokenTenant`. The error then points at the App ID and permissions, which sends people the wrong way. Switching the default `az` tenant is no workaround, because other tooling depends on it. This change requests the token for the configured tenant and makes the failure name the tenant.

## Actors & scope

Extension users (Setup Wizard, Profile Wizard, Run KQL) and MCP clients (query tools, `switch_profile`, CLI). Packages: `shared`, `extension`, `mcp`.

Token paths that run `az account get-access-token` (all of them, from a search of every exec-family call and `az` string):

| # | Location | Reached by |
|---|---|---|
| 1 | `packages/shared/src/auth.ts` `authenticateAzureCLI()` | Run KQL (`TelemetryService`), Profile Wizard Test Auth, MCP `server.ts` and `toolHandlers.ts`, `cli.ts`, agent runs (via `bctb-mcp`) |
| 2 | `packages/extension/src/webviews/SetupWizardProvider.ts` `_testConnection()` | Setup Wizard Test Connection |

Other `az` calls are not token paths and stay unchanged: `az --version` and `az account show` (wizard `_validateAuth`), and `az account list` plus resource discovery (`endpointDiscovery`, `setup.ts`, `list-endpoints.ts`).

Both call sites build and run the command through one shared function, so there is one validation, one error text and one test for the command shape. The wizard's own copy of the `exec` call goes away.

- IN: both token paths, tenant validation, error messages on 401/403, and docs that say `tenantId` is ignored.
- OUT: see Non-goals.

## Behavior

### Which tenant is used

`tenantId` is trimmed, then:

| Value | Treated as | Command |
|---|---|---|
| missing, empty, whitespace | not configured | unchanged |
| `00000000-0000-0000-0000-000000000000` | not configured | unchanged |
| GUID, any case | configured | `--tenant <value>` |
| domain, such as `contoso.onmicrosoft.com` | configured | `--tenant <value>` |
| anything else | invalid | no process is started; the call fails |

The zero GUID must count as not configured. `configMerge.ts`, the Setup Wizard template and `setupInstructions.ts` all write it for `azure_cli`. Real `az` rejects it with `AADSTS900021`, so passing it through would break those users.

Not configured:

```
az account get-access-token --resource https://api.applicationinsights.io
```

Configured:

```
az account get-access-token --tenant <tenantId> --resource https://api.applicationinsights.io
```

### No injection, and it works on Windows

`tenantId` comes from a file and must not be able to inject anything. The value is checked against an allowlist before a command is built: a GUID, or a DNS name with at least one dot whose labels hold only letters, digits and inner hyphens, 253 characters at most. This rejects every shell metacharacter, spaces and a leading `-` (argument injection).

The invocation stays a shell `exec`. On Windows `az` is `az.cmd`. A shell-less `execFile('az', …)` looks for an executable and does not find it, and since the fix for CVE-2024-27980 (Node 18.20.2 / 20.12.2 / 21.7.3, April 2024; this repo requires Node 22.23.4 or newer) Node refuses to spawn `.cmd` and `.bat` files without a shell with `EINVAL`. So "no shell" is not an option on the reporter's platform, and validation is the control.

An invalid value fails with a message that names the `tenantId` setting and the accepted forms. It does not echo the value.

### Errors

- `az` fails while a tenant is configured: the error names the tenant and gives both ways out: `az login --tenant <tenantId>`, or remove `tenantId` from the config to use the default `az` tenant. The original `az` message stays included.
- 401/403 from the App Insights API, in the wizard and in `KustoService`: the message names the tenant the token was issued for and says that the resource must be in that tenant. The wizard reads it from the `tenant` field of the `az` JSON it already has; `KustoService` only has the token, so it reads the `tid` claim. If neither is available, the message is exactly what it is today.
- The tenant is only read for display. Nothing is verified or decided from it.

### Telemetry privacy

Once `--tenant` is in the command, Node's `Command failed: az … --tenant <value>` carries a customer tenant in the error, and the 401/403 message carries the token's tenant. What the telemetry layer does with an error today, verified from source:

- `UsageTelemetry.trackException` enriches properties with `createErrorProperties`: `errorMessage` goes through `sanitizeErrorMessage`, which scrubs GUIDs, so a GUID tenant is already removed there. `stackTrace` goes through `sanitizeStackTrace`, which does not scrub GUIDs, and a stack's first line is the message, so a GUID tenant leaks through `stackTrace`.
- The MCP sink (`mcpTelemetry.ts`) also passes the raw `Error` object as `exception`, so App Insights receives the unscrubbed message and stack.
- A domain tenant is scrubbed nowhere.

Tracked errors must not carry the tenant in either form, in message, stack, or properties, and the MCP sink must forward a scrubbed copy rather than the raw `Error`. Scrubbing happens in the telemetry layer, not at the throw site, because the extension tracks the thrown error generically (`trackOperationWithTelemetry`) and the thrown error must keep the tenant for the user. The telemetry layer is told which value to redact; a generic domain regex would also mangle API hosts.

### Behaviour change for existing users

Until now a `tenantId` under `azure_cli` had no effect, and the MCP said so explicitly. These configs work today and will fail after this change, each with an error that says how to fix it:

1. A stale or wrong real `tenantId`, or a tenant the `az` session cannot get a token for.
2. A placeholder that is neither empty nor the zero GUID, such as `your-tenant-id` from the `azure_cli` example in `docs/UserGuide.md` (which also called `tenantId` "optional but recommended for documentation purposes"), or `common`.
3. Managed identity and Cloud Shell sessions with a `tenantId` set, because `az` documents `--tenant` as unavailable for them.

There is deliberately no silent fallback to the default tenant. It would hide the misconfiguration, return a wrong-tenant token, and bring back the misleading 403 this issue is about.

## Acceptance criteria

- **AC1:** Given `azure_cli` and a GUID `tenantId`, When `AuthService` authenticates, Then the executed command contains `--tenant <tenantId>` and `--resource https://api.applicationinsights.io`.
- **AC2:** Given a GUID `tenantId`, When the Setup Wizard runs Test Connection, Then the executed command contains the same `--tenant <tenantId>`.
- **AC3:** Given `tenantId` is missing, empty, whitespace or the zero GUID, When either token path runs, Then the command is byte-identical to today's.
- **AC4:** Given a domain `tenantId`, When either token path runs, Then `--tenant <domain>` is passed.
- **AC5:** Given a `tenantId` containing shell metacharacters, spaces, a leading `-`, or another non-allowlisted value, When either token path runs, Then no process is started and the error names the `tenantId` setting without echoing the value.
- **AC6:** Given a stub `az` on `PATH`, When the real `exec` runs on Linux, macOS and Windows, Then the stub receives the tenant and resource as separate, unaltered arguments and its JSON output is parsed into a token.
- **AC7:** Given a configured tenant and a failing `az`, When authentication fails, Then the error names the tenant, includes the `az` message, and offers both `az login --tenant <tenantId>` and removing `tenantId`.
- **AC8:** Given a decodable token and a 401/403, When the wizard or `KustoService` reports the failure, Then the message names the token's tenant.
- **AC9:** Given an undecodable token and a 401/403, When the wizard or `KustoService` reports the failure, Then the message is exactly today's.
- **AC10:** Given a tenant identifier in GUID or domain form, whether configured or read from the token, When any failure on these paths is tracked, Then neither the tracked error's message and stack nor its properties contain the tenant value, while the error thrown to the caller does.
- **AC11:** Given an `azure_cli` profile, When `switch_profile` returns, Then its note no longer says `tenantId` is unused, and `packages/mcp/README.md`, `packages/extension/README.md`, `docs/UserGuide.md` and `setupInstructions.ts` describe the new behaviour.

## Non-goals

- `device_code` prompt visibility: `console.log` in `auth.ts:149-153`. It is a different code path and needs a new seam plus UI. Separate issue.
- Test Connection support for `device_code` and `client_credentials`. The `else` branch at `SetupWizardProvider.ts:352` uses `az` for both, and the webview does not send `clientId` or `clientSecret`. A real fix needs those fields and the prompt above. Separate issue. This branch does gain `--tenant`, because it is the same call.
- Retrying without `--tenant` when `az` fails.
- Making `_validateAuth` show the configured tenant.
- Tenant handling for `vscode_auth`, `device_code` and `client_credentials` token acquisition.

## Telemetry (Rule 13)

No new feature surface, so no new event ID. Existing `azure_cli` auth events gain one boolean property, `tenantScoped`, so regressions in scoped calls can be told apart from unscoped ones. The tenant value is never sent (AC10).

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
| AC8 | planned | planned |
| AC9 | planned | planned |
| AC10 | planned | planned |
| AC11 | planned | planned |

Where the tests run: CI runs `packages/shared` tests on Ubuntu only (`test-mcp` job) and `packages/extension` tests on Ubuntu, Windows and macOS. The extension's Jest maps `@bctb/shared` to the real built `dist`, so the AC6 stub-`az` test lives in the extension package and exercises the real shared code on all three platforms. On Windows the stub is an `az.cmd`.

Manual check, outside the AC table: with an `az` session that spans several tenants, request a token for a non-default tenant, compare its `tid`, and run `print 1` against an App Insights resource in that tenant, with and without `--tenant`. `print 1` reads no telemetry. This reproduces the original 403 and shows the fix against a real cross-tenant setup. Windows is covered only by the stub in AC6, not by a real `az.cmd`.

## Links

- Issue: #150
- Related: #104 (different root cause for the reported symptom)
- Plan(s): to be added after approval
- PR(s): to be added
