param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
foreach ($envFile in @(
    (Join-Path $ProjectRoot "infra\compose\storage-poc.env"),
    (Join-Path $ProjectRoot "secrets\telegram-poc.env"),
    (Join-Path $ProjectRoot "secrets\runtime\media-publisher.env")
)) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
        if ($line -match '^([^#=]+)=(.*)$') {
            [Environment]::SetEnvironmentVariable($matches[1], $matches[2], "Process")
        }
    }
}

$env:EMBE_STORAGE_POC_ENABLED = "true"
$env:EMBE_TELEGRAM_POC_ENABLED = "true"
$env:EMBE_TELEGRAM_REPLICATION_ENABLED = "true"
$env:EMBE_STORAGE_POC_DATA_DIR = Join-Path $ProjectRoot "data\storage-poc"
$env:PYTHONPATH = (Join-Path $ProjectRoot "services\storage-poc\src") + [IO.Path]::PathSeparator + (Join-Path $ProjectRoot "services\media-publisher")

$statusPath = Join-Path $ProjectRoot "data\status\telegram-secondary.json"
$python = Join-Path $ProjectRoot ".venv\Scripts\python.exe"
$archiveOutput = & $python (Join-Path $ProjectRoot "services\storage-poc\scripts\queue_immich_curated.py")
$archiveExitCode = $LASTEXITCODE
$archive = if ($archiveOutput) { $archiveOutput | ConvertFrom-Json } else { $null }

$output = if ($archiveExitCode -eq 0) { & $python `
    (Join-Path $ProjectRoot "services\storage-poc\scripts\run_worker_once.py")
} else { $null }
$workerExitCode = if ($archiveExitCode -eq 0) { $LASTEXITCODE } else { 1 }

$smokePath = Join-Path $ProjectRoot "data\status\telegram-live-smoke.json"
$smoke = if (Test-Path -LiteralPath $smokePath -PathType Leaf) {
    try { Get-Content -LiteralPath $smokePath -Raw | ConvertFrom-Json } catch { $null }
} else { $null }
$runSmoke = $null -eq $smoke -or [string]$smoke.status -ne "pass"
if ($null -ne $smoke -and $smoke.generated_at) {
    $smokeAge = ([DateTimeOffset]::UtcNow - [DateTimeOffset]::Parse([string]$smoke.generated_at)).TotalDays
    $runSmoke = $runSmoke -or $smokeAge -gt 30
}
if ($archiveExitCode -eq 0 -and $workerExitCode -eq 0 -and $runSmoke) {
    $smokeOutput = & $python `
        (Join-Path $ProjectRoot "services\storage-poc\scripts\telegram_live_smoke.py") `
        --output $smokePath `
        --size-mib 1
    $smokeExitCode = $LASTEXITCODE
    $smoke = if ($smokeOutput) { $smokeOutput | ConvertFrom-Json } else { $null }
} else {
    $smokeExitCode = if ($null -ne $smoke -and [string]$smoke.status -eq "pass") { 0 } else { 1 }
}
$exitCode = if ($archiveExitCode -eq 0 -and $workerExitCode -eq 0 -and $smokeExitCode -eq 0) { 0 } else { 1 }

$result = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = if ($exitCode -eq 0) { "pass" } else { "critical" }
    archive = $archive
    worker = if ($output) { $output | ConvertFrom-Json } else { $null }
    live_smoke = $smoke
}
$temporary = "$statusPath.tmp"
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding utf8
Move-Item -LiteralPath $temporary -Destination $statusPath -Force
exit $exitCode
