param()

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$testRoot = Join-Path $env:TEMP ("embe-health-gates-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory $testRoot | Out-Null

function Write-Fixture([string]$Path, [double]$DiskPercent, [double]$BackupAgeHours) {
    $now = [DateTimeOffset]::Parse("2026-08-30T12:00:00Z")
    $containers = @(
        "embe-babybuddy-1", "embe-memos-1", "embe-grocy-1", "embe-node-red-1", "embe-uptime-kuma-1",
        "compose-immich-server-1", "compose-immich-postgres-1", "compose-immich-redis-1", "compose-immich-machine-learning-1"
    ) | ForEach-Object { @{ name = $_; status = "Up 1 hour (healthy)" } }
    $fixture = [ordered]@{
        now_utc = $now.ToString("o")
        disk_free_percent = $DiskPercent
        containers = $containers
        portal_sync = @{ status = "ok"; last_success_at = $now.AddMinutes(-5).ToString("o") }
        babybuddy_sync = @{ healthy = $true; time = $now.AddMinutes(-2).ToString("o") }
        backup_created_utc = $now.AddHours(-$BackupAgeHours).ToString("o")
        restore = @{ status = "pass"; verified_at = $now.AddDays(-1).ToString("o") }
        integrity = @{ status = "pass"; checked_at = $now.AddDays(-1).ToString("o") }
        deadletters = 0
        smart_healthy = $true
        service_install_ready = $true
    }
    $fixture | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $Path -Encoding utf8
}

try {
    $healthyFixture = Join-Path $testRoot "healthy.json"
    $criticalFixture = Join-Path $testRoot "critical.json"
    Write-Fixture $healthyFixture 40 2
    Write-Fixture $criticalFixture 10 12

    $healthyReport = Join-Path $testRoot "healthy-report.json"
    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $healthyFixture -OutputPath $healthyReport
    if ($LASTEXITCODE -ne 0) { throw "Healthy fixture must pass" }
    if ((Get-Content $healthyReport -Raw | ConvertFrom-Json).status -ne "pass") { throw "Healthy report is invalid" }

    $criticalReport = Join-Path $testRoot "critical-report.json"
    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\health-audit.ps1") -ProjectRoot $projectRoot -FixturePath $criticalFixture -OutputPath $criticalReport
    if ($LASTEXITCODE -ne 2) { throw "Critical fixture must block" }
    $critical = Get-Content $criticalReport -Raw | ConvertFrom-Json
    if ($critical.status -ne "critical") { throw "Critical report is invalid" }
    if (@($critical.checks | Where-Object id -eq "disk_headroom")[0].status -ne "critical") { throw "Disk gate did not block" }
    if (@($critical.checks | Where-Object id -eq "backup_freshness")[0].status -ne "critical") { throw "Backup gate did not block" }

    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\update\preflight-update.ps1") -ProjectRoot $projectRoot -HealthFixture $healthyFixture -HealthOutputPath (Join-Path $testRoot "preflight-health-pass.json") -OutputPath (Join-Path $testRoot "preflight-pass.json") -SkipContractTests
    if ($LASTEXITCODE -ne 0) { throw "Healthy update preflight must pass" }

    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\update\preflight-update.ps1") -ProjectRoot $projectRoot -HealthFixture $criticalFixture -HealthOutputPath (Join-Path $testRoot "preflight-health-blocked.json") -OutputPath (Join-Path $testRoot "preflight-blocked.json") -SkipContractTests
    if ($LASTEXITCODE -ne 2) { throw "Critical update preflight must block" }

    $external = Join-Path $testRoot "external.json"
    $soak = Join-Path $testRoot "soak.json"
    @{ status = "pass"; device_is_separate = $true; restore_verified = $true } | ConvertTo-Json | Set-Content $external
    @{ status = "pass"; duration_days = 7 } | ConvertTo-Json | Set-Content $soak
    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -ExternalBackupEvidence $external -SoakEvidence $soak -OutputPath (Join-Path $testRoot "go-live-pass.json")
    if ($LASTEXITCODE -ne 0) { throw "Complete go-live evidence must pass" }

    $null = & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $projectRoot "scripts\health\go-live-gate.ps1") -ProjectRoot $projectRoot -HealthReport $healthyReport -OutputPath (Join-Path $testRoot "go-live-blocked.json")
    if ($LASTEXITCODE -ne 2) { throw "Missing physical and soak evidence must block" }

    Write-Output "PASS: health, update, and go-live gates fail closed"
} finally {
    if (Test-Path $testRoot) { Remove-Item $testRoot -Recurse -Force }
}
