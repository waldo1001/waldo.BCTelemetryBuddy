---
topic: npm-trusted-publishing
status: done
created: 2026-10-23
spec: spec-lite
---

# Plan: npm Trusted Publishing (OIDC) and moving actions off Node 20 (#137)

## Spec-lite
- Intent: publish `bc-telemetry-buddy-mcp` from GitHub Actions through npm Trusted Publishing (OIDC) instead of a long-lived `NPM_TOKEN`. The current token expires on 2027-01-20, and npm is deprecating bypass-2FA publish tokens. In the same cycle, move every `actions/*` step to a Node 24 major, and make the npm check after publishing wait for propagation.
- **AC1:** Given `.github/workflows/release-mcp.yml`, When the two npm publish jobs (stable and pre-release) are read, Then each has `permissions: { contents: read, id-token: write }`, and the file mentions neither `NPM_TOKEN` nor `NODE_AUTH_TOKEN`.
- **AC2:** Given those publish jobs, When they run, Then npm ≥ 11.5.1 is installed before `npm publish` (`npm install -g npm@^11.5.1`). Node 22.x ships npm 10, which can't do OIDC publishing.
- **AC3:** Given a publish, When the "Verify NPM publication" step runs, Then it retries `npm view bc-telemetry-buddy-mcp@<version>` for up to 5 minutes. It passes once the version is visible, and fails the job if it never appears. No more false 404, and no more silent pass.
- **AC4:** Given every workflow under `.github/workflows/`, When `uses: actions/<name>@vN` is read, Then the versions are: checkout@v7, setup-node@v7, upload-artifact@v7, download-artifact@v8, github-script@v9, labeler@v7, dependency-review-action@v5. All of these run on `node24`.
- **AC5:** Given the trusted publisher is configured on npmjs.com, When the next MCP release tag is pushed, Then npm accepts the publish over OIDC, and the version shows provenance on npmjs.com. Verified on the real release, not in a unit test.
- **AC6:** Given AC5 passed, When cleanup is done, Then the `NPM_TOKEN` repo secret is deleted, the granular token is revoked, and the package's publishing access is set to "Require two-factor authentication and disallow tokens". These are steps for you; I verify the secret with `gh secret list`.
- Eligibility: chore (CI/release pipeline), blast radius `low-risk` (see below).

## Task
Switch MCP npm publishing to OIDC Trusted Publishing, bump all `actions/*` to Node 24 majors, and make the publish verification step wait for propagation.

## Scope boundary
- **IN:** `release-mcp.yml` (publish jobs, verification step); the `uses:` versions in all workflows; a new repo-consistency test; `docs/` notes on the release process; the post-release cleanup checklist.
- **OUT:**
  - Extension Marketplace publishing (`VSCE_PAT`). That's a separate token story.
  - Staged publishing with 2FA approval.
  - GitHub deployment environments and tag protection. Possible follow-ups.

## Files to create / touch
| Path | Change |
|---|---|
| `.github/workflows/release-mcp.yml` | publish jobs: `permissions` (contents: read, id-token: write); `npm install -g npm@^11.5.1`; drop `NODE_AUTH_TOKEN`; verification step retries up to 5 min and fails if the version never appears |
| `.github/workflows/*.yml` | `uses:` bumps per AC4 |
| `packages/mcp/src/__tests__/release-workflow-consistency.test.ts` | **new**: AC1, AC2, AC3 (structural), AC4 |
| `.claude/skills/release/SKILL.md` | Phase 7: "MCP publishes over OIDC; an E404 PUT means a trusted-publisher mismatch, not the token" |
| `docs/security/dependency-debt.md` or a new `docs/release/npm-trusted-publishing.md` | the one-time npmjs.com setup and the cleanup checklist (AC6) |
| `packages/mcp/CHANGELOG.md` | `### Changed`: published with provenance via trusted publishing |

## Interface
```yaml
  publish-npm:
    permissions:
      contents: read
      id-token: write
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with: { node-version: 22.x, registry-url: 'https://registry.npmjs.org', cache: 'npm' }
      - run: npm install -g npm@^11.5.1
      ...
      - name: Publish to NPM
        run: cd packages/mcp && npm publish --access public --tag $NPM_TAG
      - name: Verify NPM publication
        run: |  # retry up to 5 min, fail if never visible
```
On npmjs.com (you, one time): package `bc-telemetry-buddy-mcp` → Settings → Trusted Publisher → GitHub Actions: user `waldo1001`, repo `waldo.BCTelemetryBuddy`, workflow `release-mcp.yml`, no environment, allow `npm publish`.

## Dependencies
- `packages/mcp/package.json` `repository.url` = `git+https://github.com/waldo1001/waldo.BCTelemetryBuddy.git`. That matches the repo, as npm requires.
- The repo is public, so provenance is generated automatically.
- GitHub-hosted runners only, which already holds.

## RED test list
| AC | File / check | Test |
|---|---|---|
| AC1 | `release-workflow-consistency.test.ts` | "AC1: npm publish jobs request id-token: write and no NPM_TOKEN/NODE_AUTH_TOKEN remains" (RED: the token is there today) |
| AC2 | same | "AC2: publish jobs install npm >= 11.5.1 before npm publish" (RED: no such step) |
| AC3 | same | "AC3: verify step retries and fails on timeout" (structural: a loop plus `exit 1`) (RED: a single `sleep 10`) |
| AC4 | same | "AC4: every actions/* uses a node24 major" (RED: v4/v5/v7 today) |
| AC5 | the real release run (MCP 3.7.2) | the `npm publish` log shows provenance; `npm view … dist.attestations` is present |
| AC6 | `gh secret list` shows no NPM_TOKEN | after cleanup |

## Telemetry
None. This is release-pipeline infrastructure, with no product feature surface (Rule 13 doesn't apply to CI-only changes).

## Open questions / assumptions
- **Order of operations, which matters because an npm trusted-publisher config expires if no publish happens within 2 days:**
  1. Merge #135, then #137.
  2. Configure the trusted publisher on npmjs.com.
  3. Release a patch the same day (MCP 3.7.2, extension 3.4.5, which ships #135's fixes).
  4. Clean up `NPM_TOKEN`.
- **Assumption:** `workflow_dispatch` pre-release runs use the same workflow file, so the single trusted-publisher entry (`release-mcp.yml`) covers both publish jobs.
- **Assumption:** setup-node v7 with `registry-url` writes an `.npmrc` that refers to `NODE_AUTH_TOKEN`. With the variable unset, npm 11.5+ falls back to OIDC. If it doesn't, I'll drop `registry-url` from the publish jobs.

## Risks
- **The first OIDC publish fails** (config mismatch, wrong case, npm too old). The tag and GitHub release still exist. You fix the npmjs.com config, and I re-run the failed job. The old token still works until 2027-01-20, so a fallback is to re-add `NODE_AUTH_TOKEN` temporarily.
- **The action major bumps** (checkout 4→7, setup-node 4→7, upload 4→7, download 4→8, github-script 7→9, labeler 5→7, dependency-review 4→5). I checked the release notes:
  - download-artifact v5 changed path handling only for downloads by artifact ID. We download by name.
  - download-artifact v8 makes a hash mismatch an error, which is a correct failure.
  - github-script v9 breaks `require('@actions/github')`, which `spec-check.yml` doesn't use.
  - setup-node v5 enables caching automatically only when `packageManager` is set. We set `cache: npm` explicitly and have no `packageManager`.
  - Everything needs runner ≥ 2.327.1, which GitHub-hosted runners have.

  The PR's own CI run exercises ci.yml, codeql, dependency-review, pr-label and spec-check on the new versions. The release workflows are only proven on the release itself.
- **Rollback:** revert one commit, and re-add `NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}` (the token stays valid until AC6 cleanup).

## Blast radius / breakage prediction
- **Rating:** `low-risk`
  - Users and the product see no change.
  - The only possible failure is the release pipeline, which retries without a new version. The worst case is a delayed npm publish.
- **Who/what could break:**
  - CI (action bumps).
  - The release pipeline (npm publish, artifact handoff between jobs).
- **Detection:**
  - The new consistency test.
  - CI on the PR, which covers 5 of the 7 workflows.
  - The MCP/extension release run itself: publish log, provenance badge, `npm view`.

## Out-of-scope follow-ups
- A GitHub `environment` with required reviewers for the npm publish job, plus tag protection rules (npm's own hardening advice).
- Equivalent token-free publishing for the VS Code Marketplace (`VSCE_PAT` → Entra ID workload identity), if Microsoft supports it.

## Outcome (2026-10-23)
- AC1–AC4 ✅ `packages/mcp/src/__tests__/release-workflow-consistency.test.ts` (7 tests). RED was 7/7 before the change; all pass now. mcp 833/833.
- All 7 workflows parse as valid YAML. ci, codeql, dependency-review, pr-label and spec-check run on the new action majors in the PR's own CI.
- AC5 (first OIDC publish with provenance) and AC6 (`NPM_TOKEN` cleanup) are verified on the MCP 3.7.2 release and recorded on #137, because they can only be proven by a real publish.
