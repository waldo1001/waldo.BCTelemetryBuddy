# Release Guide

This guide explains how to release new versions of BC Telemetry Buddy components.

## Architecture

BC Telemetry Buddy is a monorepo with three packages:

1. **@bctb/shared** - Private shared library (not published)
2. **bc-telemetry-buddy-mcp** - NPM package for MCP server
3. **BC Telemetry Buddy Extension** - VS Code extension

Each component has **independent versioning** and **separate release pipelines**.

## Release Workflows

### Extension Release (VS Code Marketplace)

**Trigger**: Git tag matching `v*.*.*` (e.g., `v0.2.24`, `v0.3.0`)

**Pipeline**: `.github/workflows/release-extension.yml`

**Destination**: [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy)

**Process**:
1. Builds extension + shared package
2. Runs all extension tests (145 tests)
3. Creates GitHub release
4. Publishes to VS Code Marketplace (production or pre-release)

### MCP Release (NPM Registry)

**Trigger**: Git tag matching `mcp-v*.*.*` (e.g., `mcp-v1.0.0`, `mcp-v1.1.0`)

**Pipeline**: `.github/workflows/release-mcp.yml`

**Destination**: [NPM Registry](https://www.npmjs.com/package/bc-telemetry-buddy-mcp)

**Process**:
1. Builds MCP + shared package
2. Runs all MCP tests (282 tests)
3. Verifies CLI is executable
4. Creates GitHub release
5. Publishes to NPM (with dist-tag: latest, beta, or next)

## Tag Format

| Component | Tag Format | Examples |
|-----------|-----------|----------|
| Extension | `v*.*.*` | `v0.2.24`, `v0.3.0`, `v1.0.0` |
| MCP | `mcp-v*.*.*` | `mcp-v1.0.0`, `mcp-v1.1.0`, `mcp-v2.0.0` |

**Why different formats?**
- GitHub Actions workflows distinguish between component releases based on tag pattern
- Extension uses traditional `v*.*.*` format (common for VS Code extensions)
- MCP uses `mcp-v*.*.*` prefix to avoid conflicts and clearly identify the component

## Using the Release Script

The `scripts/release.ps1` PowerShell script automates the release process for either component.

### Prerequisites

1. **Clean working directory**
   ```powershell
   git status  # Should show "nothing to commit, working tree clean"
   ```

2. **On main branch**
   ```powershell
   git branch  # Should show "* main"
   ```

3. **All tests passing**
   ```powershell
   npm test
   ```

4. **NPM token configured** (for MCP releases)
   - Repository secret: `NPM_TOKEN`
   - Organization: `@bctb` or similar

### Release Extension

```powershell
# Patch release (0.2.24 → 0.2.25)
.\scripts\release.ps1 -Component extension -BumpType patch

# Minor release (0.2.24 → 0.3.0)
.\scripts\release.ps1 -Component extension -BumpType minor

# Major release (0.2.24 → 1.0.0)
.\scripts\release.ps1 -Component extension -BumpType major
```

**What happens:**
1. Bumps version in `packages/extension/package.json`
2. Updates `packages/extension/CHANGELOG.md` with new version section
3. Updates `package-lock.json`
4. Commits: `chore: bump extension version to X.Y.Z`
5. Creates tag: `vX.Y.Z`
6. Pushes commit and tag to GitHub
7. GitHub Actions triggers `release-extension.yml`

### Release MCP

```powershell
# Patch release (1.0.0 → 1.0.1)
.\scripts\release.ps1 -Component mcp -BumpType patch

# Minor release (1.0.0 → 1.1.0)
.\scripts\release.ps1 -Component mcp -BumpType minor

# Major release (1.0.0 → 2.0.0)
.\scripts\release.ps1 -Component mcp -BumpType major
```

**What happens:**
1. Bumps version in `packages/mcp/package.json`
2. Updates `packages/mcp/CHANGELOG.md` with new version section
3. Updates `package-lock.json`
4. Commits: `chore: bump mcp version to X.Y.Z`
5. Creates tag: `mcp-vX.Y.Z`
6. Pushes commit and tag to GitHub
7. GitHub Actions triggers `release-mcp.yml`

### Script Options

```powershell
# Dry run (preview changes without committing)
.\scripts\release.ps1 -Component extension -BumpType patch -DryRun

# Bump version but don't commit (manual control)
.\scripts\release.ps1 -Component mcp -BumpType minor -NoCommit
```

## Manual Release Process

If you prefer manual control over the release process:

### Extension Manual Release

```powershell
# 1. Bump version
cd packages/extension
npm version patch  # or minor, major
cd ../..

# 2. Update CHANGELOG.md
# Edit packages/extension/CHANGELOG.md manually

# 3. Update package-lock.json
npm install

# 4. Commit and tag
git add packages/extension/package.json packages/extension/CHANGELOG.md package-lock.json
git commit -m "chore: bump extension version to X.Y.Z"
git tag vX.Y.Z

# 5. Push
git push origin main
git push origin vX.Y.Z
```

### MCP Manual Release

```powershell
# 1. Bump version
cd packages/mcp
npm version patch  # or minor, major
cd ../..

# 2. Update CHANGELOG.md
# Edit packages/mcp/CHANGELOG.md manually

# 3. Update package-lock.json
npm install

# 4. Commit and tag
git add packages/mcp/package.json packages/mcp/CHANGELOG.md package-lock.json
git commit -m "chore: bump mcp version to X.Y.Z"
git tag mcp-vX.Y.Z

# 5. Push
git push origin main
git push origin mcp-vX.Y.Z
```

## Pre-releases

### Extension Pre-release

VS Code Marketplace supports pre-release versions.

**Using script:**
```powershell
# Pre-release versions use prerelease bump type
.\scripts\release.ps1 -Component extension -BumpType prerelease
```

**Manual workflow dispatch:**
1. Go to [GitHub Actions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-extension.yml)
2. Click "Run workflow"
3. Enter version (e.g., `0.3.0-beta.1`)
4. Enter tag (e.g., `v0.3.0-beta.1`)
5. Check "Mark as pre-release"
6. Run workflow

### MCP Pre-release

NPM supports dist-tags for pre-releases (beta, next, etc.).

**Using workflow dispatch:**
1. Go to [GitHub Actions](https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-mcp.yml)
2. Click "Run workflow"
3. Enter version (e.g., `1.1.0-beta.1`)
4. Enter tag (e.g., `mcp-v1.1.0-beta.1`)
5. Check "Mark as pre-release"
6. Select NPM dist-tag: `beta` or `next`
7. Run workflow

**Installing pre-releases:**
```bash
# Install beta version
npm install -g bc-telemetry-buddy-mcp@beta

# Install specific pre-release version
npm install -g bc-telemetry-buddy-mcp@1.1.0-beta.1
```

## Monitoring Releases

### Extension Release

1. **GitHub Actions**: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-extension.yml
2. **GitHub Releases**: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases
3. **VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy

**Expected timeline:**
- GitHub Actions: ~5 minutes
- Marketplace availability: ~5-10 minutes after workflow completes
- User updates: Automatic (VS Code checks for updates every few hours)

### MCP Release

1. **GitHub Actions**: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-mcp.yml
2. **GitHub Releases**: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases
3. **NPM Registry**: https://www.npmjs.com/package/bc-telemetry-buddy-mcp

**Expected timeline:**
- GitHub Actions: ~5 minutes
- NPM availability: Immediate (verified in workflow)
- NPM propagation: ~10 seconds globally

## Troubleshooting

### "Tag already exists"

If tag creation fails due to existing tag:

```powershell
# Delete local tag
git tag -d vX.Y.Z  # or mcp-vX.Y.Z

# Delete remote tag
git push origin :refs/tags/vX.Y.Z  # or :refs/tags/mcp-vX.Y.Z

# Re-run release script
.\scripts\release.ps1 -Component <component> -BumpType <type>
```

### "NPM_TOKEN invalid"

MCP release requires valid NPM token:

1. Generate token at https://www.npmjs.com/settings/YOUR_USERNAME/tokens
2. Token type: **Automation** (for CI/CD)
3. Add to GitHub Secrets: `Settings > Secrets > Actions > NPM_TOKEN`
4. Re-run workflow

### "Tests failed"

All tests must pass before release:

```powershell
# Run extension tests
npm run test --workspace=packages/extension

# Run MCP tests
npm run test --workspace=packages/mcp

# Run all tests
npm test
```

Fix test failures before attempting release.

### "Working directory not clean"

Commit or stash changes before releasing:

```powershell
# Check status
git status

# Commit changes
git add .
git commit -m "fix: description"

# Or stash
git stash
```

## Rollback

If a release has critical issues:

### Extension Rollback

1. **Unpublish from Marketplace** (contact VS Code team - rare)
2. **Release previous version**:
   ```powershell
   # Check out previous version
   git checkout v0.2.23  # previous good version
   
   # Re-release as patch
   .\scripts\release.ps1 -Component extension -BumpType patch
   ```

### MCP Rollback

1. **Deprecate bad version**:
   ```bash
   npm deprecate bc-telemetry-buddy-mcp@1.0.1 "Critical bug, use 1.0.0 or 1.0.2"
   ```

2. **Update dist-tag**:
   ```bash
   # Point 'latest' back to previous version
   npm dist-tag add bc-telemetry-buddy-mcp@1.0.0 latest
   ```

3. **Release fixed version**:
   ```powershell
   .\scripts\release.ps1 -Component mcp -BumpType patch
   ```

## Best Practices

1. **Test thoroughly** before releasing
   - All 427 tests should pass
   - Manual testing of new features
   - Test migration scenarios (if applicable)

2. **Update CHANGELOGs** with meaningful descriptions
   - Use semantic versioning (Added, Changed, Fixed, Removed)
   - Link to issues/PRs where applicable
   - Keep [Unreleased] section for future changes

3. **Release one component at a time**
   - Independent versioning allows flexibility
   - Reduces risk of coordinated failures
   - Clearer release notes

4. **Monitor releases**
   - Watch GitHub Actions for failures
   - Check marketplace/NPM for availability
   - Monitor user feedback/issues after release

5. **Communicate changes**
   - Update README if breaking changes
   - Notify users of deprecations
   - Highlight major features in release notes

## Version Strategy

### Extension Versioning

- **Patch** (0.2.X): Bug fixes, minor improvements, documentation
- **Minor** (0.X.0): New features, backward compatible
- **Major** (X.0.0): Breaking changes (e.g., settings format changes)

### MCP Versioning

- **Patch** (1.0.X): Bug fixes, dependency updates
- **Minor** (1.X.0): New CLI commands, new features
- **Major** (X.0.0): Breaking API changes, CLI argument changes

### Shared Package

Shared package is **never published** (private workspace package).
Version in `packages/shared/package.json` is for tracking only.

## Quick Reference

| Task | Command |
|------|---------|
| Release extension patch | `.\scripts\release.ps1 -Component extension -BumpType patch` |
| Release extension minor | `.\scripts\release.ps1 -Component extension -BumpType minor` |
| Release MCP patch | `.\scripts\release.ps1 -Component mcp -BumpType patch` |
| Release MCP minor | `.\scripts\release.ps1 -Component mcp -BumpType minor` |
| Dry run | Add `-DryRun` flag |
| Skip commit | Add `-NoCommit` flag |
| Monitor extension | https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-extension.yml |
| Monitor MCP | https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions/workflows/release-mcp.yml |

## Support

For release issues:
1. Check GitHub Actions logs
2. Review this guide
3. Open issue: https://github.com/waldo1001/waldo.BCTelemetryBuddy/issues
