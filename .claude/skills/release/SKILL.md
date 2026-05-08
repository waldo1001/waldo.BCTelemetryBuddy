---
name: release
description: Release one or both components (extension + MCP) with version bumps, CHANGELOG updates, git tags, and push
user_invocable: true
arguments:
  - name: args
    description: "Component and bump type, e.g. 'mcp patch', 'extension minor', 'both patch'. Defaults to 'both patch' if omitted."
    required: false
---

# /release — BC Telemetry Buddy Release Skill

You are performing a release of the BC Telemetry Buddy project. This is a monorepo with two independently versioned components:

| Component   | Package path          | Tag format    | Registry              |
|-------------|-----------------------|---------------|-----------------------|
| extension   | `packages/extension`  | `v3.x.x`     | VS Code Marketplace   |
| mcp         | `packages/mcp`        | `mcp-v3.x.x` | npm                   |

## Parse Arguments

Parse `$ARGUMENTS` to extract:
- **component**: `extension`, `mcp`, or `both` (default: `both`)
- **bumpType**: `patch`, `minor`, or `major` (default: `patch`)

Examples: `/release mcp patch`, `/release both minor`, `/release` (= both patch)

## Release Procedure

### Phase 1: Risk Analysis

Before any pre-flight checks or version bumps, walk through the risk questionnaire below. The goal is to surface any reason the release should not ship right now — independent of what the bump-type rules in Phase 2 permit. Treat this as a thinking exercise, not a checkbox: "I don't know" on any question means stop and investigate, not skip.

Work through each question and post a one-line answer in chat (e.g. `1. User-facing breakage: none — only dep bumps`). If any answer raises a concern, **stop immediately and confirm with the user using `AskUserQuestion`** before continuing. Show the user the concern and offer at least three options: proceed-with-acknowledgement, fix-first, abort. Wait for an explicit choice — silence is not approval.

**Risk questions:**
1. **User-facing breakage:** Could any change alter behavior a user already depends on (UI flow, config keys, command names, MCP tool names/args, response shapes)?
2. **Data / state migration:** Does anything change the on-disk format of `.bctb-config.json`, KB cache, profile state, or saved-query files? If yes, is there a tested migration path or graceful fallback?
3. **Auth / security:** Any change to authentication flows, token handling, scopes, env-var names, or required Azure permissions? Could existing setups stop working silently?
4. **External integrations:** Did any external API contract change (Application Insights query shape, Marketplace manifest, MCP protocol version, npm package name/exports)?
5. **Telemetry / privacy:** Are any new properties tracked? Could any property leak PII (tenant IDs, customer names, emails, raw error text, stack traces)?
6. **Rollback path:** If something goes wrong post-release, can a user safely downgrade? Are configs forward/backward-compatible?
7. **Dependency surface:** Did any major-version dep bumps land? Did `engines` requirements change (Node version, VSCode version)?
8. **Skipped or failing tests:** Are any tests skipped or known to fail and being shipped anyway? Is the reason documented?
9. **Documentation gap:** Does any user-visible feature ship without UserGuide/README coverage? (CHANGELOG-only is fine for internal hygiene; user-visible behavior should be documented somewhere users will read.)

**Decision rule:**
- All answers "no concern" → proceed to Phase 2.
- **Any concern, even minor** → STOP. `AskUserQuestion` with a recommended path. Get explicit go-ahead. If the user says "stop" or "abort," do not proceed; document the reason in chat and end the skill.

This phase precedes Phase 2's mechanical blast-radius validation. The two are complementary: Phase 1 asks "*should* we ship this now?" (qualitative judgment); Phase 2 step 5 asks "*is the bump type permitted* by the highest plan rating?" (mechanical check). Both must pass.

### Phase 2: Pre-flight Checks

1. **Confirm branch**: Must be on `main`. If not, warn and ask for confirmation.
2. **Confirm git clean**: Run `git status --porcelain`. If dirty, list the uncommitted files and ask the user whether to commit them first or abort. Do NOT proceed with a dirty tree.
3. **Run tests**: Execute `npm run test` from the repo root. If any test fails, stop and report failures. Do not skip tests.
4. **Run build**: Execute `npm run build` from the repo root. If build fails, stop and report.
5. **Validate bump type against blast radius**: Read the `Blast radius / breakage prediction` section of every plan file in [docs/plans/](../../../docs/plans/) whose `status` has flipped to `done` since the last release tag for this component. If any plan touching the component is rated `breaking`, the bump type MUST be `major` — reject a `patch`/`minor` request and ask the user to confirm a `major` bump instead. If any is `risky`, require at least `minor`. If all are `safe`/`low-risk`, any bump type is allowed. Record the highest rating found in the CHANGELOG entry for this release.

### Phase 3: Version Bump (per component)

For each component being released (if `both`, do extension first, then mcp):

1. Read the current version from `packages/<component>/package.json`.
2. Run `npm version <bumpType> --no-git-tag-version` inside `packages/<component>/`.
3. Read the new version back from `package.json`.
4. Update `package-lock.json` by running `npm install --package-lock-only` from the repo root.

### Phase 4: CHANGELOG Update (per component)

For each component, update `packages/<component>/CHANGELOG.md`:

1. Read the CHANGELOG file.
2. Find the `## [Unreleased]` section.
3. If there is content under `[Unreleased]` (any `###` headings with entries):
   - Insert a new version heading `## [<newVersion>] - YYYY-MM-DD` between `[Unreleased]` and the content.
   - Leave the `## [Unreleased]` heading in place (empty, ready for next cycle).
4. If `[Unreleased]` has no content, warn but continue — the version bump still applies.

**CHANGELOG format** (the result should look like):
```markdown
## [Unreleased]

## [3.3.9] - 2026-04-11

### Added
- ...

### Fixed
- ...
```

### Phase 5: Commit & Tag

**If releasing both components**, create a single commit and two tags:

```bash
git add packages/extension/package.json packages/mcp/package.json packages/extension/CHANGELOG.md packages/mcp/CHANGELOG.md package-lock.json
git commit -m "chore: release Extension v<extVersion> and MCP v<mcpVersion>"
git tag "v<extVersion>"
git tag "mcp-v<mcpVersion>"
```

**If releasing a single component**:

```bash
# Extension
git add packages/extension/package.json packages/extension/CHANGELOG.md package-lock.json
git commit -m "chore: release Extension v<version>"
git tag "v<version>"

# MCP
git add packages/mcp/package.json packages/mcp/CHANGELOG.md package-lock.json
git commit -m "chore: release MCP v<version>"
git tag "mcp-v<version>"
```

Before tagging, check if the tag already exists with `git tag -l "<tag>"`. If it does, stop and ask the user.

### Phase 6: Push

**Ask the user for confirmation** before pushing. Show them a summary:
- Component(s) released
- Old version -> New version (for each)
- Tag(s) that will be created
- Commits ahead of remote

Then push:

```bash
git push origin main
git push origin <tag1>
git push origin <tag2>  # if both
```

### Phase 7: Post-release

After a successful push, show the user:
- GitHub Actions link: `https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions`
- Release page(s): `https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/<tag>`
- For extension: VS Code Marketplace link: `https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy`
- For MCP: npm link: `https://www.npmjs.com/package/bc-telemetry-buddy-mcp`

## Important Notes

- The `scripts/release.ps1` PowerShell script exists but **cannot release both components at once** and has CHANGELOG regex issues. This skill replaces it for Claude Code usage.
- **Never** skip the test phase — broken releases are worse than delayed releases.
- The Co-Authored-By trailer is NOT added to release commits (they are chore commits, not feature work).
- GitHub Actions CI/CD handles the actual marketplace/npm publishing — triggered by the tag push.
