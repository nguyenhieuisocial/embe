$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$job = Join-Path $projectRoot "services\reporting\run-monthly.ps1"
$fixture = Join-Path $projectRoot "services\reporting\fixtures\2026-08.sample.json"
$testRoot = Join-Path $projectRoot ("tmp\pdfs\monthly-job-" + [guid]::NewGuid().ToString("N"))
$status = Join-Path $testRoot "status.json"
$savedPath = $null

try {
    $savedPath = $env:PATH
    $env:PATH = "$env:SystemRoot\System32;$env:SystemRoot"
    $windowsPowerShell = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    & $windowsPowerShell -NoProfile -ExecutionPolicy Bypass -File $job -Month "2026-08" -DataPath $fixture -OutputRoot $testRoot -StatusPath $status
    $env:PATH = $savedPath
    if ($LASTEXITCODE -ne 0) { throw "Monthly job failed" }

    $pdf = Join-Path $testRoot "embe-monthly-2026-08.pdf"
    $manifest = Join-Path $testRoot "embe-monthly-2026-08.manifest.json"
    $qa = Join-Path $testRoot "embe-monthly-2026-08.qa.json"
    foreach ($path in @($pdf, $manifest, $qa, $status)) {
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Monthly job output is missing: $path" }
    }
    $result = Get-Content -LiteralPath $status -Raw | ConvertFrom-Json
    if ($result.status -ne "ok" -or $result.book_status -ne "DRAFT" -or $result.month -ne "2026-08") {
        throw "Monthly job status is invalid"
    }
    if ($result.source_mode -ne "provided_snapshot" -or $null -ne $result.source_event_count) {
        throw "A layout fixture must never be reported as curated production content"
    }
    Write-Output "monthly job tests passed"
} finally {
    if ($null -ne $savedPath) { $env:PATH = $savedPath }
    if (Test-Path -LiteralPath $testRoot) { Remove-Item -LiteralPath $testRoot -Recurse -Force }
}
