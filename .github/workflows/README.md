# GitHub Actions Workflows

This directory contains CI/CD workflows for the BC Telemetry Buddy project.

## Workflows

### 🔄 CI (`ci.yml`)

**Triggers:** Push to `main`/`develop`, pull requests, manual

**Jobs:**
- **test-mcp** — Tests MCP backend on Node.js 18.x and 20.x
  - Runs unit tests with coverage
  - Uploads coverage to Codecov
- **test-extension** — Tests VSCode extension on Ubuntu, Windows, macOS
  - Runs unit tests with coverage
  - Runs integration tests (Ubuntu only, with xvfb)
  - Multi-platform validation
- **lint** — TypeScript compilation and linting checks
- **build** — Builds all packages and creates `.vsix` artifact

**Coverage Requirements:** 70% for all metrics (configured in `jest.config.js`)

### 🚀 Release (`release.yml`)

**Triggers:** Git tags matching `v*.*.*` (e.g., `v0.1.0`), manual dispatch

**Jobs:**
- **build-and-test** — Full test suite + build + package
- **create-github-release** — Creates GitHub release with `.vsix` file
- **publish-marketplace** — Publishes to VS Code Marketplace (stable only)
  - Requires `VSCE_PAT` secret (Visual Studio Code Extensions Personal Access Token)
  - Also publishes to Open VSX Registry (requires `OVSX_PAT`)
- **publish-prerelease** — Publishes pre-release versions

**Usage:**
```bash
# Tag-based release (recommended)
git tag v0.1.0
git push origin v0.1.0

# Manual release (from GitHub UI)
# Actions → Release → Run workflow → Enter version
```

### 🔒 Security (`codeql.yml`)

**Triggers:** Push to `main`/`develop`, pull requests, scheduled (weekly Monday), manual

**Jobs:**
- **analyze** — CodeQL security analysis
  - Scans TypeScript/JavaScript code
  - Uses `security-extended` and `security-and-quality` queries
  - Results viewable in Security tab

### 📦 Dependency Management

#### Dependabot (`dependabot.yml`)
- **Root workspace** — Weekly dependency updates (Mondays)
- **MCP package** — Weekly updates with `mcp` label
- **Extension package** — Weekly updates with `extension` label
- **GitHub Actions** — Weekly updates with `ci` label

**Ignored Major Updates:**
- `@types/vscode` — Manual review required
- `typescript` — Manual review required

#### Dependency Review (`dependency-review.yml`)
**Triggers:** Pull requests

**Checks:**
- Fails on `moderate` or higher severity vulnerabilities
- Comments summary in PR
- Denies GPL-2.0, GPL-3.0, AGPL-3.0 licenses

### 🏷️ Auto-Labeling (`pr-label.yml`, `labeler.yml`)

**Triggers:** PR opened/updated

**Labels:**
- `mcp` — Changes to `packages/mcp/**/*`
- `extension` — Changes to `packages/extension/**/*`
- `documentation` — Changes to `docs/**/*` or `*.md` files
- `tests` — Changes to test files
- `ci` — Changes to `.github/**/*`
- `dependencies` — Changes to `package.json` files

## Required Secrets

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Required For |
|--------|---------|--------------|
| `VSCE_PAT` | Visual Studio Code Marketplace Personal Access Token | Release workflow |
| `OVSX_PAT` | Open VSX Registry Personal Access Token | Release workflow (optional) |
| `CODECOV_TOKEN` | Codecov upload token | CI workflow (optional) |

### Getting Secrets

#### `VSCE_PAT` (Visual Studio Code Marketplace)
1. Go to https://marketplace.visualstudio.com/manage
2. Create publisher account if needed
3. Generate Personal Access Token with **Marketplace → Manage** permission
4. Add to GitHub secrets

#### `OVSX_PAT` (Open VSX Registry)
1. Go to https://open-vsx.org/
2. Sign in with GitHub
3. Generate Access Token
4. Add to GitHub secrets

#### `CODECOV_TOKEN` (Codecov)
1. Go to https://codecov.io/
2. Connect GitHub repository
3. Copy repository upload token
4. Add to GitHub secrets

## Workflow Status Badges

Add to root `README.md`:

```markdown
![CI](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CI/badge.svg)
![Release](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/Release/badge.svg)
![CodeQL](https://github.com/waldo1001/waldo.BCTelemetryBuddy/workflows/CodeQL%20Security%20Analysis/badge.svg)
[![codecov](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy/branch/main/graph/badge.svg)](https://codecov.io/gh/waldo1001/waldo.BCTelemetryBuddy)
```

## Best Practices

### Branch Protection Rules

Configure in **Settings → Branches → Branch protection rules** for `main`:

- ✅ Require pull request reviews before merging
- ✅ Require status checks to pass:
  - `Test MCP Backend` (Node 18.x, 20.x)
  - `Test VSCode Extension` (Ubuntu, Windows, macOS)
  - `Lint & Format Check`
  - `Build All Packages`
  - `CodeQL`
- ✅ Require branches to be up to date before merging
- ✅ Require conversation resolution before merging
- ✅ Do not allow bypassing the above settings

### Release Process

1. **Update version numbers:**
   ```bash
   # Update packages/extension/package.json
   npm version patch --workspace=packages/extension  # or minor, major
   
   # Update packages/mcp/package.json
   npm version patch --workspace=packages/mcp
   ```

2. **Update CHANGELOGs:**
   - `packages/extension/CHANGELOG.md`
   - `packages/mcp/CHANGELOG.md`
   - `docs/CHANGELOG.md`

3. **Commit and tag:**
   ```bash
   git add .
   git commit -m "chore: release v0.1.0"
   git tag v0.1.0
   git push origin main --tags
   ```

4. **Workflow automatically:**
   - Runs all tests
   - Builds packages
   - Creates GitHub release
   - Publishes to VS Code Marketplace
   - Publishes to Open VSX Registry

### Pre-release Process

For pre-release versions (e.g., beta, alpha):

```bash
# Use workflow dispatch
# Actions → Release → Run workflow
# Version: 0.1.0-beta.1
# Pre-release: ✅ checked
```

This publishes with `--pre-release` flag, making it available only to users who opt into pre-releases.

## Troubleshooting

### CI Failing

**"Tests failed"**
- Check coverage thresholds (70% required)
- Run tests locally: `npm test --workspace=packages/mcp`

**"Build failed"**
- Check TypeScript compilation: `npm run build`
- Verify all dependencies installed: `npm ci`

**"Integration tests failed"**
- Integration tests are experimental (`continue-on-error: true`)
- Not blocking CI, but should be investigated

### Release Failing

**"VSCE_PAT invalid"**
- Regenerate token at https://marketplace.visualstudio.com/manage
- Update GitHub secret

**"Extension validation failed"**
- Check `packages/extension/package.json` for required fields
- Ensure `README.md`, `CHANGELOG.md`, `LICENSE` present

**"Publish conflict"**
- Version already published
- Increment version and retry

### Dependabot Issues

**"Too many PRs"**
- Adjust `open-pull-requests-limit` in `dependabot.yml`
- Close/merge old PRs

**"Major version ignored"**
- Intentional for `@types/vscode` and `typescript`
- Review manually before updating

## Monitoring

- **Actions tab** — View workflow runs and logs
- **Security tab** — View CodeQL alerts and Dependabot alerts
- **Insights → Dependency graph** — View dependencies and vulnerabilities
- **Codecov dashboard** — View coverage trends over time

## Local Testing

Test workflows locally with [act](https://github.com/nektos/act):

```bash
# Install act
# Windows: scoop install act
# macOS: brew install act

# Run CI workflow
act push -j test-mcp

# Run release workflow (dry-run)
act push -j build-and-test --input version=0.1.0
```

---

**Questions?** Check [GitHub Actions Documentation](https://docs.github.com/en/actions) or open an issue.
