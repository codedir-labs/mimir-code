# Mimir Uninstallation Script for Windows (PowerShell)

$ErrorActionPreference = "Continue"

# Colors
function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor Blue
}

function Write-Success {
    param([string]$Message)
    Write-Host "[SUCCESS] $Message" -ForegroundColor Green
}

function Write-Warning {
    param([string]$Message)
    Write-Host "[WARNING] $Message" -ForegroundColor Yellow
}

function Write-ErrorMsg {
    param([string]$Message)
    Write-Host "[ERROR] $Message" -ForegroundColor Red
}

# Main uninstallation
function Main {
    Write-Host ""
    Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
    Write-Host "║      Mimir Uninstaller           ║" -ForegroundColor Cyan
    Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    Write-Warning "This will remove Mimir from your system."
    Write-Host ""

    # Remove global package
    Write-Info "Removing Mimir package..."

    try {
        if (Get-Command yarn -ErrorAction SilentlyContinue) {
            Write-Info "Detected yarn, removing global package..."
            yarn global remove mimir-code 2>&1 | Out-Null
        }
        elseif (Get-Command npm -ErrorAction SilentlyContinue) {
            Write-Info "Detected npm, removing global package..."
            npm uninstall -g mimir-code 2>&1 | Out-Null
        }
        else {
            Write-ErrorMsg "Neither npm nor yarn found. Cannot remove package."
        }
    }
    catch {
        Write-Warning "Package not found or already removed"
    }

    # Ask about configuration
    Write-Host ""
    Write-Warning "Configuration directory: $env:USERPROFILE\.mimir"
    Write-Host "This contains:"
    Write-Host "  • config.yml (your settings and API keys)"
    Write-Host "  • mimir.db (conversation history)"
    Write-Host "  • logs\ (application logs)"
    Write-Host ""

    $removeConfig = Read-Host "Remove configuration directory? [y/N]"

    if ($removeConfig -eq 'y' -or $removeConfig -eq 'Y') {
        $configPath = Join-Path $env:USERPROFILE ".mimir"

        if (Test-Path $configPath) {
            # Create backup
            $timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
            $backupPath = Join-Path $env:USERPROFILE ".mimir_backup_$timestamp"

            Write-Info "Creating backup at $backupPath"
            Copy-Item -Path $configPath -Destination $backupPath -Recurse

            # Remove directory
            Remove-Item -Path $configPath -Recurse -Force
            Write-Success "Configuration removed (backup saved to $backupPath)"
        }
        else {
            Write-Info "Configuration directory not found"
        }
    }
    else {
        Write-Info "Configuration preserved at $env:USERPROFILE\.mimir"
    }

    Write-Host ""
    Write-Success "Uninstallation complete!"
    Write-Host ""
    Write-Info "Thank you for using Mimir!"
    Write-Host ""
}

# Run uninstallation
try {
    Main
}
catch {
    Write-ErrorMsg "Uninstallation failed: $_"
    exit 1
}
