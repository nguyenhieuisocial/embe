param([string]$ProjectRoot = "C:\EmBe")

$ErrorActionPreference = "Stop"
foreach ($envFile in @(
    (Join-Path $ProjectRoot "infra\compose\storage-poc.env"),
    (Join-Path $ProjectRoot "secrets\telegram-poc.env")
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
$env:PYTHONPATH = Join-Path $ProjectRoot "services\storage-poc\src"

$statusPath = Join-Path $ProjectRoot "data\status\telegram-secondary.json"
$output = & (Join-Path $ProjectRoot ".venv\Scripts\python.exe") `
    (Join-Path $ProjectRoot "services\storage-poc\scripts\run_worker_once.py")
$exitCode = $LASTEXITCODE

$result = [ordered]@{
    schema_version = 1
    generated_at = [DateTimeOffset]::UtcNow.ToString("o")
    status = if ($exitCode -eq 0) { "pass" } else { "critical" }
    worker = if ($output) { $output | ConvertFrom-Json } else { $null }
}
$temporary = "$statusPath.tmp"
$result | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $temporary -Encoding utf8
Move-Item -LiteralPath $temporary -Destination $statusPath -Force
exit $exitCode
