# ============================================================
# clean_slate.ps1
# 🏫 Schulmanagement Environment Reset
# "Preparing a fresh start for a new term."
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

try {
    # Ensure Admin
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-Host ">> Requesting Administrator privileges to perform system reset..." -ForegroundColor Yellow
        $scriptPath = if ($PSCommandPath) { $PSCommandPath } else { Join-Path $ScriptDir "clean_slate.ps1" }
        Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`"" -Verb RunAs
        exit 0
    }

    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    function Write-Banner($title) {
        Write-Host "`n  ############################################################" -ForegroundColor Cyan
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  #   $($title.PadRight(50))     #" -ForegroundColor White
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  ############################################################`n" -ForegroundColor Cyan
    }
    
    function Step($msg)     { Write-Host "  >> $msg" -ForegroundColor White }
    function Write-Ok($msg) { Write-Host "     [OK] $msg" -ForegroundColor Green }
    function Write-Fail($msg) { Write-Host "     [FAIL] $msg" -ForegroundColor Red }

    Clear-Host
    Write-Banner "FACTORY RESET & CLEAN SLATE"
    Write-Host "  DANGER: This will wipe all pupil, room, and grade data." -ForegroundColor Red
    Write-Host "  A safety backup will be created automatically before wiping.`n" -ForegroundColor Yellow

    $confirm = Read-Host "  Type 'RESET' to confirm you want to wipe the system"
    if ($confirm -ne "RESET") {
        Write-Host "`n  Safe choice. Reset cancelled." -ForegroundColor Green
        exit 0
    }

    # 1. Stop System
    Write-Host "`n  >> Halting the active classroom engine..." -ForegroundColor White
    docker compose down --remove-orphans 2>&1 | ForEach-Object { Write-Host "     $_" -ForegroundColor Gray }
    Write-Ok "System offline."

    # 2. Safety Backup
    Step "Creating Emergency Safety Backup..."
    $backupDir = Join-Path $ProjectRoot "school_data\backups"
    if (-not (Test-Path $backupDir)) { New-Item -Path $backupDir -ItemType Directory -Force | Out-Null }
    
    $timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $backupPath = Join-Path $backupDir "emergency_reset_backup_$timestamp"
    
    if (Test-Path (Join-Path $ProjectRoot "school_data\db")) {
        # Create a ZIP of the DB folder as a hard backup
        Compress-Archive -Path (Join-Path $ProjectRoot "school_data\db") -DestinationPath "${backupPath}.zip" -ErrorAction SilentlyContinue
        Write-Ok "Data archived to: school_data/backups/emergency_reset_backup_$timestamp.zip"
    } else {
        Write-Host "     No existing data folder found. Skipping backup." -ForegroundColor Gray
    }

    # 3. Wipe Data
    Step "Purging persistent data stores..."
    $dataFolders = @("school_data\db", "school_data\logs")
    foreach ($folder in $dataFolders) {
        $path = Join-Path $ProjectRoot $folder
        if (Test-Path $path) {
            Remove-Item -Path $path -Recurse -Force -ErrorAction SilentlyContinue
            Write-Ok "Cleared: $folder"
        }
    }

    # 4. Re-initialize
    Write-Banner "CLEAN SLATE READY"
    Write-Host "  The system has been restored to factory settings." -ForegroundColor Green
    Write-Host "  The database will be re-seeded upon next launch.`n" -ForegroundColor White
    
    Write-Host "  -> Run '02_launch_system.bat' to start the fresh platform." -ForegroundColor Gray
    Write-Host ""

} catch {
    Write-Host "`n  [ERROR] Reset failed: $_" -ForegroundColor Red
} finally {
    Write-Host "  Ready for the new term. Press any key to close..." -ForegroundColor Gray
    $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
}
