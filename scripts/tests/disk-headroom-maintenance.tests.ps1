param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\maintain-disk-headroom.ps1"
$installer = Join-Path $projectRoot "scripts\install-disk-maintenance-task.ps1"

if (-not (Test-Path -LiteralPath $runner -PathType Leaf)) { throw "Disk maintenance runner is missing" }
if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) { throw "Disk maintenance installer is missing" }

$runnerSource = Get-Content -LiteralPath $runner -Raw
$installerSource = Get-Content -LiteralPath $installer -Raw
foreach ($forbidden in @("docker system prune", "docker image prune", "docker volume prune")) {
    if ($runnerSource.Contains($forbidden)) { throw "Disk maintenance contains destructive behavior: $forbidden" }
}
foreach ($required in @("docker builder prune", "until=168h", "fstrim", "npm cache clean --force", "pip cache purge", "TargetFreeGiB", "MinimumFreeGiB", "disk-maintenance.json", "stale_wsl_swaps_removed")) {
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
        -ProjectRoot $projectRoot -StatusPath $healthyStatus -FreeGiBOverride 80 -SkipActions
    if ($LASTEXITCODE -ne 0) { throw "Healthy fixture must pass" }
    $healthy = Get-Content -LiteralPath $healthyStatus -Raw | ConvertFrom-Json
    if ($healthy.status -ne "pass" -or $healthy.maintenance_attempted) { throw "Healthy fixture status is invalid" }

    $lowStatus = Join-Path $testRoot "low.json"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $projectRoot -StatusPath $lowStatus -FreeGiBOverride 14 -SkipActions
    if ($LASTEXITCODE -ne 2) { throw "Low disk fixture must signal warning" }
    $low = Get-Content -LiteralPath $lowStatus -Raw | ConvertFrom-Json
    if ($low.status -ne "warning" -or $low.free_gib_after -ne 14) { throw "Low disk fixture status is invalid" }
    if ((Get-Content -LiteralPath $lowStatus -Raw).Contains($testRoot)) { throw "Status exposed a local path" }

    $fakeTemp = Join-Path $testRoot "temp"
    $swapDirectory = Join-Path $fakeTemp "11111111-1111-4111-8111-111111111111"
    New-Item -ItemType Directory -Path $swapDirectory | Out-Null
    $swap = Join-Path $swapDirectory "swap.vhdx"
    [IO.File]::WriteAllBytes($swap, [byte[]]::new(1024))
    (Get-Item $swap).LastWriteTimeUtc = [DateTime]::UtcNow.AddHours(-6)
    $swapStatus = Join-Path $testRoot "swap.json"
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $projectRoot -StatusPath $swapStatus -FreeGiBOverride 14 `
        -TempPath $fakeTemp -SkipSystemActions
    if ($LASTEXITCODE -ne 2) { throw "Low disk swap fixture must preserve the warning exit" }
    if (Test-Path -LiteralPath $swapDirectory) { throw "An old unlocked WSL swap was not removed" }
    $swapReport = Get-Content -LiteralPath $swapStatus -Raw | ConvertFrom-Json
    if ($swapReport.stale_wsl_swaps_removed -ne 1) { throw "Stale WSL swap cleanup evidence is missing" }

    Write-Output "PASS: disk headroom maintenance is bounded and non-destructive"
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}

# The warning fixture intentionally returns 2. Do not leak that expected child
# exit code as the result of the test process after all assertions passed.
exit 0
