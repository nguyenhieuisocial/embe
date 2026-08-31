$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$directFiles = @(
    "scripts/install-inventory-worker.ps1",
    "scripts/install-assistant-worker.ps1",
    "scripts/install-telegram-secondary-task.ps1",
    "scripts/health/install-uptime-monitor-probe.ps1",
    "scripts/health/install-tailscale-private-probe.ps1"
)
foreach ($relative in $directFiles) {
    $source = Get-Content -LiteralPath (Join-Path $projectRoot $relative) -Raw
    if ($source -notmatch 'pythonw\.exe' -or $source -match '-Execute\s+"powershell\.exe"') {
        throw "Frequent scheduled action must run directly without PowerShell: $relative"
    }
}
$rareFiles = @(
    "scripts/install-local-runtime-startup.ps1",
    "scripts/install-monthly-report-current-user.ps1",
    "scripts/install-disk-maintenance-task.ps1"
)
foreach ($relative in $rareFiles) {
    $source = Get-Content -LiteralPath (Join-Path $projectRoot $relative) -Raw
    if ($source -notmatch '-WindowStyle\s+Hidden') { throw "Rare scheduled PowerShell action is not hidden: $relative" }
}
Write-Output "Frequent tasks run directly without PowerShell; rare maintenance tasks stay hidden"
