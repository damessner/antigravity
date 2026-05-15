# ============================================================
# health_monitor.ps1
# 🏫 Schulmanagement Control Center
# "Watching over the digital classroom pulse."
# ============================================================

$ErrorActionPreference = "Continue"

# Resolve script directory and project root
$ScriptDir = $PSScriptRoot
if (-not $ScriptDir -and $PSCommandPath) { $ScriptDir = Split-Path -Parent $PSCommandPath }
if (-not $ScriptDir) { $ScriptDir = Get-Location }
$ProjectRoot = Split-Path -Parent $ScriptDir

try {
    if ($ProjectRoot) { Set-Location -LiteralPath $ProjectRoot }

    function Write-Banner($title) {
        Write-Host "`n  ############################################################" -ForegroundColor Cyan
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  #   $($title.PadRight(50))     #" -ForegroundColor White
        Write-Host "  #                                                          #" -ForegroundColor Cyan
        Write-Host "  ############################################################`n" -ForegroundColor Cyan
    }

    Clear-Host
    Write-Banner "SYSTEM HEALTH CONTROL"
    Write-Host "  Real-time visibility into the platform's vital signs.`n" -ForegroundColor Gray

    # Check if anything is running
    $running = docker ps --format "{{.Names}}" 2>&1 | Where-Object { $_ -match "school_|antigravity_" }
    if (-not $running) {
        Write-Host "  [!] System containers are currently offline." -ForegroundColor Yellow
        Write-Host "      Please start the platform using '02_launch_system.bat' first." -ForegroundColor Gray
        Write-Host ""
        Pause
        exit 0
    }

    # Show static status first
    Write-Host "  >> Resource Allocation (Active Consumption):" -ForegroundColor White
    Write-Host "  ------------------------------------------------------------" -ForegroundColor DarkGray
    docker stats --no-stream --format "  {{.Name}}\tCPU: {{.CPUPerc}}\tMEM: {{.MemUsage}}\tNET: {{.NetIO}}" 2>&1 | ForEach-Object { Write-Host "  $_" -ForegroundColor Cyan }
    
    Write-Host "`n  >> Live Classroom Dispatch Activity (Press Ctrl+C to exit):" -ForegroundColor White
    Write-Host "  ------------------------------------------------------------" -ForegroundColor DarkGray
    
    # Hand over to docker compose logs with specific colors for backend/frontend
    # We use a simple tail but let docker handle the streaming
    docker compose logs -f --tail=30

} catch {
    Write-Host "`n  [ERROR] Monitor failed: $_" -ForegroundColor Red
} finally {
    Write-Host "`n  Monitoring session ended." -ForegroundColor Gray
}
