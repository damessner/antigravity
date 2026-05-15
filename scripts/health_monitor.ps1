# ============================================================
# health_monitor.ps1
# School Management System - Real-Time Dashboard
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
    }

    Clear-Host
    Write-Header "🏫 System Health Monitor"
    Write-Host "This window will show live logs and system status." -ForegroundColor Gray
    Write-Host "Press Ctrl+C to stop monitoring." -ForegroundColor Gray
    Write-Host ""

    # Check if anything is running
    $running = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_|antigravity_" }
    if (-not $running) {
        Write-Host "   [WARN] No system containers are currently running." -ForegroundColor Yellow
        Write-Host "   Run '02_launch_system.bat' to start the system." -ForegroundColor Gray
        Write-Host ""
        Pause
        exit 0
    }

    # Show static status first
    Write-Host ">> Current Resource Usage:" -ForegroundColor White
    docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}" 2>&1 | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
    
    Write-Host "`n>> Streaming live logs (Last 20 lines + new events):" -ForegroundColor White
    Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
    
    # Hand over to docker compose logs
    docker compose logs -f --tail=20

} catch {
    Write-Host "`n[ERROR] Monitor failed: $_" -ForegroundColor Red
} finally {
    Write-Host "`nMonitoring ended." -ForegroundColor Gray
}
