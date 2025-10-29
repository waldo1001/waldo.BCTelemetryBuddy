# Release Process for BC Telemetry Buddy

## Overview
This document describes the two-step manual release process for publishing new versions of the BC Telemetry Buddy extension.

---

## STEP 1: PREPARE RELEASE

**When to use:** When the user says "prepare release", "release this", etc.

### Actions to perform:

1. **Read current version** from `packages/extension/package.json`

2. **Update version in package.json**
   - Edit `packages/extension/package.json`
   - Bump version (e.g., 0.2.16 → 0.2.17 for patch)
   - Save the file

3. **Update CHANGELOGs**
   - Edit `packages/extension/CHANGELOG.md`:
     - Add new version section: `## [0.2.Y] - YYYY-MM-DD`
     - Add relevant changes under `### Fixed`, `### Added`, `### Changed`, etc.
     - Keep `[Unreleased]` section at top (empty)
   - Edit `packages/mcp/CHANGELOG.md`:
     - Same format as extension CHANGELOG

4. **Update package-lock.json**
   - Run: `cd packages/extension && npm install`

5. **Commit changes**
   ```powershell
   git add packages/extension/package.json packages/extension/CHANGELOG.md packages/mcp/CHANGELOG.md packages/extension/package-lock.json
   git commit -m "chore: release v0.2.Y"
   ```

6. **Verify git log** to confirm commit looks correct

7. **STOP HERE and present summary:**
   ```
   ✅ Release v0.2.Y prepared and committed locally!
   
   📦 Changes ready:
   • Version bumped: 0.2.X → 0.2.Y
   • CHANGELOGs updated (extension + MCP)
   • package-lock.json updated
   • Committed as "chore: release v0.2.Y"
   
   ⚠️  NOT YET PUSHED TO GITHUB
   
   Ready to publish? Reply "yes" to push and create GitHub release, or "cancel" to abort.
   ```

---

## STEP 2: EXECUTE RELEASE

**When to use:** ONLY after user confirms "yes", "go ahead", "publish", etc.

### Actions to perform:

1. **Push to main**
   ```powershell
   git push origin main
   ```

2. **Create and push tag**
   ```powershell
   git tag v0.2.Y
   git push origin v0.2.Y
   ```

3. **Confirm success:**
   ```
   🚀 Release v0.2.Y initiated successfully!
   
   ✅ Pushed to main
   ✅ Tag v0.2.Y created and pushed
   ✅ GitHub Actions triggered
   
   📊 Monitor progress:
   • GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions
   • Release page: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/v0.2.Y
   • Marketplace: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy
   
   The extension will be live on the marketplace in ~5-10 minutes after CI completes.
   ```

---

## CRITICAL RULES

1. **NEVER skip Step 1** - Always prepare first, then ask for confirmation
2. **NEVER auto-proceed to Step 2** - User must explicitly confirm with "yes", "go ahead", "publish", etc.
3. **NEVER push or tag without user confirmation** - This is a safety measure
4. If user says "cancel" after Step 1, you can undo with: `git reset --soft HEAD~1`
5. Always update package-lock.json by running `npm install` after changing package.json version
6. Always commit package.json + CHANGELOGs + package-lock.json together in one commit
7. Tag must point to the commit containing the version bump

---

## Version Bump Guidelines

- **patch** (0.2.3 → 0.2.4) - Bug fixes, small improvements
- **minor** (0.2.3 → 0.3.0) - New features, backward compatible
- **major** (0.2.3 → 1.0.0) - Breaking changes

---

## CI/CD Pipeline

After pushing the tag, GitHub Actions will:
1. Build the extension and MCP packages
2. Run all tests
3. Package the VSIX file
4. Publish to VS Code Marketplace
5. Create GitHub release with changelog

The extension typically appears on the marketplace 5-10 minutes after the tag is pushed.
