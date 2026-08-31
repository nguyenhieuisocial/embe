param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\maintain-disk-headroom.ps1"
$installer = Join-Path $projectRoot "scripts\install-disk-maintenance-task.ps1"

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Disk maintenance runner is missing" }
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Disk maintenance installer is missing" }

$runnerSource = Get-Content -LiteralPath $runner -Raw
$installerSource = Get-Content -LiteralPath $installer -Raw
foreach ($forbidden in @("docker system prune", "docker image prune", "docker volume prune", "Remove-Item")) {
    if ($runnerSource.Contains($forbidden)) { throw "Disk maintenance contains destructive behavior: $forbidden" }
}
foreach ($required in @("docker builder prune", "until=168h", "fstrim", "TargetFreePercent", "MinimumFreePercent", "disk-maintenance.json")) {
    if (-not $runnerSource.Contains($required)) { throw "Disk maintenance is missing: $required" }
}
foreach ($required in @("New-ScheduledTaskTrigger -Daily", "StartWhenAvailable", "LogonType Interactive", "RunLevel Limited", "VerifyNow")) {
    if (-not $installerSource.Contains($required)) { throw "Disk maintenance task is missing: $required" }
}

$testRoot = Join-Path $env:TEMP ("embe-disk-maintenance-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testRoot | Out-Null
try {
    $healthyStatus = Join-Path $testRoot "healthy.json"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $projectRoot -StatusPath $healthyStatus -FreePercentOverride 30 -SkipActions
    if ($LASTEXITCODE -ne 0) { throw "Healthy fixture must pass" }
    $healthy = Get-Content -LiteralPath $healthyStatus -Raw | ConvertFrom-Json
    if ($healthy.status -ne "pass" -or $healthy.maintenance_attempted) { throw "Healthy fixture status is invalid" }

    $lowStatus = Join-Path $testRoot "low.json"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $projectRoot -StatusPath $lowStatus -FreePercentOverride 24 -SkipActions
    if ($LASTEXITCODE -ne 2) { throw "Low disk fixture must signal warning" }
    $low = Get-Content -LiteralPath $lowStatus -Raw | ConvertFrom-Json
    if ($low.status -ne "warning" -or $low.free_percent_after -ne 24) { throw "Low disk fixture status is invalid" }
    if ((Get-Content -LiteralPath $lowStatus -Raw).Contains($testRoot)) { throw "Status exposed a local path" }

    Write-Output "PASS: disk headroom maintenance is bounded and non-destructive"
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
