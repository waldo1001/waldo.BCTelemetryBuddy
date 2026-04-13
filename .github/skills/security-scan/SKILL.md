---
name: security-scan
description: 'Security scan for BC Telemetry Buddy. Invoked from Phase 8 of the TDD workflow and before any release. Scans for real tenant GUIDs, bearer tokens, AAD secrets, customer identifiers in fixtures/snapshots/logs, untracked secret files, and high/critical npm audit findings. A finding BLOCKS the cycle — never "note and continue". Use when: finishing a TDD cycle, preparing a release, reviewing a PR, or any time before code leaves the machine.'
---

# /security-scan — BC Telemetry Buddy security gate

This skill is called from [Phase 8 of the TDD cycle](../../../docs/tdd/methodology.md) and from [the release skill](../release/SKILL.md). It is not a "lint pass" — it is a **gate**. A finding blocks the cycle until the finding is resolved or explicitly allowlisted.

BCTB handles sensitive data at rest and in flight: Azure tenant GUIDs, Application Insights app IDs, bearer tokens (MSAL, Azure CLI, device-code), AAD client secrets, Kusto connection strings, real customer names (in knowledge-base `appliesTo` fields). Leaking any of these into the repo, into a snapshot, into an error message, or into telemetry is an incident. This skill exists to catch it before it ships.

---

## When to run

- **Phase 8 of every TDD cycle** — mandatory. Before DOCUMENT, before telling the user "ready to review".
- **Before any release** — the [release skill](../release/SKILL.md) invokes this as a pre-push gate.
- **When editing anything under `knowledge-base/`** — customer names are easy to commit by accident.
- **When adding a new test fixture** — fixtures are the #1 source of real-secret leaks in this repo.
- **When adding a new MCP tool or extension service** — telemetry properties and error messages are the #2 source.

If you are ever unsure whether the scan is needed, run it. It is cheap.

---

## What it scans

### 1. Real tenant / app GUIDs outside allowlisted docs

Azure tenant IDs and App Insights app IDs are GUID-shaped. A real one in a committed fixture, snapshot, or test is a leak — the attacker doesn't get a token, but they get a target.

**Pattern:** `[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`

**Scope:** everything under the repo **except**:
- `packages/*/src/__tests__/**` — test files may use a known-fake GUID (see allowlist below)
- `docs/**` — documentation may reference the known-fake GUID as an example
- `.github/skills/security-scan/allowlist.txt` — the allowlist file itself

**Allowlisted GUID format:** fake GUIDs used in examples must be listed in `.github/skills/security-scan/allowlist.txt`. A GUID not in the allowlist is treated as real.

### 2. Bearer tokens and access tokens

**Patterns:**
- JWT shape: `eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}` — three base64url segments joined by dots
- MSAL cache markers: `homeAccountId`, `cachedAt`, `expiresOn`, `idTokenClaims` outside MSAL's own node_modules
- Azure CLI token markers: `accessToken` with a sibling `expiresOn` in any JSON committed to the repo

**Scope:** everything tracked by git. No exceptions.

**Response on hit:** the token is already leaked the moment it lands in a tracked file. **Rotate first, then scrub.** For MSAL and Azure CLI tokens: invalidate the session (`az logout`, `az login`; in VSCode clear the auth session) and check commit history (`git log -p -- <file>`) to see how far back the leak goes. If the leaked file was ever pushed, the token must be considered compromised regardless of whether you rewrite history.

### 3. AAD client secrets and connection strings

**Patterns:**
- `client_secret` / `clientSecret` / `ClientSecret` followed by `=` or `:` and a string
- `AccountKey=` (storage account keys)
- `InstrumentationKey=[0-9a-fA-F]{8}-` (App Insights ikey — technically an id, but it's a telemetry write credential)
- `Endpoint=https://.*\.(kusto|crm|servicebus)\.windows\.net.*;.*Key=`

**Scope:** everything tracked by git, plus `.env` and `.env.*` files whether tracked or not (they must never exist in the repo — see #5).

### 4. Real customer names in knowledge-base `appliesTo`

Knowledge-base articles carry `appliesTo` in their frontmatter. Real customer names are allowed in **local workspace** KB entries but not in the **community** KB (the one committed to this repo).

**Scope:** `knowledge-base/**/*.md` in this repo.

**Check:** for each `.md` file under `knowledge-base/`, parse the frontmatter `appliesTo` field. Values must match either the generic allowlist (`all`, `example-customer`, anonymized placeholders) or be empty. Real-looking names (proper nouns, company suffixes like `GmbH`, `BV`, `NV`, `AG`, `Ltd`, `Inc`, `SA`) trigger a finding.

### 5. Untracked secret-shaped files

Files that must never exist in the repo, tracked or not:

- `.env`, `.env.local`, `.env.*` (except `.env.example` and `.env.*.example`)
- `token-cache.json`, `accounts.json`
- `msal-cache.bin`, `msal-cache.dat`
- `*.pfx`, `*.p12`, `*.pem` (unless in a documented test-fixture folder)
- `azure-config.json` in the repo root

**Check:** `find` the repo root for the patterns above. For each hit, a finding — even if `.gitignore` covers it. The goal is to catch the moment a developer creates one, not just the moment they commit it.

### 6. Secrets in logs, error messages, and telemetry properties

**Check:**
- `grep` for `trackEvent` calls whose property object contains any of: `token`, `secret`, `password`, `tenantId`, `clientId`, `email`, `upn`, `userPrincipalName`. These are *usually* fine at the property key level (metadata), but the **value** must come from a sanitized source, not a raw variable.
- `grep` for `console.log`, `console.error`, `logger.error` whose arguments include `error.message`, `err.stack`, `response.body` — these can leak tokens if the underlying service returns them. Use the sanitization helpers in `packages/shared/src/sanitize.ts`.

This check is heuristic — not every hit is a real finding. But every hit must be **eyeballed by the agent and justified in chat** before the scan passes.

### 7. `npm audit` — high and critical only

```bash
cd packages/shared && npm audit --audit-level=high
cd packages/mcp && npm audit --audit-level=high
cd packages/extension && npm audit --audit-level=high
```

**Response on hit:**
- If the finding is in a transitive dev dependency that does not ship in the extension `.vsix` or the MCP npm package → note it in the plan file's out-of-scope follow-ups, scan passes.
- If the finding is in a runtime dependency of the MCP server or the extension → scan **fails**. Bump the dep, open an issue, or pin to a fixed version before the cycle can continue.

---

## Output format

Report in chat in exactly this shape:

```
SECURITY SCAN: <PASS | FAIL>

Checks:
  1. Tenant / App GUIDs ........ <pass | N findings>
  2. Bearer tokens ............. <pass | N findings>
  3. AAD secrets / conn strings  <pass | N findings>
  4. KB customer names ......... <pass | N findings>
  5. Untracked secret files .... <pass | N findings>
  6. Secrets in logs/telemetry . <pass | N findings | N eyeballed>
  7. npm audit ................. <pass | N high | N critical>

Findings:
  - <check #>: <file:line> — <short description>
  - ...

Allowlist hits (informational, not findings):
  - <file:line> — <pattern> (allowlisted)
```

If any check shows findings, the overall result is **FAIL**. Do not proceed past Phase 8. Do not summarize the scan as "mostly clean". Either the scan passes or it doesn't.

---

## The allowlist

`.github/skills/security-scan/allowlist.txt` contains patterns that are safe-by-design:

- A known-fake tenant GUID used in examples and documentation
- A known-fake App Insights app ID
- A known-fake user email used in test fixtures

Format: one entry per line, `#` comments allowed. Matches are exact-string, not regex.

The allowlist starts empty. Add entries the first time a real false positive hits — with a comment explaining *why* the value is safe. Do not add wildcards. Do not add entries just to silence the scan.

---

## Rotation protocol (for leaked real tokens)

If check 2 or 3 hits on a **real** token or secret:

1. **Stop.** Do not continue the TDD cycle.
2. **Invalidate the credential first.** `az logout` for Azure CLI tokens; revoke + regenerate the client secret in the AAD app registration for AAD secrets; delete the MSAL cache for device-code / VSCode-auth tokens.
3. **Check history:** `git log --all -p -- <file>` to find every commit the secret lived in. If any such commit was ever pushed, assume the secret is compromised — rotation is not optional, it's already too late.
4. **Scrub the file.** Remove the secret, replace with a placeholder, regenerate fixtures if needed.
5. **Tell the user explicitly** what was found, what was rotated, and whether history rewrite is needed. The user decides whether to rewrite git history — the agent does not.
6. **Re-run the scan** from scratch. Only pass is pass.

---

## What this skill does NOT do

- **It does not replace code review.** A human still reads the diff. The scan is a grep-level safety net.
- **It does not scan third-party code** (`node_modules`, `dist`, build output). Those are out of scope.
- **It does not scan knowledge-base articles for prose containing customer names** — only frontmatter `appliesTo`. Prose is a judgment call.
- **It does not rewrite git history.** History rewrite is a user-authorized action (Rule 11 — never run git commands without explicit request).
