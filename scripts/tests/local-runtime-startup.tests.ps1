param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$runner = Join-Path $projectRoot "scripts\start-local-runtime.ps1"
$installer = Join-Path $projectRoot "scripts\install-local-runtime-startup.ps1"
$source = Get-Content -LiteralPath $runner -Raw
$installerSource = Get-Content -LiteralPath $installer -Raw

foreach ($forbidden in @("Remove-Item", "factory reset", "wsl --unregister")) {
    if ($source -match [regex]::Escape($forbidden)) { throw "Runtime recovery contains forbidden destructive action: $forbidden" }
}
foreach ($required in @("Move-StaleRuntimeDirectory", "-WindowStyle Hidden", "qwen3:8b")) {
    if (-not $source.Contains($required)) { throw "Runtime recovery is missing safety behavior: $required" }
}
foreach ($required in @("-AtLogOn", 'Delay = "PT30S"', "-LogonType Interactive", "-RunLevel Limited")) {
    if (-not $installerSource.Contains($required)) { throw "Runtime startup task is missing: $required" }
}

$testRoot = Join-Path $env:TEMP ("embe-runtime-startup-" + [guid]::NewGuid().ToString("N"))
$dockerBase = Join-Path $testRoot "Docker"
$dockerRun = Join-Path $dockerBase "run"
$secrets = Join-Path $testRoot "docker-secrets-engine"
$status = Join-Path $testRoot "status.json"
New-Item -ItemType Directory -Path $dockerRun, $secrets -Force | Out-Null
Set-Content -LiteralPath (Join-Path $dockerRun "sailor-ingest.sock") -Value "fixture"
Set-Content -LiteralPath (Join-Path $secrets "engine.sock") -Value "fixture"

try {
    & powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner `
        -ProjectRoot $projectRoot `
        -DockerBasePath $dockerBase `
        -SecretsEnginePath $secrets `
        -StatusPath $status `
        -SkipStart
    if ($LASTEXITCODE -ne 0) { throw "Fixture recovery failed" }
    if (Test-Path -LiteralPath $dockerRun) { throw "Stale Docker run directory was not quarantined" }
    if (Test-Path -LiteralPath $secrets) { throw "Stale secrets directory was not quarantined" }
    if (@(Get-ChildItem -LiteralPath $dockerBase -Directory -Filter "run-stale-embe-*").Count -ne 1) { throw "Docker run quarantine is missing" }
    if (@(Get-ChildItem -LiteralPath $testRoot -Directory -Filter "docker-secrets-engine-stale-embe-*").Count -ne 1) { throw "Secrets quarantine is missing" }
    $report = Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
    if ($report.status -ne "prepared" -or $report.runtime_directories_quarantined -ne 2) { throw "Sanitized runtime status is invalid" }
    $serialized = Get-Content -LiteralPath $status -Raw
    if ($serialized -match [regex]::Escape($testRoot)) { throw "Runtime status exposed a local path" }
    Write-Output "PASS: local runtime startup is recoverable and non-destructive"
} finally {
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
