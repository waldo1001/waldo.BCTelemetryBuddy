<#
.SYNOPSIS
    Launch MCP Inspector for local testing of the SDK-based MCP server.

.DESCRIPTION
    Builds the MCP package and starts the MCP Inspector against the built server.
    Uses the iFacto customer workspace config for real App Insights connectivity.
    
    Prerequisites:
    - Node.js 18+ installed
    - Azure CLI authenticated: az login --tenant <your-tenant-id>
    - Customer workspace with .bctb-config.json at the configured path

.PARAMETER WorkspacePath
    Path to workspace containing .bctb-config.json (default: iFacto Customers)

.PARAMETER SkipBuild
    Skip the build step if you've already built recently

.EXAMPLE
    .\scripts\test-inspector.ps1
    .\scripts\test-inspector.ps1 -WorkspacePath "C:\MyWorkspace"
    .\scripts\test-inspector.ps1 -SkipBuild
#>

param(
    [string]$WorkspacePath = "C:\_Source\iFacto\iFacto.TelemetryResearch\Customers",
    [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
$mcpDir = Join-Path $repoRoot "packages\mcp"

# Validate workspace
if (-not (Test-Path $WorkspacePath)) {
    Write-Error "Workspace path not found: $WorkspacePath"
    exit 1
}

$configFile = Join-Path $WorkspacePath ".bctb-config.json"
if (-not (Test-Path $configFile)) {
    Write-Warning "No .bctb-config.json found at $WorkspacePath — env vars will be used for config"
}

# Validate Azure CLI auth
Write-Host "Checking Azure CLI authentication..." -ForegroundColor Cyan
try {
    $account = az account show --query "{name:name, tenantId:tenantId}" -o json 2>$null | ConvertFrom-Json
    Write-Host "  Authenticated as: $($account.name) (tenant: $($account.tenantId))" -ForegroundColor Green
} catch {
    Write-Error "Azure CLI not authenticated. Run: az login --tenant <your-tenant-id>"
    exit 1
}

# Build
if (-not $SkipBuild) {
    Write-Host "`nBuilding MCP package..." -ForegroundColor Cyan
    Push-Location $mcpDir
    npm run build
    if ($LASTEXITCODE -ne 0) {
        Pop-Location
        Write-Error "Build failed!"
        exit 1
    }
    Pop-Location
    Write-Host "  Build succeeded" -ForegroundColor Green
} else {
    Write-Host "`nSkipping build (use without -SkipBuild to rebuild)" -ForegroundColor Yellow
}

# Kill any existing inspector on port 6277
$existing = Get-NetTCPConnection -LocalPort 6277 -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 }
if ($existing) {
    Write-Host "`nKilling existing process on port 6277..." -ForegroundColor Yellow
    $existing | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object {
        Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
}

# Set environment variables
Write-Host "`nSetting environment variables..." -ForegroundColor Cyan
$env:BCTB_WORKSPACE_PATH = $WorkspacePath
$env:BCTB_AUTH_FLOW = "azure_cli"

# Read config file for additional env vars if present
if (Test-Path $configFile) {
    $config = Get-Content $configFile | ConvertFrom-Json
    if ($config.tenantId) { $env:BCTB_TENANT_ID = $config.tenantId }
    if ($config.applicationInsightsAppId) { $env:BCTB_APP_INSIGHTS_ID = $config.applicationInsightsAppId }
    if ($config.kustoClusterUrl) { $env:BCTB_KUSTO_CLUSTER_URL = $config.kustoClusterUrl }
    Write-Host "  Loaded config from $configFile" -ForegroundColor Green
}

Write-Host "  BCTB_WORKSPACE_PATH   = $env:BCTB_WORKSPACE_PATH" -ForegroundColor Gray
Write-Host "  BCTB_AUTH_FLOW        = $env:BCTB_AUTH_FLOW" -ForegroundColor Gray
Write-Host "  BCTB_TENANT_ID        = $env:BCTB_TENANT_ID" -ForegroundColor Gray
Write-Host "  BCTB_APP_INSIGHTS_ID  = $env:BCTB_APP_INSIGHTS_ID" -ForegroundColor Gray
Write-Host "  BCTB_KUSTO_CLUSTER_URL= $env:BCTB_KUSTO_CLUSTER_URL" -ForegroundColor Gray

# Launch inspector
Write-Host "`nLaunching MCP Inspector..." -ForegroundColor Cyan
Write-Host "  The browser should open automatically." -ForegroundColor Gray
Write-Host "  Press Ctrl+C to stop.`n" -ForegroundColor Gray

Push-Location $mcpDir
npx @modelcontextprotocol/inspector node dist/launcher.js
Pop-Location
