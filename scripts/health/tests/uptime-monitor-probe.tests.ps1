param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$runner = Join-Path $projectRoot "scripts\health\check-uptime-monitors.ps1"
$installer = Join-Path $projectRoot "scripts\health\install-uptime-monitor-probe.ps1"
$testRoot = Join-Path $env:TEMP ("embe-uptime-probe-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
    $healthyFixture = Join-Path $testRoot "healthy.json"
    @{ active = 7; healthy = 7; stale = 0 } | ConvertTo-Json | Set-Content -LiteralPath $healthyFixture -Encoding utf8
    $healthyReport = Join-Path $testRoot "healthy-report.json"
    $null = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $healthyReport
    if ($LASTEXITCODE -ne 0) { throw "Seven healthy monitors must pass" }
    $report = Get-Content -LiteralPath $healthyReport -Raw | ConvertFrom-Json
    if ($report.status -ne "pass" -or $report.active -ne 7 -or $report.healthy -ne 7 -or $report.stale -ne 0) {
        throw "Healthy Uptime probe report is invalid"
    }
    $serialized = Get-Content -LiteralPath $healthyReport -Raw
    foreach ($sensitiveKey in @("url", "name", "token", "response_body")) {
        if ($serialized -match ('"' + $sensitiveKey + '"\s*:')) { throw "Uptime probe exposes forbidden field: $sensitiveKey" }
    }

    $criticalFixture = Join-Path $testRoot "critical.json"
    @{ active = 7; healthy = 6; stale = 1 } | ConvertTo-Json | Set-Content -LiteralPath $criticalFixture -Encoding utf8
    $null = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ProjectRoot $projectRoot -FixturePath $criticalFixture -OutputPath (Join-Path $testRoot "critical-report.json")
    if ($LASTEXITCODE -ne 2) { throw "A stale Uptime monitor must fail closed" }

    $installerSource = Get-Content -LiteralPath $installer -Raw
    foreach ($required in @("EmBe Uptime Monitor Health", "LogonType Interactive", "RunLevel Limited", "New-TimeSpan -Minutes 2")) {
        if (-not $installerSource.Contains($required)) { throw "Uptime probe scheduler contract is missing: $required" }
    }
    Write-Output "PASS: Uptime monitor probe is privacy-safe and fails closed"
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
