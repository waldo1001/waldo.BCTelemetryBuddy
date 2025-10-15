# GitHub Actions CI/CD Setup Summary

## ✅ What's Been Created

### Workflows (6 total)

1. **`ci.yml`** — Continuous Integration
   - Multi-OS testing: Ubuntu, Windows, macOS
   - Multi-Node testing: 18.x, 20.x
   - Jobs: test-mcp, test-extension, lint, build
   - Uploads artifacts: .vsix file, MCP dist
   - Codecov integration for coverage reports

2. **`release.yml`** — Automated Releases
   - Triggers: Git tags (`v*.*.*`) or manual dispatch
   - Creates GitHub releases with changelog
   - Publishes to VS Code Marketplace (requires `VSCE_PAT` secret)
   - Publishes to Open VSX Registry (requires `OVSX_PAT` secret)
   - Pre-release support for beta versions

3. **`codeql.yml`** — Security Analysis
   - CodeQL scanning with security-extended queries
   - Runs on push, PR, weekly schedule (Mondays)
   - Results in Security tab

4. **`dependency-review.yml`** — PR Dependency Scanning
   - Reviews dependencies in PRs
   - Fails on moderate+ vulnerabilities
   - Denies GPL-2.0, GPL-3.0, AGPL-3.0 licenses
   - Comments summary in PR

5. **`pr-label.yml`** — Auto-labeling
   - Labels PRs based on changed files
   - Uses `labeler.yml` configuration
   - Labels: mcp, extension, documentation, tests, ci, dependencies

### Configuration Files

6. **`dependabot.yml`** — Automated Dependency Updates
   - Weekly updates (Mondays) for:
     - Root workspace
     - packages/mcp
     - packages/extension
     - GitHub Actions
   - Commit message prefixes (chore(deps), chore(mcp/deps), etc.)
   - Auto-labels PRs
   - Ignores major updates for `@types/vscode` and `typescript`

7. **`labeler.yml`** — Label Configuration
   - Defines file patterns for auto-labeling

### Templates

8. **`ISSUE_TEMPLATE/bug-report.yml`** — Structured Bug Reports
   - Guided form with required fields
   - Collects: description, reproduction steps, logs, version info, OS
   - Checklist to avoid duplicates

9. **`ISSUE_TEMPLATE/feature-request.yml`** — Feature Requests
   - Problem/solution format
   - Component selection
   - Breaking change indicator

10. **`ISSUE_TEMPLATE/config.yml`** — Issue Config
    - Disables blank issues
    - Links to documentation and discussions

11. **`PULL_REQUEST_TEMPLATE.md`** — PR Template
    - Type of change checklist
    - Testing checklist
    - Documentation checklist
    - SOLID principles reminder

### Documentation

12. **`.github/workflows/README.md`** — Comprehensive Workflow Guide
    - Workflow descriptions
    - Required secrets setup
    - Release process documentation
    - Branch protection rules
    - Troubleshooting guide
    - Local testing with `act`

## 🔑 Required Secrets (Action Items)

Configure these in **Settings → Secrets and variables → Actions**:

| Secret | Purpose | Get From |
|--------|---------|----------|
| `VSCE_PAT` | VS Code Marketplace publishing | https://marketplace.visualstudio.com/manage |
| `OVSX_PAT` | Open VSX publishing (optional) | https://open-vsx.org/ |
| `CODECOV_TOKEN` | Coverage reports (optional) | https://codecov.io/ |

### Steps to Get `VSCE_PAT`:
1. Go to https://marketplace.visualstudio.com/manage
2. Create publisher account (e.g., `waldo` or `waldo1001`)
3. Click "New Token" → Name: "GitHub Actions" → Organization: All accessible organizations → Scopes: **Marketplace → Manage**
4. Copy token and add to GitHub repository secrets as `VSCE_PAT`

## 📋 Recommended Branch Protection Rules

Configure for `main` branch in **Settings → Branches**:

✅ **Require pull request reviews before merging**
- Number of required approvals: 1

✅ **Require status checks to pass before merging**
- Require branches to be up to date
- Required checks:
  - `Test MCP Backend (18.x)`
  - `Test MCP Backend (20.x)`
  - `Test VSCode Extension (ubuntu-latest, 18.x)`
  - `Test VSCode Extension (ubuntu-latest, 20.x)`
  - `Lint & Format Check`
  - `Build All Packages`
  - `Analyze Code`

✅ **Require conversation resolution before merging**

✅ **Do not allow bypassing the above settings**

## 🚀 Release Process

### Automated Release (Recommended)

```bash
# 1. Update version in package.json files
npm version patch --workspace=packages/extension  # or minor, major
npm version patch --workspace=packages/mcp

# 2. Update CHANGELOGs
# Edit packages/extension/CHANGELOG.md
# Edit packages/mcp/CHANGELOG.md
# Edit docs/CHANGELOG.md

# 3. Commit and tag
git add .
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main --tags

# 4. Workflow automatically:
#    - Runs all tests
#    - Builds packages
#    - Creates GitHub release
#    - Publishes to VS Code Marketplace
#    - Publishes to Open VSX Registry
```

### Manual Release

1. Go to **Actions → Release**
2. Click **Run workflow**
3. Enter version (e.g., `0.1.0`)
4. Check **Pre-release** if needed
5. Click **Run workflow**

## 🎯 What This Enables

✅ **Automated Testing**: Every PR and push tested on 3 OSes and 2 Node versions (18 test runs total)
✅ **Code Quality**: 70% coverage enforced, TypeScript compilation checked
✅ **Security**: CodeQL scans weekly, dependency vulnerabilities blocked in PRs
✅ **Dependency Management**: Automated PRs for dependency updates every Monday
✅ **Streamlined Releases**: One git tag triggers full release pipeline
✅ **Multi-Platform Publishing**: VS Code Marketplace + Open VSX Registry
✅ **Issue Tracking**: Structured templates guide bug reports and feature requests
✅ **PR Quality**: Auto-labeling, templates ensure consistent PR format

## 🧪 Testing the Workflows

### Locally (with `act`)

```powershell
# Install act (GitHub Actions local runner)
scoop install act  # Windows
# or: brew install act  # macOS

# Test CI workflow
act push -j test-mcp

# Test release workflow (dry-run)
act push -j build-and-test
```

### On GitHub

1. **Create a test PR** → CI workflow runs automatically
2. **Push to main** → CI workflow runs automatically
3. **Create test tag** → `git tag v0.0.1-test && git push --tags` → Release workflow runs (but won't publish without secrets)

## 📊 Monitoring

After setup, monitor:

- **Actions tab**: Workflow runs and logs
- **Security tab**: CodeQL alerts
- **Insights → Dependency graph**: Dependencies and vulnerabilities
- **Pull requests**: Dependabot PRs, auto-labels
- **Codecov dashboard**: Coverage trends (if configured)

## ⚠️ Important Notes

1. **First release will fail** until you configure `VSCE_PAT` secret
2. **Dependabot PRs** will start appearing next Monday (weekly schedule)
3. **CodeQL scan** will run weekly and on every push/PR
4. **Integration tests** are marked `continue-on-error: true` (experimental)
5. **Pre-releases** won't publish to marketplace automatically (manual workflow only)

## 🎉 You're Ready!

All CI/CD infrastructure is now in place. Next steps:

1. ✅ **Run E2E tests** (docs/E2E-TestScript.md)
2. ✅ **Configure GitHub secrets** (VSCE_PAT at minimum)
3. ✅ **Set up branch protection rules** (optional but recommended)
4. ✅ **Test workflows** (create a test PR)
5. ✅ **First release** (when E2E tests pass)

---

**Questions?** Check `.github/workflows/README.md` for detailed documentation.
