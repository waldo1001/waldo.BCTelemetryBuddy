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
.PARAMETER NoCommit
    Don't commit and push changes (useful for manual review before pushing)
.PARAMETER DryRun
    Show what would happen without actually making changes
.EXAMPLE
    .\scripts\release.ps1 -BumpType patch
    .\scripts\release.ps1 -BumpType minor -Component both
    .\scripts\release.ps1 -BumpType patch -NoCommit
    .\scripts\release.ps1 -BumpType patch -DryRun
    .\scripts\release.ps1 -BumpType patch -RunTests
#>

param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('patch', 'minor', 'major')]
    [string]$BumpType,
    
    [Parameter(Mandatory=$false)]
    [ValidateSet('extension', 'mcp', 'both')]
    [string]$Component = 'extension',
    
    [Parameter(Mandatory=$false)]
    [switch]$NoCommit,
    
    [Parameter(Mandatory=$false)]
    [switch]$DryRun,
    
    [Parameter(Mandatory=$false)]
    [switch]$RunTests
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

# Run tests if requested
if ($RunTests) {
    Write-Step "Running all tests..."
    if (-not $DryRun) {
        npm test
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Tests failed! Fix tests before releasing."
            exit 1
        }
        Write-Success "All tests passed"
    }
} else {
    Write-Warning "Skipping tests (use -RunTests to run tests before release)"
}

# Function to update CHANGELOG.md (move [Unreleased] to new version)
function Update-Changelog {
    param($PackagePath, $Version)
    
    $changelogPath = "$PackagePath/CHANGELOG.md"
    
    if (-not (Test-Path $changelogPath)) {
        Write-Warning "CHANGELOG.md not found at $changelogPath - skipping"
        return
    }
    
    $content = Get-Content $changelogPath -Raw
    
    # Check if there's an [Unreleased] section with content
    if ($content -notmatch '## \[Unreleased\]\s*\n\s*\n(###.+?)(?=\n## \[|\z)') {
        Write-Warning "No [Unreleased] section with content found in CHANGELOG.md - skipping"
        return
    }
    
    # Get today's date
    $date = Get-Date -Format "yyyy-MM-dd"
    
    # Replace [Unreleased] with new version and add empty [Unreleased] section
    $newContent = $content -replace `
        '## \[Unreleased\]', `
        "## [Unreleased]`n`n## [$Version] - $date"
    
    if ($DryRun) {
        Write-Host "  Would update CHANGELOG.md: [Unreleased] → [$Version] - $date" -ForegroundColor Yellow
    } else {
        Set-Content -Path $changelogPath -Value $newContent -NoNewline
        Write-Host "  Updated CHANGELOG.md: [Unreleased] → [$Version] - $date" -ForegroundColor Green
    }
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
    Write-Step "Updating extension CHANGELOG..."
    Update-Changelog -PackagePath "packages/extension" -Version $extensionVersion
}

# Bump MCP version
$mcpVersion = $null
if ($Component -eq 'mcp' -or $Component -eq 'both') {
    Write-Step "Bumping MCP version ($BumpType)..."
    $mcpVersion = Bump-Version -PackagePath "packages/mcp"
    Write-Step "Updating MCP CHANGELOG..."
    Update-Changelog -PackagePath "packages/mcp" -Version $mcpVersion
}

# Determine tag version and format
if ($Component -eq 'both') {
    Write-Warning "Cannot release both components simultaneously with new pipeline (different tag formats required)"
    Write-Host "Please choose either 'extension' or 'mcp' to release one component at a time." -ForegroundColor Yellow
    exit 1
}

$tagVersion = if ($Component -eq 'extension') { 
    $extensionVersion 
} else { 
    $mcpVersion 
}

# Format tag based on component type
$gitTag = if ($Component -eq 'mcp') { "mcp-v$tagVersion" } else { "v$tagVersion" }

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Release Summary" -ForegroundColor Magenta
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host "  Component: $Component" -ForegroundColor Cyan
Write-Host "  Bump Type: $BumpType" -ForegroundColor Cyan
Write-Host "  Git Tag: $gitTag" -ForegroundColor Cyan
Write-Host "  Version: v$tagVersion" -ForegroundColor Cyan
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Magenta
Write-Host ""

if ($DryRun) {
    Write-Warning "DRY RUN - No changes were made"
    Write-Host ""
    Write-Host "To actually release, run:" -ForegroundColor Yellow
    Write-Host "  .\scripts\release.ps1 -BumpType $BumpType -Component $Component" -ForegroundColor White
    exit 0
}

if ($NoCommit) {
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "  Version Bumped (Not Committed)" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
    Write-Warning "Changes made but not committed (-NoCommit flag)"
    Write-Host ""
    Write-Host "Review the changes, then manually:" -ForegroundColor Cyan
    if ($Component -eq 'extension') {
        Write-Host "  git add packages/extension/package.json packages/extension/CHANGELOG.md package-lock.json" -ForegroundColor White
        Write-Host "  git commit -m 'chore: bump extension version to $tagVersion'" -ForegroundColor White
        Write-Host "  git tag v$tagVersion" -ForegroundColor White
        Write-Host "  git push origin main" -ForegroundColor White
        Write-Host "  git push origin v$tagVersion" -ForegroundColor White
    } else {
        Write-Host "  git add packages/mcp/package.json packages/mcp/CHANGELOG.md package-lock.json" -ForegroundColor White
        Write-Host "  git commit -m 'chore: bump mcp version to $tagVersion'" -ForegroundColor White
        Write-Host "  git tag mcp-v$tagVersion" -ForegroundColor White
        Write-Host "  git push origin main" -ForegroundColor White
        Write-Host "  git push origin mcp-v$tagVersion" -ForegroundColor White
    }
    Write-Host ""
    exit 0
}

# Check if tag already exists
Write-Step "Checking if tag $gitTag already exists..."
$tagExists = git tag -l "$gitTag"
if ($tagExists) {
    Write-Warning "Tag $gitTag already exists"
    $recreate = Read-Host "Delete and recreate the tag? This will update it to point to the new version bump commit. (y/N)"
    if ($recreate -ne "y" -and $recreate -ne "Y") {
        Write-Host "Release cancelled. Please delete the tag manually or use a different version."
        exit 1
    }
    
    Write-Step "Deleting existing tag $gitTag..."
    git tag -d "$gitTag" | Out-Null
    Write-Host "  Deleted local tag" -ForegroundColor Gray
    
    # Try to delete remote tag (may not exist remotely)
    git push origin ":refs/tags/$gitTag" 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  Deleted remote tag" -ForegroundColor Gray
    }
    Write-Success "Existing tag deleted"
}

# Commit the version bump (including package-lock.json and CHANGELOG.md)
Write-Step "Committing version bump..."
if ($Component -eq 'extension') {
    git add packages/extension/package.json packages/extension/CHANGELOG.md package-lock.json
    git commit -m "chore: bump extension version to $tagVersion"
} else {
    git add packages/mcp/package.json packages/mcp/CHANGELOG.md package-lock.json
    git commit -m "chore: bump mcp version to $tagVersion"
}

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to commit version bump"
    exit 1
}
Write-Success "Version bump committed"

# Create git tag
Write-Step "Creating git tag $gitTag..."
git tag "$gitTag"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to create tag"
    exit 1
}
Write-Success "Tag created"

# Push to GitHub
Write-Step "Pushing to GitHub..."
Write-Host "  Pushing commits..." -ForegroundColor Gray
git push origin main
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push commits to GitHub"
    exit 1
}

Write-Host "  Pushing tag..." -ForegroundColor Gray
git push origin "$gitTag"
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to push tag to GitHub"
    exit 1
}
Write-Success "Pushed to GitHub"

Write-Host ""
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host "  🚀 Release Initiated Successfully!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Monitor GitHub Actions: https://github.com/waldo1001/waldo.BCTelemetryBuddy/actions" -ForegroundColor White
Write-Host "  2. Review the release: https://github.com/waldo1001/waldo.BCTelemetryBuddy/releases/tag/$gitTag" -ForegroundColor White
if ($Component -eq 'extension') {
    Write-Host "  3. Check VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=waldoBC.bc-telemetry-buddy" -ForegroundColor White
} else {
    Write-Host "  3. Check NPM: https://www.npmjs.com/package/bc-telemetry-buddy-mcp" -ForegroundColor White
}
Write-Host ""
