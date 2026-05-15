# ============================================================
# setup_new_installation.ps1
# School Management System - One-Click Installer
# ============================================================

$ErrorActionPreference = "Stop"

function Write-Header($text) {
    Write-Host "`n============================================================" -ForegroundColor Cyan
    Write-Host " $text" -ForegroundColor White
    Write-Host "============================================================`n" -ForegroundColor Cyan
}

try {
    Write-Header "🏫 Schulmanagement - System Setup"
    Write-Host "This script will download and prepare the platform for first use." -ForegroundColor Gray
    Write-Host ""

    # 1. Check for Git
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Host ">> Git not found. Attempting to install via Winget..." -ForegroundColor Yellow
        winget install --id Git.Git -e --source winget
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[FAIL] Could not install Git automatically." -ForegroundColor Red
            Write-Host "Please install it manually from https://git-scm.com/" -ForegroundColor Yellow
            Pause; exit 1
        }
        Write-Host " [OK] Git installed. Please restart this script." -ForegroundColor Green
        Pause; exit 0
    }

    # 2. Define Target Directory
    $currentDir = Get-Location
    
    # Check if we are already in an antigravity folder or if we should create one
    if ($currentDir.Path -match "antigravity" -and -not (Test-Path (Join-Path $currentDir "scripts"))) {
        # We are in a folder named antigravity already
        $targetDir = $currentDir.Path
    } elseif ($currentDir.Path -notmatch "C:\\Windows" -and $currentDir.Path -ne $HOME) {
        # We are in a generic folder, create a subfolder
        $targetDir = Join-Path $currentDir.Path "antigravity"
        if (-not (Test-Path $targetDir)) { New-Item -Path $targetDir -ItemType Directory -Force | Out-Null }
        Write-Host " [INFO] Creating system folder: $targetDir" -ForegroundColor Cyan
    } else {
        # Default to Desktop
        $targetDir = Join-Path $HOME "Desktop\Antigravity"
        if (-not (Test-Path $targetDir)) { New-Item -Path $targetDir -ItemType Directory -Force | Out-Null }
        Write-Host " [INFO] Using default location: $targetDir" -ForegroundColor Cyan
    }

    if (Test-Path (Join-Path $targetDir ".git")) {
        Write-Host " [OK] Repository already exists. Checking for updates..." -ForegroundColor Green
        Set-Location $targetDir
        git pull origin main
    } else {
        Write-Host ">> Cloning repository into $targetDir..." -ForegroundColor White
        git clone https://github.com/damessner/antigravity.git $targetDir
        if ($LASTEXITCODE -ne 0) { throw "Clone failed." }
        Write-Host " [OK] Files downloaded." -ForegroundColor Green
    }



    # 3. Enter directory and verify
    Set-Location $targetDir
    
    Write-Header "Setup Complete!"
    Write-Host "The system is now located on your Desktop in the 'Antigravity' folder." -ForegroundColor Green
    Write-Host "I will now launch the Requirement Checker (01_initiate_system.bat)." -ForegroundColor White
    Write-Host ""
    
    Start-Process "01_initiate_system.bat"
    
} catch {
    Write-Host "`n [ERROR] Setup failed: $_" -ForegroundColor Red
    Pause
}
