# CI/CD Telemetry Integration - Quick Summary

## What Changed

### GitHub Actions Workflows Updated

**1. `.github/workflows/ci.yml` (CI/Test Builds)**
- Added step to generate `telemetryConfig.generated.ts` with **empty connection string**
- Result: No telemetry sent during CI tests (privacy-first approach)

**2. `.github/workflows/release-extension.yml` (Extension Releases)**
- Added step to inject `AI_CONNECTION_STRING` secret before building
- Result: Published VSIX includes working telemetry

**3. `.github/workflows/release-mcp.yml` (MCP Releases)**
- Added step to inject `AI_CONNECTION_STRING` secret before building
- Result: Published NPM package includes working telemetry

### How It Works

```yaml
# CI Builds (no telemetry)
- name: Generate telemetry config (dev mode - no connection string)
  run: |
    cat > packages/shared/src/telemetryConfig.generated.ts << 'EOF'
    export const TELEMETRY_CONNECTION_STRING = '';
    EOF

# Release Builds (with telemetry)
- name: Generate telemetry config with AI connection string
  run: |
    cat > packages/shared/src/telemetryConfig.generated.ts << 'EOF'
    export const TELEMETRY_CONNECTION_STRING = '${{ secrets.AI_CONNECTION_STRING }}';
    EOF
  env:
    AI_CONNECTION_STRING: ${{ secrets.AI_CONNECTION_STRING }}
```

### Files Updated
- ✅ `.github/workflows/ci.yml` - 2 jobs updated (test-mcp, test-extension)
- ✅ `.github/workflows/release-extension.yml` - 3 jobs updated (build-and-test, publish-marketplace, publish-prerelease)
- ✅ `.github/workflows/release-mcp.yml` - 3 jobs updated (build-and-test, publish-npm, publish-npm-prerelease)

### Documentation Created
- ✅ `docs/GitHub-Secrets-Setup.md` - Complete guide for setting up all GitHub secrets
- ✅ `docs/CI-CD-Setup.md` - Updated with telemetry integration and security safeguards

## What You Need to Do

### Step 1: Get Azure Application Insights Connection String

1. Go to [Azure Portal](https://portal.azure.com)
2. Create/open an Application Insights resource
3. Navigate to **Overview**
4. Copy the **Connection String** (looks like: `InstrumentationKey=abc...;IngestionEndpoint=https://...`)

### Step 2: Add GitHub Secret

1. Go to: `https://github.com/waldo1001/waldo.BCTelemetryBuddy/settings/secrets/actions`
2. Click **"New repository secret"**
3. Name: `AI_CONNECTION_STRING`
4. Value: Paste the connection string from Azure
5. Click **"Add secret"**

### Step 3: Set Up Azure Safeguards (IMPORTANT!)

**Cost Budget Alert:**
1. Azure Portal → Cost Management → Budgets
2. Create budget for Application Insights resource
3. Set amount: $50/month (starting point, adjust as needed)
4. Alert thresholds: 50%, 80%, 100%, 150%
5. Email alerts to: your email

**Anomaly Detection Alerts:**
1. Azure Portal → Application Insights → Alerts
2. Create alert for **"Ingestion volume spike"** (>10x daily average)
3. Create alert for **"Error rate spike"** (>100 errors/hour)
4. Actions: Email + SMS

### Step 4: Test It

**Test CI (no telemetry):**
```bash
git push origin <branch-name>
# Check: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions
# CI runs with empty connection string
```

**Test Release (with telemetry):**
```bash
# Extension release
git tag v0.3.1
git push origin v0.3.1

# Or MCP release
git tag mcp-v1.0.2
git push origin mcp-v1.0.2

# GitHub Actions will inject AI connection string during build
```

## Security Notes

✅ **Connection string is NOT in the repository** - It's a GitHub secret
✅ **CI builds don't send telemetry** - Empty string during tests
✅ **Release builds inject it** - Only when publishing official artifacts
✅ **Rate limiting is in the code** - Max 1000 events per session, error deduplication
✅ **Respects user privacy** - Honors VS Code telemetry settings (off/crash/error/all)
✅ **GDPR-compliant** - Pseudonymous tracking, no PII, right to reset ID

## What Gets Tracked (When Enabled)

**Extension:**
- Activation, deactivation, errors
- Command usage (which features are used)
- MCP connection status
- Migration completion

**MCP:**
- Server start/stop
- Tool invocations (query, save, recommendations)
- Kusto query performance (duration, success/fail)
- Authentication flow (success/fail)
- Cache hit/miss rates

**What's NOT Tracked:**
- ❌ User code or data
- ❌ Personally identifiable information (PII)
- ❌ Business Central telemetry query results
- ❌ Azure credentials or secrets
- ❌ File paths or workspace names

## Reference

- Full design: `Instructions/Telemetry-Design-and-Implementation.md`
- GitHub secrets guide: `docs/GitHub-Secrets-Setup.md`
- CI/CD setup: `docs/CI-CD-Setup.md`
- Code implementation: `packages/shared/src/usageTelemetry.ts`

## Troubleshooting

**"AI_CONNECTION_STRING secret not found"**
→ Check the secret name is exactly `AI_CONNECTION_STRING` (case-sensitive)

**"Published extension has empty connection string"**
→ Verify the secret is set in GitHub repository settings, not organization/environment

**"Too much telemetry data / high costs"**
→ Check Azure alerts, verify rate limiting is working, consider adjusting budget

**"Want to disable telemetry entirely"**
→ Don't set the `AI_CONNECTION_STRING` secret, or set it to empty string
