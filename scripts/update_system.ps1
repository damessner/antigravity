# ============================================================
# update_system.ps1
# School Management System - GitHub Synchronizer
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

try {
    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    function Write-Header($text) {
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host " $text" -ForegroundColor White
        Write-Host "============================================================" -ForegroundColor Cyan
        Write-Host ""
    }

    Clear-Host
    Write-Header "🔄 System Update Utility"

    # 1. Check for Git
    $gitCmd = Get-Command git -ErrorAction SilentlyContinue
    if (-not $gitCmd) {
        Write-Host " [FAIL] Git is not installed. Manual update required." -ForegroundColor Red
        Write-Host " Please download the latest version from: " -ForegroundColor White
        Write-Host " https://github.com/damessner/antigravity/archive/refs/heads/main.zip" -ForegroundColor Cyan
        exit 1
    }

    # 2. Check if this is a Git repository
    if (-not (Test-Path ".git")) {
        Write-Host " [INFO] This folder was not downloaded via Git." -ForegroundColor Yellow
        Write-Host " To enable one-click updates, you should clone the repository using:" -ForegroundColor Gray
        Write-Host " git clone https://github.com/damessner/antigravity.git" -ForegroundColor Cyan
        exit 1
    }

    # 3. Check for local changes
    $status = git status --porcelain
    if ($status) {
        Write-Host " [WARN] You have local changes in the folder." -ForegroundColor Yellow
        Write-Host " Updating might overwrite your changes or cause conflicts." -ForegroundColor Gray
        $confirm = Read-Host " Proceed with update anyway? (y/N)"
        if ($confirm -notmatch "^[Yy]$") {
            Write-Host " Update cancelled." -ForegroundColor Yellow
            exit 0
        }
    }

    # 4. Fetch and Pull
    Write-Host ">> Checking for updates on GitHub..." -ForegroundColor White
    git fetch origin main 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    
    $local = git rev-parse 'HEAD'
    $remote = git rev-parse 'origin/main'
    $base = git merge-base 'HEAD' 'origin/main'

    if ($local -eq $remote) {
        Write-Host "`n [OK] System is already up to date." -ForegroundColor Green
    } elseif ($local -eq $base) {
        Write-Host "`n [UPDATE FOUND] New version available!" -ForegroundColor Green
        $doPull = Read-Host " Download and install update now? (y/N)"
        if ($doPull -match "^[Yy]$") {
            Write-Host ">> Pulling changes..." -ForegroundColor White
            git pull origin main 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
            
            Write-Host "`n>> Rebuilding Docker containers to apply updates..." -ForegroundColor White
            docker compose build 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
            
            Write-Host "`n [SUCCESS] Update complete! Run '02_launch_system.bat' to start." -ForegroundColor Green
        }
    } elseif ($remote -eq $base) {
        Write-Host "`n [INFO] You are ahead of the official version (Local Commits)." -ForegroundColor Cyan
    } else {
        Write-Host "`n [WARN] Version mismatch (Diverged). Manual resolution needed." -ForegroundColor Red
    }

} catch {
    Write-Host "`n [ERROR] Update failed: $_" -ForegroundColor Red
} finally {
    Write-Host "`nPress any key to exit..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
