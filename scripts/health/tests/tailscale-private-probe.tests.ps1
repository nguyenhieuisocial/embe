param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $PSScriptRoot))
$runner = Join-Path $projectRoot "scripts\health\check-tailscale-private.ps1"
$installer = Join-Path $projectRoot "scripts\health\install-tailscale-private-probe.ps1"
$testRoot = Join-Path $env:TEMP ("embe-tailscale-probe-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $testRoot | Out-Null

try {
    $healthyFixture = Join-Path $testRoot "healthy.json"
    @{ immich_status_code = 200; memos_status_code = 200; babybuddy_status_code = 200; grocy_status_code = 200 } |
        ConvertTo-Json | Set-Content -LiteralPath $healthyFixture -Encoding utf8
    $healthyReport = Join-Path $testRoot "healthy-report.json"
    $null = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $healthyReport
    if ($LASTEXITCODE -ne 0) { throw "Healthy private routes must pass" }
    $report = Get-Content -LiteralPath $healthyReport -Raw | ConvertFrom-Json
    if ($report.status -ne "pass") { throw "Healthy probe report is invalid" }
    if ($report.grocy_status_code -ne 200) { throw "Healthy Grocy private route is missing" }
    $serialized = Get-Content -LiteralPath $healthyReport -Raw
    foreach ($forbidden in @("https://", ".ts.net")) {
        if ($serialized.Contains($forbidden)) { throw "Probe report exposes forbidden data: $forbidden" }
    }
    foreach ($sensitiveKey in @("token", "response_body")) {
        if ($serialized -match ('"' + $sensitiveKey + '"\s*:')) { throw "Probe report exposes forbidden field: $sensitiveKey" }
    }

    $criticalFixture = Join-Path $testRoot "critical.json"
    @{ immich_status_code = 0; memos_status_code = 200; babybuddy_status_code = 200; grocy_status_code = 200 } |
        ConvertTo-Json | Set-Content -LiteralPath $criticalFixture -Encoding utf8
    $null = & powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $runner -ProjectRoot $projectRoot -FixturePath $criticalFixture -OutputPath (Join-Path $testRoot "critical-report.json")
    if ($LASTEXITCODE -ne 2) { throw "A failed private route must fail closed" }

    $installerSource = Get-Content -LiteralPath $installer -Raw
    foreach ($required in @("EmBe Tailscale Private Health", "LogonType Interactive", "RunLevel Limited", "New-TimeSpan -Minutes 5")) {
        if (-not $installerSource.Contains($required)) { throw "Probe scheduler contract is missing: $required" }
    }
    Write-Output "PASS: Tailscale private probe is privacy-safe and fails closed"
} finally {
    Remove-Item -LiteralPath $testRoot -Recurse -Force -ErrorAction SilentlyContinue
}
