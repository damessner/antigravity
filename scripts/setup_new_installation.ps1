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
    $targetDir = Join-Path $HOME "Desktop\Antigravity"
    if (Test-Path $targetDir) {
        Write-Host " [INFO] Target folder already exists: $targetDir" -ForegroundColor Cyan
    } else {
        Write-Host ">> Cloning repository to Desktop..." -ForegroundColor White
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
