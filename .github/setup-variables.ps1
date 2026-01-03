#Requires -Version 5.1
<#
.SYNOPSIS
    Setup GitHub repository variables for CI/CD workflows

.DESCRIPTION
    This script configures GitHub repository variables used by CI/CD workflows.
    Run this once when setting up the repository or after cloning.

.EXAMPLE
    .\.github\setup-variables.ps1

.NOTES
    Requirements:
    - gh CLI installed and authenticated (https://cli.github.com/)
    - Write access to the repository
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

Write-Host "Setting up GitHub repository variables..." -ForegroundColor Cyan
Write-Host ""

# Check if gh is installed
try {
    $null = Get-Command gh -ErrorAction Stop
} catch {
    Write-Host "Error: gh CLI is not installed" -ForegroundColor Red
    Write-Host "Install from: https://cli.github.com/"
    exit 1
}

# Check if authenticated
$authStatus = gh auth status 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: gh CLI is not authenticated" -ForegroundColor Red
    Write-Host "Run: gh auth login"
    exit 1
}

# Define variables
# NODE_VERSION: Used across all workflows for consistent Node.js version
Write-Host -NoNewline "Setting NODE_VERSION=22... "
$result = gh variable set NODE_VERSION --body "22" 2>&1
if ($LASTEXITCODE -eq 0) {
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "Updated" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Repository variables configured successfully!" -ForegroundColor Green
Write-Host ""
Write-Host "Current variables:"
gh variable list

Write-Host ""
Write-Host "Usage in workflows:"
Write-Host '  node-version: ${{ vars.NODE_VERSION || ''22'' }}'
