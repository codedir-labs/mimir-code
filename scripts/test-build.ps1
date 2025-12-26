# Quick build test - verifies the build works without full installation

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$RootDir = Split-Path -Parent $ScriptDir

Write-Host "Building project..." -ForegroundColor Blue
Set-Location $RootDir
& yarn build

if (-not (Test-Path "dist\cli.mjs")) {
    Write-Host "✗ FAILED - dist\cli.mjs not found" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path "dist\cli.cjs")) {
    Write-Host "✗ FAILED - dist\cli.cjs not found (needed for pkg)" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Build successful" -ForegroundColor Green
Write-Host ""
Write-Host "Testing bundled CLI directly..."
& node dist\cli.mjs --version

Write-Host ""
Write-Host "✓ All checks passed!" -ForegroundColor Green
Write-Host ""
Write-Host "Bundle sizes:"
Get-Item dist\cli.mjs, dist\cli.cjs | Select-Object Name, @{Name="Size";Expression={"{0:N2} KB" -f ($_.Length / 1KB)}}
Write-Host ""
Write-Host "To test installation: yarn test:install:win"
