#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Release script for BC Telemetry Buddy extension
.DESCRIPTION
    Bumps version, creates git tag, and pushes to trigger GitHub Actions release workflow
.PARAMETER BumpType
    Type of version bump: patch (0.1.1 -> 0.1.2), minor (0.1.1 -> 0.2.0), or major (0.1.1 -> 1.0.0)
.PARAMETER Component
    Which component to release: extension, mcp, or both (default: extension)
.PARAMETER DryRun
    Show what would happen without actually making changes
.EXAMPLE
    .\scripts\release.ps1 -BumpType patch
    .\scripts\release.ps1 -BumpType minor -Component both
    .\scripts\release.ps1 -BumpType patch -DryRun
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$BumpType,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('extension', 'mcp', 'both')]
    [string]$Component = 'extension',
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun
)

# Color output functions
function Write-Step { param($Message) Write-Host "🔵 $Message" -ForegroundColor Cyan }
function Write-Success { param($Message) Write-Host "✅ $Message" -ForegroundColor Green }
function Write-Warning { param($Message) Write-Host "⚠️  $Message" -ForegroundColor Yellow }
function Write-Error { param($Message) Write-Host "❌ $Message" -ForegroundColor Red }

# Get script directory and repository root
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RepoRoot = Split-Path -Parent $ScriptDir

Set-Location $RepoRoot

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  BC Telemetry Buddy Release Script" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

# Check if git repo is clean
Write-Step "Checking git status..."
$gitStatus = git status --porcelain
if ($gitStatus) {
    Write-Error "Git working directory is not clean. Please commit or stash your changes first."
    Write-Host ""
    Write-Host "Uncommitted changes:" -ForegroundColor Yellow
    git status --short
    exit 1
}
Write-Success "Git working directory is clean"

# Check if on main branch
$currentBranch = git rev-parse --abbrev-ref HEAD
if ($currentBranch -ne "main") {
    Write-Warning "You are not on the main branch (current: $currentBranch)"
    $continue = Read-Host "Continue anyway? (y/N)"
    if ($continue -ne "y" -and $continue -ne "Y") {
        Write-Host "Release cancelled."
        exit 1
    }
}

# Run tests first
Write-Step "Running all tests..."
if (-not $DryRun) {
    npm test
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Tests failed! Fix tests before releasing."
        exit 1
    }
    Write-Success "All tests passed"
}

# Function to bump version and get new version
function Bump-Version {
    param($PackagePath)
    
    $packageJson = Get-Content "$PackagePath/package.json" | ConvertFrom-Json
    $currentVersion = $packageJson.version
    
    Write-Host "  Current version: $currentVersion" -ForegroundColor Gray
    
    if ($DryRun) {
        # Calculate what the new version would be
        $parts = $currentVersion.Split('.')
        switch ($BumpType) {
            'major' { $newVersion = "$([int]$parts[0] + 1).0.0" }
            'minor' { $newVersion = "$($parts[0]).$([int]$parts[1] + 1).0" }
            'patch' { $newVersion = "$($parts[0]).$($parts[1]).$([int]$parts[2] + 1)" }
        }
        Write-Host "  Would bump to: $newVersion" -ForegroundColor Yellow
        return $newVersion
    } else {
        # Actually bump the version
        Push-Location $PackagePath
        npm version $BumpType --no-git-tag-version | Out-Null
        Pop-Location
        
        $packageJson = Get-Content "$PackagePath/package.json" | ConvertFrom-Json
        $newVersion = $packageJson.version
        Write-Host "  New version: $newVersion" -ForegroundColor Green
        return $newVersion
    }
}

# Bump extension version
$extensionVersion = $null
if ($Component -eq 'extension' -or $Component -eq 'both') {
    Write-Step "Bumping extension version ($BumpType)..."
    $extensionVersion = Bump-Version -PackagePath "packages/extension"
}

# Bump MCP version
$mcpVersion = $null
if ($Component -eq 'mcp' -or $Component -eq 'both') {
    Write-Step "Bumping MCP version ($BumpType)..."
    $mcpVersion = Bump-Version -PackagePath "packages/mcp"
}

# Determine tag version (use extension version as primary)
$tagVersion = if ($extensionVersion) { $extensionVersion } else { $mcpVersion }

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Release Summary" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Component: $Component" -ForegroundColor Cyan
Write-Host "  Bump Type: $BumpType" -ForegroundColor Cyan
Write-Host "  Git Tag: v$tagVersion" -ForegroundColor Cyan
if ($extensionVersion) { Write-Host "  Extension: v$extensionVersion" -ForegroundColor Cyan }
if ($mcpVersion) { Write-Host "  MCP: v$mcpVersion" -ForegroundColor Cyan }
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

if ($DryRun) {
    Write-Warning "DRY RUN - No changes were made"
    Write-Host ""
    Write-Host "To actually release, run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\release.ps1 -BumpType $BumpType -Component $Component" -ForegroundColor White
    exit 0
}

# Commit the version bump (including package-lock.json)
Write-Step "Committing version bump..."
if ($Component -eq 'both') {
    git add packages/extension/package.json packages/extension/package-lock.json packages/mcp/package.json packages/mcp/package-lock.json package-lock.json
    git commit -m "chore: bump version to $tagVersion (extension + mcp)"
} elseif ($Component -eq 'extension') {
    git add packages/extension/package.json packages/extension/package-lock.json package-lock.json
    git commit -m "chore: bump extension version to $tagVersion"
} else {
    git add packages/mcp/package.json packages/mcp/package-lock.json package-lock.json
    git commit -m "chore: bump mcp version to $tagVersion"
}
Write-Success "Version bump committed"

# Create git tag
Write-Step "Creating git tag v$tagVersion..."
git tag "v$tagVersion"
Write-Success "Tag created"

# Push to GitHub
Write-Step "Pushing to GitHub..."
Write-Host "  Pushing commits..." -ForegroundColor Gray
git push origin main
Write-Host "  Pushing tag..." -ForegroundColor Gray
git push origin "v$tagVersion"
Write-Success "Pushed to GitHub"

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  🚀 Release Initiated Successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Monitor GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions" -ForegroundColor White
Write-Host "  2. Review the release: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/v$tagVersion" -ForegroundColor White
Write-Host "  3. Check VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy" -ForegroundColor White
Write-Host ""
