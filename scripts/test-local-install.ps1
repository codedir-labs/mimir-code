# Local installation test script for Windows (PowerShell)
# Tests the installation process without needing to push to GitHub

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host "  Mimir Local Installation Test" -ForegroundColor Cyan
Write-Host "══════════════════════════════════════" -ForegroundColor Cyan
Write-Host ""

# Step 1: Build the project
Write-Host "[1/5] Building project..." -ForegroundColor Blue
Set-Location $RootDir
& yarn build

# Step 2: Create a test directory
Write-Host "[2/5] Setting up test environment..." -ForegroundColor Blue
$TestDir = Join-Path $env:TEMP "mimir-test-$(Get-Random)"
New-Item -ItemType Directory -Path $TestDir -Force | Out-Null
Write-Host "Test directory: $TestDir"

function Cleanup {
    Write-Host ""
    Write-Host "Cleaning up test environment..." -ForegroundColor Yellow

    # Uninstall mimir if it was installed
    try {
        if (Get-Command mimir -ErrorAction SilentlyContinue) {
            if (Get-Command yarn -ErrorAction SilentlyContinue) {
                & yarn global remove @codedir/mimir-code 2>$null
            } else {
                & npm uninstall -g @codedir/mimir-code 2>$null
            }
        }
    } catch {}

    # Remove test directory
    Remove-Item -Recurse -Force $TestDir -ErrorAction SilentlyContinue

    Write-Host "Cleanup complete" -ForegroundColor Green
}

# Step 3: Pack the npm package locally
Write-Host "[3/5] Creating local npm package..." -ForegroundColor Blue
Set-Location $RootDir
$PackageFile = (npm pack) | Select-Object -Last 1
$PackagePath = Join-Path $RootDir $PackageFile
Write-Host "Package created: $PackageFile"

try {
    # Step 4: Install from local package
    Write-Host "[4/5] Installing from local package..." -ForegroundColor Blue
    npm install -g $PackagePath

    # Step 5: Run verification tests
    Write-Host "[5/5] Running verification tests..." -ForegroundColor Blue
    Write-Host ""

    # Test 1: Check if mimir is in PATH
    Write-Host "Test 1: Checking if mimir is in PATH..." -ForegroundColor Blue
    $mimirCmd = Get-Command mimir -ErrorAction SilentlyContinue
    if (-not $mimirCmd) {
        Write-Host "✗ FAILED - mimir not found in PATH" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ PASSED - mimir found at: $($mimirCmd.Source)" -ForegroundColor Green

    # Test 2: Check if mimir runs
    Write-Host "Test 2: Checking if mimir --version works..." -ForegroundColor Blue
    try {
        $version = & mimir --version 2>&1
        Write-Host "✓ PASSED - mimir version: $version" -ForegroundColor Green
    }
    catch {
        Write-Host "✗ FAILED - mimir --version failed" -ForegroundColor Red
        & mimir --version 2>&1
        exit 1
    }

    # Test 3: Test mimir init
    Write-Host "Test 3: Testing mimir init..." -ForegroundColor Blue
    Set-Location $TestDir

    $initJob = Start-Job -ScriptBlock { & mimir init --no-interactive 2>&1 }
    $initJob | Wait-Job -Timeout 30 | Out-Null

    if ($initJob.State -ne 'Completed') {
        Stop-Job $initJob
        Write-Host "✗ FAILED - mimir init timed out" -ForegroundColor Red
        exit 1
    }

    if (-not (Test-Path ".mimir") -or -not (Test-Path ".mimir\config.yml")) {
        Write-Host "✗ FAILED - .mimir directory or config.yml not created" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ PASSED - mimir init successful" -ForegroundColor Green

    # Test 4: Test config preservation (upgrade simulation)
    Write-Host "Test 4: Testing config preservation during upgrade..." -ForegroundColor Blue
    Add-Content -Path ".mimir\config.yml" -Value "# Custom setting"
    Add-Content -Path ".mimir\config.yml" -Value "testValue: true"

    # Reinstall (simulate upgrade)
    Set-Location $RootDir
    npm install -g $PackagePath --force

    $configContent = Get-Content "$TestDir\.mimir\config.yml" -Raw
    if ($configContent -notmatch "testValue") {
        Write-Host "✗ FAILED - Custom config was overwritten" -ForegroundColor Red
        exit 1
    }
    Write-Host "✓ PASSED - Config preserved during upgrade" -ForegroundColor Green

    # Summary
    Write-Host ""
    Write-Host "══════════════════════════════════════" -ForegroundColor Green
    Write-Host "  ✓ All tests passed!" -ForegroundColor Green
    Write-Host "══════════════════════════════════════" -ForegroundColor Green
    Write-Host ""
    Write-Host "Test summary:"
    Write-Host "  ✓ mimir installed successfully"
    Write-Host "  ✓ mimir --version works"
    Write-Host "  ✓ mimir init works"
    Write-Host "  ✓ Config preservation works"
    Write-Host ""
    Write-Host "Package file: $PackageFile"
    Write-Host "You can manually test with: npm install -g $PackagePath"
    Write-Host ""
}
finally {
    Cleanup
}
