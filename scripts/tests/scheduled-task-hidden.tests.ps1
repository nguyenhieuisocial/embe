$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$directFiles = @(
    "scripts/install-babybuddy-memos-sync-current-user.ps1",
    "scripts/install-inventory-worker.ps1",
    "scripts/install-procurement-worker.ps1",
    "scripts/install-assistant-worker.ps1",
    "scripts/install-telegram-secondary-task.ps1",
    "services/analytics-ingest/install-scheduled.ps1",
    "scripts/health/install-uptime-monitor-probe.ps1",
    "scripts/health/install-tailscale-private-probe.ps1"
    "scripts/health/install-shell-leak-guard.ps1"
)
foreach ($relative in $directFiles) {
    $source = Get-Content -LiteralPath (Join-Path $projectRoot $relative) -Raw
    if ($source -notmatch 'pythonw\.exe' -or $source -match '-Execute\s+"powershell\.exe"') {
        throw "Frequent scheduled action must run directly without PowerShell: $relative"
    }
}
$telegramInstaller = Get-Content -LiteralPath (Join-Path $projectRoot "scripts/install-telegram-secondary-task.ps1") -Raw
foreach ($contract in @("sys._base_executable", "MultipleInstances IgnoreNew")) {
    if (-not $telegramInstaller.Contains($contract)) { throw "Telegram task must use the tracked base interpreter and prevent overlap: $contract" }
}
$telegramRunner = Get-Content -LiteralPath (Join-Path $projectRoot "services/storage-poc/scripts/run_secondary_once.py") -Raw
foreach ($contract in @("acquire_run_lock", "sys._base_executable", "site-packages")) {
    if (-not $telegramRunner.Contains($contract)) { throw "Telegram runner overlap protection is missing: $contract" }
}
$mixedFiles = @("scripts/install-portal-sync.ps1")
foreach ($relative in $mixedFiles) {
    $source = Get-Content -LiteralPath (Join-Path $projectRoot $relative) -Raw
    if ($source -notmatch 'pythonw\.exe' -or $source -notmatch '-WindowStyle\s+Hidden') {
        throw "Mixed-frequency installer must use windowless Python and hide rare PowerShell: $relative"
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
