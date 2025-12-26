# Mimir Code Installation Script for Windows (PowerShell)

param(
    [string]$Version = "latest",  # Version to install (default: latest)
    [switch]$TestMode = $false     # Enable test mode with verification
)

$ErrorActionPreference = "Stop"

# Configuration
$InstallDir = "$env:USERPROFILE\.mimir"
$GithubRepo = "codedir-labs/mimir-code"

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

# Check if running as Administrator
function Test-Administrator {
    $currentUser = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($currentUser)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# Detect platform (GitHub convention: windows-amd64, windows-arm64)
function Get-Platform {
    $arch = $env:PROCESSOR_ARCHITECTURE

    switch ($arch) {
        "AMD64" { return "windows-amd64" }
        "ARM64" { return "windows-arm64" }
        default {
            Write-ErrorMsg "Unsupported architecture: $arch"
            exit 1
        }
    }
}

# Check dependencies
function Test-Dependencies {
    Write-Info "Checking dependencies..."

    # Check for Node.js
    try {
        $nodeVersion = (node --version) -replace 'v', ''
        $nodeMajor = [int]($nodeVersion.Split('.')[0])

        if ($nodeMajor -lt 18) {
            Write-ErrorMsg "Node.js version 18 or higher is required for Mimir Code. Current version: v$nodeVersion"
            Write-Info "Please install Node.js from https://nodejs.org/"
            exit 1
        }

        Write-Success "Node.js v$nodeVersion detected"
    }
    catch {
        Write-ErrorMsg "Node.js is not installed or not in PATH"
        Write-Info "Please install Node.js from https://nodejs.org/"
        exit 1
    }

    # Check for npm/yarn
    $hasNpm = Get-Command npm -ErrorAction SilentlyContinue
    $hasYarn = Get-Command yarn -ErrorAction SilentlyContinue

    if (-not $hasNpm -and -not $hasYarn) {
        Write-ErrorMsg "npm or yarn is required but not found"
        exit 1
    }

    Write-Success "All dependencies satisfied"
}

# Create directories
function New-Directories {
    Write-Info "Creating directories..."

    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }

    Write-Success "Directories created"
}

# Install binary
function Install-Binary {
    Write-Info "Installing Mimir Code..."

    try {
        $platform = Get-Platform
        Write-Info "Detected platform: $platform"

        # Determine release tag
        $releaseTag = $null
        if ($Version -match '^v\d+\.\d+\.\d+') {
            $releaseTag = $Version
        }
        elseif ($Version -match '^\d+\.\d+\.\d+') {
            $releaseTag = "v$Version"
        }
        else {
            # For 'latest' or other non-version strings, fetch latest release
            Write-Info "Fetching latest release tag..."
            try {
                $latestUrl = "https://api.github.com/repos/${GithubRepo}/releases/latest"
                $response = Invoke-RestMethod -Uri $latestUrl -ErrorAction Stop
                $releaseTag = $response.tag_name
            }
            catch {
                Write-ErrorMsg "Failed to fetch latest release tag"
                Write-Host ""
                Write-Host "Please try installing via npm instead:" -ForegroundColor Yellow
                Write-Host "  npm install -g @codedir/mimir-code" -ForegroundColor White
                Write-Host ""
                Write-Host "If this issue persists, please report it:" -ForegroundColor Yellow
                Write-Host "  https://github.com/${GithubRepo}/issues" -ForegroundColor White
                exit 1
            }
        }

        Write-Info "Downloading from GitHub release ${releaseTag}..."

        # Download ZIP archive
        $archiveName = "mimir-code-${releaseTag}-${platform}.zip"
        $downloadUrl = "https://github.com/${GithubRepo}/releases/download/${releaseTag}/${archiveName}"
        $binPath = "$env:USERPROFILE\.local\bin"
        $tmpDir = Join-Path $env:TEMP "mimir-install-$(Get-Random)"
        $tmpArchive = Join-Path $tmpDir $archiveName

        # Create directories
        if (-not (Test-Path $binPath)) {
            New-Item -ItemType Directory -Path $binPath -Force | Out-Null
        }
        if (-not (Test-Path $tmpDir)) {
            New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
        }

        # Download archive
        try {
            Invoke-WebRequest -Uri $downloadUrl -OutFile $tmpArchive -ErrorAction Stop
        }
        catch {
            Write-ErrorMsg "Failed to download release archive"
            Write-Host "URL: $downloadUrl" -ForegroundColor Red
            Write-Host ""
            Write-Host "Please try installing via npm instead:" -ForegroundColor Yellow
            Write-Host "  npm install -g @codedir/mimir-code" -ForegroundColor White
            Write-Host ""
            Write-Host "If this issue persists, please report it:" -ForegroundColor Yellow
            Write-Host "  https://github.com/${GithubRepo}/issues" -ForegroundColor White
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
            exit 1
        }

        # Extract archive
        Write-Info "Extracting archive..."
        try {
            Expand-Archive -Path $tmpArchive -DestinationPath $tmpDir -Force -ErrorAction Stop
        }
        catch {
            Write-ErrorMsg "Failed to extract archive"
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
            exit 1
        }

        # Find extracted directory
        $extractedDir = Join-Path $tmpDir "mimir-code-${releaseTag}-${platform}"
        if (-not (Test-Path $extractedDir)) {
            Write-ErrorMsg "Extracted directory not found"
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
            exit 1
        }

        # Install binary
        $sourceBinary = Join-Path $extractedDir "mimir.exe"
        if (Test-Path $sourceBinary) {
            Copy-Item $sourceBinary -Destination (Join-Path $binPath "mimir.exe") -Force
            Write-Success "Binary installed"
        }
        else {
            Write-ErrorMsg "Binary not found in archive"
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
            exit 1
        }

        # Install resources
        $sourceResources = Join-Path $extractedDir "resources"
        if (Test-Path $sourceResources) {
            $destResources = Join-Path $binPath "resources"
            if (Test-Path $destResources) {
                Remove-Item -Recurse -Force $destResources
            }
            Copy-Item -Recurse $sourceResources -Destination $binPath -Force
            Write-Success "Resources installed"
        }
        else {
            Write-ErrorMsg "Resources directory not found in archive"
            Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue
            exit 1
        }

        # Clean up
        Remove-Item -Recurse -Force $tmpDir -ErrorAction SilentlyContinue

        Write-Success "Mimir Code installed from GitHub release"
    }
    catch {
        $errorMessage = $_.Exception.Message
        Write-ErrorMsg "Installation failed: $errorMessage"
        exit 1
    }
}

# Setup configuration
function Set-Configuration {
    Write-Info "Setting up configuration..."

    $configFile = Join-Path $InstallDir "config.yml"

    if (-not (Test-Path $configFile)) {
        $configContent = @"
# Mimir Code Configuration
# See https://github.com/$GithubRepo for documentation

llm:
  provider: deepseek
  model: deepseek-chat
  temperature: 0.7
  maxTokens: 4096

permissions:
  autoAccept: false
  acceptRiskLevel: medium
  alwaysAcceptCommands: []

keyBindings:
  interrupt: Ctrl+C
  modeSwitch: Shift+Tab
  editCommand: Ctrl+E

docker:
  enabled: true
  baseImage: alpine:latest

ui:
  theme: mimir
  syntaxHighlighting: true
  showLineNumbers: true
  compactMode: false
"@
        $configContent | Out-File -FilePath $configFile -Encoding UTF8
        Write-Success "Default configuration created at $configFile"
    }
    else {
        Write-Info "Configuration already exists"
    }
}

# Update PATH environment variable
function Update-Path {
    Write-Info "Checking PATH configuration..."

    $localBin = "$env:USERPROFILE\.local\bin"

    # Check if .local\bin is in User PATH
    $userPath = [System.Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -notlike "*$localBin*") {
        Write-Info "Adding $localBin to User PATH..."

        try {
            # Add to user PATH permanently
            $newPath = if ($userPath) { "$userPath;$localBin" } else { $localBin }
            [System.Environment]::SetEnvironmentVariable("PATH", $newPath, "User")

            # Update current session PATH
            $env:PATH = "$localBin;$env:PATH"

            Write-Success "Added $localBin to PATH"
            Write-Warning "You may need to restart your terminal for PATH changes to take full effect"
        }
        catch {
            Write-Warning "Could not update PATH automatically"
            Write-Info "Please add $localBin to your PATH manually"
        }
    }
    else {
        # Update current session PATH just to be safe
        $env:PATH = "$localBin;$env:PATH"
        Write-Success "Mimir Code binary directory is in PATH"
    }

    # Verify mimir is accessible
    $mimirCmd = Get-Command mimir -ErrorAction SilentlyContinue
    if (-not $mimirCmd) {
        Write-Warning "Mimir Code command not found in current session"
        Write-Info "Please restart your terminal to update PATH"
    }
    else {
        Write-Success "Mimir Code is accessible: $($mimirCmd.Source)"
    }
}

# Check Docker installation
function Test-Docker {
    Write-Info "Checking Docker installation..."

    try {
        $dockerVersion = docker --version
        Write-Success "Docker detected: $dockerVersion"
    }
    catch {
        Write-Warning "Docker is not installed or not in PATH"
        Write-Info "Docker is optional but recommended for sandboxed code execution"
        Write-Info "Install Docker Desktop from https://www.docker.com/products/docker-desktop"
    }
}

# Verify installation (for CI/testing)
function Test-Installation {
    Write-Info "Verifying installation..."

    # Add .local\bin to PATH for current session
    $localBin = "$env:USERPROFILE\.local\bin"
    if (Test-Path $localBin) {
        $env:PATH = "$localBin;$env:PATH"
    }

    # Update PATH for current session to include npm/yarn global bin
    $npmBinPath = $null
    $yarnBinPath = $null

    try {
        $npmBinPath = (npm bin -g 2>$null)
        if ($npmBinPath) {
            $env:PATH = "$npmBinPath;$env:PATH"
        }
    } catch {}

    try {
        $yarnBinPath = (yarn global bin 2>$null)
        if ($yarnBinPath) {
            $env:PATH = "$yarnBinPath;$env:PATH"
        }
    } catch {}

    # Refresh environment variables
    $env:PATH = [System.Environment]::GetEnvironmentVariable("PATH", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("PATH", "User")

    # Check if mimir is in PATH
    $mimirCmd = Get-Command mimir -ErrorAction SilentlyContinue
    if (-not $mimirCmd) {
        Write-ErrorMsg "mimir not found in PATH"
        Write-Info "PATH: $env:PATH"
        Write-Info "Checking binary directly..."
        $directBinary = "$env:USERPROFILE\.local\bin\mimir.exe"
        if (Test-Path $directBinary) {
            Write-Info "Binary exists at: $directBinary"
            Write-Info "Adding to PATH for this session..."
            $env:PATH = "$env:USERPROFILE\.local\bin;$env:PATH"
            $mimirCmd = Get-Command mimir -ErrorAction SilentlyContinue
        }
        if (-not $mimirCmd) {
            return $false
        }
    }
    Write-Success "mimir found in PATH: $($mimirCmd.Source)"

    # Check if mimir runs
    try {
        $installedVersion = & mimir --version 2>&1
        Write-Success "mimir version: $installedVersion"
    }
    catch {
        Write-ErrorMsg "mimir --version failed: $_"
        # Show the actual error
        try {
            & mimir --version 2>&1
        } catch {
            Write-Host $_.Exception.Message
        }
        return $false
    }

    # Test mimir init in a temporary directory
    $testDir = Join-Path $env:TEMP "mimir-test-$(Get-Random)"
    New-Item -ItemType Directory -Path $testDir -Force | Out-Null
    Write-Info "Testing mimir init in: $testDir"

    try {
        Push-Location $testDir

        # Run init command (with timeout and quiet flag)
        $initJob = Start-Job -ScriptBlock {
            $output = & mimir init --no-interactive --quiet 2>&1
            return @{
                Output = $output
                ExitCode = $LASTEXITCODE
            }
        }
        $initJob | Wait-Job -Timeout 30 | Out-Null

        if ($initJob.State -ne 'Completed') {
            Stop-Job $initJob
            Write-ErrorMsg "mimir init timed out"
            Remove-Job $initJob -Force
            return $false
        }

        $initResult = Receive-Job $initJob
        $initOutput = $initResult.Output
        $exitCode = $initResult.ExitCode

        Remove-Job $initJob -Force

        if ($initJob.State -eq 'Failed' -or $null -eq $exitCode -or $exitCode -ne 0) {
            Write-ErrorMsg "mimir init failed with exit code $exitCode"
            if ($initOutput) {
                Write-Host ""
                Write-Host $initOutput
            }
            return $false
        }

        # Verify .mimir directory was created
        if (-not (Test-Path ".mimir") -or -not (Test-Path ".mimir\config.yml")) {
            Write-ErrorMsg ".mimir directory or config.yml not created"
            Write-Info "Contents of test directory:"
            Get-ChildItem -Force
            return $false
        }

        Write-Success "mimir init works correctly"
    }
    catch {
        Write-ErrorMsg "Verification failed: $_"
        return $false
    }
    finally {
        Pop-Location
        Remove-Item -Recurse -Force $testDir -ErrorAction SilentlyContinue
    }

    # Test mimir doctor
    try {
        $doctorJob = Start-Job -ScriptBlock { & mimir doctor 2>&1 }
        $doctorJob | Wait-Job -Timeout 30 | Out-Null

        if ($doctorJob.State -eq 'Completed') {
            Write-Success "mimir doctor passed"
        }
        else {
            Stop-Job $doctorJob
            Write-Warning "mimir doctor reported issues (non-fatal)"
        }
    }
    catch {
        Write-Warning "mimir doctor reported issues (non-fatal)"
    }

    Write-Host ""
    Write-Success "All verification tests passed!"
    return $true
}

# Check for existing installation and backup if upgrading
function Test-ExistingInstallation {
    $mimirPath = "$env:USERPROFILE\.local\bin\mimir.exe"
    if (Test-Path $mimirPath) {
        try {
            $currentVersion = & $mimirPath --version 2>$null
            Write-Info "Found existing installation: $currentVersion"

            # Backup old binary
            if ($currentVersion) {
                $backupPath = "$env:USERPROFILE\.local\bin\mimir.backup-$currentVersion.exe"
                Copy-Item $mimirPath $backupPath -Force
                Write-Info "Backed up to $backupPath"
            }
            return $true
        }
        catch {
            return $true  # File exists but couldn't get version
        }
    }
    return $false
}

# Main installation
function Main {
    # Determine version before header
    $installVersion = $null
    $isUpgrade = Test-ExistingInstallation

    # Get version for header
    $releaseTag = $null
    if ($Version -match '^v\d+\.\d+\.\d+') {
        $releaseTag = $Version
        $installVersion = $Version.Substring(1)  # Remove 'v'
    }
    elseif ($Version -match '^\d+\.\d+\.\d+') {
        $releaseTag = "v$Version"
        $installVersion = $Version
    }
    else {
        # Fetch latest
        try {
            $latestUrl = "https://api.github.com/repos/${GithubRepo}/releases/latest"
            $response = Invoke-RestMethod -Uri $latestUrl -ErrorAction Stop
            $releaseTag = $response.tag_name
            $installVersion = $releaseTag.Substring(1)  # Remove 'v'
        }
        catch {
            $installVersion = "latest"
        }
    }

    Write-Host ""
    Write-Host "╔═══════════════════════════════════════╗" -ForegroundColor Cyan
    if ($isUpgrade) {
        Write-Host "║    Mimir Code Installer v$installVersion        ║" -ForegroundColor Cyan
        Write-Host "║   Upgrading Platform-agnostic CLI     ║" -ForegroundColor Cyan
    }
    else {
        Write-Host "║    Mimir Code Installer v$installVersion        ║" -ForegroundColor Cyan
        Write-Host "║   Platform-agnostic AI Coding CLI     ║" -ForegroundColor Cyan
    }
    Write-Host "╚═══════════════════════════════════════╝" -ForegroundColor Cyan
    Write-Host ""

    # Check if running as admin
    if (Test-Administrator) {
        Write-Warning "Running as Administrator. This is not required for installation."
    }

    Test-Dependencies
    New-Directories
    Install-Binary
    Set-Configuration
    Update-Path
    Test-Docker

    Write-Host ""
    Write-Success "Installation complete!"

    # Run verification if in test mode
    if ($TestMode) {
        Write-Host ""
        Write-Info "Running verification tests..."
        if (-not (Test-Installation)) {
            throw "Installation verification failed"
        }
    }
    else {
        Write-Host ""
        Write-Info "Start building with AI:"
        Write-Info "  mimir"
        Write-Host ""
        Write-Info "Set your API key: $InstallDir\config.yml"
        Write-Info "Documentation: https://github.com/$GithubRepo"
        Write-Host ""

        # Prompt to open config
        $openConfig = Read-Host "Would you like to open the configuration file now? (y/n)"
        if ($openConfig -eq 'y') {
            notepad "$InstallDir\config.yml"
        }
    }
}

# Run installation
try {
    Main
}
catch {
    $errorMessage = $_.Exception.Message
    Write-ErrorMsg "Installation failed: $errorMessage"
    exit 1
}
